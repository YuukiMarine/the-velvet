import type { CSSProperties } from 'react';
import { P3R, slantClip } from '@/components/p3r/kit';
import { P5R } from '@/components/p5r/kit';
import { PERSONA_SOURCES } from '@/utils/battleAI';
import type { PersonaSourceId } from '@/types';

/** 附加题的题面（觉醒问答第五题下方，可不答） */
export const PERSONA_SOURCE_QUESTION = '你心中所熟知的、构成你的力量之源来自于：';
const MAX = 2;

type Tone = 'p3' | 'p4' | 'p5' | 'default';

/**
 * 觉醒问答的附加题「力量之源」（第 13 轮用户反馈）：最多选两类，不选就按原规则召唤。
 * 四套皮共用一个组件，只换配色；选满两个后其余项变灰，点已选的可以取消。
 */
export function PersonaSourcePicker({ value, onChange, tone }: {
  value: PersonaSourceId[];
  onChange: (next: PersonaSourceId[]) => void;
  tone: Tone;
}) {
  const toggle = (id: PersonaSourceId) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else if (value.length < MAX) onChange([...value, id]);
  };
  const c = TONES[tone];
  return (
    <div className="mt-5" data-testid="persona-sources">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-black tracking-[0.12em]" style={{ color: c.eyebrow }}>附加题 · 可不答</span>
        <span className="text-[10px] font-bold" style={{ color: c.muted }}>
          {value.length ? `已选 ${value.length} / ${MAX}` : `最多选 ${MAX} 个`}
        </span>
      </div>
      <p className="mt-1.5 text-[14px] font-black leading-snug" style={{ color: c.title, fontFamily: c.titleFont }}>{PERSONA_SOURCE_QUESTION}</p>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        {PERSONA_SOURCES.map((s, i) => {
          const on = value.includes(s.id);
          const locked = !on && value.length >= MAX;
          return (
            <button
              key={s.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              aria-disabled={locked}
              onClick={() => toggle(s.id)}
              className={`px-3 py-2 text-left transition-transform active:scale-[0.98] ${i === PERSONA_SOURCES.length - 1 ? 'col-span-2' : ''} ${locked ? 'opacity-40' : ''} ${c.shapeClass}`}
              style={{ ...c.chipStyle(on), ...(c.clip ? { clipPath: c.clip } : {}) }}
            >
              <span className="block text-[13px] font-black leading-tight" style={{ color: on ? c.onText : c.text }}>{s.label}</span>
              <span className="mt-0.5 block text-[10px] font-bold leading-tight" style={{ color: on ? c.onHint : c.muted }}>{s.hint}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] font-bold leading-relaxed" style={{ color: c.muted }}>
        选了就只从这些范围里找你的面具，地域依旧不限；不选则不限范围。
      </p>
    </div>
  );
}

const TONES: Record<Tone, {
  eyebrow: string; title: string; titleFont?: string; text: string; muted: string; onText: string; onHint: string;
  shapeClass: string; clip?: string; chipStyle: (on: boolean) => CSSProperties;
}> = {
  p3: {
    eyebrow: P3R.blue, title: P3R.ink, text: P3R.ink, muted: P3R.inkSoft, onText: '#fff', onHint: 'rgba(255,255,255,0.82)',
    shapeClass: '', clip: slantClip(8),
    chipStyle: (on) => ({ background: on ? P3R.blue : '#fff', boxShadow: on ? 'none' : '0 4px 12px rgba(38,96,140,0.10)' }),
  },
  p4: {
    // 黄底上橙字几乎看不见（扫图发现），眉标改墨色
    eyebrow: 'color-mix(in srgb, var(--ui-ink, #131313) 78%, transparent)', title: 'var(--ui-ink, #131313)', titleFont: 'var(--p4-display-font, serif)',
    text: 'var(--ui-ink, #131313)', muted: 'color-mix(in srgb, var(--ui-ink, #131313) 60%, transparent)',
    onText: 'var(--ui-ink, #131313)', onHint: 'color-mix(in srgb, var(--ui-ink, #131313) 72%, transparent)',
    shapeClass: 'rounded-xl',
    chipStyle: (on) => ({ background: on ? 'var(--p4-orange, #f9a11b)' : 'var(--ui-paper, #fff6d0)', boxShadow: '0 3px 0 rgba(19,19,19,0.14)' }),
  },
  p5: {
    eyebrow: 'rgba(240,233,223,0.85)', title: P5R.paper, text: P5R.paper, muted: P5R.greyLight, onText: P5R.paper, onHint: 'rgba(255,255,255,0.8)',
    shapeClass: '',
    chipStyle: (on) => ({ background: on ? P5R.red : '#171614', border: `1.5px solid ${on ? P5R.red : '#2c2a26'}` }),
  },
  default: {
    eyebrow: 'rgb(196,181,253)', title: '#fff', text: '#e5e7eb', muted: 'rgba(209,213,219,0.7)', onText: '#fff', onHint: 'rgba(255,255,255,0.8)',
    shapeClass: 'rounded-xl',
    chipStyle: (on) => ({
      background: on ? 'rgb(var(--color-battle-rgb))' : 'rgba(255,255,255,0.08)',
      border: `1px solid ${on ? 'rgb(var(--color-battle-rgb))' : 'rgba(255,255,255,0.18)'}`,
    }),
  },
};
