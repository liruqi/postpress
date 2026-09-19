/**
 * Default style map for WeChat MP editor inline styles.
 * Default minimalist design for WeChat MP editor.
 *
 * Keys: tag names, compound selectors ("pre code"), or hljs class names ("hljs-keyword").
 * Values: CSS property strings to inject as inline styles.
 */

export type StyleMap = Record<string, string>;

// WeChat native font stack (covers iOS PingFang + Android/Windows YaHei)
const FONT_BODY = '"mp-quote",PingFang SC,system-ui,-apple-system,BlinkMacSystemFont,Helvetica Neue,Hiragino Sans GB,Microsoft YaHei UI,Microsoft YaHei,Arial,sans-serif';
const FONT_MONO = 'Menlo,Consolas,Monaco,"Courier New",monospace';

const F = `font-family: ${FONT_BODY};`;
const FM = `font-family: ${FONT_MONO};`;

/**
 * Color for "term" links — external links to reference sites (Wikipedia by
 * default) that are rendered as colored inline text instead of a numbered
 * footnote. Keeping the color here means every color token stays in one file.
 */
export const TERM_LINK_COLOR = '#2e8555';

export const defaultStyles: StyleMap = {
    // Headings — 600 weight (h1 is downgraded to h2 by sanitize plugin)
    h2: `${F} font-size: 20px; font-weight: 600; margin: 32px 0 12px; line-height: 1.25; color: #1d1d1f;`,
    h3: `${F} font-size: 17px; font-weight: 600; margin: 24px 0 8px; line-height: 1.3; color: #1d1d1f;`,
    h4: `${F} font-size: 16px; font-weight: 600; margin: 20px 0 6px; line-height: 1.4; color: #1d1d1f;`,
    h5: `${F} font-size: 16px; font-weight: 600; margin: 16px 0 4px; line-height: 1.4; color: #1d1d1f;`,
    h6: `${F} font-size: 16px; font-weight: 600; margin: 16px 0 4px; line-height: 1.4; color: #1d1d1f;`,

    // Paragraphs — 16px body, 1.75 line-height (comfortable for Chinese)
    p: `${F} font-size: 16px; line-height: 1.75; margin: 0 0 1.25em; color: #1d1d1f;`,

    // Blockquote — restrained: left border + italic only, no background
    blockquote: `${F} margin: 1.5em 0; padding: 0 0 0 1em; border-left: 3px solid #d2d2d7; color: #6e6e73; font-style: italic;`,

    // Inline code — subtle gray background, monospace
    code: `${FM} font-size: 0.875em; background: #f5f5f7; color: #1d1d1f; padding: 0.15em 0.4em; border-radius: 4px;`,
    // Code block — GitHub-style light gray bg, no border, monospace
    'pre code': `${FM} display: block; font-size: 13px; background: #f6f8fa; color: #1d1d1f; padding: 20px 24px; border-radius: 8px; white-space: pre-wrap; word-wrap: break-word; line-height: 1.6; text-align: left;`,
    pre: 'margin: 1.5em 0;',

    // Lists
    ul: `${F} margin: 1em 0; padding-left: 1.5em; font-size: 16px; line-height: 1.75; color: #1d1d1f;`,
    ol: `${F} margin: 1em 0; padding-left: 1.5em; font-size: 16px; line-height: 1.75; color: #1d1d1f;`,
    li: `${F} margin: 0.4em 0; color: #1d1d1f;`,

    // Links — WeChat blue
    a: 'color: #576b95; text-decoration: none;',

    // Images — no top margin: when image is the first element (e.g. cover),
    // top margin creates excessive spacing in WeChat editor.
    img: 'max-width: 100%; height: auto; display: block; margin: 0 auto 1.5em; border-radius: 10px;',

    // Tables — minimalist: collapse borders, thin lines
    table: `${F} width: 100%; border-collapse: collapse; margin: 1.5em 0; font-size: 16px; border-radius: 2px;`,
    th: `${F} padding: 10px 12px; border-bottom: 1px solid #d2d2d7; font-weight: 600; text-align: left; color: #1d1d1f;`,
    td: `${F} padding: 10px 12px; border-bottom: 1px solid #e5e5ea; color: #1d1d1f;`,

    // Horizontal rule
    hr: 'border: none; height: 1px; background: #d2d2d7; margin: 2em 0;',

    // Inline formatting
    strong: 'font-weight: 600; color: #1d1d1f;',
    em: 'font-style: italic;',
    del: 'text-decoration: line-through; color: #86868b;',
    s: 'text-decoration: line-through; color: #86868b;',

    // Superscript / subscript
    sup: 'font-size: 0.75em; vertical-align: super; color: #576b95;',
    sub: 'font-size: 0.75em; vertical-align: sub;',

    // Section / figure
    section: `${F} margin: 0.5em 0;`,
    figcaption: `${F} font-size: 13px; color: #86868b; text-align: center; margin-top: 8px;`,
    figure: 'margin: 1.5em 0; text-align: center;',

    // Mark
    mark: 'background: #fff3b0; padding: 0.1em 0.3em; border-radius: 2px;',

    // hljs — default syntax highlighting theme (matching light code block background)
    'hljs-keyword': 'color: #9b2393; font-weight: 600;',
    'hljs-string': 'color: #c41a16;',
    'hljs-number': 'color: #1c00cf;',
    'hljs-comment': 'color: #6e6e73; font-style: italic;',
    'hljs-function': 'color: #326d74;',
    'hljs-title': 'color: #326d74;',
    'hljs-built_in': 'color: #5c2699;',
    'hljs-literal': 'color: #1c00cf;',
    'hljs-type': 'color: #5c2699;',
    'hljs-params': 'color: #1d1d1f;',
    'hljs-meta': 'color: #643820;',
    'hljs-attr': 'color: #643820;',
    'hljs-variable': 'color: #326d74;',
    'hljs-selector-tag': 'color: #9b2393;',
    'hljs-selector-class': 'color: #643820;',
    'hljs-regexp': 'color: #c41a16;',
    'hljs-symbol': 'color: #326d74;',
    'hljs-tag': 'color: #9b2393;',
    'hljs-name': 'color: #9b2393;',
    'hljs-attribute': 'color: #643820;',
    'hljs-addition': 'color: #28a745; background: rgba(40, 167, 69, 0.1);',
    'hljs-deletion': 'color: #d73a49; background: rgba(215, 58, 73, 0.1);',
};
