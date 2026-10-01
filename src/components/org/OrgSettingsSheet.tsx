/**
 * 据点设置（第 7 轮 · PRD §12.5 / §12.9）。
 *   · 所有人：我的成员牌（换牌 / 改代号、展示哪几张面具——第 8 轮起最多 3 张）、屏蔽名单、据点守则、退出组织；
 *   · 队长：组织资料、换邀请码、成员（转让队长 / 请离）、解散组织（队长不能直接退出）。
 * 危险操作都先确认；转让时如果我已经加入了别的组织，说清楚「转让后会退出这里」。
 */
import { useEffect, useState } from 'react';
import { SheetModal } from '@/components/SheetModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAppStore } from '@/store';
import { useCloudSocialStore } from '@/store/cloudSocial';
import { ORG_EMBLEMS, ORG_MAX_SHOWN_MASKS, ORG_MOTTO_MAX, ORG_NAME_MAX, ORG_PRIVACY_NOTE, ORG_RULES, displayCodename, shownPersonas } from '@/utils/orgLogic';
import {
  dissolveFromUi, kickFromUi, leaveFromUi, rotateCodeFromUi, setMemberBlocked, setShownMasksFromUi,
  transferFromUi, transferMustLeave, updateOrgFromUi,
} from '@/services/orgSync';
import { slantClip } from '@/components/p3r/kit';
import { orgLevelOfView } from '@/utils/orgOps';
import { orgLevelName } from '@/utils/orgTitles';
import { roughQuad } from '@/components/p5r/kit';
import { OrgButton, OrgEmblem, useOrgTone } from './orgUi';
import type { AttributeId, OrgMember, OrgView } from '@/types';

const MASK_ATTRS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

type Confirm =
  | { kind: 'rotate' }
  | { kind: 'kick'; member: OrgMember }
  | { kind: 'transfer'; member: OrgMember }
  | { kind: 'leave' }
  | { kind: 'dissolve' };

