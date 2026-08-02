/**
 * 运行时颜色解析 / 混色（`color-mix()` 的可移植替身）。
 *
 * 为什么需要它：`color-mix()` 是 CSS Color 5 的特性，Chrome 111+（2023-03）才有。
 * 安卓 9 那一档设备上的 System WebView 普遍停在这之前——**属性值直接非法**。
 * 非法值在不同上下文里的后果差别很大：
 *   · `color:` / `border-color:` → 落回继承值 / currentColor，多半只是"颜色不对"
 *   · SVG 的 `fill=` / `stroke=` → 落回**初始值 black**，直接画成一坨黑
 * 用户上报的「蓝/粉首页人格指数五角星底部那圈表示全部等级的星变成黑色」就是后者：
 * StarChartP3 的同心等级星环整族走 color-mix 算色，旧 WebView 上全部塌成黑。
 *
 * 这里的口径是**一律用 JS 算**，不做 `@supports` 分叉：
 * 同一份数值在新旧设备上得到完全一样的颜色，也省掉"两条路径各自漂移"的维护成本。
 *
 * 解析 `var(--x, fallback)` 靠往文档里挂一个探针节点读 computed style —— 自定义属性
 * 定义在 `:root` / `:root[data-ui-channel]` 上，探针挂在 body 下即可继承到。
 * 结果按「频道 + 主题 + 夜间」签名缓存，换肤自动作废。
 */

type RGBA = [number, number, number, number];

let probe: HTMLElement | null = null;
const cache = new Map<string, RGBA | null>();
let cacheSig = '';

/** 换肤签名：任一维度变化即整表作废（换肤后同一个 var 会解析成不同颜色） */
function themeSignature(): string {
  const el = document.documentElement;
  return [
    el.getAttribute('data-ui-channel') ?? '',
    el.getAttribute('data-theme') ?? '',
    el.classList.contains('dark') ? 'd' : 'l',
    el.style.getPropertyValue('--color-primary'),
  ].join('|');
}

function getProbe(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  if (probe && probe.isConnected) return probe;
  probe = document.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none;';
  (document.body ?? document.documentElement).appendChild(probe);
  return probe;
}

function parseComputed(text: string): RGBA | null {
  // getComputedStyle 归一后只会是 rgb(...) / rgba(...) / color(srgb ...)（后者极少见）
  const m = text.match(/rgba?\(([^)]+)\)/i);
  if (!m) return null;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.slice(0, 3).some((n) => !Number.isFinite(n))) return null;
  const a = parts.length > 3 && Number.isFinite(parts[3]) ? parts[3] : 1;
  return [parts[0], parts[1], parts[2], a];
}

/**
 * 把任意 CSS 颜色表达式（含 `var(--x, fallback)`）解析成 sRGB 通道值。
 * 解析不出来返回 null——调用方应当保留一个写死的兜底色，绝不能把 null 塞给 fill。
 */
export function resolveCssColor(value: string): RGBA | null {
  const v = value?.trim();
  if (!v) return null;

  const sig = themeSignature();
  if (sig !== cacheSig) {
    cache.clear();
    cacheSig = sig;
  }
  if (cache.has(v)) return cache.get(v) ?? null;

  let out: RGBA | null = null;
  const el = getProbe();
  if (el) {
    // 先塞一个哨兵色：值非法时 computed 会停在哨兵上，据此判"没解析出来"
    el.style.color = 'rgb(1, 2, 3)';
    el.style.color = v;
    const computed = getComputedStyle(el).color;
    const rgba = parseComputed(computed);
    // 哨兵原样返回 = 赋值被判非法（正好等于 rgb(1,2,3) 的真实用色概率可忽略）
    if (rgba && !(rgba[0] === 1 && rgba[1] === 2 && rgba[2] === 3)) out = rgba;
    el.style.color = '';
  }
  cache.set(v, out);
  return out;
}

const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

/**
 * 等价于 `color-mix(in srgb, a pctA%, b)`，但在任何浏览器上都成立。
 *
 * 任一端解析失败就原样返回该端（而不是吐出一个非法值）：宁可少一次插值，
 * 也不能让调用点拿到会被浏览器判非法的字符串——那正是"星环变黑"的成因。
 */
export function mixSrgb(a: string, b: string, pctA: number): string {
  const t = Math.max(0, Math.min(100, pctA)) / 100;
  const ca = resolveCssColor(a);
  const cb = resolveCssColor(b);
  if (!ca) return b;
  if (!cb) return a;
  const [r, g, bl, al] = [0, 1, 2, 3].map((i) => cb[i] + (ca[i] - cb[i]) * t) as RGBA;
  return `rgba(${clamp255(r)}, ${clamp255(g)}, ${clamp255(bl)}, ${Number(al.toFixed(3))})`;
}

/** `resolveCssColor` 的字符串版：解析失败时退回 fallback，保证结果一定是合法颜色 */
export function toRgbString(value: string, fallback: string): string {
  const c = resolveCssColor(value);
  if (!c) return fallback;
  return `rgba(${clamp255(c[0])}, ${clamp255(c[1])}, ${clamp255(c[2])}, ${Number(c[3].toFixed(3))})`;
}

/** 本机是否原生支持 color-mix()（只探一次） */
let nativeMix: boolean | null = null;
export function supportsColorMix(): boolean {
  if (nativeMix !== null) return nativeMix;
  nativeMix =
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('color', 'color-mix(in srgb, red 50%, blue)');
  return nativeMix;
}

/** `color-mix(in <space>, A p%, B)` —— 只认这一种写法，够覆盖本项目所有调用点 */
const MIX_RE = /^color-mix\(\s*in\s+[\w-]+\s*,\s*(.+?)\s+([\d.]+)%\s*,\s*(.+?)\s*\)$/i;

/**
 * 把一段可能含 `color-mix()` 的颜色表达式变成**这台机器一定认得**的颜色。
 *
 * 原生支持就原样放行（保留 CSS 变量的实时联动），不支持才落到 JS 插值。
 * 给那些"值写死在模块常量里、又要喂给 SVG fill/stroke"的调色板用——
 * 那些位置一旦拿到非法值就是纯黑，代价远高于别处的"颜色淡一点"。
 */
export function paint(value: string): string {
  if (!value || supportsColorMix()) return value;
  const m = MIX_RE.exec(value.trim());
  if (!m) return value;
  return mixSrgb(m[1], m[3], Number(m[2]));
}
