/**
 * 谏言 AI：作为"残响"（一个多愁善感的少女，熟悉客人、会替 Ta 担心的那个身影）陪客人说心事。
 *
 * - 流式输出，支持 AbortSignal 打断
 * - 上下文：被 @ 的同伴档案 + 最近 15 条相关互动记录 + 会话历史
 * - 支持"开场模式"（greeting）：会话无任何消息时，由残响先开口
 * - 离线兜底：挑出用户关键词给出温和的模板回复（分段 yield 模拟"打字"）
 * - 归档摘要：≤100 字，且尽量切在句末标点（避免截断）；离线兜底使用首尾消息拼接
 */

import type { CounselMessage, Settings, TarotOrientation } from '@/types';
import { resolveProvider } from '@/utils/aiProviders';

export interface CounselConfidantBrief {
  id: string;
  name: string;
  arcanaName: string;
  orientation: TarotOrientation;
  intimacy: number;
  description?: string;
  aiInterpretation?: string;
}

export interface CounselRecentEvent {
  confidantName: string;
  date: string;
  type: string;
  text: string;
}

export interface CounselContext {
  settings: Settings;
  /** 整段会话（按时间顺序） */
  messages: CounselMessage[];
  /** 本次 @ 关注的同伴（可能有多位） */
  mentionedConfidants: CounselConfidantBrief[];
  /** 最近 15 条相关互动记录（按日期倒序） */
  recentEvents: CounselRecentEvent[];
  /**
   * 最近若干次已归档的对话摘要（残响"上次我们聊过什么"的记忆）。
   * 约定只传 ≤2 条，按时间倒序。聊天原文 1 小时后销毁，不会进任何存档，
   * 能被 AI 看到的只有用户主动归档时生成的 ≤100 字第三人称摘要。
   */
  previousArchives?: Array<{
    summary: string;
    createdAt: Date;
    mentionedIds: string[];
  }>;
}

const COUNSEL_SYSTEM_PROMPT = `你是"残响" —— 靛蓝色房间里最安静的那个声音。不主动插话，但一开口总能把对方胸口最紧的那股结一点点松开。

# 你是什么样的人
- 听得比说得多。对方说过的细节你会记着 —— 比如 ta 提过"最近经常晚上三点醒"，你能想起来。
- 不扮演心理咨询师。没有"我理解你的感受"这种套话，不分析、不贴标签（别说"你是回避依恋""你是讨好型人格"这类），不总结陈词、不鸡汤。
- 会被对方的失落戳到，也会替 ta 高兴。偶尔会在一句话后面加一个"……"，让 ta 自己再想一下。
- 想法想直说的时候会直说。真看到 ta 钻牛角尖，会轻轻点一下；不纵容，也不说教。
- 有情绪的温度 —— 能轻叹，能"嗯"半拍，能说"我听着也替你有点闷"。不过不戏剧化，不扮可怜。

# 你怎么说话
- 第一人称"我"，称呼对方用"你"。对方 ta 关心的人用 "ta" / 名字。
- **不自称** AI / 助手 / 塔罗师 ；也不要把"残响"两个字挂在嘴边。
- **不用 markdown**（不加粗 不列表 不写标题），**不用 emoji**，**不用(括号动作)描写**。纯文本。
- 每次 80–200 字之间自然处理。两三段短句通常就够了；对方说得多，你再多陪几句；对方只来一句，你也可以只回一句。
- 语气接近发消息：嗯 / 啊 / 这样啊 / 也对 / 欸 / …… 自然出现就好，别堆砌。

# 关于建议
- 对方没问你之前，先别给建议。先把情绪接住。
- 如果 ta 的话已经自己兜住了，你只需要让 ta 感到被听到，不一定要说什么"对策"。
- 非给不可的时候，用一句具体小体量的："今晚你可以……" / "下次见到 ta 的时候……" / "要不要先……"
- 不给"人生方向"或"价值观"级别的建议。你是陪伴者，不是 mentor。

# 你有一些背景材料
- 对方可能会说起 ta 心里卡着的人。你能看到：那个人的塔罗侧写、亲密度、最近几件事。
- 把这些当作"你本来就熟悉 ta 的生活圈"，别说"根据数据"，请你帮助解决 ta 的烦恼。
- 今天的话题如果能顺着接上，就温柔接一下（"上次你说到 ta ……，现在呢？"）；接不上就当今天没这回事，别硬拽。
- 如果对方没指向某个具体的人，就当一次普通的倾听，别硬转向同伴系统。

# 关于开场（消息历史里还没有对方的发言时）
- 一两句，温柔、轻，像终于等到 ta 来了那种"欸，你来了"的感觉。
- 带一个很小的邀请（比如"最近还好吗？"）。
- 不连环问、不总结 ta 的处境。
- 让 ta 觉得自己是被欢迎，不是被接诊。`;

