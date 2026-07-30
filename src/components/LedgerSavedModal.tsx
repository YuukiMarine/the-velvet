/**
 * LedgerSavedModal —— 记账落账庆祝。
 * 不另起炉灶：三个频道各自复用「今日完成」的演出骨架（P5 猩红大板 / P4 贴纸徽 /
 * P3 横贯斜带），只换标题「记账完成」；中性主题走 CelebrationCutIn。
 * title 是摘要文案（单笔「−¥28 · 咖啡」/ 批量「共 3 笔已入账」）。
 */
import { CelebrationCutIn } from '@/components/CelebrationCutIn';
import { BandCutInP3 } from '@/components/TodoCompleteModal';
import { TodoCompleteP4 } from '@/components/p4r/cutins';
import { TodoCompleteP5 } from '@/components/p5r/cutins';
import { useUiChannel } from '@/ui/useUiChannel';
import { triggerSuccessFeedback } from '@/utils/feedback';

export const LedgerSavedModal = ({ isOpen, onClose, title }: {
  isOpen: boolean; onClose: () => void; title: string;
}) => {
  const channel = useUiChannel();
  if (channel === 'p5') return <TodoCompleteP5 isOpen={isOpen} onClose={onClose} title={title} heading="记账完成" />;
  if (channel === 'p4') return <TodoCompleteP4 isOpen={isOpen} onClose={onClose} title={title} heading="记账完成" />;
  if (channel === 'p3') return <BandCutInP3 isOpen={isOpen} onClose={onClose} title={title} eyebrow="记账完成" ghost="SAVED" />;
  return (
    <CelebrationCutIn
      isOpen={isOpen}
      onClose={onClose}
      theme="emerald"
      autoCloseMs={2600}
      particles={14}
      onShown={triggerSuccessFeedback}
      icon={<span>💰</span>}
      title="记账完成"
      subtitle={title}
    />
  );
};
