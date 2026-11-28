# Web 前端开发约定

## 项目概览

`web/` 是基于 Vue 3、TypeScript 和 Vite 的前端应用，主要依赖 Pinia、Vue Router、Element Plus、VueUse 与 hls.js。应用入口为 `src/main.ts`，页面由 `src/views/` 下的文件路由生成，播放器实现集中在 `src/video/`。

主要目录职责：

- `src/api/`：按业务领域封装服务端请求，公共响应处理位于 `src/api.ts`（含 CSRF 请求头注入）。
- `src/components/`：通用组件及详情、侧边栏等业务组件。
- `src/data/`：业务数据访问和组合逻辑。
- `src/events/`：跨模块事件定义。
- `src/keyboard/`：播放器快捷键声明、注册和触发逻辑。
- `src/stores/`：Pinia 状态；播放器状态以 `stores/player.ts` 为中心。
- `src/utils/`：可复用且不属于组件的工具与组合式逻辑。
- `src/video/`：播放器、控制器、时间轴、字幕及其专用 hooks。
- `src/views/`：由 `vue-router/vite` 生成路由的页面组件。
- `src/scss/` 与 `src/assets/`：主题变量、设计 token、全局样式及组件样式基础。

路径别名沿用现有配置：`@/` 指向 `src/`，`~shared/`、`~types/` 分别指向仓库根目录的共享模块。路由配置通过 `~shared/server-route-config`、`~shared/web-route-config` 导入，系列状态和类型枚举通过 `~shared/series-status`、`~shared/series-types` 导入；`shared/config-parser.ts` 依赖 Node，不能导入浏览器运行时代码。Vue、Vue Router、Pinia、Element Plus 的常用 API 已由 Vite 自动导入，新代码应先遵循当前导入方式，不要重复建立另一套入口。

## 系列、季、集数据方案

`src/data/` 将服务端 DTO 转为带响应式状态、实例缓存和更新方法的领域对象。类型契约来自 `~types/videos`，请求函数位于 `src/api/series.ts`、`season.ts`、`episode.ts`，`stores/video.ts` 只作为页面访问数据层的薄封装，不重复保存实体列表。

### 数据模型与职责

| 类        | 核心字段                                                                                                                                | 子级关系              | 可编辑字段                                   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------- |
| `Series`  | `id`、`path`、`name`、`title`、`images`、`description`、`date`、`types`、`status`、`mergedIds`、`mergedSeasonOrder`、`mergedImageOrder` | `seasons: Season[]`   | 标题、图片、描述、日期、类型、状态、合并关系 |
| `Season`  | `id`、`sort`、`path`、`title`                                                                                                           | `episodes: Episode[]` | 标题、排序                                   |
| `Episode` | `id`、`sort`、`path`、`extension`、`title`                                                                                              | 无                    | 标题、排序                                   |

三类对象的可编辑字段统一保存在 `values` 映射中（`{ [K in keyof DTO]: Ref<DTO[K]> }`，每个字段一个 `ref()`），对外通过 getter 暴露，因此组件读取 `series.title`、`season.episodes` 等普通属性时仍会建立响应式依赖。字段名只在 `values` 定义和构造时的 DTO 赋值中各出现一次。`id`、路径、目录名和扩展名当前没有前端更新方法，应视为服务端扫描结果和实体身份，不要在组件中直接改写。

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

### 分页、搜索与本地查询

`Series.getSeriesByPage(page, pageSize, keyword?, query?)` 必须先完成全局初始化，再取 `Series.cache` 的插入顺序数组交给 `utils/seriesQuery.ts` 的 `applySeriesQuery()` 完成关键词匹配、过滤与排序，最后用 `paginateSeries()` 本地切片。

- 关键词只匹配 `title` 与 `description`，比较前统一 `toLocaleLowerCase()`，因此大小写不敏感；接口不参与搜索。
- `query` 携带 `sortMode`、`types`、`statuses`、`dateRange`，全部在前端本地生效，服务端只提供全量数据。
- 默认 `sortMode` 为 `date`：月份倒序、同月按名称升序、无上线时间的条目排在最后；`name` 模式下整体按拼音名称排序。
- `Series.querySeries()` 返回过滤排序后的完整列表，`Series.getAllSeries()` 返回未过滤的全量列表（供时间轴构建刻度），二者同样先完成初始化。
- `IndexList.vue` 负责递增页码、追加结果，并在空页时标记结束；关键词（`keyword` prop）或过滤条件变化时清空现有列表并从第 1 页重新读取，且用请求版本号丢弃过期响应。
- 搜索是独立路由 `/search/:keyword`（`views/search/[keyword].vue`），关键词走路径参数，刷新与分享都能还原结果；输入框的跳转方式由 `utils/search.ts` 的 `planSearchNavigation()` 决定（搜索页内 `replace`、其它页面 `push`、清空后回首页），搜索页卡片以 `replace` 打开详情，返回不会回到搜索页。
- 卡片是 `components/index/SeriesCard.vue`，首页与搜索页共用，`replace` 属性控制 `router-link` 是否替换历史记录。

首页过滤与排序的组件分层、状态持久化与时间轴交互见 `docs/modules/web/index-filter.md`，搜索路由与卡片复用见 `docs/modules/web/search.md`；`shared/` 下的类型枚举与状态枚举同时作为过滤选项的数据源，新增类型或状态时不需要改前端过滤组件。

