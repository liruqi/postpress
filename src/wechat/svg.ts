/**
 * SVG handling helpers for WeChat MP output.
 *
 * Verified in the WeChat MP editor (2026-09-19 probe): both inline `<svg>` and
 * `<img src="data:image/svg+xml;base64,...">` render correctly. Vector output is
 * therefore preferred over rasterizing to PNG (crisper, smaller, and it survives
 * the editor's CSS filter that breaks HTML/CSS math layout).
 *
 * Two WeChat quirks still force a raster fallback for some SVG files:
 * - `id` attributes are deleted by the editor, so `url(#id)` references
 *   (gradients, filters, clipPath, mask, pattern, symbol) resolve to nothing
 * - `<foreignObject>` and nested `<svg>` are not rendered
 */

const ROOT_SVG_TAG = /<svg\b[^>]*>/i;
const XMLNS = 'xmlns="http://www.w3.org/2000/svg"';

function attrValue(tag: string, name: string): string | null {
    // Attribute values are usually quoted, but some serializers (e.g. MathJax's
    // liteAdaptor) emit them bare — accept both.
    const match = tag.match(
        new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'),
    );
    if (!match) return null;
    return match[2] ?? match[3] ?? match[4] ?? null;
}

function setAttr(tag: string, name: string, value: string): string {
    const re = new RegExp(`\\s${name}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, 'i');
    const quoted = `${name}="${value}"`;
    if (re.test(tag)) return tag.replace(re, ` ${quoted}`);
    return tag.replace(/\s*\/?>\s*$/, ` ${quoted}>`);
}

function round(value: number): number {
    return Math.round(value * 100) / 100;
}

/** Parse the `viewBox` of an SVG string into CSS pixel dimensions. */
export function parseViewBox(svg: string): { width: number; height: number } | null {
    const match = svg.match(
        /viewBox\s*=\s*["']\s*(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)\s*["']/i,
    );
    if (!match) return null;

    const width = parseFloat(match[3]);
    const height = parseFloat(match[4]);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return null;
    }
    return { width, height };
}

/**
 * Derive CSS pixel width/height from a `viewBox` attribute value.
 * Used for inline `<svg>` elements in the HAST tree.
 */
export function svgSizeFromViewBox(
    viewBox: unknown,
): { width: string; height: string } | null {
    if (typeof viewBox !== 'string') return null;
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
    if (parts[2] <= 0 || parts[3] <= 0) return null;
    return { width: String(round(parts[2])), height: String(round(parts[3])) };
}

/**
 * Detect SVG features the WeChat editor cannot render.
 * When true, the SVG should be rasterized to PNG instead of kept as vector.
 */
export function hasUnrenderableSvgFeatures(svg: string): boolean {
    if (/url\(\s*['"]?#/i.test(svg)) return true; // url(#id) — ids are stripped
    if (/<foreignObject[\s>]/i.test(svg)) return true;
    if ((svg.match(/<svg[\s>]/gi) ?? []).length > 1) return true; // nested svg
    return false;
}

/**
 * Clean an SVG file's markup for the WeChat MP editor.
 *
 * - removes XML prolog, doctype and comments
 * - removes `<script>` / `<style>` blocks and unwraps `<a>`
 * - removes `id` and `on*` attributes (the editor deletes ids anyway)
 * - ensures an explicit numeric `width`/`height` on the root `<svg>` (iOS needs it)
 * - ensures the `xmlns` declaration is present (required inside a data URI)
 */
export function sanitizeSvgMarkup(input: string): string {
    let svg = input.trim();

    svg = svg.replace(/<\?xml[\s\S]*?\?>/gi, '');
    svg = svg.replace(/<!DOCTYPE[\s\S]*?>/gi, '');
    svg = svg.replace(/<!--[\s\S]*?-->/g, '');
    svg = svg.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '');
    svg = svg.replace(/<style\b[\s\S]*?<\/style\s*>/gi, '');
    svg = svg.replace(/<\/?a\b[^>]*>/gi, '');
    svg = svg.replace(/\s(?:xml:)?id\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    svg = svg.replace(/\son[a-z-]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    svg = svg.replace(/\sxlink:href\s*=\s*(["'])javascript:[^"']*\1/gi, '');

    const rootMatch = svg.match(ROOT_SVG_TAG);
    if (rootMatch && rootMatch.index !== undefined) {
        let tag = rootMatch[0];

        const width = attrValue(tag, 'width');
        const height = attrValue(tag, 'height');
        const numeric = /^\s*[\d.]+(px)?\s*$/i;
        if (!width || !numeric.test(width) || !height || !numeric.test(height)) {
            const box = parseViewBox(svg);
            if (box) {
                if (!width || !numeric.test(width)) {
                    tag = setAttr(tag, 'width', String(round(box.width)));
                }
                if (!height || !numeric.test(height)) {
                    tag = setAttr(tag, 'height', String(round(box.height)));
                }
            }
        }

        if (!/\sxmlns\s*=/i.test(tag)) {
            tag = setAttr(tag, 'xmlns', 'http://www.w3.org/2000/svg');
        }

        svg = svg.slice(0, rootMatch.index) + tag + svg.slice(rootMatch.index + rootMatch[0].length);
    }

    return svg;
}

/** True when the string looks like an SVG document. */
export function isSvgDocument(text: string): boolean {
    return ROOT_SVG_TAG.test(text) && /<\/svg\s*>/i.test(text);
}
