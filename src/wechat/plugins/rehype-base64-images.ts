import type { Plugin } from 'unified';
import type { Root, Element } from 'hast';
import { visit } from 'unist-util-visit';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { sanitizeSvgMarkup, hasUnrenderableSvgFeatures, isSvgDocument } from '../svg.ts';

const MAX_SIZE = 2 * 1024 * 1024; // 2MB WeChat limit
const MIN_FILE_SIZE = 1 * 1024; // 1KB minimum file size
const MIN_DIMENSION = 120; // Minimum width/height in pixels

type SourceType = 'local' | 'remote' | 'data-uri';

/**
 * How SVG images are embedded.
 * - `auto` (default): keep vector, but rasterize when the SVG uses features
 *   the WeChat editor cannot render (`url(#id)`, foreignObject, nested svg)
 * - `vector`: always keep vector
 * - `raster`: always rasterize to PNG (legacy behaviour)
 */
export type SvgMode = 'auto' | 'vector' | 'raster';

function classifySource(src: string): SourceType {
    if (src.startsWith('data:')) return 'data-uri';
    if (src.startsWith('http://') || src.startsWith('https://')) return 'remote';
    return 'local';
}

function detectFormat(ext: string): string {
    const map: Record<string, string> = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        svg: 'image/svg+xml',
        webp: 'image/webp',
        avif: 'image/avif',
        tiff: 'image/tiff',
        tif: 'image/tiff',
    };
    return map[ext] || 'image/png';
}

/**
 * Convert an SVG source file to a data URI.
 *
 * Vector output is the default: the WeChat editor renders both inline `<svg>`
 * and `data:image/svg+xml;base64` correctly (verified 2026-09-19), and vector
 * stays crisp at any density. SVGs that depend on `id` references
 * (`url(#gradient)`), `<foreignObject>` or nested `<svg>` are rasterized
 * instead, because the editor deletes ids and drops those subtrees.
 */
async function svgToDataUri(
    buffer: Buffer,
    maxSize: number,
    sourcePath: string,
    svgMode: SvgMode,
): Promise<string> {
    const source = buffer.toString('utf8');
    if (!isSvgDocument(source)) {
        throw new Error(`Invalid SVG file: ${sourcePath} (missing root <svg> element)`);
    }

    const svg = sanitizeSvgMarkup(source);
    const rasterize =
        svgMode === 'raster' || (svgMode === 'auto' && hasUnrenderableSvgFeatures(svg));

    if (!rasterize) {
        const size = Buffer.byteLength(svg, 'utf8');
        if (size > maxSize) {
            throw new Error(
                `Image exceeds 2MB after compression: ${sourcePath} (${(size / 1024 / 1024).toFixed(1)}MB)`,
            );
        }
        return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
    }

    const pngBuffer = await sharp(buffer).png().toBuffer();
    if (pngBuffer.length > maxSize) {
        throw new Error(
            `Image exceeds 2MB after compression: ${sourcePath} (${(pngBuffer.length / 1024 / 1024).toFixed(1)}MB)`,
        );
    }
    return `data:image/png;base64,${pngBuffer.toString('base64')}`;
}

/**
 * Compress a buffer and return a base64 data URI.
 * SVG: kept as vector data URI (rasterized only when WeChat can't render it).
 * GIF: resize with sharp (animated: true) to stay under maxSize.
 * Others: convert to PNG with compression; fall back to JPEG if needed.
 */
