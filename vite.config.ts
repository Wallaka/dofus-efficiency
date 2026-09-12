import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the build works when served from a subpath, e.g.
  // GitHub Pages at https://wallaka.github.io/dofus-efficiency/.
  base: "./",
  plugins: [react()],
});
