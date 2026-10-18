/**
 * revealJobs — 区层显形 / 伪神显形的「后台任务」（v2.7.0.6）。
 *
 * 和 tarotJobs / summaryJobs 一个路子：请求提到模块级，仪式弹层只订阅。
 * 之前仪式跑在组件里且走非流式（90 秒硬超时），深思熟虑档思考两三分钟必超时，
 * 三级重试再各等 90 秒——用户看到的是转圈四分半后报错。现在：
 *   - 流式（思维链增量续命，超时只算空闲）；滚动预览喂的是 shown（思维链 + 正文）；
 *   - 30 秒后仪式卡露出「转到后台」，关掉弹层任务照跑，回来（或战场页自动拉起）再放显形动画；
 *   - JSON 被截断 → 'truncated' 态，仪式卡出「让它说完」，从半截续；
 *   - 成功后自己落库（revealStratum / revealFinalBoss），弹层只负责放音效与演出。
 */
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore } from '@/store';
import type { AttributeId, Settings, Shadow } from '@/types';
import { SHADOW_LEVEL_CONFIG } from '@/constants';
import { BOSS_ATTACK_BY_LEVEL } from '@/battle/numbers';
import { aiConfigLabel, getDeliberateAIConfig, type AIConfig } from '@/utils/aiClient';
import {
  prepareStratumReveal, completeStratumReveal, prepareFinalBoss, completeFinalBoss, JSONTruncatedError,
  type PreparedStratumReveal, type PreparedFinalBoss, type StratumRevealData, type FinalBossFacts,
} from '@/utils/battleAI';
import { registerAIJobSource, revealJobViews, revealJobLive } from '@/utils/aiJobs';

export type RevealStatus = 'running' | 'done' | 'truncated' | 'error';

interface RevealBase {
  id: string;
  status: RevealStatus;
  startedAt: number;
  /** 显示用累计文本（思维链 + 正文），喂 LiveStreamPreview */
  shown: string;
  error?: string;
  /** 截断时的半截 JSON，续写用 */
  partial?: string;
  /** 续写次数（上限 REVEAL_RESUME_LIMIT） */
  resumes: number;
  /** 这一发实际用的模型（「服务商 · 模型」）：报错时写给用户看，好知道去改哪一档（第 16 批） */
  modelLabel?: string;
  attrNames: Record<AttributeId, string>;
}

export interface StratumJob extends RevealBase {
  level: number;
  prepared: PreparedStratumReveal;
  themeAttribute: AttributeId;
  answers: string[];
  result?: { name: string; weakAttribute: AttributeId };
}

export interface FinalJob extends RevealBase {
  prepared: PreparedFinalBoss;
  result?: { name: string; flawTitle: string; verdict: string; weak: AttributeId };
}

interface State {
  stratum: StratumJob | null;
  final: FinalJob | null;
}

export const REVEAL_RESUME_LIMIT = 3;
/** 生成阶段多久之后露出「转到后台 / 改用手动」 */
export const REVEAL_EXIT_AFTER_MS = 30_000;

export const useRevealJobs = create<State>(() => ({ stratum: null, final: null }));

const controllers: { stratum?: AbortController; final?: AbortController } = {};

// ── 落盘续跑（第 27 批 ⑤，照 moonJob / tarot pending 的路子）────────────────────────────────
// 开跑就把提示词（里面写着弱点名，不能重掷）和材料落 localStorage，正文每隔几百毫秒把写到哪也记一笔；
// App 生成到一半被杀，下次打开 restoreRevealJobs 按盘上的东西把任务接回内存：有半截 → 'truncated'（仪式卡出「让它说完」），
// 没半截 → 'error'（出「重试」，同一份提示词）。写完 / 取消 / 演出放完就清。不存 cfg：每一发按当前设置取连接（见 withCurrentModel）。
const STRATUM_KEY = 'velvet:revealJob.stratum.v1';
const FINAL_KEY = 'velvet:revealJob.final.v1';
/** 一周前的半截不再接：那时的塔早就不是这个样子了 */
const RECORD_TTL_MS = 7 * 86400_000;

