/**
 * 背景动画是否该渲染 —— **全站唯一口径**。
 *
 * 判定散在四五个地方（App 根、擦除垫底层、P3RPage、P5RPage 各问各的），
 * 少改一处就会出现"某一层还在画、另一层已经不画"的错层，所以收到这里。
 *
 * 红频道（P5）多一道闸：**默认不开，除非用户在红主题下亲手开过**（用户口径）。
 * 理由是 P5 的舞台本身就铺满了红斜块、爆炸星、半调点阵与拼贴瓷砖，
 * 再叠一层极光/粒子既糊了构图，也是旧机上最先掉帧的那一层；
 * 而新档案的默认值恰恰是 `['aurora']`，等于所有人切到红主题都会撞上。
 * 用 `p5BgAnimOptIn` 记住"他确实想要"，不动 `backgroundAnimation` 本身——
 * 这样切回蓝/黄主题时他原来的选择原样还在。
 */
import type { Settings, ThemeType } from '@/types';

export function bgAnimStyles(settings: Settings, theme: ThemeType | undefined): string[] {
  if (settings.backgroundImage) return [];          // 背景图优先，动画整层让位
  const styles = (settings.backgroundAnimation ?? []) as string[];
  if (styles.length === 0) return [];
  if (theme === 'red' && !settings.p5BgAnimOptIn) return [];
  return styles;
}

export function bgAnimOn(settings: Settings, theme: ThemeType | undefined): boolean {
  return bgAnimStyles(settings, theme).length > 0;
}
