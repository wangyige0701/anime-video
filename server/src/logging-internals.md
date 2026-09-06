# 内部日志实现

`middlewares/logger.ts` 创建共享 Pino logger，`src/log-destination.ts` 管理主线程有界队列，
`src/log-transport.ts` 在一个 Pino worker 中同时处理控制台和文件输出。

## 运行链路

```text
logger.child(...)
    -> LogDestination：按字节限制待写和在途数据
    -> pino.transport({ target: log-transport.js })
    -> Writable._write / _writev：UTF-8 解码、NDJSON 拆行、分类合批
    -> 控制台写入回调
    -> component/source writer：缓冲、文件写入回调、日期切换及轮转
```

开发环境使用 `pino-pretty.prettyFactory()` 格式化已经解析的记录；生产环境向 stdout 输出原始
NDJSON。两种模式都只解析一次记录，不再经过 Pino 多 target 的逐行分发。控制台写入也等待回调，
慢 stdout 不会形成另一个不受控制的输出队列。

`pnpm build:log-transport` 将源码和关闭消息常量编译到 `server/dist/`。文件输出关闭时也需要
编译 transport；此时保留控制台输出，不创建日志目录，也不执行清理。生产环境不会加载
仅供开发使用的 `pino-pretty`。

## 队列与背压

`logging.maxQueueBytes` 默认 4 MiB，限制主线程待写记录与在途批次的 UTF-8 字节总数。
相同事件循环中的记录先合并，一个批次经 `ThreadStream.flush(callback)` 确认 worker 接收后，
才归还额度并发送后续批次。worker 的普通 Writable 背压因此可以传回这个有界入口。

Pino 的日志方法是同步接口，不能等待磁盘。达到队列上限时丢弃新记录，已经接收的记录保持顺序；
单条记录超过上限也会被拒绝。开始丢弃及队列恢复/关闭时向 stderr 报告，包含丢弃数量，
告警不重新进入 Pino，避免递归。调整上限可使用 `LOGGING_MAX_QUEUE_BYTES` 或
`--LOGGING_MAX_QUEUE_BYTES`。

这个配置是日志数据队列的上限，不是进程 RSS 上限。序列化原始对象、字符串副本、ThreadStream
共享缓冲、worker 的当前输入和各来源文件缓冲仍会占用额外内存。writer 数量由固定分类白名单限制。

## 分类与文件

目录格式保持为：

```text
<logDir>/<component>/<YYYY-MM-DD>/<source>.<index>.ndjson
```

component 使用配置白名单，未知值回退到 `app`。source 使用受控标识，兼容 `hls-native` 和
`hls-manager`；HTTP 日志优先采用显式 source，再按精确 event 映射或业务前缀分类。
记录 ID、URL 和用户输入不能直接作为文件名。文件内容保留原始 NDJSON。

非法 JSON、null 和非对象记录归入 `app/transport`；无效时间戳和超出四位年份范围的日期使用
当前日期。`StringDecoder` 保证 Buffer 在多字节字符中间分块时不会损坏 UTF-8；关闭时补齐末行换行。

每个 component/source 维护一个 writer。Writable 自身保证输入串行，`_writev()` 聚合排队块；
writer 的 Promise 队列则协调追加、定时提交和过期目录释放，二者职责不同。

达到 `bufferBytes` 时立即提交文件缓冲，低流量由 `flushIntervalMs` 定时器提交。该间隔不包含
队列等待和磁盘耗时，不是日志可见性的硬性截止时间。文件字节计数仅在写入回调成功后增加。

重启时扫描最高有效序号，只查询一次其文件大小，继续追加未满文件。达到 `fileMaxBytes` 时轮转；
批次本身超过文件阈值时逐行处理，单条超大记录保持完整，允许该文件超过轮转阈值。
日期变化先排空并关闭旧流，再切换目录。多进程部署应按进程隔离日志根目录，不能让多个 writer
共同维护同一个文件的大小和序号。

## 生命周期与故障

文件流常驻监听 error，覆盖 open、低流量写入和 close。定时提交失败和追加失败进入同一个错误
出口，销毁 transport；`_destroy()` 中止正在执行的文件 I/O，并等待所有 writer 释放文件描述符。
单个 writer 关闭失败不妨碍其他 writer 清理，已失败的队列不会继续后台重试。

主线程记录 worker 错误并停止向失效 transport 发送数据；之后 `closeLogger()` 返回失败。
API/Web 关闭失败时通过 stderr 报告并以非零状态退出。应用不会自动重启日志 worker，运行期错误
需要运维处理，避免用无限重试掩盖磁盘或权限故障。

关闭流程如下：

1. API/Web 停止接受新连接，按现有 10 秒上限关闭长连接。
2. `closeLogger()` 停止接收新日志，等待主线程队列和在途批次被 worker 接收。
3. 主线程通过 `log-protocol.ts` 定义的消息请求 worker 调用普通 Writable 的 `end()`。
4. worker 的 `_final()` 排空末行和所有文件缓冲，等待清理任务和文件关闭；主线程等待 transport 的 close/error。
5. 日志关闭超过 5 秒时拒绝关闭 Promise 并终止 worker，允许入口按失败状态退出。

`closeLogger()` 幂等。这里不调用会同步等待的 `ThreadStream.end()`；Pino 的默认同步退出处理
也已关闭，正常自然退出通过 `beforeExit` 执行同一条异步关闭路径。强制终止、进程崩溃和超时终止
仍可能丢失尚未写完的数据。

本文中的提交/flush 指文件写入调用完成，数据可能仍处于操作系统缓存中，没有执行 `fsync`，
不承诺断电持久化。普通运行日志不为每条记录增加同步磁盘屏障。

## 保留期清理

启动时在后台清理，随后按本地日历每天午夜执行一次；同一 transport 不并行运行多个清理任务。
`retentionDays: 0` 禁用清理。其他值删除早于“当天零点减去 N 天”的有效日期目录，边界当天保留。

清理先通过 writer 队列排空并释放过期的闲置来源。目录引用计数保护仍在使用的目录，删除任务
登记在单独的 Map 中；晚到的历史记录等待同目录删除结束后再重建目录，避免写入已被删除的文件。
这些协调只作用于当前进程。清理失败向 stderr 报告，不阻断正常日期的新日志写入，下次日任务重试。
关闭时取消后续定时任务，并等待已经开始的清理任务。

## 验证

```powershell
pnpm build:log-transport
pnpm exec vitest run server/test/log-transport.test.ts server/test/log-destination.test.ts
pnpm exec tsc --noEmit -p server/tsconfig.json
```

transport 测试使用真实临时目录，覆盖分块和 UTF-8、分类、轮转、重启续写、末行及定时提交、无效日期、
慢文件写入、异步写入错误、清理竞争和每日过期处理。故障测试仅替换具体 I/O 操作。

入口测试覆盖有界队列、过载告警、错误传播、超时和幂等关闭；集成测试自动编译当前 worker 源码，
验证实际 Pino 双写、不能完成关闭的 worker，以及真实 logger 的生产/开发、自然退出和禁用文件场景。
