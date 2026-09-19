---
summary: 'Research: 微信公众号编辑器兼容性与 Markdown->HTML 转换策略'
read_when:
  - 设计 Markdown 转公众号 HTML 的渲染管线
  - 需要实现图片压缩、格式转换与 base64 内嵌
  - 排查粘贴到公众号编辑器后样式/标签丢失问题
---

# 微信公众号编辑器兼容性研究

> 调研日期：2026-02-22
> 调研目标：为 `PostPress` 明确"可稳定粘贴到公众号编辑器"的 HTML 生成边界，并形成可实现的工程策略（含 `sharp` 图片链路）。

## 1. 结论先行（可直接用于实现）

1. **图片必须做预处理**：以 `<= 2MB` 为粘贴安全阈值，优先输出 PNG，保留 GIF 动图，必要时降尺寸/降质量。
2. **样式必须内联**：`<style>` 和 `<link>` 会被剥离；输出以元素级 `style` 属性为唯一样式载体。
3. **禁用脚本与高风险标签**：`<script>`、表单/交互类标签、外链依赖都应在转换阶段移除。
4. **SVG 需做兼容处理后内嵌**：SVG 内 `<image>` href 必须来自微信素材库（外链和 base64 不显示）；内联 SVG 本身可工作，但需移除 `id`/`<style>`/`<script>`/`<a>` 等被过滤的内容，并为 iOS 兼容指定 `width`/`height`。
5. **链接要做脚注适配**：外链会触发安全提示弹窗，`id` 属性被删导致锚点失效，建议外部链接转脚注列表。
6. **代码块需空白保护**：换行转 `<br>`、前导空格转 `&nbsp;`/`\u00A0`，是防止粘贴后格式塌陷的硬需求。
7. **div 转 section**：微信对 `<div>` 的行为不稳定，建议转为 `<section>`。
8. **裸文本节点包裹 span**：块级元素内的裸文本节点需用 `<span>` 包裹，否则内联样式无法作用于文本。

## 2. 证据分级

- **A 级（文档可确认）**：接口文档明确写出限制（格式、大小、JS 禁止等）。
- **B 级（成熟开源实现共识）**：多个项目已针对同一问题实现 workaround，可交叉验证。
- **C 级（需回归验证）**：公众号编辑器未公开白名单，行为可能随版本变化。

## 3. 公众号约束明细

### 3.1 HTML 标签支持

#### 已知可用标签（B 级 + C 级交叉验证）

**内联元素：**
`<span>` `<strong>` `<b>` `<em>` `<i>` `<u>` `<ins>` `<del>` `<s>` `<sub>` `<sup>` `<a>` `<img>` `<br>` `<code>`

**块级元素：**
`<p>` `<h1>`–`<h6>` `<hr>` `<ol>` `<ul>` `<li>` `<blockquote>` `<pre>` `<table>` `<thead>` `<tbody>` `<tr>` `<td>` `<th>` `<section>` `<figure>` `<figcaption>`

> 微信小程序 editor 组件文档明确列出的标签：内联 `span, strong, b, ins, em, i, u, a, del, s, sub, sup, img`；块级 `p, h1-h6, hr, ol, ul, li`。注意 `<div>` 会被转为 `<p>` 存储。公众号文章编辑器与小程序 editor 组件不完全一致，但大部分行为相同。

#### 禁止/不兼容标签

| 类别 | 标签 | 证据 |
|------|------|------|
| 脚本 | `<script>` | A 级：文档明确"不支持 JS 脚本" |
| 样式 | `<style>`, `<link>` | B 级：所有开源项目共识，编辑器会剥离 |
| 框架 | `<iframe>` | A 级：安全限制 |
| 表单 | `<form>`, `<input>`, `<textarea>`, `<select>`, `<button>` | B 级：无表单提交能力 |
| 媒体 | `<audio>`, `<video>`, `<object>`, `<embed>` | B 级：使用微信专用 `<mpvoice>` `<mpvideo>` |
| 画布 | `<canvas>` | C 级：不兼容 |

