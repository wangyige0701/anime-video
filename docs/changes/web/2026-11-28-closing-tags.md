# 插槽统一显式闭合并加入检查脚本

- 日期：2026-11-28
- 模块：web
- 类型：重构
- 涉及模块：web

## 背景

模板里插槽用的是自闭合写法：`<slot />`、`<slot name="footer" />`。

`slot` 是内容分发占位，不是组件实例。写成 `<slot />` 时，它和「漏写闭合的标签」在模板里视觉上无法区分，插槽内容从哪里开始、到哪里结束只能靠推断。成对出现能让插槽边界一眼可读。

## 规则

只有 `<slot>` 必须写显式闭合标签，禁止自闭合。

其余标签全部按组件处理，允许自闭合：`component`、`transition`、`keep-alive` 这类内置组件，以及 `web/src/components` 下的自定义组件和 Element Plus 组件。把 `<Refresh />` 补成 `<Refresh></Refresh>` 只是噪音，也偏离 Vue 官方风格。HTML void 元素（`img`、`br`、`input` 等）与 SVG 自闭合图形（`path`、`circle` 等）本来就没有闭合形式，保持原样。

规范写在 `web/AGENTS.md` 的「Vue 组件规范 → 标签闭合」。

## 改动范围

| 文件                                             | 处数 | 改动                                           |
| ------------------------------------------------ | ---- | ---------------------------------------------- |
| `web/src/components/setting/SettingSection.vue`  | 2    | `<slot></slot>`、`<slot name="footer"></slot>` |
| `web/src/components/setting/SettingField.vue`    | 1    | `<slot></slot>`                                |
| `web/src/components/setting/SettingAdvanced.vue` | 1    | `<slot></slot>`                                |

共 4 处、3 个文件，纯模板语法等价改动，不涉及脚本、样式或组件接口。`web/src/components/common/HorizontalScroll.vue` 原本就是 `<slot></slot>`，无需调整。

## 检查脚本

新增 `scripts/check-vue-tags.mjs`：扫描 `web/src` 下所有 `.vue`，只匹配 `<slot />`，命中即输出 `文件:行号 <slot /> 应写成 <slot></slot>` 并以非零码退出。

- 标签名统一小写比较，`<Slot />` 也能命中。
- HTML 注释里的示例不参与检查（注释按等长空白屏蔽，行号不变）。
- 已接入 `web/AGENTS.md` 的验证要求第 4 条：改过模板就执行 `node scripts/check-vue-tags.mjs`。

## 验证

- `node scripts/check-vue-tags.mjs`：通过（0 违规）。
- 反向验证：临时构造 `<slot />`、`<Refresh />`、`<component :is="x" />`、`<el-input />`、`<img />` 与注释示例混合的 `.vue`，脚本只报 `<slot />`、退出码 1；临时目录已删除。
- `pnpm --filter web type-check`、`pnpm --filter web build` 通过。
- `pnpm exec vitest run`：37 文件 / 382 用例全绿。
- 模板语法等价，未改变渲染结构；三处均为设置页插槽写法调整，无需手工回归。
