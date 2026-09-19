import type { Plugin } from 'unified';
import type { Root, Element, Text, RootContent, ElementContent } from 'hast';
import { sanitizeSvgMarkup } from '../svg.ts';

export interface MathOptions {
    /** Process math at all. Default: true (renderer passes the --math flag through) */
    enabled?: boolean;
    /** Font size in px used for the SVG output. Default: 16 */
    em?: number;
    /** x-height in px used for the SVG output. Default: 8 */
    ex?: number;
    /** Glyph color. Default: '#1d1d1f' (body text color) */
    color?: string;
    /** Render inline `$...$` math in addition to `$$...$$`. Default: true */
    inline?: boolean;
}

/** Subtrees where `$` must stay literal. */
const SKIP_TAGS = new Set(['pre', 'code', 'kbd', 'samp', 'script', 'style']);

const MAX_INLINE_LENGTH = 500;

type Segment =
    | { type: 'text'; value: string }
    | { type: 'math'; tex: string; display: boolean };

/**
 * Split a text node into literal text and math segments.
 *
 * Deliberately conservative: `\$` is escaped, `$5 到 $10` (currency) is left
 * alone, and an unclosed delimiter is treated as literal text.
 * Returns null when no math was found.
 */
export function tokenizeMath(input: string, allowInline: boolean): Segment[] | null {
    const segments: Segment[] = [];
    let buffer = '';
    let found = false;

    const flush = () => {
        if (buffer) {
            segments.push({ type: 'text', value: buffer });
            buffer = '';
        }
    };

    let i = 0;
    while (i < input.length) {
        const ch = input[i];

        if (ch !== '$' || input[i - 1] === '\\') {
            buffer += ch;
            i += 1;
            continue;
        }

        // Display math: $$ ... $$
        if (input[i + 1] === '$') {
            const end = input.indexOf('$$', i + 2);
            const tex = end === -1 ? '' : input.slice(i + 2, end).trim();
            if (!tex) {
                buffer += ch;
                i += 1;
                continue;
            }
            flush();
            segments.push({ type: 'math', tex, display: true });
            found = true;
            i = end + 2;
            continue;
        }

        if (!allowInline) {
            buffer += ch;
            i += 1;
            continue;
        }

        // Inline math: $ ... $ — single line, no padding spaces
        const end = input.indexOf('$', i + 1);
        const tex = end === -1 ? '' : input.slice(i + 1, end);
        const looksLikeMath =
            end !== -1 &&
            tex.length > 0 &&
            tex.length <= MAX_INLINE_LENGTH &&
            !tex.includes('\n') &&
            tex === tex.trim() &&
            input[end + 1] !== '$';

        if (!looksLikeMath) {
            buffer += ch;
            i += 1;
            continue;
        }

        flush();
        segments.push({ type: 'math', tex, display: false });
        found = true;
        i = end + 1;
    }

    flush();
    return found ? segments : null;
}

interface RenderedMath {
    svg: string;
    width: string;
    height: string;
    /** Baseline offset in px (inline math), or null for display math. */
    verticalAlign: string | null;
}

function parseLength(value: string, em: number, ex: number): number | null {
    const match = value.trim().match(/^(-?[\d.]+)\s*(px|pt|em|ex|%)?$/i);
    if (!match) return null;

    const n = parseFloat(match[1]);
    if (!Number.isFinite(n)) return null;

    switch ((match[2] || 'px').toLowerCase()) {
        case 'em':
            return n * em;
        case 'ex':
            return n * ex;
        case 'pt':
            return (n * 96) / 72;
        case '%':
            return null;
        default:
            return n;
    }
}

function round(value: number): string {
    return String(Math.round(value * 100) / 100);
}

/**
 * Re-escape the TeX-special characters Markdown already unescaped.
 *
 * remark turns `\#` and `\%` in the source into bare `#` and `%`, but TeX reads
 * `#` as the macro parameter character and `%` as a comment, so MathJax gives
 * up and emits an `<merror>` box instead of the formula. Anything that Markdown
 * left escaped (`\#`) is preceded by a backslash and is left alone.
 */
