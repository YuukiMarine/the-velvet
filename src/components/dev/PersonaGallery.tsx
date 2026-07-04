/**
 * PersonaGallery —— src/ui 原语的 dev 样品间（仅 DEV 挂载，同 SlantTuner/StarTearDemo）。
 *
 * 用途：P7.3 起所有原语在此陈列，频道切换器直接改 <html data-ui-channel>（不动 store），
 * 三频道视觉与 D0 手感在真实渲染管线里验收；P9 施工时当「样板间」对照。
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { PersonaButton } from '@/ui/components/PersonaButton';
import { PersonaPageTitle } from '@/ui/components/PersonaPageTitle';
import { PersonaBadge } from '@/ui/components/PersonaBadge';
import { PersonaListRow } from '@/ui/components/PersonaListRow';
import { PersonaInput } from '@/ui/components/PersonaInput';
import { PersonaProgress } from '@/ui/components/PersonaProgress';
import { PersonaNumber } from '@/ui/components/PersonaNumber';
import { Halftone, Scanlines, SignalStripes, SunRing, BigTypeBackdrop, SlashPanel } from '@/ui/motifs';
import type { UIChannel } from '@/ui/channel';

const CHANNELS: { id: UIChannel; label: string }[] = [
  { id: 'neutral', label: '中性' },
  { id: 'p5', label: 'P5 红' },
  { id: 'p4', label: 'P4 黄' },
  { id: 'p3', label: 'P3 蓝' },
];

/** 各频道舞台底色（gallery 自备，正式页面由 App Shell 负责） */
const STAGE_BG: Record<UIChannel, string> = {
  neutral: '#f3f4f6',
  p5: 'var(--ui-bg)',
  p4: 'var(--ui-bg)',
  p3: 'linear-gradient(160deg, #0057ff 0%, #001c7a 70%)',
};

