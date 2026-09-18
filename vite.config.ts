import { defineConfig } from "vite";

export default defineConfig({
  base: "/The-WAR/",
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
