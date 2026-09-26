import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      // agent-server（pi SDK）：问答 SSE 流式接口
      '/agent': { target: 'http://127.0.0.1:8787', changeOrigin: true },
    },
  },
})