#### 属性过滤规则

| 属性 | 行为 | 证据 |
|------|------|------|
| `id` | **全部删除** | B 级：bm.md、CSDN 文章均确认；锚点链接完全失效 |
| `class` | 保留但无实际作用 | B 级：无 `<style>` 支持，class 无法匹配选择器 |
| `style` | **保留**（唯一样式载体） | A+B 级：所有项目共识 |
| `data-*` | 部分保留 | C 级：未有定论 |
| `on*` 事件 | **全部删除** | A 级：不支持 JS |
| `href` | 保留（外链触发安全提示） | B 级 |
| `src` | 保留（支持 base64 Data URI） | B 级 |

### 3.2 CSS 属性支持

#### 可用属性

| 类别 | 属性 | 证据 |
|------|------|------|
| 字体 | `font-size`, `font-weight`, `font-style`, `font-variant` | B 级 |
| 字体族 | `font-family`（仅系统字体，`@font-face` 不可用） | B 级，注意带 `font-family` 的 style 在某些场景会被整体丢弃 |
| 颜色 | `color`, `background-color`（纯色） | B 级 |
| 文本 | `text-align`, `text-decoration`, `text-indent`, `letter-spacing`, `line-height`, `word-break`, `white-space` | B 级 |
| 间距 | `margin`/`padding`（四方向） | B 级 |
| 边框 | `border`, `border-radius`, `box-shadow` | B 级 |
| 显示 | `display`（`block`, `inline-block`, `inline`） | B 级 |
| 对齐 | `vertical-align` | B 级 |
| 尺寸 | `width`, `height`, `max-width`, `min-width` | B 级 |
| 其他 | `opacity`, `pointer-events: none`, `overflow` | B 级 |

**单位：** 优先 `px`；`vw`/`vh` 可用于自适应；避免 `%`（margin-top 等场景失效）。

#### 不可用属性

| 属性 | 说明 | 证据 |
|------|------|------|
| `position`（所有值） | 编辑器直接删除 position 相关代码 | B 级：CSDN 实测文章确认 |
| `z-index` | 依赖 position，无效 | B 级 |
| `float` | 易导致布局混乱，展开内容时元素脱离容器 | B 级 |
| `@media` | 无法写 `<style>` 标签 | B 级 |
| `@keyframes` | 同上 | B 级 |
| `@font-face` | 同上 | B 级 |
| `transform` | 大多失效（简单变换可能生效） | B 级 |
| 伪类/伪元素 | `:hover`, `::before` 等，无全局样式支持 | B 级 |
| `linear-gradient()` | 兼容性差 | B 级 |

#### 推荐字体栈

**调研前推荐（通用方案）：**

```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue",
             PingFang SC, Hiragino Sans GB, Microsoft YaHei UI, Microsoft YaHei,
             Arial, sans-serif;
```

**PostPress 实际采用（微信原生字体栈，2026-02-23 确定）：**

```css
font-family: "mp-quote", PingFang SC, system-ui, -apple-system, BlinkMacSystemFont,
             Helvetica Neue, Hiragino Sans GB, Microsoft YaHei UI, Microsoft YaHei,
             Arial, sans-serif;
```

来源：微信编辑器自身使用的 `mp-quote` 字体族。调研了 4 个主流开源微信 Markdown 编辑器（doocs/md、lyricat/wechat-format、ufologist/wechat-mp-article、mzlogin/online-markdown），其中只有 lyricat/wechat-format 使用逐元素内联 font-family 方式（与 PostPress 架构一致）。

**关键约束：** font-family 必须在每个文本承载元素上内联设置，不能依赖 CSS 继承（微信剥离 `<style>` 标签）。

### 3.3 图片格式与大小

#### A 级证据

