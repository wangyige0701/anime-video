# 系列季集数据类改为字段派生基类

- 日期：2026-11-23
- 模块：server
- 类型：重构
- 涉及模块：server、web

## 背景

`Series`、`Season`、`Episode` 的字段原本逐项手写：服务端每个字段要声明 `_x`、写 getter、写 `registerX()`，并在 `getValue()`、`getValueOmitSeasons()`、`resolveXConfig()` 里各重复一次；前端每个可编辑字段要声明 `ref`、写 getter、写 `xRef` 状态代理、写 `updateX()` 的乐观更新与回滚。

结果是新增一个字段要改 10 处以上、跨 4 个文件，字段名在单个类中出现 11~14 次。写操作与读取缓存的一致性完全依赖人工在每处调用 `registerX()`，漏一处就会出现「接口已更新、读取仍是旧值」。

## 目标与取舍

- 目标：把「按字段派生、写入失效」收敛到一处，保持 Promise getter、DTO 形状、HTTP 接口、乐观更新语义全部不变。
- 取舍一：没有把三个类合并成一个泛型实体类。季/集的排序队列、Series 的图片存储映射、父子引用都是真实差异，合并会把差异塞进条件分支。
- 取舍二：没有改成同步 getter。构造函数命中缓存时直接返回已有实例，初始化仍是异步的，同步取值会读到未初始化状态。
- 取舍三：子级关系（`seasons` / `episodes`）仍在构造时立即开始派生，而不是首次读取时才扫描。缓存回收、`clearCache` 会 `await series.seasons`，若改为懒加载，目录被外部删除后回收路径会重新扫描并抛 `ENOENT`（现有用例 `Should discover images added after an initially empty series is refreshed` 覆盖了这个时序）。

## 涉及文件

| 文件                                                | 改动                                                          | 原因                                                         |
| --------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------ |
| `server/data/entity.ts`                             | 新增 `Entity<S, V>` 基类                                      | 提供 `field` / `write` / `mutate` / `invalidate` / `collect` |
| `server/data/series.ts`                             | 改用 `Entity`，删除 `_x`、`register*()`、手写 `getValue` 装配 | 字段声明从 ~90 行降到 getter 一行一个                        |
| `server/data/season.ts`                             | 同上，季/集关系改为 `episodePromise` 记忆化                   | 与 Series 保持一致                                           |
| `server/data/episode.ts`                            | 同上                                                          | 最小实体，先验证模式                                         |
| `web/src/data/common.ts`                            | 新增 `patchField()`、`createStatus()`、`FieldRefs<T>`         | 统一乐观更新与字段状态                                       |
| `web/src/data/series.ts`                            | 字段收进 `values` 映射，12 个更新方法改用 `patchField`        | 消除同构代码                                                 |
| `web/src/data/season.ts`、`web/src/data/episode.ts` | 同上                                                          | 三个类写法统一                                               |
| `test/server/entity.test.ts`                        | 新增 6 个用例                                                 | 覆盖派生缓存、写入失效、原地修改、字段顺序                   |
| `web/test/data-patch.test.ts`                       | 新增 4 个用例                                                 | 覆盖乐观更新、回滚、状态隔离与返回值透传                     |
| `server/test/video.test.ts`                         | 增加 DTO 键集合与顺序断言                                     | `getValue()` / `getValueOmitSeasons()` 原先无测试覆盖        |
| `server/AGENTS.md`、`web/AGENTS.md`                 | 更新字段派生与请求状态说明                                    | 原 `register*()` 描述已失效                                  |

## 实现要点

服务端 `field()` 首次读取时用 `store.then(...)` 生成字段 Promise 并存入 `Map`，重复读取复用同一 Promise；`write()` 覆盖配置值后删除对应缓存键，`mutate()` 保留数组引用原地修改后同样失效。`collect(keys)` 按传入顺序组装 DTO，`getValue()` 只负责拼接子级。

`invalidate()` 用于配置被原地改写的场景（`refreshConfig`、`getAllSeasons` 初始化后），清空字段缓存并重建子级关系 Promise；不做全量 `register()` 式的逐字段重建。

前端 `values` 映射以 DTO 为类型参数，`patchField` 通过 `keyof T` 约束字段名与值类型；`createStatus()` 为每个键维护一个 `Ref<boolean>`，`get()` 返回布尔值，保持组件 `:loading="series.titleRef"` 的既有用法。

`removeDate()` 仍为「服务端成功后才清空」；`removeStatus()` 与原先一致，先置 0，失败回滚。`addTypes` / `addImages` 等沿用既有约定：调用方传入期望展示的完整目标数组，本地直接使用该数组。

## 行为变化与兼容性

- HTTP 接口、请求体、响应 DTO 字段与顺序均未变化。
- `images` getter 改为对副本排序后拼接路径，不再原地排序配置数组；对外数组内容与顺序不变，落库数组顺序不再被读取行为改写。
- 字段 Promise 在首次读取后保持同一实例（同一字段重复读取不再生成新 Promise），写入或 `invalidate()` 后更换。
- 实例缓存、错误回收、`waitDataSave()`、排序队列语义未变。

## 验证

- `pnpm exec tsc --noEmit -p server/tsconfig.json`：无 `server/**` 源码错误；仍存在 2 条 `node_modules` 内既有的第三方类型错误（`@types/express-serve-static-core`、`thread-stream`）。
- `pnpm --filter web type-check`：通过。
- `pnpm exec vitest run`：15 个测试文件、157 个用例全部通过（含新增 10 个）。
- `pnpm --filter web build`：构建成功，仅保留既有 chunk 体积提示。
- 未执行的手工项：应用内实际点击编辑标题、描述、日期、状态与拖拽排序。原因是本地无浏览器自动化环境；相关请求与状态路径由 `server/test/video.test.ts`（扫描、更新、排序、刷新落库）与 `web/test/data-patch.test.ts`（乐观更新与回滚）覆盖，建议合并前按 `web/AGENTS.md` 的验证清单走一遍详情页编辑与拖拽。

## 关联文档

- `server/AGENTS.md` 的「实体缓存与异步属性」
- `web/AGENTS.md` 的「系列、季、集数据方案」「字段更新与请求状态」
