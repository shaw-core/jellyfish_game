import { defineConfig } from 'vite';

export default defineConfig({
  // 相对路径，方便直接部署到 GitHub Pages 子目录
  base: './',
  server: { port: 5173, open: true },
  build: { target: 'es2022', outDir: 'dist' },
});
