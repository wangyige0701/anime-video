# Web 前端开发约定

## 项目概览

`web/` 是基于 Vue 3、TypeScript 和 Vite 的前端应用，主要依赖 Pinia、Vue Router、Element Plus、VueUse 与 hls.js。应用入口为 `src/main.ts`，页面由 `src/views/` 下的文件路由生成，播放器实现集中在 `src/video/`。

主要目录职责：

- `src/api/`：按业务领域封装服务端请求，公共响应处理位于 `src/api.ts`。
- `src/components/`：通用组件及详情、侧边栏等业务组件。
- `src/data/`：业务数据访问和组合逻辑。
- `src/events/`：跨模块事件定义。
- `src/keyboard/`：播放器快捷键声明、注册和触发逻辑。
- `src/stores/`：Pinia 状态；播放器状态以 `stores/player.ts` 为中心。
- `src/utils/`：可复用且不属于组件的工具与组合式逻辑。
- `src/video/`：播放器、控制器、时间轴、字幕及其专用 hooks。
- `src/views/`：由 `vue-router/vite` 生成路由的页面组件。
- `src/scss/` 与 `src/assets/`：主题变量、设计 token、全局样式及组件样式基础。

路径别名沿用现有配置：`@/` 指向 `src/`，`~shared/`、`~routes/`、`~types/` 分别指向仓库根目录的共享模块。系列状态和类型枚举通过 `~shared/series-status`、`~shared/series-types` 导入；`shared/config-parser.ts` 依赖 Node，不能导入浏览器运行时代码。Vue、Vue Router、Pinia、Element Plus 的常用 API 已由 Vite 自动导入，新代码应先遵循当前导入方式，不要重复建立另一套入口。

## 系列、季、集数据方案

`src/data/` 将服务端 DTO 转为带响应式状态、实例缓存和更新方法的领域对象。类型契约来自 `~types/videos`，请求函数位于 `src/api/series.ts`、`season.ts`、`episode.ts`，`stores/video.ts` 只作为页面访问数据层的薄封装，不重复保存实体列表。

### 数据模型与职责

| 类        | 核心字段                                                                          | 子级关系              | 可编辑字段                         |
| --------- | --------------------------------------------------------------------------------- | --------------------- | ---------------------------------- |
| `Series`  | `id`、`path`、`name`、`title`、`images`、`description`、`date`、`types`、`status` | `seasons: Season[]`   | 标题、图片、描述、日期、类型、状态 |
| `Season`  | `id`、`sort`、`path`、`title`                                                     | `episodes: Episode[]` | 标题、排序                         |
| `Episode` | `id`、`sort`、`path`、`extension`、`title`                                        | 无                    | 标题、排序                         |

三类对象的字段内部使用 Vue `ref()` 保存，对外通过 getter 暴露，因此组件读取 `series.title`、`season.episodes` 等普通属性时仍会建立响应式依赖。`id`、路径、目录名和扩展名当前没有前端更新方法，应视为服务端扫描结果和实体身份，不要在组件中直接改写。

实体构造与关系装配是两个步骤：`new Series(dto)` 不会自动解析 `dto.seasons`，`new Season(dto)` 也不会自动解析 `dto.episodes`。完整树必须显式执行 `series.setSeasons()`，并为每个 season 执行 `season.setEpisodes()`。新增数据入口时必须复用这一装配方式，避免把原始 DTO 数组混入领域对象数组。

### Common 缓存与关系引用

`Series`、`Season`、`Episode` 都继承 `Common`，各自维护以实体 ID 为 key 的静态实例 `cache`。构造函数发现同 ID 实例时会直接返回缓存对象，不会使用新 DTO 覆盖旧字段；因此需要接受服务端新数据时，必须先走现有刷新清理流程，不能依赖重复 `new` 完成更新。

父子数组使用 `Common.createRef()` 创建的只读 `customRef`：

- `track()` 在 `seasons` / `episodes` getter 中显式收集依赖。
- `update(newValue)` 由 `setSeasons()` / `setEpisodes()` 调用，替换整个数组并触发依赖更新。
- `bindCache` 按实体 ID 保存 `{ ref, track, update }`，实例缓存被删除并重建后仍可复用原关系 ref，使持有该响应式关系的视图能够接收后续替换。

`bindCache` 定义在 `Common` 且只以 ID 为 key。调整 ID 方案、增加新的数据实体类型或修改缓存隔离方式时，必须确认不同实体的 ID 不会碰撞，并同时检查 `filterBindCache()` 对关系引用的清理范围。

