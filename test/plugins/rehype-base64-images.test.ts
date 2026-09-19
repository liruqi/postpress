import { describe, it, expect, beforeAll } from 'vitest';
import { processWithPlugin } from '../helpers.ts';
import { rehypeBase64Images } from '../../src/wechat/plugins/index.ts';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures/images');

beforeAll(async () => {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });

    // Generate a 200x200 PNG with noise (ensures file > 2KB)
    const noiseBuffer = Buffer.alloc(200 * 200 * 3);
    for (let i = 0; i < noiseBuffer.length; i++) noiseBuffer[i] = Math.floor(Math.random() * 256);
    const smallPngPath = path.join(FIXTURES_DIR, 'small.png');
    if (!fs.existsSync(smallPngPath)) {
        await sharp(noiseBuffer, { raw: { width: 200, height: 200, channels: 3 } })
            .png()
            .toFile(smallPngPath);
    }

    // Generate a 200x200 GIF with noise (ensures file > 2KB)
    const pngBuf = await sharp(noiseBuffer, { raw: { width: 200, height: 200, channels: 3 } })
        .png()
        .toBuffer();
    const smallGifPath = path.join(FIXTURES_DIR, 'small.gif');
    if (!fs.existsSync(smallGifPath)) {
        await sharp(pngBuf).gif().toFile(smallGifPath);
    }

    // Generate a tiny 50x50 PNG with noise (above 2KB file size, below 120px dimension)
    const tinyNoise = Buffer.alloc(50 * 50 * 3);
    for (let i = 0; i < tinyNoise.length; i++) tinyNoise[i] = Math.floor(Math.random() * 256);
    const tinyPngPath = path.join(FIXTURES_DIR, 'tiny.png');
    if (!fs.existsSync(tinyPngPath)) {
        await sharp(tinyNoise, { raw: { width: 50, height: 50, channels: 3 } })
            .png()
            .toFile(tinyPngPath);
    }

    // Generate a detailed SVG icon (document + pen with gradients, shadows, shapes)
    const iconPath = path.join(FIXTURES_DIR, 'icon.svg');
    if (!fs.existsSync(iconPath)) {
        fs.writeFileSync(
            iconPath,
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
  <defs>
    <linearGradient id="docGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#667eea"/>
      <stop offset="100%" stop-color="#764ba2"/>
    </linearGradient>
    <linearGradient id="penGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f093fb"/>
      <stop offset="100%" stop-color="#f5576c"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="130%" height="130%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.15)"/>
    </filter>
  </defs>
  <circle cx="60" cy="60" r="56" fill="#f5f5f7" stroke="#e5e5ea" stroke-width="1"/>
  <rect x="30" y="20" width="50" height="65" rx="4" fill="url(#docGrad)" filter="url(#shadow)"/>
  <line x1="38" y1="34" x2="72" y2="34" stroke="rgba(255,255,255,0.6)" stroke-width="2" stroke-linecap="round"/>
  <line x1="38" y1="44" x2="72" y2="44" stroke="rgba(255,255,255,0.6)" stroke-width="2" stroke-linecap="round"/>
  <line x1="38" y1="54" x2="62" y2="54" stroke="rgba(255,255,255,0.6)" stroke-width="2" stroke-linecap="round"/>
  <line x1="38" y1="64" x2="68" y2="64" stroke="rgba(255,255,255,0.4)" stroke-width="2" stroke-linecap="round"/>
  <line x1="38" y1="74" x2="55" y2="74" stroke="rgba(255,255,255,0.3)" stroke-width="2" stroke-linecap="round"/>
  <g transform="translate(68,58) rotate(30)">
    <rect x="-3" y="-30" width="6" height="36" rx="1.5" fill="url(#penGrad)" filter="url(#shadow)"/>
    <polygon points="-3,6 3,6 0,12" fill="#f5576c"/>
    <rect x="-3" y="-30" width="6" height="6" rx="1" fill="rgba(255,255,255,0.3)"/>
  </g>
  <path d="M72 20 L80 20 L80 28 Z" fill="rgba(255,255,255,0.2)"/>
  <circle cx="90" cy="30" r="2" fill="#667eea" opacity="0.6"/>
  <circle cx="95" cy="42" r="1.5" fill="#f093fb" opacity="0.5"/>
  <circle cx="85" cy="22" r="1" fill="#764ba2" opacity="0.4"/>
  <text x="60" y="108" text-anchor="middle" font-size="9" font-family="system-ui,sans-serif" font-weight="600" fill="#6e6e73">postpress</text>
</svg>`,
        );
    }

    // Generate a "flat" SVG — no ids, no gradients, no foreignObject.
    // Deliberately carries the things WeChat strips (id, <style>, <script>, <a>)
    // and omits width/height so the sanitizer has to derive them from viewBox.
    const flatPath = path.join(FIXTURES_DIR, 'flat.svg');
    if (!fs.existsSync(flatPath)) {
        fs.writeFileSync(
            flatPath,
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <style>.label{fill:#6e6e73}</style>
  <script>alert('xss')</script>
  <circle id="bg" cx="60" cy="60" r="56" fill="#f5f5f7" stroke="#e5e5ea" stroke-width="1"/>
  <rect id="doc" x="30" y="24" width="60" height="72" rx="6" fill="#667eea"/>
  <line x1="40" y1="42" x2="80" y2="42" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
  <line x1="40" y1="56" x2="80" y2="56" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
  <line x1="40" y1="70" x2="62" y2="70" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
  <a href="https://example.com"><text x="60" y="110" text-anchor="middle" font-size="9" fill="#6e6e73">postpress</text></a>
</svg>`,
        );
    }

    // Generate a large image (3000x3000 to test compression)
    const largePngPath = path.join(FIXTURES_DIR, 'large.png');
    if (!fs.existsSync(largePngPath)) {
        await sharp({
            create: { width: 3000, height: 3000, channels: 3, background: { r: 128, g: 128, b: 128 } },
        })
            .png({ compressionLevel: 0 }) // uncompressed = large
            .toFile(largePngPath);
    }
});

