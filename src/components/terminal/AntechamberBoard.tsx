/**
 * AntechamberBoard — P3 blue terminal landing.
 *
 * This skin is intentionally poster-like: bright blue planes, water-caustic
 * texture, huge sans-serif type, and only a few functional affordances.
 */
import { motion } from 'motion/react';
import { useAppStore } from '@/store';
import { useBoldness } from '@/utils/boldness';
import { triggerLightHaptic, triggerThemeSwitchFeedback } from '@/utils/feedback';
import type { TerminalSkin } from '@/utils/terminalSkin';

interface Props {
  skin: TerminalSkin;
  onEnter: () => void;
  onBack: () => void;
  danmakuPool: string[];
}

const displayFont = "'Arial Black','Helvetica Neue',Arial,'Noto Sans SC','Microsoft YaHei',sans-serif";
const uiFont = "'Inter','Helvetica Neue',Arial,'Noto Sans SC','Microsoft YaHei',sans-serif";
const monoFont = "'JetBrains Mono','Cascadia Code',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const causticTexture = [
  'radial-gradient(ellipse at 18% 22%, transparent 0 24%, rgba(255,255,255,.28) 24.5% 25.4%, transparent 26%)',
  'radial-gradient(ellipse at 58% 28%, transparent 0 21%, rgba(255,255,255,.24) 21.4% 22.2%, transparent 23%)',
  'radial-gradient(ellipse at 34% 72%, transparent 0 27%, rgba(255,255,255,.2) 27.3% 28.1%, transparent 29%)',
  'radial-gradient(ellipse at 78% 68%, transparent 0 23%, rgba(255,255,255,.18) 23.4% 24.2%, transparent 25%)',
].join(', ');

