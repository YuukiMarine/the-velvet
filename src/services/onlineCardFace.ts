/**
 * 未缔结在线好友的自裁卡面存取（db.onlineCardFaces，v14）。
 *
 * 为什么单独一张表而不是塞进 settings / confidants：
 *   - 未缔结的好友**本地没有 Confidant 行**，无处可挂，只能按云端 user id 索引；
 *   - settings 会整行上云，这里是 base64 大图 + 他人肖像，口径同
 *     confidants.customAvatarDataUrl——只留本机。表不在 sync.ts 的 SYNC_TABLES
 *     白名单里，天然不同步；本地备份若整库导出则随库走，这是允许的。
 *
 * 缔结时的交接见 services/social.ts materializeCoopBonds：卡面搬进新建同伴的
 * cardFaceDataUrl（avatarAsCardFace=true），随后清掉这行，不留孤儿。
 */
import { db } from '@/db';

export const getAllOnlineCardFaces = async (): Promise<Record<string, string>> => {
  try {
    const rows = await db.onlineCardFaces.toArray();
    return Object.fromEntries(rows.map(r => [r.userId, r.dataUrl]));
  } catch {
    return {};
  }
};

export const getOnlineCardFace = async (userId: string): Promise<string | undefined> => {
  try {
    return (await db.onlineCardFaces.get(userId))?.dataUrl;
  } catch {
    return undefined;
  }
};

export const setOnlineCardFace = async (userId: string, dataUrl: string): Promise<void> => {
  await db.onlineCardFaces.put({ userId, dataUrl, updatedAt: new Date() });
};

export const clearOnlineCardFace = async (userId: string): Promise<void> => {
  try {
    await db.onlineCardFaces.delete(userId);
  } catch {
    /* 清不掉也只是留一行孤儿，无碍 */
  }
};
