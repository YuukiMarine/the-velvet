/**
 * SlantTuner —— 斜界系统 dev 调参面板（仅开发环境）。
 *
 * 痛点：斜切/切角/咬合这些几何参数"非常需要人工调整"，改代码刷新太慢。
 * 本面板把斜界的源头 token 全挂上 Tweakpane 滑块，在真实页面上实时拖动看效果，
 * 满意后点「导出」把数值打到 console，逐字粘回 index.css 的 :root 即固化。
 *
 * 生产零成本：tweakpane 用动态 import 且包在 import.meta.env.DEV 守卫后，
 * Vite 生产构建把 `if (!DEV) return` 折叠为 `return`，动态 import 成死代码被消除——
 * tweakpane 不进生产 bundle（已 build 验证）。
 */
import { useEffect } from 'react';

/**
 * 最小 Tweakpane 接口：v4 的 addBinding/addButton 定义在 @tweakpane/core 的 FolderApi 上，
 * 而该类型未随 tweakpane 包解析（运行时方法存在，仅 .d.ts 链断裂）。dev 工具不值得
 * 为补类型再装 @tweakpane/core——就地声明用到的几个方法即可，运行时一致。
 */
interface TpBlade { on(event: string, cb: () => void): TpBlade }
interface TpApi {
  addBinding(obj: object, key: string, opts?: Record<string, unknown>): TpBlade;
  addButton(opts: { title: string }): TpBlade;
  dispose(): void;
}

export const SlantTuner = () => {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let pane: TpApi | null = null;
    let disposed = false;

    void import('tweakpane').then(({ Pane }) => {
      if (disposed) return;
      const root = document.documentElement;
      const read = (name: string, fallback: number) => {
        const raw = getComputedStyle(root).getPropertyValue(name).trim();
        const n = parseFloat(raw);
        return Number.isFinite(n) ? n : fallback;
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

      const p = new Pane({ title: '斜界调参 (dev)' }) as unknown as TpApi;
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
        navigator.clipboard?.writeText(css).catch(() => { /* 剪贴板不可用：console 已有备份 */ });
      });
    });

    return () => {
      disposed = true;
      pane?.dispose();
    };
  }, []);

  return null;
};
