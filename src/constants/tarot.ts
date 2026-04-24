import type { AttributeId, Fortune } from '@/types';

export type TarotArcana = 'major' | 'minor';
export type TarotSuit = 'wands' | 'cups' | 'swords' | 'pentacles';
export type TarotOrientation = 'upright' | 'reversed';

export interface TarotCardData {
  id: string;
  arcana: TarotArcana;
  /** 0–21 (major) 或 1–14 (minor: 1=Ace, 11=Page, 12=Knight, 13=Queen, 14=King) */
  number: number;
  suit?: TarotSuit;
  name: string;        // 中文
  nameEn: string;
  roman?: string;      // 大阿卡纳罗马数字
  upright: {
    keywords: string[];
    meaning: string;
  };
  reversed: {
    keywords: string[];
    meaning: string;
  };
  /** 离线兜底时的建议（仅大阿卡纳填充较完整，其他兜底用 meaning 拼接） */
  advice?: { upright: string; reversed: string };
  /** 与五维属性的亲和（用于 AI 未命中时兜底选属性） */
  relatedAttribute?: AttributeId;
  /** 卡面主色（hex） */
  accent: string;
}

// ── 花色 → 元素 / 属性亲和 ──────────────────────────────────
export const SUIT_META: Record<TarotSuit, {
  name: string;
  element: string;
  symbol: string;
  attr: AttributeId;
  color: string;
}> = {
  wands:     { name: '权杖', element: '火', symbol: '🜂', attr: 'guts',      color: '#EF4444' },
  cups:      { name: '圣杯', element: '水', symbol: '🜄', attr: 'kindness',  color: '#F59E0B' },
  swords:    { name: '宝剑', element: '风', symbol: '🜁', attr: 'knowledge', color: '#3B82F6' },
  pentacles: { name: '星币', element: '地', symbol: '🜃', attr: 'dexterity', color: '#10B981' },
};

// ── 大阿卡纳 22 张 ──────────────────────────────────────────