### 初始化与详情装配

`Series.initialized()` 是全局数据初始化入口，`App.vue` 通过 `useVideoStore().initialize()` 调用：

1. 首次调用设置 loading，并请求不包含季、集详情的 series 列表。
2. 每个 DTO 构造成 `Series` 并进入实例缓存。
3. 并发初始化调用共享 `globalWaitPromise`，避免重复发起同一批请求。
4. 初始化成功后设置 initialized；后续调用直接返回 `Series.cache` 当前值的数组副本。
5. 初始化失败时显示错误、结束 loading 并以当前空结果完成 Promise，但不设置 initialized，使后续调用仍可重试。

`Series.getSeriesDetail(seriesId)` 会先确保全局初始化完成，然后按缓存状态选择装配路径：

- series 不在缓存时，请求完整 series detail，创建 `Series`，把响应内每个 season/episode 转为对应领域对象并建立完整树。
- series 已缓存但 `seasons` 为空时，通过 `getSeasons(seriesId)` 请求季列表；该响应中的 episode 同样转换后再设置到 season。
- series 已经挂载 seasons 时直接返回缓存对象，不重复请求详情。

虽然 `api/season.ts`、`api/episode.ts` 还提供按 ID 或父级查询的独立请求函数，但当前 `Season`、`Episode` 类没有静态加载入口，现有对象树统一由 `Series.getSeriesDetail()` 装配。组件不要绕过 Series 入口直接请求后塞入局部数组，否则会破坏实例 cache 和关系 bind cache 的一致性。

详情页通过 `useVideoStore().getSeriesDetail()` 获取 `Series`，将其放入浅响应容器，并通过 `DETAIL_SERIES_DATA` provide 给剧集选择等后代组件。播放时从当前 `Series -> Season -> Episode` 组合 `VideoPlayData` 交给 player store；数据实体本身不保存播放进度或播放器状态。

### 刷新策略

全量刷新 `Series.refresh()` 的流程为：取消 initialized 标记，清空 Series/Season/Episode 三类实例 cache，请求服务端重新扫描全部系列，用返回的 series ID 过滤 bind cache，重新构造 series 列表并恢复 initialized。成功结果由 `GlobalActions.vue` 通过 `refreshEmitter` 通知首页，首页按当前已加载页数替换展示数组。

单系列刷新 `Series.refreshSeries(seriesId)` 只处理目标树：如果目标已缓存，先遍历当前 seasons/episodes 删除对应子实体 cache，再删除 series cache；随后请求服务端刷新该 ID，并重新调用 `getSeriesDetail()` 完整装配。它不会清除关系 bind cache，新的 `setSeasons()` / `setEpisodes()` 会更新已有关系 ref。

刷新 API 的错误会向调用方传播，由 `GlobalActions.vue` 统一结束 loading 并显示失败消息。不要在 data 层新增另一套页面提示或悄悄保留一半刷新后的 cache；修改刷新顺序时必须同时考虑三类实例 cache、父子 bind cache 和 initialized 状态。

### 分页与搜索

`Series.getSeriesByPage(page, pageSize, keyword?)` 必须先完成全局初始化，然后对 `Series.cache` 的插入顺序数组做本地切片：起点为 `(page - 1) * pageSize`，终点为 `start + pageSize`。

传入 keyword 时只用 `title.includes(keyword)` 或 `description.includes(keyword)` 做大小写敏感的本地包含匹配，再对过滤结果分页。当前实现不请求服务端分页、不返回 total，也不额外按 `sort` 排序。`IndexList.vue` 负责递增页码、追加结果，并在空页时标记结束；搜索词变化时清空现有列表并从第 1 页重新读取。

### 字段更新与请求状态

三类领域对象同时封装字段更新 API 和字段级状态：

- `Series` 通过 `titleRef`、`imagesRef`、`descriptionRef`、`dateRef`、`typesRef`、`statusRef` 暴露各字段请求状态。
- `Season` 和 `Episode` 通过 `titleRef`、`sortRef` 暴露更新状态。
- 标题、描述、日期、图片、类型、状态和排序更新大多采用乐观更新：先修改本地 ref 并打开对应状态，请求失败则恢复旧值，最后关闭状态。
- `removeDate()` 在服务端删除成功后才清空本地日期；`removeStatus()` 先把本地状态设为 0，失败时回滚。

