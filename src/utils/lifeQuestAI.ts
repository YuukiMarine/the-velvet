import type { Activity, AttributeId, Settings, Todo } from '@/types';
import { LIFE_QUEST_PRESETS } from '@/constants/lifeQuestPresets';
import { chatComplete, getAIConfig } from '@/utils/aiClient';
import { tryExtractJSON } from '@/utils/aiJson';
import { LIFE_ATTR_IDS, customLifeAttrs, lifeAttrMapSig, type LifeQuestAttrMap } from '@/utils/lifeQuestAttrMap';
import { lifeContextNow, lifeDayKeyOf, normTitle, type LifeQuest } from '@/utils/lifeQuests';

/**
 * 今日委托的两件 AI 活（第 17 批）——都在后台悄悄做，用户不用点任何东西：
 *
 * ① 题目 ↔ 自定义属性的对应：属性名改成了别的意思时，让 AI 把 80 条逐条对到最贴切的属性（五项都不搭的不出），
 *    存进设置（随同步，换设备不用再算）。属性名或题库一变（签名变了）就重算。任务页一打开就开始，
 *    打开委托板时多半已经好了；失败了记下时间，10 分钟后（或下次打开 App）再试。
 * ② 第四张卡（设置 → 体验个性化，默认关）：按最近 7 天的记录写一张更贴近这个人的委托，每天一张，存在本机。
 *    失败了 15 分钟后再试；没配 AI 就没有这张。
 *
 * 两件都只用快速响应档，关思考、短输出。
 */

const RETRY_MAP_MS = 10 * 60_000;
const RETRY_CARD_MS = 15 * 60_000;
const STATE_KEY = 'velvet:lifeQuestAI.v1';

interface AIState {
  /** 对应关系上次失败：签名 + 时间 */
  mapFail?: { sig: string; at: number };
  /** 第四张卡：按用户、按天 */
  card?: { seed: string; date: string; quest?: LifeQuest; failAt?: number };
}
const readState = (): AIState => {
  try { const v = JSON.parse(localStorage.getItem(STATE_KEY) || 'null') as AIState | null; return v && typeof v === 'object' ? v : {}; } catch { return {}; }
};
const writeState = (patch: Partial<AIState>) => {
  try { localStorage.setItem(STATE_KEY, JSON.stringify({ ...readState(), ...patch })); } catch { /* 存不了就每次重来 */ }
};

// ── ① 对应关系 ─────────────────────────────────────────────────────────

/** ready = 不用对 / 已对好；pending = 要对、AI 能用、没在退避期（在路上或马上就发）；unavailable = 要对但没配 AI 或刚失败过 */
export type LifeAttrMapStatus = 'ready' | 'pending' | 'unavailable';

let mapInflight: { sig: string; p: Promise<boolean> } | null = null;

export function lifeAttrMapStatus(settings: Settings, now = Date.now()): LifeAttrMapStatus {
  const names = settings.attributeNames;
  if (!customLifeAttrs(names).length) return 'ready';
  const sig = lifeAttrMapSig(names);
  if (settings.lifeQuestAttrMap?.sig === sig) return 'ready';
  if (!getAIConfig(settings)) return 'unavailable';
  if (mapInflight?.sig === sig) return 'pending';
  const fail = readState().mapFail;
  if (fail && fail.sig === sig && now - fail.at < RETRY_MAP_MS) return 'unavailable';
  return 'pending';
}

const MAP_SYSTEM = [
  '你在帮一个成长记录 App 整理「今日委托」题库。用户给自己的五项属性起了名字，做完一件小事会给其中一项加点。',
  '请把下面每一件小事归到最贴切的那一项属性；如果五项都明显不搭（硬塞会让人觉得莫名其妙），就填 0。',
  '判断看这件事主要在练什么、满足什么，不看字面上有没有相同的字；一件事沾好几项时挑它最主要的那一项。',
  '拿不准的不要都塞进同一项（比如什么都算「休息」）：整理、规划、专注做事这类更像做事的，就归到最接近「做事」的那一项。',
  '只输出一个 JSON 对象：键是小事前面的编号，值是属性序号（1~5）或 0。不要解释，不要代码块。',
].join('\n');

/**
 * 需要时向 AI 要一份对应关系并存进设置；不需要 / 已经在要 / 退避期里就直接返回。
 * 返回 true = 这次存好了新结果。save 一般是 store.updateSettings。
 */
