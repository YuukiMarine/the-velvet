import type { UIChannel } from '@/ui/channel';

/**
 * 塔罗牌面美术 —— 三个频道各一套 22 张大阿卡纳（用户提供的 PNG 原稿经压缩后存
 * public/tarot/{p3,p4,p5}/<cardId>.webp，560×896，约 3.8 MB / 66 张）。
 *
 * 归位口径：按牌名（slug）而不是编号——P5 那套走 Thoth 序（VIII=Justice / XI=Strength），
 * 与 P3/P4 的 Rider-Waite 序正好对调，按编号会整套错位。牌面上印的罗马数字因此可能
 * 与 app 内 card.roman 不一致，这是原稿的编号体系差异，未做改动。
 *
 * 小阿卡纳没有配图，返回 null → TarotCardSVG 退回原来的程序化卡面。
 * WebP 不在 PWA 预缓存的 globPatterns 里（见 vite.config.ts），首次访问后由 runtimeCaching 收编，
 * 不会把安装包撑大；加载失败时组件同样退回程序化卡面。
 */
const MAJOR_WITH_ART = new Set([
  'fool', 'magician', 'high_priestess', 'empress', 'emperor', 'hierophant',
  'lovers', 'chariot', 'strength', 'hermit', 'wheel_of_fortune', 'justice',
  'hanged_man', 'death', 'temperance', 'devil', 'tower', 'star',
  'moon', 'sun', 'judgement', 'world',
]);

/** neutral（默认蓝）与 p3 同用水下那套 */
const setOf = (channel: UIChannel): 'p3' | 'p4' | 'p5' =>
  channel === 'p4' ? 'p4' : channel === 'p5' ? 'p5' : 'p3';

export const tarotArtUrl = (cardId: string, channel: UIChannel): string | null =>
  MAJOR_WITH_ART.has(cardId) ? `${import.meta.env.BASE_URL}tarot/${setOf(channel)}/${cardId}.webp` : null;
