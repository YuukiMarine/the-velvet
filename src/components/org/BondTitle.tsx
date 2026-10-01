/**
 * 羁绊的两个平级视图（第 7 轮验收）：同伴 ⇄ 组织。
 * 页面标题本身就是开关（第 9 轮改成和「记录 / 任务」一样的两个词并排，点另一个切过去），
 * 组织里有新动静（新动态 / 新标签 / 会议日还没写 / 有新作战或作战刚达成 / 被请离之类的提示）时「组织」亮红点。
 * 没配云端的构建不出现开关；登录了但组织还没拉到（包括线上还没建组织的表）时也先不出现。
 */
import { Fragment, useMemo } from 'react';
import { motion, type PanInfo } from 'motion/react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store';
import { useCloudStore } from '@/store/cloud';
import { useCloudSocialStore } from '@/store/cloudSocial';
import { cloudEnabled } from '@/services/pocketbase';
import { P3R, slantClip } from '@/components/p3r/kit';
import { P5R, P5_TITLE_FONT } from '@/components/p5r/kit';
import { springSnappy, TAP } from '@/utils/motion';
import { triggerNavFeedback } from '@/utils/feedback';
import { boardUnread, meetingPending } from '@/utils/orgLogic';
import { opsUnread } from '@/utils/orgOps';
import { raidStrikeAvailable } from '@/utils/orgRaid';
import { useOrgTone } from './orgUi';

export type BondView = 'companions' | 'orgs';

/** 开关能不能用、要不要亮红点 */
export function useOrgSwitch(): { available: boolean; dot: boolean } {
  const signedIn = useCloudStore(s => !!s.cloudUser);
  const { orgs, orgsLoaded, orgNotice, orgSeen, orgOpsSeen, orgBlocked } = useCloudSocialStore(useShallow(s => ({
    orgs: s.orgs, orgsLoaded: s.orgsLoaded, orgNotice: s.orgNotice, orgSeen: s.orgSeen, orgOpsSeen: s.orgOpsSeen, orgBlocked: s.orgBlocked,
  })));
  const blocked = useMemo(() => new Set(orgBlocked), [orgBlocked]);
  const available = cloudEnabled && (!signedIn || orgsLoaded);
  const dot = available && (!!orgNotice || orgs.some(v => boardUnread(v, orgSeen[v.org.id], blocked) || meetingPending(v) || opsUnread(v, orgOpsSeen[v.org.id]) || raidStrikeAvailable(v)));
  return { available, dot };
}

/** 切到另一边。进组织时停在上次看的那个（没有就第一个），并直接打开有新东西的那一区 */
export function goBondView(to: BondView): void {
  const app = useAppStore.getState();
  if (to === 'companions') {
    app.setCurrentPage('cooperation');
    return;
  }
  const social = useCloudSocialStore.getState();
  const cur = social.orgs.find(v => v.org.id === social.hideoutOrgId) ?? social.orgs[0];
  if (cur) {
    const blocked = new Set(social.orgBlocked);
    social.setHideoutOrgId(cur.org.id);
    social.setHideoutSection(meetingPending(cur) ? 'meeting'
      : opsUnread(cur, social.orgOpsSeen[cur.org.id]) ? 'ops'
        : boardUnread(cur, social.orgSeen[cur.org.id], blocked) ? 'board' : null);
  }
  app.setCurrentPage('hideout');
}

/**
 * 页面标题就是开关（第 9 轮验收：照「记录 / 任务」那套做）：「同伴 / 组织」两个词并排（红频道是「羁绊 / 组织」），
 * 亮着的是现在这页，点另一个就切过去；横着拖一下也行。组织有新动静时「组织」右上角亮红点。
 * 四个频道的样子和行动页的切换头一致：红 = 逐字拼贴瓷砖 + 红斜杠；蓝 = 蓝斜块 + 洋红角；黄 = 衬线大字 + 橙太阳；中性 = 大小字 + 滑动下划线。
 */
