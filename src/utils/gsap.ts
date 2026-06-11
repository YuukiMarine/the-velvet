/**
 * GSAP 集成入口（斜界系统动线层）。
 *
 * GSAP 3.13 起全家桶免费可商用（Webflow 收购后），含 DrawSVG/MorphSVG/SplitText
 * 等原付费插件——它们随主 npm 包分发。本文件集中注册需要的插件，全站从这里取 gsap，
 * 避免各处重复 registerPlugin。
 *
 * 当前用途：DrawSVGPlugin 做引导线"描线生长"（SlantGuideLine）；后续 MorphSVG 做
 * 星形撕页 / 形状记忆生长，SplitText 做标题字符级入场。
 *
 * headless / 无 rAF 环境（如自动化预览）下 GSAP ticker 不前进——调用方对"入场生长"
 * 类动画一律用 immediateRender:false，让元素停在终态可见、动画只在真实 rAF 下播放。
 */
import { gsap } from 'gsap';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(DrawSVGPlugin, useGSAP);

export { gsap, useGSAP };
