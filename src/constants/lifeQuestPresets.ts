import type { AttributeId } from '@/types';

/**
 * 今日委托题库（人工维护；第 16 批从 utils/lifeQuests.ts 搬出来单放）。这里只有内容，怎么出题在 utils/lifeQuests.ts。
 *
 * 一条一行，字段：
 *   id         编号。本机学习按它记账：改标题、改提示都不用动它；新加的接着往后编，删掉的号别再拿来用
 *   attribute  加哪一维：knowledge 知识 · guts 胆量 · dexterity 灵巧 · kindness 温柔 · charm 魅力
 *   title      卡片标题。可以带一个 {x}，出题时从 slots 里挑一个词填进去（同一天同一张卡填的词不变）
 *   slots      {x} 的候选词，至少两个；标题里没有 {x} 就别写
 *   points     完成加几点：1 顺手的小事 · 2 要花点时间 · 3 要下点决心
 *   hint       标题下面那行小字
 *   tags       情境标签，可以不写，也可以写几个：
 *                outdoor  在户外做：下雨、下雪、雷暴、雾霾、太热太冷时不出（已经包含 out，不用再写 out）
 *                out      要出门（去店里、影院、图书馆……）：暴雨、雷暴、下雪时少出
 *                spend    要花钱
 *                social   要和别人打交道
 *                move     要动起来、出点汗
 *                weekend  周末更合适：周末多出、工作日少出
 *                weekday  工作日更合适：反过来
 *              out / spend / social / move 还用来学偏好：这一类总被换掉就少出，总被做完就多出
 *   until      到这个钟点就不出了，例如 until: 20 = 晚上 8 点以后打开不出这张。
 *              按当天第一次打开委托板、或点「换一批」那一刻算；凌晨 5 点前打开不管这一条（一整天还在前头）。
 *              不写 = 什么时候都能出
 */

export type LifeQuestTag = 'outdoor' | 'out' | 'spend' | 'social' | 'move' | 'weekend' | 'weekday';

export interface LifeQuestPreset {
  id: string;
  attribute: AttributeId;
  /** 可含 {x}，由 slots 填 */
  title: string;
  slots?: string[];
  points: 1 | 2 | 3;
  hint: string;
  tags?: LifeQuestTag[];
  /** 到这个钟点（0–24）就不出 */
  until?: number;
}

