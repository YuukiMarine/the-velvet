/**
 * 谏言的四套皮（聊天窗与归档库共用；2026-10-02 翻新，PRD §19.5）：
 * 蓝（粉皮走同一套变量，夜间跟着翻深靛）/ 黄（节目单舞台，夜间跟 --p4-stage 翻紫）/ 红（纯黑舞台，不跟夜间）/ 中性（自定义主题）。
 */
import type { CSSProperties } from 'react';
import { P3R } from '@/components/p3r/kit';
import { P5R, P5_TITLE_FONT, roughQuad } from '@/components/p5r/kit';

export type CounselCh = 'p3' | 'p4' | 'p5' | 'neutral';
type Ch = CounselCh;

export interface CounselSkin {
  root: string;
  rootStyle?: CSSProperties;
  header: string;
  headerStyle?: CSSProperties;
  title: string;
  titleStyle?: CSSProperties;
  /** 信头里返回 / 关闭这类图标按钮的字色（黄的 text-[#131313] 夜间跟着翻浅） */
  icon: string;
  sub: string;
  subStyle?: CSSProperties;
  star: CSSProperties;
  timer: string;
  timerStyle?: CSSProperties;
  timerWarn: CSSProperties;
  meta: string;
  metaStyle?: CSSProperties;
  ai: string;
  aiStyle?: CSSProperties;
  user: string;
  userStyle?: CSSProperties;
  footer: string;
  footerStyle?: CSSProperties;
  input: string;
  inputStyle?: CSSProperties;
  send: string;
  sendStyle?: CSSProperties;
  stop: string;
  stopStyle?: CSSProperties;
  at: string;
  atStyle?: CSSProperties;
  atOnStyle: CSSProperties;
  chip: string;
  chipStyle?: CSSProperties;
  primary: string;
  primaryStyle?: CSSProperties;
  ghost: string;
  ghostStyle?: CSSProperties;
  danger: string;
  dangerStyle?: CSSProperties;
  dialog: string;
  dialogStyle?: CSSProperties;
  dialogTitle: string;
  dialogTitleStyle?: CSSProperties;
  muted: string;
  mutedStyle?: CSSProperties;
  link: string;
  linkStyle?: CSSProperties;
  picker: string;
  pickerStyle?: CSSProperties;
}

const slant = (n: number) => `polygon(${n}px 0, 100% 0, calc(100% - ${n}px) 100%, 0 100%)`;

