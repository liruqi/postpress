---
summary: 'Styles: default style map architecture, font stack, inline style approach, hljs theme'
read_when:
  - Modifying default styles or adding new style themes
  - Debugging style rendering in WeChat editor
  - Adding new HTML element support to the style map
---

# 样式系统技术决策

> 调研日期：2026-02-23

## 架构

样式定义在 `src/wechat/styles/default.ts`，是一个 `Record<string, string>` 映射表：

- **键**：HTML 标签名（`h1`、`p`）、复合选择器（`pre code`）、或 hljs class 名（`hljs-keyword`）
- **值**：CSS 属性字符串，注入为元素的 `style` 属性

`rehypeInlineStyles` 插件遍历 HAST 树，按标签名匹配样式表并注入。

## 为什么每个元素都要内联 font-family

微信公众号编辑器会剥离 `<style>` 和 `<link>` 标签，**CSS 继承不可靠**。父元素设置 font-family 不能保证子元素继承。必须在每个文本承载元素上显式设置。

### 调研来源

调研了 4 个主流开源微信 Markdown 编辑器：
- **doocs/md** — 使用 `<style>` 标签（不适用于粘贴场景）
- **lyricat/wechat-format** — 每个元素内联 font-family（与我们架构一致）
- **ufologist/wechat-mp-article** — 使用 `<style>` 标签
- **mzlogin/online-markdown** — 使用 `<style>` 标签

只有 lyricat/wechat-format 使用了与 PostPress 相同的逐元素内联方式。

## 字体栈

### 正文字体

```
"mp-quote",PingFang SC,system-ui,-apple-system,BlinkMacSystemFont,
Helvetica Neue,Hiragino Sans GB,Microsoft YaHei UI,Microsoft YaHei,
Arial,sans-serif
```

来源：微信编辑器实际使用的 `mp-quote` 字体族，覆盖：
- **iOS**: PingFang SC
- **macOS**: -apple-system / BlinkMacSystemFont
- **Android/Windows**: Microsoft YaHei
- **降级**: Arial, sans-serif

### 等宽字体（代码）

```
Menlo,Consolas,Monaco,"Courier New",monospace
```

## 样式常量 DRY 设计

`default.ts` 使用模板字符串常量避免重复长字体栈：

```typescript
const FONT_BODY = '"mp-quote",PingFang SC,system-ui,...';
const FONT_MONO = 'Menlo,Consolas,Monaco,...';
const F = `font-family: ${FONT_BODY};`;   // 正文前缀
const FM = `font-family: ${FONT_MONO};`;  // 等宽前缀

export const defaultStyles: StyleMap = {
    h1: `${F} font-size: 24px; ...`,
    code: `${FM} font-size: 0.875em; ...`,
};
```

需要 font-family 的元素（使用 `F` 前缀）：h1-h6, p, blockquote, ul, ol, li, table, th, td, section, figcaption
需要等宽 font-family 的元素（使用 `FM` 前缀）：code, pre code
不需要 font-family 的元素（继承自父元素）：strong, em, del, s, sup, sub, a, img, hr, mark, figure

## 色彩体系

灰色调色板：
- `#1d1d1f` — 主文字色（正文、标题、表格）
- `#6e6e73` — 次要文字（h4/h5、blockquote、代码注释）
- `#86868b` — 辅助文字（h6、figcaption、删除线）
- `#576b95` — WeChat 蓝（链接、脚注上标）
- `#2e8555` — 术语色（`TERM_LINK_COLOR`，Wikipedia 等词条链接内联高亮，不生成脚注）
- `#d2d2d7` — 分割线、边框（hr、blockquote border、th border）
- `#e5e5ea` — 浅边框（td border）
- `#f5f5f7` — 行内代码背景
- `#f6f8fa` — 代码块背景（GitHub 风格）

## 排版参数

| 元素 | 字号 | 行高 | 备注 |
|------|------|------|------|
| h1 | 24px | 1.2 | letter-spacing: -0.02em |
| h2 | 20px | 1.25 | |
| h3 | 17px | 1.3 | |
| h4 | 15px | 1.4 | 灰色 #6e6e73 |
| h5 | 14px | 1.4 | 灰色 #6e6e73 |
| h6 | 13px | 1.4 | 灰色 #86868b |
| p/ul/ol | 16px | 1.75 | 中文阅读舒适行高 |
| table | 16px | — | |
| code (inline) | 0.875em | — | 相对父元素 |
| code (block) | 13px | 1.6 | |

## hljs 语法高亮主题

默认语法高亮主题，匹配浅色代码块背景：

| Token | 颜色 | 示例 |
|-------|------|------|
| keyword | `#9b2393` 紫 | `const`, `function`, `return` |
| string | `#c41a16` 红 | `"hello"` |
| number | `#1c00cf` 蓝 | `42`, `3.14` |
| comment | `#6e6e73` 灰斜体 | `// comment` |
| function/title | `#326d74` 青 | `myFunc` |
| built_in/type | `#5c2699` 紫 | `Array`, `Promise` |