### 字段更新与请求状态

三类领域对象同时封装字段更新 API 和字段级状态：

- `Series` 通过 `titleRef`、`imagesRef`、`descriptionRef`、`dateRef`、`typesRef`、`statusRef` 暴露各字段请求状态。
- `Season` 和 `Episode` 通过 `titleRef`、`sortRef` 暴露更新状态。
- 标题、描述、日期、图片、类型、状态和排序更新大多采用乐观更新：先修改本地 ref 并打开对应状态，请求失败则恢复旧值，最后关闭状态。
- 乐观更新统一由 `data/common.ts` 的 `patchField(values, status, key, next, commit, settle?)` 完成；字段状态由 `createStatus()` 按键创建，`titleRef` 等 getter 返回布尔值并在读取时建立响应式依赖，组件用法保持不变。
- 标题的 `settle` 固定传 `serverTitle`：标题允许清空，服务端会还原为默认标题（系列目录名、季目录名、文件名去扩展名）并返回实际标题，本地乐观写入的空串必须用返回值覆盖，不能停留在空白标题上。
- `removeDate()` 在服务端删除成功后才清空本地日期；`removeStatus()` 先把本地状态设为 0，失败时回滚。
- 上线时间用 `el-date-picker-panel`（`type="month"`），它的 `modelValue` 只认 `Date`：`DetailDate.vue` 必须经 `utils/date.ts` 的 `toMonthDate()` 把 `[年, 月]` 转成 `Date`。直接传元组会被 dayjs 解析成 Invalid Date，选中的月份不会高亮，面板打开时也不会定位到记录的年月。

图片和类型的 `add/remove/set` 三个方法语义与服务端接口一致，本地乐观值按同一语义计算后再发请求：`add` 在现有值上追加（`utils/series.ts` 的 `mergeUnique()` 去重并保留顺序）、`remove` 从现有值中剔除入参项、`set` 直接覆盖。调用方只传本次增删的项，不要自己先拼出目标数组。类型与图片的追加在服务端也是幂等的，重复提交已存在的项不会写出重复记录。

图片方法的入参是绝对路径（与 `series.images` 一致），发请求前会经 `getSeriesImageName(directory, image)` 转成系列目录内的文件名：服务端图片接口只接受文件名，直接传绝对路径会因二次拼接而查不到文件并被静默过滤。返回值仍以绝对路径写回 `images`，调用方无需自行转换。`updateSort()` 只更新实体的 sort 字段，不会自动重排已挂载的 seasons/episodes 数组。

季与集的拖拽排序遵循同一套约定：以 `updateSort()` 的布尔返回值判断服务端是否成功，成功后对同容器其余项调用 `syncSort()` 对齐本地 `sort`，再通过 `series.setSeasons()` / `season.setEpisodes()` 回写关系数组；列表必须先复制为本地镜像，不能把 `series.seasons` / `season.episodes` 直接交给拖拽库。

合并组的顺序不能走 `updateSort()`：`updateMergedSeasonOrder()` / `updateMergedImageOrder()` 接收**完整顺序**（季 id、图片绝对路径），服务端会把各系列自己的 `sort` 重编为子序并用返回值纠正本地值；它们同样走 `patchField()` 的乐观更新与失败回滚。仅用于本地对齐的方法只有 `syncSort()`、`syncImages()`，两者都不发请求。`useDraggable` 必须显式传 `clone: (item) => item`：库默认用 JSON 深拷贝被拖拽项，而领域对象内部持有 `Ref`（循环引用）会在 `onStart` 抛错并让失败快照失效。实现细节见 `docs/modules/web/detail-episode-sort.md` 与 `docs/modules/web/detail-season-sort.md`。

读取 API 当前配置失败重试 2 次、间隔 500ms；刷新和字段写入 API 使用 `AxiosRequest.Single.PREV` 单请求策略。变更重试或并发策略时应在 API 层统一处理，领域对象继续负责响应式状态、乐观更新和回滚。

### 数据层修改约束

- 页面和组件优先通过 `useVideoStore()` 或现有领域对象方法读取/更新数据，不直接调用 API 后自行拼装另一套对象树。
- 不要直接修改 getter 返回字段或原地替换 `seasons` / `episodes`；关系更新必须调用 `setSeasons()` / `setEpisodes()` 以触发 customRef。
- 新增实体更新方法时必须提供对应请求状态，并明确采用乐观更新还是成功后更新；失败路径不得把本地值留在未确认状态。
- 修改初始化、详情或刷新逻辑后，至少验证并发初始化、首次进入详情、缓存详情、全量刷新、单系列刷新、搜索分页以及刷新后仍打开的详情视图。

## 首页过滤与排序

首页的过滤与排序全部在前端本地完成，状态集中在 `stores/indexFilter.ts`，判定规则集中在 `utils/seriesQuery.ts` 与 `utils/timeAxis.ts`（纯函数，均有单元测试）：

