# 修复 DTO 字段映射丢失导致图片与路径错误

- 日期：2026-11-23
- 模块：server
- 类型：修复
- 涉及模块：server、docs

## 背景

`095bead` 把 Series/Season/Episode 的字段派生收进 `Entity.field()` 后，接口返回的系列图片全部变成破图。

排查结果：`field(key, read)` 的映射函数是**逐次调用传入**的，而 `getValue()` / `getValueOmitSeasons()` 走的是 `collect()`，`collect()` 只调用 `field(key)` 不带映射。于是所有「配置值 ≠ 对外值」的字段在 DTO 出口都退化为原始配置：

| 字段            | 配置里的值                     | 应有的 DTO 值                       | 实际返回                                              |
| --------------- | ------------------------------ | ----------------------------------- | ----------------------------------------------------- |
| `Series.images` | `{ path: '1.jpg', sort: 1 }[]` | 按 `sort` 排序的绝对路径 `string[]` | `{ path, sort }` 对象数组，前端拼成 `[object Object]` |
| `Season.path`   | 季目录名 `第一季`              | 季目录绝对路径                      | 相对名                                                |
| `Episode.path`  | 文件名 `1.mp4`                 | 集文件绝对路径                      | 文件名，视频也无法播放                                |

`video.test.ts` 原有的 DTO 断言只校验了键集合与顺序，正好漏掉了值；`test/server/entity.test.ts` 的 `tags` 映射也只测了 getter，没测 `collect()`。两处测试都没覆盖「映射是否在 DTO 出口生效」，因此重构后测试全绿但线上数据错误。

## 目标与取舍

- 让映射成为**字段定义的一部分**，任何取值入口（getter、`collect()`、后续新增的读取方式）都不可能绕过。
- 不改变对外契约：字段仍是 Promise getter，DTO 键集合与顺序不变。
- 不把三个类合并成一个泛型类：排序队列、父级引用、图片存储映射仍是各自真实的差异。

考虑过的方案：

1. `collect()` 接受映射表参数 —— 需要每个调用点重复声明字段清单，等于把重复搬了个位置。
2. getter 里保留映射、`collect()` 单独处理特殊字段 —— 两个真相来源，下次还会漏。
3. **子类声明 `readers` 映射，`field()` 从映射取派生函数**（当前方案）：一处声明，所有入口一致；漏声明是类型错误（`V[K]` 类型不匹配），不是运行时静默错误。

## 涉及文件

| 文件                         | 改动                                                                                                                    | 原因                                             |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `server/data/entity.ts`      | 新增 `FieldReaders<S, V>` 与抽象字段 `readers`；`field()` 去掉了 `read` 参数，改为从 `readers` 取                       | 让映射成为字段定义的一部分，`collect()` 无法绕过 |
| `server/data/series.ts`      | `images` 映射移入 `readers`；`removeImages()` 改为按 `sort` 排序后重编号                                                | 见下方「实现要点」                               |
| `server/data/season.ts`      | `path` 映射移入 `readers`                                                                                               | 修复 DTO 返回相对目录名                          |
| `server/data/episode.ts`     | `path` 映射移入 `readers`                                                                                               | 修复 DTO 返回文件名、视频无法播放                |
| `server/test/video.test.ts`  | DTO 段落补充取值断言：图片为绝对路径字符串数组、季/集 path 为绝对路径；新增「配置顺序与 sort 不一致」时的移除重编号用例 | 键集合断言不足以发现映射丢失                     |
| `test/server/entity.test.ts` | Demo 改用 `readers`；新增 `collect` 应用映射的用例                                                                      | 锁住本次回归的根因                               |
| `server/AGENTS.md`           | 明确「配置值与对外值不一致的字段必须声明在 `readers` 里」                                                               | 避免再犯                                         |

## 实现要点

**映射归属**：`readers` 是抽象字段，子类必须显式声明。这样 `field('images')` 与 `collect(['images'])` 走同一条派生路径，缓存也共用同一个 Promise。

**`removeImages()` 的重编号**：原实现（重构前）依赖 `images` getter **原地排序**配置数组，使配置顺序恰好等于 `sort` 顺序，再按配置顺序重编号。本次同时把 getter 改为基于副本排序（避免读取时改写配置），因此重编号必须自己先按 `sort` 排序，否则历史数据（配置顺序与 `sort` 不一致）移除图片后剩余图片的展示顺序会被打乱。

**为什么不用「原地排序」保持原样**：读取字段顺手改写配置对象是隐式副作用，`getValue()`、`getValueOmitSeasons()` 都可能间接触发；把排序放在真正需要顺序的地方（`images` 派生、`removeImages` 重编号）意图更明确，行为等价。

## 行为变化与兼容性

- 接口 `GET /series`、`GET /series/:id`：`images` 恢复为绝对路径数组，季/集 `path` 恢复为绝对路径。这是**修复回契约**，不是新增格式。
- 持久化数据格式不变，仍是 `{ path, sort }`；旧配置文件可直接使用。
- `Entity.field()` 的签名从 `field(key, read?)` 变为 `field(key)`。三个领域类与测试已同步，无其它调用方。

## 验证

- `pnpm exec vitest run`：19 文件、186 用例全部通过。
- 反向验证：临时让 `field()` 忽略 `readers`，新断言失败 5 项（`entity.test.ts` 2 项 + `video.test.ts` 整个用例），确认测试确实能拦住本类回归。
- `tsc -p server/tsconfig.build.json --noEmit --skipLibCheck`、`pnpm --filter web type-check` 通过。
- 未做应用内手工点击验证（本机无浏览器环境）；建议在详情页确认图片轮播与视频播放正常。

## 关联文档

- `server/AGENTS.md`「数据层」：字段派生与 `readers` 约定
- `docs/changes/server/2026-11-23-entity-field-derivation.md`：本次回归的来源