图片和类型的 `add/remove/set` 方法会把调用方传入数组直接作为当前本地值，同时把操作类型传给 API；调用方必须传入期望展示的完整目标数组，不能假设 data 类会在旧数组上自动拼接或删除。`updateSort()` 只更新实体的 sort 字段，不会自动重排已挂载的 seasons/episodes 数组。

读取 API 当前配置失败重试 2 次、间隔 500ms；刷新和字段写入 API 使用 `AxiosRequest.Single.PREV` 单请求策略。变更重试或并发策略时应在 API 层统一处理，领域对象继续负责响应式状态、乐观更新和回滚。

### 数据层修改约束

- 页面和组件优先通过 `useVideoStore()` 或现有领域对象方法读取/更新数据，不直接调用 API 后自行拼装另一套对象树。
- 不要直接修改 getter 返回字段或原地替换 `seasons` / `episodes`；关系更新必须调用 `setSeasons()` / `setEpisodes()` 以触发 customRef。
- 新增实体更新方法时必须提供对应请求状态，并明确采用乐观更新还是成功后更新；失败路径不得把本地值留在未确认状态。
- 修改初始化、详情或刷新逻辑后，至少验证并发初始化、首次进入详情、缓存详情、全量刷新、单系列刷新、搜索分页以及刷新后仍打开的详情视图。

## 播放器现有架构

播放器采用“状态集中、组件分层、事件向上”的结构：`stores/player.ts` 保存跨播放器组件共享的播放状态，`VideoCore.vue` 负责整体编排，`VideoPlayer.vue` 负责媒体实例，`VideoController.vue` 组合控制器，其他 `Video*.vue` 组件负责单一交互区域。不要让时间轴或控制器直接管理主 Hls 实例，也不要让 `VideoPlayer` 反向操作控制器组件。

### 状态与组件职责

- `usePlayerStore()` 是播放状态的唯一共享入口，维护当前视频与剧集信息、播放/加载状态、当前时间、总时长、缓冲范围、音量、倍速、字幕、全屏、控制器显隐及自动连播设置。
- `VideoCore.vue` 连接播放器和控制器，处理全屏、遮罩点击、控制器活动状态、音量快捷键提示及时间轴预览图，不直接处理媒体 packet 或 hls.js 事件。
- `VideoPlayer.vue` 拥有 `<video>` 与主 Hls 实例，负责视频源切换、播放状态同步、媒体事件、缓冲区同步、字幕轨道、截图、结束检测和预览图公开接口。
- `VideoController.vue` 只组合各控制组件并转发事件。共享状态通过 `playerStore` 读取，必须由父层完成的行为通过 emits 或显式暴露的方法连接。
- `VideoTimeline.vue` 负责进度、缓冲范围、hover 时间、拖拽 seek、tooltip 定位和预览图展示；它不负责生成预览图。
- `VideoEpisodes.vue` 负责剧集列表、前后剧集边界和切换；`VideoSubtitle.vue` 负责选择字幕；`VideoVolume.vue`、`VideoTime.vue`、`VideoTitle.vue` 分别负责音量、时间和标题/系统信息展示。

### Player Store 功能

`src/stores/player.ts` 定义组合式 Pinia store `usePlayerStore()`。它是播放器各组件之间的共享状态和命令入口，但不持有 DOM video 元素或 Hls 实例；媒体对象仍由 `VideoPlayer.vue` 管理。

#### 状态分组

| 分组      | 状态                                                                             | 作用                                       |
| --------- | -------------------------------------------------------------------------------- | ------------------------------------------ |
| 媒体身份  | `seriesId`、`seasonId`、`episodeId`、对应 title、`videoPath`                     | 标识当前播放资源并驱动视频源切换           |
| 播放进度  | `isPlaying`、`currentTime`、`duration`、`buffer`、`isLoading`                    | 同步播放意图、媒体时间、缓冲区间与加载状态 |
| 播放设置  | `volume`、`playbackRate`、`isAutoPlay`                                           | 控制音量、倍速和播放结束后的自动连播       |
| 字幕      | `isSubtitleTrack`、`isSubtitleTrackUseable`、`subtitleTracks`、`subtitleTrackId` | 保存字幕偏好、可用状态、轨道列表与当前选择 |
| 控制器 UI | `isControllerActive`、`isVolumeDragging`、`isFullScreen`                         | 协调遮罩显隐、音量拖动和全屏组件状态       |
| 最近访问  | `lastSeriesId`、`lastSeasonId`、`lastEpisodeId`                                  | 支持详情页恢复最近浏览位置                 |
| 播放能力  | `isSupportedHls`、`isSupportedNative`                                            | 分别表示 hls.js/MSE 和浏览器原生 HLS 能力  |

