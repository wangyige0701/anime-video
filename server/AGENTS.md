# Server 服务端开发约定

## HLS 与预览图实现

服务端通过 `src/hls.ts` 的 `HlsManage` 封装 `hls/hls.node` 原生扩展，`controller/VideoController.ts` 只负责路由、参数校验、响应头和不存在资源的 HTTP 映射。C++ 图片轨道的编码、线程、GPU/CPU 传输和 fMP4 约束记录在 `hls/AGENTS.md`；服务端不得重复实现图片解码或封装。

### 配置与原生接口

`config.yaml` 是 Node 侧 HLS 配置入口：

- master、media、subtitle、image playlist 名称统一读取 `config.yaml` 的 `hls` 配置，当前图片 playlist 名称为 `image`。
- `hls.segmentMinDuration` 当前为 4 秒，`hls.contextPoolSize` 当前为 4。
- `hls.imageMaxConcurrency` 当前为 1，传给原生构造参数 `imageMaxConcurrency`，限制单个 Hls 实例的预览图工作线程数。
- `hls.imageOutputWidth`、`hls.imageOutputHeight` 当前为 320x180；`hls.imageMaxSegmentBytes`、`hls.imageMaxJpegBytes`、`hls.imageMaxCacheBytes` 当前分别为 50KiB、46KiB、8MiB，并传给同名 `image...` Node 构造配置。
- `HlsConstructor.configure({ globalSegmentConcurrency })` 使用 `hls.globalSegmentConcurrency` 限制全局 TS 分片任务并发。

`server/hls.d.ts` 声明原生扩展接口，必须和 C++ N-API 保持一致。当前图片接口包括 `image_m3u8()`、`image_init()` 和异步 `image(index)`；构造参数包括 `imageM3u8Name`、`imageMaxConcurrency`、`imageOutputWidth`、`imageOutputHeight`、`imageMaxSegmentBytes`、`imageMaxJpegBytes`、`imageMaxCacheBytes` 与 `onLog`。修改任一端接口时，必须同时检查 C++ 导出、类型声明、`HlsManage`、配置和路由调用方。

服务端依赖的原生图片契约为：复用视频 HLS 分片索引和时间范围，每段最多一张预览图；只有首次调用 `image(index)` 才懒创建独立图片线程，playlist 和 init 请求不能触发解码；默认输出为 320x180 的单 JPEG sample fMP4，完整 `.m4s` 默认不超过 50KB。原生层优先使用 GPU 解码/缩放并减少全尺寸 GPU 到 CPU 传输，硬件路径不可用时自动回退软件实现，任何图片路径都不得改变 TS 或字幕输出。

### HTTP 路由

`VideoController` 挂载在 `ServerRoot.VIDEO`，当前资源映射为：

| 路径 | 返回内容 | Content-Type | Cache-Control |
| --- | --- | --- | --- |
| `/:path/master.m3u8` | master playlist | `application/vnd.apple.mpegurl` | `no-cache` |
| `/:path/media.m3u8` | 视频 playlist | `application/vnd.apple.mpegurl` | `no-cache` |
| `/:path/image.m3u8` | JPEG I-frame 图片 playlist | `application/vnd.apple.mpegurl` | `no-cache` |
| `/:path/image_init.mp4` | 图片 fMP4 初始化段 | `video/mp4` | `public, max-age=3600` |
| `/:path/:id.m4s` | 指定分片的单帧 JPEG fMP4 | `video/mp4` | `public, max-age=3600` |
| `/:path/:id.ts` | 视频 TS 分片 | `video/mp2t` | `public, max-age=3600` |
| `/:path/:stream/subtitle.m3u8` | 字幕 playlist | `application/vnd.apple.mpegurl` | `no-cache` |
| `/:path/:stream/:id.vtt` | 字幕分片 | `text/vtt` | `public, max-age=3600` |

playlist 名称必须引用 `__APP_CONFIG__.hls`，不要在控制器中再写一份字符串。媒体接口直接返回原始 `Buffer`，不使用普通 JSON 接口的 `ctx.Success()` 包装，否则会破坏 hls.js 对二进制内容和 playlist 的解析。

`path` 参数先安全执行 `decodeURIComponent()` 和 `path.resolve()`，再通过 `Series.isAllowedDirectory()`、视频扩展名白名单和 `fs.stat().isFile()` 校验。分片、图片和字幕索引使用严格的非负安全整数校验，不能用宽松的 `parseInt()`。无效路径、索引或不存在的资源统一抛出 `NotFoundError`，不要把 `undefined` 作为成功响应返回。

