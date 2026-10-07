# Server CLI

`server/cli.ts` 提供基于 commander 的服务命令入口。`pnpm server cli` 无参数调用时
向 stdout 显示帮助并正常退出（退出码 0），不会加载服务模块。
`pnpm server dev` 和 `pnpm server dev:web` 脚本通过 `server/app.ts` 启动服务。
Windows 下的 `server/cli-launcher.mjs` 会还原 `pnpm run` 对参数反斜杠产生的一层转义；根 `back.cmd` 的 `cli` 分支直接调用该入口，避免参数再次经过 workspace 的 `pnpm run`。启动器通过 Node 的 `--import tsx` 在同一进程加载 TypeScript，并预加载 `cli-userinfo-fallback.cjs`：仅当 Windows 的 `uv_os_get_passwd` 因 `ENOMEM` 失败时，才从当前用户环境变量补全 `os.userInfo()`，避免 tsx 在创建临时目录前退出；manager 和 worker 会继承这两项加载参数。发布产物位于根 `dist/server/`，从仓库根目录使用 `node dist/server/cli.js`，不经过开发启动器。

CLI 已使用独立的常驻管理进程控制 server/web worker。管理器首次由 `start` 按需启动，
后续 CLI 调用通过本地 IPC 复用同一个管理器及其子进程句柄；不会因为每次执行 CLI
而重复启动服务。现阶段使用 Node/tsx 源码入口，尚不包含打包适配。

`server/app.ts`、`pnpm server dev`、`pnpm server dev:web` 和直接导入服务模块的方式保持
原有语义，只有 CLI 命令经过管理器。完整边界和后续打包规划见
打包、自动恢复和持久化状态等后续能力暂未实现。

## 命令格式

```text
anime-video <start|stop|restart|status> [server|web] [配置覆盖选项]
anime-video config [--json]
```

省略服务名称时会同时操作 `server` 和 `web`；指定服务名称时只操作对应模块。

```text
anime-video start
anime-video stop web
anime-video restart server
anime-video status
anime-video status server --json
anime-video config --json
anime-video dir list --json
```

服务名称只能是 `server` 或 `web`。未知服务、未知选项以及缺少选项值时，commander
会显示错误并以失败状态退出。`-h/--help`、`-v/--version` 可用于查看帮助和版本。

## 目录管理

```text
anime-video dir
anime-video dir list [--json]
anime-video dir set "C:\videos" "D:\media"
anime-video dir add "E:\anime" "F:\videos"
anime-video dir del 0,2 4
```

`dir` 不带子命令时显示目录管理帮助。`list` 默认输出带索引的目录表，`list --json` 输出可直接读取的目录数组 JSON。`set` 用一个或多个已存在的目录替换当前配置；`add` 保留现有配置并把一个或多个已存在且未配置的目录追加到末尾；`del` 按索引删除目录，索引可由空格或逗号分隔。Windows cmd 和 PowerShell 中的普通目录使用单个反斜杠；`"D:\\media"` 属于 JavaScript/JSON 转义形式，CLI 会将其作为格式错误拒绝。UNC 路径开头的双反斜杠除外。

## 配置覆盖

`config` 输出当前已经合并命令行、环境变量和 `config.yaml` 默认值的生效配置。默认格式为
逐行的 `section.key=value`，`config --json` 输出完整 JSON 对象，供桌面端等调用方读取
Web 访问地址或其他运行参数；该命令只读取配置，不会启动服务管理器。

`config.yaml` 中每个一级区段的字段都会自动生成对应的长选项，字段名转换为 kebab-case：

```text
server.port              -> --server-port
logging.fileEnabled       -> --logging-file-enabled
hls.segmentMinDuration   -> --hls-segment-min-duration
```

支持 `--option=value` 和 `--option value` 两种写法，选项可以放在命令前或服务名称后。
值的解析由共享配置解析器完成：数字、布尔值、数组（YAML/JSON 数组或逗号分隔）以及对象
均按照 `config.yaml` 中对应默认值的类型处理。配置优先级为命令行、环境变量、YAML 默认值。

示例：

```text
anime-video restart server --server-port 4000
anime-video start web --web-port=3001 --logging-file-enabled=false
anime-video start --hls-global-segment-concurrency 4
```

帮助输出会列出全部配置选项、字段路径和当前默认值，并附带上述命令示例。

## 进程管理实现记录

- 管理逻辑位于 `server/cli/manager/`；`client.ts` 连接本地端点，`daemon.ts` 长期持有
  server/web 两个 worker 的句柄，`protocol.ts` 使用版本化 JSON 行协议。
- Windows 使用命名管道，Linux 使用 Unix socket。`start` 在管理器不可达时按需创建
  后台管理进程；`status` 不会因为查询而创建管理器，管理器尚未启动或已经退出时返回
  目标服务的 `stopped` 状态。
- Linux socket 创建后限制为当前用户可读写（0600）；Windows 依赖本地命名管道，未开放
  TCP 管理端口。
- worker 由 `cli/worker.ts` 统一分发，启动时只动态导入目标服务模块并等待 `ready`；
  `stop` 通过 IPC 请求服务实例关闭，等待退出后才返回；正常 `start`/`stop` 不按 PID
  或端口杀进程。worker 同时监听 IPC `disconnect`，manager 意外退出时会执行同一套幂等
  关闭流程，避免留下无人管理的服务。HTTP 关闭会主动释放 keep-alive 连接，避免静态
  Web 服务因浏览器长连接阻塞 worker 退出；客户端请求超时设置为 30 秒，确保 manager
  能返回 worker 超时等结构化错误。
- `start` 对已处于 `starting`/`running` 的服务幂等；`restart` 仅重启目标服务；
  `status` 默认输出终端表格，`status --json` 输出脚本可使用的状态对象。
- `status` 查询不进入变更操作队列，可以在服务启动或停止过渡期间立即返回当前状态。
- `start` 检测运行中的配置参数；同一服务已使用不同参数运行时返回错误并提示使用
  `restart`，避免 CLI 参数看似成功但实际仍沿用旧端口或旧配置。全量 `start` 部分失败时，
  会回收本次已启动的 worker。
- 状态包含 managerId、service instanceId、PID、启动时间、运行时长、重启次数和最近退出信息；
  manager 状态当前保存在内存中，manager 重启后会重新探测并建立 worker，不读取陈旧记录。
- 当前实现记录内存中的 manager 状态，尚未实现自动崩溃退避、持久化状态恢复、SEA
  打包和系统服务托管；这些能力在后续迭代中增加，不能将陈旧状态当作运行事实。
- 停止命令完成并发送响应后，若所有服务均已停止，manager 会立即退出并释放其工作目录；
  仅由探活或 `status` 创建的空闲 manager 才会保留约 30 秒后自动退出，避免构建或卸载时长期占用发布目录。