播放能力在 store 创建时探测一次：`Hls.isSupported()` 判断 hls.js 路径，临时 video 元素的 `canPlayType('application/vnd.apple.mpegurl')` 判断原生 HLS 路径。组件只读取这两个结果，不应重复维护另一份能力状态。

#### 初始化与持久化

`src/main.ts` 在应用挂载前 `await usePlayerStore().initialize()`。初始化会恢复音量、自动连播开关、字幕开关和最近 series ID；读取失败或无记录时使用 `constants.ts` 中的默认值。

`player.ts` 通过 `VideoInfoStorage` 保存两类数据：

- 全局设置：音量、自动连播、字幕开关、最近 series/season，使用独立 localStorage key 并持久保存。
- 视频分层数据：使用 `seriesId -> seasonId -> episodeId` 结构保存当前集进度、season 字幕选择和 series 下的最近剧集等字段。字段带写入时间，由 `VideoInfoStorage` 在读取时按 30 天期限清理；底层写入会合并短时间内的频繁更新。

持久化调用多数采用 fire-and-forget，UI 状态先同步更新，存储失败不应阻塞播放。新增持久化字段时必须选择正确的全局、series、season 或 episode 层级，不要把不同视频的状态写入同一个无作用域 key。

#### 设置与切换视频

`setVideo(data: VideoPlayData)` 是切换播放资源的统一入口，调用顺序和边界如下：

1. 递增 `videoRequestVersion`，写入 series、season、episode 的 ID/title 与 `videoPath`。
2. 标记字幕轨道可用，并按当前 series/season 读取之前选择的字幕轨道；没有记录时使用 `-1`。
3. 更新最近 series、season、episode 状态和对应持久化记录。
4. 暂停播放并把 duration 归零；调用方在播放器展示完成后再显式 `play()`。
5. `data.currentTime` 是有效非负数时直接 seek；未提供时读取当前 episode 保存的进度。

异步恢复 episode 进度后必须核对 `videoRequestVersion`，避免较早一次 `setVideo()` 的进度覆盖较新的切换结果。恢复记录只有在类型为有限非负数时才使用；无效记录会删除并回到 0。

`setSeriesId()`、`setSeasonId()` 更新当前 ID、对应最近访问状态并写入全局记录。`getLastSeasonId()`、`getLastEpisodeId()` 使用当前 store 中的 series/season/episode 标识创建 `VideoInfoStorage`，从 series 层读取对应记录。切换剧集必须继续通过 `setVideo()`，不能只改 `videoPath` 或单独写几个 ID。

#### 播放、进度与缓冲

- `play()`、`pause()`、`togglePlay()` 只表达播放意图并更新 `isPlaying`；真正调用 `HTMLVideoElement.play()/pause()` 的职责属于 `VideoPlayer.vue`。
- `seek(time)` 立即更新 `currentTime`。当前 series/season/episode 完整时，同时保存 episode 进度；如果已知有效 duration 且 time 到达或超过结尾，则删除进度记录。
- `clearSeekStorage()` 显式删除当前 episode 的进度，播放自然结束时由 `VideoPlayer` 调用。
- `setDuration()` 记录媒体 duration。`setBuffer(start, end)` 只接受有限数值且 `end > start` 的区间并追加到数组；它不排序、不合并区间。`resetBuffer()` 负责整体清空，通常在新 source、媒体 emptied 或重新读取 `video.buffered` 前调用。
- `setLoading()` 只更新加载状态；何时进入或退出加载由 `VideoPlayer` 的 source 和媒体事件决定。

#### 播放设置与字幕

- `setVolume()` 将有限数值限制在 `0..100`，无效值回退到默认音量，并发起持久化写入。
- `togglePlaybackRate()` 按 `PLAYBACK_RATES` 当前顺序循环，现有值为 `1 -> 2 -> 4 -> 1`；倍速当前只在会话内保存。
- `setIsAutoPlay()` 和 `setIsSubtitleTrack()` 更新全局用户偏好并持久化。
- `setSeasonSubtitleTrack(track)` 仅在 series 和 season ID 有效时更新 `subtitleTrackId`，并把选择保存到 season 层；`getSeasonSubtitleTrack()` 读取同一层级。
- `setSubtitleTracks()` 替换轨道列表并将 `isSubtitleTrackUseable` 设为 true。`resetSubtitleTrackUseable()` 只关闭可用标记，不负责清空轨道数组。

