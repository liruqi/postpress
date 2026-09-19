import type { Plugin } from 'unified';
import type { Root, Element, Text, ElementContent } from 'hast';
import { visit, SKIP } from 'unist-util-visit';
import { svgSizeFromViewBox } from '../svg.ts';

/** Tags allowed in WeChat MP editor output. */
const ALLOWED_TAGS = new Set([
    // Block
    'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'blockquote', 'pre', 'code',
    'ul', 'ol', 'li',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'section', 'figure', 'figcaption',
    'hr', 'br', 'img',
    // Inline
    'a', 'strong', 'em', 'b', 'i', 'del', 's',
    'span', 'sup', 'sub', 'mark',
    // SVG
    'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon',
    'ellipse', 'g', 'defs', 'clipPath', 'use', 'text', 'tspan',
    'linearGradient', 'radialGradient', 'stop', 'mask', 'pattern',
    'symbol', 'title', 'desc', 'foreignObject',
]);

/** Tags that should be removed entirely including children. */
const REMOVE_WITH_CHILDREN = new Set([
    'script', 'style', 'link', 'iframe', 'frame', 'frameset',
    'form', 'textarea', 'select', 'button',
    'audio', 'video', 'source', 'track',
    'object', 'embed', 'canvas',
    'noscript', 'template',
]);

/** Block-level tags whose direct text children should be wrapped in <span>. */
const BLOCK_TAGS = new Set([
    'p', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'li', 'td', 'th', 'figcaption', 'section',
]);

/** Inline tags that should NOT be wrapped in an additional span. */
const INLINE_TAGS = new Set([
    'a', 'strong', 'em', 'b', 'i', 'del', 's',
    'span', 'sup', 'sub', 'mark', 'code', 'br', 'img',
]);

const ALLOWED_URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const DISALLOWED_STYLE_PROPS = new Set(['position', 'font-family']);
const DISALLOWED_STYLE_VALUE_PATTERNS = [
    /url\s*\(/i,
    /expression\s*\(/i,
    /javascript:/i,
    /vbscript:/i,
    /data:/i,
];

function hasExplicitScheme(value: string): boolean {
    return /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value);
}

function sanitizeUrl(value: string, attrName: 'href' | 'src' | 'xLinkHref' | 'xlinkHref'): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('#')) return trimmed;
    if (trimmed.startsWith('./') || trimmed.startsWith('../')) return trimmed;
    if (trimmed.startsWith('/')) return trimmed;

    if (!hasExplicitScheme(trimmed)) {
        // Relative path without explicit scheme, e.g. images/a.png
        return trimmed;
    }

    if ((attrName === 'src' || attrName === 'xLinkHref' || attrName === 'xlinkHref') && trimmed.startsWith('data:')) {
        return /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(trimmed) ? trimmed : null;
    }

    try {
        const parsed = new URL(trimmed);
        if (!ALLOWED_URL_PROTOCOLS.has(parsed.protocol)) {
            return null;
        }
        return trimmed;
    } catch {
        return null;
    }
}

function sanitizeStyle(style: string): string | null {
    const kept: string[] = [];

    for (const decl of style.split(';')) {
        const trimmed = decl.trim();
        if (!trimmed) continue;

        const colonIdx = trimmed.indexOf(':');
        if (colonIdx === -1) continue;

        const prop = trimmed.slice(0, colonIdx).trim().toLowerCase();
        const value = trimmed.slice(colonIdx + 1).trim();
        if (!prop || !value) continue;

        if (DISALLOWED_STYLE_PROPS.has(prop)) continue;
        if (DISALLOWED_STYLE_VALUE_PATTERNS.some((pattern) => pattern.test(value))) continue;

        kept.push(`${prop}: ${value}`);
    }

    if (kept.length === 0) return null;
    return `${kept.join('; ')};`;
}

function isElement(node: any): node is Element {
    return node && node.type === 'element';
}

function isText(node: any): node is Text {
    return node && node.type === 'text';
}

/**
 * Rehype plugin that sanitizes HTML tags for WeChat MP editor compatibility.
 *
 * - Removes dangerous tags (script, style, iframe, etc.) with children
 * - Converts div → section
 * - Converts task list checkboxes to Unicode ☑/☐
 * - Removes id and on* event attributes
 * - Unwraps unknown tags, preserving children
 * - Wraps bare text nodes inside block elements with <span>
 */
