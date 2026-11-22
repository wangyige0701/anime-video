# 修复两处既有失败用例并统一测试环境注入

- 日期：2026-11-22
- 模块：shared
- 类型：修复
- 涉及模块：shared、web、server

## 背景

`pnpm exec vitest run` 长期为红，两处失败与业务代码无关，但导致测试无法作为提交门禁：

1. `web/test/keyboard/info.test.ts` 按旧模板 `($key)` 断言，实现早已改成 `' ($key)'`（前导空格用于 `播放 (Space)` 这类拼接）。
2. `server/test/video.test.ts` 在收集阶段直接失败：`ReferenceError: __APP_CONFIG__ is not defined`。服务端模块在**导入阶段**就读取该全局（`server/data/data.ts` 的保存延迟、`server/data/common.ts` 的数据目录），而根 Vitest 配置只有 `test.env`，从未注入全局配置。

第二处修好之后，`video.test.ts` 又暴露出两个更早的断言漂移，以及夹具自身的可复现性问题。

## 目标与取舍

1. 让 `pnpm exec vitest run` 全绿，且不改变任何业务代码行为。
2. 用**统一的 setup 文件**注入 `__APP_CONFIG__`，而不是在每个测试文件里重复赋值。
3. 修正 `video.test.ts` 中按「目录扫描顺序」写的断言，使其与「按 `sort` 升序返回」的当前实现一致。
4. 让依赖本地媒体文件的夹具可以自愈，保证干净检出也能跑通。

取舍：

- **不改实现去迁就旧断言**。季/集列表按 `sort` 升序返回是排序功能的核心契约（`Season.getAllSeasons`、`Episode.getAllEpisodes`），旧断言用的是扫描顺序，属于测试滞后。
- **不在 `vitest.config.ts` 里用 `define` 内联配置**。那样配置在配置文件求值时生成，早于 `test.env` 生效时机，容易在别处被误读；setup 文件在 worker 内、测试模块导入前执行，时机更直观。
- **不把 `video.test.ts` 重写成纯单元测试**。它覆盖的是「目录扫描 + 数据文件落库 + 缓存对账」的真实链路，改成 mock 会失去价值；只补齐夹具与断言。

## 涉及文件

| 文件                             | 改动                                                                            | 原因                           |
| -------------------------------- | ------------------------------------------------------------------------------- | ------------------------------ |
| `test/setup.ts`                  | 新增，注入 `__APP_CONFIG__` 并兜底两个测试环境变量                              | 服务端模块导入阶段需要全局配置 |
| `vitest.config.ts`               | 增加 `setupFiles: ['./test/setup.ts']`                                          | 让 setup 对所有测试生效        |
| `web/test/keyboard/info.test.ts` | 断言改为默认模板 `' ($key)'`，补充多键拼接用例                                  | 与实现契约对齐                 |
| `server/test/video.test.ts`      | 季/集断言按 `sort` 顺序改写，新增夹具自动创建与清理（`beforeAll` / `afterAll`） | 消除顺序假设与对本地文件的依赖 |
| `AGENTS.md`                      | 补充 `__APP_CONFIG__` 注入约定与「夹具自备媒体文件」要求                        | 避免后续测试重复踩坑           |

## 实现要点

### 全局配置注入

`test/setup.ts` 先兜底 `SERVER_VIDEO_CONFIG_PREFIX=test`、`SERVER_DATA_FILE_SAVE_DELAY=0`（与 `test.env` 一致，单独跑某个文件时也生效），再动态导入 `shared/config-parser` 并 `Object.assign(globalThis, { __APP_CONFIG__: config })`。用 `Object.assign` 是因为 `server/env.d.ts` 把 `__APP_CONFIG__` 声明为 `const` 全局，直接赋值会触发只读声明错误（`server/test/fixtures/logger-process.ts` 用的是同一种写法）。

### 季/集断言

`updateSort(3)` 在两个季的列表里会被夹到末位，最终 `第一季 = 2`、`第二季 = 1`；列表按 `sort` 升序返回，因此顺序是 `[第二季, 第一季]` 而不是扫描顺序 `[第一季, 第二季]`。原断言用 `seasons[0]` 取「第一季」，在排序实现上线后必然失败。改写后：

- 显式断言整份顺序数组（`Promise.all(seasons.map(id))`）；
- 目标对象改为按位置取（`seasons[1]`）后继续校验 `id`、`path`、`sort`、`title`；
- 剧集块同理，`1.mp4` 移动到第 2 位后顺序为 `[2.mp4, 1.mp4]`。

### 夹具自愈

`.gitignore` 忽略了 `*.mp4`，而空目录无法被 git 跟踪，干净检出时 `server/test/videos/视频1/第一季/` 及其中的 `1.mp4`、`2.mp4` 都不存在。`beforeAll` 按需 `mkdir` + `writeFile`（空文件即可，与用例中 `temporary.webm` 的处理一致），记录本次新建的路径；`afterAll` 只删除本次新建的文件，并 `rmdir` 本次新建的目录（目录非空时删除失败即保留现场）。

## 行为变化与兼容性

- 业务代码零改动，仅测试与测试配置变化。
- `video.test.ts` 现在会读写 `server/test.video.json`（`getServerRoot()` 下的测试前缀数据文件，已被 `*.video.json` 忽略），不再依赖仓库根目录的陈旧文件。
- 夹具为空文件时扫描行为与真实视频一致（扩展名白名单决定是否登记为剧集），不影响断言。

## 验证

- `npx vitest run`：12 个文件 121 条用例全部通过（此前 2 个文件失败、109 通过）。
- 干净检出模拟：把 `server/test/videos/视频1/第一季` 整体移出后运行 `video.test.ts`，9 条用例通过，运行结束后目录被自动清理；移回原夹具后再跑一次仍通过。
- `git diff --check` 通过；`npx oxfmt` 已格式化改动文件。

## 关联文档

- `AGENTS.md`：`### 测试用例要求（强制）`、Vitest 配置说明
