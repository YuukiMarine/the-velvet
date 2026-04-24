import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // ⚠️ 这里用 'prompt' 而不是 'autoUpdate'。原因：
      //   - autoUpdate 依赖浏览器自己调度 SW 更新检查；iOS Safari PWA 下这个调度很保守
      //     （进程不重启就几乎不检查），会导致用户一直拿不到新版本，误以为"热更新失效"。
      //   - prompt 模式下我们自己在页面里配合 useRegisterSW 定期调 registration.update()，
      //     检测到 waiting SW 时提示"立即更新"；用户确认后通过 SKIP_WAITING + reload 接管。
      //   - 现有的 PWAUpdateToast UI 就是 prompt 模式设计的（"✦ 有新版本可用 · 立即更新"）。
      registerType: 'prompt',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,mp3}'],
        // 导航请求（HTML）走 NetworkFirst：优先请求新版本，断网才用缓存。
        // 默认的 NetworkFirst 超时 3 秒，对 iOS PWA 冷启动足够快。
        navigateFallback: '/index.html',
        // 明确清理旧版本的预缓存条目，避免 iOS 磁盘上残留过多旧 chunk
        cleanupOutdatedCaches: true,
      },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: '靛蓝色房间',
        short_name: '靛蓝色房间',
        description: '个人成长追踪器',
          theme_color: '#3B82F6',
          background_color: '#111827',
          display: 'standalone',
          display_override: ['window-controls-overlay', 'standalone'],
          orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    'import.meta.env.PACKAGE_VERSION': JSON.stringify(pkg.version),
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          motion: ['framer-motion'],
          charts: ['recharts'],  // Dashboard 也依赖 recharts，需保留独立 chunk 以优化缓存
          db: ['dexie', 'dexie-react-hooks']
        }
      }
    }
  }
})
