# 配置覆盖说明

应用默认配置位于根目录 `config.yaml`，包含 `server`、`web` 和 `hls` 三个一级类目。

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

| 配置项 | 环境变量 | 启动参数 | 默认值 |
| --- | --- | --- | --- |
| `server.protocol` | `SERVER_PROTOCOL` | `--SERVER_PROTOCOL` | `http` |
| `server.host` | `SERVER_HOST` | `--SERVER_HOST` | `localhost` |
| `server.port` | `SERVER_PORT` | `--SERVER_PORT` | `3000` |
| `server.videoConfigPrefix` | `SERVER_VIDEO_CONFIG_PREFIX` | `--SERVER_VIDEO_CONFIG_PREFIX` | 空字符串 |
| `server.dataFile` | `SERVER_DATA_FILE` | `--SERVER_DATA_FILE` | `.video.json` |
| `server.allowedImageExtensions` | `SERVER_ALLOWED_IMAGE_EXTENSIONS` | `--SERVER_ALLOWED_IMAGE_EXTENSIONS` | `.jpg`、`.jpeg`、`.png`、`.webp`、`.gif` |
| `server.allowedVideoExtensions` | `SERVER_ALLOWED_VIDEO_EXTENSIONS` | `--SERVER_ALLOWED_VIDEO_EXTENSIONS` | `.mp4`、`.mkv`、`.avi`、`.flv`、`.m4v`、`.mov`、`.webm`、`.wmv` |
| `server.dataFileSaveDelay` | `SERVER_DATA_FILE_SAVE_DELAY` | `--SERVER_DATA_FILE_SAVE_DELAY` | `500` |

## Web

| 配置项 | 环境变量 | 启动参数 | 默认值 |
| --- | --- | --- | --- |
| `web.protocol` | `WEB_PROTOCOL` | `--WEB_PROTOCOL` | `http` |
| `web.host` | `WEB_HOST` | `--WEB_HOST` | `localhost` |
| `web.port` | `WEB_PORT` | `--WEB_PORT` | `3001` |
| `web.devWebPort` | `WEB_DEV_WEB_PORT` | `--WEB_DEV_WEB_PORT` | `5173` |
| `web.webBundleDir` | `WEB_WEB_BUNDLE_DIR` | `--WEB_WEB_BUNDLE_DIR` | `www` |

## HLS

| 配置项 | 环境变量 | 启动参数 | 默认值 |
| --- | --- | --- | --- |
| `hls.masterM3u8Name` | `HLS_MASTER_M3U8_NAME` | `--HLS_MASTER_M3U8_NAME` | `master` |
| `hls.mediaM3u8Name` | `HLS_MEDIA_M3U8_NAME` | `--HLS_MEDIA_M3U8_NAME` | `media` |
| `hls.subtitleM3u8Name` | `HLS_SUBTITLE_M3U8_NAME` | `--HLS_SUBTITLE_M3U8_NAME` | `subtitle` |
| `hls.imageM3u8Name` | `HLS_IMAGE_M3U8_NAME` | `--HLS_IMAGE_M3U8_NAME` | `image` |
| `hls.globalSegmentConcurrency` | `HLS_GLOBAL_SEGMENT_CONCURRENCY` | `--HLS_GLOBAL_SEGMENT_CONCURRENCY` | `2` |
| `hls.segmentMinDuration` | `HLS_SEGMENT_MIN_DURATION` | `--HLS_SEGMENT_MIN_DURATION` | `4` |
| `hls.contextPoolSize` | `HLS_CONTEXT_POOL_SIZE` | `--HLS_CONTEXT_POOL_SIZE` | `4` |
| `hls.imageMaxConcurrency` | `HLS_IMAGE_MAX_CONCURRENCY` | `--HLS_IMAGE_MAX_CONCURRENCY` | `1` |
| `hls.imageOutputWidth` | `HLS_IMAGE_OUTPUT_WIDTH` | `--HLS_IMAGE_OUTPUT_WIDTH` | `320` |
| `hls.imageOutputHeight` | `HLS_IMAGE_OUTPUT_HEIGHT` | `--HLS_IMAGE_OUTPUT_HEIGHT` | `180` |
| `hls.imageMaxSegmentBytes` | `HLS_IMAGE_MAX_SEGMENT_BYTES` | `--HLS_IMAGE_MAX_SEGMENT_BYTES` | `51200` |
| `hls.imageMaxJpegBytes` | `HLS_IMAGE_MAX_JPEG_BYTES` | `--HLS_IMAGE_MAX_JPEG_BYTES` | `47104` |
| `hls.imageMaxCacheBytes` | `HLS_IMAGE_MAX_CACHE_BYTES` | `--HLS_IMAGE_MAX_CACHE_BYTES` | `8388608` |

## 其他环境变量

以下变量不是 `config.yaml` 的二级配置项，而是日志模块直接读取的运行环境变量：

| 环境变量 | 作用 |
| --- | --- |
| `NODE_ENV` | 为 `production` 时关闭开发日志格式化输出 |
| `LOG_LEVEL` | 设置 Pino 日志级别；未设置时生产环境为 `info`，其他环境为 `debug` |
