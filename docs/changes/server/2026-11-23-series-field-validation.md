# 系列字段端点保留拆分，统一写入流程与参数校验

- 日期：2026-11-23
- 模块：server
- 类型：重构
- 涉及模块：server

## 背景

series 的 title、description、date、status 字段各自一个端点（date、status 另有 DELETE 清除）。六个处理器都重复同一段流程：

```ts
const series = await Series.getSeriesById(seriesId);
await series.doUpdate(...);
await series.waitDataSave();
ctx.log.info({ event: '...' }, '...');
return ctx.Success();
```

漏掉 `waitDataSave()` 就会出现「接口返回成功但没落盘」，漏掉日志则事后无法追查；实际维护中只能靠人工逐处比对。参数校验也直接写在装饰器里，无法单独测试。

期间曾尝试把六个端点聚合为 `PATCH /series/:seriesId`，经确认不符合预期，已通过 `git reset` 完整撤回（提交 `b03bd99`），接口形状保持原样。本次只优化实现与校验，不改路由。

## 改动

| 文件                                    | 改动                                              | 原因                                     |
| --------------------------------------- | ------------------------------------------------- | ---------------------------------------- |
| `server/src/schema/series-fields.ts`    | 新增四个字段参数模式                              | 校验与控制器解耦，可直接单测             |
| `server/controller/SeriesController.ts` | 新增私有 `commitSeries()`，六个处理器改为一处调用 | 消除五步样板，落盘与日志不可能再漏       |
| `test/server/series-fields.test.ts`     | 新增 7 个用例                                     | 覆盖去空白、边界年份、非法月份与状态集合 |
| `server/AGENTS.md`                      | 记录写入流程与校验的集中位置                      | 后续新增字段端点有明确落点               |

## 参数校验的调整

| 字段          | 原校验                                              | 现校验                                 | 说明                                           |
| ------------- | --------------------------------------------------- | -------------------------------------- | ---------------------------------------------- |
| `title`       | `string().min(1)`                                   | `string().trim().min(1)`               | 纯空格不再被当成有效标题；返回体是去空白后的值 |
| `description` | `string().min(0)`                                   | `string().trim()`                      | `min(0)` 对字符串没有约束力；统一去首尾空白    |
| `year`        | `int().min(1900)`                                   | `int().min(1900).max(9999)`            | 补上上界，避免 `1e9` 这类值落库                |
| `month`       | `int().min(1).max(12)`                              | 同范围 + 中文提示                      | 提示文案与原 `ApiError` 语言一致               |
| `status`      | `int().min(1).max(4)`（已在上一次提交改为可写集合） | `int().refine(isWritableSeriesStatus)` | 拒绝「全部」与非连续 id                        |

`trim()` 在 `min(1)` 之前生效（Zod 对转换后结果做校验），因此 `title: '   '` 会被判为无效，而不是先通过长度检查再存成空串。

## 行为变化与兼容性

- 路由、方法、请求体字段、响应体、日志事件名与 `details`（`year`/`month`/`status`）全部不变，前端无需改动。
- 唯一可感知差异：标题与描述落库前会去掉首尾空白。前端 `TextEditor` 本来就先 `trim()` 再提交，正常操作下结果一致；绕过前端直接调用接口时，纯空白标题现在返回 400。
- `git reset` 已撤回聚合方案，`web/src/api/series.ts`、`web/src/data/series.ts` 恢复为六个请求函数与六个更新方法，`Single.PREV` 策略保持不变。

## 验证

- `pnpm exec vitest run`：17 个文件、170 个用例全部通过（新增 7 个）。
- `pnpm exec tsc -p server/tsconfig.build.json --noEmit --skipLibCheck`：通过。
- `pnpm --filter web type-check`：通过（前端未改动，确认重置后仍一致）。
- 未做的手工项：详情页实际编辑标题/描述/日期/状态与清除操作。本地无浏览器自动化环境；参数形状由 `series-fields` 用例覆盖，落盘流程由既有 `server/test/video.test.ts` 覆盖。
