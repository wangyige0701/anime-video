# 合并角标在成员面板打开期间保持展开

## 背景

角标的展开态原来只有 `:hover` 一个来源：指针压上去，`max-width` 过渡把「图标 + 数字」换成「已合并 N 个系列」；指针离开，缩回数字。

成员面板是 `el-popover`，内容 teleport 到 `body`，与角标不在同一棵子树里。于是出现断裂：指针从角标移进面板时，角标立刻失去 hover、缩回 37px 的数字态，而用户其实正在看面板。视觉上像「刚点开就关了」。

## 改动

展开态改为两个来源的并集：指针悬停，或成员面板正在打开。

```vue
<el-popover v-model:visible="panelVisible" trigger="click" …>
	<template #reference>
		<button class="merge-badge" :class="{ 'is-pinned': panelVisible }" :aria-expanded="panelVisible">
```

```ts
/**
 * 成员面板是否打开。
 *
 * 角标的展开态原来只靠 CSS `:hover`。面板是 teleport 到 body 的独立弹层，
 * 鼠标移进面板后角标就失去 hover，文字会缩回数字——用户还在看面板，角标却已经收起。
 * 因此把展开态拆成「悬停」与「面板打开」两个来源，任一成立就展开。
 */
const panelVisible = ref(false);
```

```scss
// 展开态有两个来源：指针悬停，或成员面板正打开（此时指针已移进弹层）
&:hover,
&.is-pinned {
	…
}
```

`v-model:visible` 在这一版 Element Plus（2.14.5）上是支持的：`el-popover` 声明了 `visible` 属性并 emit `update:visible`。

## 行为对照

| 动作                   | 面板 | 角标                                     |
| ---------------------- | ---- | ---------------------------------------- |
| 悬停角标               | 关   | 展开                                     |
| 点击角标               | 开   | 展开（`is-pinned`）                      |
| 指针移进面板           | 开   | 保持展开（hover 已丢失，靠 `is-pinned`） |
| 点空白处关闭面板       | 关   | 收回（指针不在角标上）                   |
| 再次点击角标关闭       | 关   | 仍展开（指针还在角标上，hover 仍在）     |
| 从角标移开、面板未打开 | 关   | 收回                                     |

最后两行是刻意区分的：收回的唯一依据是「指针不在角标上且面板没开」，而不是「点击过一次」。

## 验证

CDP 夹具（3 个系列、A 合并 B），读 `is-pinned` / `.merge-label` 的 `opacity` 与 `max-width` / 角标宽度 / 面板 `display`：

```
1 悬停角标       {"pinned":false,"expanded":true,"labelMaxWidth":"120px","badgeWidth":116,"panelOpen":false}
2 点击后面板打开 {"pinned":true, "expanded":true,"labelMaxWidth":"120px","badgeWidth":116,"panelOpen":true}
3 移进面板       {"pinned":true, "expanded":true,"labelMaxWidth":"120px","badgeWidth":116,"panelOpen":true}
4 点空白关面板   {"pinned":false,"expanded":false,"labelMaxWidth":"0px","badgeWidth":37,"panelOpen":false}
5 指针在空白处   {"pinned":false,"expanded":false,"labelMaxWidth":"0px","badgeWidth":37,"panelOpen":false}
```

第 3 步是关键：指针已在面板内，`panelOpen` 为真、`is-pinned` 为真、宽度仍是 116px。

再次点击角标的回归：

```
初始        {"pinned":false,"badgeWidth":116,"labelOpacity":"1","panelOpen":false}   ← 指针在角标上
第一次点击  {"pinned":true, "badgeWidth":116,"labelOpacity":"1","panelOpen":true}
第二次点击  {"pinned":false,"badgeWidth":116,"labelOpacity":"1","panelOpen":false}  ← 面板已关，指针仍在
```

`vue-tsc` 与 `check-undefined` 通过，全量 455 例未受影响（纯展示层改动）。
