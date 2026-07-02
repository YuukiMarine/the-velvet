/**
 * SlantTuner —— 斜界系统 dev 调参台（仅开发环境）。
 *
 * 痛点：斜切/切角/咬合"非常需要人工调整"，改代码刷新太慢。本面板把斜界源头
 * token 全挂上滑块实时拖动。
 *
 * v2 修两个可用性问题：
 *   1. Tweakpane 原生面板不可拖动位置、默认 fixed 定位在移动端会错位——
 *      改为挂进一个自管理的可拖动 fixed 容器（拖 header 移动，触屏/鼠标都行）。
 *   2. 斜界目前只落地到菜单页，在别的页面拖滑块"看不到变化"——面板自带一块
 *      live 预览（倾斜世界 + 斜切条 + 切角方块），直接消费这些变量，任何页面
 *      都能即时看到参数效果（也是"全站斜轴化后的样子"的预演）。
 *
 * 生产零成本：tweakpane 动态 import 且包在 import.meta.env.DEV 守卫后，Vite
 * 把 `if (!DEV) return` 折叠为死代码消除——tweakpane 不进生产 bundle（build 验证过）。
 */
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useAppStore } from '@/store';

interface TpBlade { on(event: string, cb: () => void): TpBlade }
interface TpApi {
  addBinding(obj: object, key: string, opts?: Record<string, unknown>): TpBlade;
  addButton(opts: { title: string }): TpBlade;
  dispose(): void;
}

