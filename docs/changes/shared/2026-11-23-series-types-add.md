# 系列类型新增美少女、魔法少女、战斗、恋爱与萌系

- 日期：2026-11-23
- 模块：shared
- 类型：功能
- 涉及模块：shared、web、server

## 背景

详情页的类型下拉与首页类型筛选共用 `shared/series-types.ts` 的类型枚举，现有 23 个类型覆盖档期、来源与题材，缺少少女向、战斗与恋爱题材的常用分类。

## 目标与取舍

- 在枚举末尾追加 5 个类型：`24 美少女`、`25 魔法少女`、`26 战斗`、`27 恋爱`、`28 萌系`。
- 复用现有 id 分配方式，不重排已有 id：已有系列的 `types` 存的是 id，重排会让历史数据指向错误题材。
- 不区分「恋爱」与既有「爱情」：两者按用户习惯同时保留，由录入方自行选择，不在枚举层做别名映射。

## 涉及文件

| 文件                        | 改动                       | 原因                   |
| --------------------------- | -------------------------- | ---------------------- |
| `shared/series-types.ts`    | 追加 id 24–28 五个类型     | 类型数据源             |
| `test/series-types.test.ts` | 新增枚举约束与名称查询用例 | 固定 id 连续性与新增项 |

## 实现要点

1. 类型列表是前端下拉、前端筛选选项与服务端写入校验的唯一数据源：`web/src/components/detail/DetailTypes.vue`、`IndexFilterBar.vue` 直接遍历 `seriesTypes`，`ServerController.updateSeriesTypes` 用首尾 id 组成合法区间，追加后无需改动调用方。
2. 服务端校验依赖 id 从 1 连续递增（`minSeriesType = seriesTypes[0].id`、`maxSeriesType = seriesTypes[last].id`），因此新增 id 必须紧接上一个 id，不能跳号。
3. 新增用例断言 id 连续、名称唯一非空、末尾 5 项名称与 `getSeriesTypeName()` 的查询结果，避免以后插入类型时跳号导致服务端区间校验放行未定义 id。

## 行为变化与兼容性

- 已有系列的类型 id 不受影响，历史数据无需迁移。
- 详情页类型下拉与首页筛选自动多出 5 个选项，接口契约与请求参数不变。
- 服务端写入校验区间由 `1–23` 变成 `1–28`。

## 验证

- `pnpm exec vitest run`：20 个测试文件 / 190 个用例通过（新增 `test/series-types.test.ts`）。
- `pnpm exec tsc -p server/tsconfig.build.json --noEmit --skipLibCheck`、`pnpm --filter web type-check` 通过。

## 关联文档

- `web/AGENTS.md`：`## 系列、季、集数据方案`（类型枚举同时作为过滤选项数据源）
- `server/controller/SeriesController.ts`：类型写入校验
