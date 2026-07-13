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
  const accepted = listener?.({ id: ++seq, channel: currentChannel(), midpoint, effect: opts?.effect, origin: opts?.origin }) ?? false;
  if (!accepted) midpoint();
  return accepted;
};
