import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    plugin: 'src/plugin.ts',
    simple: 'src/simple.ts',
  },
  dts: { oxc: true },
  format: ['cjs', 'esm'],
  external: [
    'vite'
  ],
  exports: true
})