const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export function OrgSettingsSheet({ view, open, onClose, onEditCard, onEditTitles, onGone }: {
  view: OrgView | undefined;
  open: boolean;
  onClose: () => void;
  onEditCard: () => void;
  /** 组织 P2：等级与称号（队长编辑、成员查看） */
  onEditTitles: () => void;
  /** 退出 / 解散 / 转让后退出：组织从本机拿掉了，页面该回羁绊页 */
  onGone: () => void;
}) {
  const tone = useOrgTone();
  const blocked = useCloudSocialStore(s => s.orgBlocked);
  const persona = useAppStore(s => s.persona);
  const attributes = useAppStore(s => s.attributes);
  const attrNames = useAppStore(s => s.settings.attributeNames);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [motto, setMotto] = useState('');
  const [emblem, setEmblem] = useState('star');
  const [rulesOpen, setRulesOpen] = useState(false);
  // 请离时顺手删掉 Ta 的动态和标签（默认勾上）
  const [kickPurge, setKickPurge] = useState(true);

  useEffect(() => {
    if (!open || !view) return;
    setError('');
    setInfo('');
    setEditing(false);
    setRulesOpen(false);
    setName(view.org.name);
    setMotto(view.org.motto);
    setEmblem(view.org.emblem);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!view) return null;
  const leader = view.org.leaderId === view.me.userId;
  const others = view.members.filter(m => m.id !== view.me.id);
  const blockedHere = others.filter(m => blocked.includes(m.userId));
  // 现在展示的几张（按顺序）；点一下加上 / 去掉，最多 3 张
  const shown = shownPersonas(view.me.card).map(p => p.attribute);
  const toggleMask = (a: AttributeId) => {
    const next = shown.includes(a) ? shown.filter(x => x !== a) : [...shown, a];
    if (next.length > ORG_MAX_SHOWN_MASKS) { setError(`最多展示 ${ORG_MAX_SHOWN_MASKS} 张：先去掉一张`); return; }
    void run(async () => { await setShownMasksFromUi(view.org.id, next); });
  };

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setInfo('');
    try { await fn(); } catch (e) { setError(errText(e, '出了点问题，稍后再试')); } finally { setBusy(false); }
  };

  const doConfirm = () => {
    const c = confirm;
    setConfirm(null);
    if (!c) return;
    void run(async () => {
      if (c.kind === 'rotate') { await rotateCodeFromUi(view.org.id); setInfo('换好了，旧码已经作废'); return; }
      if (c.kind === 'kick') {
        const rotated = await kickFromUi(view.org.id, c.member.id, kickPurge);
        setInfo(rotated ? `已请离「${displayCodename(c.member)}」，邀请码也换了新的` : `已请离「${displayCodename(c.member)}」；邀请码没换成，记得手动换一个`);
        return;
      }
      if (c.kind === 'transfer') {
        const leaving = transferMustLeave(view.org.id);
        await transferFromUi(view.org.id, c.member.id);
        if (leaving) { onGone(); return; }
        setInfo(`队长已经交给「${displayCodename(c.member)}」`);
        return;
      }
      if (c.kind === 'leave') { await leaveFromUi(view.org.id); onGone(); return; }
      await dissolveFromUi(view.org.id);
      onGone();
    });
  };

  const confirmText = (() => {
    if (!confirm) return { title: '', desc: '', ok: '', danger: false };
    if (confirm.kind === 'rotate') return { title: '换一个邀请码？', desc: '旧码会立即作废，已经在组织里的人不受影响。', ok: '换码', danger: false };
    if (confirm.kind === 'kick') return { title: `请「${displayCodename(confirm.member)}」离开？`, desc: '对方会从名册里消失；邀请码会一起换掉，旧码不能再用。', ok: '请离', danger: true };
    if (confirm.kind === 'transfer') {
      const leaving = transferMustLeave(view.org.id);
      return {
        title: `把队长交给「${displayCodename(confirm.member)}」？`,
        desc: leaving
          ? '你已经加入了另一个组织（每人最多加入一个），转让之后你会退出这里。'
          : '转让之后你是普通成员，改资料、换码、请离都由新队长来做。',
        ok: leaving ? '转让并退出' : '转让',
        danger: leaving,
      };
    }
    if (confirm.kind === 'leave') return { title: `退出「${view.org.name}」？`, desc: '你的成员牌会从名册里拿掉，你在这里分享的动态和贴的标签也会一起删除；以后想回来要重新拿邀请码。', ok: '退出', danger: true };
    return { title: `解散「${view.org.name}」？`, desc: '组织、名册会一起删除，所有成员都会收到「你已不在」的提示。这一步不能撤销。', ok: '解散', danger: true };
  })();

  const sectionTitle = (t: string) => <div className="mb-2 text-[12px] font-black tracking-wider text-gray-500 dark:text-gray-400">{t}</div>;
  const row = 'flex items-center justify-between gap-3 py-2';

  return (
    <>
      <SheetModal isOpen={open} onClose={onClose} title="据点设置" busy={busy} maxHeightClass="max-h-[88vh]">
        <div className="space-y-6 px-4 pb-6">
          {(error || info) && <p role={error ? 'alert' : 'status'} className={`text-[12px] font-bold leading-relaxed ${error ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>{error || info}</p>}

          <section>
            {sectionTitle('我的成员牌')}
            <div className={row}>
              <div className="min-w-0">
                <div className="text-[14px] font-black text-gray-900 dark:text-white">{displayCodename(view.me)}</div>
                <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">{view.me.tarotId ? '代表牌与代号' : '还没选代表牌'}</div>
              </div>
              <OrgButton small tone="ghost" onClick={onEditCard} disabled={busy}>{view.me.tarotId ? '修改' : '去选'}</OrgButton>
            </div>
            <div className="py-2">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-[14px] font-black text-gray-900 dark:text-white">在名册背面展示的面具</div>
                <div className="shrink-0 text-[11px] font-black tabular-nums text-gray-400">{shown.length} / {ORG_MAX_SHOWN_MASKS}</div>
              </div>
              <div className="text-[11px] font-semibold leading-relaxed text-gray-500 dark:text-gray-400">最多 {ORG_MAX_SHOWN_MASKS} 张。队友可以同调其中一张，在逆影战场里用（每周 3 场）。</div>
              {persona ? (
                <div className="mt-2 grid grid-cols-1 gap-1.5 min-[380px]:grid-cols-2">
                  {MASK_ATTRS.map((a, i) => {
                    const idx = shown.indexOf(a);
                    const on = idx >= 0;
                    const lv = attributes.find(x => x.id === a)?.level ?? 1;
                    const name = persona.attributePersonas?.[a]?.name || persona.name;
                    return (
                      <button
                        key={a}
                        type="button"
                        disabled={busy}
                        onClick={() => toggleMask(a)}
                        aria-pressed={on}
                        aria-label={`${name}（${attrNames[a] ?? a}）${on ? `，第 ${idx + 1} 张` : ''}`}
                        className="flex min-w-0 items-center gap-2 px-2.5 py-2 text-left disabled:opacity-50"
                        style={{
                          background: on ? tone.accent : 'rgba(127,127,127,0.10)',
                          color: on ? '#ffffff' : 'currentColor',
                          borderRadius: tone.channel === 'p3' || tone.channel === 'p5' ? 0 : 12,
                          clipPath: tone.channel === 'p3' ? slantClip(6) : tone.channel === 'p5' ? roughQuad(i + 3.4, 2.5) : undefined,
                        }}
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black" style={{ background: on ? 'rgba(255,255,255,0.28)' : 'rgba(127,127,127,0.18)' }}>{on ? idx + 1 : ''}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-black leading-tight">{name}</span>
                          <span className="block text-[10px] font-bold opacity-75">{attrNames[a] ?? a} · Lv.{lv}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-1.5 text-[12px] font-bold text-gray-500 dark:text-gray-400">还没有人格面具：先去逆影战场唤醒一张。</p>
              )}
            </div>
          </section>

          <section>
            {sectionTitle('等级与称号')}
            <div className={row}>
              <div className="min-w-0">
                <div className="truncate text-[14px] font-black text-gray-900 dark:text-white">据点 Lv.{orgLevelOfView(view).level} · {orgLevelName(view.org.custom, orgLevelOfView(view).level)}</div>
                <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">{leader ? '给每一级起名字、给称号改名、加自己的称号' : '每一级叫什么、每个称号怎么拿'}</div>
              </div>
              <OrgButton small tone="ghost" onClick={onEditTitles} disabled={busy}>{leader ? '编辑' : '查看'}</OrgButton>
            </div>
          </section>

          {leader && (
            <section>
              {sectionTitle('组织资料')}
              {!editing ? (
                <div className={row}>
                  <div className="flex min-w-0 items-center gap-2">
                    <OrgEmblem id={view.org.emblem} size={20} color={tone.channel === 'p5' ? '#c00008' : 'currentColor'} />
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-black text-gray-900 dark:text-white">{view.org.name}</div>
                      <div className="truncate text-[11px] font-semibold text-gray-500 dark:text-gray-400">{view.org.motto || '还没有口号'}</div>
                    </div>
                  </div>
                  <OrgButton small tone="ghost" onClick={() => setEditing(true)} disabled={busy}>修改</OrgButton>
                </div>
              ) : (
                <div className="space-y-3">
                  <input value={name} onChange={e => setName([...e.target.value].slice(0, ORG_NAME_MAX).join(''))} aria-label="组织名" className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-[15px] font-bold text-gray-900 outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                  <input value={motto} onChange={e => setMotto([...e.target.value].slice(0, ORG_MOTTO_MAX).join(''))} aria-label="口号" placeholder="口号（可以不写）" className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-[14px] font-semibold text-gray-900 outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                  <div className="grid grid-cols-6 gap-2">
                    {ORG_EMBLEMS.map(e => (
                      <button key={e.id} type="button" onClick={() => setEmblem(e.id)} aria-pressed={e.id === emblem} aria-label={`徽记：${e.label}`} className="flex aspect-square items-center justify-center rounded-xl" style={{ background: e.id === emblem ? tone.accent : 'rgba(127,127,127,0.10)', color: e.id === emblem ? '#ffffff' : 'currentColor' }}>
                        <OrgEmblem id={e.id} size={20} />
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2.5">
                    <OrgButton small tone="ghost" onClick={() => setEditing(false)} disabled={busy}>取消</OrgButton>
                    <OrgButton small onClick={() => void run(async () => { await updateOrgFromUi(view.org.id, { name, motto, emblem }); setEditing(false); setInfo('改好了'); })} disabled={busy || !name.trim()}>保存</OrgButton>
                  </div>
                </div>
              )}
              <div className={row}>
                <div className="min-w-0">
                  <div className="text-[14px] font-black text-gray-900 dark:text-white">换一个邀请码</div>
                  <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">码外传了、或者不想再有人加入时用</div>
                </div>
                <OrgButton small tone="ghost" onClick={() => setConfirm({ kind: 'rotate' })} disabled={busy}>换码</OrgButton>
              </div>
            </section>
          )}

          {leader && others.length > 0 && (
            <section>
              {sectionTitle('成员')}
              <ul className="divide-y divide-black/5 dark:divide-white/10">
                {others.map(m => (
                  <li key={m.id} className={row}>
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-black text-gray-900 dark:text-white">{String(m.seat).padStart(2, '0')} · {displayCodename(m)}</div>
                      <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">连续 {m.card.streak} 天</div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <OrgButton small tone="ghost" onClick={() => setConfirm({ kind: 'transfer', member: m })} disabled={busy}>转让</OrgButton>
                      <OrgButton small tone="danger" onClick={() => { setKickPurge(true); setConfirm({ kind: 'kick', member: m }); }} disabled={busy}>请离</OrgButton>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {blockedHere.length > 0 && (
            <section>
              {sectionTitle('屏蔽名单（只在本机生效）')}
              <ul>
                {blockedHere.map(m => (
                  <li key={m.id} className={row}>
                    <span className="truncate text-[14px] font-black text-gray-900 dark:text-white">{displayCodename(m)}</span>
                    <OrgButton small tone="ghost" onClick={() => setMemberBlocked(m.userId, false)}>解除</OrgButton>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <button type="button" onClick={() => setRulesOpen(v => !v)} className="flex w-full items-center justify-between py-1 text-left">
              <span className="text-[12px] font-black tracking-wider text-gray-500 dark:text-gray-400">据点守则 · 别人能看到什么</span>
              <span className="text-[12px] font-black text-gray-400">{rulesOpen ? '收起' : '展开'}</span>
            </button>
            {rulesOpen && (
              <>
                <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[12px] font-semibold leading-relaxed text-gray-700 dark:text-gray-200">
                  {ORG_RULES.map((r, i) => <li key={i}>{r}</li>)}
                </ol>
                <p className="mt-3 text-[12px] font-semibold leading-relaxed text-gray-500 dark:text-gray-400">{ORG_PRIVACY_NOTE}</p>
              </>
            )}
          </section>

          <section className="pt-1">
            {leader ? (
              <>
                <OrgButton tone="danger" onClick={() => setConfirm({ kind: 'dissolve' })} disabled={busy} className="w-full">解散组织</OrgButton>
                <p className="mt-2 text-[11px] font-semibold leading-relaxed text-gray-500 dark:text-gray-400">队长不能直接退出：先把队长转让给别人，或者解散组织。</p>
              </>
            ) : (
              <OrgButton tone="danger" onClick={() => setConfirm({ kind: 'leave' })} disabled={busy} className="w-full">退出组织</OrgButton>
            )}
          </section>
        </div>
      </SheetModal>

      <ConfirmDialog
        isOpen={!!confirm}
        title={confirmText.title}
        description={confirmText.desc}
        tone={confirmText.danger ? 'danger' : 'default'}
        confirmText={confirmText.ok}
        cancelText="取消"
        onConfirm={doConfirm}
        onCancel={() => setConfirm(null)}
      >
        {confirm?.kind === 'kick' && (
          <label className="mt-1 flex cursor-pointer items-center gap-2.5 rounded-xl bg-black/[0.04] px-3 py-2.5 text-left dark:bg-white/[0.06]">
            <input type="checkbox" checked={kickPurge} onChange={e => setKickPurge(e.target.checked)} className="h-4 w-4 shrink-0 accent-rose-500" />
            <span className="text-[13px] font-bold text-gray-800 dark:text-gray-100">同时删除 Ta 的动态和标签</span>
          </label>
        )}
      </ConfirmDialog>
    </>
  );
}