#### 控制器状态与重置

`triggerControllerActive()` 立即显示控制器，并重新安排 2 秒后的隐藏任务。`triggerControllerInactive(true)` 会取消已有定时器并立即隐藏；不传 `true` 时重新设置延迟隐藏。`clearControllerActiveTimeout(active)` 取消隐藏任务并把显隐状态固定为传入值，用于 hover 或拖拽期间保持控制器可见。`setIsVolumeDragging()` 和 `setIsFullScreen()` 分别由拖拽管理 hook 与 `fullscreenchange` 事件同步。

`reset()` 用于退出或销毁当前播放器：它暂停播放，清空当前 series/season/episode 的 ID 和标题、`videoPath`、当前时间、duration、buffer、字幕轨道列表及可用状态，取消控制器定时器并隐藏控制器，同时把 loading 恢复为 true、清空 `lastSeasonId` 和 `lastEpisodeId`。

`reset()` 当前保留全局/会话偏好和能力状态，包括 `volume`、`playbackRate`、`isAutoPlay`、`isSubtitleTrack`、`lastSeriesId`、`isSupportedHls` 和 `isSupportedNative`。它也不会直接改写 `subtitleTrackId`、`isVolumeDragging`、`isFullScreen`，这些状态分别配合字幕可用标记、拖拽管理 hook 和浏览器 `fullscreenchange` 事件使用。修改重置逻辑前必须区分“当前媒体状态”和“用户偏好”，不得因关闭一次播放器而清除持久设置。

### VideoCore 结构与交互

`VideoCore.vue` 的根节点 `.video-core` 内有两个绝对定位层：

1. `.video-player` 是底层媒体层，只承载 `VideoPlayer`。
2. `.video-mask` 是上层交互层，包含顶部 `VideoTitle`、底部 `VideoController`、右上角关闭按钮、居中播放状态图标和音量快捷键提示。

`VideoCore` 通过 `useTemplateRef()` 持有根容器、遮罩、播放器、控制器和关闭按钮引用。播放器发出的 `autoNext` 交给控制器公开的 `autoNext()`，控制器发出的截图、全屏和预览图事件则由 `VideoCore` 转给对应模块。

遮罩单击会延迟 200ms 切换播放状态，用于等待是否发生双击；双击会取消待执行的单击并切换全屏。关闭播放器前先退出全屏，再向父组件发出 `close`。调整这段逻辑时必须保留单击/双击互斥，避免一次双击同时触发播放切换。

`useVideoVolumeGesture.ts` 管理遮罩层的滚轮和单指纵向滑动手势，并把事件处理器交给 `VideoCore` 直接绑定到 `.video-mask`。向上滚动或超过阈值的上滑增加一格音量，反向操作减少一格；事件目标位于 `VideoController` 内时必须跳过，避免控制栏操作改变音量。

`useVideoControllerActivity.ts` 集中管理控制器显隐：鼠标进入或移动时激活控制器，离开播放器时立即隐藏；鼠标位于控制器或关闭按钮等 persistent target 内时保持显示。它通过 `[data-volume-slider]` 和 `[data-timeline-slider]` 识别拖拽，在全局 `pointerup`、`pointercancel`、窗口失焦及作用域销毁时结束拖拽，防止控制器在拖动过程中隐藏。

### VideoPlayer 媒体层

`VideoPlayer.vue` 只渲染一个 `<video>` 和加载遮罩。初始化时优先使用 hls.js；浏览器不支持 MSE HLS 时退回原生 HLS，二者都不可用时结束加载并报告错误。主 Hls 实例绑定 video 元素，当前配置限制前向缓冲、最大缓冲和缓冲字节，并启用 WebVTT 与 I-frame 图片缓存。

视频源由 `playerStore.videoPath` 驱动。每次切换 source 都会递增 `sourceVersion`、重置预览图和媒体状态，再生成 master m3u8 URL。异步初始化、fatal error 和预览图结果必须核对 source 版本或当前 URL，旧视频的回调不得修改新视频状态。

播放状态采用双向同步：store 的 `currentTime`、`isPlaying`、`volume`、`playbackRate`、字幕选择写入 video/Hls；video 的 `timeupdate`、`play`、`pause`、加载和错误事件写回 store。`isSyncingCurrentTime` 防止 currentTime 双向监听递归，`playRequestVersion` 防止过期的异步 `play()` 结果覆盖最新状态。