### HlsManage 实例生命周期

`HlsManage` 按规范化输入路径的 SHA-256 建立静态 `hlsBucket`。相同文件路径复用同一个 manager，复用时会重置实例 GC；新 manager 创建原生 Hls、读取分片数量并初始化 TS 和图片缓存数组。

`resetGc()` 安排 5 分钟后的实例销毁，并在下一次调用时重新计时。复用已有 manager、media/image playlist、image init、TS 和图片请求会调用或触发该逻辑；`master()`、`subtitle_m3u8()`、`subtitle()` 当前不直接调用 `resetGc()`，首次只经过这些方法的新 manager 不应被文档误认为已经安排 GC。修改公开方法或生命周期时必须先验证这些现有调用差异。

GC 会销毁原生实例、重建 TS/图片缓存、清理 timer map 并从 bucket 删除 manager；图片清理定时器会在清空 map 前逐个 `clearTimeout()`。新增定时器、后台任务或资源引用时必须增加对应释放逻辑，不能只从 bucket 删除对象。

原生 `onLog` 回调转发到绑定 `{ component: 'hls', hlsId }` 的 Pino child logger，并标记 `source: 'hls-native'`；manager 自身日志使用 `source: 'hls-manager'`。后台 HLS 任务没有请求 ctx 时继续使用该模块 logger，不要伪造 `ctx.log`。

### TS 分片缓存

TS 缓存按分片索引保存 `Promise<Buffer>`，同索引请求共享正在生成或已完成的结果。请求当前分片时会更新 `currentIndex`，并通过 `ParallelTask(5)` 向后预加载最多 5 个分片；缓存命中时还会检查后续两个索引并补充预加载。

当前索引到其后 50 个分片属于播放窗口，不设置淘汰定时器。窗口之外的旧分片使用 150 秒延迟清除。修改 TS 缓存、预加载或 GC 时必须保持现有播放窗口和并发语义，不能因图片功能改变 TS Worker、原生全局调度或主视频输出。

### 图片缓存

预览图在 `HlsManage.image(index)` 上增加独立的 Node 层缓存，不能与 TS 缓存数组或清理策略混用：

- `imageCache[index]` 保存原生 `image(index)` 返回的 `Promise<Buffer>`，以图片/分片索引为 key。
- 相同索引的并发请求直接返回同一个 Promise，避免重复占用图片线程、decoder 和 GPU。
- 每次缓存命中都会重置该索引的清理定时器，当前滑动过期时间为 30 分钟。
- Promise reject 后立即清除对应缓存和定时器，使后续请求可以重新生成；失败结果不得长期缓存。
- 索引过期时只清除该项。Hls 实例 GC 时必须清除全部 `imageWaitToClear` 定时器、清空 timer map 并重建 `imageCache`，防止 manager 销毁后仍被定时器引用。

图片缓存时间虽然长于 TS 缓存，但 Hls 实例本身仍受 5 分钟无访问 GC 控制；GC 发生时图片缓存随实例及时释放。不要为延长图片缓存而改变现有实例 GC 时间，也不要在 Node 层缓存解码帧或未经压缩的图像数据。

## 项目结构

`server/` 是基于 Koa、TypeScript、`koa-use-decorator-router`、Zod 和 Pino 的 API 服务。主要目录和文件职责如下：

- `app.ts`：API 入口，创建 Koa 和装饰器路由扫描器，按顺序注册请求日志、错误、body、响应辅助和路由中间件。
- `controller/`：装饰器控制器；按 data、video、image、system 等领域暴露 HTTP 接口。
- `decorators/`：项目自定义装饰器，当前 `Validate` 使用 Zod 校验并替换解析后的 request body。
- `middlewares/`：请求日志、统一异常映射和 JSON 响应辅助。
- `data/`：扫描允许的视频目录，构建 Series/Season/Episode 数据树，维护实例缓存、排序及 `.video.json` 配置持久化。
- `src/hls.ts`：原生 HLS 实例、分片预加载、TS/图片缓存和生命周期管理。
- `src/error/`：`ApiError`、`NotFoundError` 等 HTTP 错误类型。
- `src/utils/`：文件系统和通用判断工具。
- `web.ts`：独立 Web 服务入口，托管构建产物并提供 history fallback。
- `test/`：Vitest 测试和媒体目录 fixture。
- `*.d.ts`：Koa context 扩展和原生 HLS 类型声明。

