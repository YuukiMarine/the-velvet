/**
 * PersonaPageTitle —— 页面标题原语（PERSONA_UI_REWRITE_GUIDE §8.3）。
 *
 * 结构统一：eyebrow（英文小标签，表功能不装饰）+ title（中文短标题）+ meta（右侧战术信息）。
 * 三频道三形态：
 *   P5 = 标题贴在黑条切片上，红色斜片从底下探出；
 *   P4 = 黑色斜切题板 + 频道点 eyebrow；
 *   P3 = 青色窄斜体 eyebrow + 白色粗斜体标题 + 洋红刀口穿过；
 *   neutral = 现 PageTitle 的克制风格（过渡期两者共存，逐页替换）。
 */
import type { ReactNode } from 'react';
import type { UIChannel } from '../channel';
import { useUiChannel } from '../useUiChannel';

export interface PersonaPageTitleProps {
  channel?: UIChannel;
  /** 中文主标题，2~6 字最佳（guide §5.2） */
  title: string;
  /** 英文功能标签，如 TODAY'S SHOW / MEMORY LOG（guide §5.3） */
  eyebrow?: string;
  /** 右侧小型信息（日期牌 / 等级 / 频道号） */
  meta?: ReactNode;
  className?: string;
}

export const PersonaPageTitle = ({ channel, title, eyebrow, meta, className }: PersonaPageTitleProps) => {
  const inherited = useUiChannel();
  const ch = channel ?? inherited;

  if (ch === 'p5') {
    return (
      <div className={`relative flex items-end justify-between gap-3 ${className ?? ''}`}>
        <div className="relative inline-block">
          {/* 红色斜片从标题底部探出（装饰层，可倾斜） */}
          <div
            aria-hidden
            className="absolute -bottom-1 -left-2 right-4 h-3"
            style={{ background: 'var(--ui-accent)', transform: 'skewX(-16deg)' }}
          />
          {eyebrow && (
            <div className="relative mb-1 inline-block bg-black px-2 py-0.5 text-[10px] font-black tracking-[0.14em] text-white">
              {eyebrow}
            </div>
          )}
          <h1 className="relative text-3xl font-black leading-none tracking-tight text-[var(--ui-ink)]" style={{ textShadow: '2px 2px 0 rgba(0,0,0,0.6)' }}>
            {title}
          </h1>
        </div>
        {meta && <div className="shrink-0 pb-1 text-xs font-bold text-[var(--ui-muted)]">{meta}</div>}
      </div>
    );
  }

  if (ch === 'p4') {
    return (
      <div className={`flex items-end justify-between gap-3 ${className ?? ''}`}>
        <div className="inline-block" style={{ filter: 'drop-shadow(3px 3px 0 rgba(0,0,0,0.85))' }}>
          <div
            className="inline-block bg-[#111111] px-4 py-2"
            style={{ clipPath: 'polygon(2% 0, 100% 6%, 97% 100%, 0 92%)' }}
          >
            {eyebrow && (
              <div className="mb-0.5 flex items-center gap-1.5 text-[10px] font-black tracking-[0.2em] text-[var(--ui-bg)]">
                <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--ui-accent)]" />
                {eyebrow}
              </div>
            )}
            <h1 className="text-2xl font-black leading-none text-white">{title}</h1>
          </div>
        </div>
        {meta && <div className="shrink-0 pb-1 text-xs font-black text-[#111]/70">{meta}</div>}
      </div>
    );
  }

  if (ch === 'p3') {
    return (
      <div className={`relative flex items-end justify-between gap-3 ${className ?? ''}`}>
        <div className="relative inline-block">
          {eyebrow && (
            <div className="mb-0.5 text-[10px] font-bold italic tracking-[0.18em] text-[var(--ui-accent)]">
              {eyebrow}
            </div>
          )}
          <h1 className="relative inline-block text-3xl font-black italic leading-none tracking-tight text-[var(--ui-ink)]">
            {title}
            {/* 洋红刀口穿过标题尾部（装饰层） */}
            <span
              aria-hidden
              className="absolute -right-3 bottom-0.5 h-[3px] w-8"
              style={{ background: 'var(--ui-danger)', transform: 'skewX(-30deg)' }}
            />
          </h1>
        </div>
        {meta && <div className="shrink-0 pb-1 text-xs font-semibold tracking-wide text-[var(--ui-muted)]">{meta}</div>}
      </div>
    );
  }

  // neutral —— 与现 PageTitle 同调，供未迁移页面平滑过渡
  return (
    <div className={`flex items-end justify-between gap-3 ${className ?? ''}`}>
      <div>
        {eyebrow && (
          <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">
            {eyebrow}
          </div>
        )}
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>
      </div>
      {meta && <div className="shrink-0 pb-0.5 text-xs text-gray-400 dark:text-gray-500">{meta}</div>}
    </div>
  );
};