export const MAJOR_ARCANA: TarotCardData[] = [
  {
    id: 'fool', arcana: 'major', number: 0, roman: '0',
    name: '愚者', nameEn: 'The Fool',
    upright: {
      keywords: ['新的开始', '自由', '纯粹', '冒险', '可能性'],
      meaning: '带着赤子之心迈向未知，一切尚未定义，正因如此充满可能。',
    },
    reversed: {
      keywords: ['鲁莽', '犹豫', '天真', '错失时机'],
      meaning: '过度谨慎或过度冲动，在原地打转。',
    },
    advice: {
      upright: '今日适合踏出舒适区，做一件完全陌生的事。',
      reversed: '先站住，别急着跳。心里没底的一步，可能不是信任，是鲁莽。',
    },
    relatedAttribute: 'guts', accent: '#FBBF24',
  },
  {
    id: 'magician', arcana: 'major', number: 1, roman: 'I',
    name: '魔术师', nameEn: 'The Magician',
    upright: {
      keywords: ['行动', '创造', '技艺', '主动', '意志'],
      meaning: '你拥有此刻所需的全部工具，关键是抬手去用。',
    },
    reversed: {
      keywords: ['操控', '才华错置', '自欺'],
      meaning: '能力被用错方向，或陷入口惠而实不至。',
    },
    advice: {
      upright: '今天是动手做的日子，不是再研究一天的日子。',
      reversed: '你擅长的不等于该做的。多问一句动机，再出手。',
    },
    relatedAttribute: 'dexterity', accent: '#A855F7',
  },
  {
    id: 'high_priestess', arcana: 'major', number: 2, roman: 'II',
    name: '女祭司', nameEn: 'The High Priestess',
    upright: {
      keywords: ['直觉', '静默', '内省', '潜意识'],
      meaning: '答案藏在表象之下，倾听那个不说话的声音。',
    },
    reversed: {
      keywords: ['迷茫', '自我隔绝', '信号混乱'],
      meaning: '内心的声音被杂念覆盖，需要先安静下来。',
    },
    advice: {
      upright: '少说几句，多写几行，让直觉浮上来。',
      reversed: '别信第一反应，今天的直觉可能只是情绪。',
    },
    relatedAttribute: 'knowledge', accent: '#6366F1',
  },
  {
    id: 'empress', arcana: 'major', number: 3, roman: 'III',
    name: '皇后', nameEn: 'The Empress',
    upright: {
      keywords: ['丰盛', '滋养', '创造', '温柔', '生命力'],
      meaning: '你所投入的温柔与耐心，会在这段时间开花。',
    },
    reversed: {
      keywords: ['过度付出', '停滞', '依赖'],
      meaning: '把心血倾倒在不回报的土壤里，是时候收回一点。',
    },
    advice: {
      upright: '好好吃饭、好好睡觉、给身边人一点好东西。',
      reversed: '照顾别人之前，先问自己今天吃饱了没。',
    },
    relatedAttribute: 'kindness', accent: '#EC4899',
  },
  {
    id: 'emperor', arcana: 'major', number: 4, roman: 'IV',
    name: '皇帝', nameEn: 'The Emperor',
    upright: {
      keywords: ['秩序', '权威', '框架', '掌控'],
      meaning: '为混乱建立规则，才是真正的自由。',
    },
    reversed: {
      keywords: ['僵化', '控制欲', '固执'],
      meaning: '规则变成枷锁，执着反而让你失去主动权。',
    },
    advice: {
      upright: '今天适合立 SOP，写清楚自己的一天。',
      reversed: '松手一次看看，世界不会因此塌掉。',
    },
    relatedAttribute: 'guts', accent: '#DC2626',
  },
  {
    id: 'hierophant', arcana: 'major', number: 5, roman: 'V',
    name: '教皇', nameEn: 'The Hierophant',
    upright: {
      keywords: ['传承', '指引', '信念', '师长'],
      meaning: '站在前人的肩膀上，比自己摸索更远。',
    },
    reversed: {
      keywords: ['权威反叛', '偏见', '墨守成规'],
      meaning: '要么被规则压住，要么彻底逆反——两种都是不自由。',
    },
    advice: {
      upright: '去读一本公认的经典，别老看最新的。',
      reversed: '不必为了叛逆而叛逆，也不必为了顺从而顺从。',
    },
    relatedAttribute: 'knowledge', accent: '#9CA3AF',
  },
  {
    id: 'lovers', arcana: 'major', number: 6, roman: 'VI',
    name: '恋人', nameEn: 'The Lovers',
    upright: {
      keywords: ['抉择', '连接', '价值', '合一'],
      meaning: '一段真正的关系，始于你先认识自己选择了什么。',
    },
    reversed: {
      keywords: ['犹豫', '价值冲突', '错位'],
      meaning: '想要的和该要的在拉扯，别急着下结论。',
    },
    advice: {
      upright: '今天做的选择，和"你是谁"有关，慎重。',
      reversed: '先承认冲突，再去调和。压抑不会让它消失。',
    },
    relatedAttribute: 'charm', accent: '#F472B6',
  },
  {
    id: 'chariot', arcana: 'major', number: 7, roman: 'VII',
    name: '战车', nameEn: 'The Chariot',
    upright: {
      keywords: ['决心', '前进', '掌控', '胜利'],
      meaning: '两股相反的力量被你驾驭到同一方向——这是胜利。',
    },
    reversed: {
      keywords: ['失控', '分心', '内耗'],
      meaning: '车在原地打转，是你还没决定去哪。',
    },
    advice: {
      upright: '选一件事，只做它，全力冲。',
      reversed: '列清单，把相互矛盾的事挑出一个砍掉。',
    },
    relatedAttribute: 'guts', accent: '#0EA5E9',
  },
  {
    id: 'strength', arcana: 'major', number: 8, roman: 'VIII',
    name: '力量', nameEn: 'Strength',
    upright: {
      keywords: ['温柔的力量', '耐心', '内在', '驯服'],
      meaning: '真正的强大不是压制，是温柔地引导野性。',
    },
    reversed: {
      keywords: ['自我怀疑', '情绪失控', '软弱'],
      meaning: '力气没有用错，只是今天暂时找不到它。',
    },
    advice: {
      upright: '面对让你想发火的事，先深呼吸三次。',
      reversed: '你不是不够强，你只是太累了。允许自己休息。',
    },
    relatedAttribute: 'guts', accent: '#F97316',
  },
  {
    id: 'hermit', arcana: 'major', number: 9, roman: 'IX',
    name: '隐士', nameEn: 'The Hermit',
    upright: {
      keywords: ['独处', '内省', '真知', '灯塔'],
      meaning: '你需要一个人待一会，灯才能亮。',
    },
    reversed: {
      keywords: ['孤立', '回避', '过度自我封闭'],
      meaning: '独处成了逃避，回来的时候到了。',
    },
    advice: {
      upright: '今天少开会，多一个人走路。',
      reversed: '给信任的人发条消息，让世界进来一点。',
    },
    relatedAttribute: 'knowledge', accent: '#64748B',
  },
  {
    id: 'wheel_of_fortune', arcana: 'major', number: 10, roman: 'X',
    name: '命运之轮', nameEn: 'Wheel of Fortune',
    upright: {
      keywords: ['转机', '循环', '机缘', '变化'],
      meaning: '轮子在转，你能做的是站稳重心。',
    },
    reversed: {
      keywords: ['停滞', '厄运循环', '抗拒变化'],
      meaning: '同样的坑掉第三次了，是该换条路。',
    },
    advice: {
      upright: '今天留意一个看似不相关的小事，它可能是转折。',
      reversed: '复盘一下最近的不顺，找出重复的那一环。',
    },
    relatedAttribute: 'knowledge', accent: '#8B5CF6',
  },
  {
    id: 'justice', arcana: 'major', number: 11, roman: 'XI',
    name: '正义', nameEn: 'Justice',
    upright: {
      keywords: ['公平', '责任', '因果', '清醒'],
      meaning: '你得到的，正是你一直在选择的总和。',
    },
    reversed: {
      keywords: ['不公', '逃避责任', '偏见'],
      meaning: '把结果归于别人，等于把自己的主动权也丢了。',
    },
    advice: {
      upright: '今日适合处理拖了很久的账、合同、文件。',
      reversed: '别急着找替罪羊，先问自己"我做过什么导致了这个"。',
    },
    relatedAttribute: 'kindness', accent: '#14B8A6',
  },
  {
    id: 'hanged_man', arcana: 'major', number: 12, roman: 'XII',
    name: '倒吊人', nameEn: 'The Hanged Man',
    upright: {
      keywords: ['视角转换', '暂停', '臣服', '牺牲'],
      meaning: '倒过来看，世界完全不同了。',
    },
    reversed: {
      keywords: ['僵住', '无意义的等待', '自我牺牲'],
      meaning: '你不是在沉淀，你是在拖。',
    },
    advice: {
      upright: '今天允许自己什么都不做，观察就好。',
      reversed: '你已经等够了，起身。',
    },
    relatedAttribute: 'knowledge', accent: '#0EA5E9',
  },
  {
    id: 'death', arcana: 'major', number: 13, roman: 'XIII',
    name: '死神', nameEn: 'Death',
    upright: {
      keywords: ['结束', '蜕变', '放下', '新生'],
      meaning: '不是毁灭，是完成。允许它结束，下一个才会来。',
    },
    reversed: {
      keywords: ['抗拒改变', '停滞', '未愈合'],
      meaning: '旧的死不透，新的活不起来。',
    },
    advice: {
      upright: '清理一件旧物、一段关系、一条过时的习惯。',
      reversed: '承认某件事已经结束了，不必假装它还在。',
    },
    relatedAttribute: 'guts', accent: '#1F2937',
  },
  {
    id: 'temperance', arcana: 'major', number: 14, roman: 'XIV',
    name: '节制', nameEn: 'Temperance',
    upright: {
      keywords: ['平衡', '调和', '耐心', '融合'],
      meaning: '两种看似矛盾的东西，可以不断注入彼此。',
    },
    reversed: {
      keywords: ['失衡', '极端', '急躁'],
      meaning: '你正在用过度证明自己。慢一点。',
    },
    advice: {
      upright: '今天做任何事都少一点，能量要留给后半程。',
      reversed: '停止"再努力一点就好了"的自我催眠，先休息。',
    },
    relatedAttribute: 'kindness', accent: '#06B6D4',
  },
  {
    id: 'devil', arcana: 'major', number: 15, roman: 'XV',
    name: '恶魔', nameEn: 'The Devil',
    upright: {
      keywords: ['束缚', '沉迷', '欲望', '阴影'],
      meaning: '锁链是自己挂上的，也可以自己取下。',
    },
    reversed: {
      keywords: ['觉醒', '挣脱', '释放'],
      meaning: '你已经看清楚了那个困住你的东西，接下来是行动。',
    },
    advice: {
      upright: '今天小心冲动消费/暴食/拖延——那不是放松，是吞噬。',
      reversed: '做一件你之前不敢做、却知道该做的事。',
    },
    relatedAttribute: 'charm', accent: '#7F1D1D',
  },
  {
    id: 'tower', arcana: 'major', number: 16, roman: 'XVI',
    name: '塔', nameEn: 'The Tower',
    upright: {
      keywords: ['突变', '崩解', '顿悟', '解放'],
      meaning: '建立在沙上的塔倒了，这是好事，虽然当下很痛。',
    },
    reversed: {
      keywords: ['延迟的崩溃', '警告', '避免'],
      meaning: '你正在撑一个早该放下的东西，能撑多久？',
    },
    advice: {
      upright: '今天若有意外，别反抗，看看它露出来的是什么真相。',
      reversed: '主动拆一次墙，比被动被砸要好受得多。',
    },
    relatedAttribute: 'guts', accent: '#B91C1C',
  },
  {
    id: 'star', arcana: 'major', number: 17, roman: 'XVII',
    name: '星星', nameEn: 'The Star',
    upright: {
      keywords: ['希望', '疗愈', '指引', '灵感'],
      meaning: '经历了塔之后，星光是温柔的承诺。',
    },
    reversed: {
      keywords: ['失望', '信念丢失', '焦虑'],
      meaning: '短暂地找不到北，但星星并没有消失。',
    },
    advice: {
      upright: '今天做一件不求结果的事，只为悦己。',
      reversed: '写下三件今年让你感到希望的小事。',
    },
    relatedAttribute: 'charm', accent: '#38BDF8',
  },
  {
    id: 'moon', arcana: 'major', number: 18, roman: 'XVIII',
    name: '月亮', nameEn: 'The Moon',
    upright: {
      keywords: ['幻象', '潜意识', '不安', '梦'],
      meaning: '看到的未必是真相，但感受是真的。',
    },
    reversed: {
      keywords: ['真相浮现', '迷雾散', '释然'],
      meaning: '一直担心的事没那么糟，或者你终于敢看它了。',
    },
    advice: {
      upright: '今天做的决定可能带有情绪，先睡一觉再定。',
      reversed: '把一直回避的问题写出来，它不会消失只会变大。',
    },
    relatedAttribute: 'kindness', accent: '#818CF8',
  },
  {
    id: 'sun', arcana: 'major', number: 19, roman: 'XIX',
    name: '太阳', nameEn: 'The Sun',
    upright: {
      keywords: ['喜悦', '成功', '清晰', '生命力'],
      meaning: '没有阴影的一天。享受它，不必心虚。',
    },
    reversed: {
      keywords: ['虚假的明朗', '自欺的快乐', '过度乐观'],
      meaning: '别把"看起来都好"当成"真的都好"。',
    },
    advice: {
      upright: '去晒太阳，真的。',
      reversed: '开心归开心，别在情绪高峰上签字/承诺。',
    },
    relatedAttribute: 'charm', accent: '#F59E0B',
  },
  {
    id: 'judgement', arcana: 'major', number: 20, roman: 'XX',
    name: '审判', nameEn: 'Judgement',
    upright: {
      keywords: ['觉醒', '召唤', '更生', '和解'],
      meaning: '你听见了那个一直在呼唤你的声音，起身吧。',
    },
    reversed: {
      keywords: ['自责', '犹豫', '错失召唤'],
      meaning: '过度审判自己，让该迈出的那步卡住了。',
    },
    advice: {
      upright: '今天回应一件你"总有一天要做"的事。',
      reversed: '原谅过去的一个版本的自己，然后前进。',
    },
    relatedAttribute: 'kindness', accent: '#FCD34D',
  },
  {
    id: 'world', arcana: 'major', number: 21, roman: 'XXI',
    name: '世界', nameEn: 'The World',
    upright: {
      keywords: ['完成', '整合', '圆满', '成就'],
      meaning: '一个长周期正在收尾。合上这一章，值得庆祝。',
    },
    reversed: {
      keywords: ['未竟', '缺口', '停滞于终局'],
      meaning: '差一点就好，但那一点正是关键。',
    },
    advice: {
      upright: '今天适合回顾并做一次总结，让完成的真正完成。',
      reversed: '别跳过结尾去开新的，把那最后一步走完。',
    },
    relatedAttribute: 'dexterity', accent: '#10B981',
  },
];

