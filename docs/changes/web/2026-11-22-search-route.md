# 搜索改为独立路由并复用首页卡片

- 日期：2026-11-22
- 模块：web
- 类型：功能
- 涉及模块：web、shared

## 背景

搜索此前复用首页：关键词写在 `?keyword=`，`IndexList` 自己监听 `route.query.keyword` 并把结果替代首页列表。这带来三个问题：

1. 搜索结果与首页共用同一个路由，刷新之后「搜索结果」和「首页」无法区分，也无法把一次搜索分享出去；
2. 首页过滤栏（标签/状态/时间 + 排序）会作用在搜索结果上，语义混乱；
3. 从搜索结果点进详情后，浏览器返回会回到搜索页，而用户期望回到搜索之前的页面。

同时卡片模板只存在于 `IndexList.vue` 内部，搜索页要展示同样的卡片只能复制模板。

## 目标与取舍

1. 新增 `/search/:keyword` 路由，关键词走路径参数，刷新、分享、前进后退都能还原。
2. 把卡片抽成 `SeriesCard.vue`，首页与搜索页共用，新增 `replace` 属性控制 `router-link` 是否替换历史记录。
3. 跳转规则抽成纯函数 `planSearchNavigation()`：搜索页内 `replace`（不堆积历史）、其它页面 `push`（可返回）、清空后回首页。

取舍：

- 搜索页没有沿用首页的过滤栏。搜索本身已经是一次筛选，再叠加标签/时间过滤会让「为什么结果这么少」难以解释；过滤能力仍留在首页。
- 搜索页不进 `keep-alive`。复用实例会让不同关键词共享旧列表与旧页码，代价高于重新拉取一页数据。
- 没有保存搜索历史，也没有把关键词写入 localStorage：路径参数已经让「刷新还原」成立，额外持久化反而会出现「地址与列表不一致」。

## 涉及文件

| 文件                                      | 改动                                                                    | 原因                   |
| ----------------------------------------- | ----------------------------------------------------------------------- | ---------------------- |
| `shared/web-route-config.ts`              | 增加 `WebRoute.SEARCH`                                                  | 前后端共用的路由名常量 |
| `web/src/views/search/[keyword].vue`      | 新增搜索结果页                                                          | 独立路由与关键词展示   |
| `web/src/utils/search.ts`                 | 新增 `planSearchNavigation()`                                           | 可单测的跳转判定       |
| `web/src/components/common/Search.vue`    | 改为按计划跳转，监听路径参数                                            | 输入框与路由同步       |
| `web/src/components/index/SeriesCard.vue` | 从 `IndexList.vue` 抽出卡片                                             | 首页与搜索页复用       |
| `web/src/components/index/IndexList.vue`  | 使用 `SeriesCard`，新增 `keyword` / `replace` props，移除读查询串的逻辑 | 关键词改由调用方传入   |
| `test/web/search-navigation.test.ts`      | 新增 6 条用例                                                           | 覆盖跳转分支           |

## 实现要点

- **路由参数即状态**：`Search.vue` 的输入框用 `computed` 读 `router.currentRoute.value.params.keyword` 并 `immediate` 同步，不再维护第二份搜索状态。
- **历史长度可控**：实测在搜索页继续输入时 `history.length` 保持 3 不变（`replace` 生效）；从首页进入搜索是 `push`，因此可以返回首页。
- **详情返回不回搜索页**：`SeriesCard` 的 `replace` 透传给 `router-link`，历史从「首页 → 搜索 → 详情」变成「首页 → 详情」。实测详情页 `history.back()` 落回 `/`。
- **首页与搜索解耦**：`IndexList` 不再读 `route.query`，关键词只来自 prop，首页不传即为空，过滤栏只作用于首页。
- **标题带关键词**：搜索页在关键词变化时调用 `route.meta.setTitle?.()`，标题为 `<关键词> - 搜索`。

## 行为变化与兼容性

- 旧的 `/?keyword=xxx` 链接不再触发搜索。该形式只在内部输入框里出现过，没有对外文档与收藏依赖；如需兼容可在首页路由上做一次重定向，本次未实现。
- `IndexList` 的 props 由 `pageSize` 扩展为 `pageSize`、`keyword`、`replace`，默认值保证首页调用方不需要修改。
- 卡片 DOM 结构不变（根节点仍是 `router-link`），样式从 `IndexList.vue` 迁移到 `SeriesCard.vue`，栅格布局依赖的 `min-width: 0` 一并迁移。

## 验证

- `pnpm exec vitest run test/web`：3 个文件 51 条用例通过，其中 `search-navigation.test.ts` 覆盖 push、replace、trim、清空回首页、非搜索页空关键词、缺失路由名。
- `cd web && npx vue-tsc --build` 与 `npx vite build` 通过。
- 无头 Chrome 实测：首页输入「迷宫」→ 地址 `/search/%E8%BF%B7%E5%AE%AB`，结果 2 张卡片；继续输入后 `history.length` 不变；点开第一张进入详情（`/548591.../系列20`），`history.back()` 回到 `/` 且首页 20 张卡片正常。

## 关联文档

- `docs/modules/web/search.md`
- `web/AGENTS.md`：`### 分页、搜索与本地查询`
