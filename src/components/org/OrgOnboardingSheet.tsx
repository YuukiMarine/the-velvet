/**
 * 建立 / 加入组织的引导（第 7 轮 · PRD §12.4 / §12.5 / §12.9），以及「改我的成员牌」。
 *   create：守则（第一次）→ 组织资料 → 选代表牌 + 定代号 → 入队仪式 → 进据点
 *   join  ：守则（第一次）→ 输邀请码 → 预览组织 → 加入 → 选代表牌 + 定代号 → 入队仪式 → 进据点
 *   card  ：只改代表牌与代号（据点里「我的牌」）
 * 建好 / 加入之后中途关掉也不要紧：组织已经在了，据点里会提示「还没选代表牌」。
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useAppStore } from '@/store';
import { useCloudSocialStore } from '@/store/cloudSocial';
import { SheetModal } from '@/components/SheetModal';
import { MAJOR_ARCANA } from '@/constants/tarot';
import { tarotArtUrl } from '@/constants/tarotArt';
import { useTarotArtSet } from '@/ui/useTarotArtSet';
import { useBoldness } from '@/utils/boldness';
import { zClass } from '@/utils/zIndex';
import { P3R, slantClip } from '@/components/p3r/kit';
import { P5R, P5_TITLE_FONT, P5Star, roughQuad } from '@/components/p5r/kit';
import { P4Sparkle } from '@/ui/p4Kit';
import {
  ORG_CODENAME_MAX, ORG_EMBLEMS, ORG_MOTTO_MAX, ORG_NAME_MAX, ORG_PRIVACY_NOTE, ORG_RULES,
  formatInviteCode, isInviteCode, normalizeInviteInput, takenTarots, tarotCardOf,
} from '@/utils/orgLogic';
import {
  acceptOrgRules, createOrgFromUi, joinOrgFromUi, orgRulesAccepted, previewOrg, saveMyCardFromUi,
} from '@/services/orgSync';
import { EmblemBadge, OrgButton, OrgEmblem, useOrgTone } from './orgUi';
import type { Org, OrgCodenameKind } from '@/types';

export type OnboardingMode = 'create' | 'join' | 'card';
type Step = 'rules' | 'form' | 'code' | 'preview' | 'card';

const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export function OrgOnboardingSheet({ mode, orgId: editOrgId, onClose, onDone }: {
  mode: OnboardingMode | null;
  /** card 模式：改哪个组织里的牌 */
  orgId?: string;
  onClose: () => void;
  onDone: (orgId: string) => void;
}) {
  const tone = useOrgTone();
  const nickname = useAppStore(s => s.user?.name ?? '');
  const orgs = useCloudSocialStore(s => s.orgs);
  const [step, setStep] = useState<Step>('form');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // 建立
  const [name, setName] = useState('');
  const [motto, setMotto] = useState('');
  const [emblem, setEmblem] = useState<string>('star');
  // 加入
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<Org | null>(null);
  // 选牌
  const [orgId, setOrgId] = useState<string | null>(null);
  const [tarotId, setTarotId] = useState('');
  const [kind, setKind] = useState<OrgCodenameKind>('nickname');
  const [custom, setCustom] = useState('');
  // 仪式
  const [ritual, setRitual] = useState<{ orgId: string; orgName: string; emblem: string; tarotId: string; codename: string } | null>(null);

  // 每次打开从头来
  useEffect(() => {
    if (!mode) return;
    setBusy(false);
    setError('');
    setPreview(null);
    if (mode === 'card') {
      const v = orgs.find(x => x.org.id === editOrgId);
      setOrgId(editOrgId ?? null);
      setTarotId(v?.me.tarotId ?? '');
      setKind(v?.me.codenameKind ?? 'nickname');
      setCustom(v?.me.codenameKind === 'custom' ? v.me.codename : '');
      setStep('card');
      return;
    }
    setOrgId(null);
    setTarotId('');
    setKind('nickname');
    setCustom('');
    setName('');
    setMotto('');
    setEmblem('star');
    setCode('');
    setStep(orgRulesAccepted() ? (mode === 'create' ? 'form' : 'code') : 'rules');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const view = orgs.find(x => x.org.id === orgId);
  const taken = useMemo(() => (view ? takenTarots(view.members, view.me.userId) : new Set<string>()), [view]);
  const codenamePreview = kind === 'tarot' ? (tarotCardOf(tarotId)?.name ?? '（先选一张牌）') : kind === 'nickname' ? ([...nickname.trim()].slice(0, ORG_CODENAME_MAX).join('') || '（还没有昵称）') : (custom.trim() || '（写一个代号）');

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try { await fn(); } catch (e) { setError(errText(e, '出了点问题，稍后再试')); } finally { setBusy(false); }
  };

  const doCreate = () => run(async () => {
    const id = await createOrgFromUi({ name, motto, emblem });
    setOrgId(id);
    setStep('card');
  });
  const doLookup = () => run(async () => {
    const org = await previewOrg(code);
    if (!org) throw new Error('邀请码不对，或者组织已经换了新码');
    setPreview(org);
    setStep('preview');
  });
  const doJoin = () => run(async () => {
    const id = await joinOrgFromUi(code);
    setOrgId(id);
    setStep('card');
  });
  const doSaveCard = () => run(async () => {
    if (!orgId) throw new Error('找不到这个组织了');
    if (!tarotId) throw new Error('选一张代表牌');
    if (kind === 'custom' && !custom.trim()) throw new Error('写一个代号');
    await saveMyCardFromUi(orgId, { tarotId, codenameKind: kind, codename: custom });
    if (mode === 'card') { onDone(orgId); return; }
    const v = useCloudSocialStore.getState().orgs.find(x => x.org.id === orgId);
    setRitual({ orgId, orgName: v?.org.name ?? '', emblem: v?.org.emblem ?? 'star', tarotId, codename: v ? codenamePreview : '' });
  });

  const titles: Record<Step, string> = {
    rules: '据点守则',
    form: '建立组织',
    code: '加入组织',
    preview: '加入组织',
    card: mode === 'card' ? '我的成员牌' : '选一张代表牌',
  };

  const footer = (() => {
    if (step === 'rules') return <OrgButton onClick={() => { acceptOrgRules(); setStep(mode === 'create' ? 'form' : 'code'); }} className="w-full">同意并继续</OrgButton>;
    if (step === 'form') return <OrgButton onClick={doCreate} disabled={busy || !name.trim()} className="w-full">{busy ? '建立中…' : '建立组织'}</OrgButton>;
    if (step === 'code') return <OrgButton onClick={doLookup} disabled={busy || !isInviteCode(normalizeInviteInput(code))} className="w-full">{busy ? '查找中…' : '查找'}</OrgButton>;
    if (step === 'preview') {
      return (
        <div className="flex gap-2.5">
          <OrgButton tone="ghost" onClick={() => { setStep('code'); setError(''); }} disabled={busy}>换个码</OrgButton>
          <OrgButton onClick={doJoin} disabled={busy} className="flex-1">{busy ? '加入中…' : '加入'}</OrgButton>
        </div>
      );
    }
    return <OrgButton onClick={doSaveCard} disabled={busy || !tarotId} className="w-full">{busy ? '保存中…' : mode === 'card' ? '保存' : '放进名册'}</OrgButton>;
  })();

  return (
    <>
      <SheetModal
        isOpen={!!mode && !ritual}
        onClose={onClose}
        title={titles[step]}
        busy={busy}
        footer={<div className="px-4 pb-3 pt-2">{footer}</div>}
        maxHeightClass="max-h-[88vh]"
      >
        <div className="space-y-4 px-4 pb-4">
          {step === 'rules' && (
            <div className="space-y-3">
              <p className="text-[13px] font-semibold leading-relaxed text-gray-600 dark:text-gray-300">组织是一小群人互相看见、互相打气的地方。第一次建立或加入之前，先读一下这几条：</p>
              <ol className="space-y-2">
                {ORG_RULES.map((r, i) => (
                  <li key={i} className="flex gap-2.5 text-[13px] font-semibold leading-relaxed text-gray-800 dark:text-gray-100">
                    <span className="mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center text-[11px] font-black text-white" style={{ background: tone.accent, borderRadius: tone.channel === 'p3' ? 0 : 999, clipPath: tone.channel === 'p3' ? slantClip(3) : tone.channel === 'p5' ? roughQuad(i + 1.3, 2) : undefined }}>{i + 1}</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {step === 'form' && (
            <>
              <Field label="组织名" count={`${[...name].length} / ${ORG_NAME_MAX}`}>
                <input value={name} onChange={e => setName([...e.target.value].slice(0, ORG_NAME_MAX).join(''))} placeholder="比如：夜读小队" className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-[15px] font-bold text-gray-900 outline-none focus:border-indigo-400 dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
              </Field>
              <Field label="口号（可以不写）" count={`${[...motto].length} / ${ORG_MOTTO_MAX}`}>
                <input value={motto} onChange={e => setMotto([...e.target.value].slice(0, ORG_MOTTO_MAX).join(''))} placeholder="一句大家都认的话" className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-[14px] font-semibold text-gray-900 outline-none focus:border-indigo-400 dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
              </Field>
              <Field label="徽记">
                <div className="grid grid-cols-6 gap-2">
                  {ORG_EMBLEMS.map(e => {
                    const on = e.id === emblem;
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => setEmblem(e.id)}
                        aria-pressed={on}
                        aria-label={`徽记：${e.label}`}
                        className="flex aspect-square items-center justify-center transition-transform"
                        style={{
                          background: on ? tone.accent : 'rgba(127,127,127,0.10)',
                          color: on ? '#ffffff' : 'currentColor',
                          borderRadius: tone.channel === 'p3' ? 0 : tone.channel === 'p5' ? 0 : 14,
                          clipPath: tone.channel === 'p3' ? slantClip(5) : tone.channel === 'p5' ? roughQuad(e.id.length + 2.1, 3) : undefined,
                          transform: on ? 'scale(1.06)' : undefined,
                        }}
                      >
                        <OrgEmblem id={e.id} size={22} />
                      </button>
                    );
                  })}
                </div>
              </Field>
              <p className="text-[11px] font-semibold leading-relaxed text-gray-500 dark:text-gray-400">建好之后你是队长，坐 1 号座位；把邀请码发给朋友，最多 7 个人。每人最多自建一个、加入一个组织。</p>
              <p className="text-[11px] font-semibold leading-relaxed text-gray-500 dark:text-gray-400">{ORG_PRIVACY_NOTE}</p>
            </>
          )}

          {step === 'code' && (
            <>
              <Field label="邀请码">
                <input
                  value={code}
                  onChange={e => setCode(normalizeInviteInput(e.target.value).slice(0, 8))}
                  inputMode="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="8 位字母和数字"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-center font-mono text-[22px] font-black tracking-[0.35em] text-gray-900 outline-none focus:border-indigo-400 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </Field>
              <p className="text-[11px] font-semibold leading-relaxed text-gray-500 dark:text-gray-400">邀请码在队长的据点页底部。码里没有 0、O、1、I，看着像的都按别的字母输。</p>
            </>
          )}

          {step === 'preview' && preview && (
            <div className="flex flex-col items-center py-2 text-center">
              <EmblemBadge id={preview.emblem} size={72} />
              <div className="mt-3 text-[22px] font-black text-gray-900 dark:text-white" style={{ fontFamily: tone.titleFont }}>{preview.name}</div>
              {preview.motto && <div className="mt-1 text-[13px] font-semibold text-gray-500 dark:text-gray-400">「{preview.motto}」</div>}
              <div className="mt-3 font-mono text-[12px] font-black tracking-[0.2em] text-gray-400">{formatInviteCode(preview.inviteCode)}</div>
              <p className="mt-3 text-[11px] font-semibold leading-relaxed text-gray-500 dark:text-gray-400">{ORG_PRIVACY_NOTE}</p>
            </div>
          )}

          {step === 'card' && (
            <>
              <Field label="代表牌" count="同一组织里每张只能一个人">
                <TarotGrid value={tarotId} taken={taken} onPick={setTarotId} />
              </Field>
              <Field label="代号">
                <div className="grid grid-cols-3 gap-2">
                  {([['nickname', '用昵称'], ['tarot', '用牌名'], ['custom', '自己写']] as const).map(([k, label]) => {
                    const on = kind === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setKind(k)}
                        aria-pressed={on}
                        className="py-2 text-[13px] font-black"
                        style={{
                          background: on ? tone.accent : 'rgba(127,127,127,0.10)',
                          color: on ? '#ffffff' : 'currentColor',
                          borderRadius: tone.channel === 'p3' || tone.channel === 'p5' ? 0 : 12,
                          clipPath: tone.channel === 'p3' ? slantClip(6) : tone.channel === 'p5' ? roughQuad(k.length + 0.4, 2.5) : undefined,
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                {kind === 'custom' && (
                  <input value={custom} onChange={e => setCustom([...e.target.value].slice(0, ORG_CODENAME_MAX).join(''))} placeholder={`最多 ${ORG_CODENAME_MAX} 个字`} className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-[15px] font-bold text-gray-900 outline-none focus:border-indigo-400 dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                )}
                <div className="mt-2 text-[12px] font-bold text-gray-500 dark:text-gray-400">名册上显示为：<span className="text-gray-900 dark:text-white">{codenamePreview}</span></div>
              </Field>
            </>
          )}

          {error && <p role="alert" className="text-[12px] font-bold leading-relaxed text-rose-500">{error}</p>}
        </div>
      </SheetModal>

      <JoinRitual
        data={ritual}
        onDone={() => {
          const id = ritual?.orgId;
          setRitual(null);
          if (id) onDone(id);
        }}
      />
    </>
  );
}

function Field({ label, count, children }: { label: string; count?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-black text-gray-600 dark:text-gray-300">{label}</span>
        {count && <span className="text-[11px] font-bold tabular-nums text-gray-400">{count}</span>}
      </div>
      {children}
    </div>
  );
}

/** 22 张大阿卡纳：已被别人占的灰掉 */
function TarotGrid({ value, taken, onPick }: { value: string; taken: Set<string>; onPick: (id: string) => void }) {
  const set = useTarotArtSet();
  const tone = useOrgTone();
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
      {MAJOR_ARCANA.map(c => {
        const on = c.id === value;
        const off = taken.has(c.id);
        const url = tarotArtUrl(c.id, set);
        return (
          <button
            key={c.id}
            type="button"
            disabled={off}
            onClick={() => onPick(c.id)}
            aria-pressed={on}
            aria-label={`${c.name}${off ? '（已有人持有）' : ''}`}
            className="relative overflow-hidden text-left disabled:cursor-not-allowed"
            style={{ aspectRatio: '1 / 1.6', borderRadius: tone.channel === 'p4' ? 10 : tone.channel === 'neutral' ? 8 : 0, outline: on ? `3px solid ${tone.accent}` : undefined, outlineOffset: 1 }}
          >
            {url ? <img src={url} alt="" loading="lazy" draggable={false} className="absolute inset-0 h-full w-full object-cover" style={{ filter: off ? 'grayscale(1) brightness(0.55)' : undefined }} /> : <span className="absolute inset-0" style={{ background: c.accent }} />}
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1 pb-1 pt-4 text-center text-[10px] font-black leading-none text-white">{c.name}</span>
            {off && <span className="absolute inset-x-0 top-1/3 text-center text-[10px] font-black text-white/90">有人了</span>}
            {on && <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-black text-white" style={{ background: tone.accent }}>✓</span>}
          </button>
        );
      })}
    </div>
  );
}

// ── 入队仪式 ─────────────────────────────────────────────────────────────────

const RITUAL_MS = 1900;

/** 牌「落」进名册：蓝盖章、黄贴纸、红预告信、中性光晕。点一下跳过 */
function JoinRitual({ data, onDone }: { data: { orgName: string; emblem: string; tarotId: string; codename: string } | null; onDone: () => void }) {
  const tone = useOrgTone();
  const set = useTarotArtSet();
  const anim = useBoldness();
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(onDone, anim ? RITUAL_MS : 1100);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  const url = data ? tarotArtUrl(data.tarotId, set) : null;
  const card = tarotCardOf(data?.tarotId);
  const bg = tone.channel === 'p3' ? 'radial-gradient(circle at 50% 42%, #1b57ff 0%, #0a2f9e 45%, #061847 100%)'
    : tone.channel === 'p4' ? 'var(--p4-stage, #ffd900)'
      : tone.channel === 'p5' ? '#000000'
        : 'radial-gradient(circle at 50% 42%, rgba(99,102,241,0.55) 0%, rgba(17,24,39,0.96) 70%)';
  const line = tone.channel === 'p4' ? `今天起，你是「${data?.orgName}」的一员` : tone.channel === 'p5' ? `「${data?.orgName}」收下了你的名字` : `欢迎加入「${data?.orgName}」`;

  return createPortal(
    <AnimatePresence>
      {data && (
        <motion.div
          key="ritual"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={`fixed inset-0 ${zClass.celebration} flex flex-col items-center justify-center overflow-hidden`}
          style={{ background: bg }}
          onClick={onDone}
          role="dialog"
          aria-label={line}
        >
          {/* 背景：蓝＝斜光带，黄＝太阳放射，红＝两道红斜刀 */}
          {tone.channel === 'p3' && (
            <>
              {/* 旋转交给 motion 的 rotate：写成 CSS transform 会被位移动画整个覆盖掉 */}
              <motion.span aria-hidden className="absolute -inset-x-20 top-[30%] h-24" style={{ background: 'rgba(53,209,232,0.18)', rotate: -14 }} initial={{ x: '-60%' }} animate={{ x: '0%' }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} />
              <motion.span aria-hidden className="absolute -inset-x-20 top-[58%] h-10" style={{ background: 'rgba(240,65,127,0.22)', rotate: -14 }} initial={{ x: '60%' }} animate={{ x: '0%' }} transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }} />
            </>
          )}
          {tone.channel === 'p4' && (
            <motion.svg aria-hidden viewBox="-100 -100 200 200" className="absolute h-[160vmax] w-[160vmax]" initial={{ rotate: -8, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} transition={{ duration: 0.8 }}>
              {Array.from({ length: 16 }, (_, i) => (
                <path key={i} d="M0 0 L-9 -100 L9 -100 Z" fill={i % 2 ? 'rgba(249,161,27,0.35)' : 'rgba(255,255,255,0.35)'} transform={`rotate(${i * 22.5})`} />
              ))}
            </motion.svg>
          )}
          {tone.channel === 'p5' && (
            <>
              <motion.span aria-hidden className="absolute left-[-20%] top-[22%] h-16 w-[140%]" style={{ background: P5R.red, rotate: -18 }} initial={{ x: '-100%' }} animate={{ x: '0%' }} transition={{ duration: 0.35, ease: 'easeOut' }} />
              <motion.span aria-hidden className="absolute left-[-20%] top-[64%] h-8 w-[140%]" style={{ background: P5R.red, rotate: -18 }} initial={{ x: '100%' }} animate={{ x: '0%' }} transition={{ duration: 0.35, delay: 0.12, ease: 'easeOut' }} />
              <P5Star size={260} fill="#1a1a1a" rot={12} className="absolute" style={{ left: '50%', top: '40%', marginLeft: -130, marginTop: -130 }} />
            </>
          )}

          {/* 牌 */}
          <motion.div
            className="relative"
            style={{ width: 150, height: 240 }}
            initial={anim ? (tone.channel === 'p5' ? { x: -260, rotate: -24, opacity: 0 } : tone.channel === 'p4' ? { y: -320, rotate: 8, opacity: 0 } : { y: 120, scale: 0.7, opacity: 0 }) : { opacity: 0 }}
            animate={tone.channel === 'p5' ? { x: 0, rotate: -5, opacity: 1 } : tone.channel === 'p4' ? { y: 0, rotate: -4, opacity: 1 } : { y: 0, scale: 1, opacity: 1 }}
            transition={tone.channel === 'p4' ? { type: 'spring', stiffness: 260, damping: 14 } : { type: 'spring', stiffness: 220, damping: 20 }}
          >
            <div
              className="absolute inset-0 overflow-hidden"
              style={{
                borderRadius: tone.channel === 'p4' ? 14 : tone.channel === 'neutral' ? 12 : 0,
                clipPath: tone.channel === 'p5' ? roughQuad(7.3, 5) : tone.channel === 'p3' ? slantClip(10) : undefined,
                boxShadow: tone.channel === 'p4' ? '0 0 0 4px #131313, 0 8px 0 4px rgba(19,19,19,0.3)' : '0 24px 60px rgba(0,0,0,0.5)',
                background: card?.accent ?? '#333',
              }}
            >
              {url && <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 pb-2 pt-8 text-center">
                <div className="text-[15px] font-black text-white" style={{ fontFamily: tone.titleFont }}>{data.codename}</div>
              </div>
            </div>

            {/* 落章 */}
            {tone.channel === 'p3' && (
              <motion.div
                className="absolute -right-10 -top-4 px-4 py-2 text-[18px] font-black italic text-white"
                style={{ background: P3R.blue, clipPath: slantClip(12), boxShadow: '0 8px 20px rgba(0,0,0,0.35)' }}
                initial={anim ? { scale: 2.2, rotate: -8, opacity: 0 } : false}
                animate={{ scale: 1, rotate: -8, opacity: 1 }}
                transition={{ delay: 0.55, type: 'spring', stiffness: 520, damping: 22 }}
              >
                ENROLLED
                <span aria-hidden className="absolute bottom-0 right-3 h-[7px] w-[18px]" style={{ background: P3R.magenta, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
              </motion.div>
            )}
            {tone.channel === 'p4' && [[-52, -26, 22], [118, 10, 18], [-40, 200, 16], [128, 178, 24]].map(([x, y, s], i) => (
              <motion.span key={i} className="absolute" style={{ left: x, top: y }} initial={anim ? { scale: 0, rotate: -40 } : false} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.5 + i * 0.08, type: 'spring', stiffness: 500, damping: 16 }}>
                <P4Sparkle size={s} color={i % 2 ? '#ffffff' : 'var(--p4-orange, #f9a11b)'} />
              </motion.span>
            ))}
            {tone.channel === 'p5' && (
              <motion.div
                className="absolute -left-12 -top-6 px-4 py-2 text-[15px] font-black"
                style={{ background: P5R.paper, color: P5R.ink, clipPath: roughQuad(3.7, 4), fontFamily: P5_TITLE_FONT, boxShadow: '4px 5px 0 #c00008' }}
                initial={anim ? { scale: 1.8, rotate: 10, opacity: 0 } : false}
                animate={{ scale: 1, rotate: -6, opacity: 1 }}
                transition={{ delay: 0.45, type: 'spring', stiffness: 480, damping: 20 }}
              >
                WELCOME TO THE HIDEOUT
              </motion.div>
            )}
            {tone.channel === 'neutral' && (
              <motion.div className="absolute -top-8 left-1/2 -ml-6" initial={anim ? { y: 10, opacity: 0 } : false} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 }}>
                <EmblemBadge id={data.emblem} size={48} />
              </motion.div>
            )}
          </motion.div>

          <motion.div
            className="relative mt-12 px-6 text-center text-[17px] font-black"
            style={{ color: tone.channel === 'p4' ? 'var(--ui-ink, #131313)' : '#ffffff', fontFamily: tone.titleFont }}
            initial={anim ? { y: 12, opacity: 0 } : false}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.75 }}
          >
            {line}
          </motion.div>
          <div className="absolute bottom-10 text-[11px] font-bold" style={{ color: tone.channel === 'p4' ? 'rgba(19,19,19,0.55)' : 'rgba(255,255,255,0.55)' }}>点一下继续</div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
