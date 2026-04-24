/**
 * COOP 详情表单 —— 提议 / 接受 modal 共用。
 *
 * 包含：
 *   - 塔罗 + 正/逆位
 *   - 初始羁绊等级（1-10）
 *   - 能力加成属性（五维中的一个；默认与塔罗花色对齐，用户可改）
 *   - 留言（≤200 字）
 */

import { motion } from 'framer-motion';
import { useMemo, useState, useEffect, useRef } from 'react';
import { MAJOR_ARCANA, TAROT_BY_ID } from '@/constants/tarot';
import { TarotCardSVG } from '@/components/astrology/TarotCardSVG';
import { getArcanaAttribute, INTIMACY_LABELS, MAX_INTIMACY } from '@/utils/confidantLevels';
import { useAppStore } from '@/store';
import type { AttributeId, AttributeNames, TarotOrientation } from '@/types';

export interface ArcanaPickerValue {
  arcanaId: string;
  orientation: TarotOrientation;
  intimacyLevel: number;
  skillAttribute: AttributeId;
  message: string;
}

interface Props {
  takenArcanaIds: string[];
  initial?: Partial<ArcanaPickerValue>;
  /**
   * 推荐的塔罗 id —— 接收方场景下，这是提议方挑的那张。
   * 当 initial.arcanaId 为空且本机未占用时，自动选中作为默认。
   */
  recommendedArcanaId?: string;
  /** 用户自定义的五维属性名（用于属性按钮标签） */
  attributeNames: AttributeNames;
  hint?: string;
  messagePlaceholder?: string;
  onChange: (value: ArcanaPickerValue, valid: boolean) => void;
}

const ATTR_ORDER: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