// ── 小阿卡纳 56 张（精简：关键词 + 一句话） ──────────────

const RANK_NAMES: Record<number, string> = {
  1: 'Ace', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five',
  6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine', 10: 'Ten',
  11: 'Page', 12: 'Knight', 13: 'Queen', 14: 'King',
};

const RANK_NAMES_CN: Record<number, string> = {
  1: 'A', 2: '二', 3: '三', 4: '四', 5: '五',
  6: '六', 7: '七', 8: '八', 9: '九', 10: '十',
  11: '侍从', 12: '骑士', 13: '皇后', 14: '国王',
};

interface MinorData {
  number: number;
  upKw: string[];
  upMean: string;
  rvKw: string[];
  rvMean: string;
}

// Wands — 权杖（火/胆量：激情、行动、冲突）
const WANDS: MinorData[] = [
  { number: 1,  upKw: ['灵感', '火花', '起点'],      upMean: '一团全新的火在你手心燃起。', rvKw: ['拖延', '熄火'],       rvMean: '想做的事还没开始就被浇了冷水。' },
  { number: 2,  upKw: ['规划', '远眺'],              upMean: '站在高处看清下一步去哪。',   rvKw: ['犹豫', '范围不清'],   rvMean: '想要的太多，具体的一步迈不出。' },
  { number: 3,  upKw: ['扩张', '等船'],              upMean: '你撒出去的已经在回来的路上。', rvKw: ['延迟', '受阻'],       rvMean: '船没回来，但其实还没到时间。' },
  { number: 4,  upKw: ['庆贺', '归属'],              upMean: '一个小阶段完成，值得庆祝。', rvKw: ['松懈', '根基动摇'],   rvMean: '庆祝来得太早，根基还需巩固。' },
  { number: 5,  upKw: ['冲突', '较劲'],              upMean: '摩擦带来的是进步，不是敌意。', rvKw: ['内耗', '避免冲突'],   rvMean: '假装没事反而让问题长大。' },
  { number: 6,  upKw: ['凯旋', '被认可'],            upMean: '这一次你确实赢了，收下。',   rvKw: ['虚名', '落差'],       rvMean: '掌声响了却没带来满足。' },
  { number: 7,  upKw: ['防守', '坚守'],              upMean: '守住自己的位置，别被吓退。', rvKw: ['退缩', '放弃阵地'],   rvMean: '还没被攻破就先退了。' },
  { number: 8,  upKw: ['加速', '讯息涌来'],          upMean: '消息、机会、变化一次到位。', rvKw: ['错乱', '信息过载'],   rvMean: '太多信号一起来，反而抓不住。' },
  { number: 9,  upKw: ['疲惫的坚持', '最后一关'],    upMean: '离完成只差一步，别现在倒。', rvKw: ['透支', '偏执防御'],   rvMean: '撑着但代价是身心俱疲。' },
  { number: 10, upKw: ['重担', '接近终点'],          upMean: '肩上压了很多，但你已经快到了。', rvKw: ['压垮', '不愿放下'], rvMean: '其实可以放下一些，是你不肯。' },
  { number: 11, upKw: ['好奇', '新消息'],            upMean: '一股少年气的热情想出发。',   rvKw: ['浮躁', '空口承诺'],   rvMean: '兴致来得快去得快。' },
  { number: 12, upKw: ['行动派', '冲刺'],            upMean: '不等想清楚就先上阵。',       rvKw: ['鲁莽', '半途而废'],   rvMean: '冲出去之后发现方向不对。' },
  { number: 13, upKw: ['热情的领袖', '自信'],        upMean: '你是人群中那团发光的火。',   rvKw: ['独断', '虚荣'],       rvMean: '光太强反而让旁边的人不敢靠近。' },
  { number: 14, upKw: ['远见', '愿景'],              upMean: '你已看到很远，带着别人一起走。', rvKw: ['专横', '急躁'],     rvMean: '看得远但等不了他人。' },
];

