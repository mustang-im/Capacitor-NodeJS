import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [],
  build: {
    outDir: './dist',
    ssr: true, // Build for Node.js (SSR mode)
    rollupOptions: {
      input: {
        'after-copy': resolve(__dirname, 'after-copy.ts'),
      },
      output: {
        format: 'es',
        entryFileNames: '[name].js',
      },
      external: (id) => {
        // Externalize node built-ins and @capacitor/cli (available in user's node_modules)
        return id.startsWith('node:') || id === '@capacitor/cli/dist/config.js' || id.startsWith('@capacitor/cli');
      },
    },
    minify: 'esbuild',
  },
});

