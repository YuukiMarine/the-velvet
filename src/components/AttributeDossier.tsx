/**
 * AttributeDossier —— 星象仪点角打开的属性档案弹窗（PRD_V2.5_FINAL §4.2）。
 *
 * 内容三段：当前状态（等级/称号/下一级进度）→ 称号阶梯 → 关联成就。
 * 成就过滤：condition.attribute === attrId（attribute_level 类）∪ all_attributes_max（全维共有）。
 * 基座：SheetModal（bottom 抽屉）+ originRef 形状记忆生长（从被点的贴纸长出来）。
 */
import type { RefObject } from 'react';
import { useAppStore } from '@/store';
import type { AttributeId } from '@/types';
import { SheetModal } from '@/components/SheetModal';
import { PersonaProgress } from '@/ui/components/PersonaProgress';
import { getAttributeLevelTitle, getMasteryTitle } from '@/utils/attributeLevelTitles';
import { masteryOf } from '@/utils/levels';
import { resolveLevelDifficulty } from '@/utils/levelDifficulty';

export interface AttributeDossierProps {
  attrId: AttributeId | null;
  onClose: () => void;
  originRef?: RefObject<HTMLElement | null>;
}

export const AttributeDossier = ({ attrId, onClose, originRef }: AttributeDossierProps) => {
  // 逐字段订阅（A2）：首页常驻件，别让每次 store 写入都把它重算一遍
  const attributes = useAppStore(s => s.attributes);
  const achievements = useAppStore(s => s.achievements);
  const settings = useAppStore(s => s.settings);

  const attr = attrId ? attributes.find((a) => a.id === attrId) : undefined;
  const thresholds = settings.levelThresholds?.length ? settings.levelThresholds : attr?.levelThresholds ?? [];
  const lvlMax = thresholds.length || 5;

  const level = attr?.level ?? 1;
  const isMax = level >= lvlMax;
  const curThreshold = level > 1 ? thresholds[level - 1] : 0;
  const nextThreshold = !isMax ? thresholds[level] : thresholds[lvlMax - 1];
  const points = attr?.points ?? 0;
  // 精通（第 6 轮）：满 10 级后每 500 / 700 点一颗星；进度条与称号都改走精通口径
  const mastery = isMax ? masteryOf(points, thresholds, resolveLevelDifficulty(settings)) : null;
  const stars = mastery?.stars ?? 0;
  const progress = mastery ? mastery.progress : isMax ? 1 : Math.max(0, Math.min(1, (points - curThreshold) / Math.max(1, nextThreshold - curThreshold)));
  const progressLabel = isMax ? (mastery ? `精通 ★${stars} · 距下一颗` : '已达最高等级') : `距 Lv.${level + 1}`;
  const progressValue = isMax ? (mastery ? `${mastery.step - mastery.toNext}/${mastery.step}` : 'MAX') : `${points - curThreshold}/${nextThreshold - curThreshold}`;

  const name = attr ? (settings.attributeNames?.[attr.id as AttributeId] || attr.displayName) : '';
  const curTitle = attrId ? (stars > 0 ? getMasteryTitle(attrId, stars) : getAttributeLevelTitle(settings.attributeLevelTitles, attrId, level)) : '';

  const related = attrId
    ? achievements.filter(
        (a) => a.condition.attribute === attrId || a.condition.type === 'all_attributes_max',
      )
    : [];

  return (
    <SheetModal
      isOpen={!!attrId}
      onClose={onClose}
      title={attr ? `${name} · 档案` : ''}
      originRef={originRef}
      maxHeightClass="max-h-[78vh]"
    >
      {attr && attrId && (
        <div className="space-y-5 pb-2">
          {/* 当前状态 */}
          <div className="rounded-xl bg-gray-50 px-4 py-3.5 dark:bg-gray-800/60">
            <div className="flex items-baseline justify-between">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black tabular-nums text-primary">Lv.{level}{stars > 0 && <span className="ml-0.5 text-[13px]">★{stars}</span>}</span>
                <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{curTitle}</span>
              </div>
              <span className="text-xs tabular-nums text-gray-400">{points} pt</span>
            </div>
            <PersonaProgress
              className="mt-2.5"
              channel="neutral"
              value={progress}
              label={progressLabel}
              valueText={progressValue}
            />
          </div>

          {/* 称号阶梯 */}
          <div>
            <div className="mb-2 text-[11px] font-bold tracking-wider text-gray-400 dark:text-gray-500">称号阶梯</div>
            <div className="space-y-1">
              {Array.from({ length: lvlMax }, (_, i) => {
                const lv = i + 1;
                const reached = level >= lv;
                const current = level === lv;
                return (
                  <div
                    key={lv}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm ${
                      current
                        ? 'bg-primary/10 font-bold text-primary'
                        : reached
                          ? 'text-gray-700 dark:text-gray-200'
                          : 'text-gray-300 dark:text-gray-600'
                    }`}
                  >
                    <span className="w-10 shrink-0 text-[11px] font-bold tabular-nums">Lv.{lv}</span>
                    <span className="flex-1">{getAttributeLevelTitle(settings.attributeLevelTitles, attrId, lv)}</span>
                    {current && <span className="text-[10px] font-black">◀ 现在</span>}
                    {/* 到达 Lv(n) 的累计门槛 = thresholds[n-1]（与 Dashboard nextThreshold=thresholds[level] 同一套语义） */}
                    {!reached && <span className="text-[10px] tabular-nums">{thresholds[i] ?? 0} pt</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 精通（第 6 轮）：满级后的星阶，只在站上 Lv.10 时出现 */}
          {mastery && (
            <div>
              <div className="mb-2 text-[11px] font-bold tracking-wider text-gray-400 dark:text-gray-500">精通 · 每 {mastery.step} 点一颗星</div>
              <div className="space-y-1">
                {Array.from({ length: stars + 1 }, (_, k) => k + 1).map((k) => {
                  const reached = k <= stars;
                  const current = k === stars;
                  return (
                    <div
                      key={k}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm ${
                        current && reached ? 'bg-primary/10 font-bold text-primary' : reached ? 'text-gray-700 dark:text-gray-200' : 'text-gray-300 dark:text-gray-600'
                      }`}
                    >
                      <span className="w-10 shrink-0 text-[11px] font-bold tabular-nums">★{k}</span>
                      <span className="flex-1">{getMasteryTitle(attrId, k)}</span>
                      {current && reached && <span className="text-[10px] font-black">◀ 现在</span>}
                      {!reached && <span className="text-[10px] tabular-nums">还差 {mastery.toNext} pt</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 关联成就 */}
          <div>
            <div className="mb-2 text-[11px] font-bold tracking-wider text-gray-400 dark:text-gray-500">
              关联成就（{related.filter((a) => a.unlocked).length}/{related.length}）
            </div>
            {related.length === 0 ? (
              <div className="rounded-lg bg-gray-50 px-3 py-4 text-center text-xs text-gray-400 dark:bg-gray-800/60 dark:text-gray-500">
                这个方向还没有专属成就
              </div>
            ) : (
              <div className="space-y-1.5">
                {related.map((a) => (
                  <div
                    key={a.id}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                      a.unlocked
                        ? 'border-amber-200 bg-amber-50/60 dark:border-amber-800/50 dark:bg-amber-900/15'
                        : 'border-gray-100 bg-white opacity-70 dark:border-gray-800 dark:bg-gray-900'
                    }`}
                  >
                    <span className="text-xl" aria-hidden>{a.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-gray-800 dark:text-gray-100">{a.title}</div>
                      <div className="truncate text-[11px] text-gray-400 dark:text-gray-500">{a.description}</div>
                    </div>
                    <span className={`shrink-0 text-[10px] font-black ${a.unlocked ? 'text-amber-500' : 'text-gray-300 dark:text-gray-600'}`}>
                      {a.unlocked ? '已解锁' : '未解锁'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </SheetModal>
  );
};
