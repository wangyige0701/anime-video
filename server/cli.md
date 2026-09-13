# Server CLI

`server/cli.ts` 提供基于 commander 的服务控制命令。命令入口不会改变现有的
`server/app.ts`，现有 `pnpm server dev` 和 `pnpm server dev:web` 脚本仍按原方式工作。

## 命令格式

```text
app <start|stop|restart> [server|web] [配置覆盖选项]
```

省略服务名称时会同时操作 `server` 和 `web`；指定服务名称时只操作对应模块。

```text
app start
app stop web
app restart server
```

服务名称只能是 `server` 或 `web`。未知服务、未知选项以及缺少选项值时，commander
会显示错误并以失败状态退出。`-h/--help`、`-v/--version` 可用于查看帮助和版本。

## 配置覆盖

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
app restart server --server-port 4000
app start web --web-port=3001 --logging-file-enabled=false
app start --hls-global-segment-concurrency 4
```

帮助输出会列出全部配置选项、字段路径和当前默认值，并附带上述命令示例。