共享配置、路由和类型位于仓库根目录的 `config/`、`routes/`、`types/`、`common/`，通过 `~config`、`~routes`、`~types`、`~common` 使用。新增共享契约应放回对应共享目录，不要在 controller 内复制常量或响应类型。

## 系列、季、集数据层

`server/data/` 以文件系统为媒体资源事实来源，以 `DATA_FILE` JSON 保存目录白名单、可编辑元数据和排序。`Series -> Season -> Episode` 对应“系列目录 -> 季目录 -> 视频文件”，控制器只通过这些领域对象读取或修改数据，不能自行扫描并维护另一套缓存。

### 磁盘布局与配置归属

`DATA_FILE` 由 `server.videoConfigPrefix + server.dataFile` 生成，默认文件名为 `.video.json`。对应环境变量为 `SERVER_VIDEO_CONFIG_PREFIX` 和 `SERVER_DATA_FILE`。同名文件有两种不同用途：

- `path.join(process.cwd(), DATA_FILE)` 保存允许扫描的视频根目录数组。
- 每个允许根目录下的 `DATA_FILE` 保存该根目录直接包含的所有 series 配置，内部继续嵌套 seasons 和 episodes 元数据。

目录结构约定如下：

```text
允许根目录/
├── .video.json
└── 系列目录/
    ├── 封面图片.jpg
    └── 季目录/
        └── 剧集文件.mkv
```

Series 只扫描允许根目录的直接子目录；Season 只扫描 series 的直接子目录；Episode 只登记 season 下扩展名属于 `allowedVideoExtensions` 的普通文件。series 根目录的直接图片按 `allowedImageExtensions` 登记，目录和指向目录的链接不作为图片。修改目录层级约定会同时影响扫描、ID、配置和客户端数据结构，不能只改某一级。

目录配置由 `DirectoryController` 接收：Zod 先校验非空字符串，`normalizeDirectories()` 再执行 `path.resolve()`、目录存在检查、`fs.realpath()` 和真实路径去重。`Common.setDirectories()` 只写入根目录列表，本身不会刷新实体；现有接口随后调用 `Series.updateSeries()` 完成扫描和缓存对账。

### 路径授权与稳定 ID

所有 series、season、episode 和媒体/图片资源都必须位于允许根目录内。`Common.isAllowedDirectory()` 会解析真实路径，已存在资源直接使用 `realpath()`；不存在的叶子路径逐级寻找最近的可解析祖先，再拼回缺失部分，用于阻止符号链接或 Windows Junction 绕过白名单。

授权判断使用 `path.relative(root, target)`，只有目标等于根目录或相对路径未逃逸到 `..` 且不是绝对路径时才允许。新增文件写入、配置文件或资源路由必须复用该判断，不要仅依赖字符串前缀。

三类实体 ID 均为对应绝对目录/文件路径的 MD5：Series 使用系列目录，Season 使用季目录，Episode 使用视频文件路径。路径移动或重命名会产生新 ID，刷新时旧 ID 的配置项和实例缓存应被移除。

### Data JSON 持久化

`data/data.ts` 的 `Data<T>` 负责 JSON 配置的读取、内存代理和写盘：

- 相同规范化配置路径在进程内只保留一个 `Data` 实例，避免多条保存队列同时写同一文件。
- 首次构造立即保存一个 `doRead()` Promise；`read()` 始终返回同一份代理数据。
- 对象和数组通过递归 Proxy 包装，`push()`、属性赋值和删除等嵌套修改都会 `markDirty()`；`WeakMap` 确保同一原始对象只生成一个代理。
- 新值与旧值 `isEqual()` 时不增加 revision，避免无意义写盘。
- `server.dataFileSaveDelay` 控制防抖时间，默认 500ms；对应环境变量为 `SERVER_DATA_FILE_SAVE_DELAY`。连续修改重置 timer 并合并写盘。

实际写盘始终先把当前 JSON 快照写入同目录 `<DATA_FILE>.tmp`，再用 `rename()` 替换正式文件，避免进程中断留下半截 JSON。启动读取时如果存在临时文件：有效 JSON 会被提升为正式文件；损坏临时文件会被删除，并保留已有正式配置；两者都没有时写入调用方提供的默认值。

