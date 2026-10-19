/**
 * 「清空数据」时一并清掉的本机缓存（第 31 批 · PRD §25.3 第 7 条）。
 *
 * 这些都是从用户数据派生出来、只存在 localStorage 里的东西：助手「提过没有」的账本、AI 任务的半成品、
 * 今日委托的缓存……表清空了它们还在，就会出现「数据没了、助手还记得昨天提过什么」「缓存的自定义人格还顶着」。
 * 不在这里的（故意留着）：同步记账（上次同步时间 / 云端版本 / 账号归属——换号保护要用）、设备偏好（侧栏布局 /
 * 线路 / 开屏缓存 / 性能降级）、组织和羁绊的本机标记（跟云端账号走，不跟本地数据走）、弹幕屏蔽名单。
 */
const DATA_CACHE_KEYS = [
  // 助手
  'velvet.navTopics.v1', 'velvet.navPush.v1', 'velvet.navOwnDay.v1', 'velvet.navOwnDayMentioned.v1',
  'velvet.navCare.v1', 'velvet.navAssoc.v1', 'velvet.navBond.v1', 'velvet.navActivePreset.v1',
  'velvet.navMissingPresetNotice.v1', 'velvet.reportNotice.v1', 'velvet:aiDiag.v1',
  // AI 任务的半成品 / 草稿
  'velvet:revealJob.stratum.v1', 'velvet:revealJob.final.v1', 'velvet:moonJob',
  'velvet.dailyDraw.pending.v1', 'velvet.longReading.pending.v1', 'velvet.followUp.pending.v1',
  'velvet.summary.draft.v1', 'velvet.autoSummary.v1', 'velvet-notif-voice-v1',
  // 委托 / 愿望 / 同伴
  'velvet:lifeQuests.v1', 'velvet:lifeQuestLog.v1', 'velvet:lifeQuestAI.v1', 'velvet:questBoardSeenWeek.v1',
  'velvet:wish-proposal-cooldown', 'velvet:coop.pendingDescription.v1',
];

export function clearLocalDataCaches(): number {
  let n = 0;
  for (const k of DATA_CACHE_KEYS) {
    try {
      if (localStorage.getItem(k) !== null) { localStorage.removeItem(k); n++; }
    } catch { /* localStorage 不可用：没东西可清 */ }
  }
  return n;
}

export const _DATA_CACHE_KEYS_FOR_TEST = DATA_CACHE_KEYS;