async function compressToDataUri(
    buffer: Buffer,
    mime: string,
    maxSize: number,
    sourcePath: string,
    svgMode: SvgMode = 'auto',
): Promise<string> {
    // --- Format-specific fast path: SVG is text, not bitmap ---
    // Size/dimension guards below are bitmap heuristics and don't apply.
    if (mime === 'image/svg+xml') {
        return svgToDataUri(buffer, maxSize, sourcePath, svgMode);
    }

    // --- Unified validation (fast fail for all bitmap formats) ---
    if (buffer.length < MIN_FILE_SIZE) {
        throw new Error(
            `Image file too small: ${sourcePath} (${buffer.length} bytes, minimum ${MIN_FILE_SIZE} bytes)`,
        );
    }

    const meta = await sharp(buffer).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
        throw new Error(
            `Image too small: ${sourcePath} (${width}x${height}px, minimum ${MIN_DIMENSION}x${MIN_DIMENSION}px)`,
        );
    }

    // --- Format-specific processing ---

    // GIF: preserve animation, resize if too large
    if (mime === 'image/gif') {
        let result = buffer;
        if (result.length > maxSize) {
            let gifWidth = 1080;
            while (gifWidth >= 100) {
                result = await sharp(buffer, { animated: true })
                    .resize({ width: gifWidth, withoutEnlargement: true })
                    .gif()
                    .toBuffer();
                if (result.length <= maxSize) break;
                gifWidth = Math.floor(gifWidth * 0.7);
            }
        }
        if (result.length > maxSize) {
            throw new Error(
                `Image exceeds 2MB after compression: ${sourcePath} (${(result.length / 1024 / 1024).toFixed(1)}MB)`,
            );
        }
        return `data:image/gif;base64,${result.toString('base64')}`;
    }

    // Other formats: reuse metadata from dimension check above
    const origWidth = width || 1920;
    let result: Buffer;

    // Try PNG at original size (lossless)
    result = await sharp(buffer)
        .png({ compressionLevel: 6 })
        .toBuffer();

    if (result.length <= maxSize) {
        return `data:image/png;base64,${result.toString('base64')}`;
    }

    // Shrink PNG progressively if over 2MB
    let currentWidth = origWidth;
    while (currentWidth >= 100) {
        currentWidth = Math.floor(currentWidth * 0.8);
        result = await sharp(buffer)
            .resize({ width: currentWidth, withoutEnlargement: true })
            .png({ compressionLevel: 6 })
            .toBuffer();
        if (result.length <= maxSize) {
            return `data:image/png;base64,${result.toString('base64')}`;
        }
    }

    // PNG failed — fall back to JPEG (flatten alpha to white background)
    for (let jpegWidth = origWidth; jpegWidth >= 100; jpegWidth = Math.floor(jpegWidth * 0.8)) {
        for (const quality of [85, 70, 50]) {
            result = await sharp(buffer)
                .flatten({ background: { r: 255, g: 255, b: 255 } })
                .resize({ width: jpegWidth, withoutEnlargement: true })
                .jpeg({ quality })
                .toBuffer();
            if (result.length <= maxSize) {
                return `data:image/jpeg;base64,${result.toString('base64')}`;
            }
        }
    }

    throw new Error(
        `Image exceeds 2MB after all compression attempts: ${sourcePath} (${(result!.length / 1024 / 1024).toFixed(1)}MB)`,
    );
}

interface Base64ImagesOptions {
    baseDir: string;
    /** SVG embedding strategy. Default: 'auto' */
    svgMode?: SvgMode;
}

/**
 * Rehype plugin: convert local images to compressed base64 data URIs.
 * Skips remote URLs and existing data URIs.
 * Uses sharp for compression with a 2MB limit.
 * SVG files are kept as vector by default (see svgMode).
 */
export const rehypeBase64Images: Plugin<[Base64ImagesOptions], Root> = (options) => {
    const { baseDir, svgMode = 'auto' } = options;

    return async (tree: Root) => {
        const tasks: Array<{ node: Element; imgPath: string; mime: string }> = [];

        visit(tree, 'element', (node: Element) => {
            if (node.tagName !== 'img') return;

            const src = node.properties?.src;
            if (typeof src !== 'string') return;

            const sourceType = classifySource(src);
            if (sourceType !== 'local') return;

            const imgPath = path.resolve(baseDir, src);
            if (!fs.existsSync(imgPath)) {
                throw new Error(`Image file not found: ${imgPath}`);
            }

            const ext = path.extname(imgPath).slice(1).toLowerCase();
            const mime = detectFormat(ext);

            tasks.push({ node, imgPath, mime });
        });

        await Promise.all(
            tasks.map(async ({ node, imgPath, mime }) => {
                const buffer = fs.readFileSync(imgPath);
                const dataUri = await compressToDataUri(
                    Buffer.from(buffer),
                    mime,
                    MAX_SIZE,
                    imgPath,
                    svgMode,
                );
                node.properties.src = dataUri;
            }),
        );
    };
};