// Cups — 圣杯（水/温柔：情感、关系、直觉）
const CUPS: MinorData[] = [
  { number: 1,  upKw: ['情感萌芽', '新关系'],         upMean: '一份新情感或创造正在涌出。', rvKw: ['情感堵塞', '错失'],    rvMean: '杯子满了但没人举起它。' },
  { number: 2,  upKw: ['连结', '相互'],               upMean: '对等的两方互相给予。',       rvKw: ['失衡', '误解'],        rvMean: '一方给得多，一方没接住。' },
  { number: 3,  upKw: ['共庆', '朋友'],               upMean: '和值得的人一起高兴。',       rvKw: ['社交疲惫', '闹翻'],    rvMean: '热闹背后有疲惫或裂缝。' },
  { number: 4,  upKw: ['倦怠', '熟视无睹'],           upMean: '你拥有的你不再看见了。',     rvKw: ['觉察', '接受新物'],    rvMean: '一只新的杯子被你注意到了。' },
  { number: 5,  upKw: ['失落', '悔'],                 upMean: '杯子翻了三只，还有两只没翻。', rvKw: ['走出悲伤', '复原'],    rvMean: '伤口在结痂，允许它慢。' },
  { number: 6,  upKw: ['怀旧', '童真'],               upMean: '过去的美好可以温暖此刻。',   rvKw: ['过度回望', '停滞童年'], rvMean: '活在回忆里会错过此刻。' },
  { number: 7,  upKw: ['选择过多', '幻象'],           upMean: '面前七只杯子，一只是真的。', rvKw: ['看清', '筛选'],        rvMean: '终于挑出了真的那个。' },
  { number: 8,  upKw: ['离开', '追寻'],               upMean: '主动放下，走向更深的意义。', rvKw: ['不甘心', '回头'],      rvMean: '身体走了，心还没走。' },
  { number: 9,  upKw: ['心满', '愿成'],               upMean: '想要的到手了，享受这一刻。', rvKw: ['空满', '只是表面'],    rvMean: '得到了但不如想象中满足。' },
  { number: 10, upKw: ['家与圆满', '情感归属'],       upMean: '最柔软的那种幸福。',         rvKw: ['家庭失和', '表面和谐'], rvMean: '该有的都在，裂缝藏在内部。' },
  { number: 11, upKw: ['梦想家', '感性信使'],         upMean: '一个温柔的开始。',           rvKw: ['情绪化', '不成熟'],    rvMean: '心意很纯但撑不起承诺。' },
  { number: 12, upKw: ['浪漫', '追求'],               upMean: '带着真心去追一件事/一个人。', rvKw: ['空想', '不切实'],      rvMean: '只说不做的骑士。' },
  { number: 13, upKw: ['共情', '成熟关怀'],           upMean: '你温柔但不失自己。',         rvKw: ['情绪操控', '耗尽'],    rvMean: '付出太多，反被拖垮。' },
  { number: 14, upKw: ['心智的掌控', '情感的王'],     upMean: '既温柔又有边界，不被情绪推走。', rvKw: ['冷漠', '情感压抑'],  rvMean: '太会控制感情，几乎感觉不到。' },
];

