# 系列类型新增「穿越」

- 日期：2026-11-27
- 模块：shared
- 类型：功能
- 涉及模块：shared

## 背景

Bangumi 条目 `meta_tags` 中存在「穿越」标签（例如「无职转生」全系列），现有 45 项类型枚举无法匹配，自动同步时该标签会被丢弃。异世界 / 穿越是此类作品的核心题材，缺失会让按题材筛选失灵。

## 目标与取舍

在枚举末尾追加 `id: 46 穿越`，不新增「异世界」单独项：Bangumi 的 `meta_tags` 用「穿越」，本地手动录入也更常用这个词；两项同时存在会造成同一语义分叉。

约束沿用既有规则：id 必须从 1 连续递增，只能末尾追加。服务端 `SeriesController` 用首尾 id 组成合法区间校验写入值，插入或跳号会让未定义 id 通过校验，重排则让已有系列的 `types` 指向错误题材。

## 涉及文件

| 文件                        | 改动                                                | 原因                                   |
| --------------------------- | --------------------------------------------------- | -------------------------------------- |
| `shared/series-types.ts`    | 追加 `id: 46` 的「穿越」                            | 补上 `meta_tags` 高频词的映射目标      |
| `test/series-types.test.ts` | 末尾批次断言改为 18 项；新增 `46 → 穿越`、`47 → ''` | 保持「不写死总数」的同时覆盖新 id 边界 |

## 实现要点

数据源只有 `shared/series-types.ts` 一处，前端下拉、首页筛选、服务端写入校验都从它派生，调用方无需改动。合法区间由 `seriesTypes[0].id` 与末项 id 计算，自动变为 `1–46`。

## 行为变化与兼容性

- 已有系列的 `types` 存的都是 ≤45 的 id，含义不变。
- 新增项只影响选择器与筛选的可选范围，不改变任何已存数据的解释。

## 验证

- `pnpm exec vitest run test/series-types.test.ts`
- `pnpm exec vitest run`（全量）
- `pnpm exec tsc -p server/tsconfig.build.json --noEmit --skipLibCheck`
- `pnpm --filter web type-check`

## 关联文档

- 根 `AGENTS.md`「可编辑文本字段的空值语义」「测试用例要求」
- `docs/changes/shared/2026-11-27-series-types-tags-add.md`（上一批 17 个标签）