export const SlantTuner = () => {
  const currentPage = useAppStore((s) => s.currentPage);
  const mountRef = useRef<HTMLDivElement>(null);
  // 默认折叠：调参工具不调时收起，只留可拖 header，不挡页面内容（点 ▢ 展开）
  const [collapsed, setCollapsed] = useState(true);
  const [pos, setPos] = useState(() => ({
    x: Math.max(8, (typeof window !== 'undefined' ? window.innerWidth : 320) - 256),
    y: 12,
  }));
  const dragRef = useRef<{ px: number; py: number; bx: number; by: number } | null>(null);

  const onHeaderDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = { px: e.clientX, py: e.clientY, bx: pos.x, by: pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onHeaderMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    setPos({
      x: Math.min(Math.max(0, d.bx + (e.clientX - d.px)), window.innerWidth - 60),
      y: Math.min(Math.max(0, d.by + (e.clientY - d.py)), window.innerHeight - 40),
    });
  };
  const onHeaderUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  useEffect(() => {
    if (!import.meta.env.DEV || !mountRef.current) return;
    let pane: TpApi | null = null;
    let disposed = false;

    void import('tweakpane').then(({ Pane }) => {
      if (disposed || !mountRef.current) return;
      const root = document.documentElement;
      const read = (name: string, fb: number) => {
        const n = parseFloat(getComputedStyle(root).getPropertyValue(name).trim());
        return Number.isFinite(n) ? n : fb;
      };

      const params = {
        skew: read('--ui-skew', -4),
        boldness: read('--boldness', 1),
        skewUiMult: read('--ui-skew-ui-mult', 2.5),
        cutBase: read('--ui-cut-base', 10),
        biteBase: read('--bite-base', 12),
        accentW: read('--ui-accent-w', 4),
      };

      const apply = () => {
        root.style.setProperty('--ui-skew', `${params.skew}deg`);
        root.style.setProperty('--boldness', `${params.boldness}`);
        root.style.setProperty('--ui-skew-ui-mult', `${params.skewUiMult}`);
        root.style.setProperty('--ui-cut-base', `${params.cutBase}px`);
        root.style.setProperty('--bite-base', `${params.biteBase}px`);
        root.style.setProperty('--ui-accent-w', `${params.accentW}px`);
      };

      const p = new Pane({ container: mountRef.current }) as unknown as TpApi;
      pane = p;
      p.addBinding(params, 'skew', { min: -12, max: 0, step: 0.5, label: 'ui-skew°' }).on('change', apply);
      p.addBinding(params, 'boldness', { min: 0, max: 1.5, step: 0.05, label: 'boldness' }).on('change', apply);
      p.addBinding(params, 'skewUiMult', { min: 1, max: 5, step: 0.1, label: 'skew-ui ×' }).on('change', apply);
      p.addBinding(params, 'cutBase', { min: 0, max: 24, step: 1, label: 'cut px' }).on('change', apply);
      p.addBinding(params, 'biteBase', { min: 0, max: 24, step: 1, label: 'bite px' }).on('change', apply);
      p.addBinding(params, 'accentW', { min: 1, max: 8, step: 0.5, label: 'accent px' }).on('change', apply);
      p.addButton({ title: '导出 → 固化到 index.css' }).on('click', () => {
        const css = [
          `--ui-skew: ${params.skew}deg;`,
          `--ui-skew-ui-mult: ${params.skewUiMult};`,
          `--ui-cut-base: ${params.cutBase}px;`,
          `--bite-base: ${params.biteBase}px;`,
          `--ui-accent-w: ${params.accentW}px;`,
          `--boldness: ${params.boldness};`,
        ].join('\n');
        // eslint-disable-next-line no-console
        console.log('[SlantTuner] 粘回 index.css 的 :root：\n' + css);
        navigator.clipboard?.writeText(css).catch(() => { /* 剪贴板不可用：console 已有 */ });
      });
    });

    return () => {
      disposed = true;
      pane?.dispose();
    };
  }, []);

  if (!import.meta.env.DEV || currentPage === 'terminal') return null;

  return (
    <div
      style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 2147483647, width: 248 }}
      className="overflow-hidden rounded-lg shadow-2xl ring-1 ring-black/40"
    >
      {/* 拖动 header */}
      <div
        onPointerDown={onHeaderDown}
        onPointerMove={onHeaderMove}
        onPointerUp={onHeaderUp}
        style={{ touchAction: 'none' }}
        className="flex cursor-move select-none items-center gap-2 bg-gray-900 px-3 py-2 text-xs font-semibold text-white"
      >
        <span className="opacity-60">⠿</span>
        <span className="flex-1">斜界调参 · 拖我移动</span>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setCollapsed((c) => !c)}
          className="rounded px-1.5 text-sm text-white/70 hover:bg-white/15"
          aria-label={collapsed ? '展开' : '折叠'}
        >
          {collapsed ? '▢' : '—'}
        </button>
      </div>

      <div className={collapsed ? 'hidden' : 'block'}>
        {/* live 预览：直接消费斜界变量，任何页面都能即时看到参数效果 */}
        <div className="space-y-2 bg-gray-800 px-3 py-3">
          <div className="text-[9px] uppercase tracking-wider text-gray-400">live 预览</div>
          <div className="flex items-center gap-2">
            {/* 倾斜世界 + 字恒水平（反制层） */}
            <div
              style={{ transform: 'rotate(var(--ui-axis))' }}
              className="flex-1 rounded-lg border border-gray-600 bg-gray-900 px-2 py-1.5"
            >
              <div style={{ transform: 'rotate(calc(-1 * var(--ui-axis)))' }} className="flex items-center gap-1">
                <span
                  style={{ display: 'inline-block', transform: 'skewX(var(--ui-skew-ui))' }}
                  className="h-1.5 w-2.5 bg-primary"
                />
                <span className="text-[10px] text-gray-200">字恒水平</span>
              </div>
            </div>
            {/* 切角方块（消费 --ui-cut） */}
            <div
              style={{
                clipPath: 'polygon(0 0, calc(100% - var(--ui-cut)) 0, 100% var(--ui-cut), 100% 100%, 0 100%)',
              }}
              className="flex h-10 w-10 items-center justify-center bg-primary/30 text-[8px] text-primary"
            >
              cut
            </div>
          </div>
        </div>

        {/* Tweakpane 挂载点 */}
        <div ref={mountRef} />
      </div>
    </div>
  );
};