export function ArcanaPickerForm({ takenArcanaIds, initial, recommendedArcanaId, attributeNames, hint, messagePlaceholder, onChange }: Props) {
  // 推荐塔罗：仅当本机未占用 + initial 没有指定时，才作为默认
  const taken = useMemo(() => new Set(takenArcanaIds), [takenArcanaIds]);
  const initialArcana = initial?.arcanaId
    || (recommendedArcanaId && !taken.has(recommendedArcanaId) ? recommendedArcanaId : null);

  const [arcanaId, setArcanaId] = useState<string | null>(initialArcana);
  const [orientation, setOrientation] = useState<TarotOrientation>(initial?.orientation ?? 'upright');
  const [intimacyLevel, setIntimacyLevel] = useState<number>(initial?.intimacyLevel ?? 1);
  const [skillAttribute, setSkillAttribute] = useState<AttributeId>(
    initial?.skillAttribute ?? 'knowledge',
  );
  const [message, setMessage] = useState(initial?.message ?? '');
  // 用户是否手动改过属性 —— 手动改过之后就不再自动跟随塔罗花色
  const attrTouched = useRef(!!initial?.skillAttribute);

  // 选塔罗时，如果用户还没手动选过属性，就跟随塔罗花色
  useEffect(() => {
    if (!arcanaId) return;
    if (attrTouched.current) return;
    setSkillAttribute(getArcanaAttribute(arcanaId));
  }, [arcanaId]);

  useEffect(() => {
    onChange(
      { arcanaId: arcanaId ?? '', orientation, intimacyLevel, skillAttribute, message },
      !!arcanaId && !taken.has(arcanaId) && intimacyLevel >= 1 && intimacyLevel <= MAX_INTIMACY,
    );
  }, [arcanaId, orientation, intimacyLevel, skillAttribute, message, onChange, taken]);

  const selectedCard = arcanaId ? TAROT_BY_ID[arcanaId] : null;
  const accent = selectedCard?.accent ?? '#6366f1';

  return (
    <div className="space-y-4">
      {/* 已选预览 / 正逆切换 */}
      <div
        className="p-3 rounded-2xl border"
        style={{
          borderColor: selectedCard ? `${accent}66` : 'rgba(148,163,184,0.25)',
          background: selectedCard ? `${accent}0d` : 'rgba(148,163,184,0.05)',
        }}
      >
        {selectedCard ? (
          <div className="flex items-center gap-3">
            <TarotCardSVG
              card={selectedCard}
              orientation={orientation}
              width={56}
              staticCard
              showOrientationTag={false}
            />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm text-gray-900 dark:text-white">
                《{selectedCard.name}》{orientation === 'reversed' ? '逆位' : '正位'}
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5 tracking-wider">
                {selectedCard.nameEn}
              </div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                {orientation === 'reversed' ? selectedCard.reversed.meaning : selectedCard.upright.meaning}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => setOrientation('upright')}
                className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors ${
                  orientation === 'upright'
                    ? 'text-white'
                    : 'text-gray-500 bg-black/5 dark:bg-white/5'
                }`}
                style={{
                  background: orientation === 'upright' ? accent : undefined,
                }}
              >
                正位
              </button>
              <button
                type="button"
                onClick={() => setOrientation('reversed')}
                className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors ${
                  orientation === 'reversed'
                    ? 'text-white'
                    : 'text-gray-500 bg-black/5 dark:bg-white/5'
                }`}
                style={{
                  background: orientation === 'reversed' ? accent : undefined,
                }}
              >
                逆位
              </button>
            </div>
          </div>
        ) : (
          <div className="py-3 text-center text-[11px] text-gray-400">
            {hint ?? '从下方挑一张塔罗代表 Ta'}
          </div>
        )}
      </div>

      {/* 塔罗网格 */}
      <div
        className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-52 overflow-y-auto p-1"
        style={{ scrollbarWidth: 'thin' }}
      >
        {MAJOR_ARCANA.map(card => {
          const isTaken = taken.has(card.id);
          const isActive = arcanaId === card.id;
          return (
            <motion.button
              key={card.id}
              type="button"
              whileHover={!isTaken ? { y: -2 } : {}}
              whileTap={!isTaken ? { scale: 0.96 } : {}}
              onClick={() => { if (!isTaken) setArcanaId(card.id); }}
              disabled={isTaken}
              className="relative rounded-xl flex flex-col items-center gap-0.5 p-1.5 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: isActive ? `${card.accent}22` : 'transparent',
                border: `1.5px solid ${isActive ? card.accent : 'rgba(148,163,184,0.2)'}`,
              }}
            >
              <TarotCardSVG
                card={card}
                orientation={isActive ? orientation : 'upright'}
                width={42}
                staticCard
                showOrientationTag={false}
              />
              <span
                className="text-[9px] leading-tight truncate w-full text-center"
                style={{ color: isActive ? card.accent : '#64748b' }}
              >
                {card.name}
              </span>
              {isTaken && (
                <span className="absolute top-1 right-1 text-[8px] font-bold px-1 py-0.5 rounded bg-black/40 text-white">
                  占
                </span>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* 羁绊等级 */}
      <div
        className="p-3 rounded-xl border"
        style={{
          borderColor: selectedCard ? `${accent}44` : 'rgba(148,163,184,0.25)',
          background: selectedCard ? `${accent}08` : 'rgba(148,163,184,0.04)',
        }}
      >
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[10px] font-bold tracking-widest text-gray-500">
            羁绊等级（期望值）
          </div>
          <div className="text-[11px] font-bold" style={{ color: accent }}>
            Lv.{intimacyLevel} · {INTIMACY_LABELS[intimacyLevel]}
          </div>
        </div>
        <div className="grid grid-cols-10 gap-1">
          {Array.from({ length: MAX_INTIMACY }, (_, i) => i + 1).map(lv => {
            const active = intimacyLevel === lv;
            return (
              <button
                key={lv}
                type="button"
                onClick={() => setIntimacyLevel(lv)}
                className="h-7 rounded-md text-[10px] font-bold transition-all select-none"
                style={{
                  background: active ? accent : 'transparent',
                  color: active ? '#fff' : accent,
                  border: `1px solid ${active ? accent : accent + '55'}`,
                }}
              >
                {lv}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
          双方的期望值不同时，最终按 <span className="font-bold">取中</span>（下取整）生效。
        </p>
      </div>

      {/* 能力加成属性 */}
      <div
        className="p-3 rounded-xl border"
        style={{
          borderColor: 'rgba(148,163,184,0.25)',
          background: 'rgba(148,163,184,0.04)',
        }}
      >
        <div className="text-[10px] font-bold tracking-widest text-gray-500 mb-1.5">
          能力加成属性
        </div>
        <div className="grid grid-cols-5 gap-1">
          {ATTR_ORDER.map(id => {
            const active = skillAttribute === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => { attrTouched.current = true; setSkillAttribute(id); }}
                className="py-1.5 rounded-md text-[11px] font-bold transition-all select-none"
                style={{
                  background: active ? accent : 'transparent',
                  color: active ? '#fff' : accent,
                  border: `1px solid ${active ? accent : accent + '55'}`,
                }}
              >
                {attributeNames[id]?.slice(0, 4) || id}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
          Lv2 日常加点、Lv7 战斗固伤、Lv10 SP 道具都会指向这个属性。
        </p>
      </div>

      {/* 留言 */}
      <div>
        <label className="block text-[10px] font-bold tracking-widest text-gray-500 mb-1">
          留一句话（可选，≤ 200 字）
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 200))}
          rows={2}
          placeholder={messagePlaceholder ?? '想对 Ta 说的话……'}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
        />
        <div className="text-right text-[10px] text-gray-400 mt-0.5">
          {message.length} / 200
        </div>
      </div>

      {/* AI 解读开关（默认开） */}
      <NoAIToggle />
    </div>
  );
}

/**
 * "不使用 AI 内容" 开关 —— 写到全局 settings.coopUseAIInterpretation。
 * 默认开（settings 里 undefined → 视为 true）。
 * 关掉后，COOP 物化时不会调 AI 生成"解读 / 未来"，而是回退到 "Ta 写给你..." / 牌意模板。
 */
function NoAIToggle() {
  const useAI = useAppStore(s => s.settings.coopUseAIInterpretation !== false);
  const updateSettings = useAppStore(s => s.updateSettings);
  return (
    <label className="flex items-start gap-2 px-2 py-2 rounded-lg cursor-pointer">
      <input
        type="checkbox"
        checked={!useAI}
        onChange={(e) => { void updateSettings({ coopUseAIInterpretation: !e.target.checked }); }}
        className="mt-0.5 accent-indigo-500"
      />
      <div>
        <div className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">
          不使用 AI 内容
        </div>
        <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
          默认：契约建立后 AI 会根据塔罗 + 对方留言生成「解读 / 未来」。勾上则跳过 AI，用对方留言或牌意模板兜底。
        </p>
      </div>
    </label>
  );
}
