import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    plugin: 'src/plugin.ts',
    simple: 'src/simple.ts',
  },
  format: ['cjs', 'esm'],
  external: [
    'vite'
  ],
  exports: true
})