interface StratumRecord {
  id: string; level: number; prompt: string; weakAttribute: AttributeId; themeAttribute: AttributeId; answers: string[];
  partial?: string; resumes: number; startedAt: number;
}
interface FinalRecord { id: string; prompt: string; strongest: AttributeId; partial?: string; resumes: number; startedAt: number }

const readRecord = <T,>(key: string): T | null => {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
};
const writeRecord = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 隐私模式 / 配额满：降级为不可续跑 */ } };
const clearRecord = (key: string) => { try { localStorage.removeItem(key); } catch { /* 同上 */ } };

/** 按内存里的任务写一份（done / 没任务就清） */
function saveStratumRecord(partialOverride?: string): void {
  const j = useRevealJobs.getState().stratum;
  if (!j || j.status === 'done') { clearRecord(STRATUM_KEY); return; }
  const prevPartial = readRecord<StratumRecord>(STRATUM_KEY)?.partial;
  writeRecord(STRATUM_KEY, {
    id: j.id, level: j.level, prompt: j.prepared.prompt, weakAttribute: j.prepared.weakAttribute, themeAttribute: j.themeAttribute, answers: j.answers,
    partial: partialOverride ?? j.partial ?? prevPartial, resumes: j.resumes, startedAt: j.startedAt,
  } satisfies StratumRecord);
}
function saveFinalRecord(partialOverride?: string): void {
  const j = useRevealJobs.getState().final;
  if (!j || j.status === 'done') { clearRecord(FINAL_KEY); return; }
  const prevPartial = readRecord<FinalRecord>(FINAL_KEY)?.partial;
  writeRecord(FINAL_KEY, {
    id: j.id, prompt: j.prepared.prompt, strongest: j.prepared.strongest,
    partial: partialOverride ?? j.partial ?? prevPartial, resumes: j.resumes, startedAt: j.startedAt,
  } satisfies FinalRecord);
}
/** 正文写到哪记一笔（battleAI 每 ~400ms 回调一次；空串 = 模型重开了，半截作废） */
const notePartial = (key: string, content: string) => {
  const rec = readRecord<StratumRecord | FinalRecord>(key);
  if (!rec) return;
  writeRecord(key, { ...rec, partial: content.trim() ? content : undefined });
};

/**
 * 开机接回：盘上有上次没写完的显形、而且塔现在正等着它（区层：下一层正好是它那一层；伪神：五层已清、它还没显形）
 * → 放回内存为 truncated / error，战场页按钮会写「显形中断，点击处理」。没配 AI 时先不接（记录留着，下次再看）。
 */
