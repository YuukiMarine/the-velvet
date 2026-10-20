/**
 * 人格编辑器的状态与动作（第 30 批 b 从 NavigatorSettings 抽出来）：
 * 旧版竖排设置页（NavigatorSettings）和新版宫格设置页（pages/settings/sections/AssistantSection）共用一份逻辑，
 * 只有长相不同。字段口径、保存规则以这里为准。
 */
import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore } from '@/store';
import { useNavigatorStore } from '@/store/navigator';
import { generatePersonaPrompt } from '@/utils/navigatorIntent';
import { generatePersonaExamples } from '@/utils/navigatorPersona';
import { BUILTIN_NAVIGATOR_PRESETS } from '@/constants/navigatorPresets';
import type { NavigatorPreset } from '@/types';

export const TONE_WORDS = ['温柔', '毒舌', '元气', '冷淡', '正经', '幽默', '腹黑', '天然'];

export interface GeneratorState {
  open: boolean;
  editId?: string;
  name: string;
  callUser: string;
  toneWords: string[];
  coach: 'push' | 'accompany';
  freeText: string;
  personaPrompt: string;
  avatar: string;
  /** 固定喜好（第二批「自己的一天」）：逗号 / 顿号分隔；只有自定义人格能改，留空第一次用到时按设定自动写 */
  likes: string;
  dislikes: string;
  habits: string;
  /** 口吻示例（第 24 批 · C3）：一行一句，最多 5 句；只教语气和长短。以前只有内置三位有、自定义人格没入口 */
  examples: string;
  examplesBusy: boolean;
  /** 认识你多久了（第 25 批 · 用户简报）：一直都在 / 刚认识 */
  knowSince: 'always' | 'fresh';
  generating: boolean;
  error?: string;
}

export const closedGenerator: GeneratorState = {
  open: false, name: '', callUser: '', toneWords: [], coach: 'accompany',
  freeText: '', personaPrompt: '', avatar: 'star', likes: '', dislikes: '', habits: '', examples: '', examplesBusy: false, knowSince: 'always', generating: false,
};

export const splitExamples = (v: string): string[] =>
  v.split(/\n+/).map((x) => x.trim().replace(/^[-•·]\s*/, '').slice(0, 60)).filter(Boolean).slice(0, 5);
export const splitTraits = (v: string): string[] =>
  v.split(/[，,、；;\n]+/).map((x) => x.trim().slice(0, 16)).filter(Boolean).slice(0, 4);

export function usePersonaEditor() {
  const settings = useAppStore((s) => s.settings);
  const [gen, setGen] = useState<GeneratorState>(closedGenerator);

  const openEditor = (p?: NavigatorPreset) =>
    setGen(p
      ? {
          ...closedGenerator, open: true, editId: p.id, name: p.name, personaPrompt: p.personaPrompt, avatar: p.avatar ?? 'star',
          likes: p.traits?.likes.join('、') ?? '', dislikes: p.traits?.dislikes.join('、') ?? '', habits: p.traits?.habits.join('、') ?? '',
          // 内置人格（设定没改过）显示代码里的示例；改过的 / 自定义的显示它自己的
          examples: (p.examples ?? BUILTIN_NAVIGATOR_PRESETS.find((b) => b.id === p.id && b.personaPrompt === p.personaPrompt)?.examples ?? []).join('\n'),
          coach: p.coachStyle ?? BUILTIN_NAVIGATOR_PRESETS.find((b) => b.id === p.id)?.coachStyle ?? 'accompany',
          knowSince: p.knowSince ?? 'always',
        }
      : { ...closedGenerator, open: true });
  const closeEditor = () => setGen(closedGenerator);
  /** 内置人格（改头像时存的是同 id 的影子行）的喜好写在代码里，不在这里改 */
  const editingBuiltin = !!gen.editId && BUILTIN_NAVIGATOR_PRESETS.some((b) => b.id === gen.editId);

  const runGenerate = async () => {
    if (!gen.name.trim()) { setGen((s) => ({ ...s, error: '先给它起个名字' })); return; }
    setGen((s) => ({ ...s, generating: true, error: undefined }));
    try {
      const text = await generatePersonaPrompt({
        name: gen.name.trim(), callUser: gen.callUser.trim(),
        toneWords: gen.toneWords, coach: gen.coach, freeText: gen.freeText.trim(),
      });
      setGen((s) => ({ ...s, generating: false, personaPrompt: text }));
    } catch (e) {
      setGen((s) => ({ ...s, generating: false, error: e instanceof Error ? e.message : '生成失败' }));
    }
  };

  const runExamples = async () => {
    const name = gen.name.trim();
    const prompt = gen.personaPrompt.trim();
    if (!name || !prompt) { setGen((s) => ({ ...s, error: '先把名字和人格设定填好' })); return; }
    setGen((s) => ({ ...s, examplesBusy: true, error: undefined }));
    try {
      const lines = await generatePersonaExamples(name, prompt, settings);
      setGen((s) => ({ ...s, examplesBusy: false, examples: lines.join('\n') }));
    } catch (e) {
      setGen((s) => ({ ...s, examplesBusy: false, error: e instanceof Error ? e.message : '生成失败' }));
    }
  };

  const savePreset = async () => {
    const name = gen.name.trim();
    const prompt = gen.personaPrompt.trim();
    if (!name || !prompt) { setGen((s) => ({ ...s, error: '名字和人格设定都不能为空' })); return; }
    const traits = { likes: splitTraits(gen.likes), dislikes: splitTraits(gen.dislikes), habits: splitTraits(gen.habits) };
    const hasTraits = traits.likes.length + traits.dislikes.length + traits.habits.length > 0;
    const nav = useNavigatorStore.getState();
    const prev = gen.editId ? nav.presets.find((p) => p.id === gen.editId) : undefined;
    const examples = splitExamples(gen.examples);
    await nav.savePreset({
      id: gen.editId ?? uuidv4(),
      name, personaPrompt: prompt, avatar: gen.avatar,
      isBuiltin: false,
      createdAt: prev?.createdAt ?? new Date(),
      handoffLine: prev?.handoffLine,
      // 留空 = 不存，第一次用到时按人格设定自动写一份
      traits: !editingBuiltin && hasTraits ? traits : undefined,
      examples: examples.length ? examples : undefined,
      // 末尾人设锚（≤60 字的「你是谁」）和认真模式跟着设定文本走：文本改了就作废，下次用到时重写（navigatorPersona）
      anchor: prev && prev.personaPrompt === prompt ? prev.anchor : undefined,
      serious: prev && prev.personaPrompt === prompt ? prev.serious : undefined,
      coachStyle: gen.coach,
      knowSince: !editingBuiltin && gen.knowSince === 'fresh' ? 'fresh' : undefined,
    });
    setGen(closedGenerator);
  };

  return { gen, setGen, openEditor, closeEditor, editingBuiltin, runGenerate, runExamples, savePreset };
}
