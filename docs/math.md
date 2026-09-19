---
summary: 'Math rendering: MathJax → self-contained SVG, why not KaTeX HTML/CSS, sizing and baseline handling'
read_when:
  - Modifying rehype-math plugin
  - Debugging math formula rendering in the WeChat editor
  - Considering alternative math rendering approaches
---

# 数学公式渲染技术决策

> 调研日期：2026-09-19

## 最终方案

**MathJax SVG 输出 + `fontCache: 'none'` + `<img>` data URI**

1. `rehypeMath` 在 HAST 文本节点中扫描 `$$...$$`（行间）与 `$...$`（行内）
2. MathJax（TeX → SVG，`fontCache: 'none'`）输出自包含 SVG
3. 宽高从 `ex` 换算成 px，`vertical-align` 从 SVG 移到 `<img>` 并换算成 px
4. 以 `<img src="data:image/svg+xml;base64,...">` 内嵌

## 为什么不用 KaTeX（HTML + CSS）

KaTeX 的 `output: 'html'` 依赖 CSS 布局：

- 嵌套 `.vlist` 用 `display: inline-table / table-row / table-cell`
- 子行是 `height: 0` 的空块，靠内联 `top: -Xem` 定位

公众号编辑器**删除 `position`**（B 级），且 **`transform` 大多失效**（B 级）。
实测：把 `top` 改写成 `transform: translate()` 后本地浏览器完全正常，粘贴进
公众号仍然错位（分子分母飞到相邻行）。

KaTeX 也没有 SVG 输出：`svgGeometry` 只服务于可拉伸符号（根号、花括号），
主体字形是 HTML 文本 + Web 字体，拿不到矢量路径。

## 为什么 MathJax 必须用 `fontCache: 'none'`

默认（`global`）MathJax 把字形路径放进共享 `<defs>`，用
`<use xlink:href="#mjx-xx">` 引用。公众号编辑器**删除 SVG 内的 `id`**，
引用会全部失效。`fontCache: 'none'` 让每个字形直接输出 `<path d="...">`，
SVG 自包含、不依赖 id（代价是体积更大）。

## 为什么用 `<img>` data URI，而不是内联 `<svg>`

- data URI 不经过编辑器的属性过滤（只有 `src` 被校验，且 `data:image/*;base64,` 在白名单内）
- 浏览器在隔离环境里渲染 SVG，不受外层 CSS 干扰
- 2026-09-19 实测：公众号编辑器可以正常显示 `data:image/svg+xml;base64` 图片

代价：SVG 内部无法继承 `currentColor`，所以显式写入 `color: #1d1d1f`。

## 尺寸与基线处理

| 问题 | 处理 |
|------|------|
| MathJax 输出 `width="12.3ex"` | data URI 内没有字体上下文，ex 无意义 → 按 `ex` 配置换算成 px |
| MathJax 把 `vertical-align: -0.338ex` 放在 SVG 上 | 移到 `<img>` 上并换算成 px，保证行内公式对齐文本基线 |
| 行间公式 | `display: block; margin: 1.2em auto` |

## 扫描规则（避免误伤）

`$` 在中文技术文档里也可能是货币符号，因此：

- `\$` 视为转义，不解析
- 行内 `$...$` 不允许跨行、不允许首尾空格（`价格 $5 到 $10` 不会被误判）
- 未闭合的 `$` 原样保留
- `pre` / `code` / `kbd` / `samp` 子树内不解析

## 依赖

`mathjax-full` 是普通依赖，运行时用 `createRequire` 动态加载；
文档中没有公式时零开销（与 mermaid 插件一致）。