- `IndexFilterBar.vue` 是底部固定高度的容器：左侧切换过滤方式（标签 / 状态 / 时间），中间是当前方式对应的过滤组件，右侧切换排序方式（上线时间 / 名称）。两个分段选择器上方各有 `group-label` 说明筛选/排序的是什么。
- 标签与状态共用 `IndexFilterOptions.vue`（多选标签组），选项直接来自 `~shared/series-types`、`~shared/series-status`；标签超过一行时默认只显示一行，悬浮才向上浮出完整标签。
- 时间过滤由 `IndexFilterDate.vue`（内联刻度条 + 固定宽度操作位 + 文字「清除」按钮）与 `IndexTimeAxis.vue`（连续月份刻度、收起态波形概览、悬浮展开完整面板、拖动划选、滚轮缩放）组成，划选逻辑在 `useTimeAxisSelection.ts`。
- 时间轴维护**可见窗口** `AxisWindow { start, count }` 并只渲染窗口内月份：不要改回原生横向滚动，也不要硬编码刻度宽度（宽度 = `可视区宽度 / count`）。缩放用 `zoomAxisWindow()`（锚点为鼠标位置）、平移用 `panAxisWindow()`，两者都必须收敛在数据范围内。
- 拖动必须保留 `setPointerCapture` 与 `pointerdown.preventDefault()`：否则浏览器会接管拖拽手势，出现「按下没反应 / 拖不出选区」；拖到可视区外沿时由 `onAutoPan` 按帧平移窗口。
- 当前时间范围文案在收起态必须**贴着选区块浮动**（轴上方 2px，`bandTipStyle()` 负责选区靠右时改右对齐，避免溢出），不能再挤到过滤栏右侧占用轴宽；未筛选时才回退成右侧「全部时间」。右侧操作位固定 52px（未筛选放「全部时间」文字、筛选后换成「清除」文字按钮），切换筛选状态不能让时间轴重新分格或刻度跳动，也不能在轴与操作位之间留出没有刻度的空档。
- 清除按钮用文字而不是图标，配色只用中性白描边 + 主题亮色文字与 `rgba(#fff, …)` 背景，不要在组件里复制某套主题的具体色值。
- `IndexList.vue` 的月分割线是深色背景上的提示层：细线与文字都必须亮于背景（当前 `l-5` 线条与数量、`l-6` 月份标题），不要用 `d-*` 深色梯度。
- 收起态柱体只能用白色半透明（选中月份纯白、空档月份更淡），不要用 `d-*` 深色：过滤栏底衬是浅紫半透明，深色柱体会被看成一道脏黑条纹。收起态也不需要深色轨道，靠一条 `rgba(#fff, 0.2)` 基线定位即可。
- `IndexList.vue` 按 `sortMode` 决定渲染片段：按上线时间时用 `groupSeriesByMonth()` 展开成「通栏分割线 + 该月卡片」，按名称时是平铺列表，此时不渲染分割线。
- 过滤栏使用 `position: sticky` 贴在滚动容器底部，时间轴与标签展开时向上溢出并盖住列表，都不改变列表区域的高度；新增过滤组件时同样不能把布局撑开。
- 过滤栏的 `z-index` 必须高于卡片内部的所有层级（`.link` 10、`.drop-target::after` 30、`.merge-badge` 40，当前 100）：`.series-card` 没有自己的层叠上下文，这些子元素的层级会直接与外层比较，过滤栏给太小就会被滚到底部的卡片盖住。同时不能高过拖拽浮层（2600）与 `el-popover`，否则浮层和成员面板会被压到下面。

状态写入 `localStorage`（键见 `config/constants.ts` 的 `INDEX_FILTER_STORAGE_KEY`），刷新页面后保持上次选择；读取时对过滤方式、排序方式、数组与时间范围逐项校验，脏数据回退到默认值。规则细节、状态流与已知限制见 `docs/modules/web/index-filter.md`。

## 首页系列合并

合并把同一作品散落的多个系列聚合成一个入口：拖动一张卡片压到另一张上松手，后者成为**主系列**，前者从列表消失并作为叠层首图留在主系列卡片背后；主系列的详情页会把自己的季与被合并系列的季拼接展示。**不搬迁文件、不搬迁季**，`mergedIds` 只影响展示。

