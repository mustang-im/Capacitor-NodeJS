import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: './dist',
    ssr: true, // Build for Node.js (SSR mode)
    rollupOptions: {
      input: {
        'after-copy': resolve(__dirname, 'fetch-libnode.ts'),
      },
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        banner: '#!/usr/bin/env node', // Add shebang for executable scripts
      },
      external: (id) => {
        // Externalize node built-ins (they're available at runtime)
        return id.startsWith('node:');
      },
    },
    minify: 'esbuild',
    target: 'node18',
  },
});
