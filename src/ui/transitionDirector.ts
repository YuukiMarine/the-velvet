/**
 * TransitionDirector —— 重转场调度器（PRD_V2.5_FINAL §4.3）。
 *
 * 两级制中的「重转场」：仪式点（轮盘跳转 / 进终端 / 开战斗 / 切主题）调用
 * playHeavyTransition(midpoint)——演出幕布铺满时执行 midpoint（此刻切路由，
 * 切换瞬间被幕布遮住），随后幕布按频道语言离场揭示新页。
 *
 * 「轻转场」不走本调度器：页面容器直接消费 channelMotion(ch).panelIn（P9 逐页接）。
 *
 * 设计要点：
 *   - 模块级单例 + 订阅：TransitionLayer（App 顶层挂载）订阅请求并负责演出；
 *     D0 / reduced-motion 的降级判定在 Layer 内（hook 语境），此处不判。
 *   - 演出进行中再次触发 → midpoint 直接执行、不叠加演出（防连点开两层幕布）。
 *   - Layer 未挂载（异常/极早期调用）→ midpoint 直接执行，导航永不被吞。
 */
import { currentChannel, type UIChannel } from './channel';

/** 指定演出效果（覆盖频道默认幕布）。'water' = 水波纹涨潮转场（P8.4 试验） */
export type HeavyTransitionEffect = 'water';

export interface HeavyTransitionRequest {
  id: number;
  channel: UIChannel;
  /** 幕布完全遮屏的时刻执行（切路由/切状态） */
  midpoint: () => void;
  /** 覆盖频道默认演出（如底部栏切换指定水波纹）；缺省走频道幕布 */
  effect?: HeavyTransitionEffect;
  /** 演出圆心（水波纹从点击点涨潮）；缺省取屏幕中心 */
  origin?: { x: number; y: number };
}

export interface HeavyTransitionOptions {
  effect?: HeavyTransitionEffect;
  origin?: { x: number; y: number };
}

let listener: ((req: HeavyTransitionRequest) => boolean) | null = null;
let seq = 0;

// ── 幕布 midpoint 标记：原子换页的判据（v2.7.0.2d，事件驱动替代定时窗口）──
// 旧方案「幕布遮蔽窗」是两个 setTimeout 赛跑：midpoint（如星撕 300ms）落地后，
// 切页 commit 的被动 effect 必须在遮蔽窗关闭（星撕 340ms——只剩 40ms 余量）前跑到，
// 否则退回旧页 0.18s 淡出——而幕布已经开始离场，半透明残影叠在新页上，就是用户
// 上报的「偶尔切换时上一个页面闪一下」：机器越卡越容易输掉这场竞速。
// 现在改成：幕布类演出执行 midpoint 时**当场落一枚标记**，PageSwitcher 的 effect
// 无论被卡到多晚都消费它。判据从「effect 恰好赶上窗口」变成「这次切页是幕布
// midpoint 引发的」——时序竞速不复存在。保鲜期 1.5s 只防一种泄漏：幕布 midpoint
// 不改 current（如主题切换）时标记无人消费，不能让它在几分钟后污染无关切页。
let curtainMidpointAt = 0;
export const consumeCurtainMidpoint = (): boolean => {
  const hit = curtainMidpointAt > 0 && Date.now() - curtainMidpointAt < 1500;
  curtainMidpointAt = 0;
  return hit;
};

// ── 水波纹配套：新页圆形揭示原点（App 页面壳 CircleRevealOnEnter 挂载时查询）──
let circleReveal: { x: number; y: number; until: number } | null = null;

/** 800ms 内发生过水波纹转场则返回其点击原点，否则 null。
 *  读取不清除（靠 TTL 自然过期）——StrictMode 双挂载下两次读取都要拿到同一原点。 */
export const consumePendingCircleReveal = (): { x: number; y: number } | null =>
  circleReveal && Date.now() <= circleReveal.until ? { x: circleReveal.x, y: circleReveal.y } : null;

/** TransitionLayer 专用：注册演出承接者。返回 false 表示当前忙（请求被拒）。 */
export const _registerTransitionLayer = (fn: (req: HeavyTransitionRequest) => boolean) => {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
};

/**
 * 播放一次重转场。返回 true = 演出已接管（midpoint 稍后在幕布后执行）；
 * false = 无演出（Layer 缺席/忙/降级），midpoint 已被同步执行。
 */
export const playHeavyTransition = (midpoint: () => void, opts?: HeavyTransitionOptions): boolean => {
  // 原点夹进视口：来源 rect 处于入场/按压变换中时坐标可能越界（实测底栏入场未落定
  // 时 y 越出屏底 100px），越界圆心会让涨潮看起来从屏缘冒出来。夹取后永远从屏内开始。
  const origin = opts?.origin
    ? {
        x: Math.min(Math.max(opts.origin.x, 0), window.innerWidth),
        y: Math.min(Math.max(opts.origin.y, 0), window.innerHeight),
      }
    : undefined;
  // 水波纹导航：登记新页圆形揭示原点（即便 Layer 拒接降级，新页揭示仍成立）
  if (opts?.effect === 'water' && origin) circleReveal = { ...origin, until: Date.now() + 800 };
  // 幕布类演出（非 water）的 midpoint 打上原子换页标记（见 consumeCurtainMidpoint）。
  // water 不打标：它的旧页要留下来当擦除底衬，走的是垫底路径。
  const staged =
    opts?.effect === 'water'
      ? midpoint
      : () => {
          curtainMidpointAt = Date.now();
          midpoint();
        };
  const accepted = listener?.({ id: ++seq, channel: currentChannel(), midpoint: staged, effect: opts?.effect, origin }) ?? false;
  // 未接演出 = 没有幕布：直接执行原始 midpoint（不打标，走常规淡切）
  if (!accepted) midpoint();
  return accepted;
};
