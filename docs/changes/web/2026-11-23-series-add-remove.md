# 系列类型与图片的增删方法语义对齐服务端

- 日期：2026-11-23
- 模块：web
- 类型：修复
- 涉及模块：web、server

## 背景

`Series` 的 `addTypes()` / `removeTypes()` / `addImages()` / `removeImages()` 目前没有调用方，属于预留方法。审计发现三处实现问题，一旦被使用就会写出与界面不一致的数据：

1. `addTypes()` / `removeTypes()` 把入参数组直接当作本地值。服务端的 `add` 是追加、`remove` 是过滤，本地却按覆盖处理：当前 `[1, 5]` 追加 `[7]` 后服务端为 `[1, 5, 7]`，界面只显示 `[7]`；移除 `[5]` 后界面显示 `[5]`。
2. 图片方法把绝对路径直接发给服务端。服务端 `addImages()` / `updateImages()` 会按 `path.join(directory, name)` 校验文件，绝对路径被二次拼接后必然查不到文件，最终被 `filterImageNames()` 静默过滤，请求成功但没有写入。
3. 服务端 `addTypes()` 直接 `push` 入参，`addImages()` 不判断已存在的 basename，重复提交会写出重复项，与界面去重后的本地值分叉。

## 目标与取舍

- 保留这四个方法作为预留能力，不删除、不改接口签名。
- 本地乐观值按服务端同一语义计算：`add` 追加、`remove` 剔除、`set` 覆盖。
- 图片方法的入参保持绝对路径（与 `series.images` 一致），在 data 层内部转换成服务端需要的文件名，不为调用方增加心智负担。
- 追加操作在服务端做成幂等，重复提交同一批类型或图片不产生重复记录。

方案取舍：

- **不要求调用方自己拼目标数组**：那样每个调用点都要重复一遍增删逻辑，且容易与服务端语义再次分叉。
- **不在 API 层做路径转换**：`api/series.ts` 只负责 URL 与请求策略，路径裁剪属于数据层对 DTO 的适配。
- **不改 `set` 的入参**：`updateImages()` 仍接收绝对路径顺序数组，内部统一转换。

## 涉及文件

| 文件                                | 改动                                                                             | 原因                                   |
| ----------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------- |
| `web/src/utils/series.ts`           | 新增 `mergeUnique()` 与 `getSeriesImageName()`                                   | 纯函数承载合并去重与路径裁剪，便于测试 |
| `web/src/data/series.ts`            | 三个类型方法按增删语义计算本地值；三个图片方法发送前转换文件名，本地仍存绝对路径 | 修复语义分叉                           |
| `server/data/series.ts`             | `addTypes()` 对已有类型去重；`addImages()` 跳过已存在及同批次重复的 basename     | 追加幂等                               |
| `test/web/series-values.test.ts`    | 新增合并与路径裁剪用例                                                           | 覆盖纯函数                             |
| `server/test/video.test.ts`         | 补充类型追加幂等、图片重复追加用例                                               | 覆盖服务端幂等                         |
| `web/AGENTS.md`、`server/AGENTS.md` | 更新增删语义与图片参数说明                                                       | 文档同步                               |

## 实现要点

1. `mergeUnique(current, added)` 从 `current` 的副本开始，按顺序推入不在结果中的新增项，因此既去掉与现有值的重复，也去掉新增批次内部的重复。
2. `getSeriesImageName(directory, image)` 先去掉目录尾部分隔符，路径以该目录开头时截掉前缀（兼容 `\` 与 `/`）；不在目录下时退化为最后一段文件名，让服务端按目录内文件校验处理。
3. `addImages()` / `removeImages()` / `updateImages()` 用 `mergeUnique`、`filter`、原数组分别得到本地 `images` 绝对值，再通过 `toImageNames()` 转成文件名发给接口。
4. 服务端 `addImages()` 在 `mutate` 内先建 basename 集合，再逐个判断后追加，sort 仍接在当前最大 sort 之后；`addTypes()` 只在不存在时 `push`。

## 行为变化与兼容性

- 四个方法此前无调用方，改动不影响现有界面与接口契约。
- 类型的追加、删除在本地与服务端保持同一结果；重复追加类型或图片不再产生重复记录。
- 图片接口的入参仍是文件名，前端调用方继续传绝对路径即可。

## 验证

- `pnpm exec vitest run`：21 个测试文件 / 198 个用例通过（新增 `test/web/series-values.test.ts`，`server/test/video.test.ts` 补充幂等断言）。
- `pnpm exec tsc -p server/tsconfig.build.json --noEmit --skipLibCheck`、`pnpm --filter web type-check` 通过。

## 关联文档

- `web/AGENTS.md`：`### 字段更新与请求状态`
- `server/AGENTS.md`：图片与类型更新方法说明
- 相关历史记录：`docs/changes/server/2026-11-23-entity-readers-fix.md`（图片对外为绝对路径）
