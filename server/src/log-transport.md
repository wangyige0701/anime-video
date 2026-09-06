# Pino 日志落盘 Transport

`log-transport.ts` 是 Pino 自定义 transport。它运行在 `pino.transport()` 创建的 worker
线程中，把主线程传来的 NDJSON 日志写入按组件、日期组织的文件，同时负责批量刷盘、
文件轮转和过期目录清理。主线程只负责构造 logger 和发送日志，不直接执行日志文件 I/O。

## 运行链路

```text
logger.child(...)
    -> pino.transport(target = log-transport.js)
    -> LogTransport._write(chunk)
    -> 按换行拆分 NDJSON
    -> component/source 路由
    -> LogFileWriter.appendBatch(date, data, bytes)
    -> 内存缓冲 -> fs.WriteStream -> .ndjson
```

TypeScript 源码通过根脚本 `pnpm build:log-transport` 编译为
`server/dist/log-transport.js`。`middlewares/logger.ts` 优先加载该构建产物，并在启用文件
日志但找不到产物时快速失败，避免服务启动后静默丢失文件日志。

本项目的 `server/package.json` 已声明 `type: module`，并且 transport 使用 NodeNext 编译，
因此普通 `.ts` 文件会按 ESM 输出为 `.js`。这里不需要 `.mts`；`.mts` 只适用于需要在同一
工程中强制输出 `.mjs`、或项目默认不是 ESM 的情况。

## `LogTransport` 的职责

### 参数和启动

构造函数把目录、单文件大小、保留天数、缓冲大小、刷盘间隔和路由配置规范化；目录本身由
logger 在主线程中解析为绝对路径。
构造时异步启动一次 `cleanupOldLogs()`，并把 Promise 放入 `ready` 链，保证首次写入在清理
任务完成后开始。

### 分块和顺序

Pino 传给 Writable 的 chunk 不保证恰好对应一条记录，因此 `pending` 保存最后一个没有换行
符的片段，下一块到达时继续拼接。每个 chunk 都追加到 `ready` Promise 链，确保分块处理、尾部
缓存和 writer 创建严格按到达顺序执行。

关闭 transport 时，`_final()` 会为剩余片段补换行，等待所有 `LogFileWriter.close()` 完成，
从而把 worker 中的批量缓冲和文件流一起排空。

### 分类路由

`component` 只接受 `app`、`http`、`web`、`hls` 四个固定值；未知值归入 `app`。`source` 只
接受白名单值，并兼容 `hls-native`、`hls-manager` 这种调用方标记。HTTP 日志在没有显式
`source` 时按 `event` 推断为 `access`、`error` 或 `business`，其余记录归入 `default`。
分类结果只影响文件路径和文件名，文件内容仍保留原始 NDJSON，便于后续检索和重放。

## `LogFileWriter` 的写入策略

每个 `component/source` 组合对应一个 writer，并通过 `operation` Promise 串行化写入。transport
会先把同一 chunk 中连续的相同分类记录合并为一个 batch，再提交给 writer。这样
日期切换、轮转和关闭不会与同一来源的追加操作交叉；不同来源仍可在 transport 中独立维护
缓冲区。

目录和流采用延迟创建，只有收到该分类的第一条日志时才建立：

```text
<logDir>/<component>/<YYYY-MM-DD>/
    <source>.<index>.ndjson
```

索引从 `0001` 开始。首次打开某个日期目录时扫描来源的已有文件，重启后继续使用最高序号的
未满文件；文件已达到 `maxBytes` 时从下一个序号继续。因此服务重启不会仅因进程号变化而创建
新文件，只有达到大小上限才会轮转。

不再使用 PID 作为文件名隔离标识后，同一个 `logDir` 应由一个服务进程写入；多进程部署应为
每个进程配置独立的日志根目录，避免多个 writer 同时追加同一文件。

写入先累积到 `pending` 字符串：达到 `bufferBytes` 立即刷盘，否则由
`flushIntervalMs` 定时器兜底。刷盘使用 `WriteStream.write()`，返回 `false` 时等待 `drain`
事件处理背压，并按 UTF-8 字节数维护轮转阈值。轮转只发生在批次刷盘后，因此不会因为异步
写入顺序产生覆盖。

日期变化会先刷盘并关闭旧流，再切换日期并重新建立目录；关闭 writer 时会取消定时器、等待
队列、刷完尾部缓冲并关闭流。

## 过期清理

`cleanupOldLogs()` 只遍历日志根目录下的组件目录和形如 `YYYY-MM-DD` 的子目录，删除早于
`retentionDays` 截止日期的目录。清理在 transport worker 中执行，失败被忽略，不阻断新日志
写入；当前日期目录不会被删除。

## 当前方案评估

当前实现已经覆盖落盘功能的主要可靠性要求，暂时没有必须立即修改的结构性问题：

- worker 隔离文件 I/O，API 请求线程不会等待磁盘操作；
- 每个来源串行化，轮转和日期切换顺序明确；服务重启会续写同一日期下未满的文件；
- 缓冲阈值、时间兜底和 stream 背压同时存在，兼顾吞吐与内存上限；
- 重启续写、优雅关闭和保留期清理均有明确路径；
- 文件名中的可变字段经过白名单或 `safeToken()` 处理，不能由日志内容构造路径。

## 可选优化和简化

以下项目可以按运行规模选择，不改变现有文件格式：

1. **配置入口已收敛（已完成）**：logger 现在只读取 `logging.*`，环境变量和命令行参数统一
   使用 `LOGGING_*` 命名，避免维护两套配置别名。已有部署若使用旧 `LOG_*` 变量，需要在升级
   前改为对应的 `LOGGING_*` 变量。
2. **降低字符串复制（中风险）**：当前 transport 和 writer 都使用字符串拼接与
   `split('\\n')`。日志量很大时可改用 `StringDecoder` 或 Buffer 队列，减少长 chunk 的复制；
   普通 API 日志量下收益有限，不建议为此增加复杂度。
3. **限制 writer 数量（中风险）**：现在 writer 按出现过的分类常驻到 transport 关闭。组件和
   source 都是固定白名单，数量有上限，因此无需额外淘汰；若将来改成动态分类，应增加 LRU
   或空闲关闭策略。
4. **补充可观测性（中收益）**：清理失败、写入失败和轮转次数目前只通过 transport 错误
   传播，未单独计数。可增加内部计数器或一次性的 stderr 告警，但必须避免告警再次进入同一
   transport 形成递归。
5. **测试隔离（高收益）**：为 `LogTransport` 增加临时目录测试，覆盖分块拼接、分类回退、
   日期切换、超过阈值轮转、重启续写、背压以及关闭补写。该模块依赖 Node 文件系统，测试应
   使用真实临时目录而不是 mock stream。
6. **复用关闭流程（低风险）**：`app.ts` 和 `web.ts` 当前各自实现信号监听、停止接收连接、
   `closeAllConnections()` 和 `closeLogger()` 超时等待。若两个入口继续保持相同的 10 秒/5 秒
   策略，可抽出服务端共享 helper；若未来需要不同的连接排空策略，则保留重复代码反而更直观。

目前已补齐 transport 的核心行为测试；配置收敛已经完成。Buffer 化、可观测性增强和关闭流程
抽取仍属于有明确运行数据或生命周期差异后再进行的优化，不宜提前引入额外抽象。
