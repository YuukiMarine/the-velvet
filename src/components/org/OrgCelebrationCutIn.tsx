/**
 * 组织的庆祝卡（第 8 轮 · PRD §13.3 / §13.4）：作战达成（+SP、在线同伴之间的亲密度）、据点升级。
 * 挂在 App 顶层，由 cloudSocial.orgCelebrations 排队驱动（一次一张；有弹层开着时先等它关掉）。
 * 拍板：作战达成不放总攻击过场，只弹这一张卡。四频道分派同 WishProgressCutIn：红频道走 P5 纸板，其余走庆祝基座。
 */
import { useCloudSocialStore } from '@/store/cloudSocial';
import { CelebrationCutIn } from '@/components/CelebrationCutIn';
import { UnlockCutInP5 } from '@/components/p5r/cutins';
import { useUiChannel } from '@/ui/useUiChannel';
import { useAnyOverlayOpen } from '@/ui/overlayPause';
import { triggerSuccessFeedback } from '@/utils/feedback';
import { OP_KIND_LABEL } from '@/utils/orgOps';

export function OrgCelebrationCutIn() {
  const head = useCloudSocialStore(s => s.orgCelebrations[0]);
  const shift = useCloudSocialStore(s => s.shiftOrgCelebration);
  const channel = useUiChannel();
  const overlay = useAnyOverlayOpen();
  // 有抽屉 / 确认框开着就先等等（比如刚在任务页完成那一条，完成卡还没关）
  const open = !!head && !overlay;

  const heading = head?.kind === 'level' ? '据点升级' : `${head ? OP_KIND_LABEL[head.opKind] : '作战'}达成`;
  const name = head ? (head.kind === 'level' ? `「${head.orgName}」Lv.${head.level}` : head.title) : '';
  const reward = head?.kind === 'op'
    ? [head.sp ? `+${head.sp} SP` : '', head.partners.length ? `与 ${head.partners.join('、')} 亲密度 +2` : ''].filter(Boolean).join(' · ') || '大家都做完了'
    : head ? `同调的面具伤害 ×${head.mult.toFixed(1)}` : '';
  const sub = head ? (head.kind === 'op' ? `「${head.orgName}」的${OP_KIND_LABEL[head.opKind]}` : '会议、目标和作战攒下的经验') : '';

  if (channel === 'p5') {
    return <UnlockCutInP5 isOpen={open} onClose={shift} heading={heading} name={name} lines={[reward, sub]} />;
  }
  const isP4 = channel === 'p4';
  const ink = isP4 ? '#131313' : '#ffffff';
  const faint = isP4 ? 'rgba(19,19,19,0.62)' : 'rgba(255,255,255,0.8)';
  return (
    <CelebrationCutIn
      isOpen={open}
      onClose={shift}
      theme={head?.kind === 'level' ? 'violet' : 'gold'}
      icon={<span className="text-[38px] leading-none">{head?.kind === 'level' ? '⬆' : '✦'}</span>}
      title={name}
      subtitle={heading}
      autoCloseMs={3600}
      particles={18}
      onShown={triggerSuccessFeedback}
    >
      <div className="mt-1 w-full text-center">
        <div className="text-[20px] font-black leading-tight" style={{ color: ink }}>{reward}</div>
        <div className="mt-1 text-[11px] font-bold" style={{ color: faint }}>{sub}</div>
      </div>
    </CelebrationCutIn>
  );
}