export function restoreRevealJobs(): void {
  const st = useAppStore.getState();
  const cfg = getDeliberateAIConfig(st.settings);
  const attrNames = st.settings.attributeNames as Record<AttributeId, string>;
  const stratum = st.stratum;
  const finalStage = st.battleState?.finalBossStage;
  const cleared = !stratum || stratum.status === 'cleared';
  const nextLevel = stratum ? Math.min(5, stratum.level + 1) : 1;
  const bind = (hasPartial: boolean) => ({
    status: hasPartial ? 'truncated' as const : 'error' as const,
    error: hasPartial ? '上次没写完 App 就被关掉了，可以让它接着说完。' : '上次没连上 / 没写完 App 就被关掉了，可以重试（同一份提示词与弱点）。',
  });

  const sr = readRecord<StratumRecord>(STRATUM_KEY);
  if (sr) {
    const fresh = Date.now() - (sr.startedAt || 0) <= RECORD_TTL_MS;
    const due = cleared && !(stratum && stratum.level >= 5) && nextLevel === sr.level && !finalStage;
    if (!fresh || !due || typeof sr.prompt !== 'string' || !sr.prompt) clearRecord(STRATUM_KEY);
    else if (cfg && !useRevealJobs.getState().stratum) {
      useRevealJobs.setState({
        stratum: {
          id: sr.id, startedAt: sr.startedAt, shown: sr.partial ?? '', resumes: Math.min(sr.resumes ?? 0, REVEAL_RESUME_LIMIT),
          attrNames, level: sr.level, prepared: { cfg, prompt: sr.prompt, level: sr.level, weakAttribute: sr.weakAttribute },
          themeAttribute: sr.themeAttribute, answers: sr.answers ?? [], partial: sr.partial || undefined,
          ...bind(!!sr.partial),
        },
      });
    }
  }
  const fr = readRecord<FinalRecord>(FINAL_KEY);
  if (fr) {
    const fresh = Date.now() - (fr.startedAt || 0) <= RECORD_TTL_MS;
    const due = !!stratum && stratum.status === 'cleared' && stratum.level >= 5 && !finalStage && !stratum.revisit;
    if (!fresh || !due || typeof fr.prompt !== 'string' || !fr.prompt) clearRecord(FINAL_KEY);
    else if (cfg && !useRevealJobs.getState().final) {
      useRevealJobs.setState({
        final: {
          id: fr.id, startedAt: fr.startedAt, shown: fr.partial ?? '', resumes: Math.min(fr.resumes ?? 0, REVEAL_RESUME_LIMIT),
          attrNames, prepared: { cfg, prompt: fr.prompt, strongest: fr.strongest }, partial: fr.partial || undefined,
          ...bind(!!fr.partial),
        },
      });
    }
  }
}

/** 测试用：盘上的续跑材料 */
export const peekRevealRecords = () => ({ stratum: readRecord<StratumRecord>(STRATUM_KEY), final: readRecord<FinalRecord>(FINAL_KEY) });

const patchStratum = (p: Partial<StratumJob>) =>
  useRevealJobs.setState(s => ({ stratum: s.stratum ? { ...s.stratum, ...p } : s.stratum }));
const patchFinal = (p: Partial<FinalJob>) =>
  useRevealJobs.setState(s => ({ final: s.final ? { ...s.final, ...p } : s.final }));

/** 进度文本节流：思维链一秒几十段，每段都 setState 太密 */
function throttledShown(apply: (t: string) => void): (t: string) => void {
  let pending: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (t: string) => {
    pending = t;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      if (pending !== null) apply(pending);
      pending = null;
    }, 120);
  };
}

const errorText = (e: unknown): string => (e instanceof Error ? e.message : '显形失败，请重试');

/**
 * 每一发（含重试 / 续写）都按**当前设置**取深思熟虑档的连接（第 16 批）：提示词和弱点照旧（提示词里写着弱点名，不能重掷），
 * 只换模型。以前整份 prepared 连模型一起定死在开始那一刻——报错后去设置里换了模型、回来点「重试」，发的还是旧模型，
 * 用户以为「换哪家都是同一个错」。没配深思熟虑档会退回快速响应档（与 prepare 同一口径）；都没配就沿用原来那份。
 */
function withCurrentModel<T extends { cfg: AIConfig }>(prepared: T): T {
  const cfg = getDeliberateAIConfig(useAppStore.getState().settings);
  return cfg ? { ...prepared, cfg } : prepared;
}

// ── 区层显形 ───────────────────────────────────────────────────────────────

function buildBoss(level: number, data: StratumRevealData): Shadow {
  // 主塔区层只到 5（Lv6 顶阙走 final）；钳按表长写，别再钉死数字
  const cfg = SHADOW_LEVEL_CONFIG[Math.min(level, SHADOW_LEVEL_CONFIG.length) - 1];
  return {
    id: uuidv4(),
    level,
    name: data.name,
    description: data.description,
    invertedAttributes: data.invertedAttributes,
    weakAttribute: data.weakAttribute,
    maxHp: cfg.maxHp,
    currentHp: cfg.maxHp,
    maxHp2: cfg.maxHp2,
    currentHp2: cfg.maxHp2,
    responseLines: data.responseLines,
    attackPower: BOSS_ATTACK_BY_LEVEL[level - 1],
    createdAt: new Date(),
  };
}

