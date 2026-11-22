# 首屏加载：全局遮罩与资源加载顺序

## 职责边界

本模块负责回答两件事：

1. 打开应用后到「首页列表可用」之间发生了什么，哪一段在等网络、哪一段在等 JS；
2. 全量系列数据还在请求、或路由分包脚本还在下载时，用户看到的是什么（全局遮罩）。

不负责：具体的过滤/排序逻辑（见 [index-filter.md](index-filter.md)）、详情页播放器初始化（见 `web/AGENTS.md` 的播放器章节）、服务端的目录扫描细节（见 `server/data/series.ts`）。

## 首屏链路

```text
index.html
  └─ main.ts（挂载应用，入口 chunk 约 90KB）
       ├─ App.vue（布局 + 全局遮罩 GlobalLoading）
       │    └─ onBeforeMount → videoStore.initialize() → Series.initialized() → GET /data/series
       └─ 路由懒加载首页 chunk → IndexList / SeriesCard 渲染卡片
```

关键点：

- **入口不再等待播放器偏好**。`main.ts` 先 `app.mount()`，再以 `void ... .catch()` 的方式读取音量、自动连播、字幕开关。这些字段在 store 里都是响应式的，读取完成后自动同步到界面，因此不需要为了它们推迟首帧。
- **播放器库不进首屏**。`stores/player.ts` 会被入口引用，一旦在顶层 `import Hls from 'hls.js'`，近 600KB 的播放器库就会跟着进入首屏产物。能力探测改由 `@/utils/hls-support` 复刻 `Hls.isSupported()` 的判定，真正的 `hls.js` 实例只出现在详情页的 `VideoPlayer.vue` 里。
- **遮罩由请求状态驱动**。`Series.isLoading` / `Series.isInitialized` 透传到 `videoStore.loading` / `videoStore.initialized`，`App.vue` 用 `loading && !initialized` 判断是否显示首屏遮罩。
- **只有一层遮罩**。`components/common/GlobalLoading.vue` 是唯一的遮罩实现，`App.vue` 只传 `visible` 与 `tip`，两个来源（数据加载 / 路由切换）共用同一层，不会出现两层遮罩叠在一起。

## 路由切换遮罩

视图组件按路由分包，详情页带着整块播放器代码（约 800KB）。首次进入时要先下载脚本，这段时间页面停在旧视图上没有任何反馈，会被当成「点了没反应」。`router/loading.ts` 为此提供状态：

- `loadingGuard(router)` 在 `beforeEach` 里启动一个 `ROUTE_LOADING_DELAY`（120ms）的延迟定时器，`afterEach` 与 `onError` 立即收起；
- 延迟是为了不让「本来就很快」的切换闪一下遮罩；连续导航时后一次 `beforeEach` 会重置定时器；
- `onError` 用于分包下载失败：导航不会正常结束，不收起遮罩就会永久盖住页面；
- 遮罩文案优先级：首屏数据未就绪 → 「正在加载视频数据…」；否则路由切换中 → 「正在加载页面…」。

`createRouteLoadingTracker()` 之所以拆成工厂函数，是为了脱离 vue-router 单测「延迟未到不显示 / 快速切换不闪 / 连续导航只算最后一次 / 收尾清定时器」这些行为（`test/web/route-loading.test.ts`）。

## 状态与失败处理

`Series.initialized()` 内部用 `useVueStatusRef('loading', 'initialized')` 记录状态，请求失败时走 `catch` 分支提示 `ElMessage`，随后仍执行 `initialize.offLoading()`。因此：

- 请求失败 → 遮罩随 `loading` 关闭而消失，页面回到「空列表 + 错误提示」，不会永久卡在遮罩上；
- 请求成功 → `onInitialized()` 置位，`initialized` 为真，后续即使再次刷新也不会再出现首屏遮罩；
- 并发调用 `initialize()` 时复用 `globalWaitPromise`，遮罩不会闪两次。

## 关键约束

- **禁止在入口链路直接引入 `hls.js`**：包括 `main.ts`、`App.vue`、`stores/*`、`utils/*`。能力判断只能用 `@/utils/hls-support`；播放器相关的组件可以引入。
- **入口不要 `await` 非首屏必要的初始化**。判断标准：这个数据如果晚 200ms 到达，界面是否会显示错误的值？会（例如鉴权、主题）就等待，不会（音量、自动连播、上次播放进度）就不要等待。
- **遮罩必须能被关闭**。任何新增的「加载中」判断都要保证请求或导航结束（成功、失败、被取消）后状态收敛，不允许出现只有打开没有关闭的分支。
- **路由切换一律走 `loadingGuard`**：新增布局级路由跳转（例如全屏预览、设置页）不需要另写监听，只要它在 `src/views` 下由文件路由生成，就会自动纳入遮罩；但不要绕过 router 用 `location.href` 跳转，那会整页刷新、退出 SPA。

## 服务端扫描优化

首次 `GET /data/series` 的耗时主要花在对每个系列目录做一次初始化（读数据文件、扫描图片目录）。现在的实现：

- `mapWithConcurrency` 以 8 路并发初始化系列，结果顺序仍与目录顺序一致（`server/src/utils/concurrency.ts`）；
- 系列初始化内部的四个校验（数据文件许可、目录存在、目录类型、目录许可）改为 `Promise.all` 并行；
- `Common.isAllowedDirectory()` 使用的「已解析真实根目录」按目录配置快照缓存，配置通过 `set/add/del/sortDirectories` 变更时主动失效（`server/data/common.ts`）。

本地 20 部临时片库冷启动实测：`/data/series` 从约 110ms 降到约 42ms。

## 已知限制

- 遮罩没有超时兜底。接口长时间不返回时遮罩会一直显示，用户只能刷新；如果后续出现「请求挂死」的反馈，应在请求层加超时而不是给遮罩加定时器。
- 首屏只做了「去掉播放器库」这一刀。`element-plus` 仍按需引入（`ElementPlusResolver`），构建产物里入口 chunk 约 90KB，继续压缩需要拆分首屏组件，收益小于改造成本，暂不处理。

## 验证方式

1. 体积：`cd web && npx vite build`，检查入口 chunk 不再引用含 `hls` 的 chunk（`grep -l hls dist/assets/*.js` 应只剩详情页 chunk）。
2. 首屏：无头 Chrome（CDP）清缓存后打开首页，记录第一张卡片出现的时间与 `.global-loading` 是否出现过；用 `Fetch.enable` 卡住 `/data/series` 可以确认遮罩文案是「正在加载视频数据…」。
3. 路由切换：CDP 限速（约 120kbps）+ 禁用缓存后点击卡片，300ms 左右应出现「正在加载页面…」，导航完成后遮罩消失；`Network.setCacheDisabled` 用于避免分包命中缓存导致测不到。
4. 遮罩视觉：`Network.emulateNetworkConditions` 加 1200ms 延迟后截图，确认遮罩覆盖整页、图标与文案居中、背景可见模糊。
5. 播放器：进入任一详情页并点开一集，确认 `<video>` 拿到 `blob:` 源、`master.m3u8` 请求正常、控制台无报错。
6. 服务端：直接 `curl` 冷启动后的 `/data/series`（先重启 server 进程）观察耗时。