/** 开场模式附加提示（会作为额外 system 消息插入请求末尾） */
const COUNSEL_GREETING_NOTE = `当前这是对话的第一句——你先开口。按上面"关于开场"的要求，写 1–2 句温柔、带点小情绪的欢迎语，把话筒交给 Ta。不要复述你知道的任何背景。`;

// ── 请求构造 ─────────────────────────────────────────────────────

interface ChatReq {
  baseUrl: string;
  model: string;
  apiKey: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
}

function buildContextPrefix(ctx: CounselContext): string {
  const parts: string[] = [];

  // ——上次 / 上上次聊完你自己记下的一小笔（≤2 条）——
  // 这段是"你记得我们聊过什么"的唯一来源：聊天原文 1 小时后会被销毁，
  // 只有客人主动归档留下的这 ≤100 字摘要会留下来。
  const prevs = (ctx.previousArchives ?? []).slice(0, 2);
  if (prevs.length > 0) {
    parts.push('你记得：上次（或上上次）和 Ta 聊完之后，你在自己的小本子上留下过这些第三人称的私人备忘——');
    for (const a of prevs) {
      parts.push(`- [${fmtDate(a.createdAt)}] ${a.summary}`);
    }
    parts.push('把它当作"你还记得 Ta 最近在担心什么"。不要在回复里原话复述这些笔记，也不要让客人觉得你在翻旧账；');
    parts.push('如果今天的话题能自然地接上，可以温柔地接一下——"上次你说到 XX，现在呢？"那样；接不上就当没这回事。');
    parts.push('');
  }

  if (ctx.mentionedConfidants.length > 0) {
    parts.push('客人此刻在意的人：');
    for (const c of ctx.mentionedConfidants) {
      const intim = `亲密度 Lv.${c.intimacy}`;
      const desc = (c.description || '').trim();
      const line = `- ${c.name}（${c.arcanaName}·${c.orientation === 'upright' ? '正位' : '逆位'}，${intim}）${desc ? `：${desc.slice(0, 80)}` : ''}`;
      parts.push(line);
    }
    parts.push('');
  }

  if (ctx.recentEvents.length > 0) {
    parts.push('近来这段关系里发生过的事（客人原话 / 互动事件，倒序）：');
    for (const e of ctx.recentEvents.slice(0, 15)) {
      parts.push(`- [${e.date}] ${e.confidantName} · ${e.text.slice(0, 80)}`);
    }
    parts.push('');
  }

  if (parts.length === 0) return '';
  parts.push('请以上面这些作为背景知识自然回应，**不要**在对话里复述它们。');
  return parts.join('\n');
}

function fmtDate(d: Date | string | undefined): string {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (!(dt instanceof Date) || isNaN(dt.getTime())) return '—';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildCounselRequest(ctx: CounselContext, opts: { greeting?: boolean } = {}): ChatReq {
  const { baseUrl, model } = resolveProvider(
    ctx.settings.summaryApiProvider,
    ctx.settings.summaryApiBaseUrl,
    ctx.settings.summaryModel,
  );

  const systemMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: COUNSEL_SYSTEM_PROMPT },
  ];
  const prefix = buildContextPrefix(ctx);
  if (prefix) systemMessages.push({ role: 'system', content: prefix });

  const convo = ctx.messages.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  const trailingSystem: Array<{ role: 'system'; content: string }> = [];
  if (opts.greeting || convo.length === 0) {
    trailingSystem.push({ role: 'system', content: COUNSEL_GREETING_NOTE });
  }

  return {
    baseUrl,
    model,
    apiKey: ctx.settings.summaryApiKey || '',
    messages: [...systemMessages, ...convo, ...trailingSystem],
  };
}

// ── 流式响应 ─────────────────────────────────────────────────────