- 合并关系只有一个数据源：主系列的 `mergedIds`（有序数组），成员不保存反向引用。数组顺序既是叠层顺序也是详情页季分组顺序，属于语义数据。
- 可测规则集中在 `utils/seriesMerge.ts`（纯函数）：`buildMergeOwnerIndex()`、`excludeMergedMembers()`、`getGroupMembers()`、`getMergeCovers()`、`getMergeRejection()`；用例在 `test/web/series-merge.test.ts`。
- **卡片封面与叠层都按合并组的最终图片顺序取**：`getMergeCovers()` 先拼「主系列 + 成员」再应用 `mergedImageOrder`，`cover` 是整组第一张（可能属于成员），`covers` 是每个成员在该顺序里的首图。不能退回 `series.images[0]`：用户把成员图片拖到最前后，详情页换了首图而列表页不动。拖拽浮层的海报用同一个值（`coverOf()`）。
- `IndexList.vue` 必须同时持有**全量** `allSeries` 与列表用的 `querySeries` 结果：成员被排除出列表后，叠层仍需要它的标题与首图。
- 拖拽实现在 `components/index/useSeriesDrag.ts`，四阶段 `idle / drag / drop / return`，只做「卡片 → 卡片」的搬运，不接通用拖拽库（其占位与镜像机制会和翻转、飞入、边缘滚动冲突）。
- 卡片海报是原生 `<img>`，按下后移动会先触发浏览器图片拖拽并吞掉后续 `pointermove`；CSS `-webkit-user-drag: none` 与捕获阶段拦截 `dragstart` 两道都要保留。
- **详情页的海报与季一样按合并关系拼接**：`displayImages` 把主系列图片放在前、成员图片按 `mergedIds` 顺序追加，再应用主系列的 `mergedImageOrder`，最后交给 `DetailImage`。三个要点：系列图片对外是绝对路径（服务端按各自目录拼好），跨系列直接拼接即可；合并只发生在展示层，不写回 `images` 字段，脱离后成员图片自然消失；合并组的显式顺序由 `orderMergedImages()` 统一收敛，与服务端共用 `shared/series-order.ts`。
- **首图不能在成员加载过程中重算**：主系列与成员是两次请求，`displayImages` 走的是 `orderDisplayImages()`——`pending` 期间（有成员但未就位）直接用主系列记录的 `mergedImageOrder` 占位，没有显式顺序则用主系列图片。若只按已加载的部分合成，首帧是主系列第一张、成员到达后跳成真正的首图。
- **合并组的季与图片可以跨系列拖拽排序**：季标题手柄不再因合并而隐藏。`commitSeasonSort()` 按是否合并分流——单系列仍提交「移动到第 N 位」，合并组提交**完整顺序**给 `PUT /data/series/:id/merge/seasons`；写入成功后 `syncGroupSeasons()` / `syncGroupImages()` 把全局顺序拆回主系列与每个成员（`syncSort()` + `setSeasons()` / `syncImages()`），保证脱离后各系列自己的顺序等于合并时看到的子序。
- 图片排序入口在海报右上角（多图才出现），打开 `DetailImageManage.vue` 面板；面板只做拖拽与保存，写入通过 `commit` 回调交给详情页，合并组走 `PUT /data/series/:id/merge/images`（绝对路径数组），单系列走既有的 `images/set`。
- 浮层与叠层动画细节、命中检测前提、已知限制见 `docs/modules/web/series-merge.md`。

## 详情页文本编辑

`components/common/TextEditor.vue` 是唯一的文本编辑组件，`showEditIcon` 默认 `false`：默认不渲染内置图标，由外层提供更稳定的编辑入口，需要内联编辑时才显式开启。`hideEditIcon` 用于强制隐藏图标，配合 `v-model:editing` 暴露的编辑态，外层可以在「进入编辑或保存中」把入口收起来、保存完成后再显示。

- 系列标题：详情页顶部标题（`views/[seriesId]/[name].vue`）内联使用 `TextEditor` 并开启 `showEditIcon`，图标字号单独收敛到正文尺寸；标题清空后由服务端还原为系列目录名。
- 剧情简介：编辑按钮在「剧情简介」标题右侧（`DetailDescription.vue`），通过组件暴露的 `edit()` 触发，不再跟随段落文本移动；按钮用 `editing || status.modifyDescription` 控制显隐，编辑与保存期间图标隐藏。
- 季标题、集标题：`DetailSeason.vue` 内联使用 `TextEditor` 并开启 `showEditIcon`。两者都嵌在可点击区域里（折叠面板头部、点击即播放的集卡片），因此只在 `[contenteditable="true"]` 时阻止点击冒泡，非编辑态的展开与播放行为保持不变。
- 四个入口都遵循同一写入流程：本地 trim → 调用领域对象 `updateTitle()` / `updateDescription()`（乐观更新 + 失败回滚）→ 由数据层的请求状态驱动加载态。组件内不直接调用 API。
- 空值语义见根 `AGENTS.md`「可编辑文本字段的空值语义」：**标题为空恢复默认标题、描述为空清空描述，组件不得拦截空值提交**，也不要自行计算默认标题。

## 全局对话框

弹窗统一走 `utils/dialog` 的 `openDialog()`，返回 Promise：内容组件 `confirm(data)` 时 resolve，取消、右上角、Esc、路由切换时 reject（`DialogCanceled`）。实现细节与清理点见 [docs/modules/web/dialog.md](../docs/modules/web/dialog.md)。

- **内容永远是组件**：`openDialog({ component, componentProps, dialogProps, title })`。页面里不再出现「打开状态」布尔值和关窗后的 `reset()`，状态随应用销毁一起释放。
- 内容组件通过 `dialog` 属性拿控制器：`confirm` / `cancel` / `setButtons` / `closable` / `unclosable`。页脚按钮按当前状态**整组替换**（`setButtons`），不要逐个显隐——两步流程的按钮集合完全不同，逐个开关最容易漏掉残留。
- 对话框挂在一个**独立的应用**里：拿不到主应用的 `provide`、没有路由，需要的数据在打开时作为属性传进去；Pinia 用 `stores/pinia.ts` 的共享实例，其余 `el-*` 组件与 `v-loading` 由编译期解析，不受影响。
- 关闭动效结束后 `unmount()` 并移除容器。**卸载前必须调 `releaseDevtoolsApp()`**：Devtools 会为每个应用在 `window.__VUE_DEVTOOLS_KIT_PLUGIN_BUFFER__` 压一条记录，卸载不会自动清，每条都抓着应用与组件树，反复开合会让浏览器内存持续上涨。
- `router.afterEach` 统一 `closeAllDialogs()`：对话框不在路由树里，切页不收会盖住新页面。调用方必须 `catch` 掉取消，把「用户取消」与「真的失败」分开。
- 只保留当前用得到的控制面。需要 `getRef`、运行时改 `el-dialog` 属性时再按需扩展，不要先建一套通用 API。

