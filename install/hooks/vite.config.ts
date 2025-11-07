import { defineConfig } from 'vite';
import nodeExternals from 'rollup-plugin-node-externals';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    nodeExternals({
      deps: false,
      devDeps: true,
    }),
  ],
  build: {
    outDir: './dist',
    rollupOptions: {
      input: {
        'fetch-libnode': resolve(__dirname, 'both/fetch-libnode.ts'),
        'after-prepare-native-modules-preference': resolve(__dirname, 'both/after-prepare-native-modules-preference.ts'),
        'after-prepare-patch-npm-packages': resolve(__dirname, 'both/after-prepare-patch-npm-packages.ts'),
        'after-prepare-build-node-assets-lists': resolve(__dirname, 'android/after-prepare-build-node-assets-lists.ts'),
        'after-prepare-create-macOS-builder-helper': resolve(__dirname, 'android/after-prepare-create-macOS-builder-helper.ts'),
      },
      output: {
        format: 'es',
        entryFileNames: '[name].js',
      },
    },
    minify: 'esbuild',
  },
});