import { defineConfig } from 'vite';

export default defineConfig({
  base: '/The-WAR/',
  build: {
    rollupOptions: {
      input: ['index.html', 'terrain-editor/index.html'],
    },
  },
});