- 临时素材接口（`media/upload`）：`image` 支持 `bmp/png/jpeg/jpg/gif`，大小 `2MB`。
- 图文内图片上传接口（`media/uploadimg`）：仅 `jpg/png`，且 `1MB`。
- 微信编辑器屏蔽非微信域名的图片外链。
- base64 Data URI（`data:image/png;base64,...`）可在编辑器中正常显示。

#### 落地原则

- 以 `<= 2MB` 为 base64 粘贴安全阈值。
- 优先 PNG（保真度最高），GIF 保留动画语义。
- SVG 保留为内联 SVG，但需做兼容清洗（移除 id/style/script、确保有 width/height）。
- 若未来接入"直接发草稿"API，需按具体接口切换到 `1MB` 规则。

### 3.4 SVG 限制

| 限制 | 说明 | 证据 |
|------|------|------|
| `<image>` href | 必须来自微信素材库，外链和 base64 均不显示 | B 级 |
| 嵌套 SVG | 不支持 SVG 内嵌套 SVG | B 级 |
| `id` 属性 | SVG 内的 id 会被删除 | B 级 |
| `<g>` 内联 style | Android/桌面端正常，iOS 上 `transform-origin` 等失效 | B 级 |
| SVG 内禁止标签 | `<style>` `<script>` `<a>` | B 级 |
| SMIL 动画 | 技术可行但 iOS 兼容性极差 | B 级 |

**工程策略：** 保留内联 SVG，但做以下兼容处理：
1. 移除 SVG 内的 `id` 属性（会被微信删除）
2. 移除 SVG 内的 `<style>`、`<script>`、`<a>` 标签
3. 将 CSS class 选择器样式转为内联 `style` 属性
4. 确保根 `<svg>` 元素有显式的 `width`/`height`（iOS 必须）
5. 避免嵌套 SVG
6. SVG 内 `<image>` 标签的图片需转为 base64 Data URI（注意微信对此支持不可靠，优先考虑不使用 `<image>`）

#### 2026-09-19 实测补充（19 项探针逐条粘贴验证）

| 探针 | 内容 | 结果 |
|------|------|------|
| 7 | `<img src="data:image/png;base64,...">` | 正常显示 |
| 8 | 内联 `<svg>` | 正常显示 |
| 18 | `<img src="data:image/svg+xml;base64,...">` | 正常显示 |
| 19 | 2x PNG（Retina） | 正常显示 |

结论：**`data:image/svg+xml;base64` 在公众号编辑器中可用**，此前"微信不支持 SVG data URI，
必须栅格化为 PNG"的假设不成立。PostPress 已改为默认保留矢量 SVG：

- `src/wechat/svg.ts` — SVG 清洗（去 `id`/`<style>`/`<script>`/`<a>`、补 `width`/`height`/`xmlns`）
- `rehype-base64-images` — 默认输出 `data:image/svg+xml;base64`，仅在依赖 `url(#id)` /
  `<foreignObject>` / 嵌套 SVG 时降级为 PNG（`svgMode: auto`）
- `rehype-math` — 公式走 MathJax SVG（见 `docs/math.md`）

#### Mermaid 图表的特殊处理（2026-02-22 实测）

微信不支持内联 SVG 的复杂子集（mermaid 生成的 SVG 包含 `<style>`、`<foreignObject>`、`id` 等），因此 mermaid 图表必须转为 PNG 位图。
注意：这不是因为微信不支持 SVG（见上方 2026-09-19 实测），而是 mermaid 的 SVG 依赖了被编辑器剥离的特性。

**采用方案：** Playwright Chromium 截图（`deviceScaleFactor: 2`）+ `<img width>` 控制显示尺寸。

**排除的替代方案：**
- sharp SVG→PNG：librsvg 不支持 `<foreignObject>`，而 mermaid `htmlLabels: true` 依赖 foreignObject 渲染文字
- deviceScaleFactor: 1：手机 Retina 屏幕上文字模糊
- mermaid API 导出：无法分离渲染质量与输出尺寸

详见 `docs/mermaid.md`。

