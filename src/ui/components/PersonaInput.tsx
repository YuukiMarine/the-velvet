/**
 * PersonaInput —— 输入框原语（PERSONA_UI_REWRITE_GUIDE §8.7 / §17.5）。
 *
 * 结构统一：label（短）+ 输入区 + hint/error（短提示）。
 * 三频道 focus 语言：P5 = 红色角贴纸出现；P4 = 左侧频道条亮起；P3 = 青色底线从左扫满。
 * 输入字号 16px 防 iOS 聚焦缩放（guide §17.5）；错误提示短促、主题 danger 色。
 * 录入态即「校直模式」语境（guide §22.3）：输入区自身永远水平，不做任何倾斜。
 */
import { useId, useState } from 'react';
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { motion } from 'motion/react';
import type { UIChannel } from '../channel';
import { useUiChannel } from '../useUiChannel';
import { P4Sparkle } from '../p4Kit';

type NativeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'className'>;
type NativeTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'>;

export interface PersonaInputProps extends NativeInputProps {
  channel?: UIChannel;
  label?: string;
  hint?: string;
  error?: string;
  multiline?: boolean;
  rows?: number;
  className?: string;
}

/** 各频道的 label / 输入面 / 提示样式（集中一处，业务不拼主题串） */
const skin = (ch: UIChannel, error: boolean) => {
  if (ch === 'p5') {
    return {
      label: 'text-[11px] font-black tracking-wider text-white/85',
      box: `border-2 bg-[var(--ui-paper)] text-[#0d0d0d] ${error ? 'border-[var(--ui-danger)]' : 'border-black'}`,
      boxStyle: { boxShadow: '3px 3px 0 rgba(0,0,0,0.75)' } as React.CSSProperties,
      hint: 'text-white/55',
      error: 'text-[var(--ui-danger)] font-bold',
    };
  }
  if (ch === 'p4') {
    // p4-redraw 定稿：无描边奶油圆角面，右下黄星闪角标（focus 转橙）。
    // error 用真实 border（ring 是 box-shadow，会被内联投影覆盖）
    return {
      label: 'text-[12px] font-black tracking-wide text-[#131313]',
      box: 'relative rounded-2xl bg-[var(--ui-paper)] text-[#131313]',
      boxStyle: {
        boxShadow: '0 2px 0 rgba(19,19,19,0.1)',
        border: error ? '2px solid var(--ui-danger)' : '2px solid transparent',
      } as React.CSSProperties,
      hint: 'text-[var(--ui-muted)]',
      error: 'text-[var(--ui-danger)] font-black',
    };
  }
  if (ch === 'p3') {
    return {
      label: 'text-[11px] font-bold italic tracking-[0.14em] text-[var(--ui-accent)]',
      box: 'relative bg-[rgba(5,7,13,0.72)] text-[var(--ui-ink)]',
      boxStyle: {} as React.CSSProperties,
      hint: 'text-[var(--ui-muted)]',
      error: 'text-[var(--ui-danger)] font-bold',
    };
  }
  return {
    label: 'text-xs font-medium text-gray-500 dark:text-gray-400',
    box: `rounded-xl border bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100 ${
      error ? 'border-red-400' : 'border-gray-300 focus-within:border-primary dark:border-gray-600'
    }`,
    boxStyle: {} as React.CSSProperties,
    hint: 'text-gray-400 dark:text-gray-500',
    error: 'text-red-500',
  };
};

export const PersonaInput = ({
  channel,
  label,
  hint,
  error,
  multiline = false,
  rows = 3,
  className,
  onFocus,
  onBlur,
  ...rest
}: PersonaInputProps) => {
  const inherited = useUiChannel();
  const ch = channel ?? inherited;
  const id = useId();
  const [focused, setFocused] = useState(false);
  const s = skin(ch, !!error);

  // p4 右下有星闪角标，输入区让出右侧空间防文字压星
  const fieldCls = `w-full bg-transparent px-3.5 py-2.5 text-[16px] leading-snug outline-none placeholder:opacity-45 ${ch === 'p4' ? 'pr-9' : ''}`;

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className={`mb-1 block ${s.label}`}>
          {label}
        </label>
      )}
      <div className={`relative ${s.box}`} style={s.boxStyle}>
        {/* P5 focus：红色角贴纸 */}
        {ch === 'p5' && focused && (
          <motion.span
            aria-hidden
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: -8 }}
            className="absolute -left-1.5 -top-1.5 z-10 h-3.5 w-3.5 border-2 border-black"
            style={{ background: 'var(--ui-accent)' }}
          />
        )}
        {/* P4：右下星闪角标（focus 黄→橙），设计稿输入框签名件 */}
        {ch === 'p4' && (
          <P4Sparkle
            size={15}
            color={focused ? 'var(--p4-orange, #f9a11b)' : 'var(--ui-bg)'}
            className="absolute bottom-2 right-2.5 transition-colors"
          />
        )}
        {multiline ? (
          <textarea
            id={id}
            rows={rows}
            className={`${fieldCls} resize-none`}
            onFocus={(e) => { setFocused(true); onFocus?.(e as never); }}
            onBlur={(e) => { setFocused(false); onBlur?.(e as never); }}
            {...(rest as NativeTextareaProps)}
          />
        ) : (
          <input
            id={id}
            className={fieldCls}
            onFocus={(e) => { setFocused(true); onFocus?.(e); }}
            onBlur={(e) => { setFocused(false); onBlur?.(e); }}
            {...rest}
          />
        )}
        {/* P3：青色底线，focus 从左扫满（error 时洋红常亮） */}
        {ch === 'p3' && (
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-[rgba(0,216,255,0.28)]">
            <motion.div
              className="h-full origin-left"
              style={{ background: error ? 'var(--ui-danger)' : 'var(--ui-accent)' }}
              initial={false}
              animate={{ scaleX: error ? 1 : focused ? 1 : 0 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        )}
      </div>
      {(error || hint) && (
        <p className={`mt-1 text-[11px] leading-tight ${error ? s.error : s.hint}`}>{error || hint}</p>
      )}
    </div>
  );
};
