/** 玩法扩展：记账（货币 / 消费评估 / 发薪日）· 今日委托 AI 卡 · 关键词规则 · 逆影战场重开 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store';
import { Card, Row, Divider, Toggle, Select, Btn, Input, useSettingsSkin, skinTokens } from '../kit';
import { ATTRIBUTE_META } from '../pickers';

export const PlaySection = () => {
  const { settings, updateSettings } = useAppStore(useShallow(s => ({ settings: s.settings, updateSettings: s.updateSettings })));
  const skin = useSettingsSkin();
  const t = skinTokens(skin);
  const [keywordDrafts, setKeywordDrafts] = useState<Record<number, string>>({});
  const [keywordOpen, setKeywordOpen] = useState(false);
  const ledgerOn = settings.ledgerEnabled !== false;
  const keywordTotal = settings.keywordRules.reduce((n, r) => n + r.keywords.length, 0);

  return (
    <>
      <Card title="记账" meta={ledgerOn ? '数据只存本地、不上云' : '已关闭'} index={0}>
        <Row id="ledgerEnabled" glyph="coin" label="记账" desc="低摩擦记账：总余额 / 预算 / 结转 + 四轴觉察"
          control={<Toggle checked={ledgerOn} onChange={(v) => updateSettings({ ledgerEnabled: v })} aria-label="记账" />} />
        {ledgerOn && (
          <>
            <Divider />
            <Row id="currency" label="货币" control={
              <Select value={settings.currency ?? 'CNY'} aria-label="货币" onChange={(e) => updateSettings({ currency: e.target.value })}>
                <option value="CNY">¥ 人民币</option><option value="USD">$ 美元</option><option value="EUR">€ 欧元</option><option value="JPY">¥ 日元</option><option value="GBP">£ 英镑</option><option value="HKD">HK$ 港币</option><option value="KRW">₩ 韩元</option>
              </Select>} />
            <Row id="spendEvalEnabled" label="消费评估" desc="记账时可评「值 / 不值」，值得 +1 SP，比例进月报"
              control={<Toggle checked={!!settings.spendEvalEnabled} onChange={(v) => updateSettings({ spendEvalEnabled: v })} aria-label="消费评估" />} />
            <Row id="ledgerPayCycleEnabled" label="发薪日周期" desc="预算 / 今日可花 / 规划窗按发薪日切分周期；关则按自然月"
              control={<Toggle checked={!!settings.ledgerPayCycleEnabled} onChange={(v) => updateSettings({ ledgerPayCycleEnabled: v })} aria-label="发薪日周期" />} />
            {settings.ledgerPayCycleEnabled && (
              <Row id="ledgerResetDay" label="发薪日" control={
                <Select value={settings.ledgerResetDay ?? 1} aria-label="发薪日" onChange={(e) => updateSettings({ ledgerResetDay: Number(e.target.value) })}>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>每月 {d} 号</option>)}
                </Select>} />
            )}
          </>
        )}
      </Card>

      <Card title="委托板" index={1}>
        <Row id="lifeQuestAiCard" glyph="quest" label="今日委托多一张 AI 写的" desc="三张题库卡之外，每天再多一张按你最近 7 天的记录写的；会把记录标题发给你配的 AI 服务，没配 AI 时不出现"
          control={<Toggle checked={!!settings.lifeQuestAiCard} onChange={(v) => updateSettings({ lifeQuestAiCard: v })} aria-label="今日委托多一张 AI 写的" />} />
      </Card>

      <Card title="关键词规则" meta={`${keywordTotal} 词 · 命中即加分`} index={2}>
        <Row id="keywordRules" glyph="tag" label="记录里出现关键词就自动加分" desc="回车或点 + 添加，点标签移除" onClick={() => setKeywordOpen(v => !v)}
          control={<span className="text-[13px] font-black" style={{ color: t.accent }}>{keywordOpen ? '收起' : '展开'} <span aria-hidden>{keywordOpen ? '▴' : '▾'}</span></span>} />
        <AnimatePresence initial={false}>
          {keywordOpen && (
            <motion.div key="kw" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
              <div className="space-y-3 pt-1">
                {settings.keywordRules.map((rule, index) => {
                  const meta = ATTRIBUTE_META.find(m => m.id === rule.attribute);
                  const accent = meta?.color ?? '#6B7280';
                  const attrName = settings.attributeNames[rule.attribute] || meta?.defaultLabel || rule.attribute;
                  const draft = keywordDrafts[index] ?? '';
                  const commitDraft = () => {
                    const trimmed = draft.trim();
                    if (!trimmed) return;
                    const existing = new Set(rule.keywords.map(k => k.toLowerCase()));
                    if (existing.has(trimmed.toLowerCase())) { setKeywordDrafts(prev => ({ ...prev, [index]: '' })); return; }
                    const newRules = [...settings.keywordRules];
                    newRules[index] = { ...rule, keywords: [...rule.keywords, trimmed] };
                    updateSettings({ keywordRules: newRules });
                    setKeywordDrafts(prev => ({ ...prev, [index]: '' }));
                  };
                  return (
                    <div key={index} className="overflow-hidden rounded-xl" style={{ boxShadow: `inset 0 0 0 1.5px ${accent}55`, background: `linear-gradient(180deg, ${accent}12 0%, transparent 60%)` }}>
                      <div className="flex items-center gap-2.5 px-3 py-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base" style={{ background: `${accent}22`, color: accent }}>{meta?.icon ?? '🏷️'}</div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[14px] font-black" style={{ color: t.ink }}>{attrName}</div>
                          <div className="text-[10px] font-bold" style={{ color: t.sub }}>命中后 <span className="tabular-nums" style={{ color: accent }}>+{rule.points}</span> 点</div>
                        </div>
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-black tabular-nums" style={{ background: `${accent}22`, color: accent }}>{rule.keywords.length} 词</span>
                      </div>
                      <div className="space-y-2 px-3 pb-3">
                        {rule.keywords.length === 0 ? (
                          <div className="px-1 text-[11px] font-semibold italic" style={{ color: t.sub }}>暂无关键词，下方输入回车添加</div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {rule.keywords.map((keyword, kIdx) => (
                              <button key={`${keyword}-${kIdx}`} type="button" title="点击移除"
                                onClick={() => { const newRules = [...settings.keywordRules]; newRules[index] = { ...rule, keywords: rule.keywords.filter((_, i) => i !== kIdx) }; updateSettings({ keywordRules: newRules }); }}
                                className="group inline-flex items-center gap-1 rounded-full py-1 pl-2.5 pr-1 text-xs font-bold transition-all active:scale-95"
                                style={{ background: `${accent}1f`, color: accent, border: `1px solid ${accent}44` }}>
                                <span className="max-w-[120px] truncate">{keyword}</span>
                                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[11px] leading-none opacity-60 group-hover:opacity-100">×</span>
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <Input type="text" value={draft} aria-label={`${attrName}关键词`}
                            onChange={(e) => setKeywordDrafts(prev => ({ ...prev, [index]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitDraft(); } if (e.key === 'Escape') { setKeywordDrafts(prev => { const n = { ...prev }; delete n[index]; return n; }); (e.target as HTMLInputElement).blur(); } }}
                            placeholder="输入关键词后回车 / 点 +" className="!py-1.5 !text-[12px]" />
                          <button type="button" onClick={commitDraft} disabled={!draft.trim()} aria-label="添加关键词"
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base font-black text-white disabled:cursor-not-allowed disabled:opacity-30 active:scale-95" style={{ background: accent }}>+</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {!settings.battleEnabled && (
        <Card title="逆影战场" meta="已关闭" index={3}>
          <Row id="battleEnabled" glyph="swords" label="逆影战场" desc="召唤 Persona，识破并击败内心的暗影"
            control={<Btn small onClick={() => updateSettings({ battleEnabled: true })}>开启</Btn>} />
        </Card>
      )}
    </>
  );
};