### 3.5 代码块空白保护

#### B 级证据（bm.md + md2oa 共识）

微信编辑器会过滤 `<pre>` 中的换行符和前导空格，`white-space: pre` 效果丢失。

| 原始字符 | 替换为 | 原因 |
|---------|--------|------|
| `\n` | `<br>` | 编辑器吞掉换行符 |
| **所有空格** | `\u00A0`（NBSP） | 编辑器对 `<span>` 间普通空格做 justify 拉伸或删除 |
| 制表符 `\t` | `\u00A0\u00A0` | 编辑器不支持制表符 |
| `\r\n` | `<br>`（忽略 `\r`） | CRLF 兼容 |

**关键实现：** 只替换文本节点中的空白，不替换 HTML 标签属性内的。

**2026-02-23 实测补充：**

1. **必须替换所有空格，不仅是行首空格**。微信编辑器对代码块内 `<span>` 标签之间的普通空格应用 `text-align: justify` 拉伸，导致单词间距异常宽。只替换行首空格不够，必须替换代码块内全部空格为 `\u00A0`。
2. **必须在 `<code>` 上设置 `text-align: left`**。即使全部空格替换为 NBSP，微信编辑器仍可能对换行后的文本做 justify。显式设置 `text-align: left` 是必要的防御。
3. 两个修复缺一不可：NBSP 防止空格被删除/合并，`text-align: left` 防止 justify 拉伸。

```typescript
// PostPress 实际实现（rehype-code-highlight.ts protectWhitespace）
// 在 HAST 层逐 text 节点处理，递归进入 <span>（hljs 嵌套 span）
text = text.replace(/\t/g, '\u00A0\u00A0');  // tab → 2 NBSP
text = text.replace(/ /g, '\u00A0');          // ALL spaces → NBSP
// \n → <br> element (split by \n, insert <br> between parts)
```

### 3.6 链接处理

#### B 级证据

- 微信文章链接（`mp.weixin.qq.com`）可正常跳转。
- 外部链接触发安全提示弹窗，用户体验差。
- `id` 被删导致页内锚点（`#id`）完全失效。
- bm.md 实现了 `rehypeFootnoteLinks` 插件处理此问题。

#### 推荐策略

外部链接转脚注列表：

```
转换前：点击[这里](https://example.com)查看
转换后：点击这里[1] 查看

---
References
1. 这里: https://example.com
```

- 保留 `mp.weixin.qq.com` 域名链接为 `<a>` 标签
- 其他外部链接替换为 `<span>` + `<sup>[N]</sup>`
- 文末追加 `<section class="footnotes">` 脚注列表
- 相同 URL 复用同一脚注编号
- 锚点链接（`#`、`/`、`./`、`../` 开头）不做脚注处理

### 3.7 其他易塌陷点

| 问题 | 处理策略 | 证据 |
|------|---------|------|
| `<div>` 行为不稳定 | 转为 `<section>` | B 级：bm.md 实现 `rehypeDivToSection` |
| 裸文本节点无法接收内联样式 | 用 `<span>` 包裹块级元素内的裸文本 | B 级：bm.md 实现 `rehypeWrapTextNodes` |
| 任务列表 `<input type="checkbox">` | 替换为 Unicode 字符 ☑（checked）/ ☐（unchecked） | B 级：bm.md |
| 列表 `<li><p>内容</p></li>` | 扁平化为 `<li>内容</li>` | B 级：bm.md |
| GFM 脚注回链 `↩` | 移除（锚点不可用） | B 级：bm.md |
| 嵌套列表超过 2 层 | 编辑器会截断为最多 2 层 | B 级：wechat-mp-article 实测 |

### 3.8 图片边距（2026-02-24 实测）

图片 `<img>` 不应设置上边距（`margin-top`）。当图片是文章首个元素（如封面图）时，上边距会在微信编辑器中产生不可接受的顶部空白。

