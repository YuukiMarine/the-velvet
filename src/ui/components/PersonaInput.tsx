/**
 * PersonaInput —— 输入框原语（PERSONA_UI_REWRITE_GUIDE §8.7 / §17.5）。
 *
 * 结构统一：label（短）+ 输入区 + hint/error（短提示）。
 * 三频道 focus 语言：P5 = 红色角贴纸出现；P4 = 左侧频道条亮起；P3 = 浅青基线上的亮蓝扫描。
 * 输入字号 16px 防 iOS 聚焦缩放（guide §17.5）；错误提示短促、主题 danger 色。
 * 录入态即「校直模式」语境（guide §22.3）：输入区自身永远水平，不做任何倾斜。
 */
import { useId, useState } from 'react';
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { motion } from 'motion/react';
import type { UIChannel } from '../channel';
import { useUiChannel } from '../useUiChannel';
import { SignalStripes } from '../motifs';

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
    return {
      label: 'text-[11px] font-black tracking-wider text-[#111]',
      box: `relative border-2 bg-[var(--ui-paper)] text-[#111] ${error ? 'border-[var(--ui-danger)]' : 'border-black'}`,
      boxStyle: { boxShadow: '0 3px 0 #000' } as React.CSSProperties,
      hint: 'text-[#111]/60',
      error: 'text-[var(--ui-danger)] font-black',
    };
  }
  if (ch === 'p3') {
    return {
      label: 'text-[11px] font-bold tracking-[0.12em] text-[#0b5cff]',
      box: 'relative bg-white/95 text-[#07143f]',
      boxStyle: {
        boxShadow: '0 8px 20px rgba(35,111,154,0.08)',
        clipPath: 'polygon(1.5% 0, 100% 0, 98.5% 100%, 0 100%)',
      } as React.CSSProperties,
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
  const generatedId = useId();
  const messageId = useId();
  const [focused, setFocused] = useState(false);
  const s = skin(ch, !!error);
  const fieldId = rest.id ?? generatedId;
  const describedBy = [rest['aria-describedby'], error || hint ? messageId : undefined]
    .filter(Boolean)
    .join(' ') || undefined;

  const fieldCls = 'w-full bg-transparent px-3.5 py-2.5 text-[16px] leading-snug outline-none placeholder:opacity-45';

  return (
    <div className={className}>
      {label && (
        <label htmlFor={fieldId} className={`mb-1 block ${s.label}`}>
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
        {/* P4 focus：左侧频道条亮起 */}
        {ch === 'p4' && <SignalStripes className={`absolute inset-y-0 left-0 w-[4px] transition-opacity ${focused ? 'opacity-100' : 'opacity-0'}`} />}
        {multiline ? (
          <textarea
            {...(rest as NativeTextareaProps)}
            id={fieldId}
            rows={rows}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={`${fieldCls} resize-none`}
            onFocus={(e) => { setFocused(true); onFocus?.(e as never); }}
            onBlur={(e) => { setFocused(false); onBlur?.(e as never); }}
          />
        ) : (
          <input
            {...rest}
            id={fieldId}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={fieldCls}
            onFocus={(e) => { setFocused(true); onFocus?.(e); }}
            onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          />
        )}
        {/* P3：浅青基线，focus 亮蓝从左扫满（error 时洋红常亮） */}
        {ch === 'p3' && (
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-[rgba(32,207,232,0.3)]">
            <motion.div
              className="h-full origin-left"
              style={{ background: error ? 'var(--ui-danger)' : 'var(--p3-blue, #0b5cff)' }}
              initial={false}
              animate={{ scaleX: error ? 1 : focused ? 1 : 0 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        )}
      </div>
      {(error || hint) && (
        <p
          id={messageId}
          role={error ? 'alert' : undefined}
          className={`mt-1 text-[11px] leading-tight ${error ? s.error : s.hint}`}
        >
          {error || hint}
        </p>
      )}
    </div>
  );
};