describe('rehypeBase64Images', () => {
    it('should convert local PNG to base64 data URI', async () => {
        const md = `![alt](images/small.png)`;
        const html = await processWithPlugin(md, rehypeBase64Images, {
            baseDir: path.resolve(__dirname, '../fixtures'),
        });
        expect(html).toContain('src="data:image/png;base64,');
        expect(html).not.toContain('images/small.png');
    });

    it('should skip data: URIs', async () => {
        const md = `![alt](data:image/png;base64,abc123)`;
        const html = await processWithPlugin(md, rehypeBase64Images, {
            baseDir: FIXTURES_DIR,
        });
        expect(html).toContain('data:image/png;base64,abc123');
    });

    it('should skip http(s) URLs', async () => {
        const md = `![alt](https://example.com/img.png)`;
        const html = await processWithPlugin(md, rehypeBase64Images, {
            baseDir: FIXTURES_DIR,
        });
        expect(html).toContain('https://example.com/img.png');
    });

    it('should throw when local image file is missing', async () => {
        const md = `![alt](images/not-found.png)`;
        await expect(
            processWithPlugin(md, rehypeBase64Images, {
                baseDir: path.resolve(__dirname, '../fixtures'),
            }),
        ).rejects.toThrow('Image file not found');
    });

    it('should compress large images to fit under 2MB', async () => {
        const md = `![alt](images/large.png)`;
        const html = await processWithPlugin(md, rehypeBase64Images, {
            baseDir: path.resolve(__dirname, '../fixtures'),
        });
        // Extract base64 data
        const match = html.match(/src="data:image\/[^;]+;base64,([^"]+)"/);
        expect(match).toBeTruthy();
        const buffer = Buffer.from(match![1], 'base64');
        expect(buffer.length).toBeLessThanOrEqual(2 * 1024 * 1024);
    });

    it('should preserve GIF MIME type', async () => {
        const md = `![alt](images/small.gif)`;
        const html = await processWithPlugin(md, rehypeBase64Images, {
            baseDir: path.resolve(__dirname, '../fixtures'),
        });
        expect(html).toContain('src="data:image/gif;base64,');
    });

    it('should reject images smaller than 120px', async () => {
        const md = `![alt](images/tiny.png)`;
        await expect(
            processWithPlugin(md, rehypeBase64Images, {
                baseDir: path.resolve(__dirname, '../fixtures'),
            }),
        ).rejects.toThrow('Image too small');
    });

    it('should keep plain SVG as vector data URI', async () => {
        const md = `![alt](images/flat.svg)`;
        const html = await processWithPlugin(md, rehypeBase64Images, {
            baseDir: path.resolve(__dirname, '../fixtures'),
        });
        expect(html).toContain('src="data:image/svg+xml;base64,');
    });

    it('should sanitize SVG markup for the WeChat editor', async () => {
        const md = `![alt](images/flat.svg)`;
        const html = await processWithPlugin(md, rehypeBase64Images, {
            baseDir: path.resolve(__dirname, '../fixtures'),
        });
        const match = html.match(/src="data:image\/svg\+xml;base64,([^"]+)"/);
        expect(match).toBeTruthy();
        const svg = Buffer.from(match![1], 'base64').toString('utf8');

        // ids, <style>, <script> and <a> are dropped by the editor or unsafe
        expect(svg).not.toContain('id=');
        expect(svg).not.toContain('<style');
        expect(svg).not.toContain('<script');
        expect(svg).not.toContain('<a ');
        // explicit px size (iOS) derived from viewBox, xmlns kept
        expect(svg).toContain('width="120"');
        expect(svg).toContain('height="120"');
        expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
        // content survives
        expect(svg).toContain('<rect');
        expect(svg).toContain('postpress');
    });

    it('should rasterize SVG that depends on url(#id) references (auto mode)', async () => {
        const md = `![alt](images/icon.svg)`;
        const html = await processWithPlugin(md, rehypeBase64Images, {
            baseDir: path.resolve(__dirname, '../fixtures'),
        });
        // icon.svg uses fill="url(#docGrad)" / filter="url(#shadow)" — ids are
        // deleted by the WeChat editor, so vector output would render empty.
        expect(html).toContain('src="data:image/png;base64,');
        expect(html).not.toContain('image/svg+xml');
    });

    it('should keep url(#id) SVG as vector when svgMode is "vector"', async () => {
        const md = `![alt](images/icon.svg)`;
        const html = await processWithPlugin(md, rehypeBase64Images, {
            baseDir: path.resolve(__dirname, '../fixtures'),
            svgMode: 'vector',
        });
        expect(html).toContain('src="data:image/svg+xml;base64,');
    });

    it('should rasterize SVG when svgMode is "raster"', async () => {
        const md = `![alt](images/flat.svg)`;
        const html = await processWithPlugin(md, rehypeBase64Images, {
            baseDir: path.resolve(__dirname, '../fixtures'),
            svgMode: 'raster',
        });
        expect(html).toContain('src="data:image/png;base64,');
    });
});