async function runStratum(id: string, resumeFrom?: string): Promise<void> {
  const job = useRevealJobs.getState().stratum;
  if (!job || job.id !== id) return;
  const ac = new AbortController();
  controllers.stratum?.abort();
  controllers.stratum = ac;
  const prepared = withCurrentModel(job.prepared);
  patchStratum({ status: 'running', error: undefined, shown: resumeFrom ?? '', prepared, modelLabel: aiConfigLabel(prepared.cfg) });
  const onProgress = throttledShown(t => { if (!ac.signal.aborted) patchStratum({ shown: t }); });
  const onContent = (t: string) => { if (!ac.signal.aborted) notePartial(STRATUM_KEY, t); };
  try {
    const data = await completeStratumReveal(prepared, job.attrNames, { onProgress, onContent, signal: ac.signal, resumeFrom });
    if (ac.signal.aborted) return;
    const boss = buildBoss(job.level, data);
    await useAppStore.getState().revealStratum({
      level: job.level,
      name: data.stratumName,
      description: data.stratumDescription,
      themeAttribute: job.themeAttribute,
      boss,
    });
    patchStratum({ status: 'done', result: { name: boss.name, weakAttribute: boss.weakAttribute }, partial: undefined });
    clearRecord(STRATUM_KEY);
  } catch (e) {
    if (ac.signal.aborted) return;
    if (e instanceof Error && e.name === 'AbortError') return;
    if (e instanceof JSONTruncatedError) {
      patchStratum({ status: 'truncated', partial: e.partial, error: e.message });
      saveStratumRecord(e.partial);
      return;
    }
    patchStratum({ status: 'error', error: errorText(e) });
    saveStratumRecord();
  }
}

export function startStratumJob(args: {
  settings: Settings;
  attrNames: Record<AttributeId, string>;
  level: number;
  attrValues: Record<AttributeId, number>;
  lastWeak: AttributeId | undefined;
  answers: string[];
  themeAttribute: AttributeId;
}): void {
  const cur = useRevealJobs.getState().stratum;
  if (cur?.status === 'running') return;
  // prepare 可能抛（没 Key）：让调用方拿到错误，任务不建
  const prepared = prepareStratumReveal(args.settings, args.attrNames, args.level, args.attrValues, args.lastWeak, args.answers, args.themeAttribute);
  const id = uuidv4();
  useRevealJobs.setState({
    stratum: {
      id, status: 'running', startedAt: Date.now(), shown: '', resumes: 0,
      attrNames: args.attrNames, level: args.level, prepared, themeAttribute: args.themeAttribute, answers: args.answers,
    },
  });
  clearRecord(STRATUM_KEY);
  saveStratumRecord();
  void runStratum(id);
}

/** 让它说完：从半截续写 */
export function resumeStratumJob(): void {
  const job = useRevealJobs.getState().stratum;
  if (!job || job.status !== 'truncated' || !job.partial || job.resumes >= REVEAL_RESUME_LIMIT) return;
  patchStratum({ resumes: job.resumes + 1 });
  saveStratumRecord(job.partial);
  void runStratum(job.id, job.partial);
}

/** 重试（同一份提示词与弱点） */
export function retryStratumJob(): void {
  const job = useRevealJobs.getState().stratum;
  if (!job || job.status === 'running') return;
  patchStratum({ startedAt: Date.now(), partial: undefined });
  clearRecord(STRATUM_KEY);
  saveStratumRecord();
  void runStratum(job.id);
}

export function cancelStratumJob(): void {
  controllers.stratum?.abort();
  controllers.stratum = undefined;
  useRevealJobs.setState({ stratum: null });
  clearRecord(STRATUM_KEY);
}

/** 显形演出放完：清掉任务 */
export function ackStratumJob(): void {
  controllers.stratum = undefined;
  useRevealJobs.setState({ stratum: null });
  clearRecord(STRATUM_KEY);
}

// ── 伪神显形 ───────────────────────────────────────────────────────────────

