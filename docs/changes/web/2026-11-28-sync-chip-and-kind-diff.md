# 同步预览的集标签重做，集类型参与差异对比

## 问题

三个都属于「看不出来 / 改不掉」：

1. **「合并 N 集」标签几乎不可见**。胶囊铺 `d-3`、压在 `d-4` 分组底上只亮一档，配 11px 灰字，实际截图里只能看到一个模糊色块。
2. **集类型不一致时无法应用**。`diffPreview` 只比较集标题，不看 `kind`。某集标题已一致、但类型要从正片改成特别篇时，该行被判为「无变化」→ 勾选框禁用 → `apply` 永远不会提交这个 `kind`。
3. **详情页 `+ 特别篇` 悬停没有反馈**。只有原生 `title`，没有 `cursor: pointer`，也没有任何 hover 样式，看起来像不可点的装饰。

## 改动

### `kind` 进入差异对比

- `BangumiCurrentSnapshot.seasons` 新增 `episodeKinds`，`buildCurrentSnapshot()` 从领域对象填充（`BangumiSync.vue` 同步把 `episode.kind` 传进去）。
- `diffPreview()` 的集一致性改为「标题一致 **且** 类型一致」。
- `unmatched` 视为一致：这类集没对上官方剧集，`buildApplyInput` 不提交 `kind`，本地原值不变。

### 标签可视化

`PreviewStep.vue` 的四个标签改成「小圆角 + 实线描边 + 同色低透明底」，靠色相区分语义：

| 标签                  | 语义               | 配色                          |
| --------------------- | ------------------ | ----------------------------- |
| 合并 N 集             | 这个文件覆盖了多集 | 主题色描边 + 20% 底、`l-9` 字 |
| 特别篇                | 静态分类           | 琥珀 `#e8b268`                |
| 标为特别篇 / 改回正片 | 勾选后会变         | 同琥珀，边框与底更实          |
| 未匹配                | 未对上官方剧集     | 红 `#ff8f8f`                  |

类型标签文案由 `kindLabel()` 决定：正片且本地也是正片时不渲染，避免整列重复。

### 悬停反馈

`DetailSeason.vue` 的 `.kind` 加 `cursor: pointer`、`user-select: none`，并补两层 hover：

- 正片态：虚线 → 实线、`l-4` 边框、`d-2` 底、`l-9` 字；
- 特别篇态：压暗到 `l-2` 边框 + `l-7` 字，表示「点了会改回去」。

`transition` 覆盖 opacity / border-color / background-color / color，位移为 0。

## 踩到的坑

`map.get(token.$theme, 'primary')` 返回的是 **`var(--theme)`**，不是色值。对它调用 `color.change()` 会让 Sass 直接报 `$color: var(--theme) is not a color`，整个详情页白屏——但 `vitest` 不编译 SCSS，单测和类型检查都不会发现。

透明主色只能用原生 `color-mix(in srgb, var(--theme) 20%, transparent)`。改动涉及 SCSS 时必须跑一次 `pnpm --filter web build` 或起 dev server 看编译。

## 验证

- 单测新增两例：标题一致但类型不同判为有变化；`unmatched` 视为一致。
- CDP 夹具实测（纯 mock，不碰本机媒体库）：
    - 预览渲染出 4 个「合并 3 集」、1 个「标为特别篇」、2 个「未匹配」；第 5 集标题与本地一致、仅类型不同，`disabledChecks: 0`，可勾选应用。
    - 详情页 `.kind` 三段状态实测：未悬停 `opacity: 0 / dashed`；悬停卡片 `opacity: 1 / dashed`；悬停标签 `solid + 底色 + l-9 字 + cursor: pointer`。
- 全量 46 文件 455 例通过，`vue-tsc`、`vite build`、`check-undefined` 均干净。