// Swords — 宝剑（风/知识：思考、冲突、真理）
const SWORDS: MinorData[] = [
  { number: 1,  upKw: ['清晰', '洞见'],               upMean: '一把新的剑出鞘，看清楚了。', rvKw: ['混乱', '犹豫'],        rvMean: '想法很多但没有一把是锋利的。' },
  { number: 2,  upKw: ['僵局', '蒙眼选择'],           upMean: '你选择不看，以维持平衡。',   rvKw: ['打破僵局', '决定'],    rvMean: '终于撤下蒙眼布面对了。' },
  { number: 3,  upKw: ['心碎', '痛的真相'],           upMean: '疼，但是清醒。',             rvKw: ['复原', '释怀'],        rvMean: '剑还在但已不深入。' },
  { number: 4,  upKw: ['休整', '暂停'],               upMean: '剑放下，躺平蓄力。',         rvKw: ['重返战场', '疲累回流'], rvMean: '休息不够就重新上。' },
  { number: 5,  upKw: ['惨胜', '得不偿失'],           upMean: '你赢了但代价太大。',         rvKw: ['放下争执', '愿意和解'], rvMean: '不值得的仗你终于不打了。' },
  { number: 6,  upKw: ['过渡', '平静驶离'],           upMean: '从风暴中划向平静的水域。',   rvKw: ['难以离开', '滞留'],    rvMean: '想走但脚还黏在岸上。' },
  { number: 7,  upKw: ['策略', '取巧'],               upMean: '聪明但要小心近乎不诚。',     rvKw: ['被识破', '坦白'],      rvMean: '把偷偷做的事放回桌面。' },
  { number: 8,  upKw: ['自我束缚', '作茧'],           upMean: '绑住你的结是自己打的。',     rvKw: ['解开绳索', '自由'],    rvMean: '往前走一步就发现绑不住你。' },
  { number: 9,  upKw: ['焦虑', '夜半噩梦'],           upMean: '担忧大过实际。',             rvKw: ['清晨', '看清噩梦'],    rvMean: '噩梦醒来发现没有那么糟。' },
  { number: 10, upKw: ['终局', '最糟的谷底'],         upMean: '已经最坏了，也就只能往上。', rvKw: ['复原开始', '抵岸'],    rvMean: '谷底在身后，阳光来了。' },
  { number: 11, upKw: ['警觉', '好奇的思辨'],         upMean: '一双不停观察的眼睛。',       rvKw: ['刻薄', '八卦'],        rvMean: '敏锐变刻薄，小心嘴下留人。' },
  { number: 12, upKw: ['果断', '冲锋'],               upMean: '想到就杀出去。',             rvKw: ['鲁莽', '后果反噬'],    rvMean: '冲得太快会扎到自己。' },
  { number: 13, upKw: ['理性', '独立判断'],           upMean: '不被情绪带偏的那种清醒。',   rvKw: ['苛刻', '冷酷'],        rvMean: '清醒是武器，但今天对自己也收一点。' },
  { number: 14, upKw: ['公正', '智者'],               upMean: '让理性为你服务而非奴役你。', rvKw: ['独裁', '傲慢'],        rvMean: '理性过度成了自我神化。' },
];

