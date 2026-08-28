import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// ── 双指缩放闸（iOS：WKWebView / 主屏 PWA / Safari 标签页三处都拦） ─────────
// 用户上报「双指向外拉伸整个页面会被放大」，模拟器实测复现：页面被放成碎片、
// 布局全毁，而且缩回去也不一定复位。这是应用外壳而非可缩放文档，缩放没有意义。
//   · meta viewport 的 maximum-scale/user-scalable 管住 WKWebView 与主屏 PWA；
//   · iOS Safari 标签页出于无障碍会忽略那两个属性 —— 得靠这里的手势事件闸：
//     gesturestart/change/end 是 WebKit 私有的捏合事件，拦掉即不缩放；
//   · 双指 touchmove 是 **Chromium（安卓 WebView / 安卓 Chrome PWA）那一侧的主力**
//     —— gesture* 是 WebKit 私有事件，Chromium 根本不派发，指望它拦安卓是拦不住的；
//   · 捏合与双击缩放还有 CSS 的 touch-action: pan-x pan-y 兜底（见 index.css），
//     安卓 APK 另在 MainActivity 里把 WebView 的 setSupportZoom 直接关死。
// passive: false 是必须的 —— 被动监听器里 preventDefault 会被浏览器忽略。
(() => {
  const stop = (e: Event) => e.preventDefault();
  document.addEventListener('gesturestart', stop, { passive: false });
  document.addEventListener('gesturechange', stop, { passive: false });
  document.addEventListener('gestureend', stop, { passive: false });
  document.addEventListener(
    'touchmove',
    (e) => { if ((e as TouchEvent).touches.length > 1) e.preventDefault(); },
    { passive: false },
  );
})();

// ── 开发调试：按需加载 eruda（手机上的元素检查器 + 控制台） ───────────────
// 使用方式：
//   · 启用：访问 https://the-velvet.com/?debug=1（URL 里带 ?debug=1）
//     启用后会写入 localStorage，之后即使 URL 不带参数，打开 app 也会自动注入
//   · 关闭：访问 https://the-velvet.com/?debug=0 清除持久化标记
// 保护：
//   · 动态 import，不带 ?debug=1 / 无持久化标记时，eruda chunk 完全不下载
//   · 主 bundle 0 增量；普通用户完全无感
//   · 安装 PWA 前先在 Safari 里 ?debug=1 激活，之后装到主屏的 PWA 也会带上 eruda
(() => {
  try {
    const params = new URLSearchParams(window.location.search);
    const urlFlag = params.get('debug');
    if (urlFlag === '1') {
      localStorage.setItem('velvet_debug', '1');
    } else if (urlFlag === '0') {
      localStorage.removeItem('velvet_debug');
      return;
    }
    if (localStorage.getItem('velvet_debug') === '1') {
      // eruda 的导出形态因版本而异：3.x 是 `{ default: { init } }`，旧版可能是 default export
      // 这里都做一次 fallback，尽量兼容
      import('eruda').then(mod => {
        const m = mod as unknown as { default?: { init: () => void }; init?: () => void };
        const eruda = m.default ?? m;
        eruda.init?.();
      }).catch(() => { /* 加载失败静默，不影响主应用 */ });
    }
  } catch { /* 异常环境（SSR / 隐私模式）直接忽略 */ }
})();

// 添加错误边界
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('React Error Boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="text-center p-8 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
            <h2 className="text-2xl font-bold text-red-600 mb-4">应用出错了</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {this.state.error?.message || '未知错误'}
            </p>
            <details className="mb-4 text-left">
              <summary className="cursor-pointer text-sm text-gray-500">
                查看错误详情
              </summary>
              <pre className="text-xs text-red-400 mt-2 overflow-auto">
                {this.state.error?.stack}
              </pre>
            </details>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              重新加载
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// ── 路径分叉：/reset-password 走独立的轻量页面，不加载主 App ────────────────
// 从 PB 邮件点进来的场景：token 在 ?token= 中，前端调用 pb 的 confirmPasswordReset。
// 独立路径可以跳过 initializeApp / IndexedDB / 背景动画等一整套主 App 初始化，
// 避免"邮箱点进来 → 先触发一次完整登录态加载 → 再渲染重置表单"的连锁副作用。
const rootEl = document.getElementById('root')!;
const isResetPasswordPath = typeof window !== 'undefined'
  && window.location.pathname === '/reset-password';

if (isResetPasswordPath) {
  // 动态引入：正常场景不会被加载，拆分成独立 chunk
  import('./pages/ResetPasswordPage').then(({ ResetPasswordPage }) => {
    ReactDOM.createRoot(rootEl).render(
      <React.StrictMode>
        <ErrorBoundary>
          <ResetPasswordPage />
        </ErrorBoundary>
      </React.StrictMode>,
    );
  }).catch(() => {
    // chunk 拉取失败（弱网 / 部署后旧哈希失效）：这是从邮件点入的关键路径，
    // 空白页会被读成"链接坏了"。给一句人话 + 刷新按钮（刷新拿新哈希即可自愈）
    rootEl.innerHTML =
      '<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;font-family:system-ui,sans-serif;color:#374151;padding:24px;text-align:center">' +
      '<div style="font-size:15px;font-weight:600">页面加载失败</div>' +
      '<div style="font-size:13px;color:#6b7280">网络不稳或版本已更新，刷新即可重试。</div>' +
      '<button onclick="location.reload()" style="padding:10px 28px;border-radius:10px;border:none;background:#3b82f6;color:#fff;font-size:14px;font-weight:600;cursor:pointer">刷新</button>' +
      '</div>';
  });
} else {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  );
}