/** 谏言的四套皮（聊天窗与归档库共用） */
export const counselSkinOf = (ch: Ch): CounselSkin => {
  if (ch === 'p3') {
    // 蓝（粉皮走同一套变量）：白日水面 + 白斜片信头 + 白 / 蓝斜气泡；夜间变量整体翻深靛
    return {
      root: '',
      rootStyle: { background: 'var(--p3nav-root, linear-gradient(168deg, #f2f9fd 0%, #e6f3fa 52%, #cfeaf6 100%))' },
      header: 'bg-white shadow-[0_10px_26px_rgba(38,96,140,.14)]',
      headerStyle: { clipPath: slant(12) },
      title: 'text-[17px] font-black',
      titleStyle: { color: P3R.ink },
      icon: '',
      sub: 'text-[11px] font-bold',
      subStyle: { color: P3R.grey },
      star: { color: P3R.blue },
      timer: 'px-2.5 py-1 text-[13px] font-black tabular-nums bg-white',
      timerStyle: { clipPath: slant(6), color: P3R.blue },
      timerWarn: { color: P3R.magenta },
      meta: 'text-[10px] font-bold',
      metaStyle: { color: P3R.grey },
      ai: 'bg-white px-4 py-2.5 text-[15px] font-semibold leading-relaxed shadow-[0_8px_22px_rgba(38,96,140,.12)]',
      aiStyle: { clipPath: slant(10), color: P3R.ink },
      user: 'px-4 py-2.5 text-[15px] font-semibold leading-relaxed text-white shadow-[0_8px_22px_rgba(27,87,255,.25)]',
      userStyle: { background: P3R.blue, clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 100%, 10px 100%)' },
      footer: '',
      footerStyle: undefined,
      input: 'bg-white px-3.5 py-2.5 text-[15px] font-semibold outline-none placeholder:text-[#9ab4c9]',
      inputStyle: { clipPath: slant(10), color: P3R.ink },
      send: 'h-11 px-4 text-sm font-black text-white disabled:opacity-40',
      sendStyle: { background: P3R.blue, clipPath: slant(9) },
      stop: 'h-11 px-3.5 text-xs font-black text-white',
      stopStyle: { background: P3R.magenta, clipPath: slant(9) },
      at: 'h-11 w-11 text-lg font-black',
      atStyle: { clipPath: slant(7), background: P3R.cyanPale, color: P3R.blueDeep },
      atOnStyle: { background: P3R.blue, color: '#ffffff' },
      chip: 'px-2.5 py-1 text-[11px] font-black bg-white',
      chipStyle: { clipPath: slant(6), color: P3R.blue },
      primary: 'px-7 py-3 text-sm font-black text-white',
      primaryStyle: { background: P3R.blue, clipPath: slant(12) },
      ghost: 'py-2.5 text-sm font-black',
      ghostStyle: { background: P3R.cyanPale, color: P3R.blueDeep, clipPath: slant(9) },
      danger: 'py-2.5 text-sm font-black text-white',
      dangerStyle: { background: P3R.magenta, clipPath: slant(9) },
      dialog: 'bg-white p-5 shadow-2xl',
      dialogStyle: { clipPath: slant(14) },
      dialogTitle: 'text-base font-black',
      dialogTitleStyle: { color: P3R.ink },
      muted: 'text-xs font-semibold leading-relaxed',
      mutedStyle: { color: P3R.inkSoft },
      link: 'text-[11px] font-black',
      linkStyle: { color: P3R.blue },
      picker: 'bg-white p-2.5 shadow-[0_10px_26px_rgba(38,96,140,.14)]',
      pickerStyle: { clipPath: slant(10) },
    };
  }
  if (ch === 'p4') {
    // 黄：节目单舞台（夜间跟 --p4-stage 翻紫）+ 奶油圆角信头 / 气泡 + 黑底黄字的自己的话 + 蓝圆按钮
    return {
      root: '',
      rootStyle: { background: 'var(--p4-stage, #ffd900)' },
      header: 'bg-[#fff6d0] shadow-[0_6px_0_rgba(19,19,19,0.15)]',
      headerStyle: { borderRadius: 18 },
      title: 'text-[22px] font-black text-[#131313]',
      titleStyle: { fontFamily: 'var(--p4-display-font, serif)' },
      icon: 'text-[#131313]',
      sub: 'text-[11px] font-bold text-[#131313] opacity-60',
      star: { color: 'var(--ui-accent, #2e6be0)' },
      timer: 'rounded-full px-3 py-1 text-[13px] font-black tabular-nums text-[#ffd900] bg-[#131313]',
      timerWarn: { color: '#ff8a7a' },
      meta: 'text-[10px] font-black text-[#131313] opacity-60',
      ai: 'rounded-2xl bg-[#fff6d0] px-4 py-2.5 text-[15px] font-bold leading-relaxed text-[#131313] shadow-[0_4px_0_rgba(19,19,19,0.12)]',
      user: 'rounded-2xl px-4 py-2.5 text-[15px] font-bold leading-relaxed text-[#ffd900] bg-[#131313] shadow-[0_4px_0_rgba(19,19,19,0.25)]',
      footer: '',
      input: 'rounded-2xl bg-[#fff6d0] px-3.5 py-2.5 text-[15px] font-bold text-[#131313] outline-none placeholder:text-[#131313]/40',
      send: 'h-11 rounded-full px-4 text-sm font-black text-white disabled:opacity-40',
      sendStyle: { background: 'var(--ui-accent, #2e6be0)', boxShadow: '0 3px 0 rgba(19,19,19,0.25)' },
      stop: 'h-11 rounded-full px-3.5 text-xs font-black text-white',
      stopStyle: { background: '#e8452c', boxShadow: '0 3px 0 rgba(19,19,19,0.25)' },
      at: 'h-11 w-11 rounded-full text-lg font-black bg-[#fff6d0] text-[#131313]',
      atStyle: { boxShadow: '0 3px 0 rgba(19,19,19,0.18)' },
      atOnStyle: { background: '#131313', color: '#ffd900' },
      chip: 'rounded-full px-2.5 py-1 text-[11px] font-black bg-[#fff6d0] text-[#131313]',
      primary: 'rounded-full px-7 py-3 text-sm font-black text-white',
      primaryStyle: { background: 'var(--ui-accent, #2e6be0)', boxShadow: '0 4px 0 rgba(19,19,19,0.25)' },
      // 黄底按钮的字用行内色：text-[#131313] 类在夜间会被全局规则翻成浅色，黄底上就看不清了
      ghost: 'rounded-xl py-2.5 text-sm font-black',
      ghostStyle: { background: '#ffd900', color: '#131313' },
      danger: 'rounded-xl py-2.5 text-sm font-black text-white',
      dangerStyle: { background: '#e8452c' },
      dialog: 'rounded-3xl bg-[#fff6d0] p-5 shadow-[0_6px_0_rgba(19,19,19,0.2)]',
      dialogTitle: 'text-base font-black text-[#131313]',
      muted: 'text-xs font-bold leading-relaxed text-[#131313] opacity-70',
      link: 'text-[11px] font-black text-[#131313] underline decoration-2 underline-offset-2',
      picker: 'rounded-2xl bg-[#fff6d0] p-2.5 shadow-[0_4px_0_rgba(19,19,19,0.15)]',
    };
  }
  if (ch === 'p5') {
    // 红（不跟夜间）：纯黑舞台 + 纸面信头 / 残响的纸气泡 + 自己的话红底 + 粗糙硬影
    const rough = (seed: number, jag = 4) => roughQuad(seed, jag);
    return {
      root: '',
      rootStyle: { background: P5R.ink },
      header: '',
      headerStyle: { background: P5R.paper, clipPath: rough(3.1, 3), boxShadow: `0 5px 0 ${P5R.redDeep}` },
      title: 'text-[19px] font-black',
      titleStyle: { color: P5R.ink, fontFamily: P5_TITLE_FONT },
      icon: '',
      sub: 'text-[11px] font-bold',
      subStyle: { color: P5R.grey },
      star: { color: P5R.red },
      timer: 'px-2.5 py-1 text-[13px] font-black tabular-nums',
      timerStyle: { background: P5R.ink, color: P5R.paper, clipPath: rough(5.2, 2) },
      timerWarn: { color: P5R.redHot },
      meta: 'text-[10px] font-black',
      metaStyle: { color: P5R.greyLight },
      ai: 'px-4 py-2.5 text-[15px] font-bold leading-relaxed',
      aiStyle: { background: P5R.paper, color: P5R.ink, clipPath: rough(7.3, 3), filter: `drop-shadow(4px 5px 0 ${P5R.redDeep})` },
      user: 'px-4 py-2.5 text-[15px] font-bold leading-relaxed',
      userStyle: { background: P5R.red, color: P5R.paper, clipPath: rough(9.7, 3), filter: 'drop-shadow(4px 5px 0 #000000)' },
      footer: '',
      input: 'px-3.5 py-2.5 text-[15px] font-bold outline-none placeholder:text-[#6b6862]',
      inputStyle: { background: P5R.paper, color: P5R.ink, clipPath: rough(2.4, 2) },
      send: 'h-11 px-4 text-sm font-black disabled:opacity-40',
      sendStyle: { background: P5R.red, color: P5R.paper, clipPath: rough(4.6, 3) },
      stop: 'h-11 px-3.5 text-xs font-black',
      stopStyle: { background: P5R.paper, color: P5R.red, clipPath: rough(6.1, 3) },
      at: 'h-11 w-11 text-lg font-black',
      atStyle: { background: P5R.paper, color: P5R.ink, clipPath: rough(8.8, 3) },
      atOnStyle: { background: P5R.red, color: P5R.paper },
      chip: 'px-2.5 py-1 text-[11px] font-black',
      chipStyle: { background: P5R.paper, color: P5R.red, clipPath: rough(1.7, 2) },
      primary: 'px-7 py-3 text-sm font-black',
      primaryStyle: { background: P5R.red, color: P5R.paper, clipPath: rough(5.5, 3), filter: 'drop-shadow(4px 4px 0 #000000)', fontFamily: P5_TITLE_FONT },
      ghost: 'py-2.5 text-sm font-black',
      ghostStyle: { background: P5R.paperDim, color: P5R.ink, clipPath: rough(2.2, 2) },
      danger: 'py-2.5 text-sm font-black',
      dangerStyle: { background: P5R.red, color: P5R.paper, clipPath: rough(3.8, 2) },
      dialog: 'p-5',
      dialogStyle: { background: P5R.paper, clipPath: rough(4.4, 3), filter: `drop-shadow(5px 6px 0 ${P5R.red})` },
      dialogTitle: 'text-base font-black',
      dialogTitleStyle: { color: P5R.ink, fontFamily: P5_TITLE_FONT },
      muted: 'text-xs font-bold leading-relaxed',
      mutedStyle: { color: P5R.grey },
      link: 'text-[11px] font-black',
      linkStyle: { color: P5R.paper, borderBottom: `2px solid ${P5R.red}` },
      picker: 'p-2.5',
      pickerStyle: { background: P5R.paper, clipPath: rough(6.6, 3) },
    };
  }
  // 中性（自定义主题）：干净的白 / 深色面板，羁绊靛紫点缀
  return {
    root: 'bg-white dark:bg-gray-900',
    header: 'rounded-2xl border border-gray-100 dark:border-gray-800',
    headerStyle: { background: 'linear-gradient(135deg, rgb(var(--color-bond-rgb) / 0.08), rgb(var(--color-bond-bright-rgb) / 0.04))' },
    title: 'text-base font-bold text-gray-900 dark:text-white',
    icon: 'text-gray-500 dark:text-gray-300',
    sub: 'text-[10px] text-gray-500 dark:text-gray-400',
    star: { color: 'rgb(var(--color-bond-rgb))' },
    timer: 'rounded-full px-2.5 py-1 text-[13px] font-mono font-bold tabular-nums text-indigo-500 bg-indigo-500/10',
    timerWarn: { color: '#f43f5e' },
    meta: 'text-[10px] text-gray-400',
    ai: 'rounded-2xl rounded-bl-md border border-gray-100 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-gray-800 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100',
    user: 'rounded-2xl rounded-br-md bg-gradient-to-br from-indigo-500 to-purple-600 px-3.5 py-2.5 text-sm leading-relaxed text-white shadow-sm',
    footer: 'border-t border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-900',
    input: 'rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none placeholder-gray-400 focus:ring-2 focus:ring-indigo-500/40 dark:bg-gray-800 dark:text-gray-100',
    send: 'h-10 rounded-xl px-4 text-sm font-bold text-white shadow-md disabled:opacity-40',
    sendStyle: { background: 'linear-gradient(135deg, rgb(var(--color-bond-rgb)), rgb(var(--color-bond-bright-rgb)))' },
    stop: 'h-10 rounded-xl bg-rose-500 px-3 text-xs font-bold text-white shadow-md',
    at: 'h-10 w-10 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-lg font-bold text-indigo-500',
    atOnStyle: { background: '#6366f1', color: '#ffffff' },
    chip: 'rounded-full border border-indigo-500/30 bg-indigo-500/15 px-2 py-1 text-[11px] text-indigo-600 dark:text-indigo-400',
    primary: 'rounded-full px-7 py-3 text-sm font-bold text-white shadow-lg',
    primaryStyle: { background: 'linear-gradient(135deg, rgb(var(--color-bond-rgb)), rgb(var(--color-bond-bright-rgb)))', boxShadow: '0 14px 30px -12px rgb(var(--color-battle-rgb) / 0.6)' },
    ghost: 'rounded-xl bg-gray-100 py-2 text-sm font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200',
    danger: 'rounded-xl border border-rose-500/30 bg-rose-500/10 py-2.5 text-sm font-semibold text-rose-500',
    dialog: 'rounded-2xl bg-white p-5 shadow-2xl dark:bg-gray-900',
    dialogTitle: 'text-base font-bold text-gray-900 dark:text-white',
    muted: 'text-xs leading-relaxed text-gray-500 dark:text-gray-400',
    link: 'text-[11px] font-semibold text-indigo-500',
    picker: 'rounded-xl border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800',
  };
};
