# TextEditor 增加图标隐藏属性与编辑态绑定

- 日期：2026-11-22
- 模块：web
- 类型：功能
- 涉及模块：web

## 背景

「剧情简介」的编辑图标在标题右侧，用来避免按钮跟着段落文本移动。但它进入编辑后仍然显示：描述区域已经变成可编辑状态，右上角还挂着一个「编辑」入口，点它只会重复触发聚焦；而保存过程中图标仍可点击，用户容易以为没生效。

根因是 `TextEditor` 只把编辑态留在组件内部（`status.editor`），外层拿不到，只能靠「正在保存」的 loading 状态间接判断。

## 目标与取舍

1. `TextEditor` 增加 `hideEditIcon` 属性：强制隐藏内置图标，给外部入口留出「编辑中收起入口」的能力；
2. `TextEditor` 通过 `v-model:editing` 暴露编辑态，外层据此决定自己的入口是否显示；
3. `DetailDescription` 用 `editing || status.modifyDescription` 控制图标：进入编辑即隐藏，保存完成后再出现。

取舍：没有把「编辑按钮长什么样」也塞进 `TextEditor`。图标位置由各个使用方决定（描述在标题行、季集标题在文本尾部），组件只负责状态与是否可见，避免把布局语义耦合进来。

## 涉及文件

| 文件                                              | 改动                                                                            | 原因                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------- |
| `web/src/components/common/TextEditor.vue`        | 新增 `hideEditIcon` prop、`v-model:editing`，图标显隐收敛到 `showIcon` 计算属性 | 外层需要感知编辑态并控制入口 |
| `web/src/components/detail/DetailDescription.vue` | 绑定 `v-model:editing`、图标增加 `v-if`、重复触发保护                           | 编辑与保存期间隐藏入口       |

## 实现要点

- `showIcon` 统一为 `showEditIcon && !hideEditIcon && editable && !status.editor && !disabled && !loading`，模板只判断 `v-if="showIcon"`，避免条件散落在模板里。
- `editing` 用 `defineModel('editing', { default: false })`；内部 `watch(() => status.editor)` 单向同步，编辑态的唯一来源仍是组件内部的 `status.editor`，避免父组件与子组件互相覆盖。
- **变量声明顺序**：`status` 与 `editor` 必须在 `showIcon` 与 `watch` 之前声明。`watch` 的 getter 在 setup 阶段立即求值，若 `status` 声明在后会触发 TDZ（`Cannot access 'status' before initialization`），整个页面白屏。
- `DetailDescription` 的图标用 `v-if="!(editing || status.modifyDescription)"`：失焦提交时 `status.offEditor()` 会先执行、保存请求还没回来，只看 `editing` 会让图标在保存期间闪现。
- `editDescription()` 增加 `editing` 守卫，双击或误触不会重复进入编辑。

## 行为变化与兼容性

- `TextEditor` 的新属性都有默认值（`hideEditIcon: false`），`DetailSeason` 的季/集标题不需要改动。
- `v-model:editing` 是可选绑定，未绑定时组件行为与改造前一致。
- 描述编辑的交互与写入流程不变：仍是失焦提交、乐观更新、失败回滚。

## 验证

- `cd web && npx vue-tsc --build`、`npx vite build` 通过。
- 无头 Chrome 实测：进入详情页图标存在 → 点击图标后图标消失且描述区域 `contenteditable="true"` → 输入内容后点击标题失焦，保存期间图标仍不出现 → 约 2.5s 后接口返回，图标重新出现，描述文本为「补充的剧情简介」。
- 回归：季标题、集标题的内联图标仍在，点击不再触发折叠/播放（沿用 `[contenteditable="true"]` 的冒泡拦截）。

## 关联文档

- `web/AGENTS.md`：`## 详情页文本编辑`
