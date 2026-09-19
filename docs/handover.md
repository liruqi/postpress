---
summary: 'Project handover: background, architecture decisions, and next steps for PostPress'
read_when:
  - First time working on this project
  - Need to understand project context and decisions
  - Planning next implementation steps
---

# Handover Document

## Project Background

PostPress is part of a personal document rendering toolchain ("press" series):

- **webpress** — HTML → PNG
- **pagepress** — Markdown/HTML → PDF
- **postpress** — Markdown → editor-compatible HTML for WeChat and X Articles

Each tool is an independent CLI designed for AI agent consumption. They share naming conventions and architectural patterns but do not share code. The relationship is pipeline upstream/downstream, not library dependency.

## Why remark/rehype (not marked)

pagepress uses `marked` for its Markdown parsing, which works fine because its output goes straight to Playwright for rendering — no HTML-level transformation needed.

PostPress is different. Its three core operations are all **HTML AST transformations**:

1. Sanitize unsupported tags
2. Convert local images to base64
3. Inline all CSS styles

Using `marked` would produce an HTML string, requiring a second parse with cheerio/jsdom to do these transformations. The `unified/remark/rehype` pipeline avoids this by keeping everything in AST form throughout:

```
markdown → remark (mdast) → rehype (hast) → transform hast → serialize to HTML
```

## Current State

### What's done

- Project scaffolding (package.json, tsconfig, vite, etc.)
- CLI entry point (`src/main.ts`) with `-i` / `-o` / `--copy` options
- Rendering pipeline (`src/wechat/renderer.ts`) wired up with unified
- 6 rehype plugins (all implemented, tested):
  - `rehypeSanitizeTags` — tag whitelist, div→section, checkbox→Unicode, attribute cleanup
  - `rehypeMermaid` — mermaid code blocks → Playwright 2x PNG base64 (optional)
  - `rehypeMath` — math → MathJax self-contained SVG (optional, --math)
  - `rehypeBase64Images` — local images → sharp compress (2MB limit) → base64 data URI
  - `rehypeCodeHighlight` — highlight.js syntax highlighting + whitespace protection (nbsp, br)
  - `rehypeFootnoteLinks` — external links → footnotes + References section, preserve mp.weixin.qq.com;
    term hosts (en.wikipedia.org) → colored inline text (`#2e8555`), no footnote
  - `rehypeInlineStyles` — default styles + hljs colors → inline style attr, remove className
- Style system (`src/wechat/styles/default.ts`):
  - 默认极简风格 with WeChat native font stack
  - 默认语法高亮主题
  - 16px body, 1.75 line-height for Chinese reading
- Clipboard (`src/wechat/clipboard.ts`):
  - `@crosscopy/clipboard` native addon for HTML rich-text clipboard write
- Testing: vitest with 70 tests across 10 test files, all passing
- TypeScript type check passes
- Vite build passes

### What's NOT done

1. **README** — not yet created
2. **Agent skill** — no `skills/` SKILL.md yet
3. **Custom style themes** — only default style map exists, no user-customizable themes
4. **Remote image support** — only local images are processed, remote URLs are passed through

## WeChat MP HTML Constraints (for reference)

- Only `style` attributes allowed, no `<style>` or `<link>` tags
- No `<script>` tags
- No `position: fixed/absolute`, no custom fonts
- No external resource loading
- Images: base64 data URIs or WeChat CDN URLs
- Tables, code blocks, and some semantic tags have limited support
- Inline styles on every element is the safest approach

## Architecture

```
src/
├── main.ts                     # CLI entry (commander)
└── wechat/                     # WeChat domain
    ├── renderer.ts             # unified pipeline orchestration
    ├── clipboard.ts            # System clipboard via @crosscopy/clipboard
    ├── plugins/                # Rehype plugins (6 total)
    │   ├── index.ts
    │   ├── rehype-sanitize-tags.ts
    │   ├── rehype-mermaid.ts
    │   ├── rehype-base64-images.ts
    │   ├── rehype-code-highlight.ts
    │   ├── rehype-footnote-links.ts
    │   └── rehype-inline-styles.ts
    └── styles/
        └── default.ts          # 默认极简风格样式表 + 默认语法高亮主题
```

Pipeline execution order (order matters):

```
Markdown → remarkParse → remarkGfm → remarkRehype → rehypeRaw
  → 1. rehypeSanitizeTags
  → 2. rehypeMermaid
  → 3. rehypeMath
  → 4. rehypeBase64Images
  → 5. rehypeCodeHighlight
  → 6. rehypeFootnoteLinks
  → 7. rehypeInlineStyles
  → rehypeStringify → HTML → (optional) clipboard
```

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `unified` | Pipeline core |
| `remark-parse` | Markdown → mdast |
| `remark-gfm` | GFM support (tables, strikethrough, task lists) |
| `remark-rehype` | mdast → hast bridge |
| `rehype-raw` | Parse raw HTML in Markdown into HAST |
| `rehype-stringify` | hast → HTML string |
| `unist-util-visit` | AST tree traversal for plugins |
| `highlight.js` | Code syntax highlighting |
| `sharp` | Image compression, format conversion, SVG rasterization |
| `@crosscopy/clipboard` | Native system clipboard HTML read/write |
| `playwright` | Mermaid diagram rendering (optional) |
| `commander` | CLI framework |