export const rehypeSanitizeTags: Plugin<[], Root> = () => {
    return (tree: Root) => {
        // Pass 1: sanitize tags and attributes
        visit(tree, 'element', (node: Element, index, parent) => {
            if (index === undefined || !parent) return;

            // Remove dangerous tags entirely
            if (REMOVE_WITH_CHILDREN.has(node.tagName)) {
                parent.children.splice(index, 1);
                return [SKIP, index];
            }

            // Handle input[type=checkbox] → Unicode
            if (node.tagName === 'input') {
                const props = node.properties || {};
                if (props.type === 'checkbox') {
                    const checked = props.checked === true || props.checked === '';
                    const text: Text = {
                        type: 'text',
                        value: checked ? '☑ ' : '☐ ',
                    };
                    parent.children.splice(index, 1, text);
                    return [SKIP, index];
                }
                // Non-checkbox input: remove
                parent.children.splice(index, 1);
                return [SKIP, index];
            }

            // h1 → h2 (article title is set outside the editor; body content starts at h2)
            if (node.tagName === 'h1') {
                node.tagName = 'h2';
            }

            // div → section
            if (node.tagName === 'div') {
                node.tagName = 'section';
            }

            // Unwrap unknown tags (not in allowed list), keep children
            if (!ALLOWED_TAGS.has(node.tagName)) {
                const children = node.children || [];
                parent.children.splice(index, 1, ...children);
                return [SKIP, index];
            }

            // Clean attributes
            if (node.properties) {
                const props = node.properties;

                // Remove id
                delete props.id;

                // Remove on* event handlers
                for (const key of Object.keys(props)) {
                    if (key.startsWith('on') && key.length > 2) {
                        delete props[key];
                    }
                }

                // Sanitize URL-like attributes
                for (const attr of ['href', 'src', 'xLinkHref', 'xlinkHref'] as const) {
                    if (typeof props[attr] !== 'string') continue;
                    const sanitized = sanitizeUrl(props[attr], attr);
                    if (sanitized === null) {
                        delete props[attr];
                    } else {
                        props[attr] = sanitized;
                    }
                }

                // Remove unsupported or dangerous style declarations
                if (typeof props.style === 'string') {
                    const sanitizedStyle = sanitizeStyle(props.style);
                    if (sanitizedStyle === null) {
                        delete props.style;
                    } else {
                        props.style = sanitizedStyle;
                    }
                }

                // Inline <svg>: iOS needs explicit numeric width/height.
                // Derive them from viewBox when the author omitted them.
                if (node.tagName === 'svg') {
                    const size = svgSizeFromViewBox(props.viewBox);
                    if (size) {
                        if (props.width === undefined) props.width = size.width;
                        if (props.height === undefined) props.height = size.height;
                    }
                }
            }
        });

        // Pass 2: wrap bare text in block elements with <span>
        visit(tree, 'element', (node: Element) => {
            if (!BLOCK_TAGS.has(node.tagName)) return;

            const newChildren: ElementContent[] = [];
            let needsWrapping = false;

            for (const child of node.children) {
                if (isText(child) && child.value.trim() !== '') {
                    // Check if this text node is the only child or mixed with non-inline elements
                    // Only wrap if the block element has bare text
                    const hasInlineOnly = node.children.every(
                        (c) => isText(c) || (isElement(c) && INLINE_TAGS.has(c.tagName)),
                    );

                    if (hasInlineOnly) {
                        needsWrapping = true;
                        break;
                    }
                }
            }

            if (!needsWrapping) return;

            // Check if already wrapped (single span child containing all content)
            if (
                node.children.length === 1 &&
                isElement(node.children[0]) &&
                node.children[0].tagName === 'span'
            ) {
                return;
            }

            // Check if all children are already inline elements (no bare text to wrap)
            const hasBareText = node.children.some(
                (c) => isText(c) && c.value.trim() !== '',
            );
            if (!hasBareText) return;

            // Group consecutive text and inline elements into spans
            let group: ElementContent[] = [];

            const flushGroup = () => {
                if (group.length === 0) return;
                // If group is all inline elements with no bare text, push as-is
                const groupHasText = group.some((c) => isText(c));
                if (groupHasText) {
                    newChildren.push({
                        type: 'element',
                        tagName: 'span',
                        properties: {},
                        children: group,
                    });
                } else {
                    newChildren.push(...group);
                }
                group = [];
            };

            for (const child of node.children) {
                if (isText(child) || (isElement(child) && INLINE_TAGS.has(child.tagName))) {
                    group.push(child);
                } else {
                    flushGroup();
                    newChildren.push(child);
                }
            }
            flushGroup();

            node.children = newChildren;
        });
    };
};
