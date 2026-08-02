/**
 * PerfProbe —— 机上性能诊断台（**临时件**，2026-08-03 应用户要求加入）。
 *
 * 背景：旧机（安卓 9 / 骁龙 835）上卡顿明显，但用户不方便连 USB 做远程调试，
 * 而"读代码猜瓶颈"押错方向会白烧一整批开发。这块面板把诊断搬进 App 本身：
 * 在真机上跑一遍，直接得到"关掉哪一类效果，帧率涨了多少"的实测数字。
 *
 * 三件事：
 *   ① 环境读数 —— 顺带回答「GPU 渲染有没有正常开」：WebGL 的 renderer 字符串里
 *      写着 Adreno/Mali 就是真 GPU，写着 SwiftShader/llvmpipe 就是软件渲染。
 *   ② 实时帧率 —— rAF 计数，报均值与最差 1% 帧。
 *   ③ **A/B 自测** —— 逐项关掉一类效果各测一轮，最后按"涨了多少帧"排序。
 *      这是整块面板真正的价值：不猜，直接量。
 *
 * 关闭手段全部走 <html data-perfprobe="..."> + index.css 里的一组 !important 规则，
 * 不改任何组件代码，测完即恢复原状。
 *
 * ⚠️ 定位清楚了就整块删掉，不要留在正式版里。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { clearPerfDegrade, readPerfDegradeState } from '@/utils/boldness';

// ── 环境读数 ─────────────────────────────────────────────────────────────

interface Env {
  gpuVendor: string;
  gpuRenderer: string;
  webglVersion: string;
  softwareRendered: boolean;
  cores: number | string;
  memoryGb: number | string;
  dpr: number;
  screen: string;
  chrome: string;
  ua: string;
  supports: Record<string, boolean>;
}

function readEnv(): Env {
  let gpuVendor = '取不到';
  let gpuRenderer = '取不到';
  let webglVersion = '无 WebGL';
  try {
    const cvs = document.createElement('canvas');
    const gl = (cvs.getContext('webgl2') ?? cvs.getContext('webgl')) as WebGLRenderingContext | null;
    if (gl) {
      webglVersion = String(gl.getParameter(gl.VERSION));
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        gpuVendor = String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL));
        gpuRenderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
      } else {
        // 部分 WebView 屏蔽了这个扩展，退回不带厂商的字符串
        gpuVendor = String(gl.getParameter(gl.VENDOR));
        gpuRenderer = String(gl.getParameter(gl.RENDERER));
      }
    }
  } catch { /* 取不到就算了，不能让诊断台自己崩 */ }

  const ua = navigator.userAgent;
  const m = /Chrome\/([\d.]+)/.exec(ua);
  const nav = navigator as Navigator & { deviceMemory?: number };

  const sup = (prop: string, value: string) => {
    try { return typeof CSS !== 'undefined' && CSS.supports(prop, value); } catch { return false; }
  };

  return {
    gpuVendor,
    gpuRenderer,
    webglVersion,
    // SwiftShader / llvmpipe / Mesa 软栅 = 没走硬件加速；模拟器与部分被降级的 WebView 会命中
    softwareRendered: /swiftshader|llvmpipe|software|mesa offscreen/i.test(`${gpuVendor} ${gpuRenderer}`),
    cores: nav.hardwareConcurrency ?? '取不到',
    memoryGb: nav.deviceMemory ?? '取不到',
    dpr: window.devicePixelRatio,
    screen: `${window.screen.width}×${window.screen.height} · 视口 ${window.innerWidth}×${window.innerHeight}`,
    chrome: m ? m[1] : '非 Chromium',
    ua,
    supports: {
      'backdrop-filter': sup('backdrop-filter', 'blur(4px)'),
      'color-mix()': sup('color', 'color-mix(in srgb, red 50%, blue)'),
      ':has()': (() => { try { return !!document.querySelector(':has(*)'); } catch { return false; } })(),
      'content-visibility': sup('content-visibility', 'auto'),
    },
  };
}

// ── 帧率采样 ─────────────────────────────────────────────────────────────

interface Sample { fps: number; worst: number; frames: number }

/** 采样 ms 毫秒的帧率。worst = 最长那一帧折算的瞬时帧率（掉帧毛刺看这个）。 */
function sampleFps(ms: number): Promise<Sample> {
  return new Promise((resolve) => {
    let start = 0;
    let last = 0;
    let frames = 0;
    let maxGap = 0;
    const tick = (now: number) => {
      if (start === 0) { start = now; last = now; requestAnimationFrame(tick); return; }
      const gap = now - last;
      last = now;
      frames += 1;
      if (gap > maxGap) maxGap = gap;
      if (now - start < ms) { requestAnimationFrame(tick); return; }
      const elapsed = now - start;
      resolve({
        fps: Math.round((frames * 1000) / elapsed),
        worst: maxGap > 0 ? Math.round(1000 / maxGap) : 0,
        frames,
      });
    };
    requestAnimationFrame(tick);
  });
}

