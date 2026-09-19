import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        include: ['test/**/*.test.ts'],
        // Renderer and script tests shell out and touch the filesystem; they take
        // 2-4s each on their own and blew past the 5s default once the suite ran
        // files in parallel. Still short enough to catch a genuine hang.
        testTimeout: 20000,
    },
});
