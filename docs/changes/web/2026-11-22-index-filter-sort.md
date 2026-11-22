# 首页支持标签、状态与时间过滤及上线时间排序

- 日期：2026-11-22
- 模块：web
- 类型：功能
- 涉及模块：web、shared（复用既有枚举，无改动）

## 背景

首页列表只有关键词搜索，排序完全依赖缓存插入顺序（初始化时按标题排序）。用户无法按类型、状态、上线时间筛选，也无法让最新的番剧排在最前；随着片库变大，找一部刚上的番需要翻很久。

## 目标与取舍

- 过滤与排序全部在前端本地完成，服务端接口与数据文件结构保持不变。
- 默认按上线时间倒序，列表用「年月分割线」分区，每区内再按名称排序。
- 两种过滤形态：标签/状态是多选标签组，时间是可按月划选的时间轴；过滤方式本身可切换并记忆。
- 过滤栏不能挤占或改变视频列表区域。

方案取舍：

- **底部固定栏 + 浮层**：首页原先就在底部预留了 45px 的空占位；把过滤栏放进去并改为 `sticky` 贴住滚动容器底部，时间轴放不下的部分用 popover 浮层承载（挂到 body），两者都不改变列表高度。
- **单一查询管线**：过滤、排序、分组、分页抽成 `utils/seriesQuery.ts` 的纯函数，数据层与组件只负责把状态接上去；不为「首页」和「刷新」写两套过滤逻辑。
- **条件签名驱动刷新**：列表只监听查询条件的签名而不是逐个字段，配合请求版本号避免连续切换时旧响应覆盖新结果。
- **时间轴按连续月份补齐**：跳过没有数据的月份会让刻度间距失真，因此从最早到最晚逐月生成，空档月份只画刻度不画柱体。

## 涉及文件

| 文件 | 改动 | 原因 |
| --- | --- | --- |
| `web/src/utils/seriesQuery.ts` | 新增 | 关键词、标签、状态、时间过滤与排序、分页、按月分组 |
| `web/src/utils/timeAxis.ts` | 新增 | 连续月份刻度、年份归并、指针换算、范围与像素换算 |
| `web/src/stores/indexFilter.ts` | 新增 | 过滤与排序状态、脏数据校验、localStorage 持久化 |
| `web/src/components/index/IndexFilterBar.vue` | 新增 | 底部过滤栏容器与方式/排序切换 |
| `web/src/components/index/IndexFilterOptions.vue` | 新增 | 标签与状态共用的多选标签组 |
| `web/src/components/index/IndexFilterDate.vue` | 新增 | 时间触发器与浮层、时间轴刻度加载 |
| `web/src/components/index/IndexTimeAxis.vue` | 新增 | 月份刻度、年份表头、选中区块 |
| `web/src/components/index/useTimeAxisSelection.ts` | 新增 | 划选交互与全局监听清理 |
| `web/src/components/index/IndexList.vue` | 改造 | 渲染片段化（卡片/分割线）、按查询条件加载、刷新后重算 |
| `web/src/data/series.ts` | 改造 | 新增 `querySeries()`、`getAllSeries()`，`getSeriesByPage()` 支持查询参数 |
| `web/src/stores/video.ts` | 改造 | 透出 `all()`、`query()` |
| `web/src/views/index.vue` | 改造 | 过滤栏入位、列表与过滤栏的 flex 布局 |
| `web/src/config/constants.ts` | 改造 | 新增过滤状态存储键 |
| `test/web/series-query.test.ts`、`test/web/time-axis.test.ts` | 新增 | 45 个用例覆盖过滤、排序、分组、刻度与范围换算 |

## 实现要点

1. **过滤顺序**：关键词 → 标签 → 状态 → 时间，任一不满足即排除；标签命中任一选中项即保留，指定时间范围时未设置上线时间的条目被排除。
2. **排序**：`date` 模式月份倒序、同月用 `Intl.Collator('zh-CN-u-co-pinyin')` 升序、无日期沉底；`name` 模式整体按名称。
3. **分组渲染**：`groupSeriesByMonth()` 保持入参顺序，`IndexList` 把它展开成「分割线 + 该月卡片」的片段数组，分割线用 `grid-column: 1 / -1` 通栏。
4. **持久化**：`stores/indexFilter` 在 `ready` 之后才写存储，初始化期间的赋值不会把恢复出来的值立即回写；读取时校验方式白名单、数字数组与 `YYYY-MM` 范围格式。
5. **时间轴**：刻度宽度为常量 `AXIS_TICK_WIDTH`，指针坐标用随滚动偏移的内容容器左边界换算；拖动只更新预览，松手提交并收起浮层，点击单月即以该月为单点范围。
6. **分页与刷新**：`IndexList` 用 `requestVersion` 丢弃过期响应；全量刷新事件给出的完整列表会用当前条件重算后截取已加载页数，避免把不符合条件的数据塞回列表。

## 行为变化与兼容性

- 首页默认顺序由「标题」变为「上线时间倒序」，并按月插入分割线；无上线时间的系列集中在列表末尾的「未设置上线时间」分区。
- 关键词搜索改为大小写不敏感，匹配范围仍是标题与描述。
- 过滤与排序选择写入 localStorage（键 `indexFilter`），刷新页面后保持；清除该键即回到默认。
- 未改动服务端接口与 `.video.json` 结构，旧数据无需迁移；`getSeriesByPage` 新增的参数为可选，旧调用方式行为等价于默认查询。

## 验证

- `pnpm exec vitest run test/web`：45 个用例通过。
- `pnpm --filter web type-check`、`npx vite build` 通过。
- Chrome 无头 + CDP 实测（临时片库 12 部、跨 8 个月）：默认 12 张卡片 / 8 条分割线；时间轴 21 个连续月份刻度；拖动划选 2023-11 ~ 2024-01 后剩 4 张卡片 / 3 条分割线，触发器显示范围且 `localStorage` 写入该范围；标签 TV 过滤后 6 条，叠加状态「连载中」后 2 条。
- 临时片库与预览数据已删除，未改动真实片库。

## 关联文档

- `docs/modules/web/index-filter.md`
- `web/AGENTS.md`：`### 分页、搜索与本地查询`、`## 首页过滤与排序`
- 根 `AGENTS.md`：`### 测试用例要求（强制）`