export function ensureLifeQuestAttrMap(settings: Settings, save: (patch: Partial<Settings>) => unknown, now = Date.now()): Promise<boolean> {
  const names = settings.attributeNames;
  const custom = customLifeAttrs(names);
  if (!custom.length) return Promise.resolve(false);
  const sig = lifeAttrMapSig(names);
  if (settings.lifeQuestAttrMap?.sig === sig) return Promise.resolve(false);
  if (mapInflight?.sig === sig) return mapInflight.p;
  const cfg = getAIConfig(settings);
  if (!cfg) return Promise.resolve(false);
  const fail = readState().mapFail;
  if (fail && fail.sig === sig && now - fail.at < RETRY_MAP_MS) return Promise.resolve(false);

  const attrLines = LIFE_ATTR_IDS.map((a, i) => `${i + 1}. ${(names?.[a] ?? '').trim() || a}`).join('\n');
  const presetLines = LIFE_QUEST_PRESETS.map((p) => `${p.id} ${p.title.replace('{x}', p.slots?.[0] ?? '')}｜${p.hint}`).join('\n');
  const p = (async () => {
    try {
      const raw = await chatComplete(cfg, [
        { role: 'system', content: MAP_SYSTEM },
        { role: 'user', content: `五项属性：\n${attrLines}\n\n小事（编号 标题｜提示）：\n${presetLines}` },
      ], { temperature: 0.2, maxTokens: 1800, instant: true, timeoutMs: 60_000 });
      const obj = tryExtractJSON(raw);
      if (!obj) throw new Error('对应关系不是 JSON');
      const map: Record<string, AttributeId | null> = {};
      for (const preset of LIFE_QUEST_PRESETS) {
        const v = Number(obj[preset.id]);
        if (!Number.isInteger(v) || v < 0 || v > 5) continue;
        map[preset.id] = v === 0 ? null : LIFE_ATTR_IDS[v - 1];
      }
      // 漏得太多当失败（下次再要）；漏的零星几条按兜底规则
      if (Object.keys(map).length < LIFE_QUEST_PRESETS.length * 0.6) throw new Error('对应关系缺得太多');
      const value: LifeQuestAttrMap = { sig, map, at: Date.now() };
      await save({ lifeQuestAttrMap: value });
      writeState({ mapFail: undefined });
      return true;
    } catch (e) {
      console.warn('[velvet] 今日委托对应关系没要到，过一会儿再试', e);
      writeState({ mapFail: { sig, at: Date.now() } });
      return false;
    } finally {
      if (mapInflight?.sig === sig) mapInflight = null;
    }
  })();
  mapInflight = { sig, p };
  return p;
}

// ── ② 第四张卡 ─────────────────────────────────────────────────────────

let cardInflight: { key: string; p: Promise<LifeQuest | null> } | null = null;

/** 今天这张（本机记的）；没有返回 null */
export function readLifeQuestAiCard(seedKey: string, dateKey: string): LifeQuest | null {
  const c = readState().card;
  return c && c.seed === seedKey && c.date === dateKey && c.quest ? c.quest : null;
}

const CARD_SYSTEM = [
  '你在为一个成长记录 App 写「今日委托」的第四张卡：一件今天就能做完的小事，贴着这个人最近的生活。',
  '要求：',
  '- 具体、今天能做完（十分钟到两小时），不需要特殊装备，花费很少或不花钱；',
  '- 贴近最近的记录：可以顺着他最近在做的事再往前一步，也可以补上他好久没碰的那一项属性；',
  '- 不要和「今天清单里已有的事」「另外三张委托」重复；',
  '- 不说教、不写鸡汤，像朋友随口给的点子；标题 6~18 字，提示 6~16 字；',
  '- 属性从五项里选最贴切的一项，点数 1~3（1 顺手的小事，2 要花点时间，3 要下点决心）；',
  '- 只输出 JSON：{"title":"…","hint":"…","attr":属性序号,"points":点数}，不要解释。',
].join('\n');

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/**
 * 设置里开着、配了 AI、今天还没有：写一张存起来；退避期内 / 已经在写就不重复发。
 * others = 今天另外几张（别重复）。
 */
