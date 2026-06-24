/**
 * TerminalTaskCard — F3 短路决策落成的 24h 限时任务卡「逻辑容器」。
 *
 * 复用 CallingCard 数据（card.terminal 元数据），自带「小时级倒计时 + 我做到了 + 放弃」，
 * 区别于普通宣告卡（天级、无完成按钮）。首页与终端页共用，首页传 compact。
 *
 * 频道化：本文件持有倒计时 / 在途锁 / 放弃确认，构造 view-model 后按频道委派表现层
 * （thief = 预告状 / 其余 = 通用卡）。24h 是温柔的限时而非硬门——过期后仍可「我做到了」，
 * 仅倒计时显示「时限已过」。完成走 store.completeTerminalTask。
 */
import { useEffect, useState } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAppStore } from '@/store';
import { terminalChannel } from '@/utils/terminalSkin';
import { TaskCardThief } from './TaskCardThief';
import { TaskCardBoard } from './TaskCardBoard';
import { TaskCardDefault } from './TaskCardDefault';
import type { CallingCard } from '@/types';

interface Props {
  card: CallingCard;
  onComplete: () => void | Promise<void>;
  onDismiss: () => void;
  compact?: boolean;
}

/** 频道表现层 view-model：倒计时产出 + 操作回调 */
export interface TaskCardVM {
  goalTitle?: string;
  title: string;
  countdown: string;
  expired: boolean;
  elapsedFrac: number;
  busy: boolean;
  compact: boolean;
  onComplete: () => void;
  requestDismiss: () => void;
}

export const TerminalTaskCard = ({ card, onComplete, onDismiss, compact }: Props) => {
  const t = card.terminal;
  const theme = useAppStore((s) => s.user?.theme);
  const channel = terminalChannel(theme);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [confirmDismiss, setConfirmDismiss] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  if (!t) return null;

  const handleComplete = async () => {
    if (busy) return; // 防双击重入（store 侧另有在途锁兜底）
    setBusy(true);
    try {
      await onComplete();
    } finally {
      setBusy(false);
    }
  };

  const startTs = new Date(t.startedAt).getTime();
  const expireTs = new Date(t.expiresAt).getTime();
  const remaining = expireTs - nowTs;
  const expired = remaining <= 0;
  const hours = Math.floor(remaining / 3_600_000);
  const mins = Math.floor((remaining % 3_600_000) / 60_000);
  const countdown = expired
    ? '时限已过 · 完成永远不晚'
    : hours > 0
      ? `还剩 ${hours} 小时 ${mins} 分`
      : `还剩 ${mins} 分`;
  // 时间进度（已过 / 24h），仅作氛围，不参与完成判定
  const elapsedFrac = Math.min(1, Math.max(0, (nowTs - startTs) / (expireTs - startTs || 1)));

  const vm: TaskCardVM = {
    goalTitle: t.goalTitle,
    title: card.title,
    countdown,
    expired,
    elapsedFrac,
    busy,
    compact: !!compact,
    onComplete: handleComplete,
    requestDismiss: () => setConfirmDismiss(true),
  };

  return (
    <>
      {channel === 'thief' ? <TaskCardThief vm={vm} /> : channel === 'board' ? <TaskCardBoard vm={vm} /> : <TaskCardDefault vm={vm} />}

      <ConfirmDialog
        isOpen={confirmDismiss}
        tone="warning"
        forceDark={channel === 'thief' || channel === 'board'}
        title="放弃这一步？"
        description="它会被丢掉，但你随时可以再来终端拣一件。"
        confirmText="放弃"
        cancelText="再想想"
        onConfirm={() => { setConfirmDismiss(false); onDismiss(); }}
        onCancel={() => setConfirmDismiss(false)}
      />
    </>
  );
};
