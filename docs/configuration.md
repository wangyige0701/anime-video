# 配置覆盖说明

应用默认配置位于根目录 `config.yaml`，包含 `application`、`runtime`、`server`、`logging`、`web` 和 `hls` 六个一级类目。

## 覆盖优先级

同一个配置项同时存在多种来源时，优先级如下：

1. 启动参数
2. 环境变量
3. `config.yaml` 中的默认值

环境变量使用二级字段、下划线和配置字段组成；启动参数使用一级字段和字段名组成的 `--a-b-c` 格式，字符统一归一为小写，并兼容大写字符。字段名中的驼峰字母会转换为连字符。环境变量依然使用大写下划线格式，例如：

```text
server.dataFileSaveDelay -> SERVER_DATA_FILE_SAVE_DELAY
hls.segmentMinDuration   -> HLS_SEGMENT_MIN_DURATION
```

## Application

| 配置项 | 环境变量 | 启动参数 | 默认值 |
| --- | --- | --- | --- |
| `application.executableName` | `APPLICATION_EXECUTABLE_NAME` | `--application-executable-name` | `anime-video` |

`application.executableName` 只用于发布构建脚本生成最终桌面程序文件名，脚本会自动追加 `.exe` 扩展名。

## Runtime

| 配置项 | 环境变量 | 启动参数 | 默认值 |
| --- | --- | --- | --- |
| `runtime.nodeVersion` | `RUNTIME_NODE_VERSION` | `--runtime-node-version` | `20.19.5` |
| `runtime.nodeMirror` | `RUNTIME_NODE_MIRROR` | `--runtime-node-mirror` | `https://npmmirror.com/mirrors/node/` |
| `runtime.nodeSha256` | `RUNTIME_NODE_SHA256` | `--runtime-node-sha256` | 空值，从镜像 `SHASUMS256.txt` 读取 |

运行时安装脚本只支持 Windows 构建，会根据版本和当前架构下载 Node.js ZIP，校验 SHA256 后将 `node.exe` 和许可证复制到 `dist/runtime/`。压缩包缓存在根目录 `.cache/node-runtime/`，不会提交到 Git。可通过 `pnpm run install:runtime` 单独执行。

启动参数支持等号和空格两种写法：

```text
--server-port=4000
--server-port 4000
```

数字配置按数字解析，布尔配置接受 `true` 或 `false`（不合法时保留默认值），数组配置可使用 YAML/JSON 数组或逗号分隔字符串。

## Server

| 配置项                          | 环境变量                          | 启动参数                            | 默认值                                                          |
| ------------------------------- | --------------------------------- | ----------------------------------- | --------------------------------------------------------------- |
| `server.protocol`               | `SERVER_PROTOCOL`                 | `--server-protocol`                 | `http`                                                          |
| `server.host`                   | `SERVER_HOST`                     | `--server-host`                     | `localhost`                                                     |
| `server.port`                   | `SERVER_PORT`                     | `--server-port`                     | `3000`                                                          |
| `server.videoConfigPrefix`      | `SERVER_VIDEO_CONFIG_PREFIX`      | `--server-video-config-prefix`      | 空字符串                                                        |
| `server.dataFile`               | `SERVER_DATA_FILE`                | `--server-data-file`                | `.video.json`                                                   |
| `server.allowedImageExtensions` | `SERVER_ALLOWED_IMAGE_EXTENSIONS` | `--server-allowed-image-extensions` | `.jpg`、`.jpeg`、`.png`、`.webp`、`.gif`                        |
| `server.allowedVideoExtensions` | `SERVER_ALLOWED_VIDEO_EXTENSIONS` | `--server-allowed-video-extensions` | `.mp4`、`.mkv`、`.avi`、`.flv`、`.m4v`、`.mov`、`.webm`、`.wmv` |
| `server.dataFileSaveDelay`      | `SERVER_DATA_FILE_SAVE_DELAY`     | `--server-data-file-save-delay`     | `500`                                                           |

通过桌面 EXE 启动服务时，全局视频目录配置文件保存在用户数据目录中；Windows 默认目录为 `%LOCALAPPDATA%\Anime Video`，可通过 `ANIME_VIDEO_DATA_DIR` 覆盖。直接运行 server 项目时仍保存到 `getServerRoot()` 返回的服务目录。每个视频根目录下的 `.video.json` 仍用于保存该目录的媒体元数据。

## Web

| 配置项             | 环境变量             | 启动参数               | 默认值      |
| ------------------ | -------------------- | ---------------------- | ----------- |
| `web.protocol`     | `WEB_PROTOCOL`       | `--web-protocol`       | `http`      |
| `web.host`         | `WEB_HOST`           | `--web-host`           | `localhost` |
| `web.port`         | `WEB_PORT`           | `--web-port`           | `3001`      |
| `web.devWebPort`   | `WEB_DEV_WEB_PORT`   | `--web-dev-web-port`   | `5173`      |
| `web.webBundleDir` | `WEB_WEB_BUNDLE_DIR` | `--web-web-bundle-dir` | `www`       |

## Logging

