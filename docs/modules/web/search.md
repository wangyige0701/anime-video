# 搜索结果页与卡片复用

## 1. 职责边界

本模块负责「输入关键词 → 独立的搜索结果页 → 详情页」这条链路：

- 搜索关键词只走 URL 路径参数，不写入 store，也不落到本地存储。
- 查询仍然由 `utils/seriesQuery.ts` 的 `applySeriesQuery()` 在前端本地完成，服务端只提供全量数据。
- 卡片样式与详情跳转由 `SeriesCard.vue` 承担，首页与搜索页共用。

不负责：跨页搜索状态保持（搜索页不进入 `keep-alive`）、搜索历史、服务端检索。

## 2. 分层与文件

| 层次     | 文件                              | 职责                                                                          |
| -------- | --------------------------------- | ----------------------------------------------------------------------------- |
| 路由     | `views/search/[keyword].vue`      | 搜索结果页，读取 `:keyword` 并渲染列表                                        |
| 路由常量 | `shared/web-route-config.ts`      | `WebRoute.SEARCH`                                                             |
| 跳转规则 | `utils/search.ts`                 | `planSearchNavigation()`：push / replace / 回首页的纯函数判定                 |
| 输入框   | `components/common/Search.vue`    | 输入、防抖、中文输入法组合态，调用跳转规则                                    |
| 卡片     | `components/index/SeriesCard.vue` | 卡片模板与样式，`replace` 控制 `router-link` 是否替换历史                     |
| 列表容器 | `components/index/IndexList.vue`  | 分页加载、月分割线、刷新同步，通过 `keyword` / `replace` 两个 prop 适配搜索页 |

## 3. 数据流

```text
用户输入（300ms 防抖，组合输入期间跳过）
  → planSearchNavigation(当前路由名, 输入内容)
      ├─ 空 + 已在该页 → { kind: index }  → router.replace({ name: Index })
      ├─ 空 + 其它页面 → null             → 不跳转
      ├─ 搜索页        → { kind: search, replace: true }  → router.replace(/search/:keyword)
      └─ 其它页面      → { kind: search, replace: false } → router.push(/search/:keyword)
  → 路由 params.keyword 变化 → Search.vue 的 keyword → IndexList 的 keyword prop
  → watch(props.keyword) → reload()：页码归 1、清空列表、请求第 1 页
  → Series.getSeriesByPage(page, size, keyword, filter.query)
```

要点：

- **路径参数是唯一数据源**：输入框的初始值来自 `route.params.keyword`（`immediate`），刷新、直接打开链接、前进后退都由路由驱动，不额外维护一份搜索状态。
- **标题带关键词**：`route.meta.setTitle` 在关键词变化时改写为 `<关键词> - 搜索`，多标签页可区分。
- **详情跳转替换历史**：搜索页的卡片带 `replace`，历史记录从 `首页 → 搜索 → 详情` 变成 `首页 → 详情`，详情页返回直接回首页。
- **首页不再读查询串**：`IndexList` 只从 props 取关键词，首页不传即空字符串，搜索与首页彻底解耦。

## 4. 关键约束

- 搜索页不加入 `App.vue` 的 `keep-alive` 白名单；否则不同关键词会复用旧实例与旧列表。
- 卡片组件必须保持「根节点即网格项」：`SeriesCard` 的根是 `router-link`，CSS Grid 的 `min-width: 0` 写在 `.series-card` 上，首页栅格才能正常收缩。
- 中文输入法组合期间不能触发跳转，`Search.vue` 用 `status.composing` 拦截，组合结束后才走防抖。
- `planSearchNavigation()` 必须是纯函数：不读路由实例、不调 router，只接收「当前路由名 + 输入内容」，否则无法单测。
- 关键词只做 `includes` 匹配（标题与描述），不做分词；「芙莉莲 第二季」带空格时按整串匹配，搜不到「芙莉莲」的结果属于既有规则，不是缺陷。

## 5. 扩展点与已知限制

- 新增搜索维度（例如按标签筛选搜索结果）：优先复用 `IndexList` 的 `filter.query`，不要在搜索页另写一套过滤。
- 已知限制：搜索页没有结果数量统计；关键词超长时路径会很长（浏览器与 Koa 的 URL 长度上限内可用）。
- 已知限制：路径参数天然区分大小写与空格，输入「迷宫饭 」会被 `trim()` 处理，但中间空格不会被折叠。

## 6. 验证方式

- 单测：`pnpm exec vitest run test/web/search-navigation.test.ts` 覆盖 push/replace/回首页/空关键词/缺失路由名六个分支。
- 手工：首页输入「迷宫」→ 地址变为 `/search/%E8%BF%B7%E5%AE%AB`，结果 2 张卡片；继续输入关键词时 `history.length` 不增长；从结果页点开详情再返回，落回首页而不是搜索页。
