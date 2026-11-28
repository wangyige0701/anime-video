# 上线时间选择器的选中月份不再高亮

- 日期：2026-11-28
- 模块：web
- 类型：修复
- 涉及模块：web

## 现象

详情页「上线时间」有值时（例如 `2026 / 10`），展开的月份面板里没有任何一格处于选中状态，看不出记录的是哪个月；面板打开时也总是停在当前年月，而不是记录里的年月。

## 根因

两层问题叠在一起，只修任一层都看不到效果。

**1. 值类型不对，面板拿不到当前值**

`DetailDate.vue` 的 `bindDate` getter 返回的是 `[年, 月]` 元组。`el-date-picker-panel` 把 `modelValue` 交给 dayjs 解析，数组会得到 Invalid Date，于是 `parsedValue` 无效：

```
内部判定：style.current = parsedValue.some((date) => dayjs.isDayjs(date) && ...)
parsedValue 无效 → 没有任何 td 拿到 current
```

CDP 实测修前只有「十一月」带 `today`，其余十一格类名为空 —— 印证了「不是样式没写，而是根本没有选中态」。

**2. 选中态的颜色成对取值，实际是白底白字**

Element Plus 的月份/年份选中样式是：

```css
.el-month-table td.current:not(.disabled) .el-date-table-cell__text {
	color: #fff;
	background-color: var(--el-datepicker-active-color);
}
```

而 `DetailDate.vue` 里把 `--el-datepicker-active-color` 设成了 `token.$text-color-primary`（`#fff`，本意是输入文字色）。所以即使值类型修好，选中格也会变成白色药丸 + 白字。

## 修复

- 新增 `utils/date.ts` 的 `toMonthDate([年, 月])`：转成当月 1 号的 `Date`，年月缺失或越界（`0`、`13`、负数）返回 `undefined`，让面板回落到默认视图而不是产出 Invalid Date。纯函数，用例在 `test/web/date.test.ts`。
- `DetailDate.vue` 的 getter 改用 `toMonthDate(date.value)`；setter 不变。
- 选中态在 scoped 块里成对指定：底色取主题最亮色 `l-9`、文字取最深色 `d-9`、字重 500，同时覆盖 `.el-month-table` 与 `.el-year-table` 的 `td.current`。用主题梯度而不是固定色，五个主题下都够清楚。

## 影响面

- 只改详情页日期面板的取值与选中态；`updateDate()` / `removeDate()` 的保存链路、占位状态、重置按钮均未变。
- 因为值终于能被解析，面板打开时会定位到记录的年月（以前固定落在当前年月），这是同一处修复带来的行为改善。
- 选中格悬停时仍保持深字，不会被 `--el-datepicker-hover-text-color` 冲成浅色。

## 验证

```bash
pnpm exec vitest run test/web/date.test.ts
pnpm --filter web type-check
```

CDP 实测（`.cache/sync-confirm-check.mjs` 的夹具思路，拦截 `/data/*`，不读真实媒体库）：

| 场景            | 修复前                                  | 修复后                                                           |
| --------------- | --------------------------------------- | ---------------------------------------------------------------- |
| 值 `[2026, 10]` | 12 格全部无类名，只有「十一月」是 today | 「十月」`current`，底色 `rgb(229,223,255)`、文字 `rgb(25,19,51)` |
| 值 `[2019, 3]`  | 头部显示当前年 2026                     | 头部 `2019 年`，「三月」`current`                                |
| 年份面板        | 每年无选中                              | `2026` 带 `current`，亮底深字                                    |
| 悬停选中格      | —                                       | 文字仍为深色（`rgb(25,19,51)`），底色不变                        |
| 悬停普通格      | —                                       | 文字提亮到 `l-9`，有明确反馈                                     |
| 值为空          | 无选中                                  | `current` 数量 0，占位文案正常，选「三月」后展示为 `2026 / 03`   |

暖色主题（日落橙）下截图复核：药丸为浅橙底 + 深棕字，与深色面板对比充足。