async function runFinal(id: string, resumeFrom?: string): Promise<void> {
  const job = useRevealJobs.getState().final;
  if (!job || job.id !== id) return;
  const ac = new AbortController();
  controllers.final?.abort();
  controllers.final = ac;
  const prepared = withCurrentModel(job.prepared);
  patchFinal({ status: 'running', error: undefined, shown: resumeFrom ?? '', prepared, modelLabel: aiConfigLabel(prepared.cfg) });
  const onProgress = throttledShown(t => { if (!ac.signal.aborted) patchFinal({ shown: t }); });
  const onContent = (t: string) => { if (!ac.signal.aborted) notePartial(FINAL_KEY, t); };
  try {
    const data = await completeFinalBoss(prepared, job.attrNames, { onProgress, onContent, signal: ac.signal, resumeFrom });
    if (ac.signal.aborted) return;
    await useAppStore.getState().revealFinalBoss({
      stratumName: data.stratumName,
      stratumDescription: data.stratumDescription,
      name: data.name,
      description: data.description,
      invertedAttributes: data.invertedAttributes,
      responseLines: data.responseLines,
      weakAttribute: data.weakAttribute,
      flaw: { key: data.flawKey, title: data.flawTitle, verdict: data.verdict },
    });
    patchFinal({ status: 'done', result: { name: data.name, flawTitle: data.flawTitle, verdict: data.verdict, weak: data.weakAttribute }, partial: undefined });
    clearRecord(FINAL_KEY);
  } catch (e) {
    if (ac.signal.aborted) return;
    if (e instanceof Error && e.name === 'AbortError') return;
    if (e instanceof JSONTruncatedError) {
      patchFinal({ status: 'truncated', partial: e.partial, error: e.message });
      saveFinalRecord(e.partial);
      return;
    }
    patchFinal({ status: 'error', error: errorText(e) });
    saveFinalRecord();
  }
}

export function startFinalJob(args: { settings: Settings; attrNames: Record<AttributeId, string>; facts: FinalBossFacts }): void {
  const cur = useRevealJobs.getState().final;
  if (cur?.status === 'running') return;
  const prepared = prepareFinalBoss(args.settings, args.attrNames, args.facts);
  const id = uuidv4();
  useRevealJobs.setState({
    final: { id, status: 'running', startedAt: Date.now(), shown: '', resumes: 0, attrNames: args.attrNames, prepared },
  });
  clearRecord(FINAL_KEY);
  saveFinalRecord();
  void runFinal(id);
}

export function resumeFinalJob(): void {
  const job = useRevealJobs.getState().final;
  if (!job || job.status !== 'truncated' || !job.partial || job.resumes >= REVEAL_RESUME_LIMIT) return;
  patchFinal({ resumes: job.resumes + 1 });
  saveFinalRecord(job.partial);
  void runFinal(job.id, job.partial);
}

export function retryFinalJob(): void {
  const job = useRevealJobs.getState().final;
  if (!job || job.status === 'running') return;
  patchFinal({ startedAt: Date.now(), partial: undefined });
  clearRecord(FINAL_KEY);
  saveFinalRecord();
  void runFinal(job.id);
}

export function cancelFinalJob(): void {
  controllers.final?.abort();
  controllers.final = undefined;
  useRevealJobs.setState({ final: null });
  clearRecord(FINAL_KEY);
}

export function ackFinalJob(): void {
  controllers.final = undefined;
  useRevealJobs.setState({ final: null });
  clearRecord(FINAL_KEY);
}

/** 生成阶段的经过秒数（组件用 1s 计时器刷新） */
export const elapsedOf = (job: RevealBase | null | undefined): number =>
  job ? Math.max(0, Date.now() - job.startedAt) : 0;

// 第 27 批：登记进 AI 后台任务表（底导小圆点 / 顶部横幅 / 写完提醒）。只订阅，不改上面的状态机。
registerAIJobSource(useRevealJobs, revealJobViews, revealJobLive);