export const AntechamberBoard = ({ skin, onEnter, onBack, danmakuPool }: Props) => {
  const user = useAppStore((s) => s.user);
  const bold = useBoldness();

  const enter = () => {
    triggerLightHaptic();
    if (user?.theme) triggerThemeSwitchFeedback(user.theme);
    onEnter();
  };

  const posts = (danmakuPool.length ? danmakuPool : ['加油，第一步真是又难又轻松，致敬你！', '今天也很棒！']).slice(0, 3);
  const tickerText = posts.map((p, index) => `#${String(index + 1).padStart(2, '0')} 匿名: ${p}`).join('  /  ');

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-[#003b94] text-white" style={{ fontFamily: uiFont }}>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% -8%, rgba(37, 177, 255, 0.62), transparent 28%), linear-gradient(180deg, #003272 0%, #0050bf 49%, #00328c 100%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-45"
        style={{
          backgroundImage:
            'radial-gradient(ellipse at 74% 18%, rgba(84, 220, 255, 0.28), transparent 22%), radial-gradient(ellipse at 37% 55%, rgba(51, 154, 255, 0.32), transparent 28%), linear-gradient(132deg, transparent 0 44%, rgba(255,255,255,0.08) 44.2% 45.6%, transparent 45.8% 100%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(255,255,255,.08) 0 1px, transparent 1px 4px), radial-gradient(circle at 30% 20%, rgba(255,255,255,.2) 0 1px, transparent 1.6px)',
          backgroundSize: 'auto, 34px 34px',
        }}
      />

      <motion.main
        initial={{ opacity: 0, y: bold ? 12 : 0 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: bold ? 0.34 : 0.12, ease: [0.22, 1, 0.36, 1] }}
        className="relative mx-auto flex min-h-dvh w-full max-w-[760px] flex-col px-8 pb-8 pt-9"
      >
        <header className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-5">
            <button
              type="button"
              onClick={onBack}
              aria-label="返回"
              className="relative h-11 w-9 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/80"
            >
              <span className="absolute left-2 top-1/2 h-5 w-5 -translate-y-1/2 rotate-45 border-b-[5px] border-l-[5px] border-white" />
            </button>
            <span aria-hidden className="h-0 w-0 shrink-0 border-y-[18px] border-l-[28px] border-y-transparent border-l-white" />
            <h1 className="truncate text-[2rem] font-black tracking-[0.02em] text-white drop-shadow-[0_3px_10px_rgba(14,175,255,.28)]" style={{ fontFamily: displayFont }}>
              {skin.roomTitle}
            </h1>
          </div>
          <div className="flex items-center gap-3 text-[0.95rem] font-black tracking-[0.38em] text-white">
            <span aria-hidden className="h-3.5 w-3.5 rounded-full bg-[#29d6ff] shadow-[0_0_18px_rgba(41,214,255,.95)]" />
            LIVE
          </div>
        </header>

        <section className="mt-7">
          <div className="flex items-center gap-4 text-[1.28rem] font-black tracking-[0.02em] text-white">
            <span aria-hidden className="h-9 w-2.5 bg-[#28dfff]" />
            <span>自夜间苏醒的人，在此叩问自己的使命。</span>
          </div>
          <div aria-hidden className="mt-4 h-px w-full bg-white/62" />
        </section>

        <section className="relative mt-5 min-h-[505px]">
          <div
            aria-hidden
            className="absolute -left-8 top-0 h-[362px] w-[92%] shadow-[0_18px_60px_rgba(0,20,80,.2)]"
            style={{
              clipPath: 'polygon(0 0, 100% 6%, 77% 100%, 0 92%)',
              background: `${causticTexture}, linear-gradient(120deg, rgba(255,255,255,.98), rgba(233,246,255,.94))`,
            }}
          />
          <div
            aria-hidden
            className="absolute right-[-3rem] top-0 h-[378px] w-[60%] bg-[#08aef2]"
            style={{
              clipPath: 'polygon(34% 4%, 100% 13%, 100% 100%, 0 100%)',
              background:
                `${causticTexture}, radial-gradient(circle at 45% 12%, rgba(255,255,255,.74), transparent 2%, transparent 3%), radial-gradient(ellipse at 40% 35%, rgba(255,255,255,.26), transparent 42%), linear-gradient(135deg, #0dc9ff 0%, #0086dd 58%, #0057cc 100%)`,
            }}
          />
          <div
            aria-hidden
            className="absolute right-[8%] top-[-1px] h-[342px] w-[36%] bg-[#005be4]/72"
            style={{ clipPath: 'polygon(36% 0, 100% 0, 68% 100%, 0 100%)' }}
          />
          <div
            aria-hidden
            className="absolute right-2 top-[72px] h-[108px] w-[108px] opacity-80"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(255,255,255,.75) 1.4px, transparent 1.8px)',
              backgroundSize: '16px 16px',
            }}
          />
          <div
            aria-hidden
            className="absolute right-8 top-[78px] h-[230px] w-[230px] opacity-70"
            style={{
              background: `${causticTexture}, radial-gradient(circle at 15% 25%, transparent 0 34%, rgba(255,255,255,.7) 34.5% 35.5%, transparent 36%), radial-gradient(circle at 45% 45%, transparent 0 32%, rgba(255,255,255,.55) 32.5% 33.5%, transparent 34%)`,
              mixBlendMode: 'screen',
            }}
          />

          <div className="relative z-10 px-2 pt-[72px]">
            <div className="flex items-center gap-5 text-[1.15rem] font-black tracking-[0.28em] text-[#04307d]" style={{ fontFamily: uiFont }}>
              <span>TRACE</span>
              <span className="text-[#53c8ec]">READY</span>
            </div>
            <div aria-hidden className="mt-3 h-1.5 w-[124px] bg-[#20d5ff]" />
            <div aria-hidden className="mt-5 h-4 w-20 bg-[repeating-linear-gradient(90deg,rgba(0,69,153,.28)_0_3px,transparent_3px_13px)]" />

            <h2
              className="mt-7 text-[clamp(3.45rem,12.6vw,6.6rem)] font-black leading-[0.96] tracking-[-0.045em] text-[#082e78]"
              style={{ fontFamily: displayFont }}
            >
              <span className="block">从漂流中</span>
              <span className="block pl-[26%]">苏醒</span>
            </h2>

            <div className="mt-9 flex items-center">
              <span aria-hidden className="relative mr-7 h-9 w-9">
                <span className="absolute left-1/2 top-0 h-full w-2 -translate-x-1/2 bg-[#54dcff]" style={{ clipPath: 'polygon(50% 0, 70% 38%, 100% 50%, 70% 62%, 50% 100%, 30% 62%, 0 50%, 30% 38%)' }} />
                <span className="absolute left-0 top-1/2 h-2 w-full -translate-y-1/2 bg-[#54dcff]" style={{ clipPath: 'polygon(0 50%, 38% 30%, 50% 0, 62% 30%, 100% 50%, 62% 70%, 50% 100%, 38% 70%)' }} />
              </span>
              <span aria-hidden className="h-px flex-1 bg-[#082e78]" />
              <span aria-hidden className="h-1.5 w-16 bg-[#082e78]" />
            </div>
          </div>

          <div className="absolute right-[2%] top-[292px] z-10 flex flex-col items-end gap-5 text-[0.82rem] font-black tracking-[0.5em] text-white">
            <span>STASIS</span>
            <span>CLEAR</span>
            <span>FLOW</span>
          </div>
          <div aria-hidden className="absolute right-[0.5%] top-[296px] z-10 h-[94px] w-px bg-white/45" />

          <div
            aria-hidden
            className="absolute bottom-[86px] right-0 text-[6.6rem] font-black italic leading-none text-white/[0.14]"
            style={{ fontFamily: displayFont }}
          >
            TRACE
          </div>

          <motion.button
            type="button"
            onClick={enter}
            whileTap={{ scale: 0.985 }}
            aria-label="开启命运"
            className="absolute bottom-[22px] left-2 right-2 z-20 flex h-[88px] items-center justify-between bg-[#2edfff] px-[10%] text-[#06265f] shadow-[0_20px_55px_rgba(3,37,115,.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            style={{
              clipPath: 'polygon(5% 0, 100% 0, 94% 100%, 0 100%)',
              background: 'linear-gradient(100deg, #28d9ff 0%, #50e8fb 48%, #24d9ff 100%)',
              fontFamily: displayFont,
            }}
          >
            <span className="flex items-center gap-11">
              <span aria-hidden className="h-0 w-0 border-y-[19px] border-l-[28px] border-y-transparent border-l-[#041a40]" />
              <span aria-hidden className="h-[58px] w-px bg-[#06265f]/55" />
              <span className="whitespace-nowrap text-[1.86rem] font-black tracking-[-0.04em]">开启命运</span>
            </span>
            <span className="text-[2.8rem] font-light leading-none">→</span>
          </motion.button>
        </section>

        <section className="relative mt-2 h-[154px] border border-[#21b6ff]/70 bg-[#003077]/48 px-8 py-5 shadow-[0_18px_55px_rgba(0,22,80,.18)]">
          <div aria-hidden className="absolute left-0 top-0 h-8 w-28 bg-[#2bdfff]" style={{ clipPath: 'polygon(0 0, 100% 0, 88% 100%, 0 100%)' }} />
          <div aria-hidden className="absolute inset-0 overflow-hidden">
            <span
              className="absolute left-[25%] top-[8%] text-[5.25rem] font-black italic leading-none text-[#3dafff]/[0.12]"
              style={{ fontFamily: displayFont }}
            >
              RECORD
            </span>
          </div>
          <div className="relative z-10 flex items-start justify-between gap-5">
            <div>
              <h3 className="text-[2.56rem] font-black tracking-[-0.05em] text-white" style={{ fontFamily: displayFont }}>
                记录
              </h3>
              <p className="mt-3 text-[0.98rem] font-black tracking-[0.03em] text-white">
                2 个目标 · 完成 <span className="text-[#27e0ff]">1 / 6</span> 小步
              </p>
              <div className="mt-3.5 flex h-2.5 w-[72%] min-w-[330px] max-w-[500px]">
                <span className="flex-[1.05] bg-[#28dfff]" />
                <span className="flex-1 bg-[#0b67e0]" />
                <span className="flex-1 bg-[#085ed3]" />
                <span className="flex-1 bg-[#0757ca]" />
                <span className="flex-1 bg-[#064db9]" />
              </div>
            </div>
            <span className="mt-4 bg-[#42dcff] px-3.5 py-1.5 text-[0.86rem] font-black tracking-[0.14em] text-[#03245c]">CH 04</span>
          </div>
          <button
            type="button"
            onClick={enter}
            className="absolute bottom-6 right-9 z-10 text-[1.58rem] font-black tracking-[-0.03em] text-[#2bdfff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            打开 →
          </button>
        </section>

        <section className="relative mt-4 flex min-h-[56px] items-center overflow-hidden border border-[#23bdff]/75 bg-[#002868]/72 text-[#68eaff] shadow-[0_10px_32px_rgba(0,18,72,.2)]">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,.07)_0_1px,transparent_1px_4px)] opacity-45" />
          <span className="relative flex h-[56px] shrink-0 items-center border-r border-[#23bdff]/70 bg-[#dffaff] px-4 text-[0.82rem] font-black tracking-[0.08em] text-[#053076]" style={{ fontFamily: monoFont }}>
            匿名讨论版 ▶
          </span>
          <div className="relative min-w-0 flex-1 overflow-hidden px-5" style={{ fontFamily: monoFont }}>
            <motion.div
              className="whitespace-nowrap text-[0.82rem] font-black tracking-[0.02em]"
              animate={bold ? { x: ['0%', '-50%'] } : undefined}
              transition={bold ? { duration: 18, repeat: Infinity, ease: 'linear' } : undefined}
            >
              <span>[bbs://midnight]　{tickerText}　//　{tickerText}　//　</span>
              <span>[bbs://midnight]　{tickerText}　//　{tickerText}　//　</span>
            </motion.div>
          </div>
          <span aria-hidden className="mr-6 flex h-10 items-end gap-1.5">
            <span className="h-6 w-1.5 bg-[#24ddff]" />
            <span className="h-9 w-1.5 bg-[#24ddff]" />
            <span className="h-5 w-1.5 bg-[#24ddff]" />
            <span className="h-8 w-1.5 bg-[#24ddff]" />
          </span>
        </section>
      </motion.main>
    </div>
  );
};
