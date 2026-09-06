# 配置覆盖说明

应用默认配置位于根目录 `config.yaml`，包含 `server`、`logging`、`web` 和 `hls` 四个一级类目。

## 覆盖优先级

同一个配置项同时存在多种来源时，优先级如下：

1. 启动参数
2. 环境变量
3. `config.yaml` 中的默认值

环境变量和启动参数名称都由二级类目、下划线和配置字段组成。字段名中的驼峰字母会转换为下划线并全部大写。例如：

```text
server.dataFileSaveDelay -> SERVER_DATA_FILE_SAVE_DELAY
hls.segmentMinDuration   -> HLS_SEGMENT_MIN_DURATION
```

启动参数支持以下两种写法，也兼容一个连字符：

```text
--SERVER_PORT=4000
--SERVER_PORT 4000
```

数字配置按数字解析，布尔配置接受 `true` 或 `false`（不合法时保留默认值），数组配置可使用 YAML/JSON 数组或逗号分隔字符串。

## Server

| 配置项                          | 环境变量                          | 启动参数                            | 默认值                                                          |
| ------------------------------- | --------------------------------- | ----------------------------------- | --------------------------------------------------------------- |
| `server.protocol`               | `SERVER_PROTOCOL`                 | `--SERVER_PROTOCOL`                 | `http`                                                          |
| `server.host`                   | `SERVER_HOST`                     | `--SERVER_HOST`                     | `localhost`                                                     |
| `server.port`                   | `SERVER_PORT`                     | `--SERVER_PORT`                     | `3000`                                                          |
| `server.videoConfigPrefix`      | `SERVER_VIDEO_CONFIG_PREFIX`      | `--SERVER_VIDEO_CONFIG_PREFIX`      | 空字符串                                                        |
| `server.dataFile`               | `SERVER_DATA_FILE`                | `--SERVER_DATA_FILE`                | `.video.json`                                                   |
| `server.allowedImageExtensions` | `SERVER_ALLOWED_IMAGE_EXTENSIONS` | `--SERVER_ALLOWED_IMAGE_EXTENSIONS` | `.jpg`、`.jpeg`、`.png`、`.webp`、`.gif`                        |
| `server.allowedVideoExtensions` | `SERVER_ALLOWED_VIDEO_EXTENSIONS` | `--SERVER_ALLOWED_VIDEO_EXTENSIONS` | `.mp4`、`.mkv`、`.avi`、`.flv`、`.m4v`、`.mov`、`.webm`、`.wmv` |
| `server.dataFileSaveDelay`      | `SERVER_DATA_FILE_SAVE_DELAY`     | `--SERVER_DATA_FILE_SAVE_DELAY`     | `500`                                                           |

## Web

| 配置项             | 环境变量             | 启动参数               | 默认值      |
| ------------------ | -------------------- | ---------------------- | ----------- |
| `web.protocol`     | `WEB_PROTOCOL`       | `--WEB_PROTOCOL`       | `http`      |
| `web.host`         | `WEB_HOST`           | `--WEB_HOST`           | `localhost` |
| `web.port`         | `WEB_PORT`           | `--WEB_PORT`           | `3001`      |
| `web.devWebPort`   | `WEB_DEV_WEB_PORT`   | `--WEB_DEV_WEB_PORT`   | `5173`      |
| `web.webBundleDir` | `WEB_WEB_BUNDLE_DIR` | `--WEB_WEB_BUNDLE_DIR` | `www`       |

## Logging