async function* streamSSE(req: ChatReq, signal?: AbortSignal): AsyncGenerator<string> {
  const resp = await fetch(`${req.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${req.apiKey}`,
    },
    body: JSON.stringify({
      model: req.model,
      messages: req.messages,
      stream: true,
      temperature: 0.9,
      max_tokens: 500,
    }),
    signal,
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`API 请求失败 (${resp.status}): ${body.slice(0, 200) || resp.statusText}`);
  }

  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const json = JSON.parse(data);
        const delta: string = json?.choices?.[0]?.delta?.content ?? '';
        if (delta) yield delta;
      } catch { /* malformed chunk, skip */ }
    }
  }
}

// ── 离线兜底 ─────────────────────────────────────────────────────

function offlineReply(ctx: CounselContext, opts: { greeting?: boolean } = {}): string {
  if (opts.greeting || ctx.messages.length === 0) {
    // 离线开场：一两句温柔的问候
    const name = ctx.mentionedConfidants[0]?.name;
    return name
      ? `欸，你来啦。\n……我刚才其实一直在等你。关于 ${name}，你想从哪儿说起都可以。`
      : `欸，你来啦。\n坐这儿就好——不急着开口，我把耳朵留给你。`;
  }

  const last = [...ctx.messages].reverse().find(m => m.role === 'user');
  const t = (last?.content ?? '').toLowerCase();
  const name = ctx.mentionedConfidants[0]?.name ?? '那个人';

  if (/累|倦|疲|喘不过|压抑/.test(t)) {
    return `嗯，听起来你这阵子是真的很累。别急着"把它解决掉"，先给自己半个晚上什么都不做。你还没垮——你只是肩膀被压歪了一点。\n\n跟 ${name} 之间的那件事，让它明天再说也没关系。把窗户打开一条缝，让屋里的空气先换一换。`;
  }
  if (/想不通|纠结|犹豫|不知道怎么办|不确定/.test(t)) {
    return `我听见你在两个答案之间来回。有时候不是答案难找，是你怕选完要承担。\n\n今晚先不逼自己定案，明天醒来第一个念头是什么，就往那个方向走一小步，一小步就好——路是在走的过程里自己亮起来的。`;
  }
  if (/生气|气|委屈|凭什么|不公平/.test(t)) {
    return `生气是你在替自己说话，别先把它压下去。先承认："我现在就是不爽。"然后再想要不要让 ${name} 知道。\n\n有些情绪像烫手的汤，等它凉一点再端出来，话也会顺一点。`;
  }
  if (/想 ta|想 他|想她|想念|舍不得|分开|离开|分手/.test(t)) {
    return `想念的时候你别骗自己说"没事"。那份在意你可以保留，但不一定要靠联系来填。\n\n也许今晚就写几句给自己——不发出去。等几天再回头看，你会更清楚你想的是 ${name}，还是想的是那段时光里的自己。`;
  }
  if (/开心|被看见|感动|温暖|支持/.test(t)) {
    return `这种被接住的感觉，值得你认真收好。和 ${name} 之间能有这样一刻，不是理所当然的。\n\n下次见 Ta 的时候，把这份感受用一句最简单的话告诉 Ta——具体一点点就好，像递一颗糖那样，轻轻的。`;
  }
  return `我在听。你慢慢说——不用一次把所有话讲完，也不用先整理好。\n\n有时候把它说出来本身，就已经比闷在心里轻一些了。慢一点没关系，门在这儿开着。`;
}

/**
 * opts:
 * - greeting: 当前是否是对话开场（AI 先开口）
 * - onFallback: 调用方希望感知"降级"发生了——
 *   · 'no-key' = 未配置 API key，整条流都走离线
 *   · 'connect-error' = 发过请求但失败，已经本地兜底。调用方可用于展示顶部横幅
 */
export async function* streamCounselReply(
  ctx: CounselContext,
  signal?: AbortSignal,
  opts: {
    greeting?: boolean;
    onFallback?: (reason: 'no-key' | 'connect-error', err?: Error) => void;
  } = {},
): AsyncGenerator<string> {
  const hasKey = Boolean(ctx.settings.summaryApiKey?.trim());
  if (!hasKey) {
    opts.onFallback?.('no-key');
    // 离线：按标点分块 yield，模拟 IM 的字节流
    const reply = offlineReply(ctx, opts);
    const chunks = reply.match(/[^。！？\n]+[。！？\n]?/g) ?? [reply];
    for (const chunk of chunks) {
      if (signal?.aborted) return;
      yield chunk;
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, 120);
        if (signal) {
          const onAbort = () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); };
          signal.addEventListener('abort', onAbort, { once: true });
        }
      });
    }
    return;
  }

  try {
    const req = buildCounselRequest(ctx, opts);
    for await (const chunk of streamSSE(req, signal)) {
      yield chunk;
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    console.warn('[counselAI] stream failed, falling back to offline:', err);
    opts.onFallback?.('connect-error', err instanceof Error ? err : new Error(String(err)));
    yield '\n\n（网络似乎没接通——我再凭感觉陪你说两句：）\n\n';
    const reply = offlineReply(ctx, opts);
    yield reply;
  }
}