function protectTex(tex: string): string {
    return tex.replace(/(^|[^\\])([#%])/g, (_match, prefix: string, char: string) => `${prefix}\\${char}`);
}

/** Rewrite MathJax's SVG output into a self-contained, px-sized SVG. */
function finalizeSvg(
    raw: string,
    em: number,
    ex: number,
    color: string,
): RenderedMath {
    let svg = raw.trim();
    const rootMatch = svg.match(/<svg\b[^>]*>/i);

    let width = '';
    let height = '';
    let verticalAlign: string | null = null;

    if (rootMatch && rootMatch.index !== undefined) {
        let tag = rootMatch[0];

        const readAttr = (name: string): string | null => {
            const m = tag.match(
                new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'),
            );
            return m ? (m[2] ?? m[3] ?? m[4] ?? null) : null;
        };
        const writeAttr = (name: string, value: string) => {
            const re = new RegExp(`\\s${name}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, 'i');
            const next = ` ${name}="${value}"`;
            tag = re.test(tag) ? tag.replace(re, next) : tag.replace(/\s*\/?>\s*$/, `${next}>`);
        };

        // width/height → px (MathJax emits ex units, which are unreliable
        // inside a data URI where the font context is lost)
        for (const name of ['width', 'height']) {
            const rawValue = readAttr(name);
            if (!rawValue) continue;
            const px = parseLength(rawValue, em, ex);
            if (px === null || px <= 0) continue;
            writeAttr(name, round(px));
            if (name === 'width') width = round(px);
            else height = round(px);
        }

        // Baseline offset: MathJax puts `vertical-align: -0.338ex` on the SVG so
        // it sits on the text baseline. Move it to the <img> (in px, which
        // survives the editor) because the SVG is rendered in isolation.
        const styleValue = readAttr('style');
        const vaMatch = styleValue?.match(/vertical-align:\s*(-?[\d.]+)\s*(ex|em|px)/i);
        if (vaMatch) {
            const px = parseLength(`${vaMatch[1]}${vaMatch[2]}`, em, ex);
            if (px !== null) verticalAlign = round(px);
        }

        // Glyph color: MathJax paints with currentColor, which resolves to
        // black inside an <img>. Pin the body text color explicitly.
        const style = styleValue ? styleValue.replace(/;\s*$/, '') : '';
        writeAttr('style', style ? `${style}; color: ${color};` : `color: ${color};`);

        svg =
            svg.slice(0, rootMatch.index) + tag + svg.slice(rootMatch.index + rootMatch[0].length);
    }

    // Strip ids/events, guarantee xmlns + numeric width/height
    svg = sanitizeSvgMarkup(svg);

    return { svg, width, height, verticalAlign };
}

interface MathRenderer {
    render(tex: string, display: boolean): RenderedMath;
}

/**
 * Lazily load MathJax (SVG output, `fontCache: 'none'`).
 *
 * `fontCache: 'none'` inlines every glyph as a `<path>` instead of `<use>`
 * references to a shared `<defs>` — required because the WeChat editor deletes
 * `id` attributes, which would break every glyph reference.
 */
async function createMathRenderer(
    em: number,
    ex: number,
    color: string,
): Promise<MathRenderer> {
    let mathjax: any;
    let TeX: any;
    let SVG: any;
    let liteAdaptor: any;
    let RegisterHTMLHandler: any;
    let AllPackages: any;

    try {
        const { createRequire } = await import('module');
        const require = createRequire(import.meta.url);
        ({ mathjax } = require('mathjax-full/js/mathjax.js'));
        ({ TeX } = require('mathjax-full/js/input/tex.js'));
        ({ SVG } = require('mathjax-full/js/output/svg.js'));
        ({ liteAdaptor } = require('mathjax-full/js/adaptors/liteAdaptor.js'));
        ({ RegisterHTMLHandler } = require('mathjax-full/js/handlers/html.js'));
        ({ AllPackages } = require('mathjax-full/js/input/tex/AllPackages.js'));
    } catch {
        throw new Error(
            'Math detected but MathJax is missing.\nRun: npm install mathjax-full',
        );
    }

    const adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);

    const doc = mathjax.document('', {
        InputJax: new TeX({ packages: AllPackages }),
        OutputJax: new SVG({ fontCache: 'none' }),
    });

    return {
        render(tex: string, display: boolean) {
            const node = doc.convert(protectTex(tex), {
                display,
                em,
                ex,
                containerWidth: 100000, // never break display math across lines
            });
            const markup = String(adaptor.outerHTML(node));

            // MathJax reports bad TeX as an <merror> node: a full-width <rect>
            // painted in the glyph color, i.e. a black bar. Better to fail here
            // and let the caller keep the source text than to ship that box.
            const failed = markup.match(/data-mjx-error="([^"]*)"/);
            if (failed) {
                throw new Error(`MathJax could not typeset "${tex}": ${failed[1]}`);
            }

            // MathJax wraps its output in <mjx-container>; only the inner
            // <svg> is embeddable as an image data URI.
            const svgMatch = markup.match(/<svg[\s\S]*<\/svg\s*>/i);
            if (!svgMatch) {
                throw new Error(`MathJax produced no SVG for: ${tex}`);
            }
            return finalizeSvg(svgMatch[0], em, ex, color);
        },
    };
}

interface Target {
    parent: Root | Element;
    index: number;
    node: Text;
}

function collectTargets(node: Root | Element, targets: Target[]): void {
    const children = node.children as Array<RootContent | ElementContent>;
    for (let i = 0; i < children.length; i += 1) {
        const child = children[i];
        if (child.type === 'text') {
            targets.push({ parent: node, index: i, node: child });
            continue;
        }
        if (child.type === 'element' && !SKIP_TAGS.has(child.tagName)) {
            collectTargets(child as Element, targets);
        }
    }
}

function buildImage(tex: string, display: boolean, rendered: RenderedMath): Element {
    const dataUri = `data:image/svg+xml;base64,${Buffer.from(rendered.svg, 'utf8').toString('base64')}`;

    // rehypeInlineStyles applies the generic `img` style (margin, border-radius)
    // on top of this, so neutralise both here — an inline formula must not
    // inherit the 1.5em bottom margin that real images get.
    const style = display
        ? 'display: block; margin: 1.2em auto; border-radius: 0; max-width: 100%; height: auto;'
        : [
              'display: inline',
              'margin: 0',
              'border-radius: 0',
              'max-width: 100%',
              'height: auto',
              rendered.verticalAlign
                  ? `vertical-align: ${rendered.verticalAlign}px`
                  : 'vertical-align: middle',
          ].join('; ') + ';';

    return {
        type: 'element',
        tagName: 'img',
        properties: {
            src: dataUri,
            // Deliberately no `alt`: the source TeX often contains `<` and `>`
            // ("$n>1$"), and a bare `>` inside an attribute value makes WeChat's
            // parser end the tag early — the rest of the tag then leaks into the
            // article as visible text. Nothing here can read alt anyway.
            ...(rendered.width ? { width: rendered.width } : {}),
            ...(rendered.height ? { height: rendered.height } : {}),
            style,
        },
        children: [],
    };
}

/**
 * Rehype plugin: render `$...$` and `$$...$$` math to self-contained SVG.
 *
 * Math is emitted as `<img src="data:image/svg+xml;base64,...">` rather than
 * inline `<svg>`: the data URI survives the editor's sanitizer untouched, and
 * the browser renders it in isolation (no CSS inheritance surprises).
 *
 * MathJax is loaded lazily — documents without math pay zero cost.
 */
export const rehypeMath: Plugin<[MathOptions?], Root> = (options = {}) => {
    const { enabled = true, em = 16, ex = 8, color = '#1d1d1f', inline = true } = options;

    return async (tree: Root) => {
        if (!enabled) return;

        const targets: Target[] = [];
        collectTargets(tree, targets);
        if (targets.length === 0) return;

        // Group by parent so splices don't invalidate each other's indices
        const byParent = new Map<Root | Element, Target[]>();
        for (const target of targets) {
            const list = byParent.get(target.parent);
            if (list) list.push(target);
            else byParent.set(target.parent, [target]);
        }

        const renderer = await createMathRenderer(em, ex, color);
        const failures: string[] = [];

        for (const [parent, list] of byParent) {
            // Descending index: each splice leaves the remaining ones valid
            list.sort((a, b) => b.index - a.index);

            for (const { index, node } of list) {
                const segments = tokenizeMath(node.value, inline);
                if (!segments) continue;

                const nodes: Array<Text | Element> = [];
                for (const segment of segments) {
                    if (segment.type === 'text') {
                        nodes.push({ type: 'text', value: segment.value });
                        continue;
                    }
                    try {
                        const rendered = renderer.render(segment.tex, segment.display);
                        nodes.push(buildImage(segment.tex, segment.display, rendered));
                    } catch (error) {
                        // Keep the source text so a single bad formula doesn't
                        // fail the whole document. Raw TeX is at least readable
                        // — a black MathJax error box is not.
                        failures.push(error instanceof Error ? error.message : String(error));
                        nodes.push({
                            type: 'text',
                            value: segment.display
                                ? `$$${segment.tex}$$`
                                : `$${segment.tex}$`,
                        });
                    }
                }

                (parent.children as Array<RootContent | ElementContent>).splice(
                    index,
                    1,
                    ...(nodes as Array<RootContent | ElementContent>),
                );
            }
        }

        if (failures.length > 0) {
            console.warn(
                `postpress: ${failures.length} formula(s) could not be typeset and were left as source text:\n` +
                    failures.map((message) => `  - ${message}`).join('\n'),
            );
        }
    };
};