// Pentacles — 星币（地/灵巧：物质、实际、身体）
const PENTACLES: MinorData[] = [
  { number: 1,  upKw: ['机会落地', '实物开始'],       upMean: '一个实在的机会放到了你手里。', rvKw: ['错失机会', '浪费'],  rvMean: '机会来过，你没接住。' },
  { number: 2,  upKw: ['平衡两件事', '灵活'],         upMean: '同时处理两件事的节奏感。',   rvKw: ['手忙脚乱', '顾此失彼'], rvMean: '球掉了一个。' },
  { number: 3,  upKw: ['协作', '工艺'],               upMean: '和别人一起把事做扎实。',     rvKw: ['分工不清', '草率'],    rvMean: '细节没对齐，返工警告。' },
  { number: 4,  upKw: ['守成', '积累'],               upMean: '把已有的先攥紧。',           rvKw: ['吝啬', '执着占有'],    rvMean: '抓得太紧反而失去活力。' },
  { number: 5,  upKw: ['困境', '物质匮乏'],           upMean: '寒冷之中，记得门是开的。',   rvKw: ['走出寒夜', '求助成功'], rvMean: '抬头就能看见温暖的窗。' },
  { number: 6,  upKw: ['给予', '公平交换'],           upMean: '给与收都在平衡中流动。',     rvKw: ['不对等', '施舍感'],    rvMean: '施与受变成了控制。' },
  { number: 7,  upKw: ['耐心', '中段复盘'],           upMean: '种下的还没熟，不必天天挖。', rvKw: ['不耐烦', '重新投入'],  rvMean: '想砍掉重来前先确认不是急躁。' },
  { number: 8,  upKw: ['专注', '精进'],               upMean: '一锤一锤地打，真的会变强。', rvKw: ['机械重复', '厌倦'],    rvMean: '重复但没有在进步。' },
  { number: 9,  upKw: ['独立富足', '自得'],           upMean: '靠自己有了属于自己的花园。', rvKw: ['依附', '虚华'],        rvMean: '表面的丰盛，内里并不自由。' },
  { number: 10, upKw: ['传承', '长久之财'],           upMean: '不只眼前，也留给后面的人。', rvKw: ['守不住', '家族压力'],  rvMean: '维护长久需要新的智慧。' },
  { number: 11, upKw: ['学徒', '新技能'],             upMean: '低头认真学一样东西的时候。', rvKw: ['三分钟热度', '分心'],  rvMean: '开始了很多，一个都没沉下去。' },
  { number: 12, upKw: ['踏实', '不紧不慢'],           upMean: '慢慢来比较快。',             rvKw: ['迟滞', '过度谨慎'],    rvMean: '慢到别人都绕过你了。' },
  { number: 13, upKw: ['务实温暖', '生活家'],         upMean: '把日子过得精致而真实。',     rvKw: ['过度操劳', '物欲'],    rvMean: '操持太多忘记享受。' },
  { number: 14, upKw: ['富足的守护者', '稳'],         upMean: '资源在手，别人也因你受益。', rvKw: ['吝啬', '功利'],        rvMean: '再多也不肯流出的守财奴。' },
];

