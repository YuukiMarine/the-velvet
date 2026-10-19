/**
 * navigatorCardImages — 助手「记录活动」卡片上挂着的图片（第 28 批）。
 *
 * 用户反馈：助手记事件也应该能选图。图片在卡片**确认之前**只在内存里（压好的原图 + 缩略图，
 * 不进卡片草稿 JSON——那条要落库，塞 base64 太大），确认时随记录一起 addActivityImages 存进图片表；
 * 取消 / 关 App 就丢了（重开后卡片还在，图没了，再编辑补上即可）。
 *   · 卡片表单「添加图片」→ setCardImages(cardId, imgs)
 *   · 这一轮用户随消息发了图、分诊开出了记录卡 → attachDataUrlsToCard 自动挂到第一张记录卡上
 */
import { create } from 'zustand';
import { prepareActivityImage, MAX_IMAGES_PER_ACTIVITY, type PreparedImage } from '@/utils/activityImages';

interface State { byCard: Record<string, PreparedImage[]> }

export const useCardImages = create<State>(() => ({ byCard: {} }));

const EMPTY: PreparedImage[] = [];

export const cardImagesOf = (cardId: string | null | undefined): PreparedImage[] =>
  (cardId ? useCardImages.getState().byCard[cardId] : undefined) ?? EMPTY;

/** 组件订阅某张卡的图（没有就是同一个空数组，引用稳定） */
export const useCardImageList = (cardId: string | null | undefined): PreparedImage[] =>
  useCardImages((s) => (cardId ? s.byCard[cardId] : undefined) ?? EMPTY);

export function setCardImages(cardId: string, imgs: PreparedImage[]): void {
  useCardImages.setState((s) => {
    const next = { ...s.byCard };
    if (imgs.length) next[cardId] = imgs.slice(0, MAX_IMAGES_PER_ACTIVITY);
    else delete next[cardId];
    return { byCard: next };
  });
}

/** 取走（确认落库 / 取消卡片时用）：返回后这张卡上就没有图了 */
export function takeCardImages(cardId: string): PreparedImage[] {
  const imgs = cardImagesOf(cardId);
  if (imgs.length) useCardImages.setState((s) => { const next = { ...s.byCard }; delete next[cardId]; return { byCard: next }; });
  return imgs;
}

/** dataURL（随消息发出的那张图）→ 压成配图规格挂到卡上（已有的保留，合计不超过上限） */
export async function attachDataUrlsToCard(cardId: string, dataUrls: string[]): Promise<number> {
  const prepared: PreparedImage[] = [];
  for (const u of dataUrls.slice(0, MAX_IMAGES_PER_ACTIVITY)) {
    try {
      const blob = await (await fetch(u)).blob();
      prepared.push(await prepareActivityImage(blob));
    } catch { /* 这张解不开就跳过 */ }
  }
  if (!prepared.length) return 0;
  const merged = [...cardImagesOf(cardId), ...prepared].slice(0, MAX_IMAGES_PER_ACTIVITY);
  setCardImages(cardId, merged);
  return prepared.length;
}