每个 Data 实例同时只执行一个写盘任务。`revision` 表示当前内存版本，`savedRevision` 表示已确认落盘版本；写入期间产生的新 revision 会安排下一轮保存。`save()` 返回的 Promise 只在调用时对应 revision 已落盘后完成，较新版本的 waiter 不能被旧快照提前 resolve。写入失败只 reject 本轮已覆盖的 waiter，后续显式 `save()` 再启动重试，不能增加无限后台重试。

代理修改会自动安排延迟保存，但 controller 的成功响应必须在领域对象更新后调用 `waitDataSave()`。Season 和 Episode 的 `waitDataSave()` 逐级转发到所属 Series 的 Data 实例，保证接口返回成功时当前版本已经持久化。`save(false)` 是无等待强制标脏，仅在明确不需要等待结果的内部场景使用。

### 实体缓存与异步属性

`Series`、`Season`、`Episode` 分别维护按 ID 索引的静态实例 cache。构造函数命中同 ID 时直接返回已有对象，确保同一资源在进程内只有一个领域实例。初始化失败时必须从 cache 删除该实例，否则后续读取会永久复用 rejected Promise。

领域类实现 `ServerToPromise<T>`：`id`、`path`、`title`、`sort` 等属性都是从初始化 Promise 派生的 Promise。构造时立即执行 `register*()`，初始化完成后调用方可以并行等待多个属性；配置修改后重新注册对应属性 Promise，使后续读取拿到新值。

- `getPromise()` / `getConfig()` 暴露实体初始化及其配置对象。
- `getValue()` 等待全部属性并返回普通 DTO；Series/Season 的完整版会递归装配子级。
- `getValueOmitSeasons()` 和 `getValueOmitEpisodes()` 避免为列表接口不必要地递归读取子级。
- `toJSON()` 只提供便于诊断的实体描述，不是 API DTO。

cache 删除必须级联：删除 Series 时删除其 Season/Episode，删除 Season 时删除其 Episode；全量 clear 同时让 `Series.isIndexed` 回到 false。新增实体类型或父子关系时必须维护对应清理路径。

### Series 扫描与整理

`Series.getAllSeries(forceRefresh)` 是根扫描入口：

1. `isIndexed` 为 true 且未强制刷新时，直接返回实例 cache 的数组副本，不重复遍历磁盘。
2. 遍历允许根目录，跳过不存在或不是目录的配置项。
3. 使用 `fs.readdir(..., { withFileTypes: true })` 选择普通目录；符号链接才额外通过 `isDirectory()` 判断，以兼容链接目录。
4. 构造并等待每个 Series 初始化。
5. 用当前扫描 ID 删除根目录配置中已不存在的 series，并级联回收同一根目录下的失效实例 cache。
6. 等待配置保存完成，最后设置 `isIndexed = true`。

Series 初始化会验证数据文件和系列目录都在允许范围内，然后从所属根目录的 Data 实例找到或创建配置。新 series 默认使用目录名作为 name/title，date/types 为空、status 为 0、description 为空，并初始化 images/seasons 数组。

series 图片仅扫描系列目录直接包含的允许扩展名文件。刷新时会删除磁盘上已不存在的图片；已有图片沿用旧 sort，新图片从历史最大 sort 之后追加。对外 `images` 按 sort 排列并转换为绝对路径，配置文件中只保存 basename 和 sort。

`updateImages()` 使用调用方给出的有效图片名重建并从 1 排序；没有任何有效图片时保持原配置。`addImages()` 验证文件与扩展名后追加到当前最大 sort 之后；`removeImages()` 按 basename 删除并把剩余项从 1 重新排序。图片参数是 series 目录内名称而非任意绝对路径。

Series 还负责 title、description、date、types、status 更新。`addTypes()` 当前直接追加，不自动去重；`removeTypes()` 删除匹配项；输入范围与 operation 合法性由装饰器 controller 校验。

### Season 与 Episode 扫描

`Season.getAllSeasons(series)` 扫描 series 的直接子目录和指向目录的符号链接。每个 season 从所属 series 的嵌套配置读取或创建：ID 来自季目录路径，默认 sort 为现有最大值加 1，path 保存目录名，title 默认目录名，episodes 默认为空。结果按 sort 升序返回。

扫描完成后，Season 会从配置数组删除磁盘上已不存在的季，并级联回收属于当前 series 的失效 Season/Episode cache，然后等待所属 Data 保存。

