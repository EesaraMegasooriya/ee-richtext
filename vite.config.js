import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],

  build: {
    lib: {
      entry: resolve(__dirname, "src/index.js"),
      name: "EERichText",
      formats: ["es"],
      fileName: () => "ee-richtext.js",
    },

    rollupOptions: {
      external: [
        /^react($|\/)/,
        /^react-dom($|\/)/,
      ],
    },
  },
});