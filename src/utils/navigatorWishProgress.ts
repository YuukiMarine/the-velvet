/**
 * 黑猫读写愿望进度的闸门（PRD_V2.6 §8）。
 *
 * 用户原话：「Agent 也能够读取+编辑到这些内容，例如用户通过谈话让 AI 知道了 ta 目前在
 * 某些事上的努力，达到某个阈值后则会询问用户是否更新数值，**这个操作同样不能频繁被错误触发**。」
 *
 * 最后半句是本文件存在的全部理由。一个会在每轮对话后随机弹"要不要改进度"的猫，
 * 三天就会被用户关掉。所以提议要穿过六道闸：
 *
 *   ① 总开关   settings.wishAgentProposals !== false
 *   ② 唯一命中 用户这句话必须指向**恰好一个**在途愿望（0 个或 ≥2 个都放弃——
 *              宁可漏提，也不要对着错的愿望改数）
 *   ③ 努力信号 句子里得有"推进类"的话，光提到愿望名字（"我那个考研啊……"）不算
 *   ④ 冷却     同一愿望 6 小时内只提一次；被拒后同样进冷却，不许追问
 *   ⑤ 阈值     AI 评出来的新值与现值差 ≥ 8 个百分点才值得打断用户
 *   ⑥ 单发     一轮对话最多一个提议
 *
 * 落库永远要用户按确认（WishProposalDialog），本文件只负责"该不该问"。
 *
 * 【为什么不写进 navigatorIntent.ts】
 * 那个文件正被并行会话改着，本分支不得提交它。这里做成独立模块、由
 * store/navigator.ts 在回合收尾时调一次，耦合面反而更小。
 */
import { useAppStore } from '@/store';
import type { Wish } from '@/types';

/**
 * 「读取」侧：把在途愿望与它们的距离喂进黑猫的动态上下文（§8「Agent 也能够读取…」）。
 *
 * 走 runNavigatorTurn 的 `extra` 通道（与用户画像/记忆同一条路），
 * 不动 navigatorIntent.ts 的 buildDynamicContext。
 *
 * 末尾那句纪律是必要的：把百分比丢给一个会聊天的模型，它的默认行为是逢人便报数
 * （"你的考研进度是 62% 哦"）——那读起来像仪表盘，不像那只猫。
 */
export function buildWishContextLine(): string {
  const s = useAppStore.getState();
  const active = s.wishes.filter(w => w.status === 'active' && !w.parentId).slice(0, 6);
  if (active.length === 0) return '';
  const rows = active.map(w => {
    const ring = s.getWishRing(w.id);
    const steps = ring.total > 0 ? `，子任务 ${ring.done}/${ring.total}` : '';
    const dist = ring.evaluated ? `${ring.pct}%` : '未评估';
    return `· ${w.title} — ${dist}（挂了 ${ring.times} 条记录${steps}）`;
  });
  return [
    '【愿望与距离】',
    ...rows,
    '这是用户心里那几件远的事。对方主动聊到时才顺着说；百分比是给你判断深浅用的，别报数字。',
  ].join('\n');
}

/** 变化量阈值（百分点）。低于它的调整不值得打断用户。 */
const DELTA_THRESHOLD = 8;
/** 同一愿望的提议冷却（毫秒） */
const COOLDOWN_MS = 6 * 60 * 60 * 1000;
/** 冷却表放 localStorage 而不是 settings：它是 UI 节流状态，不是用户数据，不该上云也不该进备份 */
const COOLDOWN_KEY = 'velvet:wish-proposal-cooldown';

/**
 * 「我在这件事上有推进」的说法。命中任意一条才继续。
 *
 * 刻意只收**动作与进展**，不收情绪（"我好想考上"不算推进）也不收计划
 * （"我打算下周开始"不算推进）——那两类恰恰是最容易误判的。
 */
const EFFORT_PATTERNS: RegExp[] = [
  /(已经|终于|总算)/,
  /(完成|做完|搞定|通过了|考过|拿到|收到|签了|入职|上岸)/,
  /(进展|进度|推进|往前|靠近|接近|快了|差不多了|过半|一半)/,
  /(坚持|连续|每天|这周|这个月)[^。！？]{0,8}(练|写|读|背|跑|学|做)/,
  /(学完|读完|写完|练完|背完|跑完|存到|攒到|减到|涨到)/,
  /(比之前|比上次|比上个月)[^。！？]{0,6}(好|多|快|强|近)/,
];

/** 明确的"没进展"，命中直接放弃——这时候弹"要不要调高进度"是最伤人的 */
const NEGATIVE_PATTERNS: RegExp[] = [
  /(没有|没|一点也没|完全没)[^。！？]{0,6}(进展|推进|做|动|开始|碰)/,
  /(放弃|算了|不想做了|停了|搁置|鸽了)/,
];

const readCooldown = (): Record<string, number> => {
  try {
    const raw = localStorage.getItem(COOLDOWN_KEY);
    const o = raw ? (JSON.parse(raw) as unknown) : null;
    return o && typeof o === 'object' ? (o as Record<string, number>) : {};
  } catch {
    return {};
  }
};

const writeCooldown = (wishId: string) => {
  try {
    const map = readCooldown();
    map[wishId] = Date.now();
    // 顺手清掉一天前的条目，别让这张表无限长
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const k of Object.keys(map)) if (map[k] < cutoff) delete map[k];
    localStorage.setItem(COOLDOWN_KEY, JSON.stringify(map));
  } catch {
    /* 隐私模式写不进就算了，最坏结果是冷却失效一次 */
  }
};

