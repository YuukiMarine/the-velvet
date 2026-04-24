import { useEffect, useState, useRef, useMemo, useImperativeHandle, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Persona 觉醒全屏动画 —— 覆盖在 PersonaCreateModal 之上，防止 AI 生成期间误触背景关闭
 * 6 句文案逐句出现（自动 + 点击可加速）
 * 背景为缓慢上升的发光粒子
 * 通过 forwardRef 暴露 setStreamText，父组件可直接命令式更新底部流式预览——避免 prop 变化引起全 overlay 重渲染
 */

export interface AwakeningOverlayHandle {
  setStreamText: (t: string) => void;
}

const LINES = [
  '吾即是汝，汝即是吾。',
  '挣脱虚伪的牢笼吧。',
  '那囚禁灵魂的谎言，已无需再忍。',
  '此刻，燃起逆鳞的火焰——',
  '取回你真实的面具，',
  '以此咆哮，宣告世界的败北。',
];

const AUTO_ADVANCE_MS = 2800;

/** 从底部升起的发光粒子
 *  修复点：
 *   1. 所有 random 值在 useMemo 中一次性计算（包括 yTop），避免每次父 re-render 时
 *      animate 的 keyframe 值发生变化，导致 framer-motion 重启动画造成"闪屏重渲染"观感
 *   2. intensified 不再参与每个粒子的 animate/transition；改由上层一个独立的金色覆盖层
 *      平滑淡入来呈现最后一句的"强化"感，粒子本身保持稳态
 */
function RisingParticles() {
  const particles = useMemo(() => {
    return Array.from({ length: 32 }, (_, i) => {
      const tinted = i % 5 === 0; // 1/5 粒子偏金色，和最后一句呼应
      return {
        id: i,
        leftPct: Math.random() * 100,
        size: 2 + Math.random() * 4,
        duration: 5 + Math.random() * 5,
        delay: -Math.random() * 8, // 负 delay 让初次渲染就分散分布
        drift: (Math.random() - 0.5) * 80,
        yTop: 110 + Math.random() * 10,  // 稳定：决定每个粒子升到何处
        maxOpacity: 0.35 + Math.random() * 0.45,
        color: tinted ? '#fde68a' : '#c4b5fd',
        glow: tinted ? 'rgba(251,191,36,0.65)' : 'rgba(167,139,250,0.65)',
      };
    });
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {particles.map(p => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.leftPct}%`,
            bottom: -20,
            width: p.size,
            height: p.size,
            background: p.color,
            boxShadow: `0 0 ${p.size * 2.5}px ${p.glow}, 0 0 ${p.size * 5}px ${p.glow}`,
          }}
          animate={{
            y: ['0vh', `-${p.yTop}vh`],
            x: [0, p.drift],
            opacity: [0, p.maxOpacity, p.maxOpacity, 0],
            scale: [0.6, 1, 0.9, 0.4],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'easeOut',
          }}
        />
      ))}
    </div>
  );
}

/**
 * StreamPreview —— 底部居中流式预览
 * - 无背景 / 无边框，仅文字
 * - 文本自然换行（保持位置不变）
 * - 每 ~180ms 提交一次显示（去抖）避免逐字全页重渲染
 * - 新片段 key 变化 → 淡入 + 轻度模糊进入；旧片段淡出 + 模糊退出
 * - 组件内部持有 state，父组件通过 ref.setText() 命令式更新，不触发父 re-render
 */
interface StreamPreviewHandle { setText: (t: string) => void }

const StreamPreview = forwardRef<StreamPreviewHandle>((_props, ref) => {
  const [display, setDisplay] = useState('');
  const pendingRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useImperativeHandle(ref, () => ({
    setText: (raw: string) => {
      // 语义化清洗：去掉 JSON 噪声 / schema 字段名 / 多余标点
      const cleaned = raw
        .replace(/[{}\[\]"]+/g, ' ')
        .replace(/[,:]+/g, ' · ')
        .replace(/\s+/g, ' ')
        .replace(/\b(name|description|skills|type|power|spCost|level)\b/gi, '')
        .trim();
      // 仅保留尾部 ~90 字，作为滚动窗口
      pendingRef.current = cleaned.slice(-90);
      if (timerRef.current) return; // 去抖：已有待提交
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setDisplay(pendingRef.current);
      }, 180);
    },
  }), []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return (
    <div
      className="absolute pointer-events-none select-none flex items-center justify-center"
      style={{
        left: 0,
        right: 0,
        bottom: 80,
        height: '3.6em', // 最多两行高度，保持位置不变
      }}
    >
      <AnimatePresence mode="wait">
        {display && (
          <motion.p
            key={display}
            initial={{ opacity: 0, filter: 'blur(5px)', y: 4 }}
            animate={{ opacity: 0.72, filter: 'blur(0px)', y: 0 }}
            exit={{ opacity: 0, filter: 'blur(3px)', y: -3 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            style={{
              fontFamily: 'ui-monospace, "Cascadia Mono", "SF Mono", Menlo, monospace',
              fontSize: 11,
              lineHeight: '1.55em',
              color: 'rgba(216,195,255,0.9)',
              textShadow: '0 0 10px rgba(192,132,252,0.55)',
              letterSpacing: '0.04em',
              textAlign: 'center',
              margin: 0,
              padding: 0,
              maxWidth: 'min(380px, 82vw)',
              maxHeight: '3.2em',
              overflow: 'hidden',
              wordBreak: 'break-word',
              whiteSpace: 'pre-wrap',
            }}
          >
            {display}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
});

StreamPreview.displayName = 'StreamPreview';

interface Props {
  isOpen: boolean;
}

export const AwakeningOverlay = forwardRef<AwakeningOverlayHandle, Props>(({ isOpen }, ref) => {
  const previewRef = useRef<StreamPreviewHandle>(null);
  useImperativeHandle(ref, () => ({
    setStreamText: (t: string) => previewRef.current?.setText(t),
  }), []);
  return <AwakeningOverlayInner isOpen={isOpen} previewRef={previewRef} />;
});

AwakeningOverlay.displayName = 'AwakeningOverlay';

function AwakeningOverlayInner({ isOpen, previewRef }: { isOpen: boolean; previewRef: React.RefObject<StreamPreviewHandle> }) {
  const [currentLine, setCurrentLine] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset when opened
  useEffect(() => {
    if (isOpen) setCurrentLine(0);
  }, [isOpen]);

  // Auto-advance lines
  useEffect(() => {
    if (!isOpen) return;
    if (currentLine >= LINES.length) return;
    timerRef.current = setTimeout(() => {
      setCurrentLine(n => n + 1);
    }, AUTO_ADVANCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [currentLine, isOpen]);

  const handleAdvance = () => {
    if (currentLine >= LINES.length) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setCurrentLine(n => Math.min(n + 1, LINES.length));
  };

  const visibleLines = LINES.slice(0, currentLine);
  const intensified = currentLine >= 4;
  const allRevealed = currentLine >= LINES.length;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="fixed inset-0 z-[60] overflow-hidden cursor-pointer select-none"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(24,8,40,0.95) 0%, rgba(0,0,0,0.98) 70%)',
          }}
          onClick={handleAdvance}
        >
          {/* Background radial pulse */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            animate={{ opacity: [0.3, 0.65, 0.3] }}
            transition={{ duration: 3, repeat: Infinity }}
            style={{
              background:
                'radial-gradient(circle at 50% 50%, rgba(139,92,246,0.25) 0%, transparent 60%)',
            }}
          />

          {/* 上升粒子 */}
          <RisingParticles />

          {/* intensified 独立覆盖层：最后两句时淡入一层金色辉光，不影响粒子动画 */}
          {intensified && (
            <motion.div
              className="absolute inset-0 pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8 }}
              style={{
                background: 'radial-gradient(ellipse at bottom, rgba(251,191,36,0.14) 0%, transparent 55%)',
                mixBlendMode: 'screen',
              }}
            />
          )}

          {/* Text stack */}
          <div className="absolute inset-0 flex flex-col items-center justify-center px-8">
            <div
              className="space-y-5 text-center max-w-md"
              style={{
                fontFamily:
                  '"Noto Serif SC", "Songti SC", "Source Han Serif", "STSong", "SimSun", "Times New Roman", serif',
              }}
            >
              <AnimatePresence initial={false}>
                {visibleLines.map((line, i) => {
                  const isLast = i === LINES.length - 1;
                  return (
                    <motion.p
                      key={i}
                      initial={{ opacity: 0, y: 20, filter: 'blur(6px)' }}
                      animate={{
                        opacity: 1,
                        y: 0,
                        filter: 'blur(0px)',
                        textShadow: isLast
                          ? [
                              '0 0 8px rgba(251,191,36,0.3)',
                              '0 0 22px rgba(251,191,36,0.7)',
                              '0 0 10px rgba(251,191,36,0.4)',
                            ]
                          : '0 0 12px rgba(192,132,252,0.4)',
                      }}
                      exit={{ opacity: 0 }}
                      transition={{
                        duration: 0.9,
                        textShadow: isLast ? { duration: 2.5, repeat: Infinity } : undefined,
                      }}
                      className="text-xl sm:text-2xl tracking-wide leading-loose"
                      style={{
                        color: isLast ? '#fde68a' : '#ede9fe',
                        fontWeight: isLast ? 700 : 500,
                        letterSpacing: '0.12em',
                      }}
                    >
                      {line}
                    </motion.p>
                  );
                })}
              </AnimatePresence>
            </div>

            {/* Tap 提示 */}
            {!allRevealed && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.35 }}
                transition={{ delay: 2 }}
                className="absolute bottom-6 text-[10px] text-purple-200/50 tracking-[0.3em] uppercase"
              >
                tap to continue
              </motion.p>
            )}
          </div>

          {/* AI 流式输出预览（底部居中，无背景，淡入淡出） */}
          <StreamPreview ref={previewRef} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