function buildMinors(suit: TarotSuit, data: MinorData[]): TarotCardData[] {
  const meta = SUIT_META[suit];
  return data.map(d => ({
    id: `${suit}_${d.number}`,
    arcana: 'minor' as TarotArcana,
    number: d.number,
    suit,
    name: `${meta.name}${RANK_NAMES_CN[d.number]}`,
    nameEn: `${RANK_NAMES[d.number]} of ${suit.charAt(0).toUpperCase()}${suit.slice(1)}`,
    upright:  { keywords: d.upKw, meaning: d.upMean },
    reversed: { keywords: d.rvKw, meaning: d.rvMean },
    relatedAttribute: meta.attr,
    accent: meta.color,
  }));
}

export const MINOR_ARCANA: TarotCardData[] = [
  ...buildMinors('wands',     WANDS),
  ...buildMinors('cups',      CUPS),
  ...buildMinors('swords',    SWORDS),
  ...buildMinors('pentacles', PENTACLES),
];

export const ALL_TAROT: TarotCardData[] = [...MAJOR_ARCANA, ...MINOR_ARCANA];

export const TAROT_BY_ID: Record<string, TarotCardData> = Object.fromEntries(
  ALL_TAROT.map(c => [c.id, c])
);

// ── 牌阵（中长期占卜按周期切换） ────────────────────────────
export type LongReadingPeriod = 'recent' | 'midterm' | 'longterm';

export const SPREAD_POSITIONS: Record<LongReadingPeriod, [string, string, string]> = {
  recent:   ['昨日', '今日', '明日'],
  midterm:  ['现状', '阻碍', '方向'],
  longterm: ['根基', '进程', '结果'],
};

export const PERIOD_LABELS: Record<LongReadingPeriod, { label: string; hint: string; days: string }> = {
  recent:   { label: '最近',       hint: '这几天的走向',     days: '未来 2–3 天' },
  midterm:  { label: '一段时间',   hint: '几周内的脉络',     days: '2–4 周' },
  longterm: { label: '长远打算',   hint: '月或更久的长期',   days: '数月以上' },
};

// ── 工具函数 ────────────────────────────────────────────────

