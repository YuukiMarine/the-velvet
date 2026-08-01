/**
 * 云同步免责声明（FINAL_SPRINT_PRD FS1.2）。
 *
 * 出现时机两处：
 *   ① 首次登录云端 —— LoginModal 在表单前先出这一页，同意才进登录；
 *   ② 存量已登录用户 —— 账号页补弹一次（不阻断，可以先不同意）。
 * 同意即写 settings.cloudConsentAt（ISO），随 settings 上云，多设备只需同意一次。
 *
 * 皮肤：沿用 LoginModal 的紫黑云端底（跨主题身份色，不走频道皮）——
 * 云端是"房间之外"的地方，视觉上刻意与三频道保持距离。
 *
 * ⚠️ 文案为骨架稿，终稿走文案总批；条款事实必须与代码口径一致（见 services/sync.ts 字段账本）。
 */
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';

interface Props {
  onAccept: () => void;
  onDecline: () => void;
  /** 存量用户补弹：拒绝按钮改为"先不同意"，不阻断使用 */
  variant?: 'gate' | 'catchup';
  busy?: boolean;
}

const CLAUSES: { icon: string; title: string; body: string }[] = [
  {
    icon: '🕯',
    title: '用爱发电，不保证永远在线',
    body: '同步服务器由开发者个人自费维护，没有服务等级承诺，也可能因为费用或精力而停运。真要关，会尽力提前公告并留出导出时间。',
  },
  {
    icon: '🔒',
    title: '不看，不用，不给别人',
    body: '你的数据只用于"把这台设备的记录搬到另一台"这一件事。开发者不会翻阅内容，不做分析、不训练模型、不交给第三方。',
  },
  {
    icon: '🏠',
    title: '有些东西根本不出门',
    body: '记账的每一笔、与黑猫和同伴的聊天原文，只存在你的设备里，永远不上传。愿望清单、黑猫的记忆默认也留在本地，要不要上云由你在「数据类目选择」里勾。',
  },
  {
    icon: '🔑',
    title: 'AI 的 API Key 默认会跟着走',
    body: '为了换设备不用重填，Key 默认随设置同步。介意的话在「数据类目选择」里关掉「AI 模型 API」，它就只留在本机。',
  },
  {
    icon: '🧺',
    title: '重要的东西请自己也存一份',
    body: '云端是方便，不是保险箱。随时可以关闭同步并一键删除云端数据；也建议偶尔用「数据与备份」导出一份放在自己手里。',
  },
];

export function CloudConsentNotice({ onAccept, onDecline, variant = 'gate', busy }: Props) {
  return (
    <div className="px-7 pb-6">
      <div className="space-y-3 max-h-[46vh] overflow-y-auto pr-1">
        {CLAUSES.map(c => (
          <div
            key={c.title}
            className="flex gap-3 rounded-xl p-3"
            style={{ background: 'rgba(124,58,237,0.10)', border: '1px solid rgba(196,181,253,0.18)' }}
          >
            <span aria-hidden className="text-base leading-none pt-0.5">{c.icon}</span>
            <div className="min-w-0">
              <div className="text-[12.5px] font-bold" style={{ color: '#f5e6ff' }}>{c.title}</div>
              <p className="text-[11px] leading-relaxed mt-1" style={{ color: '#a89dc0' }}>{c.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 pt-4">
        <button
          type="button"
          onClick={onDecline}
          disabled={busy}
          className="py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
          style={{ background: 'rgba(255,255,255,0.06)', color: '#a89dc0', border: '1px solid rgba(196,181,253,0.18)' }}
        >
          {variant === 'gate' ? '先不用云同步' : '先不同意'}
        </button>
        <button
          type="button"
          onClick={onAccept}
          disabled={busy}
          className="py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
        >
          我明白了，继续
        </button>
      </div>
      <p className="text-[10px] text-center mt-3" style={{ color: '#6b7ca8' }}>
        {variant === 'gate'
          ? '不同意也能照常使用，只是数据只留在这台设备上'
          : '账号已在使用云同步；不同意的话下次进这一页还会再问一次'}
      </p>
    </div>
  );
}

/**
 * 存量已登录用户的补弹壳（账号页用）。登录前的闸门走 LoginModal 内嵌，不用这个。
 * 蒙层不可点关——但「先不同意」随时可退，不阻断任何功能。
 */
export function CloudConsentModal({ isOpen, onAccept, onDecline }: {
  isOpen: boolean; onAccept: () => void; onDecline: () => void;
}) {
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[150] flex items-center justify-center p-4"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(30,20,60,0.85) 0%, rgba(8,6,20,0.96) 100%)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="relative w-full max-w-md rounded-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, #1a1a3e 0%, #0f0f2e 100%)',
              border: '1px solid rgba(196, 181, 253, 0.25)',
              boxShadow: '0 30px 80px rgba(0,0,0,0.5), 0 0 40px rgba(124,58,237,0.25)',
            }}
          >
            <div className="px-7 pt-7 pb-2 text-center">
              <div className="text-[11px] tracking-[0.5em] font-semibold" style={{ color: '#a78bfa' }}>THE VELVET</div>
              <div className="text-lg leading-none my-2" style={{ color: '#6b7ca8' }}>◆</div>
              <h2 className="text-xl font-serif" style={{ color: '#f5e6ff' }}>关于这朵云，补一份说明</h2>
              <p className="text-xs mt-2 leading-relaxed" style={{ color: '#a89dc0' }}>
                你的账号已经在用云同步了——这些话本该更早说
              </p>
            </div>
            <div className="mx-7 my-4 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(196,181,253,0.4), transparent)' }} />
            <CloudConsentNotice variant="catchup" onAccept={onAccept} onDecline={onDecline} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
