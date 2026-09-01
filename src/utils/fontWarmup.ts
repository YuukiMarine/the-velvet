/**
 * 思源黑 Black 分片预热（仅原生壳）。
 *
 * 背景：标题字 'Noto Sans SC Black' 按 unicode-range 切成 101 片、font-display:
 * optional——没在 ~100ms 阻塞窗内到货的分片，整个 session 都用后备字（切页中途
 * 换字重画的闪烁就是这么修掉的，不能回 swap）。代价是冷启后首批标题常常赶不上
 * 窗口。APK 的字体是本地资产，赶不上纯粹是「请求发起太晚」——那就在开屏期间
 * 主动把全部分片沿 CSSOM 正规路径装载好：之后任何元素首次用到某分片时它已就位，
 * optional 的窗口检查必中，标题从第一帧起就是真 Black。
 *
 * 做法：取字体 CSS 里每个 @font-face 的 unicode-range 首码点拼成样本串，
 * 一次 document.fonts.load() 让浏览器自己按 range 匹配、并行拉全所有分片。
 * 不手写分片文件名清单——CSS 是唯一事实源，分片增减/换版本号无需改这里。
 *
 * web 端不做：3~6MB 的抢跑对流量不友好；分片会被 SW 的 CacheFirst 逐步收编，
 * 下个 session 自然全中窗口。失败无害：标题落在 Velvet Sans 900（同为真 Black）。
 */
import { isNative } from '@/utils/native';

const FONT_CSS_URL = '/fonts/noto-sc-black.v2.css';

export function warmDisplayFontShards(): void {
  if (!isNative()) return;
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  void (async () => {
    try {
      const resp = await fetch(FONT_CSS_URL);
      if (!resp.ok) return;
      const css = await resp.text();
      const chars: string[] = [];
      for (const m of css.matchAll(/unicode-range:\s*U\+([0-9a-fA-F]+)/g)) {
        const cp = parseInt(m[1], 16);
        if (Number.isFinite(cp) && cp >= 0x20) chars.push(String.fromCodePoint(cp));
      }
      if (chars.length) await document.fonts.load('900 16px "Noto Sans SC Black"', chars.join(''));
    } catch {
      /* 预热失败无害：见文件头注释 */
    }
  })();
  // 核心单文件字面一并预热（v2.7.0.2e，用户上报「小标题闪、黄主题尤甚」）：
  // 这些面是 font-display:swap 的整文件——本不逐分片，但**用到的那一刻才装**：
  // P4 的衬线标题面（--p4-display-font 首选）常在首批标题上屏后才到货，
  // 到货即整批换字重画一次，就是黄主题小标题的那一闪（网页端实测切页期间
  // 懒加载了 Velvet Serif SC）。任一字形命中即装载整文件，样本给一个字就够。
  void (async () => {
    try {
      await Promise.all([
        document.fonts.load('900 16px "Velvet Sans SC"', '房'),
        document.fonts.load('900 16px "Velvet Serif SC"', '房'),
        document.fonts.load('400 16px "Velvet Round SC"', '房'),
      ]);
    } catch { /* 同上，失败无害 */ }
  })();
}
