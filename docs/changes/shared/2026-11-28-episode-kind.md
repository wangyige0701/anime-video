# 集类型（正片 / 特别篇）落库并可在详情页切换

- 日期：2026-11-28
- 模块：shared
- 类型：功能

## 现象

「特别篇」只存在于 Bangumi 同步预览里：预览行有 `特别篇` 标签，关掉弹窗就没了。集数据结构只有 `id / sort / path / extension / title`，详情页的剧集卡片无法区分正片与 SP，同步写回的也只有标题。

## 改动

### 字段

`types/videos.d.ts` 的 `Episode` 新增 `kind: EpisodeKind`（`'main' | 'special'`），类型与工具函数放 `shared/episode-kind.ts`，前后端共用。

历史配置没有该字段，读取时按 `main` 补齐（`resolveEpisodeConfig`），因此：

- 旧 `.video.json` 不需要迁移，首次读取即得到 `kind: 'main'`；
- 前端 `Episode` 构造时也做一次兜底，避免接口缺字段时界面出现空标签。

### 接口

新增 `PUT /data/episode/:episodeId/kind`，参数 `{ kind: 'main' | 'special' }`，返回服务端实际值。

遵循项目「一个字段一个端点」的约定，没有并入标题或排序接口。`episodeKindSchema` 用 `z.enum` 卡住取值，非法值在进入数据层前被拒。

### 同步写入

`applyChangeSet` 的 `episodes[]` 增加可选的 `kind`：与标题一起写在同一个循环里，传了才写。好处是：

- 官方把某一集标成特别篇时，标题与类型一起落到集上；
- 前端只为勾选的集提交，未勾选时 `kind` 缺省，不会把用户手改过的类型覆盖回官方值。

`buildApplyInput` 对 `unmatched` 的集只写标题——它们没有对应到官方剧集，谈不上分类。

### 详情页交互

集卡片「第 N 集」这一行右侧加一个胶囊标签：

- 正片：默认隐藏，悬停卡片显示 `+ 特别篇`（虚线边框），点击标为特别篇；
- 特别篇：常驻显示 `特别篇`（实线亮边），点击恢复正片；
- 两者宽度接近，悬停时不跳变；请求期间 `pointer-events: none` 并降透明度。

标签必须 `@click.stop`：卡片整体点击是播放。

样式取舍：一开始用主题色文字配浅底，在暗色主题下 10px 的字与底色同族、几乎读不出来（CDP 放大 4 倍确认）。改为亮色文字 + 实线描边 + 比卡片底再亮一级的底色，正片态用虚线灰字，靠「实线/虚线」区分而不是靠颜色。

## 验证

- `server/test/video.test.ts`：DTO 键集合包含 `kind`，历史配置读取为 `main`。
- `test/server/bangumi-merge-scope.test.ts`：`applyChangeSet` 带 `kind` 时调用 `updateKind`，缺省时不调用。
- `test/web/bangumi-sync.test.ts`：特别篇集提交时带 `kind: 'special'`，未匹配的集只提交标题。
- CDP 实测（纯夹具拦截 `/data/*`，不触碰本机媒体库）：3 张卡片中 1 张显示「特别篇」、另两张悬停显示「+ 特别篇」；点击特别篇标签发出 `PUT /data/episode/e2/kind`，标签随即变回「+ 特别篇」，`.kind--special` 数量归零。截图确认字体与胶囊尺寸不再像按钮。

## 影响面

- 集数据多一个字段，接口 DTO 与前端类型同步变更；旧数据无需迁移。
- 集类型只影响标注与同步分类，不参与排序：集在季内的位置仍由文件名顺序与拖拽结果决定。
- 批量同步时，只有勾选了集标题的行会连带写入类型；只勾选重排不会触碰类型。