/** 随机抽 n 张不同的牌，可选限定集合 */
export function drawRandomCards(n: number, pool: TarotCardData[] = ALL_TAROT): TarotCardData[] {
  const copy = [...pool];
  const out: TarotCardData[] = [];
  while (out.length < n && copy.length > 0) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

/** 随机正/逆位，逆位 35% 概率（略低，保证正位更常见） */
export function randomOrientation(): TarotOrientation {
  return Math.random() < 0.35 ? 'reversed' : 'upright';
}

// ── 吉凶：规则兜底 + 展示元数据 ─────────────────────────────

type MajorPolarity = 'very_positive' | 'positive' | 'heavy';

/** 22 张大阿卡纳的基础极性（用于吉凶兜底计算；AI 返回优先使用） */
const MAJOR_POLARITY: Record<string, MajorPolarity> = {
  fool:             'positive',
  magician:         'positive',
  high_priestess:   'positive',
  empress:          'very_positive',
  emperor:          'positive',
  hierophant:       'positive',
  lovers:           'very_positive',
  chariot:          'positive',
  strength:         'very_positive',
  hermit:           'positive',
  wheel_of_fortune: 'positive',
  justice:          'positive',
  hanged_man:       'heavy',
  death:            'heavy',
  temperance:       'very_positive',
  devil:            'heavy',
  tower:            'heavy',
  star:             'very_positive',
  moon:             'heavy',
  sun:              'very_positive',
  judgement:        'positive',
  world:            'very_positive',
};

/** 以卡面 + 正/逆位规则计算吉凶（小阿卡纳按花色元素粗略映射） */
export function inferFortune(cardId: string, orientation: TarotOrientation): Fortune {
  const card = TAROT_BY_ID[cardId];
  // 小阿卡纳：按花色给一个中位值
  let polarity: MajorPolarity;
  if (card?.arcana === 'minor') {
    // Wands/Pentacles 偏阳性，Cups/Swords 偏中性
    polarity = (card.suit === 'wands' || card.suit === 'pentacles') ? 'positive' : 'positive';
  } else {
    polarity = MAJOR_POLARITY[cardId] ?? 'positive';
  }

  if (polarity === 'very_positive') return orientation === 'upright' ? 'great' : 'good';
  if (polarity === 'positive')      return orientation === 'upright' ? 'good'  : 'small';
  /* heavy */                       return orientation === 'upright' ? 'small' : 'bad';
}

export const FORTUNE_ORDER: Fortune[] = ['great', 'good', 'small', 'bad'];

export interface FortuneMeta {
  label: string;
  icon: string;
  accent: string;     // 前景/描边色
  ring: string;       // box-shadow 色（含透明度）
  /** Tailwind 渐变背景类（浅/深色态） */
  bgClass: string;
  borderClass: string;
  textClass: string;
}

export const FORTUNE_META: Record<Fortune, FortuneMeta> = {
  great: {
    label: '大吉', icon: '✨', accent: '#D4AF37', ring: 'rgba(212,175,55,0.45)',
    bgClass: 'bg-gradient-to-br from-amber-100 to-yellow-100 dark:from-amber-900/40 dark:to-yellow-900/30',
    borderClass: 'border-amber-300 dark:border-amber-600/60',
    textClass: 'text-amber-800 dark:text-amber-200',
  },
  good: {
    label: '中吉', icon: '🌿', accent: '#10B981', ring: 'rgba(16,185,129,0.35)',
    bgClass: 'bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/25 dark:to-teal-900/15',
    borderClass: 'border-emerald-200 dark:border-emerald-700/60',
    textClass: 'text-emerald-800 dark:text-emerald-200',
  },
  small: {
    label: '小吉', icon: '🕊', accent: '#3B82F6', ring: 'rgba(59,130,246,0.30)',
    bgClass: 'bg-gradient-to-br from-sky-50 to-indigo-50 dark:from-sky-900/25 dark:to-indigo-900/15',
    borderClass: 'border-sky-200 dark:border-sky-700/60',
    textClass: 'text-sky-800 dark:text-sky-200',
  },
  bad: {
    label: '凶', icon: '⚠', accent: '#B91C1C', ring: 'rgba(185,28,28,0.35)',
    bgClass: 'bg-gradient-to-br from-rose-50 to-red-50 dark:from-rose-950/40 dark:to-red-950/30',
    borderClass: 'border-rose-200 dark:border-rose-700/60',
    textClass: 'text-rose-800 dark:text-rose-200',
  },
};

/** 正位 [1.7, 2.0]，逆位 [1.5, 1.7]（逆位倍率略低） */
export function randomBonusMultiplier(orientation: TarotOrientation): number {
  const roll = Math.random();
  if (orientation === 'upright') {
    return roll < 0.5 ? 1.7 : 2.0;
  }
  return roll < 0.5 ? 1.5 : 1.7;
}
