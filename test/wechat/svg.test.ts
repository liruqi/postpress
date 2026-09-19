import { describe, it, expect } from 'vitest';
import {
    sanitizeSvgMarkup,
    hasUnrenderableSvgFeatures,
    parseViewBox,
    svgSizeFromViewBox,
    isSvgDocument,
} from '../../src/wechat/svg.ts';

describe('sanitizeSvgMarkup', () => {
    it('strips xml prolog, doctype, comments, script and style', () => {
        const input = `<?xml version="1.0"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x.dtd">
<!-- a comment -->
<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">
  <style>circle{fill:red}</style>
  <script>alert(1)</script>
  <circle cx="5" cy="5" r="4"/>
</svg>`;
        const out = sanitizeSvgMarkup(input);
        expect(out).not.toContain('<?xml');
        expect(out).not.toContain('DOCTYPE');
        expect(out).not.toContain('<!--');
        expect(out).not.toContain('<style');
        expect(out).not.toContain('<script');
        expect(out).toContain('<circle');
    });

    it('removes id and on* attributes and unwraps <a>', () => {
        const input = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">
  <g id="wrapper" onload="alert(1)"><a href="https://x.test"><rect width="4" height="4"/></a></g>
</svg>`;
        const out = sanitizeSvgMarkup(input);
        expect(out).not.toContain('id=');
        expect(out).not.toContain('onload');
        expect(out).not.toContain('<a ');
        expect(out).toContain('<rect');
    });

    it('derives width/height from viewBox when missing', () => {
        const out = sanitizeSvgMarkup(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 180"><rect/></svg>`,
        );
        expect(out).toContain('width="240"');
        expect(out).toContain('height="180"');
    });

    it('keeps existing numeric width/height', () => {
        const out = sanitizeSvgMarkup(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 180" width="24" height="18"><rect/></svg>`,
        );
        expect(out).toContain('width="24"');
        expect(out).toContain('height="18"');
    });

    it('adds xmlns when missing', () => {
        const out = sanitizeSvgMarkup(`<svg width="10" height="10"><rect/></svg>`);
        expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    });
});

describe('hasUnrenderableSvgFeatures', () => {
    it('detects url(#id) references', () => {
        expect(hasUnrenderableSvgFeatures(`<svg><rect fill="url(#grad)"/></svg>`)).toBe(true);
        expect(hasUnrenderableSvgFeatures(`<svg><rect fill="url( '#grad' )"/></svg>`)).toBe(true);
    });

    it('detects foreignObject and nested svg', () => {
        expect(hasUnrenderableSvgFeatures(`<svg><foreignObject><div/></foreignObject></svg>`)).toBe(true);
        expect(hasUnrenderableSvgFeatures(`<svg><svg><rect/></svg></svg>`)).toBe(true);
    });

    it('returns false for flat vector art', () => {
        expect(hasUnrenderableSvgFeatures(`<svg><rect fill="#667eea"/></svg>`)).toBe(false);
    });
});

describe('parseViewBox / svgSizeFromViewBox', () => {
    it('parses viewBox dimensions', () => {
        expect(parseViewBox(`<svg viewBox="0 0 120 60">`)).toEqual({ width: 120, height: 60 });
        expect(parseViewBox(`<svg viewBox="0,0,120,60">`)).toEqual({ width: 120, height: 60 });
        expect(parseViewBox(`<svg>`)).toBeNull();
    });

    it('converts a viewBox attribute value to CSS pixels', () => {
        expect(svgSizeFromViewBox('0 0 300 150')).toEqual({ width: '300', height: '150' });
        expect(svgSizeFromViewBox(undefined)).toBeNull();
        expect(svgSizeFromViewBox('0 0 0 0')).toBeNull();
    });
});

describe('isSvgDocument', () => {
    it('requires both an opening and closing svg tag', () => {
        expect(isSvgDocument(`<svg width="1" height="1"></svg>`)).toBe(true);
        expect(isSvgDocument(`<svg width="1" height="1">`)).toBe(false);
        expect(isSvgDocument(`not an svg`)).toBe(false);
    });
});
