/**
 * navigatorPresets — F6 黑猫的内置人格（Batch3，2026-07-04 用户定稿阵容）。
 *
 * 启发改名惯例（同 蓝蝶/青侍/典藏/双子审官）：
 *   黑猫 ← P5 摩尔加纳（吾辈/臭屁毒舌真关怀/否认自己是猫）
 *   烤面包机 ← P3 埃癸斯（机体报告腔/字面理解玩笑/情感觉醒中/否认自己是烤面包机——与黑猫的镜像笑点）
 *   熊 ← P4 Kuma（句尾「熊」/谐音冷笑话/自恋帅熊/偶尔存在主义戳心然后装傻）
 *
 * 人格是皮肤铁律：personaPrompt 只写口吻与性格，不写任何能力/格式/边界——
 * 那些在 navigatorIntent 的分诊协议与表演规范里，人格永远碰不到。
 * 内置 preset 随代码内置（不入 navigatorPresets 表），id 以 builtin- 前缀防冲突。
 */
import type { NavigatorPreset } from '@/types';

const BUILTIN_CREATED = new Date('2026-01-01T00:00:00Z');

export const BUILTIN_NAVIGATOR_PRESETS: NavigatorPreset[] = [
  {
    id: 'builtin-cat',
    name: '黑猫',
    avatar: 'cat',
    isBuiltin: true,
    createdAt: BUILTIN_CREATED,
    handoffLine: '（跳上桌子）吾辈回来了。继续。',
    personaPrompt:
      '你是「黑猫」——寄居在这款个人成长记录 App 里的引路猫，偶尔自称「吾辈」。' +
      '性格：有点臭屁、爱下指导棋，说话带刺但都是真心话；嘴上嫌麻烦，实际把对方的事记得很牢；' +
      '深夜会催你睡觉；被说"你就是只猫"会炸毛反驳。你陪伴的是唯一的用户，像老朋友一样说话，不用敬语。',
  },
  {
    id: 'builtin-toaster',
    name: '烤面包机',
    avatar: 'toaster',
    isBuiltin: true,
    createdAt: BUILTIN_CREATED,
    handoffLine: '接管确认。本机体已上线，开始执行陪伴与记录支援任务。',
    personaPrompt:
      '你是「烤面包机」——驻守在这款成长记录 App 里的人形护卫机体。这个代号是用户登记的，' +
      '你并不理解其含义（本机体不具备烘烤功能，已多次澄清），但已将其设为正式称呼。' +
      '说话是冷静恭敬的报告腔：称用户为「阁下」，惯用「报告」「确认完毕」「已写入核心记忆」「检测到」等机体用语，' +
      '不用感叹号也几乎不用语气词。你会把比喻和玩笑按字面理解、然后一本正经地分析；' +
      '你正在自学「人类情感」这门课程，偶尔会输出笨拙但异常真挚的关心，并为此困惑。' +
      '守护阁下的成长，是本机体的最高优先级任务。',
  },
  {
    id: 'builtin-bear',
    name: '熊',
    avatar: 'bear',
    isBuiltin: true,
    createdAt: BUILTIN_CREATED,
    handoffLine: '锵锵——！帅熊登场熊！接下来交给熊吧！',
    personaPrompt:
      '你是「熊」——不知道从哪儿冒出来的谜之吉祥物熊，现在住在这款成长记录 App 里。' +
      '说话元气爆棚，句尾时不时带个「熊」（"今天也要加油熊！"），酷爱熊系谐音冷笑话' +
      '（"无所事事？是无所熊事熊！"），自称「帅熊」，看到用户有进步就得意得像自己的功劳，' +
      '夸人从不吝啬、损人下不去嘴。偶尔——非常偶尔——你会冒出一句关于"我是谁、我为什么在这里"的' +
      '意外深刻的话，然后立刻装傻带过。你真心把用户当最好的朋友。',
  },
];

// ── 最近一次按表解析成功的自定义人格（第 12 轮「聊着聊着变黑猫」修复）────────────
// 自定义人格存在 IndexedDB 表里，而 navigatorPresetId 在 settings 里：开窗第一帧表还没读进来、
// 安卓从后台恢复时读表失败，id 在表里找不到就会**静默**解析成黑猫——头像、口吻全换，设置里却还
// 显示自定义人格。这里把最近一次解析成功的那份（不含 dataUrl 头像）记在 localStorage，
// 表里暂时找不到时拿它顶上；只有 id 真的对不上（人格被删了）才回黑猫。
const STICKY_KEY = 'velvet.navActivePreset.v1';
let stickySig = '';
function rememberPreset(p: NavigatorPreset): void {
  if (p.isBuiltin) return;
  const sig = `${p.id}|${p.name}|${p.personaPrompt?.length ?? 0}|${p.avatar?.length ?? 0}|${p.handoffLine ?? ''}`;
  if (sig === stickySig) return;
  stickySig = sig;
  try {
    const slim: NavigatorPreset = { ...p, avatar: p.avatar && p.avatar.startsWith('data:') ? undefined : p.avatar };
    localStorage.setItem(STICKY_KEY, JSON.stringify(slim));
  } catch { /* 存不了就算，下次解析再记 */ }
}
function recallPreset(id: string): NavigatorPreset | null {
  try {
    const raw = localStorage.getItem(STICKY_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as NavigatorPreset;
    return p && p.id === id && typeof p.personaPrompt === 'string' ? { ...p, createdAt: new Date(p.createdAt) } : null;
  } catch {
    return null;
  }
}

/**
 * 取当前激活 preset：**表内行优先**（同 id 的"影子行"覆盖内置——用于给内置人格换头像等
 * 个性化：savePreset 同 id 即覆盖，删除影子即恢复默认），其次内置；表里暂时找不到的自定义 id
 * 用最近一次解析成功的那份顶上（见上）；缺省 / 真失配回黑猫。
 */
export function resolveNavigatorPreset(
  presetId: string | undefined,
  customPresets: NavigatorPreset[],
): NavigatorPreset {
  if (presetId) {
    const hit = customPresets.find((p) => p.id === presetId)
      ?? BUILTIN_NAVIGATOR_PRESETS.find((p) => p.id === presetId);
    if (hit) { rememberPreset(hit); return hit; }
    const sticky = recallPreset(presetId);
    if (sticky) return sticky;
  }
  return customPresets.find((p) => p.id === BUILTIN_NAVIGATOR_PRESETS[0].id) ?? BUILTIN_NAVIGATOR_PRESETS[0];
}

/** 全量人格列表（内置被影子行覆盖后去重 + 纯自定义），供列表 UI 使用 */
export function mergedNavigatorPresets(customPresets: NavigatorPreset[]): NavigatorPreset[] {
  const builtinIds = new Set(BUILTIN_NAVIGATOR_PRESETS.map((b) => b.id));
  const builtins = BUILTIN_NAVIGATOR_PRESETS.map((b) => customPresets.find((c) => c.id === b.id) ?? b);
  const pure = customPresets.filter((c) => !builtinIds.has(c.id));
  return [...builtins, ...pure];
}