`Episode.getAllEpisodes(season)` 只接受普通文件且扩展名在视频白名单内；其他文件、目录和链接文件当前不会登记。新 episode 的 ID 来自文件路径，sort 为当前最大值加 1，path 保存含扩展名的 basename，extension 从文件名读取，title 默认不含扩展名的 basename。结果按 sort 升序返回。

扫描完成后，Episode 会删除配置中已不存在的剧集、回收当前 season 下失效的 Episode cache，并等待所属 Series Data 保存。文件系统新增、删除或重命名不会由普通缓存读取自动完整发现，必须通过刷新流程对账。

### 查找与刷新

`getSeriesById()`、`getSeasonById()`、`getEpisodeById()` 都优先检查实例 cache，但返回前仍重新验证路径授权和文件/目录存在性；失效对象先从 cache 删除。未命中时从上级扫描入口逐层查找，最终不存在则抛出 `NotFoundError`。

`Series.updateSeries(seriesId?)` 是刷新入口：先从缓存中删除已不在授权目录内或在磁盘上已不存在的实体，然后强制重新扫描全部根级 series。未指定 ID 时刷新所有 series 配置、图片、season 和 episode；指定 ID 时根级仍会对账，但只对目标 series 执行 `refreshConfig()` 和完整子树扫描。最后按 Data 实例去重并等待相关配置保存。

普通 GET 读取优先使用 `isIndexed` 与实体 cache，不承诺实时感知外部文件系统变化。新增、删除或重命名媒体后应调用全量或单 series 刷新接口，不要在每个读取接口强制全盘扫描。

### 排序与并发更新

Season 排序由所属 Series 的 `seasonSortQueue` 串行处理，Episode 排序由所属 Season 的 `episodeSortQueue` 串行处理。任务真正开始时才读取目标旧 sort，避免并发请求携带过期位置覆盖前一个更新。

目标位置会限制在 `1..同级数量`。移动目标时，仅处理旧位置与新位置之间的同级项：目标写入新 sort，向后移动时其他项减 1，向前移动时其他项加 1。`rewriteSort()` 更新代理配置并重新注册 sort Promise。

排序队列只保证同一父级内配置值的并发一致性。当前内存中的 seasons/episodes 数组不会在 `updateSort()` 后自动重新排序；重新扫描时 `getAllSeasons()` / `getAllEpisodes()` 才按最新 sort 生成排序结果。不要在排序 API 中绕过父级队列单独改一个 sort，否则会产生重复或空缺位置。

### 数据接口边界

- `DirectoryController` 负责允许根目录读取和设置。
- `SeriesController` 负责列表、详情、刷新及 series 可编辑字段。
- `SeasonController`、`EpisodeController` 负责按父级/ID 读取和 title/sort 更新。
- request body 通过 `@Validate()` 校验；路由 ID 通过 `@Inject()` 注入，operation 在注入时额外使用 `validateOperation` 转换并校验。
- 修改接口在领域对象更新并 `waitDataSave()` 后记录 `ctx.log.info()`，再返回 `ctx.Success()`。

数据层新增功能应先确定配置归属和资源事实来源，再扩展领域对象和装饰器 controller。不得从 controller 直接修改 Data 代理内部结构，也不得在未完成持久化时对外报告修改成功。

## 请求处理架构

### 中间件顺序

`app.ts` 当前顺序为：

1. `requestLog()`：生成 request ID、设置 `ctx.log` 和 `x-request-id`，请求完成后记录访问摘要。
2. `error()`：捕获 `ApiError` 和未知异常，映射状态、类型与响应体。
3. `koa-body`：解析请求体。
4. `response()`：挂载 `ctx.Success()`、`ctx.Failed()` 等统一 JSON 响应辅助。
5. `decorator.middleware()` 与 `allowedMethods()`：执行自动扫描到的装饰器路由和方法检查。

中间件顺序影响日志、异常和 context 扩展的可用性，除非需求明确涉及全局请求链路，不要调整顺序。

### 装饰器控制器

新增接口必须基于现有装饰器架构，禁止绕过 `koa-use-decorator-router` 手动创建并挂载另一套路由：

