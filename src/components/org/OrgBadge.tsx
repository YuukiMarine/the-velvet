/**
 * 羁绊页好友卡上的组织徽章（第 7 轮 · PRD §12.8）：对方和我在同一个组织，就挂那个组织的徽记小章；
 * 两个组织都同在就挂两枚。数据来自 cloudSocial.orgs（社交同步时拉），不另外请求。
 */
import { useMemo } from 'react';
import { useCloudSocialStore } from '@/store/cloudSocial';
import { P3R, slantClip } from '@/components/p3r/kit';
import { P5R, roughQuad } from '@/components/p5r/kit';
import { OrgEmblem, useOrgTone } from './orgUi';

export function OrgBadge({ userId, surface = 'default' }: { userId: string | undefined; surface?: 'default' | 'night' }) {
  const tone = useOrgTone();
  // 选成一个字符串（原始值），组织没变就不重渲染
  const key = useCloudSocialStore(s => (userId
    ? s.orgs.filter(v => v.me.userId !== userId && v.members.some(m => m.userId === userId)).map(v => `${v.org.id}\u0001${v.org.emblem}\u0001${v.org.name}`).join('\u0002')
    : ''));
  const shared = useMemo(() => (key ? key.split('\u0002').map(x => { const [id, emblem, name] = x.split('\u0001'); return { id, emblem, name }; }) : []), [key]);
  if (!shared.length) return null;
  return (
    <>
      {shared.map(o => {
        const label = `同在「${o.name}」`;
        if (tone.channel === 'p3') {
          return (
            <span key={o.id} title={label} aria-label={label} className="inline-flex shrink-0 items-center gap-1 px-1.5 py-[2px] text-[9px] font-black text-white" style={{ background: P3R.blueDeep, clipPath: slantClip(4) }}>
              <OrgEmblem id={o.emblem} size={10} color="#ffffff" />
              <span className="max-w-[4.5em] truncate">{o.name}</span>
            </span>
          );
        }
        if (tone.channel === 'p4') {
          return (
            <span key={o.id} title={label} aria-label={label} className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-[2px] text-[9px] font-black text-[#131313]" style={{ background: 'var(--p4-orange, #f9a11b)', boxShadow: '0 0 0 1.5px #131313' }}>
              <OrgEmblem id={o.emblem} size={10} color="#131313" />
              <span className="max-w-[4.5em] truncate">{o.name}</span>
            </span>
          );
        }
        if (tone.channel === 'p5') {
          return (
            <span key={o.id} title={label} aria-label={label} className="inline-flex shrink-0 items-center gap-1 px-1.5 py-[2px] text-[9px] font-black" style={{ background: P5R.ink, color: P5R.white, clipPath: roughQuad(o.name.length + 0.6, 1.5) }}>
              <OrgEmblem id={o.emblem} size={10} color={P5R.red} />
              <span className="max-w-[4.5em] truncate">{o.name}</span>
            </span>
          );
        }
        return (
          <span key={o.id} title={label} aria-label={label} className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-[2px] text-[9px] font-black ${surface === 'night' ? 'bg-white/10 text-[#e6dcff]' : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300'}`}>
            <OrgEmblem id={o.emblem} size={10} />
            <span className="max-w-[4.5em] truncate">{o.name}</span>
          </span>
        );
      })}
    </>
  );
}
