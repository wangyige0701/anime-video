# 补齐 Bangumi 同步的服务端模块文档

- 日期：2026-11-27
- 模块：server
- 类型：文档

## 背景

Bangumi 同步的六个批次已经落地，但结论只散在各批次的变更记录里：`server/AGENTS.md` 没有任何入口，`docs/modules/server/` 也没有对应文档。下一个改这块的人（或 agent）需要重新读一遍 `integrations/` 才能知道「顺序从哪来」「哪些判断交给模型」，容易改回已经踩过的坑。

## 改动

- 新增 `docs/modules/server/bangumi-sync.md`：职责边界、模块分层、配置优先级、Bangumi 三字段模型、三段接口、顺序基准、规则优先对齐、预览与写入校验、错误与日志、本地回归方式。
- `server/AGENTS.md`：项目结构补 `src/integrations/` 一条；新增「Bangumi 数据同步」章节，只保留结论与红线（三段接口、模块边界、配置优先级、顺序只由文件名决定、规则优先、错误映射、测试数据不入库），细节链接到模块文档。

## 结论要点

- `.env` 的位置必须同时看 cwd 与模块位置上溯三级；只按 cwd 找会在 `pnpm --filter server run dev` 下静默失效。
- 顺序只由本地文件名决定，`ep` 完全不用，`sort` 只用于核对；落库排序是 1..N 的位置号。
- 模型只做「文件 → 官方集」的对应与季映射，返回结果必须再校验一次，且不参与决定播放顺序。

## 关联文档

- `docs/modules/server/bangumi-sync.md`
- 前序批次：`2026-11-27-bangumi-sync-api.md`、`2026-11-27-bangumi-align-rules.md`、`2026-11-27-ai-integration-prompts.md`、`2026-11-27-env-file-path.md`