- 控制器类使用 `@Singleton()`、`@Controller(ServerRoot.xxx)`，按现有跨域需求使用 `@Cors()`。
- 方法使用 `@HttpMethod.Get/Post/Put/Delete()` 声明相对路径。
- 需要 Koa context 时使用 `@Context() ctx: Koa.Context`。
- path/query/body 参数优先通过 `@Inject()`、注入转换函数和 `@Validate()` 校验；复杂 body 使用 Zod schema。
- 特殊响应使用 `@ResponseHeader()` 声明固定响应头。
- 普通 API 返回 `ctx.Success(data)` 等统一结构；媒体、SSE、文件流等协议响应按现有接口直接返回或操作 ctx。

参数校验应在进入数据/HLS 核心逻辑前完成。可复用校验放入装饰器或明确的校验函数；业务不存在使用 `ApiError`/`NotFoundError` 交给 error 中间件，不能在每个接口里自行拼接不同格式的错误响应。

## 日志规范

接口在合适的业务节点必须使用请求级 `ctx.log`，新增需要业务日志的 handler 应通过 `@Context()` 获取 ctx：

- 成功完成新增、修改、删除、刷新等状态变更后使用 `ctx.log.info()`。
- 长连接建立/关闭、缓存命中等诊断信息使用 `debug`；可恢复异常或被拒绝的重要操作使用 `warn`。
- 已捕获且不会继续抛出的异常需要记录合适级别；继续抛给 error 中间件的未知异常通常不在 controller 重复记录堆栈。
- 使用结构化字段并提供稳定的 `event` 名称，例如 `{ event: 'series.title.updated', seriesId }`。ID、计数、scope、耗时等放在字段中，不要拼进消息字符串。
- 不记录视频 Buffer、图片内容、完整 request body、密钥或其他大体积/敏感数据。

`requestLog()` 已记录 method、匹配路由、status 和 duration；普通只读接口不需要重复输出同一条访问日志。高频 video/image 访问摘要自动降为 debug。模块后台任务使用 `createLogger({ component: ... })`，不要使用 `console.log()` 代替结构化日志。

## 实现规范

### 中文注释

新增复杂逻辑必须及时添加中文注释，说明业务目的、不变量、并发或缓存边界、失败恢复和资源所有权。尤其包括：

- 异步请求去重、Promise 缓存和失败淘汰。
- 定时器、GC、原生对象和后台任务的释放顺序。
- 文件路径安全校验、目录白名单和严格参数转换。
- 数据扫描、配置恢复、并发保存和排序队列。
- SSE/流式响应的关闭、背压或异常处理。

注释解释“为什么”和边界条件，不要只复述赋值或函数名。简单的装饰器声明、直接数据映射和显然的 guard 不需要堆积注释。

### 保持现有功能

所有修改必须保持现有接口路径、响应结构、Content-Type、缓存头、错误状态、数据持久化、媒体输出和并发语义不变，除非需求明确要求改变。实现新功能时优先增加独立模块、字段或路由，不要顺便重构无关 controller、data、TS 缓存或中间件。

修改共享层前必须检查全部调用方。HLS 图片功能不得影响 TS、字幕和主视频；数据更新不得绕过 `waitDataSave()`；接口变更不得把普通 JSON 响应与二进制/流式响应混用。

### 文档同步

每次修改 `server/` 内的接口、控制器、数据模型、中间件、HLS 管理、配置、类型声明、运行方式或测试流程，都必须同步检查并维护本 `AGENTS.md`：

- 优先更新已有章节，记录当前有效架构，不写成按日期堆叠的修改日志。
- 新实现替换旧实现后，删除或修正过时内容，不能保留冲突方案。
- 纯局部实现未改变架构结论时可以不增加条目，但必须确认本文档仍然准确。
- HLS 原生实现同时受 `hls/AGENTS.md` 约束；跨 Node/C++ 修改必须同步检查两份文档。

## 验证要求

服务端修改后至少执行：

1. `git diff --check -- server`。
2. `npx tsc -p server/tsconfig.json --noEmit`，确认服务端及共享类型通过检查。
3. 数据扫描、配置保存、控制器或公共工具变更时执行 `npx vitest run server/test`。
4. 接口变更时验证成功、参数无效、资源不存在和内部异常路径，并确认日志包含 request ID、event 和必要业务字段。
5. HLS 变更时至少请求 master/media/image playlist、image init、两个连续 TS 和两个图片分片，检查状态、响应头、缓存命中、失败重试及 GC 清理；涉及原生扩展时同时执行 `hls/AGENTS.md` 的构建与媒体验证。

如果验证因本地依赖、原生模块占用或缺少媒体 fixture 无法执行，必须在交付说明中明确记录未验证项和环境原因。