## 详情页 Bangumi 同步

`components/detail/BangumiSync.vue` 只是详情页标题行右侧的入口（打开对话框 + 处理结果），对话框内容拆在 `components/detail/bangumi-sync/`：`SyncDialog.vue`（步骤条、两步面板与页脚）、`MatchStep.vue`、`PreviewStep.vue`，流程与派生状态在 `useBangumiSync.ts`。对接服务端 `POST /data/series/:id/bangumi/{match,preview,apply}` 三段接口，接口与推断规则见 `docs/modules/server/bangumi-sync.md`，面板自身的流程、差异规则与布局约束见 `docs/modules/web/bangumi-sync.md`，变更记录见 `docs/changes/web/2026-11-27-bangumi-sync-ui.md`。

- **打开对话框不检索**：面板先显示说明（这次会检索哪些季、含哪些合并系列），点「开始同步」才发 `match`。`match` 会请求 Bangumi 并可能调用模型，点开就发不可接受；`describeSyncFooter()` 的 `started: false` 分支只给「取消 / 开始同步」。
- 对话框分两步：第一步确认「本地季 → Bangumi 条目」的对应（AI 已给出建议，可改可清空），第二步逐项确认要写入的系列字段、季标题、集标题与整体重排。`apply` 只在第二步点确认后调用一次。
- **同步范围是合并组**：服务端按 `mergedIds` 把成员的季一起纳入 `match` / `preview`，`apply` 按 `seasonId` 跨系列写回；前端快照用 `buildCurrentSnapshot(series, 成员季)` 装配，漏掉成员季会让它们永远判成「有变化」。成员季的 `path` 由服务端加上「系列名 / 季目录名」前缀，界面上才分得清两个同名的「正片」。
- **前端不做任何推断**：不解析文件名、不猜集号、不重排。预览里的顺序由服务端给出，前端只按预览顺序把集 id 拼成 `order`。
- 可测逻辑集中在 `utils/bangumiSync.ts`（纯函数）：`orderSeasonsBySuggestion()` 稳定排序、`buildSeasonMapping()` 去重并生成 preview 入参、`diffPreview()` 逐项对比、`createSelection()` 默认勾选、`buildApplyInput()` 生成 apply 入参、`summarizeSelection()` 统计写入数量、`buildCurrentSnapshot()` 生成对比快照、`describeSelectionSummary()` 页脚汇总文案、`describeSyncFooter()` 两步各自的按钮状态。组件只把状态接到这些函数上，用例在 `test/web/bangumi-sync.test.ts`。
- 默认勾选只包含「一定能写且确实有变化」的内容：空标题、空描述、无日期、无状态、无类型的字段都不勾；`diffPreview()` 判定与当前完全一致的项同样不勾并禁用勾选框，同时显示「与当前一致」。**预览缺字段不算「一致」**，否则「没解析出来」会被当成「已经同步过」。
- `order` 必须是该季全部集的一个排列，无法按集部分勾选，因此它对应季级别的「按预览顺序重排 N 集」一个开关，只有一集时默认关闭；预览顺序与当前顺序逐位相同时禁用并提示「顺序已一致」。
- 剧集列表必须**纵向单列、每项两行**（标题、文件名各一行）。横向两列的 `1fr` 等价于 `minmax(auto, 1fr)`，会被最长不可断词撑破容器，是「列表把对话框撑宽」的真实原因。
- 系列描述**完整多行展示**，不做 JS 截断，用 `white-space: pre-wrap` 保留原文分段；多行文本不加删除线，靠「当前 / 改为」标签区分。
- `matching / previewing / applying` 期间禁止关闭：内容组件调 `dialog.unclosable()` 同时关掉右上角、Esc 与点击遮罩，「取消」「上一步」的禁用由 `describeSyncFooter()` 一并算出。否则响应会写回已卸载的视图。`match` 失败也**不**自动关闭，保留空态让用户就地重试。
- 写入成功后由入口调用 `refreshSeries()` 重新扫描装配，并用返回的新 `Series` 实例整体替换详情页的 `series.value`；不要逐字段打补丁，标题、排序、季与集都可能变化。
- `apply` 失败保留对话框与勾选状态。请求失败的提示统一由 `api.ts` 拦截器给出，组件内不重复 `ElMessage`。
- 样式写在各自的 scoped 块里（内容组件在自己的作用域内，不需要再挂到 `.el-dialog` 下）；只有 `el-select` 下拉面板这类 teleport 到 `body` 的内容保留非 scoped 块。组件主题（底色、描边、三级文字、选中态）由 `src/assets/elements/` 统一提供，见 `docs/modules/web/element-theme.md`。
- **未配置时隐藏入口**：`AiSettingsCard` / `BangumiSettingsCard` 对应服务端 `ai.configured` 与 `bangumi.configured`，详情页用 `settingsStore.syncAvailable` 控制 `v-if`。判断只做在详情页一处，不要在 `BangumiSync.vue` 内部再放第二套兜底。

## 设置页

设置页是**左侧菜单 + 嵌套路由**结构，不是单页堆卡片：