媒体 metadata 就绪前的 seek 暂存在 `pendingCurrentTime`，读取 duration 后再应用。缓冲范围从 `video.buffered` 读取，并使用单个 `requestAnimationFrame` 合并频繁同步。播放结束使用 0.25 秒阈值并通过 `endHandled` 去重；仅在自动连播开启时向上发出 `autoNext`。

`VideoPlayer` 当前通过 `defineExpose()` 暴露 `isPlay`、`shot()` 和 `getPreviewImage(time)`。新增公开接口前应确认行为确实属于媒体层，并在组件销毁时释放其关联资源。

### 控制器结构

`VideoController.vue` 顶部是 `VideoTimeline`，下方 `.video-menus` 分为左右两个 `VideoControllerSpace`：

- 左侧依次为上一集、播放/暂停、下一集、回到开头、当前时间/总时长和音量。
- 右侧依次为剧集选择、字幕选择、自动连播、倍速、截图和全屏。

时间轴拖拽状态通过 `dragging` 事件同步到 `isTimelineDragging`，拖拽期间禁用两侧区域的 tooltip 和相关 popover，避免拖动与浮层争抢交互。控制器底部保留独立的 `.tooltip-container`，全屏时 tooltip/popover 仍应挂载在播放器内部，而不是逃逸到 `body`。

`VideoControllerSpace.vue` 读取默认 slot，过滤注释节点，并按子节点的 `data-tooltip`、`data-placement`、`data-disabled` 包装 Element Plus tooltip。进入或退出全屏后，`VideoController` 会调用左右区域暴露的 `updatePoppers()` 重新计算浮层位置。

`VideoController` 暴露的 `autoNext()` 复用 `VideoEpisodes` 的边界判断和 `next()`，不能另写一套剧集索引算法。上一集、下一集按钮和快捷键也统一调用 `VideoEpisodes` 的 `prev()`、`next()`。

### 时间轴实现

时间轴由缓冲层 `.buffer`、已播放层 `.runway`、拖拽手柄 `.bar`、鼠标指针 `.pointer` 和虚拟定位 tooltip 组成。`playerStore.buffer` 的每个时间区间会转换为百分比区间；当前播放时间转换为 `runwayRatio`。所有比例都必须在 `[0, 1]` 范围内，并在 duration 无效时回退到 0。

tooltip 使用实现 `Measurable` 的 `virtualTrigger`，位置来源于鼠标和 track 的几何信息。`requestAnimationFrame` 合并 `updatePopper()`，避免每次 `mousemove` 都触发布局更新；组件销毁时必须取消尚未执行的 frame。

鼠标进入/离开 track 分别使用 100ms 防抖，降低边缘抖动。hover 或拖拽时根据 `clientX` 与 track 宽度计算目标时间，更新 tooltip、指针位置并发出 `hoverTime`；真正离开且不再拖拽时发出 `hoverEnd`。

点击轨道或拖动手柄都会调用时间轴公开的 `seek(time)`。seek 期间先暂停播放、更新本地 `currentTime`，并暂时停止从 store 覆盖本地进度；最后一次操作稳定 500ms 后才写入 `playerStore.seek()`，在下一个 tick 恢复播放和 store 同步。全局 `pointermove`、`pointerup`、`pointercancel` 和窗口失焦保证指针移出 track 后仍能正确结束拖拽。

修改时间轴时必须保持 hover 预览与实际 seek 分离：移动鼠标只能发出预览时间，只有轨道点击或手柄拖拽可以改变播放进度。缓冲范围、已播放进度、hover 时间和预览图分片范围使用同一媒体秒时间轴，但承担不同状态职责。

### 快捷键方案

快捷键分为动作、按键映射和组件处理三层：

1. `keyboard/action.ts` 的 `KeyboardAction` 定义语义动作，并用 `bindingMap` 保存每个动作当前注册的处理函数；`useKeyboardAction()` 在组件卸载时自动解除该动作。
2. `keyboard/config.ts` 的 `KeyboardConfig` 只维护物理 `KeyboardEvent.code` 到语义动作的映射。
3. `keyboard/trigger.ts` 把配置预编译为 code map。按键命中且动作已注册时才阻止默认行为和冒泡，然后调用处理函数。

