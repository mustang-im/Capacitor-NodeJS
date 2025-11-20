import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'node:url';
import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const __dirname = dirname(fileURLToPath(import.meta.url));

// External modules that should not be bundled
const EXTERNAL_MODULES = ['nodejs-mobile-gyp', 'xcode', 'adm-zip'];

const scriptInputs = {
  'before-sync': resolve(__dirname, 'common/before-sync.ts'),
  'after-sync': resolve(__dirname, 'common/after-sync.ts'),
  'fetch-libnode': resolve(__dirname, 'common/fetch-libnode.ts'),
  'rebuild-native-module': resolve(__dirname, 'common/rebuild-native-module.ts'),
  'ios-after-sync': resolve(__dirname, 'ios/ios-after-sync.ts'),
  'ios-create-plists-and-dlopen-override': resolve(__dirname, 'ios/ios-create-plists-and-dlopen-override.ts'),
  'create-frameworks-and-override': resolve(__dirname, 'ios/create-frameworks-and-override.ts'),
  'override-dlopen-paths-preload': resolve(__dirname, 'ios/override-dlopen-paths-preload.ts'),
  'rebuild-native-modules': resolve(__dirname, 'ios/rebuild-native-modules.ts'),
  'sign-native-modules': resolve(__dirname, 'ios/sign-native-modules.ts'),
};

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'ios/ios-xcframework-info-plist.template.xml',
          dest: '.',
        },
      ],
    }),
    commonjs({
      transformMixedEsModules: true,
      // Handle CommonJS modules that don't have default exports
      defaultIsModuleExports: true,
      requireReturnsDefault: 'auto',
    }),
  ],
  ssr: {
    // Bundle all dependencies except external modules
    noExternal: new RegExp(`^(?!${EXTERNAL_MODULES.join('|')}).*$`),
  },
  build: {
    outDir: './dist',
    ssr: true,
    rollupOptions: {
      input: scriptInputs,
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        inlineDynamicImports: false,
        // Optimize for smaller output
        compact: true, // Remove whitespace
        generatedCode: {
          constBindings: true, // Use const instead of var for better minification
        },
      },
      external: (id) => {
        // Externalize node built-ins and specific modules (they'll be resolved from node_modules at runtime)
        if (id.startsWith('node:')) {
          return true; // Node built-ins
        }
        // Check if id matches any external module or its subpaths
        return EXTERNAL_MODULES.some((module) => id === module || id.startsWith(`${module}/`));
      },
      plugins: [
        nodeResolve({
          preferBuiltins: true,
          exportConditions: ['node', 'default'],
          // Bundle all dependencies except external modules
          resolveOnly: (module) => !EXTERNAL_MODULES.includes(module),
        }),
      ],
    },
    minify: 'esbuild', // Fast and effective minification
    target: 'node18',
    sourcemap: false, // Disable sourcemaps for smaller bundles
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    // Optimize chunk size
    chunkSizeWarningLimit: 1000,
  },
});