**修复：** `margin: 1.5em auto` → `margin: 0 auto 1.5em`，仅保留底部间距和水平居中。

### 3.9 HTML 输出编码声明（2026-02-24 实测）

rehype-stringify 输出的是 UTF-8 编码的 HTML 片段（无 `<html>`/`<head>` 文档壳）。浏览器打开此文件时若无 charset 声明，默认按 Latin-1 解码，导致中文显示为乱码（mojibake）。

**修复：** 写入文件时在 HTML 片段前加 `<meta charset="utf-8">`。剪贴板内容不加（粘贴到微信编辑器时作为片段处理，不需要 charset 声明）。

## 4. 开源项目分析

### 4.1 bm.md（miantiao-me/bm.md）— 借鉴价值 ★★★★★

**架构：** React 19 + TanStack Start + Vite 7 全栈 Web 应用

**技术栈与 PostPress 的关系：** 同样使用 unified (remark + rehype) 管线，技术路线最接近。

**可借鉴：**

| 特性 | 实现方式 | 对 PostPress 的意义 |
|------|---------|------------------|
| CSS 内联 | `juice.inlineContent(html, css)` 将 CSS 选择器匹配并内联 | PostPress 可在 rehype 层直接注入（方案 A），或用 juice 后处理（方案 B） |
| 平台适配器 | `PlatformAdapter` 接口，各平台独立插件集 | 清晰解耦，PostPress 若未来支持多平台可参考 |
| 微信链接转脚注 | `rehypeFootnoteLinks` 插件 | 直接可移植的 rehype 插件模式 |
| 代码空白保护 | `protectCodeWhitespace` — 精确区分行首/行内/标签间空格 | 最细粒度的处理方案 |
| 文本节点包裹 | `rehypeWrapTextNodes` — 裸文本包 `<span>` | 确保 juice 能内联样式到文本 |
| div → section | `rehypeDivToSection` | 规避微信 `<div>` 不稳定问题 |
| 任务列表适配 | checkbox → Unicode ☑/☐ | 简洁有效 |
| Worker 渲染 | oRPC + MessagePort | PostPress 是 CLI，不需要此设计 |
| CSS 构建 | `?raw` + lightningcss 压缩 | PostPress 是 CLI，样式表可直接内嵌 |

**注意点：**
- bm.md 是 Web 应用，有很多 UI/前端逻辑与 PostPress CLI 无关
- 平台适配器模式对 PostPress 当前阶段过于复杂

### 4.2 obsidian-md2wechat（geekjourneyx/obsidian-md2wechat）— 借鉴价值 ★★☆☆☆

**架构：** Obsidian 插件，TypeScript，API-first 模式

**核心特点：** 所有 Markdown 转换由远程 API（`md2wechat.cn/api/convert`）完成，插件只是客户端壳。

**可借鉴：**

| 特性 | 实现方式 |
|------|---------|
| 剪贴板策略 | 三级降级：ClipboardItem (HTML+text) → execCommand → writeText |
| HTML+纯文本双格式 | 确保微信编辑器识别富文本 |
| XSS 防护 | 渲染前移除 `<script>` 标签 |

**注意点：**
- 转换逻辑完全在服务端，是黑盒，无法参考核心实现
- 无本地图片处理能力
- 离线不可用

### 4.3 md2oa（shaogefenhao/md2oa）— 借鉴价值 ★★★☆☆

**架构：** Node.js CLI + VS Code 扩展，纯 JavaScript

**技术栈：** marked → cheerio → highlight.js → juice → HTML 文件

**可借鉴：**

| 特性 | 实现方式 | 对 PostPress 的意义 |
|------|---------|------------------|
| juice 占位符保护 | CSS 内联前用占位符替换 `&nbsp;` 和 `<br>`，处理后还原 | 若 PostPress 使用 juice 方案需要此技巧 |
| 代码空白精确替换 | 正则区分 HTML 标签和文本节点 | 简洁实用的实现方案 |
| 本地图片转 base64 | cheerio 遍历 `<img>`，读取本地文件转 Data URI | 逻辑直观，PostPress 已有类似实现 |
| 模板系统 | HTML 模板 + `{{body}}` 占位符，4 种内置主题 | PostPress 是 CLI，不需要模板系统 |
| macOS 代码框 | 内联 SVG 三色圆点装饰 | 视觉效果好，但 SVG 在微信中有兼容风险 |