| 路由 / 名称                                  | 文件                           | 内容                                                                      |
| -------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------- |
| `/setting`（`Setting`）                      | `views/setting.vue`            | 布局：标题、左侧分组菜单、`<router-view>`；重定向到 `/setting/appearance` |
| `/setting/appearance`（`SettingAppearance`） | `views/setting/appearance.vue` | 外观：主题色板                                                            |
| `/setting/player`（`SettingPlayer`）         | `views/setting/player.vue`     | 播放器：默认音量、自动连播、字幕开关                                      |
| `/setting/ai`（`SettingAi`）                 | `views/setting/ai.vue`         | AI 接口                                                                   |
| `/setting/bangumi`（`SettingBangumi`）       | `views/setting/bangumi.vue`    | Bangumi                                                                   |

- 分组菜单由 `setting.vue` 的 `groups` 定义：**「通用」放本机偏好（外观、播放器），「外部服务」放需要凭据的第三方接口**；新增分组往 `groups` 加一项即可，模板不变。窄屏（≤760px）菜单变横向标签行。
- 分组内容拆到 `components/setting/`：`SettingSection`（面板外壳 + 说明 + 生效值摘要 + 操作条）、`SettingField`（字段行）、`SettingAdvanced`（进阶参数折叠）、`AppearanceCard`、`PlayerSettingsCard`、`AiSettingsCard`、`BangumiSettingsCard`，探测文案规则在 `useProbe.ts`。页面只负责布局与路由，不要把表单写回页面模板。
- **左基线统一**：标题、说明、摘要、字段标签都从面板内边距起排。面板头部不放图标块——图标会把标题整体右移，与下面的字段列形成两条竖线。`SettingField` 的标签列固定 116px，说明文字落在控件下方而不是标签列里。
- **文字样式必须显式声明 `line-height`**：`line-height: normal` 的行盒高度由实际命中的字体决定，纯拉丁文案（`User-Agent`）比中文文案的行盒矮约 3px，多列并排时同一行的文字就会错开基线。设置模块统一走 `scss/mixin/text.scss` 的 `text($size, $line-height, $color)`，字号与行高成对给出，不要手写 `font-size` 后漏掉行高；颜色仍由调用方传表达式（固定色如成功绿不能少）。
- `SettingSection` 的可用状态用 `stateLabel` / `stateOk` 两个 prop，不用布尔 props 控制显隐：Vue 会把未传的 `Boolean` 转成 `false`，外观、播放器这类没有可用性概念的分组会平白多出一个「未配置」标签。
- `SettingAdvanced` 用原生 `button` + `el-collapse-transition`，不用 `el-collapse`：后者在深色面板上是一条通栏横线，没有 hover 反馈、箭头也不转。箭头在标题右侧，展开时旋转 90°，状态用 `useVueStatusRef('open')`。
- 数据层：`api/settings.ts`（`GET/PUT /data/settings`、两个 probe）与 `stores/settings.ts`（`view` / `syncAvailable` / `ensure()` / `save()`）。详情页首次进入调用 `ensure()`，并发请求共用同一个 Promise；加载中状态用 `useVueStatusRef`，store 不再维护重复的布尔值。
- **密钥永不回填明文**：视图只有 `hasApiKey` 与 `apiKeyMasked`，UI 提供「替换 / 清除」两个显式动作，输入框只在替换态出现；补丁构造在 `utils/settings.ts`（`buildAiPatch` / `buildBangumiPatch`），只提交实际变化的字段，空值的「替换」不提交，避免误清空。
- **面板内表单控件走变体类**，不在页面覆盖 `--el-*`：`el-input--panel`（近黑半透明底 + 1px 描边，占位色压到 34% 白，与实值区分）、`el-input-number--panel`（116px 定宽、`align="left"`、按钮透明底 + 细分隔线）、`el-slider--panel`。默认输入框的 `--el-input-bg-color` 是主色混 10% 白，在深色面板上是一块亮砖，不要直接复用。
- 数字框必须用组件自带的 `align="left"`：Element 的 `.el-input-number.is-center .el-input__inner` 特异性高于普通类选择器，只在 CSS 里写 `text-align` 会被压掉。
- 外观分组读 `config/theme.ts` 的 `THEME_OPTIONS` 渲染色板，`color` 必须与 `scss/mixin/themes.scss` 的 `$themes` 一致（`test/web/theme-storage.test.ts` 会比对两处并校验亮度）；主题持久化在 `utils/themeStorage.ts`，用同步 `localStorage`（异步存储会让首帧闪一下默认配色），读取时用 `parseTheme` 校验枚举值。`stores/theme.ts` 清 class 必须遍历枚举**值**，`for..in` 拿到的是字符串枚举的键。
- **主题基色决定整页亮度**：页面背景是「黑 + 基色」的渐变（`themes.scss` 里 `color.mix(#000, $color, 5%…50%)`），基色亮度上去了整页就是一块发光的糖果色。四个非紫主题的基色亮度要压到星夜紫 `#7b61ff` 的 ±15% 以内（WCAG 相对亮度 ≈ 0.19–0.22），变暗靠降明度/饱和度而不是往基色里兑灰，否则色相会发脏。
- 播放器偏好直接读写 `stores/player.ts`（`setVolume` / `setIsAutoPlay` / `setIsSubtitleTrack`），不另建状态：设置页与播放器共享同一份值，改动即时生效并写入本机存储。

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

`hls.js` 只能在详情页链路引入。`stores/player.ts` 被应用入口引用，其中的 HLS 能力探测必须用 `@/utils/hls-support`（复刻 `Hls.isSupported()` 的判定），禁止在 store、入口或通用工具里 `import Hls from 'hls.js'`，否则近 600KB 的播放器库会进入首屏产物。细节见 [docs/modules/web/first-load.md](../docs/modules/web/first-load.md)。

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

