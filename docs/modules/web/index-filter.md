# 首页过滤与排序

## 1. 职责边界

本模块负责首页（`views/index.vue`）中**已加载列表的本地筛选与排序**，不负责：

- 请求服务端分页或过滤：接口只返回全量系列，分页、过滤、排序、分组全在前端完成。
- 系列详情装配、播放、收藏等其它首页能力。
- 修改服务端数据：过滤条件只影响展示，不写回 `.video.json`。

## 2. 分层与文件

| 层次 | 文件 | 职责 |
| --- | --- | --- |
| 纯规则 | `utils/seriesQuery.ts` | 关键词匹配、标签/状态/时间过滤、排序、分页、按年月分组 |
| 纯计算 | `utils/timeAxis.ts` | 连续月份刻度、年份归并、指针坐标换算、范围与像素换算 |
| 状态 | `stores/indexFilter.ts` | 过滤方式、选中标签、选中状态、时间范围、排序方式，并持久化 |
| 数据入口 | `data/series.ts` | `querySeries()` / `getAllSeries()` / `getSeriesByPage()` |
| 容器 | `components/index/IndexFilterBar.vue` | 底部过滤栏：方式切换 + 内容区 + 排序切换 |
| 子组件 | `IndexFilterOptions.vue`、`IndexFilterDate.vue`、`IndexTimeAxis.vue` | 多选标签组、时间触发器与浮层、时间轴刻度 |
| 交互 | `components/index/useTimeAxisSelection.ts` | 时间轴指针划选与全局监听清理 |
| 列表 | `components/index/IndexList.vue` | 渲染片段（卡片 / 月分割线）、分页加载、刷新同步 |

## 3. 状态与数据流

```text
用户点击
  → stores/indexFilter 更新（mode / types / statuses / dateRange / sortMode）
  → watch 写入 localStorage（VIDEO_INFO 存储封装，persist=true）
  → query.signature 变化
  → IndexList.reload()：页码归 1、请求版本 +1、清空列表
  → data/series.querySeries()：applySeriesQuery(全量) → paginateSeries(第一页)
  → 版本号匹配才写入 datas，segments 重新计算并渲染分割线
```

要点：

- **签名驱动**：`IndexList` 只监听 `filter.signature`（查询条件的 JSON 字符串），不逐个监听字段，避免同一轮里多次刷新。
- **版本号丢弃过期响应**：搜索词与过滤条件都可能连续变化，`requestVersion` 保证只有最后一次请求能落表。
- **刷新事件重算**：全量刷新给出的列表未经过滤，`IndexList` 用 `applySeriesQuery()` 按当前条件重算后再截取已加载页数。
- **时间轴独立取数**：`IndexFilterDate` 用 `Series.getAllSeries()` 构建刻度，刻度覆盖全部系列，不受标签/状态过滤影响；否则选中标签后时间轴会缺少年份。

## 4. 关键约束

- 网格列表中的分割线必须 `grid-column: 1 / -1`，否则会被压进单列。
- 过滤栏高度固定（`--filter-bar-height: 45px`）且 `position: sticky; bottom` 贴住滚动容器底部；时间轴浮层挂到 body（`popper-class`），两者都不能让列表区域发生位移。
- 时间轴刻度宽度是纯计算常量 `AXIS_TICK_WIDTH`，样式里的 `--tick-width` 必须与它一致；指针换算用的是**内容容器**（随滚动偏移）的左边界，不是外层滚动容器的。
- 拖动过程只更新本地预览，松手才提交，避免拖动期间反复过滤整个列表；按下与松开落在同一刻度即选中单月。
- 时间范围用 `YYYY-MM` 字符串保存，字符串比较等价于时间比较；指定范围时未设置上线时间的条目一律排除。
- 排序默认 `date`：月份倒序、同月按拼音名称升序（与数据层初始化使用同一套 `Intl.Collator` 配置）、无上线时间排最后。
- 本地存储读取必须逐项校验（方式白名单、数字数组、范围格式），脏数据回退默认值，不能让旧版本残留结构导致列表空白。

## 5. 扩展点与已知限制

- 新增过滤维度：在 `SeriesFilterMode` 增加枚举、在 `SeriesQuery` 增加字段、在 `applySeriesQuery()` 加一条判定，再在 `IndexFilterBar` 挂一个新组件；不要在组件里直接过滤 `datas`。
- 新增排序方式：扩展 `SeriesSortMode` 并在 `sortSeriesList()` 加分支；`IndexList` 的 `segments` 只在 `date` 模式下插分割线。
- 已知限制：列表按 `title` 排序但卡片显示目录名 `name`，两者不一致时顺序与文字观感可能不同（沿用改造前的既有行为）；时间轴刻度按月份连续补齐，跨度过大时（例如十余年）需要横向滚动较长距离。

## 6. 验证方式

- 单元测试：`pnpm exec vitest run`（`test/web/series-query.test.ts`、`test/web/time-axis.test.ts`）覆盖过滤组合、排序边界、分组、刻度补齐、坐标换算与范围收敛。
- 手工验证：
  1. 首页默认按上线时间倒序，每个月有分割线且标注数量；
  2. 切换「标签」多选后列表数量与分割线同步变化，刷新页面后选择仍在；
  3. 切换「状态」验证与标签为「与」关系；
  4. 「时间」浮层内拖动划选一段时间，触发器显示范围，浮层收起，列表只剩范围内条目；清除后恢复；
  5. 滚动列表时过滤栏始终贴底，不遮挡最后一行卡片。