**注意点：**
- 没有图片压缩/缩放功能（大图直接 base64 会超限）
- `marked` 配置使用了 v11 已废弃的 `smartLists`/`smartypants`
- 未处理链接转脚注
- SVG 装饰在微信中有兼容性风险，无降级方案
- VS Code 扩展复制了整个 lib 目录（维护成本高）

## 5. PostPress 推荐实现策略

### 5.1 渲染管线

```
Markdown → MDAST → HAST → sanitize → image → code-highlight → inline-style → stringify
```

执行顺序：

1. `rehypeSanitizeTags` — 移除不兼容/危险标签、div 转 section、裸文本包 span
2. `rehypeBase64Images` — 图片处理（sharp 压缩 + 格式转换 + base64）
3. `rehypeCodeHighlight` — 代码高亮（rehype-highlight）+ 空白符保护
4. `rehypeFootnoteLinks` — 外部链接转脚注（可选，默认开启）
5. `rehypeInlineStyles` — 样式内联（最后执行，确保所有节点已稳定）

### 5.2 CSS 内联方案选择

| 方案 | 说明 | 适用场景 |
|------|------|---------|
| **A: rehype 插件直接注入**（推荐） | 在 HAST 层按标签名从样式映射表查找并注入 `style` 属性 | PostPress 场景——标签名到样式的简单映射，无复杂选择器需求 |
| B: juice 后处理 | HTML 字符串输出后用 juice 内联 | 需要支持完整 CSS 选择器（嵌套、组合器等） |

推荐方案 A，因为：
- PostPress 已有 `rehypeInlineStyles` 骨架
- 避免额外的 HTML 序列化→解析开销
- 对"标签名 → 默认样式"的简单映射足够
- 不引入 juice 依赖

### 5.3 sharp 图片策略

```typescript
// 伪代码
async function processImage(src: string, basePath: string): Promise<string> {
  if (isDataUri(src) || isRemoteUrl(src)) return src; // 跳过

  const buffer = readFileSync(resolve(basePath, src));
  const metadata = await sharp(buffer).metadata();
  let output: Buffer;

  if (metadata.format === 'gif') {
    // GIF 保留动画语义
    output = await sharp(buffer, { animated: true })
      .resize({ width: 1080, withoutEnlargement: true })
      .gif()
      .toBuffer();
  } else if (metadata.format === 'svg') {
    // SVG 保持原格式，由 rehypeSanitizeTags 做兼容处理（移除 id/style/script 等）
    // 此处不走 sharp 压缩，直接返回清洗后的 SVG 内联内容
    return sanitizeSvgForWechat(buffer.toString('utf8'));
  } else {
    // 其他格式统一转 PNG
    output = await sharp(buffer)
      .rotate() // 自动按 EXIF 旋转
      .resize({ width: 1080, withoutEnlargement: true })
      .png({ compressionLevel: 9, quality: 85 })
      .toBuffer();
  }

  // 兜底压缩：确保 <= 2MB
  const MAX_SIZE = 2 * 1024 * 1024;
  let scale = 0.9;
  while (output.length > MAX_SIZE && scale > 0.3) {
    const meta = await sharp(output).metadata();
    const newWidth = Math.floor((meta.width ?? 1080) * scale);
    output = await sharp(output)
      .resize({ width: newWidth })
      .png({ compressionLevel: 9, quality: 80 })
      .toBuffer();
    scale *= 0.9;
  }

  if (output.length > MAX_SIZE) {
    // PNG 仍超限，降级为 JPEG（仅限无透明通道的图片）
    if (!metadata.hasAlpha) {
      output = await sharp(output).jpeg({ quality: 75, mozjpeg: true }).toBuffer();
    }
    if (output.length > MAX_SIZE) {
      throw new Error(`图片 ${src} 压缩后仍超过 2MB (${(output.length / 1024 / 1024).toFixed(1)}MB)`);
    }
  }

  const mime = metadata.format === 'gif' ? 'image/gif' : 'image/png';
  return `data:${mime};base64,${output.toString('base64')}`;
}
```

