#!/usr/bin/env node

declare const __APP_VERSION__: string;

import { Command } from 'commander';
import { render as renderWechat } from './wechat/renderer.ts';
import { render as renderX } from './x/renderer.ts';

const program = new Command();

type RenderTarget = 'wechat' | 'x';

function normalizeTarget(input: string): RenderTarget {
    const normalized = input.trim().toLowerCase();
    if (normalized === 'wechat') return 'wechat';
    if (normalized === 'x' || normalized === 'twitter') return 'x';
    throw new Error(`Unsupported target: ${input}. Supported targets: wechat, x, twitter`);
}

program
    .name('postpress')
    .description('Convert Markdown into editor-ready HTML (WeChat MP or X Articles)')
    .version(__APP_VERSION__)
    .requiredOption('-i, --input <path>', 'Input Markdown file path')
    .requiredOption('-o, --output <path>', 'Output HTML file path')
    .option('-t, --target <target>', 'Render target: wechat | x | twitter', 'wechat')
    .option('-c, --copy', 'Copy rendered HTML to system clipboard')
    .option('--math', 'Render $...$ / $$...$$ math as inline SVG (WeChat target)')
    .action(async (options) => {
        try {
            const target = normalizeTarget(options.target);
            const renderer = target === 'wechat' ? renderWechat : renderX;

            const result = await renderer({
                input: options.input,
                output: options.output,
                copy: options.copy,
                math: options.math === true,
            });
            console.log(JSON.stringify({ target, ...result }, null, 2));
        } catch (error) {
            console.error('Error:', error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });

program.parse();