`keyboard/info.ts` 负责把常见 `KeyboardEvent.code`（同时兼容 `KeyboardEvent.key`）转换为面向用户的按键文本，并通过 `$key` 模板生成快捷键文案；未知按键保留原值。

`VideoCore.vue` 是唯一的全局 `window.keydown` 入口。事件目标为输入框、编辑器等可编辑元素时必须通过 `isEditingElement()` 跳过，避免播放器快捷键干扰文字输入。

当前物理按键映射为：`Space` 播放/暂停、`KeyS` 截图、`KeyF` 切换全屏、`ArrowUp` 增大音量、`ArrowDown` 减小音量。动作处理按职责注册：

- `VideoCore.vue`：音量增减、全屏。
- `VideoPlayer.vue`：截图。
- `VideoController.vue`：播放/暂停、回到开头、倍速和自动连播。
- `VideoEpisodes.vue`：上一集和下一集。

其中回到开头、倍速、自动连播、上一集和下一集已经定义动作但当前没有物理按键映射。新增快捷键应优先复用现有动作；需要新能力时先扩展 `KeyboardAction`，再修改 `KeyboardConfig`，最后在拥有该行为的组件中注册处理函数。`bindingMap` 对每个 action 只保留一个处理函数，不得让多个同时挂载的组件竞争注册同一动作。

## 播放器预览图实现

时间轴预览图使用 hls.js 1.7 的 JPEG I-frame 图片轨道，现有调用链如下：

1. `VideoTimeline.vue` 根据鼠标位置计算 `mouseTime`，通过 `hoverTime` 发出时间；离开时间轴后发出 `hoverEnd`。tooltip 根据 `previewAvailable` 决定显示预览图与时间，还是只显示时间。
2. `VideoController.vue` 只负责向上转发 `hoverTime`、`hoverEnd`，并把 `previewSrc`、`previewLoading`、`previewAvailable` 传回时间轴，不在控制器内发起图片请求。
3. `VideoCore.vue` 使用 `useTimelinePreview()` 统一处理 hover 防抖、请求排队、分片范围复用和加载状态，在预览图流可用时才发起请求，再将状态传给控制器。
4. `VideoPlayer.vue` 在当前主清单加载后根据带 `imageCodec` 的 I-frame 变体发出预览图流可用状态，并通过 `defineExpose()` 暴露 `getPreviewImage(time)`；具体的 hls.js 图片播放器操作由 `useHlsImagePreview()` 承担。
5. `useHlsImagePreview.ts` 创建独立 `img` 元素，调用 `createImageIFramePlayer()`、`attachImage()` 和 `loadMediaAt(time)`，等待图片 `load` 后返回带有 `previewStartTime`、`previewEndTime` 的 `Promise<PreviewImage>`。

### 请求合并与缓存边界

- `useTimelinePreview.ts` 默认等待鼠标稳定 250ms 后才请求图片。
- hook 保存当前已展示图片对应的 `[previewStartTime, previewEndTime)`。鼠标仍在该分片范围内时直接复用 `previewSrc`，不重复调用 hls.js。
- 从当前分片移向其他分片时立即设置加载状态。请求执行期间只保留最新的待请求时间，并串行执行，避免快速移动造成并发堆积。
- 这里不会预取或长期保存所有分片的 URL。图片数据的底层缓存优先使用 hls.js；`VideoPlayer.vue` 当前通过 `iframeCacheLimit: 10 * 1024 * 1024` 限制其 I-frame 缓存。
- 更换 `playerStore.videoPath` 时必须让旧请求失效，不得把上一视频的异步结果显示到当前视频。

### 生命周期与清理

- `useTimelinePreview.ts` 在 source 变化和作用域销毁时执行 `reset()`：取消防抖任务、清空待请求时间和分片范围、使在途结果失效，并重置展示状态。
- `useHlsImagePreview.ts` 在视频源变化和作用域销毁时执行 `reset()`：取消当前图片加载、移除图片及 hls.js 错误监听、调用 `detachImage()` 并释放图片播放器引用。
- `useVideoVolumeGesture.ts` 不注册全局监听器；模板事件随组件卸载自动移除，hook 在作用域销毁时清空尚未结束的触摸手势状态。
- `VideoPlayer.vue` 销毁时继续负责销毁主 Hls 实例、取消动画帧并重置播放器状态。新增异步任务、监听器、定时器、对象 URL 或第三方实例时，必须在 source 切换和组件/作用域销毁的正确节点清理。