## 首屏加载与全局遮罩

全量系列数据请求期间与路由切换（分包脚本下载）期间，都显示同一个全屏遮罩：`components/common/GlobalLoading.vue`。文案由 `App.vue` 计算——首屏数据未就绪显示「正在加载视频数据…」，否则路由切换中显示「正在加载页面…」。

约束：

- 入口链路（`main.ts`、`App.vue`、`stores/*`、`utils/*`）不得引入 `hls.js`，能力探测统一用 `@/utils/hls-support`。
- 入口不要 `await` 非首屏必要的初始化。播放器偏好（音量、自动连播、字幕开关）在挂载后异步读取，字段是响应式的，晚到不影响正确性。
- 任何新增的「加载中」状态都要保证请求或导航成功、失败、被取消后都能收敛，不允许出现只打开不关闭的分支。路由切换的状态统一由 `router/loading.ts` 的 `loadingGuard` 维护（120ms 延迟 + `afterEach`/`onError` 收起），不要在组件里另写一套。
- 遮罩只允许一层：新增加载来源时合并到 `GlobalLoading` 的文案判断里，不要新加固定定位的全屏层。

首屏链路、失败处理、服务端扫描优化与实测数据见 [docs/modules/web/first-load.md](../docs/modules/web/first-load.md)。

## 路由与滚动位置

主滚动容器是 `App.vue` 里常驻的 `el-scrollbar`（`.el-scrollbar__wrap`），**不是 `window`**：`.container` 与 `.main` 都是 `overflow: hidden`。这决定了滚动恢复只能自己做。

- **vue-router 的 `scrollBehavior` / `savedPosition` 对本项目无效**：其实现最终只调 `window.scrollTo()`，`{ el, top }` 里的 `el` 也只是「滚到该元素」，不会去改元素内部的 `scrollTop`。不要为了用它改成让 window 滚动——固定头部与 sticky 过滤栏都依赖当前结构。
- 位置记忆在 `router/scroll.ts`：`beforeEach` 存、`afterEach` 取，key 用 `history.state.position`。同一路径会被多次访问，按 `fullPath` 记会把不同次访问串在一起。
- **不能用 `history.state.position` 判断「要离开的页面」**：后退时浏览器已经把 history 切到目标页，`beforeEach` 读到的就是目标页的序号，保存动作会把要恢复的值覆盖成 0。用 `currentPosition` 跟踪上一次导航结束时的序号。
- 恢复要 `await nextTick()` 之后再做；内容还没渲染够高时 `scrollTop` 会被截断，`restore()` 会逐帧重试（上限 20 帧）。
- 同一序号换了地址（replace，如搜索页跳详情）不算回退：删掉该序号的记录并回到顶部。
- **`afterEach` 必须先判 `failure`**：vue-router 对重复导航（已在首页再点侧边栏「首页」）、被守卫取消的导航也会调 `triggerAfterEach`，这时历史记录没变，跟着恢复位置等于把用户刚滚到的位置拉回去。这类导航应当什么都不做。
- 回到顶部按钮是 `components/common/BackToTop.vue`，固定在右下角 `bottom: 88px`——首页底部有高 62px、距底 5px 的过滤栏，留 21px 间距才不会压到它。显示阈值 400px 在 `App.vue` 的 `BACK_TO_TOP_THRESHOLD`，滚动量由 `el-scrollbar` 的 `scroll` 事件提供。
- 容器由 `App.vue` 挂载后经 `setScrollTarget()` 注入，直接写原生 `wrap.scrollTop`：同步生效并照常派发 `scroll` 事件；实例的 `setScrollTop` 是异步的，逐帧重试会读不到刚设进去的值。
- **首页必须被缓存**：`<keep-alive :include="[WebRoute.INDEX]">` 按组件名严格比较，而 `<script setup>` 默认用文件名推断出 `index`，因此 `views/index.vue` 显式 `defineOptions({ name: WebRoute.INDEX })`。不匹配时后退会重建列表、分页回到第一页，翻到第 N 页的位置就再也恢复不了。

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

**不要给 `useTemplateRef` 传泛型参数**：类型由 `vue-tsc` 从模板里对应的元素或组件自动推断，手写的泛型只是在覆盖真实类型，容易写错（把组件实例写成 `HTMLElement`、把 `SVGPathElement` 写成 `Element`），也会让后续模板改动不再被类型检查发现。

```ts
// 正确
const listRef = useTemplateRef('listRef');

// 禁止
const listRef = useTemplateRef<ComponentPublicInstance>('listRef');
const path = useTemplateRef<SVGPathElement>('path');
```

### 标签闭合

`<slot>` 必须写显式闭合标签，禁止自闭合；其余标签按组件处理，无子内容时用自闭合：

```vue
<!-- 插槽：必须闭合 -->
<slot></slot>
<slot name="footer"></slot>

<!-- 禁止 -->
<slot />
<slot name="footer" />

<!-- 组件：自闭合 -->
<component :is="icon" />
<Transition name="fade"><div></div></Transition>
<Refresh />
<SeriesCard :series="series" />
<el-input v-model="form.baseUrl" />
```