export const PersonaGallery = () => {
  const [open, setOpen] = useState(false);
  const [ch, setCh] = useState<UIChannel>('neutral');
  const [num, setNum] = useState(1280);
  const [selectedRow, setSelectedRow] = useState(1);

  const switchChannel = (next: UIChannel) => {
    setCh(next);
    if (next === 'neutral') document.documentElement.removeAttribute('data-ui-channel');
    else document.documentElement.setAttribute('data-ui-channel', next);
  };

  const close = () => {
    setOpen(false);
    document.documentElement.removeAttribute('data-ui-channel');
    setCh('neutral');
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed left-2 top-[46%] z-[200] rounded-r-lg bg-black/80 px-1.5 py-2 text-[10px] font-bold text-white [writing-mode:vertical-rl]"
      >
        ◈ 原语样品间
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[210] overflow-y-auto" style={{ background: STAGE_BG[ch] }}>
            {/* 顶栏：频道切换 + 关闭 */}
            <div className="sticky top-0 z-10 flex items-center gap-2 bg-black/85 px-4 py-2.5 backdrop-blur">
              <span className="text-xs font-bold text-white/70">UI 原语样品间</span>
              <div className="ml-2 flex gap-1">
                {CHANNELS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => switchChannel(c.id)}
                    className={`rounded px-2.5 py-1 text-xs font-bold transition ${
                      ch === c.id ? 'bg-white text-black' : 'bg-white/15 text-white/80 hover:bg-white/25'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <button type="button" onClick={close} className="ml-auto rounded bg-white/15 px-3 py-1 text-xs font-bold text-white">
                关闭 ✕
              </button>
            </div>

            <div className="mx-auto max-w-3xl space-y-10 px-5 py-8 pb-24">
              {/* PageTitle */}
              <section className="space-y-4">
                <GalleryLabel ch={ch}>PersonaPageTitle</GalleryLabel>
                <PersonaPageTitle title="夺回今天" eyebrow="TAKE BACK" meta="7/4 FRI" />
                <PersonaPageTitle title="深夜记录" eyebrow="MEMORY LOG" />
              </section>

              {/* Button */}
              <section className="space-y-4">
                <GalleryLabel ch={ch}>PersonaButton</GalleryLabel>
                <div className="flex flex-wrap items-center gap-3">
                  <PersonaButton size="lg">主行动</PersonaButton>
                  <PersonaButton size="md">确认</PersonaButton>
                  <PersonaButton size="sm">小动作</PersonaButton>
                  <PersonaButton variant="icon" aria-label="工具">✦</PersonaButton>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <PersonaButton variant="secondary">次要路径</PersonaButton>
                  <PersonaButton variant="ghost">轻动作</PersonaButton>
                  <PersonaButton variant="danger">撕掉</PersonaButton>
                  <PersonaButton busy>提交中</PersonaButton>
                  <PersonaButton disabled>不可用</PersonaButton>
                </div>
              </section>

              {/* Badge */}
              <section className="space-y-4">
                <GalleryLabel ch={ch}>PersonaBadge</GalleryLabel>
                <div className="flex flex-wrap items-center gap-3">
                  <PersonaBadge tone="accent">LV.12</PersonaBadge>
                  <PersonaBadge tone="danger">超支</PersonaBadge>
                  <PersonaBadge tone="muted">已归档</PersonaBadge>
                  <PersonaBadge tone="outline">RANK 3</PersonaBadge>
                </div>
              </section>

              {/* ListRow */}
              <section className="space-y-4">
                <GalleryLabel ch={ch}>PersonaListRow</GalleryLabel>
                <div className="space-y-2">
                  {['去银行办卡', '固定晨跑 30 分钟', '读《人间失格》两章'].map((t, i) => (
                    <PersonaListRow
                      key={t}
                      title={t}
                      subtitle={i === 0 ? '知识 +2 · 截止今天' : undefined}
                      meta={i === 1 ? '7:30' : undefined}
                      leading={<span className="text-lg" aria-hidden>{['🏦', '🏃', '📖'][i]}</span>}
                      selected={selectedRow === i}
                      completed={i === 2}
                      onClick={() => setSelectedRow(i)}
                    />
                  ))}
                </div>
              </section>

              {/* Input */}
              <section className="space-y-4">
                <GalleryLabel ch={ch}>PersonaInput</GalleryLabel>
                <PersonaInput label="目标名称" placeholder="锁定一个目标…" hint="2~12 字，短促有力" />
                <PersonaInput label="金额" defaultValue="不是数字" error="只能填数字" />
                <PersonaInput label="宣言" multiline rows={2} placeholder="写给明天的自己" />
              </section>

              {/* Progress + Number */}
              <section className="space-y-4">
                <GalleryLabel ch={ch}>PersonaProgress / PersonaNumber</GalleryLabel>
                <PersonaProgress tone="hp" value={0.62} label="HP" valueText="62/100" />
                <PersonaProgress tone="sp" value={0.35} label="SP" valueText="35/100" />
                <PersonaProgress tone="danger" value={0.88} label="预算" valueText="88%" />
                <div className="flex items-center gap-4">
                  <div className={`text-4xl font-black ${ch === 'p4' ? 'text-[#111]' : ch === 'neutral' ? 'text-gray-800' : 'text-white'}`}>
                    <PersonaNumber value={num} />
                  </div>
                  <PersonaButton size="sm" variant="secondary" onClick={() => setNum((n) => n + Math.floor(Math.random() * 240) - 60)}>
                    随机变动
                  </PersonaButton>
                </div>
              </section>

              {/* SlashPanel + motifs */}
              <section className="space-y-4">
                <GalleryLabel ch={ch}>SlashPanel / motifs</GalleryLabel>
                <SlashPanel tone="paper">
                  <div className="px-5 py-4 text-sm font-bold">纸面斜切面板（--ui-cut-md / --ui-shadow-hard 驱动）</div>
                </SlashPanel>
                <SlashPanel tone="surface">
                  <div className="px-5 py-4 text-sm font-bold">深面斜切面板</div>
                </SlashPanel>
                <div className="grid grid-cols-2 gap-3">
                  <div className="relative h-24 overflow-hidden rounded bg-black/80">
                    <Halftone className="absolute inset-0" color="rgba(255,255,255,0.35)" />
                    <CenterTag>Halftone</CenterTag>
                  </div>
                  <div className="relative h-24 overflow-hidden rounded bg-black/80">
                    <Scanlines />
                    <CenterTag>Scanlines</CenterTag>
                  </div>
                  <div className="relative h-24 overflow-hidden rounded bg-white/90">
                    <SignalStripes className="absolute inset-y-0 left-0 w-3" />
                    <SignalStripes className="absolute inset-x-0 bottom-2 h-2" vertical={false} />
                    <CenterTag dark>SignalStripes</CenterTag>
                  </div>
                  <div className="relative h-24 overflow-hidden rounded bg-[#ffe100]">
                    <SunRing className="absolute -right-6 -top-6 h-32 w-32" />
                    <CenterTag dark>SunRing</CenterTag>
                  </div>
                </div>
                <div className="relative h-28 overflow-hidden rounded" style={{ background: 'linear-gradient(135deg,#0066cc,#001c7a)' }}>
                  <BigTypeBackdrop word="MEMENTO" className="absolute -left-2 bottom-0 text-7xl text-white opacity-[0.14]" />
                  <CenterTag>BigTypeBackdrop</CenterTag>
                </div>
              </section>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};

const GalleryLabel = ({ children, ch }: { children: string; ch: UIChannel }) => (
  <div
    className={`inline-block rounded px-2 py-1 text-[11px] font-black tracking-wider ${
      ch === 'p4' || ch === 'neutral' ? 'bg-black/80 text-white' : 'bg-white/90 text-black'
    }`}
  >
    {children}
  </div>
);

const CenterTag = ({ children, dark = false }: { children: string; dark?: boolean }) => (
  <span className={`absolute inset-0 flex items-center justify-center text-xs font-bold ${dark ? 'text-black/70' : 'text-white/80'}`}>
    {children}
  </span>
);
