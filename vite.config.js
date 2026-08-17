import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" makes the build use relative asset paths, so it works
// correctly under a GitHub Pages project path without hardcoding the repo
// name here.
export default defineConfig({
  plugins: [react()],
  base: "./",
});
