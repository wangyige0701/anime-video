# 新增系列合并与脱离接口

- 日期：2026-11-27
- 模块：server
- 类型：功能
- 涉及模块：server

## 背景

数据层已经能表达「主系列 + 成员」的合并关系（见 `2026-11-27-series-merge-data.md`），本批次把它暴露为接口，供首页拖拽与脱离操作调用。

## 接口

| 方法   | 路径                                     | 作用                                    | 请求体                 |
| ------ | ---------------------------------------- | --------------------------------------- | ---------------------- |
| POST   | `/data/series/:seriesId/merge`           | 把 `memberId` 并入 `seriesId`（主系列） | `{ memberId: string }` |
| DELETE | `/data/series/:seriesId/merge/:memberId` | 让成员从主系列的合并组中脱离            | 无                     |

两者的响应都是 `SeriesMergeResult`：`main` 为写入后的主系列摘要，`member` 仅在合并时返回。

## 涉及文件

| 文件                                      | 改动                             | 原因                               |
| ----------------------------------------- | -------------------------------- | ---------------------------------- |
| `server/src/schema/series-merge.ts`       | `seriesMergeSchema`              | 参数校验集中在 schema，便于单测    |
| `server/controller/SeriesController.ts`   | 两个端点                         | 接口层只做注入、日志与 DTO 组装    |
| `server/test/video.test.ts`               | 合并/脱离的落库用例 + DTO 键顺序 | 关系与持久化必须用真实数据文件验证 |
| `test/server/series-merge-schema.test.ts` | 4 个用例                         | 空 id、纯空白、缺字段              |

## 实现要点

1. **语义方向**：路径参数是主系列，`memberId` 是被并入的一方。合并是展平的——`memberId` 自带的成员会一并转移给主系列，它自己的列表清空。
2. **拒绝三类请求**：合并到自身、源系列已属于别的组、目标系列本身是成员。三者都在数据层抛 `Status.Failed`，错误信息同时作为响应体与 `Error.message`，避免前端只能看到 `Server Error`。
3. **返回两个实例**：合并会同时改动两个系列的 `mergedIds`（目标追加、源清空），所以响应里都带上，前端不需要额外再拉一次全量。
4. **日志**：`series.merged` / `series.detached`，带 `seriesId` 与 `memberId`，便于排查拖拽误操作。
5. **DTO 键顺序**：`mergedIds` 插入到 `types` 与 `status` 之间，`server/test/video.test.ts` 的键集合断言同步更新。

## 行为变化与兼容性

- 纯新增路由，既有 `/data/series/*` 端点与前端调用不变。
- `GET /data/series/:seriesId` 与 `GET /data/series` 的响应多一个 `mergedIds` 字段；老客户端忽略该字段即可正常工作。
- 接口不做「最多几层」之类的展示约束——叠层上限是纯 UI 规则，服务端不限制实际合并数量。

## 验证

- `pnpm exec tsc -p server/tsconfig.build.json --noEmit --skipLibCheck`：通过。
- `pnpm exec vitest run`：33 个文件 318 个用例通过。
- `server/test/video.test.ts` 新增用例覆盖：合并写入数据文件、被合并系列不持有反向引用、三类非法请求、脱离、成员目录被删除后悬空 id 被规范化清理。

## 关联文档

- `docs/changes/server/2026-11-27-series-merge-data.md`
