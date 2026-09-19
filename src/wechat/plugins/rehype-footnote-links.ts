import type { Plugin } from 'unified';
import type { Root, Element, ElementContent } from 'hast';
import { visit, SKIP } from 'unist-util-visit';
import { TERM_LINK_COLOR } from '../styles/default.ts';

type LinkType = 'wechat' | 'anchor' | 'external';

/** Hosts rendered as colored inline terms instead of numbered footnotes. */
const DEFAULT_TERM_HOSTS = ['en.wikipedia.org'];

export interface FootnoteLinksOptions {
    /**
     * Hosts whose links become colored inline terms instead of footnotes.
     * Matched exactly or as a subdomain suffix. Default: ['en.wikipedia.org'].
     */
    termHosts?: string[];
    /** Color applied to those inline terms. Default: TERM_LINK_COLOR. */
    termColor?: string;
}

/** True when `hostname` equals `host` or is a subdomain of it. */
function matchesHost(hostname: string, host: string): boolean {
    return hostname === host || hostname.endsWith(`.${host}`);
}

/**
 * Classify a link by type.
 * - wechat: mp.weixin.qq.com → preserve as <a>
 * - anchor: # / relative → strip <a> tag, keep text (WeChat doesn't support anchors)
 * - external: http(s) → convert to footnote reference
 */
function classifyLink(href: string): LinkType {
    if (href.startsWith('//')) {
        return 'external';
    }
    if (href.startsWith('#') || href.startsWith('/') || href.startsWith('./') || href.startsWith('../')) {
        return 'anchor';
    }
    try {
        const url = new URL(href);
        if (url.hostname === 'mp.weixin.qq.com' || url.hostname.endsWith('.mp.weixin.qq.com')) {
            return 'wechat';
        }
    } catch {
        return 'anchor';
    }
    return 'external';
}

/**
 * Rehype plugin: convert external links to footnote references.
 *
 * - External <a> tags → link text + <sup>[N]</sup>
 * - Links to "term" hosts (Wikipedia by default) → colored inline text, no
 *   footnote: the URL is unreadable noise in a WeChat article anyway
 * - Duplicate URLs share the same footnote number
 * - mp.weixin.qq.com links are preserved as <a>
 * - Anchor and relative links are preserved as <a>
 * - Appends a References section at the end of the document
 */
export const rehypeFootnoteLinks: Plugin<[FootnoteLinksOptions?], Root> = (options) => {
    const termHosts = options?.termHosts ?? DEFAULT_TERM_HOSTS;
    const termColor = options?.termColor ?? TERM_LINK_COLOR;

    return (tree: Root) => {
        const urlMap = new Map<string, number>();
        const footnotes: Array<{ index: number; url: string; text: string }> = [];
        let counter = 0;

        // Pass 1: process all <a> tags based on link type
        visit(tree, 'element', (node: Element, index, parent) => {
            if (node.tagName !== 'a' || index === undefined || !parent) return;

            const href = node.properties?.href;
            if (typeof href !== 'string') return;

            const linkType = classifyLink(href);

            // WeChat links: preserve as <a>
            if (linkType === 'wechat') return;

            // Anchor links: strip <a> tag, keep children text only
            if (linkType === 'anchor') {
                parent.children.splice(index, 1, ...node.children);
                return [SKIP, index + node.children.length];
            }

            // Term hosts: drop the link and the footnote, keep colored text
            let hostname = '';
            try {
                hostname = new URL(href).hostname;
            } catch {
                hostname = '';
            }
            if (hostname && termHosts.some((host) => matchesHost(hostname, host))) {
                parent.children.splice(index, 1, {
                    type: 'element',
                    tagName: 'span',
                    properties: { style: `color: ${termColor};` },
                    children: node.children,
                });
                return [SKIP, index + 1];
            }

            // External links: convert to footnote reference
            let num = urlMap.get(href);
            if (num === undefined) {
                counter++;
                num = counter;
                urlMap.set(href, num);

                const text = extractText(node);
                footnotes.push({ index: num, url: href, text });
            }

            const replacement: ElementContent[] = [
                ...node.children,
                {
                    type: 'element',
                    tagName: 'sup',
                    properties: {},
                    children: [{ type: 'text', value: `[${num}]` }],
                },
            ];

            parent.children.splice(index, 1, ...replacement);
            return [SKIP, index + replacement.length];
        });

        // Pass 2: append footnote list if there are footnotes
        if (footnotes.length > 0) {
            // Build footnote lines separated by <br> inside a single <section>
            const footnoteChildren: ElementContent[] = [];
            for (let i = 0; i < footnotes.length; i++) {
                if (i > 0) {
                    footnoteChildren.push({ type: 'element', tagName: 'br', properties: {}, children: [] });
                }
                const fn = footnotes[i];
                footnoteChildren.push({ type: 'text', value: `[${fn.index}] ${fn.text}: ${fn.url}` });
            }

            const referencesSection: Element = {
                type: 'element',
                tagName: 'section',
                properties: { style: 'color: #86868b; font-size: 13px; line-height: 1.75; margin-top: 2em; word-break: break-all;' },
                children: [
                    {
                        type: 'element',
                        tagName: 'strong',
                        properties: { style: 'color: #86868b;' },
                        children: [{ type: 'text', value: 'References:' }],
                    },
                    { type: 'element', tagName: 'br', properties: {}, children: [] },
                    ...footnoteChildren,
                ],
            };

            tree.children.push(referencesSection);
        }
    };
};

/** Recursively extract text content from a node. */
function extractText(node: Element): string {
    let text = '';
    for (const child of node.children) {
        if (child.type === 'text') {
            text += child.value;
        } else if (child.type === 'element') {
            text += extractText(child);
        }
    }
    return text;
}
