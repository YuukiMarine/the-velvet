/**
 * 分享到据点（第 7 轮 7b · PRD §12.6 / §12.16）：记录页长按菜单里的「分享到据点」。
 *   选组织（加入了两个时）→ 预览（和公告板上长得一样：代号、那一句、加点小签）→ 改那一句（默认记录原文前 20 字）→ 分享。
 *   别人看到的只有这一句和加点小签，不带记录原文；同一个组织每人每天 3 条。
 *   分享完在弹窗里说一声，可以直接去据点的公告板看。
 */
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { useAppStore } from '@/store';
import { useCloudSocialStore } from '@/store/cloudSocial';
import { SheetModal } from '@/components/SheetModal';
import { tarotArtUrl } from '@/constants/tarotArt';
import { useTarotArtSet } from '@/ui/useTarotArtSet';
import { slantClip } from '@/components/p3r/kit';
import { roughQuad } from '@/components/p5r/kit';
import { getUserId } from '@/services/pocketbase';
import { refreshBoard, shareActivity } from '@/services/orgSync';
import {
  ORG_POSTS_PER_DAY, ORG_POST_TEXT_MAX, buildPostSnapshot, cleanSnapshotNames, defaultShareText, displayCodename, myPostsToday, tarotCardOf,
} from '@/utils/orgLogic';
import { SnapChip, snapChips } from './BoardSection';
import { EmblemBadge, OrgButton, OrgPanel, useOrgTone } from './orgUi';
import type { Activity } from '@/types';

