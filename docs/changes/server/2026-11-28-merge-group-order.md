# 合并组支持跨系列季与图片排序

- 日期：2026-11-28
- 模块：server
- 类型：功能

## 背景

合并是纯展示层聚合：成员系列的季与图片拼进主系列的详情页，各自的 `sort` 仍然只在**自己系列内部**有意义。原来的季排序接口 `PUT /season/:seasonId/sort` 语义是「移动到第 N 位」，无法表达「成员 B 的季排到成员 A 的季前面」，所以前端在合并状态下只能隐藏拖拽手柄。

## 数据模型

主系列的配置新增两个有序数组，只在作为主系列时非空：

```jsonc
{
	"id": "A",
	"mergedIds": ["B"],
	// 季 id，长度不要求覆盖全部季
	"mergedSeasonOrder": ["b-season-1", "a-season-2", "a-season-1"],
	// 图片绝对路径，与 images 同一形式
	"mergedImageOrder": ["E:\\anime\\B\\封面.png", "E:\\anime\\A\\1.webp"],
}
```

- 元素顺序就是详情页的展示顺序；
- **数组只记录用户定义过的顺序**，没出现在其中的季/图片按默认顺序（主系列在前、成员按 `mergedIds` 顺序）追加在末尾。新增季、新合并进来的成员都不需要迁移；
- 键的选择：季用 id，图片用**绝对路径**。不同系列目录下可能同名图片，只有路径能唯一定位；粘贴路径与 `images` 对外形式一致，前端不需要再换基准目录；
- 历史配置没有这两个字段，`resolveSeriesConfig()` 补空数组，不写盘。

## 写入语义

两个新端点在 `SeriesController`，参数模式在 `src/schema/series-merge.ts`：

| 端点                                       | body                | 返回                   |
| ------------------------------------------ | ------------------- | ---------------------- |
| `PUT /data/series/:seriesId/merge/seasons` | `{ seasonIds: [] }` | 落库后的完整季 id 顺序 |
| `PUT /data/series/:seriesId/merge/images`  | `{ images: [] }`    | 落库后的完整图片顺序   |

`Series.rewriteMergedSeasonOrder()`：

1. 汇总合并组（主系列 + 成员，悬空成员跳过）的全部季，按当前 `sort` 得到默认顺序；
2. 校验入参：任一 id 不属于该组或重复出现 → 整次 `ApiError` 拒绝，不落半截数据；
3. `applyExplicitOrder()`（`shared/series-order.ts`）合成最终顺序，写入 `mergedSeasonOrder`；
4. **每个系列按自己在全局顺序中的子序重编号 `1..n` 并原地重排季数组**。这一步是「脱离合并不影响单系列顺序」的唯一保证：合并期间看到的子序就是脱离后该系列自己的顺序，刷新后也一样；
5. 队列化：与单系列排序共用 `seasonSortQueue`，两种写入口串行，避免互相覆盖 `sort`；
6. 落盘：合并组成员可能属于不同的根目录（各自的 `DATA_FILE`），因此等待全部成员的 `waitDataSave()` 后才返回。

`Series.updateMergedImageOrder()` 结构相同，差别是键为绝对路径（比较前 `path.resolve()` 归一），不属于合并组或已被删除的路径直接跳过——界面传来的是可能早于外部删文件的旧快照，为此整次失败不值得。

`Series.mergeSeries()` / `detachSeries()` 会顺带维护这两个数组：被并入的系列清空自己的顺序记录（它已不是主系列），脱离时从主系列剔除属于该成员的季 id 与图片路径，避免成员以后被重新合并时带着旧位置复活。

## 共用规则

`shared/series-order.ts` 的 `applyExplicitOrder(pool, order, getKey)` 是两端唯一实现：显式顺序优先、未知键跳过、重复键只认第一次、未覆盖项保持默认相对顺序追加在末尾、不修改入参。服务端落库与前端渲染都调用它，否则会出现「拖完一个顺序、刷新变另一个顺序」。

## 验证

`server/test/video.test.ts` 新增「Should reorder seasons and images across the merged group」：

- 跨系列交错排序后 `mergedSeasonOrder` / `mergedImageOrder` 与落库一致；
- 各系列季的 `sort` 被重编为子序（`[1, 2]` / `[1]`），图片配置按子序重写；
- 漏传的季追加在末尾、不属于合并组的季 id 与重复 id 被拒绝、幽灵图片路径被跳过；
- **脱离合并后两边都保持合并时的子序**，且重新扫描磁盘后仍一致（证明落库而不只是内存）。

`test/series-order.test.ts` 覆盖显式顺序的 7 条边界（空顺序、空池子、未知键、重复键、不改入参）。`test/server/series-merge-schema.test.ts` 覆盖两个参数模式的空数组与空白拒绝。

`pnpm exec tsc -p server/tsconfig.build.json --noEmit --skipLibCheck`、`pnpm exec vitest run`（47 文件 / 482 例）通过。

## 影响面

- 只新增字段与端点，既有 `PUT /season/:seasonId/sort` 语义不变，单系列拖拽行为不变。
- DTO 新增 `mergedSeasonOrder`、`mergedImageOrder`，`SeriesMergeResult` 里的摘要同样带上它们。
- 合并关系仍是「只记录在主系列上」，这两个数组与 `mergedIds` 同属主系列，脱离后自动失效。
