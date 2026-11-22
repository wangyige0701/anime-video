# 首屏加载遮罩与加载性能优化

- 日期：2026-11-22
- 模块：web
- 类型：性能
- 涉及模块：web、server

## 背景

首次打开页面时，首页列表要等 `GET /data/series` 返回才渲染，这段时间页面只有布局骨架，用户看到的是「空白列表突然被填充」。同时实测首次加载明显偏慢，需要定位瓶颈：

- 前端：入口 `index-*.js` 静态引用了 `player-*.js`（627.8KB），后者包含整个 `hls.js`；
- 服务端：`/data/series` 冷启动约 110ms（20 部临时片库），系列目录串行初始化，权限判断反复 `realpath`。

## 目标与取舍

1. 全量数据请求期间显示全局遮罩，明确「正在加载视频数据」。
2. 把 `hls.js` 从首屏链路移出，只在详情页按需加载。
3. 入口不再等待播放器偏好读取。
4. 服务端首次扫描并发化，并缓存已解析的真实根目录。

取舍：

- **遮罩不加超时兜底**。请求挂死时遮罩会一直显示，用户只能刷新；但如果给遮罩加定时器，反而会掩盖请求层缺超时的问题。请求层的超时属于独立改动，本次不混入。
- **不做更激进的拆包**。`element-plus` 已是按需引入，入口 chunk 约 90KB，继续拆分首页组件收益小于改造成本。
- **保留 `playerStore.isSupportedHls` 的语义**。它表示「能否用 hls.js 播放」，改用 `@/utils/hls-support` 复刻 `Hls.isSupported()` 的判定，调用方（`VideoPlayer.vue`、`VideoCore.vue`）无需修改。

## 涉及文件

| 文件                              | 改动                                                   | 原因                             |
| --------------------------------- | ------------------------------------------------------ | -------------------------------- |
| `web/src/App.vue`                 | 新增全局遮罩节点与过渡样式，`initializing` 计算属性    | 首屏加载提示                     |
| `web/src/stores/video.ts`         | 导出 `loading` / `initialized`                         | 遮罩状态来源                     |
| `web/src/data/series.ts`          | 新增 `isLoading`                                       | 暴露请求中状态                   |
| `web/src/utils/hls-support.ts`    | 新增，复刻 `Hls.isSupported()` 的轻量能力探测          | 避免入口引入 `hls.js`            |
| `web/src/stores/player.ts`        | 移除顶层 `import Hls`，改用 `isHlsSupported()`         | 切断首屏对播放器库的依赖         |
| `web/src/main.ts`                 | 先 `mount` 再异步读取播放器偏好                        | 入口不再阻塞首帧                 |
| `server/src/utils/concurrency.ts` | 新增 `mapWithConcurrency()`                            | 固定并发上限执行异步任务         |
| `server/data/series.ts`           | 系列目录 8 路并发初始化，`initialize()` 的四个校验并行 | 缩短冷启动耗时                   |
| `server/data/common.ts`           | 真实根目录按配置快照缓存，配置变更时失效               | 减少重复 `realpath` 系统调用     |
| `test/web/hls-support.test.ts`    | 新增 12 条用例                                         | 覆盖 MSE/SourceBuffer/编码分支   |
| `test/server/concurrency.test.ts` | 新增 6 条用例                                          | 覆盖并发上限、顺序保持与参数校验 |

## 实现要点

### 全局遮罩

`initializing` = `videoStore.loading && !videoStore.initialized`。`Series.initialized()` 在 `catch` 之后仍会执行 `initialize.offLoading()`，因此请求失败时遮罩关闭、列表回到空状态并保留 `ElMessage` 错误提示，不会永久卡死。遮罩为 `position: fixed; inset: 0; z-index: 2000`，使用 `loading-bg` 主题变量与 `backdrop-filter: blur(4px)`，并以 0.25s 淡入淡出过渡。

### 首屏资源

`stores/player.ts` 被 `main.ts` 引用，原先顶层 `import Hls from 'hls.js'` 使 `hls.js` 进入入口依赖图。改为 `@/utils/hls-support` 的 `isHlsSupported()` 后：

- 入口 chunk 从「17.2KB + 引用 627.8KB 的 player chunk」变为 90.4KB 单文件；
- `hls.js` 只出现在详情页 chunk（`_name_-*.js`，834KB，首次进入详情页才下载）。

`main.ts` 由 `await usePlayerStore().initialize()` 改为挂载后 `void ... .catch()`。`VideoPlayer.vue` 对 `playerStore.volume`、`isAutoPlay`、`isSubtitleTrack` 都是响应式监听，晚到的偏好会正常同步，播放行为不变。

### 服务端扫描

`mapWithConcurrency(items, 8, worker)` 保证结果顺序与入参一致；`Series.getAllSeries()` 先过滤出目录与符号链接，再并行初始化。`Common.isAllowedDirectory()` 原来对每个系列、每张图片都重新 `realpath` 所有根目录，现在按 `directories.join('\n')` 作为快照键缓存，`set/add/del/sortDirectories` 保存后主动失效。

## 实测数据

生产构建（`vite build` 产物 + 本地静态服务，CDP 清缓存冷启动）：

| 指标                      | 改造前                              | 改造后                |
| ------------------------- | ----------------------------------- | --------------------- |
| 首卡片出现                | 173ms                               | 186ms                 |
| 首屏 JS（入口 + runtime） | 约 717KB（含 627.8KB 播放器 chunk） | 约 163KB              |
| `hls.js` 所在 chunk       | 首屏                                | 详情页（834KB，按需） |

loopback 下 627KB 的下载几乎不耗时，所以毫秒数差异在噪声范围内；收益体现在需要真实下载的体积上。

开发服务器（冷缓存）：首卡片 749ms → 532ms，资源耗时前八名不再包含 `hls__js.js`。

服务端：`/data/series` 冷启动 110ms → 42ms（20 部临时片库）。

## 行为变化与兼容性

- 首屏新增全屏遮罩，加载期间不可交互（此前可以点击空布局）。遮罩在 `initialized` 后不再出现，后续刷新不重复遮挡。
- 播放器偏好在应用挂载后才读取。挂载瞬间音量等内容是默认值（`DEFAULT_VOLUME = 100`），读取完成后立即同步；不会写入错误的持久化值。
- `playerStore.isSupportedHls` 仍是布尔量，调用方无需改动。
- 服务端接口格式、目录配置方式与缓存失效时机不变；`isAllowedDirectory()` 的判定结果与改造前一致，只是改为使用缓存。

## 验证

- `npx vitest run test/web test/server`：5 个文件 69 条用例全部通过（含新增 `hls-support` 12 条、`concurrency` 6 条）。
- `cd web && npx vue-tsc --build`、`npx vite build` 通过；`grep -l hls dist/assets/*.js` 只剩详情页 chunk。
- 无头 Chrome 实测首页：遮罩出现且随后消失，卡片正常渲染；限速 1200ms 截图确认遮罩覆盖整页、图标与文案居中、背景模糊。
- 详情页实测：点开一集后 `<video>` 拿到 `blob:` 源并请求 `master.m3u8`，控制台无报错，说明按需加载的 `hls.js` 行为正常。

## 关联文档

- `docs/modules/web/first-load.md`
- `web/AGENTS.md`：`### VideoPlayer 媒体层`、`## 首屏加载与全局遮罩`
