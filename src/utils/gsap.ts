/**
 * GSAP 集成入口（斜界系统动线层）。
 *
 * GSAP 3.13 起全家桶免费可商用（Webflow 收购后），含 DrawSVG/MorphSVG/SplitText
 * 等原付费插件——它们随主 npm 包分发。本文件集中注册需要的插件，全站从这里取 gsap，
 * 避免各处重复 registerPlugin。
 *
 * 当前用途：
 *   - DrawSVGPlugin —— 引导线"描线生长"（SlantGuideLine）；
 *   - SplitText —— 大标题字符级入场（BrandTitleReveal，首页流光品牌标题逐字升起）。
 *
 * MorphSVGPlugin 不在此集中注册：它目前只服务于 dev-only 的星形撕页演示
 * （StarTearOverlay），就近在该组件里注册，以便整组件被 prod 的 import.meta.env.DEV
 * 死代码消除时，MorphSVG（~21KB）一并 tree-shake 出生产包。真接入导航转场后再视情上移。
 *
 * headless / 无 rAF 环境（如自动化预览）下 GSAP ticker 不前进，两种约定按场景选用：
 *   - 单元素"描线/生长"用 immediateRender:false，让元素停在终态可见、动画只在真机播；
 *   - staggered 多元素入场（如逐字）用默认 immediateRender:true——真机零闪烁优先
 *     （首帧即隐藏再入场），预览看不到属正常，验证改用 eval 读终态。
 * 两种场景都必须有 D0（useBoldness=false）守卫：降级时直接渲染终态、不跑时间线。
 */
import { gsap } from 'gsap';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { SplitText } from 'gsap/SplitText';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(DrawSVGPlugin, SplitText, useGSAP);

export { gsap, SplitText, useGSAP };