export function ensureLifeQuestAiCard(opts: {
  settings: Settings;
  seedKey: string;
  todayKey: string;
  activities: Activity[];
  todos: Todo[];
  others: LifeQuest[];
  now?: Date;
}): Promise<LifeQuest | null> {
  const { settings, seedKey, todayKey } = opts;
  if (!settings.lifeQuestAiCard) return Promise.resolve(null);
  const have = readLifeQuestAiCard(seedKey, todayKey);
  if (have) return Promise.resolve(have);
  const key = `${seedKey}|${todayKey}`;
  if (cardInflight?.key === key) return cardInflight.p;
  const cfg = getAIConfig(settings);
  if (!cfg) return Promise.resolve(null);
  const st = readState().card;
  if (st && st.seed === seedKey && st.date === todayKey && st.failAt && Date.now() - st.failAt < RETRY_CARD_MS) return Promise.resolve(null);

  const now = opts.now ?? new Date();
  const names = settings.attributeNames as Record<AttributeId, string>;
  const attrLines = LIFE_ATTR_IDS.map((a, i) => `${i + 1}. ${(names?.[a] ?? '').trim() || a}`).join('\n');
  const since = now.getTime() - 7 * 86400_000;
  const recent = opts.activities
    .filter((a) => a.method === 'local' && !a.category && new Date(a.date).getTime() >= since)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 20)
    .map((a) => {
      const d = new Date(a.date);
      const touched = LIFE_ATTR_IDS.filter((k) => (a.pointsAwarded?.[k] ?? 0) > 0).map((k) => names?.[k] ?? k).join('、');
      return `- ${d.getMonth() + 1}/${d.getDate()} ${a.description.trim().slice(0, 40)}${touched ? `（${touched}）` : ''}`;
    });
  const todayTodos = opts.todos.filter((t) => t.isActive && !t.archivedAt).slice(0, 12).map((t) => `- ${t.title.slice(0, 30)}`);
  const ctx = lifeContextNow(settings, now);
  const weather = ctx.weather === 'storm' ? '暴雨 / 雷暴 / 下雪' : ctx.weather === 'bad' ? '下雨或太热太冷，户外不宜' : ctx.weather === 'ok' ? '适合出门' : '不知道';
  const user = [
    `现在：${todayKey} ${WEEK[now.getDay()]} ${now.getHours()} 点；天气：${weather}`,
    `五项属性：\n${attrLines}`,
    `最近 7 天的记录（新的在前）：\n${recent.length ? recent.join('\n') : '（最近没有记录）'}`,
    `今天清单里已有：\n${todayTodos.length ? todayTodos.join('\n') : '（空）'}`,
    `另外三张委托：\n${opts.others.map((q) => `- ${q.title}`).join('\n') || '（无）'}`,
  ].join('\n\n');

  const p = (async () => {
    try {
      const raw = await chatComplete(cfg, [
        { role: 'system', content: CARD_SYSTEM },
        { role: 'user', content: user },
      ], { temperature: 0.9, maxTokens: 400, instant: true, timeoutMs: 45_000 });
      const obj = tryExtractJSON(raw);
      const title = String(obj?.title ?? '').trim().replace(/[。！!]+$/, '').slice(0, 24);
      const hint = String(obj?.hint ?? '').trim().slice(0, 24);
      const attrNo = Number(obj?.attr);
      const points = Math.min(3, Math.max(1, Math.round(Number(obj?.points) || 1)));
      if (title.length < 3 || !Number.isInteger(attrNo) || attrNo < 1 || attrNo > 5) throw new Error('第四张卡格式不对');
      const dup = [...opts.others.map((q) => q.title), ...opts.todos.filter((t) => lifeDayKeyOf(t.createdAt) === todayKey).map((t) => t.title)]
        .some((t) => normTitle(t) === normTitle(title));
      if (dup) throw new Error('第四张卡和已有的重复');
      const quest: LifeQuest = { key: `ai#${todayKey}`, presetId: `ai:${todayKey}`, title, hint, attribute: LIFE_ATTR_IDS[attrNo - 1], points, ai: true };
      writeState({ card: { seed: seedKey, date: todayKey, quest } });
      return quest;
    } catch (e) {
      console.warn('[velvet] 今日委托第四张卡没写成，过一会儿再试', e);
      writeState({ card: { seed: seedKey, date: todayKey, failAt: Date.now() } });
      return null;
    } finally {
      if (cardInflight?.key === key) cardInflight = null;
    }
  })();
  cardInflight = { key, p };
  return p;
}

/** 测试用：清掉在途记录 */
export function _resetLifeQuestAIForTest(): void {
  mapInflight = null;
  cardInflight = null;
  try { localStorage.removeItem(STATE_KEY); } catch { /* */ }
}
