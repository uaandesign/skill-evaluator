import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite 构建配置
 * - 本地开发：通过 proxy 把 /api 请求转发到 dev-server.js (端口 3001)
 * - 生产构建：拆分大依赖到独立 chunk，避免单文件 >1MB 警告
 *   + Vercel 部署时 /api/* 由 Serverless Functions 处理，无需 proxy
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          // React 核心独立打包，长期缓存
          'react-vendor': ['react', 'react-dom'],
          // Ant Design + 图标体积最大，单独拆出
          'antd-vendor': ['antd', '@ant-design/icons'],
          // 图表库
          'chart-vendor': ['recharts'],
          // 工具类
          'utils-vendor': ['zustand', 'diff'],
        },
      },
    },
  },
});
