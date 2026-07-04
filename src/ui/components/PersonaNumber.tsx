/**
 * PersonaNumber —— 数字反馈原语（PERSONA_UI_REWRITE_GUIDE §22.6「日常滚轮」）。
 *
 * rolling：每一位数字在固定高度窗口内上下滚动到位；低位先动、高位 60ms 级联；
 * tabular-nums 恒宽防跳动。非数字字符（小数点/负号/千分位）静态渲染。
 * flip（仪式翻牌）属重结算场景，等 P9 结算页需求落地再扩展；plain = 无动画直出。
 * D0（useBoldness false）自动退化为 plain（guide §22.6 降级要求）。
 *
 * 位对齐策略：digit 的 key 取「距个位的距离」——位数变化（99→100）时个位/十位保持
 * 各自滚动连续性，新高位从上方滚入。
 */
import { motion } from 'motion/react';
import { useBoldness } from '@/utils/boldness';

export interface PersonaNumberProps {
  value: number;
  variant?: 'rolling' | 'plain';
  /** 数值格式化（千分位/小数等），默认 String */
  format?: (n: number) => string;
  className?: string;
}

const DIGITS = '0123456789';

const RollingDigit = ({ digit, delay }: { digit: number; delay: number }) => (
  <span className="inline-block overflow-hidden align-baseline" style={{ height: '1em', lineHeight: 1 }} aria-hidden>
    <motion.span
      className="flex flex-col items-center"
      initial={false}
      animate={{ y: `-${digit}em` }}
      transition={{ type: 'spring', stiffness: 300, damping: 32, delay }}
      style={{ lineHeight: 1 }}
    >
      {[...DIGITS].map((d) => (
        <span key={d} style={{ height: '1em' }}>
          {d}
        </span>
      ))}
    </motion.span>
  </span>
);

export const PersonaNumber = ({ value, variant = 'rolling', format, className }: PersonaNumberProps) => {
  const bold = useBoldness();
  const text = (format ?? String)(value);

  // D0 / plain：直出（屏幕阅读器也永远读这份纯文本）
  if (!bold || variant === 'plain') {
    return (
      <span className={`tabular-nums ${className ?? ''}`}>
        {text}
      </span>
    );
  }

  const chars = [...text];
  // 数字位从右往左计级联序：最右侧数字位 delay 0，向高位每级 +60ms（guide §22.6）
  let digitOrder = 0;
  const delays: (number | null)[] = new Array(chars.length).fill(null);
  for (let i = chars.length - 1; i >= 0; i--) {
    if (DIGITS.includes(chars[i])) {
      delays[i] = digitOrder * 0.06;
      digitOrder++;
    }
  }
  return (
    <span className={`tabular-nums ${className ?? ''}`}>
      {/* 真实数值走 sr-only（guide §22.3：装饰动画 aria-hidden，可读文本兜底） */}
      <span className="sr-only">{text}</span>
      {chars.map((chr, i) => {
        const delay = delays[i];
        if (delay === null) {
          // 非数字字符（.-,等）静态占位
          return (
            <span key={`s-${chars.length - i}`} aria-hidden className="inline-block" style={{ lineHeight: 1 }}>
              {chr}
            </span>
          );
        }
        // key = 距个位的数字位序：位数增减时低位保持滚动连续
        const posFromRight = (() => {
          let n = 0;
          for (let j = chars.length - 1; j > i; j--) if (DIGITS.includes(chars[j])) n++;
          return n;
        })();
        return <RollingDigit key={`d-${posFromRight}`} digit={Number(chr)} delay={delay} />;
      })}
    </span>
  );
};
