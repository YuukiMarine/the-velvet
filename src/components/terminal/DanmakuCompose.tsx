/**
 * DanmakuCompose — F3 弹幕投稿（先审后发）。
 *
 * 完成终端任务攒到「鼓励机会」(settings.terminalDanmakuTokens) 才能发；匿名、先审后发。
 * 成功投稿才消费一次机会；失败（未登录 / 集合未建 / 校验不过）保留机会并提示。
 */
import { useRef, useState } from 'react';
import { useAppStore } from '@/store';
import { SheetModal } from '@/components/SheetModal';
import { submitDanmaku, danmakuThemeOf, validateDanmaku, DANMAKU_MAX_LEN } from '@/services/danmaku';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** 强制暗色（thief 频道暗房语境，透传给 SheetModal） */
  forceDark?: boolean;
}

export const DanmakuCompose = ({ isOpen, onClose, forceDark }: Props) => {
  const { settings, updateSettings, user } = useAppStore();
  const tokens = settings.terminalDanmakuTokens ?? 0;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const sendingRef = useRef(false); // 同步在途锁：busy 是异步 state，挡不住同一 tick 的双击

  const len = [...text].length;
  const canSend = validateDanmaku(text).ok && tokens > 0 && !busy;

  const close = () => {
    setText('');
    setError('');
    setDone(false);
    onClose();
  };

  const submit = async () => {
    if (sendingRef.current) return; // 防同 tick 双击重入（多发一条只扣一次）
    setError('');
    if (tokens <= 0) {
      setError('暂时没有鼓励机会了');
      return;
    }
    sendingRef.current = true;
    setBusy(true);
    try {
      await submitDanmaku(text, danmakuThemeOf(user?.theme));
      // 成功才消费，且基于最新 store 值原子递减（避免与完成小步的 +1 互相覆盖丢点）
      const cur = useAppStore.getState().settings.terminalDanmakuTokens ?? 0;
      await updateSettings({ terminalDanmakuTokens: Math.max(0, cur - 1) });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '发送失败');
    } finally {
      setBusy(false);
      sendingRef.current = false;
    }
  };

  return (
    <SheetModal isOpen={isOpen} onClose={close} position="center" busy={busy} title="写一句鼓励" forceDark={forceDark}>
      {done ? (
        <div className="py-6 text-center">
          <div className="mb-2 text-3xl">✦</div>
          <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-200">
            已送出。过审后，它会出现在同样卡住的人面前。
          </p>
          <button
            type="button"
            onClick={close}
            className="mt-5 rounded-full bg-primary px-6 py-2 text-sm font-semibold text-white"
          >
            好
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-gray-400 dark:text-gray-500">
            匿名发送给同样卡住的人。先审后发，请温柔。还剩 {tokens} 次机会。
          </p>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={DANMAKU_MAX_LEN + 10}
            placeholder="比如：我也熬过来了，你可以的"
            className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
          <div className="flex items-center justify-between text-xs">
            <span className={len > DANMAKU_MAX_LEN ? 'text-red-400' : 'text-gray-400 dark:text-gray-500'}>
              {len}/{DANMAKU_MAX_LEN}
            </span>
            {error && <span className="text-red-400">{error}</span>}
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? '送出中…' : '送出鼓励'}
          </button>
        </div>
      )}
    </SheetModal>
  );
};
