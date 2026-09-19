import { describe, it, expect } from 'vitest';
import { processWithPlugin } from '../helpers.ts';
import { rehypeFootnoteLinks } from '../../src/wechat/plugins/index.ts';

describe('rehypeFootnoteLinks', () => {
    it('should convert external links to footnotes', async () => {
        const md = '[Example](https://example.com)';
        const html = await processWithPlugin(md, rehypeFootnoteLinks);
        // Link text should remain, with a footnote reference
        expect(html).toContain('Example');
        expect(html).toContain('<sup>');
        expect(html).toContain('[1]');
        // Should not have <a> for external links
        expect(html).not.toContain('<a');
    });

    it('should preserve mp.weixin.qq.com links', async () => {
        const md = '[WeChat Article](https://mp.weixin.qq.com/s/abc123)';
        const html = await processWithPlugin(md, rehypeFootnoteLinks);
        expect(html).toContain('<a');
        expect(html).toContain('mp.weixin.qq.com');
        expect(html).not.toContain('<sup>');
    });

    it('should share footnote numbers for duplicate URLs', async () => {
        const md = '[First](https://example.com) and [Second](https://example.com)';
        const html = await processWithPlugin(md, rehypeFootnoteLinks);
        // Both should reference [1]
        const supMatches = html.match(/\[1\]/g);
        expect(supMatches?.length).toBeGreaterThanOrEqual(2);
        // Should not have [2]
        expect(html).not.toContain('[2]');
    });

    it('should strip anchor links but not add footnotes', async () => {
        const md = '[Section](#my-section)';
        const html = await processWithPlugin(md, rehypeFootnoteLinks);
        expect(html).toContain('Section');
        expect(html).not.toContain('<a');
        expect(html).not.toContain('<sup>');
    });

    it('should strip relative links but not add footnotes', async () => {
        const md = '[Page](./other.md)';
        const html = await processWithPlugin(md, rehypeFootnoteLinks);
        expect(html).toContain('Page');
        expect(html).not.toContain('<a');
        expect(html).not.toContain('<sup>');
    });

    it('should strip protocol-relative links and add footnotes', async () => {
        const md = '[CDN](//example.com/lib.js)';
        const html = await processWithPlugin(md, rehypeFootnoteLinks);
        expect(html).not.toContain('<a');
        expect(html).toContain('<sup>');
        expect(html).toContain('//example.com/lib.js');
    });

    it('should append References section with title at the end', async () => {
        const md = '[Example](https://example.com)\n\nSome text.';
        const html = await processWithPlugin(md, rehypeFootnoteLinks);
        expect(html).toContain('References');
        expect(html).toContain('font-size: 13px');
        expect(html).toContain('#86868b');
        expect(html).not.toContain('<hr>');
        expect(html).toContain('https://example.com');
        expect(html).toContain('[1]');
    });

    it('should not add footnote section when no external links', async () => {
        const md = 'Just plain text with no links.';
        const html = await processWithPlugin(md, rehypeFootnoteLinks);
        expect(html).not.toContain('References');
    });

    it('should render Wikipedia links as colored inline terms', async () => {
        const md = '[猜想](https://en.wikipedia.org/wiki/conjecture)';
        const html = await processWithPlugin(md, rehypeFootnoteLinks);
        expect(html).toContain('猜想');
        expect(html).toContain('#2e8555');
        expect(html).not.toContain('<sup>');
        expect(html).not.toContain('<a');
        expect(html).not.toContain('en.wikipedia.org');
    });

    it('should not add a References section for term-only links', async () => {
        const md = '[素数](https://en.wikipedia.org/wiki/prime_numbers) 是 [自然数](https://en.wikipedia.org/wiki/natural_number) 的一种。';
        const html = await processWithPlugin(md, rehypeFootnoteLinks);
        expect(html).not.toContain('References');
        expect(html).not.toContain('<sup>');
    });

    it('should keep footnotes for non-term hosts alongside colored terms', async () => {
        const md = '[猜想](https://en.wikipedia.org/wiki/conjecture) 与 [论文](https://arxiv.org/abs/1234)';
        const html = await processWithPlugin(md, rehypeFootnoteLinks);
        expect(html).toContain('#2e8555');
        expect(html).toContain('<sup>[1]</sup>');
        expect(html).toContain('References');
        expect(html).toContain('https://arxiv.org/abs/1234');
        // Only the arxiv URL is footnoted, so it takes number 1
        expect(html).not.toContain('[2]');
    });

    it('should match term hosts by subdomain suffix', async () => {
        const html = await processWithPlugin(
            '[X](https://en.m.wikipedia.org/wiki/y)',
            rehypeFootnoteLinks,
            { termHosts: ['wikipedia.org'] },
        );
        expect(html).toContain('#2e8555');
        expect(html).not.toContain('<sup>');
    });

    it('should fall back to footnotes when term hosts are disabled', async () => {
        const html = await processWithPlugin(
            '[猜想](https://en.wikipedia.org/wiki/conjecture)',
            rehypeFootnoteLinks,
            { termHosts: [] },
        );
        expect(html).toContain('<sup>');
        expect(html).toContain('References');
        expect(html).not.toContain('#2e8555');
    });

    it('should honour a custom term color', async () => {
        const html = await processWithPlugin(
            '[猜想](https://en.wikipedia.org/wiki/conjecture)',
            rehypeFootnoteLinks,
            { termColor: '#ff0000' },
        );
        expect(html).toContain('#ff0000');
    });

    it('should number different URLs sequentially', async () => {
        const md = '[A](https://a.com) and [B](https://b.com)';
        const html = await processWithPlugin(md, rehypeFootnoteLinks);
        expect(html).toContain('[1]');
        expect(html).toContain('[2]');
        expect(html).toContain('https://a.com');
        expect(html).toContain('https://b.com');
    });
});