只有 `slot` 受此约束：它是内容分发占位，不是组件实例，写成 `<slot />` 时插槽边界和「漏写闭合的标签」在模板里无法区分。`component`、`transition` 这类内置组件以及自定义组件、Element Plus 组件都用自闭合，补成 `<Refresh></Refresh>` 只是噪音。HTML void 元素（`img`、`br`、`input` 等）与 SVG 自闭合图形（`path`、`circle` 等）本来就没有闭合形式。

检查方式（仓库根目录执行，非零退出即有违规）：

```powershell
node scripts/check-vue-tags.mjs
```

### 注释与复杂度

复杂异步流程、竞态处理、缓存边界、坐标或时间换算、资源清理等关键节点应及时添加中文注释。注释应解释设计原因、边界条件和不变量，不要复述代码表面动作。

脚本和样式实现都应保持克制，优先复用已有组件、hook、store、工具函数和样式 token。不要为局部需求引入过度抽象、深层嵌套或与当前架构并行的新状态链路。

## 样式与主题

- 组件样式默认使用现有 scoped SCSS、`@/scss/token.scss` 和 `sass:map` 访问主题值。
- 样式必须以尽可能少的代码实现目标效果：优先复用现有容器结构、已有类、Element Plus 能力和主题 token，不新增装饰性过渡、阴影、渐变、多层包裹或仅用一次的类。出现“为了好看”而增加的样式一律视为过度设计。
- 只有当现有 DOM 结构无法承载交互或布局时，才允许新增元素或类；新增前先确认能否用现有选择器、属性选择器或样式复用完成。
- 视觉调整应延续现有布局、间距、圆角、加载反馈和 Element Plus 使用方式，避免为单一功能增加大面积装饰、复杂动画或过多层级。
- 需要让某个模块随主题变化时，新增颜色必须先在 `src/scss/mixin/themes.scss` 的 `themes()` 中声明对应 CSS 变量，并同步加入 `$theme` 映射；组件内再通过 `map.get(token.$theme, '变量名')` 使用。
- 播放器居中音量 HUD 的背景、边框和投影分别使用 `video-volume-tip-bg`、`video-volume-tip-border`、`video-volume-tip-shadow`，各主题根据主色生成对应的半透明层次。
- 不得在组件中硬编码仅适配某一个主题的主色。新增或修改主题变量后，至少检查全部现有主题类下的可读性、对比度和切换效果。
- Element Plus 的组件适配集中在 `src/assets/elements/`（一个组件一个文件，`elements.scss` 汇总登记），页面与业务组件只写布局、不再覆盖 `--el-*` 变量；滚动区域统一用 `el-scrollbar`，不使用原生滚动条。职责划分、`d-*`/`l-*` 变量语义与三个权重陷阱见 `docs/modules/web/element-theme.md`。

## 兼容性与修改边界

一切修改必须保持现有功能和外部接口不变，除非需求明确要求改变。修改播放器时尤其要检查主视频播放、seek、缓冲区、字幕、音量、倍速、全屏、截图、剧集切换、自动连播和快捷键行为。

修改范围应聚焦需求涉及的组件和模块。不要顺便重构无关代码、批量改写样式或改变 store/API 契约；确需调整公共接口时，应先检查全部调用方以及 source 切换、组件销毁和异步竞态场景。

## 文档同步要求

每次修改 `web/` 内的代码、样式、配置、依赖或运行方式，都必须同步检查并维护本 `AGENTS.md`：

- 优先更新已有章节，记录当前有效的架构、职责、调用关系、生命周期和约束，不把文档写成修改日志。
- 新实现替换旧实现后，应删除或修正过时描述，不能保留互相冲突的方案。
- 纯局部实现没有改变架构结论时可以不增加条目，但必须确认本文档仍准确。
- 提交前应对照实际代码复核文档，尤其关注新增 hook 的清理方式、组件公开接口、事件流、缓存策略和主题变量。
- 同一次改动还必须在 `docs/changes/web/` 新增变更记录、更新 `docs/changes/INDEX.md`；子功能细节超过约 40 行说明时写入 `docs/modules/web/`，本文件只保留摘要和链接。规范见 `docs/changes/README.md`。

## 验证要求

前端修改后至少执行：

1. `git diff --check -- web`，检查补丁格式和空白问题。
2. 在 `web/` 下执行 `npm run type-check`。
3. 涉及构建配置、样式资源或生产行为时执行 `npm run build`。
4. 修改过模板时，在仓库根目录执行 `node scripts/check-vue-tags.mjs`，确认没有自闭合的 `<slot>`（见「标签闭合」）。
5. 涉及交互时手动覆盖正常状态、加载状态、失败状态、快速连续操作、视频源切换和组件销毁。
6. 涉及响应式布局或主题时检查主要桌面/移动尺寸及全部现有主题，确认没有重叠、溢出或主题失配。
7. 在仓库根目录执行 `pnpm exec vitest run`，新增或修改的逻辑必须有对应用例（见根 `AGENTS.md` 的「测试用例要求」）。
8. 以上全部通过后，按根 `AGENTS.md` 的「提交时机」立即提交这一批改动，不得留到下一批功能开发后再一起提交。

纯逻辑（过滤、排序、分组、时间换算等）必须先抽到 `src/utils/` 下的纯函数模块并补测试，再写组件；测试放在仓库根目录 `test/web/`，以普通对象作为输入，不依赖 DOM、Pinia 或网络。组件只负责把状态接到这些函数上，避免把可测逻辑埋进模板事件里。
