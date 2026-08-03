import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json'

/**
 * 生产构建时校验云同步后端地址是否配上了。
 *
 * `VITE_PB_URL` 来自 `.env.local`，而 `.env.local` 是 gitignore 的、只存在于**主仓根目录**。
 * 在 git worktree 里构建时 Vite 从 worktree 根找 `.env.local`，找不到 → PB_URL 为空
 * → `cloudEnabled=false` → App 里显示「云同步功能未配置」。
 * v2.6.0～v2.6.4 五个安装包就是这么出去的：构建全在 worktree 里做，没人发现，
 * 因为纯本地模式一切正常，只有点进云同步才看得出来。
 *
 * 这里不 fail 构建 —— 无云端的纯本地版是受支持的形态。但必须**吼一声**，
 * 而不是让它静默产出一个功能残缺的包。
 */
function assertCloudEnv() {
  return {
    name: 'velvet-assert-cloud-env',
    apply: 'build' as const,
    configResolved(cfg: { env: Record<string, string> }) {
      const url = (cfg.env.VITE_PB_URL ?? '').trim();
      if (url) {
        console.log(`\n  ✓ 云同步后端：${url}\n`);
        return;
      }
      console.warn(
        '\n' +
        '  ╔════════════════════════════════════════════════════════════════╗\n' +
        '  ║  ⚠  VITE_PB_URL 为空 —— 这个包的云同步会显示「功能未配置」        ║\n' +
        '  ║                                                                ║\n' +
        '  ║  .env.local 只在主仓根目录，git worktree 里要自己复制一份：       ║\n' +
        '  ║      cp <主仓>/.env.local .env.local                            ║\n' +
        '  ║                                                                ║\n' +
        '  ║  如果本来就要出纯本地版，忽略这条。                               ║\n' +
        '  ╚════════════════════════════════════════════════════════════════╝\n',
      );
    },
  };
}

export default defineConfig({
  plugins: [
    assertCloudEnv(),
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
        // webp 故意不进预缓存：塔罗三套共 66 张（~3.8 MB），全塞进安装包会显著拖慢
        // 首次安装与 iOS 的磁盘占用。改由下面的 runtimeCaching 在首次看到时收编。
        globPatterns: ['**/*.{js,css,html,ico,png,svg,mp3}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/tarot/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'tarot-art-v1',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // 内嵌中文字体子集（2.6 MB）。与塔罗图同一策略：**不进预缓存**，
            // 免得把 PWA 的首次安装体积顶上去；首屏用系统字兜底（font-display:swap），
            // 见过一次即长期离线可用。原生 APK 里这些文件本就打进安装包，走不到这条。
            urlPattern: ({ url }) => url.pathname.startsWith('/fonts/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'velvet-fonts-v1',
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        // 导航请求（HTML）→ 预缓存里的 index.html。
        // ⚠️ 这**不是** NetworkFirst（旧注释写错了，FS7 审查核对生成的 dist/sw.js 确认：
        // 全文只有一个 CacheFirst——塔罗图——加一个 createHandlerBoundToURL，无 NetworkFirst）。
        // 即：导航永远秒开缓存版；拿新版本靠的是 registerType:'prompt' 那条链——
        // PWAUpdateToast 启动时 registration.update() → 有 waiting SW → 弹「立即更新」。
        // 排查"更新不生效"时请顺着 SW 更新链看，不要去找并不存在的网络优先超时。
        navigateFallback: '/index.html',
        // 明确清理旧版本的预缓存条目，避免 iOS 磁盘上残留过多旧 chunk
        cleanupOutdatedCaches: true,
      },
      // 只列真实存在的文件：favicon.ico / masked-icon.svg 从来没进过 public/，
      // 挂在这里既不会报错也不会生效，纯粹是误导后来人的死配置（v2.6 上线前清掉）
      includeAssets: ['apple-touch-icon.png', 'icon.png'],
      manifest: {
        name: '靛蓝色房间',
        short_name: '靛蓝色房间',
        description: '个人成长追踪器',
        // 不写 lang 的话 vite-plugin-pwa 默认填 'en'——一个全中文的应用
        // 在系统/应用商店那里被标成英文，安装卡片与朗读都会走错语言
        lang: 'zh-CN',
        dir: 'ltr',
        /**
         * 应用身份。不写 id 时浏览器用 start_url 当身份：
         * 哪天 start_url 动一下（加个 query、换个入口路径），已装的 PWA 会被当成
         * **另一个应用**，用户桌面上多出一个图标、旧的那个成了孤儿。
         * 显式钉死一个与路径解耦的 id，是上线前最便宜的一道保险。
         */
        id: '/',
          theme_color: '#3B82F6',
          background_color: '#111827',
          display: 'standalone',
          display_override: ['window-controls-overlay', 'standalone'],
          orientation: 'portrait',
        scope: '/',
        start_url: '/',
        /**
         * any 与 maskable 必须是**两套图**，不能像原来那样一张图挂 'any maskable'。
         * 挂了 maskable 就等于告诉系统「这张图可以随便裁」，Android 会按圆 / squircle /
         * 泪滴各种遮罩去切，只有落在中心 80% 直径圆内的内容才保证不被切掉。
         * 实测原图的标记外接圆半径 239px，而安全半径只有 205px——四角会被啃掉一圈。
         * maskable-*.png 是把同一张图缩到 80% 居中重铺底色生成的（复核后半径 190px，进了安全区）。
         */
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'maskable-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: 'maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
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
          // motion v12 是薄壳，真实实现在其依赖的 framer-motion，两层归同一 chunk
          motion: ['motion', 'framer-motion'],
          // 动线层（DrawSVG 引导线、SplitText 标题逐字）；独立 chunk 优化缓存。
          // 插件是 gsap 的独立子入口（gsap/DrawSVGPlugin 等），不在 'gsap' 主入口的
          // 模块图里——必须逐个列出，否则会漏进体积庞大、改动频繁的 index 主 chunk。
          // 注：MorphSVGPlugin 暂不列入——它只被 dev-only 的 StarTearOverlay 用，列进
          // 来会被 manualChunks 强制打包、抵消 tree-shaking。真接入导航转场后再加回。
          gsap: ['gsap', 'gsap/DrawSVGPlugin', 'gsap/SplitText', '@gsap/react'],
          charts: ['recharts'],  // Dashboard 也依赖 recharts，需保留独立 chunk 以优化缓存
          db: ['dexie', 'dexie-react-hooks']
        }
      }
    }
  }
})