### 5.4 标签白名单配置

```typescript
const ALLOWED_TAGS = new Set([
  // 块级
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'br',
  'ol', 'ul', 'li', 'blockquote', 'pre',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'section', 'figure', 'figcaption',
  // 内联
  'span', 'strong', 'b', 'em', 'i', 'u', 'ins', 'del', 's',
  'sub', 'sup', 'a', 'img', 'code',
]);

const BLOCKED_TAGS = new Set([
  'script', 'style', 'link', 'iframe',
  'form', 'input', 'textarea', 'select', 'button',
  'audio', 'video', 'object', 'embed', 'canvas',
]);

const ALLOWED_PROTOCOLS = new Set(['http', 'https', 'mailto', 'tel']);
// 禁止: javascript:, data: (仅 img src 允许 data:)
```

## 6. 回归测试建议

1. 构造一份"兼容性样例 Markdown"覆盖：标题(h1-h6)、表格、任务列表、有序/无序列表（含嵌套）、代码块（多语言）、行内代码、引用、图片（PNG/JPEG/GIF/SVG）、大图（>2MB）、外链、脚注、粗体/斜体/删除线、分割线。
2. 生成 HTML 后粘贴到公众号编辑器，保存草稿再回看。
3. 比较三份内容：原 Markdown、生成 HTML、公众号草稿渲染结果。
4. 记录失败模式（标签丢失、样式退化、图片失败、外链不可点）并固化成测试用例。

## 7. 参考资料

### 官方/接口文档（A 级）

- WeChat SDK 文档（临时素材 `media/upload`，含图片 2MB/格式限制）：
  https://wechat-sdk.luokebi.cn/api/official-account/materials.html
- 公众号接口文档（`uploadimg`、`add_news`，含 `1MB`、content 不支持 JS）：
  https://www.onliang.com/docs/wechatmp/tuwen-tuwen-1ef8f5np4fu4u
- 微信小程序 editor 组件（标签白名单）：
  https://developers.weixin.qq.com/miniprogram/dev/component/editor.html

### 社区实测文章

- 微信公众号图文 HTML/CSS 支持情况解析：
  https://www.axtonliu.ai/newsletters/ai-2/posts/wechat-article-html-css-support
- 微信公众号 CSS 布局和 SVG 推文的坑：
  https://blog.csdn.net/liixnhai/article/details/111693575
- 在公众号中优雅地呈现代码：
  https://www.barretlee.com/blog/2016/07/14/codes-in-wechat/

### 开源实现参考（B 级）

- bm.md（wechat 适配器、测试、CSS 内联）
  - https://github.com/miantiao-me/bm.md/blob/master/src/lib/markdown/render/adapters/wechat.ts
  - https://github.com/miantiao-me/bm.md/blob/master/src/lib/markdown/render/html.ts
  - https://github.com/miantiao-me/bm.md/blob/master/src/lib/markdown/render/plugins/rehype-footnote-links.ts
- md2oa（base64、juice、模板方案）
  - https://github.com/shaogefenhao/md2oa/blob/main/lib/converter.js
  - https://github.com/shaogefenhao/md2oa/blob/main/vs-extension/templates/wechat.html
- obsidian-md2wechat（API 集成、剪贴板策略）
  - https://github.com/geekjourneyx/obsidian-md2wechat/blob/main/main.ts
  - https://github.com/geekjourneyx/obsidian-md2wechat/blob/main/view.ts
