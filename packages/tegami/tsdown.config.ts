import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/generators/simple.ts", "src/plugins/github.ts", "src/registry/*"],
  target: "es2023",
  dts: {
    sourcemap: false,
  },
  exports: true,
  deps: {
    onlyBundle: [],
  },
});
