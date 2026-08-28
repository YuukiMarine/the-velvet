/**
 * notifVoice — 助手口吻的提醒文案（v2.7：AI 接管通知推送的文字侧）。
 *
 * 本地通知的文案是**排程时**烤好的（notifications.ts 文件头：触发时 WebView 多半
 * 不在运行），所以"用助手的口吻推送"只能发生在排程之前：
 *   - 每天第一次需要时，用【助手档】+ 当前人格的 personaPrompt 生成 5 类文案各一条，
 *     缓存到 localStorage 当日复用（跨天/换人格自动作废）；
 *   - 生成是**纯增益**：排程从不等它——先用内置文案库排上，货到（onFresh 回调）重排；
 *     没配 Key / 失败 / 超时一律静默退回内置文案，链路零风险。
 *   - 计数类内容留 {n}（未竟待办数）与 {attr}（逆流属性名）占位符，排程时注入。
 */
import type { NavigatorPreset, NotifContentType, Settings } from '@/types';
import type { NotifText } from '@/utils/notifications';
import { chatComplete, getAssistantAIConfig } from '@/utils/aiClient';
import { db } from '@/db';
import { resolveNavigatorPreset } from '@/constants/navigatorPresets';

const CACHE_KEY = 'velvet-notif-voice-v1';

interface VoiceCache {
  dateKey: string;
  presetId: string;
  copy: Partial<Record<NotifContentType, NotifText>>;
}

const localDateKey = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const readCache = (): VoiceCache | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as VoiceCache) : null;
  } catch {
    return null;
  }
};

/** 当日 × 当前人格的缓存文案；没有（或过期）返回 null。同步，排程路径直接用。 */
export function getCachedNotifVoice(presetId: string): Partial<Record<NotifContentType, NotifText>> | null {
  const c = readCache();
  if (!c || c.dateKey !== localDateKey() || c.presetId !== presetId) return null;
  return c.copy;
}

const TYPES: NotifContentType[] = ['tarot', 'todos', 'countercurrent', 'summary', 'record'];

const TASK_PROMPT = `你要为这款成长应用写**今天**的本地推送文案（在系统通知栏展示）。共 5 类场景，各写一条：
- tarot：用户今天还没抽每日塔罗；
- todos：入夜时还有未完成的待办（正文里用 {n} 代表件数，可不用）；
- countercurrent：某属性明天将逆流扣减（正文里用 {attr} 代表属性名，建议用上）；
- summary：有一份新的成长总结还没读；
- record：今天还没有任何记录。
要求：完全用你自己的口吻说话（这是你替用户设的每日提醒）；title ≤8 字、body ≤42 字；
落地、别复读场景定义；不要透露你是 AI。
**只输出严格合法 JSON**（不要代码块、不要多余文字）：
{"tarot":{"title":"…","body":"…"},"todos":{…},"countercurrent":{…},"summary":{…},"record":{…}}`;

let inflight = false;

/**
 * 需要时刷新当日文案（幂等，可并发调用）。生成成功后写缓存并回调 onFresh
 * （调用方借此重排通知）。所有失败路径静默——内置文案永远兜着。
 */
export function refreshNotifVoiceIfNeeded(settings: Settings, onFresh: () => void): void {
  if (!settings.notifAIVoice || !settings.notificationsEnabled) return;
  const presetId = settings.navigatorPresetId ?? 'board';
  if (getCachedNotifVoice(presetId)) return;
  const cfg = getAssistantAIConfig(settings);
  if (!cfg || inflight) return;
  inflight = true;
  void (async () => {
    try {
      // 自定义人格在 db 表里（内置随代码）；读不到就按内置解析
      let custom: NavigatorPreset[] = [];
      try {
        custom = await db.navigatorPresets.toArray();
      } catch { /* 表读取失败按内置处理 */ }
      const preset = resolveNavigatorPreset(settings.navigatorPresetId, custom);
      const raw = await chatComplete(cfg, [
        { role: 'system', content: `${preset.personaPrompt}\n\n${TASK_PROMPT}` },
        { role: 'user', content: '请写今天的 5 条提醒文案，按要求输出 JSON。' },
      ], { temperature: 0.8, maxTokens: 700 });
      const stripped = raw.replace(/```(?:json)?/gi, '').trim();
      const fb = stripped.indexOf('{');
      const lb = stripped.lastIndexOf('}');
      if (fb < 0 || lb <= fb) return;
      const parsed = JSON.parse(stripped.slice(fb, lb + 1)) as Record<string, { title?: unknown; body?: unknown }>;
      const copy: Partial<Record<NotifContentType, NotifText>> = {};
      for (const t of TYPES) {
        const o = parsed[t];
        const title = typeof o?.title === 'string' ? o.title.trim().slice(0, 12) : '';
        const body = typeof o?.body === 'string' ? o.body.trim().slice(0, 60) : '';
        if (title && body) copy[t] = { title, body };
      }
      if (Object.keys(copy).length === 0) return;
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ dateKey: localDateKey(), presetId, copy } satisfies VoiceCache));
      } catch { /* 存储不可用：本次白生成，下次重来 */ }
      onFresh();
    } catch {
      /* 静默：内置文案兜底 */
    } finally {
      inflight = false;
    }
  })();
}
