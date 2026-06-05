import { defineConfig } from "vite";
import { fileURLToPath } from "url";
import path from "path";

export default defineConfig({
  build: {
    lib: {
      entry: fileURLToPath(new URL("src/index.ts", import.meta.url)),
      name: "Icarus",
      fileName: "icarus",
      formats: ["es"],
    },
    rollupOptions: {
      external: ["pixi.js"],
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