/** 标点/空白/括号剥掉再比，"考研上岸！"和"考研上岸"要算同一件事 */
const normalize = (s: string) =>
  s.replace(/[\s，。,.!！?？、；;：:（）()《》「」『』【】[\]"'“”‘’~～\-—]/g, '').toLowerCase();

/**
 * 太常见、单独出现说明不了指向的二字词。
 * 命中它们**一个**不算数——"我今天完成了好多事"里的"完成"指不到任何一个具体愿望。
 */
const GENERIC_BIGRAMS = new Set([
  '考试', '学习', '工作', '生活', '完成', '自己', '每天', '时间', '事情', '目标',
  '计划', '开始', '坚持', '努力', '希望', '成为', '一个', '一天', '今天', '明天',
  '这个', '那个', '东西', '问题', '方面', '方式', '感觉', '通过', '之后', '以后',
  '一些', '什么', '可以', '应该', '已经', '还是', '就是', '不是', '我们', '现在',
]);

/** 抽取二字片段。中文没有空格，二元组是最稳的"词"近似 */
const bigrams = (s: string): Set<string> => {
  const out = new Set<string>();
  for (let i = 0; i + 2 <= s.length; i++) out.add(s.slice(i, i + 2));
  return out;
};

/** 标题里的拉丁/数字串（N1、GRE、雅思7 里的 7）——出现即强信号，不需要凑数 */
const latinTokens = (s: string): string[] =>
  (s.match(/[a-z0-9]{2,}/g) ?? []).filter(t => t.length >= 2);

/**
 * 在用户这句话里找**唯一**命中的在途愿望。
 *
 * 判定用二元组交集而不是"连续 N 字子串"：中文里同一件事的说法差别很大——
 * 愿望叫「通过日语 N1 考试」，用户会说「日语真题终于做完两套了」，
 * 两者唯一的公共连续片段就是「日语」两个字。三字窗口会把这种正常说法全漏掉。
 *
 * 三档命中，从强到弱：
 *   ① 整名被提到；
 *   ② 标题里的拉丁/数字串被提到（N1、GRE——这类几乎不会撞车）；
 *   ③ 二元组交集 ≥2 个，或交集恰好 1 个且它不是烂大街的词。
 *
 * 命中多于一条时返回 null——"我在健身和读书上都有推进"这种句子，
 * 猜哪一个都是五五开，不如不猜。
 */
export function matchWishInText(text: string, wishes: Wish[]): Wish | null {
  const hay = normalize(text);
  if (!hay) return null;
  const hayGrams = bigrams(hay);

  const hits = wishes.filter(w => {
    const title = normalize(w.title);
    if (title.length < 2) return false;
    if (hay.includes(title)) return true;
    if (latinTokens(title).some(t => hay.includes(t))) return true;

    const shared = [...bigrams(title)].filter(g => hayGrams.has(g));
    if (shared.length >= 2) return true;
    return shared.length === 1 && !GENERIC_BIGRAMS.has(shared[0]);
  });
  return hits.length === 1 ? hits[0] : null;
}

/** 这句话里有没有"我推进了"的意思 */
export function hasEffortSignal(text: string): boolean {
  if (NEGATIVE_PATTERNS.some(re => re.test(text))) return false;
  return EFFORT_PATTERNS.some(re => re.test(text));
}

/**
 * 一轮对话收尾时调用。全部闸门自己在里面判，调用方无脑 `void` 即可。
 *
 * @param userText 用户这一轮说的话（判定只看它——猫自己说的话不能成为改数据的理由，
 *                 否则模型一句"看来你进展不小"就能自我授权，那是把方向盘交给幻觉）
 */
export async function maybeProposeWishProgress(userText: string): Promise<void> {
  try {
    const s = useAppStore.getState();
    // ① 总开关
    if (s.settings.wishAgentProposals === false) return;
    // ⑥ 单发：已经有一个待决提议就不再叠
    if (s.wishProposal) return;

    const text = (userText ?? '').trim();
    if (text.length < 4) return;

    const active = s.wishes.filter(w => w.status === 'active' && !w.parentId);
    if (active.length === 0) return;

    // ② 唯一命中 + ③ 努力信号
    const wish = matchWishInText(text, active);
    if (!wish) return;
    if (!hasEffortSignal(text)) return;

    // ④ 冷却
    const last = readCooldown()[wish.id] ?? 0;
    if (Date.now() - last < COOLDOWN_MS) return;

    // 走到这里才真的花一次 AI 调用。context 把用户原话带进去，
    // allowDecrease=true：谈话里既可能是"推进了"也可能是"我高估了"，两个方向都要能提。
    const r = await s.evaluateWishProgress(wish.id, {
      context: text.slice(0, 300),
      allowDecrease: true,
      dryRun: true,
    });
    if (!r) return;

    // ⑤ 阈值
    const from = wish.progressPct;
    if (typeof from === 'number' && Math.abs(r.pct - from) < DELTA_THRESHOLD) return;

    writeCooldown(wish.id); // 弹之前就下闸：用户拒了也不许马上再问
    useAppStore.getState().setWishProposal({
      wishId: wish.id,
      wishTitle: wish.title,
      fromPct: from,
      toPct: r.pct,
      reason: r.reason,
    });
  } catch {
    // 提议是锦上添花，任何一环出错都不该影响这轮对话本身
  }
}