const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export function ShareToOrgSheet({ activity, onClose }: { activity: Activity | null; onClose: () => void }) {
  const tone = useOrgTone();
  const set = useTarotArtSet();
  const orgs = useCloudSocialStore(s => s.orgs);
  const attributeNames = useAppStore(s => s.settings.attributeNames);
  const setCurrentPage = useAppStore(s => s.setCurrentPage);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ orgId: string; name: string } | null>(null);

  // 每次打开从头来：默认第一个组织（自建的排前面）、默认那一句
  useEffect(() => {
    if (!activity) return;
    setOrgId(orgs[0]?.org.id ?? null);
    setText(defaultShareText(activity.description));
    setBusy(false);
    setError('');
    setDone(null);
    // 顺手拉一次公告板：「今天还能分享几条」要算上别的设备今天分享的
    for (const v of orgs) void refreshBoard(v.org.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity?.id]);

  const view = orgs.find(v => v.org.id === orgId) ?? orgs[0];
  const snap = useMemo(
    () => (activity && view ? cleanSnapshotNames(buildPostSnapshot(activity, attributeNames, { codename: displayCodename(view.me), tarotId: view.me.tarotId })) : null),
    [activity, view, attributeNames],
  );
  const me = getUserId() ?? '';
  const left = view ? Math.max(0, ORG_POSTS_PER_DAY - myPostsToday(view.posts, me)) : 0;
  const len = [...text].length;
  const chips = snapChips(snap);
  const url = view?.me.tarotId ? tarotArtUrl(view.me.tarotId, set) : null;

  const submit = async () => {
    if (!activity || !view || busy) return;
    setBusy(true);
    setError('');
    try {
      await shareActivity(view.org.id, activity, text);
      setDone({ orgId: view.org.id, name: view.org.name });
    } catch (e) {
      setError(errText(e, '没分享出去，稍后再试'));
    } finally {
      setBusy(false);
    }
  };

  const goSee = () => {
    if (!done) return;
    const social = useCloudSocialStore.getState();
    social.setHideoutOrgId(done.orgId);
    social.setHideoutSection('board');
    onClose();
    setCurrentPage('hideout');
  };

  const footer = done ? (
    <div className="flex gap-2.5 px-4 pb-3 pt-2">
      <OrgButton tone="ghost" onClick={onClose}>好</OrgButton>
      <OrgButton onClick={goSee} className="flex-1">去公告板看看</OrgButton>
    </div>
  ) : (
    <div className="px-4 pb-3 pt-2">
      <OrgButton onClick={submit} disabled={busy || !view || !text.trim() || left <= 0} className="w-full">{busy ? '分享中…' : left <= 0 ? '今天的 3 条用完了' : '分享'}</OrgButton>
    </div>
  );

  return (
    <SheetModal isOpen={!!activity} onClose={onClose} title={done ? '分享好了' : '分享到据点'} busy={busy} footer={footer} maxHeightClass="max-h-[88vh]">
      <div className="space-y-4 px-4 pb-4">
        {done ? (
          <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center py-4 text-center">
            {view && <EmblemBadge id={view.org.emblem} size={64} />}
            <div className="mt-3 text-[18px] font-black text-gray-900 dark:text-white" style={{ fontFamily: tone.titleFont }}>已分享到「{done.name}」</div>
            <div className="mt-1 text-[12px] font-semibold text-gray-500 dark:text-gray-400">大家打开据点的公告板就能看到，可以给你贴标签打气。</div>
          </motion.div>
        ) : (
          <>
            {orgs.length > 1 && (
              <div>
                <div className="mb-1.5 text-[12px] font-black text-gray-600 dark:text-gray-300">分享到</div>
                <div className="grid grid-cols-2 gap-2">
                  {orgs.map((v, i) => {
                    const on = v.org.id === view?.org.id;
                    return (
                      <button
                        key={v.org.id}
                        type="button"
                        onClick={() => { setOrgId(v.org.id); setError(''); }}
                        aria-pressed={on}
                        className="flex min-w-0 items-center gap-2 px-2.5 py-2 text-left"
                        style={{
                          background: on ? tone.accent : 'rgba(127,127,127,0.10)',
                          color: on ? '#ffffff' : 'inherit',
                          borderRadius: tone.channel === 'p3' || tone.channel === 'p5' ? 0 : 12,
                          clipPath: tone.channel === 'p3' ? slantClip(6) : tone.channel === 'p5' ? roughQuad(i + 1.4, 2.5) : undefined,
                        }}
                      >
                        <EmblemBadge id={v.org.emblem} size={26} />
                        <span className="min-w-0 truncate text-[13px] font-black">{v.org.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="text-[12px] font-black text-gray-600 dark:text-gray-300">说一句</span>
                <span className={`text-[11px] font-bold tabular-nums ${len >= ORG_POST_TEXT_MAX ? 'text-rose-500' : 'text-gray-400'}`}>{len} / {ORG_POST_TEXT_MAX}</span>
              </div>
              <input
                value={text}
                onChange={e => { setText([...e.target.value].slice(0, ORG_POST_TEXT_MAX).join('')); setError(''); }}
                aria-label="分享的那一句"
                placeholder="比如：跑完了第一个五公里"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-[15px] font-bold text-gray-900 outline-none focus:border-indigo-400 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>

            {view && (
              <div>
                <div className="mb-1.5 text-[12px] font-black text-gray-600 dark:text-gray-300">大家会看到</div>
                <OrgPanel padded={false} seed={63} className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="relative block h-[42px] w-[26px] shrink-0 overflow-hidden" style={{ background: tarotCardOf(view.me.tarotId)?.accent ?? 'rgba(127,127,127,0.2)', borderRadius: tone.channel === 'p4' ? 5 : tone.channel === 'neutral' ? 4 : 0, clipPath: tone.channel === 'p5' ? roughQuad(0.4, 1.5) : undefined, boxShadow: tone.channel === 'p4' ? '0 0 0 1.5px #131313' : undefined }}>
                      {url && <img src={url} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-black" style={{ fontFamily: tone.titleFont }}>{displayCodename(view.me)}</div>
                      <div className="text-[10px] font-bold" style={{ color: tone.sub }}>刚刚</div>
                    </div>
                  </div>
                  <div className="mt-2 min-h-[1.4em] break-words text-[17px] font-black leading-snug" style={{ fontFamily: tone.titleFont, color: text.trim() ? undefined : tone.sub }}>{text.trim() || '（写一句）'}</div>
                  {chips.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {chips.map((c, i) => <SnapChip key={i} tone={tone}>{c}</SnapChip>)}
                    </div>
                  )}
                </OrgPanel>
              </div>
            )}

            <p className="text-[11px] font-semibold leading-relaxed text-gray-500 dark:text-gray-400">
              只分享这一句和加点，不带记录原文。{view ? (left > 0 ? `今天还能在「${view.org.name}」分享 ${left} 条。` : `今天在「${view.org.name}」已经分享了 ${ORG_POSTS_PER_DAY} 条，明天再来。`) : ''}
            </p>
            {error && <p role="alert" className="text-[12px] font-bold leading-relaxed text-rose-500">{error}</p>}
          </>
        )}
      </div>
    </SheetModal>
  );
}
