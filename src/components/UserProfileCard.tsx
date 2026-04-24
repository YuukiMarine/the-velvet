import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store';
import { useCloudStore } from '@/store/cloud';
import { LVTag } from '@/components/LVTag';
import { computeTotalLv } from '@/utils/lvTiers';
import { ImageCropDialog } from '@/components/ImageCropDialog';
import type { AttributeId } from '@/types';

/**
 * 用户资料卡片：玻璃拟态 + 主题色 tint。
 * 头像点击弹出菜单（更换 / 移除），五维默认折叠。
 */
export function UserProfileCard() {
  const { user, settings, updateUser, attributes } = useAppStore();
  const cloudUser = useCloudStore(s => s.cloudUser);
  const cloudEnabled = useCloudStore(s => s.cloudEnabled);
  const totalLv = computeTotalLv(attributes);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(user?.name || '');
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [primaryColor, setPrimaryColor] = useState('#3B82F6');
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [attrsOpen, setAttrsOpen] = useState(false);
  const [copiedFlash, setCopiedFlash] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const avatarWrapperRef = useRef<HTMLDivElement>(null);

  // 读取主题色并监听变化
  useEffect(() => {
    const readColor = () => {
      const raw = getComputedStyle(document.documentElement)
        .getPropertyValue('--color-primary')
        .trim();
      if (raw) setPrimaryColor(raw);
    };
    readColor();
    const obs = new MutationObserver(readColor);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'style'],
    });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  // 头像菜单：点外面关闭
  useEffect(() => {
    if (!avatarMenuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (avatarWrapperRef.current && !avatarWrapperRef.current.contains(e.target as Node)) {
        setAvatarMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [avatarMenuOpen]);

  if (!user) return null;

  const handleNameSave = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === user.name) {
      setEditingName(false);
      setNameDraft(user.name);
      return;
    }
    await updateUser({ name: trimmed });
    setEditingName(false);
  };

  const handlePickAvatar = () => {
    setAvatarMenuOpen(false);
    fileInputRef.current?.click();
  };

  const handleRemoveAvatar = async () => {
    setAvatarMenuOpen(false);
    await updateUser({ avatarDataUrl: undefined });
  };

  const handleAvatarSelect: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      setErr('请选择图片文件');
      setTimeout(() => setErr(null), 2500);
      e.target.value = '';
      return;
    }
    setPendingFile(file);
    // 允许同一文件再次选择
    e.target.value = '';
  };

  const handleCropConfirm = async (dataUrl: string) => {
    setPendingFile(null);
    setUploading(true);
    try {
      await updateUser({ avatarDataUrl: dataUrl });
    } catch (e) {
      setErr(e instanceof Error ? e.message : '上传失败');
      setTimeout(() => setErr(null), 2500);
    } finally {
      setUploading(false);
    }
  };

  const cloudUserId = (cloudUser?.username as string | undefined) ?? '';

  const handleCopyUserId = async () => {
    if (!cloudUserId) return;
    try {
      // 现代浏览器 + Capacitor：navigator.clipboard 在 secure context 下可用
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(cloudUserId);
      } else {
        // 兜底：textarea + execCommand（旧浏览器 / 非 https 情况）
        const ta = document.createElement('textarea');
        ta.value = cloudUserId;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedFlash(true);
      setTimeout(() => setCopiedFlash(false), 1400);
    } catch {
      setErr('复制失败');
      setTimeout(() => setErr(null), 1800);
    }
  };

  const initial = user.name.trim().charAt(0).toUpperCase() || '?';
  const maxLv = Math.max(5, ...attributes.map(a => a.level));

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="relative rounded-3xl overflow-visible border border-white/40 dark:border-white/10"
      style={{
        background: `linear-gradient(135deg, ${primaryColor}1a 0%, ${primaryColor}08 55%, ${primaryColor}14 100%)`,
        backdropFilter: 'blur(28px) saturate(1.5)',
        WebkitBackdropFilter: 'blur(28px) saturate(1.5)',
        // 更克制的阴影：从 66 降到 2a
        boxShadow: `0 10px 28px -20px ${primaryColor}66, inset 0 1px 0 rgba(255,255,255,0.28)`,
        // 菜单打开时整卡提升层级 —— Settings 页下方"成就 / 技能"按钮也是 motion 组件（带 transform），
        // 会创建自己的 stacking context，默认按 DOM 顺序后者覆盖前者。这里临时把卡片抬到 z-40 解决覆盖。
        position: 'relative',
        zIndex: avatarMenuOpen ? 40 : undefined,
      }}
    >
      {/* 内层高光（更轻） */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-3xl overflow-hidden"
        style={{
          background:
            'radial-gradient(120% 60% at 10% -10%, rgba(255,255,255,0.22), transparent 40%), radial-gradient(100% 50% at 100% 100%, rgba(0,0,0,0.06), transparent 50%)',
        }}
      />

      <div className="relative px-5 py-5">
        <div className="flex items-center gap-4">
          {/* 头像 + 弹出菜单 */}
          <div className="relative flex-shrink-0" ref={avatarWrapperRef}>
            <button
              onClick={() => setAvatarMenuOpen(v => !v)}
              className="relative w-[72px] h-[72px] rounded-2xl overflow-hidden flex items-center justify-center transition-transform active:scale-95 border border-white/50 dark:border-white/15"
              style={{
                background: `linear-gradient(135deg, ${primaryColor}44, ${primaryColor}1a)`,
                boxShadow: `0 4px 12px -8px ${primaryColor}80, inset 0 1px 0 rgba(255,255,255,0.4)`,
              }}
              disabled={uploading}
              aria-label="头像菜单"
            >
              {user.avatarDataUrl ? (
                <img src={user.avatarDataUrl} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                <span
                  className="text-3xl font-black select-none"
                  style={{ color: primaryColor, textShadow: '0 1px 1px rgba(255,255,255,0.4)' }}
                >
                  {initial}
                </span>
              )}
              {uploading && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-6 h-6 border-2 border-white border-t-transparent rounded-full"
                  />
                </div>
              )}
            </button>

            {/* 头像点击后弹出的小菜单 */}
            <AnimatePresence>
              {avatarMenuOpen && !uploading && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.95 }}
                  transition={{ duration: 0.12 }}
                  className="absolute z-[60] left-0 top-[80px] w-36 rounded-xl overflow-hidden shadow-2xl border"
                  style={{
                    background: 'rgba(255,255,255,0.95)',
                    borderColor: 'rgba(148,163,184,0.35)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                  }}
                >
                  <button
                    onClick={handlePickAvatar}
                    className="w-full px-3 py-2 text-left text-xs font-semibold text-gray-800 hover:bg-black/5 transition-colors flex items-center gap-2"
                  >
                    <span className="text-base">📷</span>
                    {user.avatarDataUrl ? '更换头像' : '上传头像'}
                  </button>
                  {user.avatarDataUrl && (
                    <button
                      onClick={handleRemoveAvatar}
                      className="w-full px-3 py-2 text-left text-xs font-semibold text-rose-500 hover:bg-rose-500/10 transition-colors flex items-center gap-2 border-t border-black/5"
                    >
                      <span className="text-base">🗑</span>
                      移除头像
                    </button>
                  )}
                  <button
                    onClick={() => setAvatarMenuOpen(false)}
                    className="w-full px-3 py-2 text-left text-xs font-medium text-gray-500 hover:bg-black/5 transition-colors border-t border-black/5"
                  >
                    取消
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarSelect}
              className="hidden"
            />
          </div>

          {/* 右侧：名字 + LV + 邮箱 */}
          <div className="flex-1 min-w-0">
            {editingName ? (
              <div className="flex items-center gap-1.5">
                <input
                  ref={nameInputRef}
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleNameSave();
                    if (e.key === 'Escape') {
                      setEditingName(false);
                      setNameDraft(user.name);
                    }
                  }}
                  maxLength={20}
                  className="flex-1 rounded-lg px-2 py-1 font-bold text-lg outline-none bg-white/70 dark:bg-gray-900/60 border border-white/60 dark:border-white/10 text-gray-900 dark:text-white focus:bg-white/90 dark:focus:bg-gray-900/80"
                />
                <button
                  onClick={handleNameSave}
                  className="px-2 py-1 rounded-lg text-white text-xs font-bold"
                  style={{ background: primaryColor }}
                >保存</button>
                <button
                  onClick={() => {
                    setEditingName(false);
                    setNameDraft(user.name);
                  }}
                  className="px-2 py-1 rounded-lg bg-white/60 dark:bg-gray-900/50 text-gray-700 dark:text-gray-200 text-xs font-bold"
                >取消</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-black text-gray-900 dark:text-white truncate">
                  {user.name}
                </h3>
                <button
                  onClick={() => {
                    setNameDraft(user.name);
                    setEditingName(true);
                  }}
                  className="w-7 h-7 rounded-full text-sm flex items-center justify-center transition-colors bg-white/50 dark:bg-white/10 text-gray-600 dark:text-gray-200 hover:bg-white/80 dark:hover:bg-white/20"
                  aria-label="修改用户名"
                >
                  ✎
                </button>
              </div>
            )}

            <div className="mt-1.5">
              <LVTag level={totalLv} size="md" />
            </div>

            {cloudEnabled && cloudUser && (
              <div className="mt-1 space-y-0.5">
                {/* UserID 行 — 可点击复制 */}
                {cloudUserId && (
                  <button
                    onClick={handleCopyUserId}
                    className="group inline-flex items-center gap-1.5 max-w-full text-[11px] font-semibold rounded-md px-1.5 py-0.5 -ml-1.5 transition-colors hover:bg-white/40 dark:hover:bg-white/10 active:scale-[0.97]"
                    style={{ color: primaryColor }}
                    title="点击复制 UserID"
                  >
                    <span className="opacity-70 select-none">@</span>
                    <span className="truncate font-mono tracking-tight">{cloudUserId}</span>
                    <AnimatePresence mode="wait" initial={false}>
                      {copiedFlash ? (
                        <motion.span
                          key="copied"
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          transition={{ duration: 0.15 }}
                          className="ml-0.5 text-[10px] font-bold opacity-90"
                        >已复制 ✓</motion.span>
                      ) : (
                        <motion.span
                          key="copy"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 0.55 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.12 }}
                          className="ml-0.5 text-[10px] opacity-0 group-hover:opacity-55 transition-opacity"
                          aria-hidden
                        >⧉</motion.span>
                      )}
                    </AnimatePresence>
                  </button>
                )}
                {/* 邮箱（次要信息，独立一行） */}
                <div className="text-[11px] text-gray-600 dark:text-gray-300/80 truncate">
                  ☁ {cloudUser.email as string}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 五维属性：默认折叠 */}
        <div className="mt-3">
          <button
            onClick={() => setAttrsOpen(v => !v)}
            className="w-full flex items-center justify-between py-1.5 px-2 rounded-lg text-[11px] font-bold text-gray-500 dark:text-gray-300 hover:bg-white/30 dark:hover:bg-white/5 transition-colors"
            aria-expanded={attrsOpen}
          >
            <span>
              总点数：
              <span className="text-primary font-black tabular-nums">
                {attributes.reduce((s, a) => s + (a.points ?? 0), 0)}
              </span>
            </span>
            <span className="flex items-center gap-1 text-[10px] text-gray-400">
              <span>
                {attributes.map(a => a.level).reduce((s, v) => s + v, 0)} 级累计
              </span>
              <span>{attrsOpen ? '▲' : '▼'}</span>
            </span>
          </button>
          <AnimatePresence initial={false}>
            {attrsOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="space-y-1.5 pt-2">
                  {attributes.map(a => {
                    const pct = Math.max(4, Math.min(100, (a.level / maxLv) * 100));
                    const name = settings.attributeNames[a.id as keyof typeof settings.attributeNames] || a.displayName;
                    const attrColor = ATTR_ACCENTS[a.id] || primaryColor;
                    return (
                      <div key={a.id} className="flex items-center gap-2.5">
                        <span className="w-14 text-[11px] font-bold tracking-wide flex-shrink-0 text-gray-700 dark:text-gray-200">
                          {name}
                        </span>
                        <div
                          className="relative flex-1 h-4 rounded-full overflow-hidden"
                          style={{
                            background: 'rgba(148,163,184,0.22)',
                            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06)',
                          }}
                        >
                          <motion.div
                            className="absolute inset-y-0 left-0 rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ type: 'spring', stiffness: 140, damping: 22 }}
                            style={{
                              background: `linear-gradient(90deg, ${attrColor}cc, ${attrColor})`,
                              boxShadow: `0 0 4px ${attrColor}55`,
                            }}
                          />
                        </div>
                        <span
                          className="w-14 text-right text-[11px] font-bold tabular-nums flex-shrink-0"
                          style={{ color: attrColor }}
                        >
                          Lv.{a.level}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {err && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-3 text-center text-xs font-bold text-white bg-rose-500/70 rounded-lg py-1.5"
            >
              {err}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 裁切弹窗（可取消） */}
      <ImageCropDialog
        isOpen={!!pendingFile}
        file={pendingFile}
        title="调整我的头像"
        onCancel={() => setPendingFile(null)}
        onConfirm={handleCropConfirm}
      />
    </motion.div>
  );
}

const ATTR_ACCENTS: Record<AttributeId, string> = {
  knowledge: '#3B82F6',
  guts: '#EF4444',
  dexterity: '#10B981',
  kindness: '#F59E0B',
  charm: '#EC4899',
};

// readAsDataUrl / compressImage 已迁移到 @/utils/imageCrop 复用
