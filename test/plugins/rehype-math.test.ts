import { describe, it, expect, beforeAll } from 'vitest';
import { processWithPlugin } from '../helpers.ts';
import { rehypeMath } from '../../src/wechat/plugins/index.ts';
import { rehypeMath as rehypeMathDirect, tokenizeMath } from '../../src/wechat/plugins/rehype-math.ts';

describe('tokenizeMath', () => {
    it('detects display math', () => {
        const segments = tokenizeMath('$$\n\\zeta(s) = 0\n$$', true);
        expect(segments).toEqual([
            { type: 'math', tex: '\\zeta(s) = 0', display: true },
        ]);
    });

    it('detects inline math surrounded by text', () => {
        const segments = tokenizeMath('设 $x > 0$ 时', true);
        expect(segments).toEqual([
            { type: 'text', value: '设 ' },
            { type: 'math', tex: 'x > 0', display: false },
            { type: 'text', value: ' 时' },
        ]);
    });

    it('leaves currency alone', () => {
        expect(tokenizeMath('价格 $5 到 $10 元', true)).toBeNull();
        expect(tokenizeMath('$100', true)).toBeNull();
    });

    it('respects escaped delimiters', () => {
        expect(tokenizeMath('\\$x + y\\$', true)).toBeNull();
    });

    it('leaves unclosed delimiters as text', () => {
        expect(tokenizeMath('$x + y', true)).toBeNull();
        expect(tokenizeMath('$$x + y', true)).toBeNull();
    });

    it('can disable inline math', () => {
        expect(tokenizeMath('$x$', false)).toBeNull();
        expect(tokenizeMath('$$x$$', false)).toEqual([
            { type: 'math', tex: 'x', display: true },
        ]);
    });
});

async function renderMath(md: string, options: any = {}) {
    return processWithPlugin(md, rehypeMath, { enabled: true, ...options });
}

function decodeSvg(html: string): string {
    const match = html.match(/src="data:image\/svg\+xml;base64,([^"]+)"/);
    expect(match).toBeTruthy();
    return Buffer.from(match![1], 'base64').toString('utf8');
}

describe('rehypeMath', () => {
    // MathJax parses its font data during the first conversion (a few seconds).
    // Warm it up once so the individual tests stay inside their own timeouts.
    beforeAll(async () => {
        await renderMath('$$x$$');
    }, 120000);

    it('renders display math to an SVG data URI', async () => {
        const html = await renderMath('$$\\zeta(s) = \\sum_{n=1}^{\\infty} \\frac{1}{n^s}$$');
        expect(html).toContain('src="data:image/svg+xml;base64,');
        expect(html).not.toContain('$$');
    });

    it('renders inline math inside a sentence', async () => {
        const html = await renderMath('设 $s = \\sigma + it$ 为复数。');
        expect(html).toContain('src="data:image/svg+xml;base64,');
        expect(html).toContain('设 ');
        expect(html).toContain(' 为复数。');
    });

    it('emits self-contained SVG (paths, no id references)', async () => {
        const html = await renderMath('$$\\frac{1}{2}$$');
        const svg = decodeSvg(html);
        // fontCache: 'none' → real glyph paths, no <use href="#...">
        expect(svg).toContain('<path');
        expect(svg).not.toContain('<use');
        expect(svg).not.toContain('id=');
        expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    });

    it('converts width/height to px and keeps the baseline offset', async () => {
        const html = await renderMath('设 $x^2$ 的值');
        const svg = decodeSvg(html);
        expect(svg).toMatch(/width="[\d.]+"/);
        expect(svg).toMatch(/height="[\d.]+"/);
        expect(html).toMatch(/vertical-align: -?[\d.]+px|vertical-align: middle/);
    });

    it('centers display math and inlines inline math', async () => {
        const display = await renderMath('$$a+b$$');
        expect(display).toContain('display: block');
        const inline = await renderMath('值 $a+b$ 中');
        expect(inline).toContain('display: inline');
    });

    it('does not touch math inside code blocks', async () => {
        const html = await renderMath('`$$a+b$$`');
        expect(html).not.toContain('data:image/svg+xml');
        expect(html).toContain('$$a+b$$');
    });

    it('leaves plain text untouched', async () => {
        const html = await renderMath('价格 $5 到 $10 元');
        expect(html).toContain('价格 $5 到 $10 元');
        expect(html).not.toContain('data:image/svg+xml');
    });

    it('renders # (Markdown unescapes \\# to a bare hash)', async () => {
        const html = await renderMath('设 $n \\ge 120569\\#$ 成立');
        const svg = decodeSvg(html);
        // A bare # is the TeX macro parameter character: MathJax would emit an
        // <merror> box (a black bar) instead of the formula.
        expect(svg).not.toContain('data-mjx-error');
        expect(svg).not.toContain('merror');
        expect(svg).toContain('<path');
    });

    it('renders % (Markdown unescapes \\% to a bare percent)', async () => {
        const html = await renderMath('$50\\%$');
        const svg = decodeSvg(html);
        expect(svg).not.toContain('data-mjx-error');
        expect(svg).toContain('<path');
    });

    it('leaves untypeset formulas as source text instead of an error box', async () => {
        // An unknown environment makes MathJax emit <merror> — a full-width
        // rect painted in the glyph color, i.e. a black bar in the article.
        const html = await renderMath('$$\\begin{nope}x\\end{nope}$$');
        expect(html).not.toContain('data:image/svg+xml');
        expect(html).toContain('\\begin{nope}x\\end{nope}');
    });

    it('does not put raw TeX in an alt attribute', async () => {
        const html = await renderMath('设 $n>1$ 时');
        // A bare > inside alt="..." makes the WeChat parser end the <img> early
        // and spill the rest of the tag into the article as text.
        const img = (html.match(/<img[^>]*>/) ?? [''])[0];
        expect(img).not.toContain('alt=');
        expect(html).toContain('data:image/svg+xml;base64,');
    });

    it('is a no-op when disabled', async () => {
        const html = await processWithPlugin('$$a+b$$', rehypeMathDirect, { enabled: false });
        expect(html).not.toContain('data:image/svg+xml');
    });
}, 60000);
