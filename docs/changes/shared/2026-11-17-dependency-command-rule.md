# 依赖变更必须通过 pnpm 命令执行

- 日期：2026-11-17
- 模块：shared
- 类型：文档

## 背景

安装 `vue-draggable-plus` 时出现两种风险场景：

- 默认源 `registry.npmjs.org` 连接被重置，只能临时指定 `--registry=https://registry.npmmirror.com` 完成安装。如果改为手工编辑 `package.json` 或锁文件“凑”依赖，会漏掉 integrity、peer 和 importer 归属，后续 `pnpm install` 直接失败或悄悄换版本。
- `pnpm-workspace.yaml` 里的 `overrides`、`peerDependencyRules` 属于仓库级策略，随意手改会让 Vue beta 的版本解析失效。

## 目标与取舍

把“依赖只能通过命令改”写成硬规则，避免锁文件与声明脱节；同时区分“依赖条目”和“仓库级安装策略”，后者允许改 `pnpm-workspace.yaml`，但必须重新 install 并提交锁文件。

## 涉及文件

| 文件 | 改动 | 原因 |
| --- | --- | --- |
| `AGENTS.md` | 在 pnpm 安装策略章节新增依赖变更规则与示例命令 | 让任何执行者在装包前看到强制路径，而不是先手改文件再排查 |

## 实现要点

- 明确命令形态：`pnpm --filter <包> add/remove/update <依赖>`，根级工具用不带 filter 的等价命令。
- 明确禁止对象：`package.json`、`pnpm-lock.yaml` 中的依赖条目。
- 明确例外：`pnpm-workspace.yaml` 的 `overrides`、`peerDependencyRules`、`allowBuilds`、`minimumReleaseAge` 可直接编辑，但必须重新 `pnpm install` 并提交同一份锁文件。
- 网络受限时通过命令行参数临时切换源，不允许把源地址写进依赖声明。

## 行为变化与兼容性

- 无运行时行为变化。
- 开发者若手改依赖文件，会被视为破坏锁文件一致性，需回退并通过命令重做。

## 验证

- 本次安装 `vue-draggable-plus@0.6.1` 全程使用 `pnpm --filter web add`，锁文件新增条目只含 integrity 与 peer 信息，未写入镜像地址。
- `pnpm install` 可在仓库根目录重复执行且不产生额外变更。

## 关联文档

- 根 `AGENTS.md`：`## pnpm Monorepo` → 安装策略