| 配置项                         | 环境变量                         | 启动参数                           | 默认值                      |
| ------------------------------ | -------------------------------- | ---------------------------------- | --------------------------- |
| `logging.directory`            | `LOGGING_DIRECTORY`              | `--logging-directory`              | `logs`                      |
| `logging.fileEnabled`          | `LOGGING_FILE_ENABLED`           | `--logging-file-enabled`           | `true`                      |
| `logging.components`           | `LOGGING_COMPONENTS`             | `--logging-components`             | `app,http,web,hls`          |
| `logging.sources`              | `LOGGING_SOURCES`                | `--logging-sources`                | `access,business,error,...` |
| `logging.httpEventSource`      | `LOGGING_HTTP_EVENT_SOURCE`      | `--logging-http-event-source`      | 事件映射                    |
| `logging.httpBusinessPrefixes` | `LOGGING_HTTP_BUSINESS_PREFIXES` | `--logging-http-business-prefixes` | `series.,season.,...`       |
| `logging.fileMaxBytes`         | `LOGGING_FILE_MAX_BYTES`         | `--logging-file-max-bytes`         | `52428800`                  |
| `logging.retentionDays`        | `LOGGING_RETENTION_DAYS`         | `--logging-retention-days`         | `30`                        |
| `logging.maxQueueBytes`        | `LOGGING_MAX_QUEUE_BYTES`        | `--logging-max-queue-bytes`        | `4194304`                   |
| `logging.bufferBytes`          | `LOGGING_BUFFER_BYTES`           | `--logging-buffer-bytes`           | `65536`                     |
| `logging.flushIntervalMs`      | `LOGGING_FLUSH_INTERVAL_MS`      | `--logging-flush-interval-ms`      | `250`                       |

## HLS

| 配置项                         | 环境变量                         | 启动参数                           | 默认值     |
| ------------------------------ | -------------------------------- | ---------------------------------- | ---------- |
| `hls.masterM3u8Name`           | `HLS_MASTER_M3U8_NAME`           | `--hls-master-m3u8-name`           | `master`   |
| `hls.mediaM3u8Name`            | `HLS_MEDIA_M3U8_NAME`            | `--hls-media-m3u8-name`            | `media`    |
| `hls.subtitleM3u8Name`         | `HLS_SUBTITLE_M3U8_NAME`         | `--hls-subtitle-m3u8-name`         | `subtitle` |
| `hls.imageM3u8Name`            | `HLS_IMAGE_M3U8_NAME`            | `--hls-image-m3u8-name`            | `image`    |
| `hls.globalSegmentConcurrency` | `HLS_GLOBAL_SEGMENT_CONCURRENCY` | `--hls-global-segment-concurrency` | `2`        |
| `hls.segmentMinDuration`       | `HLS_SEGMENT_MIN_DURATION`       | `--hls-segment-min-duration`       | `4`        |
| `hls.contextPoolSize`          | `HLS_CONTEXT_POOL_SIZE`          | `--hls-context-pool-size`          | `4`        |
| `hls.imageMaxConcurrency`      | `HLS_IMAGE_MAX_CONCURRENCY`      | `--hls-image-max-concurrency`      | `1`        |
| `hls.imageOutputWidth`         | `HLS_IMAGE_OUTPUT_WIDTH`         | `--hls-image-output-width`         | `320`      |
| `hls.imageOutputHeight`        | `HLS_IMAGE_OUTPUT_HEIGHT`        | `--hls-image-output-height`        | `180`      |
| `hls.imageMaxSegmentBytes`     | `HLS_IMAGE_MAX_SEGMENT_BYTES`    | `--hls-image-max-segment-bytes`    | `51200`    |
| `hls.imageMaxJpegBytes`        | `HLS_IMAGE_MAX_JPEG_BYTES`       | `--hls-image-max-jpeg-bytes`       | `47104`    |
| `hls.imageMaxCacheBytes`       | `HLS_IMAGE_MAX_CACHE_BYTES`      | `--hls-image-max-cache-bytes`      | `8388608`  |

## 其他环境变量

以下变量不是 `config.yaml` 的二级配置项，而是日志模块直接读取的运行环境变量：

| 环境变量    | 作用                                                              |
| ----------- | ----------------------------------------------------------------- |
| `NODE_ENV`  | 为 `production` 时关闭开发日志格式化输出                          |
| `LOG_LEVEL` | 设置 Pino 日志级别；未设置时生产环境为 `info`，其他环境为 `debug` |

日志文件按 component 和日期分目录，source 写入文件名；单文件超过上限时递增轮转序号：

```text
logs/http/2026-09-06/business.0001.ndjson
```

`component` 目前包括 `app`、`http`、`web` 和 `hls`。HTTP 请求访问、业务和错误日志分别使用
`access`、`business` 和 `error` source；HLS 的 native/manager source 保留在文件名中。文件内容为
原始 NDJSON，开发环境仍同时输出 `pino-pretty`，正式环境仍输出标准输出。

控制台和文件在同一个 worker 中写入，`fileEnabled: false` 仅关闭文件输出，仍需先编译 transport。
`maxQueueBytes` 限制主线程待写及在途日志的 UTF-8 字节数，默认 4MiB；超过上限丢弃新记录并向 stderr
报告数量，单条超大记录也受该限制。它不是进程总内存上限。

`retentionDays: 0` 禁用过期清理；其他非负整数在启动及每天午夜清理早于“当天减 N 天”的日期目录，
边界当天保留。`flushIntervalMs` 是低流量缓冲的定时提交间隔，不包含排队和磁盘耗时。
文件写入等待回调，但未调用 fsync，不承诺断电持久化。关闭超过 5 秒会终止日志 worker 并返回失败。

`logging.*` 配置项可通过现有配置注入规则使用 `LOGGING_*` 环境变量或命令行参数覆盖。
