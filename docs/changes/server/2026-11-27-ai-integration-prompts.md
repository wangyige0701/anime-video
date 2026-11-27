# 新增 AI 客户端、提示词契约与类型标签映射

- 日期：2026-11-27
- 模块：server
- 类型：功能
- 涉及模块：server

## 背景

Bangumi 同步里只有三件事需要模型参与：季与条目的对应、无法用规则消解的集对齐、Bangumi 标签到项目类型的映射。其余字段（标题、描述、状态、日期）直接从接口读取，不应消耗模型调用。

前置验证脚本把提示词和请求代码写在一起，无法单独测试「模型返回了非法 id 会怎样」。这次把契约部分拆成纯函数。

## 目标与取舍

- AI 模块保持通用：只负责「发消息、拿 JSON」，不认识 Bangumi、不认识剧集。
- 提示词与结果校验放在 Bangumi 模块，两者成对维护：改提示词必须同步改校验。
- **标签先走规则再走模型**：同名标签精确命中，剩下的才问模型。真实数据里六成以上标签能精确命中，全部交给模型既慢又容易把制作公司名塞成类型。
- 规则不做同义词推断，「异世界 → 奇幻」这类判断留在模型层，避免规则悄悄改变落库结果。
- 模型返回的任何 id 都要校验：不在候选集合内、重复分配、超出类型表一律丢弃并告警，不静默采用。
- 集对齐的提示词明确写「你只负责对应关系，顺序由本地文件名决定」，防止模型为了「对齐官方集号」去调整映射。

## 涉及文件

| 文件 | 改动 | 原因 |
| --- | --- | --- |
| `server/src/integrations/ai/client.ts` | `chatJson`、`extractJsonObject` | OpenAI 兼容调用与 JSON 提取 |
| `server/src/integrations/bangumi/prompts.ts` | 两套提示词、消息构造、结果校验 | 季映射与集对齐的契约 |
| `server/src/integrations/bangumi/tags.ts` | 规则匹配、标签提示词、结果校验 | 类型标签整合 |
| `test/server/ai-client.test.ts` | 10 个用例 | 请求体、参数剥离重试、错误与 JSON 提取 |
| `test/server/bangumi-prompts.test.ts` | 13 个用例 | 消息编码与结果校验 |
| `test/server/bangumi-tags.test.ts` | 10 个用例 | 规则匹配与标签校验 |

## 实现要点

1. **兼容性重试**：`response_format` 与 `thinking` 不是所有兼容实现都支持。收到 4xx 时先剥离 `thinking`，再剥离 `response_format`，逐次重试；仍失败才报错。只对 4xx 剥离，5xx 交给 `requestJsonWithRetry` 的退避。
2. **错误信息不含密钥**：只回传状态码与截断的响应体。`ApiError` 的第二个参数是响应体、第三个是 message，两处都传同一句话，前端能拿到原因、日志也有可读消息。
3. **`extractJsonObject`** 依次尝试裸 JSON、```json 代码块、首尾花括号截取；全部失败才报错，避免模型多说一句「结果如下」就整次失败。
4. **季映射校验**：别名必须存在且不重复，id 必须在候选集合内、不重复分配、最多 3 个，`order` 必须是 1..N 的排列。任一项不满足只降级并告警，不整次失败——季映射本来就要人工确认。
5. **集对齐校验**：每个文件必须有结论（`null` 也算），官方集不能被两个文件同时占用，指向不存在官方集的视为无对应。缺集不视为错误。
6. **标签规则**：名称去空白、转小写后完全相等才算命中，结果按项目类型表顺序返回，保证同一作品两次同步得到相同数组顺序。
7. **测试隔离**：AI 客户端测试 mock 掉 HTTP 与 `.env` 读取，避免本机配置渗入用例；提示词测试构造数据，不依赖任何抓取文件。

## 行为变化与兼容性

- 纯新增模块，未接入接口。
- `tags.ts` 与 `prompts.ts` 只依赖 `shared/series-types` 的类型表，不修改枚举本身。

## 验证

- `pnpm exec vitest run test/server/ai-client.test.ts test/server/bangumi-prompts.test.ts test/server/bangumi-tags.test.ts`：33 个用例通过。
- `pnpm exec tsc -p server/tsconfig.build.json --noEmit --skipLibCheck`：通过。
- 未发起真实模型请求：接口行为已在前置验证阶段确认，单测只覆盖契约与容错。

## 关联文档

- `docs/changes/server/2026-11-27-bangumi-align-rules.md`