/** A/B 自测的每一轮：给 <html data-perfprobe> 加一个 token，测一轮，撤掉 */
const TRIALS: Array<{ key: string; label: string; hint: string }> = [
  { key: '', label: '原样（基准）', hint: '什么都不关' },
  { key: 'noblur', label: '关 backdrop-filter', hint: '全站 62 处毛玻璃' },
  { key: 'nofilter', label: '关 filter（blur/drop-shadow）', hint: '动画化的模糊最贵' },
  { key: 'nobg', label: '关 背景动画', hint: '极光 / 粒子 / 渐变波' },
  { key: 'noanim', label: '关 全部 CSS 动画与过渡', hint: '126 处 repeat:Infinity' },
  { key: 'noshadow', label: '关 阴影（box/text）', hint: '大量硬阴影与发光' },
  { key: 'noblur nofilter nobg noanim noshadow', label: '全关（下限参考）', hint: '这就是最快能到多少' },
];

const setProbe = (tokens: string) => {
  const el = document.documentElement;
  if (tokens) el.setAttribute('data-perfprobe', tokens);
  else el.removeAttribute('data-perfprobe');
};

export const PerfProbe = () => {
  const [env] = useState<Env>(() => readEnv());
  const [live, setLive] = useState<{ fps: number; worst: number } | null>(null);
  const [results, setResults] = useState<Array<{ label: string; hint: string; fps: number; worst: number }>>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [degrade, setDegrade] = useState(() => readPerfDegradeState());
  const [copied, setCopied] = useState(false);
  const aliveRef = useRef(true);

  // 进场要显式置回 true：StrictMode 下 effect 是「挂载 → 清理 → 再挂载」，
  // 只在清理里写 false 的话第二次挂载后它一直是 false，自测循环第一轮就 break，
  // 表现为「点了开始自测，什么都没发生」。组件被复用/重挂时同理。
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; setProbe(''); };
  }, []);

  // 常驻实时帧率（1 秒一报）
  useEffect(() => {
    let stop = false;
    const loop = async () => {
      while (!stop) {
        const s = await sampleFps(1000);
        if (stop) break;
        setLive({ fps: s.fps, worst: s.worst });
      }
    };
    void loop();
    return () => { stop = true; };
  }, []);

  const runTrials = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setResults([]);
    const out: Array<{ label: string; hint: string; fps: number; worst: number }> = [];
    for (const t of TRIALS) {
      if (!aliveRef.current) break;
      setProgress(`正在测：${t.label}`);
      setProbe(t.key);
      // 换了样式先让浏览器把这一帧画完，再开始计数，避免把重排算进采样
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => setTimeout(r, 350));
      const s = await sampleFps(2600);
      out.push({ label: t.label, hint: t.hint, fps: s.fps, worst: s.worst });
      setResults([...out]);
    }
    setProbe('');
    setProgress('');
    setRunning(false);
  }, [running]);

  const base = results[0]?.fps ?? 0;

  const report = () => {
    const lines = [
      '【靛蓝色房间 · 机上性能诊断】',
      `设备：${env.ua}`,
      `Chromium：${env.chrome} · 核心 ${env.cores} · 内存 ${env.memoryGb}GB · DPR ${env.dpr}`,
      `屏幕：${env.screen}`,
      `GPU：${env.gpuVendor} / ${env.gpuRenderer}`,
      `WebGL：${env.webglVersion}`,
      `硬件加速：${env.softwareRendered ? '❌ 疑似软件渲染' : '✅ 走的是 GPU'}`,
      `CSS 支持：${Object.entries(env.supports).map(([k, v]) => `${k}=${v ? 'Y' : 'N'}`).join(' ')}`,
      `降级状态：flag=${degrade.flagged ? '已降级' : '未降级'} sampled=${degrade.sampled ? '已采样' : '未采样'} reduced-motion=${degrade.reducedMotion ? 'on' : 'off'}`,
      '',
      ...results.map((r) => {
        const delta = base > 0 && r.fps !== base ? `（${r.fps > base ? '+' : ''}${r.fps - base}）` : '';
        return `${r.fps} fps / 最差 ${r.worst} fps ${delta}  ← ${r.label}`;
      }),
    ];
    return lines.join('\n');
  };

  const copyReport = async () => {
    const text = report();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // WebView 里 clipboard API 可能没权限，退回选中 textarea 的老办法
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* 复制不了就让他手动选 */ }
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const Row = ({ k, v, warn }: { k: string; v: string; warn?: boolean }) => (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="flex-shrink-0 text-xs text-gray-500 dark:text-gray-400">{k}</span>
      <span className={`break-all text-right text-xs font-semibold ${warn ? 'text-red-500' : 'text-gray-800 dark:text-gray-100'}`}>{v}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
        <b>临时诊断件。</b>定位完卡顿来源之后会整块删掉，不会留在正式版里。
      </div>

      {/* ── 实时帧率 ── */}
      <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-700/60">
        <div className="mb-2 text-sm font-bold text-gray-800 dark:text-white">实时帧率</div>
        <div className="flex items-baseline gap-3">
          <span className="text-4xl font-black tabular-nums text-gray-900 dark:text-white">{live?.fps ?? '--'}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">fps</span>
          <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
            最差帧 <b className="tabular-nums">{live?.worst ?? '--'}</b> fps
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
          停在这一页时的读数。想量某个具体页面，把这块开着切过去反而不准——请直接用下面的自测。
        </p>
      </div>

      {/* ── A/B 自测 ── */}
      <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-700/60">
        <div className="mb-1 text-sm font-bold text-gray-800 dark:text-white">逐项自测</div>
        <p className="mb-3 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
          逐个关掉一类效果各测 2.6 秒，最后看哪一项让帧率涨得最多——那就是这台机器上的主要瓶颈。
          全程约 20 秒，期间请不要离开本页。
        </p>
        <button
          onClick={runTrials}
          disabled={running}
          className="w-full rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
        >
          {running ? (progress || '测试中…') : results.length > 0 ? '重新测一遍' : '开始自测'}
        </button>

        {results.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {results.map((r, i) => {
              const delta = i > 0 && base > 0 ? r.fps - base : 0;
              return (
                <div key={r.label} className="rounded-lg bg-white px-3 py-2 dark:bg-gray-800">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs font-bold text-gray-800 dark:text-gray-100">{r.label}</span>
                    <span className="tabular-nums text-sm font-black text-gray-900 dark:text-white">{r.fps}</span>
                    {i > 0 && (
                      <span className={`w-12 text-right tabular-nums text-xs font-bold ${delta > 2 ? 'text-emerald-500' : delta < -2 ? 'text-red-500' : 'text-gray-400'}`}>
                        {delta > 0 ? `+${delta}` : delta}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex justify-between text-[10px] text-gray-400">
                    <span>{r.hint}</span>
                    <span>最差 {r.worst} fps</span>
                  </div>
                </div>
              );
            })}
            <button
              onClick={copyReport}
              className="mt-2 w-full rounded-xl border border-gray-300 py-2 text-xs font-bold text-gray-700 dark:border-gray-600 dark:text-gray-200"
            >
              {copied ? '✓ 已复制，粘给我就行' : '复制完整报告'}
            </button>
          </div>
        )}
      </div>

      {/* ── 环境 ── */}
      <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-700/60">
        <div className="mb-2 text-sm font-bold text-gray-800 dark:text-white">这台设备</div>
        <Row k="硬件加速" v={env.softwareRendered ? '❌ 疑似软件渲染' : '✅ 走的是 GPU'} warn={env.softwareRendered} />
        <Row k="GPU" v={`${env.gpuVendor} / ${env.gpuRenderer}`} />
        <Row k="WebGL" v={env.webglVersion} />
        <Row k="Chromium" v={env.chrome} />
        <Row k="CPU 核心 / 内存" v={`${env.cores} 核 · ${env.memoryGb} GB`} />
        <Row k="屏幕" v={`${env.screen} · DPR ${env.dpr}`} />
        <Row
          k="CSS 支持"
          v={Object.entries(env.supports).map(([k, v]) => `${k} ${v ? '✓' : '✗'}`).join('　')}
        />
      </div>

      {/* ── 降级闸门 ── */}
      <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-700/60">
        <div className="mb-1 text-sm font-bold text-gray-800 dark:text-white">动效降级闸门</div>
        <p className="mb-3 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
          首开帧率若低于 45fps 会写一个<b>永久</b>降级标记，长按轮盘会因此退化成普通竖排菜单。
          这个标记原本没有任何入口能撤销，只能清除应用数据——这里给一个。
        </p>
        <Row k="当前状态" v={degrade.flagged ? '已降级（轮盘等大动效关闭）' : '正常'} warn={degrade.flagged} />
        <Row k="是否已采样" v={degrade.sampled ? '是（不会再自动重测）' : '否'} />
        <Row k="系统「减少动态效果」" v={degrade.reducedMotion ? '已开启' : '未开启'} />
        <button
          onClick={() => { clearPerfDegrade(); setDegrade(readPerfDegradeState()); }}
          disabled={!degrade.flagged && !degrade.sampled}
          className="mt-3 w-full rounded-xl border border-gray-300 py-2 text-xs font-bold text-gray-700 disabled:opacity-40 dark:border-gray-600 dark:text-gray-200"
        >
          清除降级标记并允许重新采样
        </button>
        <p className="mt-2 text-[11px] text-gray-400">清完需要重启 App 才会重新判定。</p>
      </div>
    </div>
  );
};