export function BondTitle({ view }: { view: BondView }) {
  const tone = useOrgTone();
  const { available, dot } = useOrgSwitch();
  const orgs = view === 'orgs';
  const p5 = tone.channel === 'p5';
  const tabs: Array<{ key: BondView; label: string }> = [
    { key: 'companions', label: p5 ? '羁绊' : '同伴' },
    { key: 'orgs', label: '组织' },
  ];
  // 没配云端 / 组织还没拉到：只有「同伴」这一页，标题就是普通标题
  const shown = available ? tabs : tabs.filter(t => t.key === view);
  const go = (to: BondView) => {
    if (to === view || !available) return;
    triggerNavFeedback();
    goBondView(to);
  };
  const onDragEnd = (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x < -40) go('orgs');
    else if (info.offset.x > 40) go('companions');
  };
  const dotEl = (key: BondView) => (available && dot && key === 'orgs' && !orgs ? (
    <span aria-hidden className="absolute -right-1.5 -top-1 z-10 h-2.5 w-2.5 rounded-full" style={{ background: p5 ? P5R.red : tone.channel === 'p3' ? P3R.magenta : '#f43f5e', boxShadow: `0 0 0 2px ${p5 ? P5R.paper : '#ffffff'}` }} />
  ) : null);
  const tabProps = (key: BondView, label: string) => ({
    type: 'button' as const,
    role: 'tab',
    'aria-selected': key === view,
    'aria-label': key === view ? `${label}（现在这页）` : `点一下切换到${label}${dot && key === 'orgs' ? '（组织里有新动静）' : ''}`,
    onClick: () => go(key),
  });

  if (p5) {
    return (
      <motion.div role="tablist" aria-label="同伴 / 组织切换" drag={available ? 'x' : false} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.15} onDragEnd={onDragEnd} className="relative inline-flex min-w-0 select-none items-end gap-3 pt-2">
        {shown.map((t, i) => {
          const active = t.key === view;
          return (
            <Fragment key={t.key}>
              {i > 0 && <span aria-hidden className="pb-2 text-[32px] font-black leading-none" style={{ color: P5R.red, fontFamily: P5_TITLE_FONT, transform: 'rotate(10deg)', textShadow: '2px 2px 0 #000000' }}>/</span>}
              <motion.button {...tabProps(t.key, t.label)} whileTap={TAP} className="relative cursor-pointer">
                <span className="inline-flex items-start gap-[3px]">
                  {Array.from(t.label).map((ch, ci) => {
                    const pal = P5_TAB_TILE[(ci + (t.key === 'orgs' ? 2 : 0)) % P5_TAB_TILE.length];
                    return (
                      <motion.span
                        key={ci}
                        animate={{ fontSize: active ? '27px' : '17px', rotate: active ? (ci % 2 ? 2.6 : -3) : (ci % 2 ? -2 : 2), y: active ? (ci % 2 ? 5 : 0) : (ci % 2 ? 3 : 0) }}
                        transition={springSnappy}
                        className="inline-flex items-center justify-center font-black leading-none"
                        style={{ padding: active ? '7px 8px' : '5px 6px', background: active ? pal.bg : P5R.paper, color: active ? pal.fg : P5R.grey, border: '3px solid #050505', boxShadow: '0 0 0 2.5px #f0e9df, 5px 6px 0 #000000', fontFamily: P5_TITLE_FONT }}
                      >
                        {ch}
                      </motion.span>
                    );
                  })}
                </span>
                {dotEl(t.key)}
              </motion.button>
            </Fragment>
          );
        })}
      </motion.div>
    );
  }

  if (tone.channel === 'p3') {
    return (
      <div role="tablist" aria-label="同伴 / 组织切换" className="relative flex min-w-0 items-center gap-5 pt-1">
        {shown.map(t => {
          const active = t.key === view;
          return (
            <button key={t.key} {...tabProps(t.key, t.label)} className="relative select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff] focus-visible:ring-offset-2">
              {active ? (
                <span className="relative inline-block px-7 py-2.5" style={{ clipPath: slantClip(12), background: P3R.blue }}>
                  <span className="text-[22px] font-black leading-none text-white">{t.label}</span>
                  <span aria-hidden className="absolute bottom-0 right-[10px] h-[7px] w-[12px]" style={{ background: P3R.magenta, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
                </span>
              ) : (
                <span className="text-[22px] font-black leading-none" style={{ color: P3R.ink }}>{t.label}</span>
              )}
              {dotEl(t.key)}
            </button>
          );
        })}
      </div>
    );
  }

  if (tone.channel === 'p4') {
    return (
      <div className="relative min-w-0">
        <motion.div role="tablist" aria-label="同伴 / 组织切换" drag={available ? 'x' : false} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.15} onDragEnd={onDragEnd} className="relative inline-flex select-none items-end gap-2.5">
          {shown.map((t, i) => {
            const active = t.key === view;
            return (
              <Fragment key={t.key}>
                {i > 0 && <span aria-hidden className="pb-1 text-[30px] font-black leading-none text-[var(--p4-orange,#f9a11b)]" style={{ fontFamily: 'var(--p4-display-font, serif)' }}>/</span>}
                <motion.button {...tabProps(t.key, t.label)} whileTap={TAP} className="relative">
                  {active && <span aria-hidden className="absolute -left-4 -top-4 h-[76px] w-[76px] rounded-full" style={{ background: 'radial-gradient(circle at 45% 38%, #ffc23f 0 45%, var(--p4-orange, #f9a11b) 46% 100%)', opacity: 0.92 }} />}
                  <motion.span animate={{ fontSize: active ? '50px' : '28px' }} transition={springSnappy} className="relative block font-black leading-none tracking-tight text-[#131313]" style={{ fontFamily: 'var(--p4-display-font, serif)' }}>
                    {t.label}
                  </motion.span>
                  {dotEl(t.key)}
                </motion.button>
              </Fragment>
            );
          })}
        </motion.div>
        <div className="relative mt-1.5 text-xs font-black tracking-[0.22em] text-[#131313]">
          {orgs ? 'HIDEOUT' : 'COOPERATION'}&nbsp;&nbsp;<span className="text-[var(--p4-orange,#f9a11b)]">FILE</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-10 min-w-0">
      <motion.div role="tablist" aria-label="同伴 / 组织切换" drag={available ? 'x' : false} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.15} onDragEnd={onDragEnd} className="relative inline-flex select-none items-baseline gap-2.5">
        {shown.map((t, i) => {
          const active = t.key === view;
          return (
            <Fragment key={t.key}>
              {i > 0 && <span aria-hidden className="text-xl font-bold leading-none text-gray-300 dark:text-gray-600">／</span>}
              <motion.button {...tabProps(t.key, t.label)} whileTap={TAP} className="relative flex flex-col items-start">
                <motion.span
                  animate={{ fontSize: active ? '30px' : '20px' }}
                  transition={springSnappy}
                  className={`leading-none tracking-tight transition-colors ${active ? 'font-black text-primary' : 'font-semibold text-gray-400 dark:text-gray-500'}`}
                >
                  {t.label}
                </motion.span>
                <div className="mt-1 h-1.5 w-9" aria-hidden="true">
                  {active && (
                    <motion.div layoutId="bond-underline" transition={springSnappy} className="h-1.5 w-9">
                      <div className="h-full w-full bg-primary" style={{ transform: 'skewX(var(--ui-skew-ui))' }} />
                    </motion.div>
                  )}
                </div>
                {dotEl(t.key)}
              </motion.button>
            </Fragment>
          );
        })}
        <span aria-hidden="true" className="pointer-events-none absolute text-lg leading-none text-primary" style={{ fontFamily: "'Caveat', cursive", fontWeight: 600, right: -12, bottom: -8 }}>
          {orgs ? 'hideout' : 'bond'}
        </span>
      </motion.div>
    </div>
  );
}

/** 红频道切换头逐字瓷砖配色（和行动页同一组） */
const P5_TAB_TILE = [
  { bg: '#f0e9df', fg: '#c00008' },
  { bg: '#050505', fg: '#f8f8f6' },
  { bg: '#c00008', fg: '#f8f8f6' },
  { bg: '#9b9791', fg: '#050505' },
] as const;