export const LIFE_QUEST_PRESETS: readonly LifeQuestPreset[] = [
  // ── 知识 ──
  { id: 'k01', attribute: 'knowledge', title: '学半小时一样新东西', points: 2, hint: '任何你好奇的都算' },
  { id: 'k02', attribute: 'knowledge', title: '读完一本书里的 20 页', points: 2, hint: '纸书、电子书都行' },
  { id: 'k03', attribute: 'knowledge', title: '看一部{x}纪录片', slots: ['历史', '自然', '美食', '科技', '人物', '城市'], points: 2, hint: '挑一部短的也行' },
  { id: 'k04', attribute: 'knowledge', title: '记住 10 个外语单词', points: 1, hint: '睡前再过一遍' },
  { id: 'k05', attribute: 'knowledge', title: '听一期{x}播客', slots: ['历史', '科普', '商业', '文化', '心理学'], points: 1, hint: '通勤路上就能做' },
  { id: 'k06', attribute: 'knowledge', title: '查清一个一直好奇的问题', points: 1, hint: '查完用三句话讲给自己听' },
  { id: 'k07', attribute: 'knowledge', title: '写 100 字今日学习笔记', points: 1, hint: '今天学到的任何一件事' },
  { id: 'k08', attribute: 'knowledge', title: '去书店或图书馆待半小时', points: 2, hint: '随手翻翻也算', tags: ['out'], until: 20 },
  { id: 'k09', attribute: 'knowledge', title: '学会一个新的软件技巧', points: 1, hint: '快捷键、公式、剪辑都行' },
  { id: 'k10', attribute: 'knowledge', title: '专注 25 分钟做一件正事', points: 2, hint: '一个番茄钟，手机放远点' },
  { id: 'k11', attribute: 'knowledge', title: '读一篇{x}长文', slots: ['科普', '历史', '人物', '城市观察'], points: 1, hint: '读完记一句最有意思的' },
  { id: 'k12', attribute: 'knowledge', title: '认识一种路边的植物', points: 1, hint: '拍下来查查它叫什么', tags: ['outdoor'], until: 18 },
  // 第 16 批新增
  { id: 'k13', attribute: 'knowledge', title: '看一节{x}公开课', slots: ['历史', '心理学', '经济学', '天文', '艺术史'], points: 2, hint: '大学公开课、讲座录像都行' },
  { id: 'k14', attribute: 'knowledge', title: '解一道数独，或下一盘棋', points: 1, hint: '动动脑子，输赢不重要' },
  { id: 'k15', attribute: 'knowledge', title: '逛一次博物馆', points: 3, hint: '挑一个展厅慢慢看', tags: ['out', 'weekend'], until: 15 },
  { id: 'k16', attribute: 'knowledge', title: '把收藏夹里吃灰的三篇看掉', points: 1, hint: '看完就取消收藏' },

  // ── 胆量 ──
  { id: 'g01', attribute: 'guts', title: '把拖了一周的那件小事做掉', points: 2, hint: '越小越好，做完就算' },
  { id: 'g02', attribute: 'guts', title: '去一家没去过的{x}吃一顿', slots: ['面馆', '小吃店', '川菜馆', '粤菜馆', '日料店', '西餐厅', '火锅店'], points: 2, hint: '附近的就行', tags: ['out', 'spend'], until: 20 },
  { id: 'g03', attribute: 'guts', title: '{x} 20 分钟', slots: ['跑步', '快走', '骑车'], points: 2, hint: '量力而行，出汗就好', tags: ['outdoor', 'move'], until: 22 },
  { id: 'g04', attribute: 'guts', title: '尝一道从没吃过的菜', points: 1, hint: '点外卖也算', tags: ['spend'] },
  { id: 'g05', attribute: 'guts', title: '一个人去看一场电影', points: 2, hint: '选一部你自己想看的', tags: ['out', 'spend'], until: 21 },
  { id: 'g06', attribute: 'guts', title: '换一条没走过的路回家', points: 1, hint: '顺便看看沿路有什么', tags: ['out', 'weekday'], until: 19 },
  { id: 'g07', attribute: 'guts', title: '爬一次楼梯代替电梯', points: 1, hint: '几层都算', tags: ['move'] },
  { id: 'g08', attribute: 'guts', title: '报名一件一直想试的事', points: 3, hint: '课程、比赛、活动、兴趣班' },
  { id: 'g09', attribute: 'guts', title: '比平时早起 30 分钟', points: 2, hint: '起来先别刷手机', until: 10 },
  { id: 'g10', attribute: 'guts', title: '关掉手机一小时', points: 1, hint: '做点别的，不看也不回' },
  { id: 'g11', attribute: 'guts', title: '主动提一个问题', points: 2, hint: '课上、会上或群里都行', tags: ['social', 'weekday'] },
  { id: 'g12', attribute: 'guts', title: '把一个想了很久的想法说给一个人听', points: 2, hint: '说出来就算', tags: ['social'] },
  // 第 16 批新增（g13 是从 g03 拆出来的室内版）
  { id: 'g13', attribute: 'guts', title: '{x} 15 分钟', slots: ['跳绳', '平板支撑加深蹲', '跟着视频做操'], points: 2, hint: '在家就能做，出汗就好', tags: ['move'] },
  { id: 'g14', attribute: 'guts', title: '去一个没去过的公园或街区走走', points: 2, hint: '走上一小时，路线随意', tags: ['outdoor', 'weekend'], until: 18 },
  { id: 'g15', attribute: 'guts', title: '试一项没玩过的运动', points: 2, hint: '羽毛球、游泳、飞盘、攀岩都行', tags: ['out', 'move', 'weekend'], until: 20 },
  { id: 'g16', attribute: 'guts', title: '对一件不想做的事说一次「不」', points: 2, hint: '委婉地说也算', tags: ['social'] },

  // ── 灵巧 ──
  { id: 'd01', attribute: 'dexterity', title: '给自己做一份{x}', slots: ['家常菜', '甜点', '便当', '水果拼盘'], points: 2, hint: '简单的也算' },
  { id: 'd02', attribute: 'dexterity', title: '收拾好书桌', points: 1, hint: '只收桌面也算' },
  { id: 'd03', attribute: 'dexterity', title: '拉伸 15 分钟', points: 1, hint: '跟着视频做', tags: ['move'] },
  { id: 'd04', attribute: 'dexterity', title: '学一个小手工：{x}', slots: ['折纸', '编手绳', '简笔画', '新的叠衣服方法'], points: 2, hint: '跟着教程做一个' },
  { id: 'd05', attribute: 'dexterity', title: '拍一组「{x}」主题照片', slots: ['光影', '红色', '窗外', '影子', '街角', '天空'], points: 1, hint: '三张就够', until: 19 },
  { id: 'd06', attribute: 'dexterity', title: '练字 15 分钟', points: 1, hint: '抄一段喜欢的话' },
  { id: 'd07', attribute: 'dexterity', title: '修好一件小东西', points: 2, hint: '松掉的螺丝、开线的扣子' },
  { id: 'd08', attribute: 'dexterity', title: '画一张速写', points: 1, hint: '画什么都行，十分钟就好' },
  { id: 'd09', attribute: 'dexterity', title: '清理手机相册', points: 1, hint: '删掉 50 张不要的' },
  { id: 'd10', attribute: 'dexterity', title: '规划一条周末小路线', points: 1, hint: '把想去的两三个地方连起来', tags: ['weekday'] },
  { id: 'd11', attribute: 'dexterity', title: '跟着视频学一段简单的舞步', points: 2, hint: '一小段就好', tags: ['move'] },
  { id: 'd12', attribute: 'dexterity', title: '把衣柜整理出一格', points: 1, hint: '顺手挑出不穿的' },
  // 第 16 批新增（d13 是从 d01 的「早餐」拆出来的，只在上午出）
  { id: 'd13', attribute: 'dexterity', title: '自己做一顿早餐', points: 2, hint: '煎个蛋、热杯奶也算', until: 10 },
  { id: 'd14', attribute: 'dexterity', title: '学会打一种绳结', points: 1, hint: '平结、八字结、领带结都行' },
  { id: 'd15', attribute: 'dexterity', title: '用手机剪一条一分钟的小视频', points: 2, hint: '素材就用相册里的' },
  { id: 'd16', attribute: 'dexterity', title: '种下一颗种子，或扦插一枝绿植', points: 2, hint: '豆子、葱头、绿萝都行' },

  // ── 温柔 ──
  { id: 'n01', attribute: 'kindness', title: '给家人打个电话', points: 2, hint: '聊聊近况', tags: ['social'], until: 22 },
  { id: 'n02', attribute: 'kindness', title: '给很久没联系的朋友发条消息', points: 1, hint: '问一句最近好吗', tags: ['social'] },
  { id: 'n03', attribute: 'kindness', title: '认真夸一个人一次', points: 1, hint: '说具体的地方', tags: ['social'] },
  { id: 'n04', attribute: 'kindness', title: '帮身边的人做一件小事', points: 2, hint: '递个东西、搭把手都算', tags: ['social'] },
  { id: 'n05', attribute: 'kindness', title: '写下今天感激的三件事', points: 1, hint: '小事也行' },
  { id: 'n06', attribute: 'kindness', title: '整理出一件可以送人的闲置', points: 1, hint: '给需要的人' },
  { id: 'n07', attribute: 'kindness', title: '今晚 23 点前睡', points: 2, hint: '对自己温柔一点', until: 22 },
  { id: 'n08', attribute: 'kindness', title: '听一个人把一件事说完', points: 1, hint: '不打断，不急着给建议', tags: ['social'] },
  { id: 'n09', attribute: 'kindness', title: '照顾一株植物或一只小动物', points: 1, hint: '浇水、喂食、陪它玩' },
  { id: 'n10', attribute: 'kindness', title: '给明天的自己留一句话', points: 1, hint: '写在便签或备忘录里' },
  { id: 'n11', attribute: 'kindness', title: '给朋友推荐一样你喜欢的东西', points: 1, hint: '一首歌、一本书、一家店', tags: ['social'] },
  { id: 'n12', attribute: 'kindness', title: '认真吃一顿饭，不看手机', points: 1, hint: '慢一点' },
  // 第 16 批新增
  { id: 'n13', attribute: 'kindness', title: '泡个热水澡或泡个脚', points: 1, hint: '给自己放松一下' },
  { id: 'n14', attribute: 'kindness', title: '做 10 分钟冥想或深呼吸', points: 1, hint: '跟着引导音频做' },
  { id: 'n15', attribute: 'kindness', title: '给家人或室友准备一个小惊喜', points: 2, hint: '一份水果、一张便条都行', tags: ['social'] },
  { id: 'n16', attribute: 'kindness', title: '给一家喜欢的店写条好评', points: 1, hint: '认真写两句具体的' },

  // ── 魅力 ──
  { id: 'c01', attribute: 'charm', title: '看一部{x}电影', slots: ['悬疑', '喜剧', '动画', '科幻', '老', '外语', '高分冷门'], points: 2, hint: '看完想想最喜欢哪一幕' },
  { id: 'c02', attribute: 'charm', title: '听完一张完整的专辑', points: 1, hint: '按顺序，从头到尾' },
  { id: 'c03', attribute: 'charm', title: '换一身认真搭配的衣服出门', points: 1, hint: '给自己看的也算', tags: ['out'], until: 19 },
  { id: 'c04', attribute: 'charm', title: '去一家没去过的咖啡店坐坐', points: 2, hint: '奶茶店也行', tags: ['out', 'spend'], until: 20 },
  { id: 'c05', attribute: 'charm', title: '和一个人好好聊 10 分钟', points: 2, hint: '面对面或打电话', tags: ['social'] },
  { id: 'c06', attribute: 'charm', title: '发一条分享生活的动态', points: 1, hint: '分享一件今天的小事' },
  { id: 'c07', attribute: 'charm', title: '给朋友或自己拍一张好看的照片', points: 1, hint: '找找光' },
  { id: 'c08', attribute: 'charm', title: '尝一种没喝过的饮品', points: 1, hint: '茶、咖啡、果汁都行', tags: ['spend'] },
  { id: 'c09', attribute: 'charm', title: '给房间换一个小布置', points: 1, hint: '挪挪摆件、换张海报' },
  { id: 'c10', attribute: 'charm', title: '去一个线下活动', points: 3, hint: '展览、市集、讲座都行', tags: ['out', 'weekend'], until: 19 },
  { id: 'c11', attribute: 'charm', title: '花 15 分钟打理一下自己', points: 1, hint: '发型、护肤、修指甲' },
  { id: 'c12', attribute: 'charm', title: '学一首歌，能完整哼下来', points: 1, hint: '挑一首最近在听的' },
  // 第 16 批新增
  { id: 'c13', attribute: 'charm', title: '读一首诗，抄下最喜欢的一句', points: 1, hint: '古诗、现代诗都行' },
  { id: 'c14', attribute: 'charm', title: '给今天挑一首主题曲', points: 1, hint: '循环一整天也行' },
  { id: 'c15', attribute: 'charm', title: '去看一次日落或夜景', points: 2, hint: '找个高一点、开阔一点的地方', tags: ['outdoor'], until: 22 },
  { id: 'c16', attribute: 'charm', title: '写一段影评或书评', points: 1, hint: '一百字就好，说说哪里打动你' },
];