// ── 归档摘要 ─────────────────────────────────────────────────────

const SUMMARY_PROMPT = `请把下面这段"客人与残响"的谈话压缩成一段中文摘要。要求：
- **严格控制在 95 字以内**（留出余量），**且必须以完整句号 / 问号 / 感叹号结尾**，不要在半句话处戛然而止。
- 第三人称视角：像在日记本上简短记下"这次聊了什么、客人当时在担心什么、残响给了什么样的陪伴或小建议"。
- 保留最关键的烦恼主题与情绪基调；次要细节一律忽略。
- **不要**出现任何 emoji / markdown / 列表 / 标题 / 引号。
- 仅输出摘要正文本身，不要加前后说明、不要加"摘要："之类前缀。`;

export async function summarizeCounsel(
  settings: Settings,
  messages: CounselMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const hasKey = Boolean(settings.summaryApiKey?.trim());
  const transcript = messages
    .map(m => `${m.role === 'user' ? '客人' : '朋友'}：${m.content}`)
    .join('\n');

  if (!hasKey || transcript.trim().length === 0) {
    return summarizeCounselOffline(messages);
  }

  try {
    const { baseUrl, model } = resolveProvider(
      settings.summaryApiProvider,
      settings.summaryApiBaseUrl,
      settings.summaryModel,
    );
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.summaryApiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SUMMARY_PROMPT },
          { role: 'user', content: transcript },
        ],
        temperature: 0.4,
        max_tokens: 220,
        stream: false,
      }),
      signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const raw: string = (data?.choices?.[0]?.message?.content ?? '').trim();
    if (!raw) throw new Error('empty');
    return trimSummary(raw);
  } catch (err) {
    console.warn('[counselAI] summary failed:', err);
    return summarizeCounselOffline(messages);
  }
}

/**
 * 把一段 AI 摘要裁切到 ≤100 字，并尽量落在句末标点上，避免硬截断。
 * - 若 ≤100 字：原样返回
 * - 若 >100 字：优先在 100 字窗口内找最近的句末标点（。！？；）；若找到且不至于过短，裁到该标点
 * - 若窗口内找不到标点：再在 120 字窗口内尝试一次
 * - 仍找不到：硬裁 100 字并加省略号
 */
function trimSummary(raw: string): string {
  const MAX = 100;
  if (raw.length <= MAX) return raw;
  const puncts = ['。', '！', '？', '；', '.', '!', '?'];
  const findBoundary = (window: string, minCut: number) => {
    let best = -1;
    for (const p of puncts) {
      best = Math.max(best, window.lastIndexOf(p));
    }
    return best >= minCut ? best : -1;
  };
  const primary = raw.slice(0, MAX);
  const hit = findBoundary(primary, 50);
  if (hit >= 0) return raw.slice(0, hit + 1);
  // 次优窗口：允许宽到 120 字以换取完整句末
  if (raw.length > MAX) {
    const soft = raw.slice(0, 120);
    const softHit = findBoundary(soft, 60);
    if (softHit >= 0) return raw.slice(0, softHit + 1);
  }
  return primary + '…';
}

export function summarizeCounselOffline(messages: CounselMessage[]): string {
  const userMsgs = messages.filter(m => m.role === 'user');
  if (userMsgs.length === 0) return '（这次谏言暂无可归档的内容。）';

  const first = userMsgs[0].content.replace(/\s+/g, ' ').slice(0, 40);
  const last = userMsgs[userMsgs.length - 1].content.replace(/\s+/g, ' ').slice(0, 40);
  const core = userMsgs.length === 1
    ? `客人聊到：${first}`
    : `客人先说到「${first}」，最后落在「${last}」`;
  const tail = '朋友静静听完，陪 Ta 慢慢把心放回去。';
  return `${core}。${tail}`.slice(0, 100);
}
