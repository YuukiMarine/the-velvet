import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Settings } from '@/types';
import { deleteAllCloudData } from '@/services/sync';

interface Group {
  id: string;
  label: string;
  hint: string;
  /** 表级组：列出的所有表都被打开/关闭 */
  tables?: string[];
  /** 字段级组：开关对应 settings 里的一个布尔字段（用于单字段敏感数据，如 API Key） */
  field?: {
    /** 要开/关的 settings 字段名 */
    settingKey: 'syncCloudApiKey';
    /** settings 值未定义时视为的默认状态（通常 true = 打开）*/
    defaultWhenUndefined: boolean;
  };
  /** 始终同步，不可关闭 */
  protected?: boolean;
}

const GROUPS: Group[] = [
  {
    id: 'core',
    label: '核心档案',
    hint: '账号 / 五维属性 / 设置 —— 始终同步，保证账号在不同设备能正常加载',
    tables: ['users', 'attributes', 'settings'],
    protected: true,
  },
  {
    id: 'apiKey',
    label: 'AI 模型 API',
    hint: 'API Key（AI 摘要 / 谏言 / Persona / 同伴解读 都用这把钥匙）。关闭后下次同步不再上传；新设备需要重新填写。若想清掉云端已存的 Key，请配合下方"删除云端数据"',
    field: { settingKey: 'syncCloudApiKey', defaultWhenUndefined: true },
  },
  {
    id: 'journal',
    label: '成长记录',
    hint: '每日活动 / 成就 / 技能',
    tables: ['activities', 'achievements', 'skills'],
  },
  {
    id: 'arcana',
    label: '星象 · 塔罗',
    hint: '每日塔罗 / 中长期占卜 / 旧版每日事件',
    tables: ['dailyDivinations', 'longReadings', 'dailyEvents'],
  },
  {
    id: 'todo',
    label: '任务与总结',
    hint: '待办 / 完成记录 / 周月总结 / 本周目标',
    tables: ['todos', 'todoCompletions', 'summaries', 'weeklyGoals'],
  },
  {
    id: 'battle',
    label: '逆影战场',
    hint: 'Persona / Shadow / 战斗状态',
    tables: ['personas', 'shadows', 'battleStates'],
  },
  {
    id: 'confidant',
    label: '同伴',
    hint: '同伴档案 / 同伴事件历史 / 谏言归档摘要（聊天原文永不上云）',
    tables: ['confidants', 'confidantEvents', 'counselArchives'],
  },
];

interface Props {
  excluded: string[];
  /** 兼容旧开关：为 false 表示"同伴"被排除（即便 excluded 未包含相关表） */
  syncConfidantsToCloud?: boolean;
  /** AI 模型 API Key 是否随 settings 上云；undefined = 默认 true */
  syncCloudApiKey?: boolean;
  onChange: (patch: Partial<Settings>) => void;
}

/**
 * 按类目细粒度控制"哪些数据上传云端"。
 *
 * 写入策略：
 *  - 始终读写 `syncExcludedTables`（列出不同步的表名）
 *  - 同时保持旧开关 `syncConfidantsToCloud` 同步：
 *    · 若"同伴"组被关，`syncConfidantsToCloud = false`（兼容旧逻辑）
 *    · 若被打开，`syncConfidantsToCloud = true`
 */