预览图功能不得改变主视频加载、TS 缓冲、字幕、播放进度、截图、快捷键或自动连播逻辑。图片轨道不可用或请求失败时只隐藏预览，不得中断主视频播放。

## Vue 组件规范

### 提取组合式逻辑

组件只保留与模板、组件事件和局部交互强关联的代码。出现可复用逻辑、独立异步流程、复杂状态协调或较多生命周期清理时，应提取为当前业务目录下的 hook；跨业务通用逻辑放入 `src/utils/`。

hook 必须明确资源所有权，并使用 `onScopeDispose()`、VueUse 自动清理能力或组件生命周期及时释放监听器、定时器、动画帧、请求、缓存引用和第三方实例。不能只提取代码而把清理责任留回组件。

### Props

`defineProps` 必须由字面量变量 `props` 接收：

```ts
const props = defineProps<{
	previewSrc?: string;
}>();
```

禁止解构 `defineProps()`，也禁止只调用而不接收结果。脚本与模板中都必须显式通过 `props.xxx` 读取属性；模板内不得直接使用属性名：

```vue
<img v-if="props.previewSrc" :src="props.previewSrc" alt="" />
```

### 模板引用

Vue 模板引用只允许使用 `useTemplateRef('ref名称')`：

```ts
const videoRef = useTemplateRef('videoRef');
```

禁止使用 `ref<类型>()` 或 `ref<类型>('')` 承接模板元素或子组件实例。普通响应式业务数据仍使用 `ref()`、`reactive()` 等 Vue API。

### 注释与复杂度

复杂异步流程、竞态处理、缓存边界、坐标或时间换算、资源清理等关键节点应及时添加中文注释。注释应解释设计原因、边界条件和不变量，不要复述代码表面动作。

脚本和样式实现都应保持克制，优先复用已有组件、hook、store、工具函数和样式 token。不要为局部需求引入过度抽象、深层嵌套或与当前架构并行的新状态链路。

## 样式与主题

- 组件样式默认使用现有 scoped SCSS、`@/scss/token.scss` 和 `sass:map` 访问主题值。
- 视觉调整应延续现有布局、间距、圆角、加载反馈和 Element Plus 使用方式，避免为单一功能增加大面积装饰、复杂动画或过多层级。
- 需要让某个模块随主题变化时，新增颜色必须先在 `src/scss/mixin/themes.scss` 的 `themes()` 中声明对应 CSS 变量，并同步加入 `$theme` 映射；组件内再通过 `map.get(token.$theme, '变量名')` 使用。
- 播放器居中音量 HUD 的背景、边框和投影分别使用 `video-volume-tip-bg`、`video-volume-tip-border`、`video-volume-tip-shadow`，各主题根据主色生成对应的半透明层次。
- 不得在组件中硬编码仅适配某一个主题的主色。新增或修改主题变量后，至少检查全部现有主题类下的可读性、对比度和切换效果。

## 兼容性与修改边界

一切修改必须保持现有功能和外部接口不变，除非需求明确要求改变。修改播放器时尤其要检查主视频播放、seek、缓冲区、字幕、音量、倍速、全屏、截图、剧集切换、自动连播和快捷键行为。

修改范围应聚焦需求涉及的组件和模块。不要顺便重构无关代码、批量改写样式或改变 store/API 契约；确需调整公共接口时，应先检查全部调用方以及 source 切换、组件销毁和异步竞态场景。

## 文档同步要求

每次修改 `web/` 内的代码、样式、配置、依赖或运行方式，都必须同步检查并维护本 `AGENTS.md`：

- 优先更新已有章节，记录当前有效的架构、职责、调用关系、生命周期和约束，不把文档写成修改日志。
- 新实现替换旧实现后，应删除或修正过时描述，不能保留互相冲突的方案。
- 纯局部实现没有改变架构结论时可以不增加条目，但必须确认本文档仍准确。
- 提交前应对照实际代码复核文档，尤其关注新增 hook 的清理方式、组件公开接口、事件流、缓存策略和主题变量。

## 验证要求

前端修改后至少执行：

1. `git diff --check -- web`，检查补丁格式和空白问题。
2. 在 `web/` 下执行 `npm run type-check`。
3. 涉及构建配置、样式资源或生产行为时执行 `npm run build`。
4. 涉及交互时手动覆盖正常状态、加载状态、失败状态、快速连续操作、视频源切换和组件销毁。
5. 涉及响应式布局或主题时检查主要桌面/移动尺寸及全部现有主题，确认没有重叠、溢出或主题失配。
