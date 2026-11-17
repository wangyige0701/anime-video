# 变更索引

> 新增记录后，把行插入表格最上方。字段含义与维护规则见 [README.md](README.md)。

| 日期 | 模块 | 类型 | 标题 | 主要文件 | 记录 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-17 | web | 修复 | 季/集拖拽手柄热区放大并修复拖拽起始异常 | `web/src/components/detail/DetailSeason.vue`、`web/src/views/[seriesId]/[name].vue` | [2026-11-17-drag-handle-hit-area](web/2026-11-17-drag-handle-hit-area.md) |
| 2026-11-17 | server | 修复 | 排序写入后接口顺序滞后与二次拖拽空转 | `server/data/series.ts`、`server/data/season.ts`、`server/data/episode.ts` | [2026-11-17-sort-order-cache-sync](server/2026-11-17-sort-order-cache-sync.md) |
| 2026-11-17 | web | 功能 | 详情页季支持拖拽排序 | `web/src/views/[seriesId]/[name].vue`、`web/src/components/detail/DetailSeason.vue`、`web/src/data/season.ts` | [2026-11-17-season-drag-sort](web/2026-11-17-season-drag-sort.md) |
| 2026-11-17 | web | 功能 | 详情页剧集支持拖拽排序并显示季级加载状态 | `web/src/components/detail/DetailSeason.vue`、`web/src/data/episode.ts`、`web/package.json` | [2026-11-17-episode-drag-sort](web/2026-11-17-episode-drag-sort.md) |
| 2026-11-17 | web | 文档 | 样式修改必须以最少代码实现 | `web/AGENTS.md`、`web/src/components/detail/DetailSeason.vue` | [2026-11-17-minimal-style-rule](web/2026-11-17-minimal-style-rule.md) |
| 2026-11-17 | shared | 文档 | 依赖变更必须通过 pnpm 命令执行 | `AGENTS.md` | [2026-11-17-dependency-command-rule](shared/2026-11-17-dependency-command-rule.md) |
| 2026-11-17 | shared | 文档 | 建立变更记录与模块文档规范 | `docs/changes/README.md`、`docs/modules/README.md`、根 `AGENTS.md`、`web/AGENTS.md` | [2026-11-17-docs-convention](shared/2026-11-17-docs-convention.md) |