export function SyncPrivacyPanel({ excluded, syncConfidantsToCloud, syncCloudApiKey, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setResult(null);
    try {
      const { deleted } = await deleteAllCloudData();
      setResult(`已删除云端 ${deleted} 条记录。本地数据未动。`);
      setConfirmOpen(false);
      setTimeout(() => setResult(null), 3500);
    } catch (e) {
      setResult(e instanceof Error ? e.message : '删除失败');
      setTimeout(() => setResult(null), 3500);
    } finally {
      setDeleting(false);
    }
  };

  const excludedSet = useMemo(() => {
    const s = new Set<string>(excluded);
    if (syncConfidantsToCloud === false) {
      s.add('confidants');
      s.add('confidantEvents');
      s.add('counselArchives');
    }
    return s;
  }, [excluded, syncConfidantsToCloud]);

  /** 读取单字段开关的当前状态 */
  const readFieldState = (g: Group): boolean => {
    if (!g.field) return true;
    if (g.field.settingKey === 'syncCloudApiKey') {
      return syncCloudApiKey === undefined ? g.field.defaultWhenUndefined : syncCloudApiKey;
    }
    return g.field.defaultWhenUndefined;
  };

  const isGroupOn = (g: Group) => {
    if (g.protected) return true;
    if (g.field) return readFieldState(g);
    // 表级：只要有任何一张表在排除集合里，就视为"部分/全部关闭"
    return !(g.tables ?? []).some(t => excludedSet.has(t));
  };

  const enabledCount = GROUPS.filter(g => isGroupOn(g)).length;
  const totalCount = GROUPS.length;

  const toggleGroup = (g: Group, on: boolean) => {
    if (g.protected) return;
    // 字段级：直接写对应的 settings 字段
    if (g.field) {
      onChange({ [g.field.settingKey]: on } as Partial<Settings>);
      return;
    }
    // 表级
    const next = new Set<string>(excluded);
    if (on) {
      for (const t of g.tables ?? []) next.delete(t);
    } else {
      for (const t of g.tables ?? []) next.add(t);
    }
    // 同伴组特殊：同时同步旧开关
    const patch: Partial<Settings> = {
      syncExcludedTables: Array.from(next),
    };
    if (g.id === 'confidant') {
      patch.syncConfidantsToCloud = on;
      if (on) {
        // 保险：同时从 excluded 中移除（以防双开关冲突）
        next.delete('confidants');
        next.delete('confidantEvents');
        next.delete('counselArchives');
        patch.syncExcludedTables = Array.from(next);
      }
    }
    onChange(patch);
  };

  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-700 bg-white/60 dark:bg-gray-800/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full px-4 py-3 flex items-center justify-between text-left"
      >
        <div>
          <div className="text-xs font-bold text-gray-700 dark:text-gray-200">
            云同步 · 数据类目选择
          </div>
          <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
            当前开启 {enabledCount} / {totalCount} 组
          </div>
        </div>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-gray-100 dark:border-gray-700"
          >
            <div className="p-3 space-y-2">
              {GROUPS.map(g => {
                const on = isGroupOn(g);
                return (
                  <div
                    key={g.id}
                    className={`flex items-start gap-3 p-2.5 rounded-lg ${
                      g.protected
                        ? 'bg-blue-50/50 dark:bg-blue-900/10 border border-blue-200/40 dark:border-blue-800/40'
                        : 'bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-gray-800 dark:text-gray-100">
                          {g.label}
                        </span>
                        {g.protected && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-300 border border-blue-500/30">
                            必须同步
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                        {g.hint}
                      </p>
                    </div>

                    {/* 滑块 */}
                    <button
                      type="button"
                      disabled={g.protected}
                      onClick={() => toggleGroup(g, !on)}
                      className="relative w-10 h-5 rounded-full transition-colors flex-shrink-0 disabled:opacity-60"
                      style={{
                        background: on ? '#10b981' : 'rgba(148,163,184,0.4)',
                      }}
                      aria-label={`切换 ${g.label}`}
                    >
                      <motion.span
                        layout
                        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                        className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow"
                        style={{ left: on ? 'calc(100% - 18px)' : '2px' }}
                      />
                    </button>
                  </div>
                );
              })}
              <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed px-1 pt-1">
                关闭某组后，这些表将仅保留在本地；推送 / 拉取都会跳过它们，登录其他设备时不会看到这些数据。
              </p>

              {/* 删除云端数据（危险操作） */}
              <div className="mt-2 pt-3 border-t border-rose-500/20 space-y-1.5">
                <div className="text-[10px] font-bold tracking-widest text-rose-500 dark:text-rose-400">
                  危险区
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  disabled={deleting}
                  className="w-full py-2 rounded-lg text-xs font-semibold bg-rose-500/10 border border-rose-500/40 text-rose-600 dark:text-rose-300 hover:bg-rose-500/20 transition-colors disabled:opacity-50"
                >
                  {deleting ? '正在删除……' : '🗑 删除云端数据'}
                </button>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
                  仅删除云端存档，本地数据完整保留。下次同步前云端都会是空的。
                </p>
                {result && (
                  <div className="text-[10px] text-rose-600 dark:text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-2 py-1.5 mt-1">
                    {result}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 二级确认弹窗 */}
      <AnimatePresence>
        {confirmOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => !deleting && setConfirmOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-3xl shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="px-6 pt-6 pb-3 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                    style={{ background: 'rgba(244,63,94,0.15)', color: '#e11d48' }}
                  >
                    ⚠
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-white">
                      确认删除云端数据？
                    </h3>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                      此操作不可撤销
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-3">
                <ul className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed space-y-1.5 list-disc list-inside">
                  <li>仅清空你本账号在云端的所有 <code className="font-mono text-[10px] px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">user_data</code> 记录</li>
                  <li>本地数据 <span className="font-bold">不会</span> 被动到；浏览器里照常使用</li>
                  <li>若再次触发"立即同步到云端"，本地数据会重新上传</li>
                  <li>其他设备登录后，会看到云端为空，并可选择拉取本地覆盖</li>
                </ul>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => setConfirmOpen(false)}
                    disabled={deleting}
                    className="py-2.5 rounded-xl text-sm font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                  >
                    取消
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleDelete}
                    disabled={deleting}
                    className="py-2.5 rounded-xl text-sm font-bold text-white shadow-md disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, #e11d48, #be123c)' }}
                  >
                    {deleting ? '删除中…' : '确认删除'}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
