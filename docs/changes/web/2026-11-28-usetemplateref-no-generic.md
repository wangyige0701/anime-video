# 移除项目内 useTemplateRef 的泛型参数

- 日期：2026-11-28
- 模块：web
- 类型：重构

## 背景

`useTemplateRef('x')` 的类型由 `vue-tsc` 从模板里对应的元素或组件推断，手写泛型只是覆盖推断结果：写窄了会漏掉真实成员，写宽了会让后续模板改动不再被检查。

## 改动

全项目共 39 处 `useTemplateRef` 调用，其中 6 处带泛型，全部移除：

| 文件                                      | 原写法                                          | 推断结果                                                    |
| ----------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| `components/detail/DetailDescription.vue` | `useTemplateRef<{ edit: () => Promise<void> }>` | `TextEditor` 实例（其 `defineExpose({ edit })` 已被推断到） |
| `components/icons/PlayStartIcon.vue`      | `useTemplateRef<SVGPathElement>`                | `SVGPathElement`（模板里是 `<path>`）                       |
| `components/index/IndexFilterOptions.vue` | `useTemplateRef<HTMLElement>` ×2                | `HTMLDivElement`（`root` / `row` 都是 `<div>`）             |
| `components/index/IndexTimeAxis.vue`      | `useTemplateRef<HTMLElement>`                   | `HTMLDivElement`（`viewport` 是 `<div>`）                   |
| `views/[seriesId]/[name].vue`             | `useTemplateRef<ComponentPublicInstance>`       | `el-collapse` 的组件实例，`$el` 仍可访问                    |

其余 33 处本来就没有泛型，未改动。

## 验证

- `vue-tsc --build` 通过：移除泛型后所有引用点（`editorRef.value?.edit()`、`loopGuide.value` 的 SVG 方法与属性、`viewport.value?.getBoundingClientRect()`、`listRef.value?.$el`）都能从推断类型上解析。
- `build` 与 `vitest run`（44 文件 / 430 例）通过。
- 纯类型改动，无运行时行为变化，未做 DOM 实测。

## 规范

`web/AGENTS.md` 的「模板引用」补了一条：不得给 `useTemplateRef` 传泛型，并给出反例。
