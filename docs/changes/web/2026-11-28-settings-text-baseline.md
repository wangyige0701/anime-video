# 设置面板摘要三列基线错位修复

- 日期：2026-11-28
- 模块：web
- 类型：修复
- 涉及模块：web

## 现象

Bangumi 与 AI 设置面板的生效值摘要里，`User-Agent` 那一列的标签与值整体比左右两列高约 3px。三列并排时表现为「接口地址 / User-Agent / 超时」的标签不在同一条水平线上，值也一样，视觉上像是其中一列浮起来。

## 根因

`SettingSection` 的 `.meta-item dt` / `dd` 只声明了 `font-size`，没有声明 `line-height`，行盒高度按 `line-height: normal` 由实际命中的字体决定：

- 中文文案（`接口地址`、`超时`）走 CJK 字体回退，11px 下的行盒高 15px。
- 纯拉丁文案（`User-Agent`）走西文字体，同样的 11px 行盒只有 12px。

`.meta-item` 是纵向 flex，第二个子元素紧接第一个的行盒排下去，于是 `User-Agent` 这一列的值比其它两列高 3px。用 CDP 量到的数据：

```
修前  dtY 222 / dtH 15 / ddY 240   （接口地址）
      dtY 222 / dtH 12 / ddY 237   （User-Agent，值高 3px）
      dtY 222 / dtH 15 / ddY 240   （超时）
修后  dtY 222 / dtH 15.4 / ddY 240.4  ×3
```

## 修复

1. `.meta-item dt` / `dd` 显式写 `line-height: 1.4`，行盒不再随字形变化，三列标签与值各自共基线。
2. 同类问题一次性清掉：面板里其余只写了 `font-size` 的文字块（`AiSettingsCard` 的 `.secret-state` / `.unit` / `.result`、`BangumiSettingsCard` 的 `.unit` / `.result`、`PlayerSettingsCard` 的 `.value`、`SettingAdvanced` 的 `.toggle` / `.chevron` / `.summary`）补上明确行高。这些位置多数靠父级 `align-items: center` 兜着，暂时没露馅，但同样会在中英混排时错开。
3. 设置页菜单（`views/setting.vue`）的分组标题原先也没有行高，一起补上。

## 样式复用

「字号必须带行高」如果靠每个块手写 `font-size` + `line-height` 两行，下次新增文字块照样会漏。抽成 `web/src/scss/mixin/text.scss` 的 `text($size, $line-height, $color)`：

```scss
@use '@/scss/mixin/text.scss' as text;

.label {
	@include text.text(0.875rem, 1.5, map.get(token.$theme, 'l-9'));
}
```

- 字号与行高成为一个不可拆的参数对，漏写行高在语法层面就不可能。
- 颜色仍由调用方传表达式：面板里有成功绿、危险红这类固定色，统一按主题 tone 取色反而受限。
- 设置模块的 7 个组件与 `views/setting.vue` 全部改走 mixin，`map.get(token.$theme, …)` 的重复写法没有增加，行高散落的情况收敛到一个地方。
- `web/AGENTS.md` 的设置页约定新增一条：面板内带 `font-size` 的文字块必须同时给 `line-height`，统一用 `text()` mixin，不依赖浏览器默认值。

## 影响面

只改行高常量与写法复用，不改字号、颜色、间距与结构。摘要块高度从 49px 变成 52.6px（`dd` 行盒由 15px 到 18.2px），仍在面板原有节奏内。表单字段、折叠区、操作条的位置与点击行为不变；改走 mixin 前后用 CDP 复测，盒模型数值完全一致。

## 验证

- CDP 实测三列 `dt` / `dd` 的 `y` 与 `h` 完全一致（见上表）。
- 1280×700 视口截图对比修前修后：摘要三列横向共线，面板整体无溢出、无错位。
- 外观页与播放器页截图复查：主题名称、色板、菜单文案颜色与间距无变化。
- 改走 `text()` mixin 前后各测一次盒模型，数值完全一致（`metaBox` 222 / 52.6，三列 `ddY` 240.4），确认重构没带入视觉回归。
- `pnpm --filter web type-check`、`pnpm --filter web build`、`pnpm exec vitest run`（38 文件 / 387 用例）、`node scripts/check-vue-tags.mjs` 通过。
- 本次是纯样式常量调整，不涉及分支逻辑，未新增测试；对齐结果由 CDP 量测数据固定。

## 备注

用户贴的截图来自移除面板头部图标块之前的版本，图标那部分已在 `4d8943e` 处理；本次只解决摘要列基线问题。
