import { useEffect, useRef, useState } from 'react';

/**
 * 带本地缓冲的受控文本框 —— 专治中文输入法把拼音叠成一坨。
 *
 * 【坏在哪】
 *   设置页原来的写法是 `value={settings.x} onChange={e => updateSettings({ x: e.target.value })}`。
 *   updateSettings 是 **async**：写 Dexie → await → 再 set() 触发重渲染。
 *   于是每敲一个键，输入框的 value 都要绕一圈 IndexedDB 才回来。
 *   中文输入法正在组词时（composition 期间），React 用一个**慢一拍的旧值**去回设 DOM，
 *   输入法的候选缓冲被打断又重开，结果就是一串没上屏的拼音层层叠在框里。
 *
 * 【怎么修】
 *   1. 值先落在组件自己的 state 上，打字全程零异步——输入法拿到的是稳定的 DOM；
 *   2. compositionstart/end 期间**绝不**向外提交，组词过程对外不可见；
 *   3. 组词结束 / 停手 400ms / 失焦 才提交给 store；
 *   4. 外部值变化（比如从「选择模型」弹层选了一个）只在**没聚焦、没组词**时才回灌，
 *      不会打断正在打的字。
 *
 * 任何"打字直接写进 store"的中文输入位都应该换成它。
 */
interface Props {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  className?: string;
  type?: 'text' | 'search' | 'url';
  inputMode?: 'text' | 'url' | 'numeric';
  disabled?: boolean;
  'aria-label'?: string;
  /** 停手多久提交一次（毫秒）；失焦与组词结束总是立即提交 */
  debounceMs?: number;
}

export function BufferedTextInput({
  value,
  onCommit,
  placeholder,
  className,
  type = 'text',
  inputMode,
  disabled,
  debounceMs = 400,
  ...rest
}: Props) {
  const [draft, setDraft] = useState(value);
  const composing = useRef(false);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // onCommit 常是内联箭头函数，放进 effect 依赖会每帧重建定时器，用 ref 取最新的那个
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  // 外部值回灌：只在用户没在这个框里操作时
  useEffect(() => {
    if (focused.current || composing.current) return;
    setDraft(value);
  }, [value]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const scheduleCommit = (next: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { commitRef.current(next); }, debounceMs);
  };

  const commitNow = (next: string) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    commitRef.current(next);
  };

  return (
    <input
      {...rest}
      type={type}
      inputMode={inputMode}
      disabled={disabled}
      value={draft}
      placeholder={placeholder}
      className={className}
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={(e) => {
        composing.current = false;
        const next = (e.target as HTMLInputElement).value;
        setDraft(next);
        commitNow(next); // 一个词组完就落一次，避免用户组完词直接切页丢字
      }}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        if (composing.current) return; // 组词中一律不外传
        scheduleCommit(next);
      }}
      onFocus={() => { focused.current = true; }}
      onBlur={(e) => {
        focused.current = false;
        composing.current = false;
        commitNow(e.target.value);
      }}
    />
  );
}
