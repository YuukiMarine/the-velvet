/**
 * AssetBoard — F5 心相记账「资产」板块（Phase ③）。
 *
 * 把记账从「流水」升成「财富镜」：固定资产（登记的耐用品）∶流动资产（=总余额）的净值视图。
 * 登记不存照片，类目绑定 emoji 图标（ledgerFormat.ASSET_CATEGORIES）。条目可加「附加费用」
 * （如手机壳）。流→存桥接在录入确认卡里（大额支出勾「登记为资产」）。
 */
import { useState } from 'react';
import { useAppStore, toLocalDateKey } from '@/store';
import { SheetModal } from '@/components/SheetModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { sym, fmtMoney, ASSET_CATEGORIES, assetIcon, ASSET_STATUS } from '@/utils/ledgerFormat';
import type { LedgerAsset } from '@/types';

type AssetStatus = 'inuse' | 'idle' | 'soldout';
const STATUSES: AssetStatus[] = ['inuse', 'idle', 'soldout'];
const assetTotal = (a: LedgerAsset) => a.price + (a.addOns?.reduce((s, o) => s + o.amount, 0) ?? 0);

export function AssetBoard() {
  const { settings, assets, getTotalBalance, getFixedAssetTotal, addAsset } = useAppStore();
  const $ = sym(settings.currency);
  const liquid = getTotalBalance();
  const fixed = getFixedAssetTotal();
  const net = liquid + fixed;
  const liquidPct = net !== 0 ? Math.max(0, (liquid / net) * 100) : 50;
  const fixedPct = net !== 0 ? Math.max(0, (fixed / net) * 100) : 50;

  const [addOpen, setAddOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {/* 净值：固定 vs 流动 */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-bold text-gray-800 dark:text-white">总财富</span>
          <span className="text-xl font-black text-gray-900 dark:text-white tabular-nums">{$}{fmtMoney(net)}</span>
        </div>
        <div className="flex h-2.5 rounded-full overflow-hidden mt-3 bg-gray-100 dark:bg-gray-700">
          <div className="bg-primary/70" style={{ width: `${liquidPct}%` }} />
          <div className="bg-amber-400" style={{ width: `${fixedPct}%` }} />
        </div>
        <div className="flex justify-between text-xs mt-2 text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-primary/70" />流动 {$}{fmtMoney(liquid)}</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" />固定 {$}{fmtMoney(fixed)}</span>
        </div>
      </div>

      <button
        onClick={() => setAddOpen(true)}
        className="w-full py-2.5 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-500 dark:text-gray-400 hover:border-primary/50 hover:text-primary transition-colors"
      >
        ＋ 登记一件资产
      </button>

      {assets.length === 0 ? (
        <div className="text-center text-sm text-gray-400 py-8 leading-relaxed">
          还没有登记的固定资产。<br />把买过的设备 / 乐器登记进来，看看钱变成了什么。
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm divide-y divide-gray-50 dark:divide-gray-700/40">
          {assets.map(a => (
            <button
              key={a.id}
              onClick={() => setDetailId(a.id)}
              className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors first:rounded-t-xl last:rounded-b-xl"
            >
              <span className="text-2xl flex-shrink-0">{assetIcon(a.category)}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{a.name}</div>
                <div className="text-xs text-gray-400 dark:text-gray-500 truncate">
                  <span className={ASSET_STATUS[a.status].cls}>{ASSET_STATUS[a.status].label}</span>
                  {' · '}{a.purchaseDate}
                  {a.addOns?.length ? ` · +${a.addOns.length} 附加` : ''}
                </div>
              </div>
              <span className={`text-sm font-bold tabular-nums flex-shrink-0 ${a.status === 'soldout' ? 'text-gray-400 line-through' : 'text-gray-800 dark:text-gray-100'}`}>
                {$}{fmtMoney(assetTotal(a))}
              </span>
            </button>
          ))}
        </div>
      )}

      <AssetAddSheet isOpen={addOpen} onClose={() => setAddOpen(false)} $={$} onSave={async (input) => { await addAsset(input); setAddOpen(false); }} />
      <AssetDetailSheet assetId={detailId} onClose={() => setDetailId(null)} $={$} />
    </div>
  );
}

// ── 登记 ──────────────────────────────────────────────────

function AssetAddSheet({ isOpen, onClose, $, onSave }: {
  isOpen: boolean; onClose: () => void; $: string;
  onSave: (input: Omit<LedgerAsset, 'id' | 'createdAt'>) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('other');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(toLocalDateKey());
  const [status, setStatus] = useState<AssetStatus>('inuse');
  const canSave = name.trim() !== '' && Number(price) > 0;

  const save = async () => {
    if (!canSave) return;
    await onSave({ name: name.trim(), category, price: Number(price), purchaseDate: date, status });
    setName(''); setCategory('other'); setPrice(''); setDate(toLocalDateKey()); setStatus('inuse');
  };

  return (
    <SheetModal
      isOpen={isOpen} onClose={onClose} title="登记资产"
      footer={<button onClick={save} disabled={!canSave} className="w-full py-3.5 rounded-2xl font-bold text-sm bg-primary text-white disabled:opacity-40 active:scale-[0.98]">保存</button>}
    >
      <div className="space-y-4">
        <input
          value={name} onChange={e => setName(e.target.value)} placeholder="名称（如 索尼相机）" autoFocus
          className="w-full px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-800 dark:text-white placeholder-gray-400 outline-none focus:border-primary"
        />
        <div className="flex flex-wrap gap-1.5">
          {ASSET_CATEGORIES.map(c => (
            <button
              key={c.key} onClick={() => setCategory(c.key)}
              className={`px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                category === c.key ? 'bg-primary/10 border-primary/40 text-primary' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400'
              }`}
            >
              {c.icon} {c.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <span className="text-xl font-black text-gray-400">{$}</span>
          <input
            type="number" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="购入价"
            className="flex-1 min-w-0 bg-transparent text-2xl font-black text-gray-900 dark:text-white tabular-nums outline-none"
          />
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1 flex-1">
            {STATUSES.map(st => (
              <button
                key={st} onClick={() => setStatus(st)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${status === st ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-white shadow-sm' : 'text-gray-400'}`}
              >
                {ASSET_STATUS[st].label}
              </button>
            ))}
          </div>
          <input
            type="date" value={date} onChange={e => setDate(e.target.value || toLocalDateKey())}
            className="px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-200 tabular-nums outline-none focus:border-primary"
          />
        </div>
      </div>
    </SheetModal>
  );
}

// ── 详情 / 编辑 ───────────────────────────────────────────

function AssetDetailSheet({ assetId, onClose, $ }: { assetId: string | null; onClose: () => void; $: string }) {
  const { assets, updateAsset, deleteAsset } = useAppStore();
  const asset = assets.find(a => a.id === assetId) ?? null;
  const [addonName, setAddonName] = useState('');
  const [addonAmount, setAddonAmount] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);

  const addAddon = async () => {
    if (!asset || !addonName.trim() || !(Number(addonAmount) > 0)) return;
    await updateAsset(asset.id, { addOns: [...(asset.addOns ?? []), { name: addonName.trim(), amount: Number(addonAmount) }] });
    setAddonName(''); setAddonAmount('');
  };
  const removeAddon = async (idx: number) => {
    if (!asset) return;
    await updateAsset(asset.id, { addOns: (asset.addOns ?? []).filter((_, i) => i !== idx) });
  };

  return (
    <>
      <SheetModal isOpen={!!asset} onClose={onClose} title={asset?.name ?? '资产'}>
        {asset && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-4xl">{assetIcon(asset.category)}</span>
              <div className="flex-1">
                <div className="text-2xl font-black text-gray-900 dark:text-white tabular-nums">{$}{fmtMoney(assetTotal(asset))}</div>
                <div className="text-xs text-gray-400">购入 {$}{fmtMoney(asset.price)} · {asset.purchaseDate}</div>
              </div>
            </div>

            {/* 状态 */}
            <div className="flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
              {STATUSES.map(st => (
                <button
                  key={st} onClick={() => updateAsset(asset.id, { status: st })}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${asset.status === st ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-white shadow-sm' : 'text-gray-400'}`}
                >
                  {ASSET_STATUS[st].label}
                </button>
              ))}
            </div>

            {/* 附加费用 */}
            <div>
              <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">附加费用</div>
              {asset.addOns?.length ? (
                <div className="space-y-1.5 mb-2">
                  {asset.addOns.map((o, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 text-gray-700 dark:text-gray-200 truncate">{o.name}</span>
                      <span className="tabular-nums text-gray-500">{$}{fmtMoney(o.amount)}</span>
                      <button onClick={() => removeAddon(i)} aria-label="删除附加费用" className="text-gray-300 hover:text-red-500 px-1">×</button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 mb-2">如手机壳、配件、维修费…</p>
              )}
              <div className="flex gap-2">
                <input
                  value={addonName} onChange={e => setAddonName(e.target.value)} placeholder="名称"
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-800 dark:text-white placeholder-gray-400 outline-none focus:border-primary"
                />
                <input
                  type="number" inputMode="decimal" value={addonAmount} onChange={e => setAddonAmount(e.target.value)} placeholder="金额"
                  className="w-24 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-800 dark:text-white tabular-nums placeholder-gray-400 outline-none focus:border-primary"
                />
                <button onClick={addAddon} disabled={!addonName.trim() || !(Number(addonAmount) > 0)} className="px-3 py-2 rounded-lg text-sm font-semibold bg-primary/10 text-primary disabled:opacity-40">加</button>
              </div>
            </div>

            <button onClick={() => setConfirmDel(true)} className="w-full py-2.5 rounded-xl text-sm font-semibold text-red-500 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors">
              删除这件资产
            </button>
          </div>
        )}
      </SheetModal>

      <ConfirmDialog
        isOpen={confirmDel}
        tone="danger"
        title="删除这件资产？"
        description={asset?.name}
        confirmText="删除"
        onConfirm={async () => { if (asset) await deleteAsset(asset.id); setConfirmDel(false); onClose(); }}
        onCancel={() => setConfirmDel(false)}
      />
    </>
  );
}