| 配置项                         | 环境变量                         | 启动参数                           | 默认值                      |
| ------------------------------ | -------------------------------- | ---------------------------------- | --------------------------- |
| `logging.directory`            | `LOGGING_DIRECTORY`              | `--LOGGING_DIRECTORY`              | `logs`                      |
| `logging.fileEnabled`          | `LOGGING_FILE_ENABLED`           | `--LOGGING_FILE_ENABLED`           | `true`                      |
| `logging.components`           | `LOGGING_COMPONENTS`             | `--LOGGING_COMPONENTS`             | `app,http,web,hls`          |
| `logging.sources`              | `LOGGING_SOURCES`                | `--LOGGING_SOURCES`                | `access,business,error,...` |
| `logging.httpEventSource`      | `LOGGING_HTTP_EVENT_SOURCE`      | `--LOGGING_HTTP_EVENT_SOURCE`      | 事件映射                    |
| `logging.httpBusinessPrefixes` | `LOGGING_HTTP_BUSINESS_PREFIXES` | `--LOGGING_HTTP_BUSINESS_PREFIXES` | `series.,season.,...`       |
| `logging.fileMaxBytes`         | `LOGGING_FILE_MAX_BYTES`         | `--LOGGING_FILE_MAX_BYTES`         | `52428800`                  |
| `logging.retentionDays`        | `LOGGING_RETENTION_DAYS`         | `--LOGGING_RETENTION_DAYS`         | `30`                        |
| `logging.maxQueueBytes`        | `LOGGING_MAX_QUEUE_BYTES`        | `--LOGGING_MAX_QUEUE_BYTES`        | `4194304`                   |
| `logging.bufferBytes`          | `LOGGING_BUFFER_BYTES`           | `--LOGGING_BUFFER_BYTES`           | `65536`                     |
| `logging.flushIntervalMs`      | `LOGGING_FLUSH_INTERVAL_MS`      | `--LOGGING_FLUSH_INTERVAL_MS`      | `250`                       |

## HLS

| 配置项                         | 环境变量                         | 启动参数                           | 默认值     |
| ------------------------------ | -------------------------------- | ---------------------------------- | ---------- |
| `hls.masterM3u8Name`           | `HLS_MASTER_M3U8_NAME`           | `--HLS_MASTER_M3U8_NAME`           | `master`   |
| `hls.mediaM3u8Name`            | `HLS_MEDIA_M3U8_NAME`            | `--HLS_MEDIA_M3U8_NAME`            | `media`    |
| `hls.subtitleM3u8Name`         | `HLS_SUBTITLE_M3U8_NAME`         | `--HLS_SUBTITLE_M3U8_NAME`         | `subtitle` |
| `hls.imageM3u8Name`            | `HLS_IMAGE_M3U8_NAME`            | `--HLS_IMAGE_M3U8_NAME`            | `image`    |
| `hls.globalSegmentConcurrency` | `HLS_GLOBAL_SEGMENT_CONCURRENCY` | `--HLS_GLOBAL_SEGMENT_CONCURRENCY` | `2`        |
| `hls.segmentMinDuration`       | `HLS_SEGMENT_MIN_DURATION`       | `--HLS_SEGMENT_MIN_DURATION`       | `4`        |
| `hls.contextPoolSize`          | `HLS_CONTEXT_POOL_SIZE`          | `--HLS_CONTEXT_POOL_SIZE`          | `4`        |
| `hls.imageMaxConcurrency`      | `HLS_IMAGE_MAX_CONCURRENCY`      | `--HLS_IMAGE_MAX_CONCURRENCY`      | `1`        |
| `hls.imageOutputWidth`         | `HLS_IMAGE_OUTPUT_WIDTH`         | `--HLS_IMAGE_OUTPUT_WIDTH`         | `320`      |
| `hls.imageOutputHeight`        | `HLS_IMAGE_OUTPUT_HEIGHT`        | `--HLS_IMAGE_OUTPUT_HEIGHT`        | `180`      |
| `hls.imageMaxSegmentBytes`     | `HLS_IMAGE_MAX_SEGMENT_BYTES`    | `--HLS_IMAGE_MAX_SEGMENT_BYTES`    | `51200`    |
| `hls.imageMaxJpegBytes`        | `HLS_IMAGE_MAX_JPEG_BYTES`       | `--HLS_IMAGE_MAX_JPEG_BYTES`       | `47104`    |
| `hls.imageMaxCacheBytes`       | `HLS_IMAGE_MAX_CACHE_BYTES`      | `--HLS_IMAGE_MAX_CACHE_BYTES`      | `8388608`  |

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
