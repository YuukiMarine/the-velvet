import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { MAJOR_ARCANA } from '@/constants/tarot';
import { seasonMarksOfYear, seasonPagesOf, type SeasonMark, type SeasonPage } from '@/utils/calendar';
import type { SeasonStamp, TarotOrientation } from '@/types';

/**
 * 图鉴（第 6 轮）两本册子的读数。全部由已有数据推导：塔罗从每日抽牌 + 中长期占卜，岁时从 stamps 表。
 * 不新造任何"收集品"存储。（影子档案只在战场里的「阴影档案馆」看，用户拍板不进图鉴。）
 */

export interface TarotSide { count: number; first?: string }
export interface TarotEntry { id: string; upright: TarotSide; reversed: TarotSide }

const bump = (m: Map<string, TarotEntry>, id: string, o: TarotOrientation, date: string) => {
  const e = m.get(id) ?? { id, upright: { count: 0 }, reversed: { count: 0 } };
  const side = o === 'reversed' ? e.reversed : e.upright;
  side.count += 1;
  if (!side.first || date < side.first) side.first = date;
  m.set(id, e);
};

export interface TarotCollection {
  entries: Map<string, TarotEntry>;
  /** 大阿卡纳 22 张 × 正 / 逆，已收几格（满 44） */
  majorCollected: number;
  loaded: boolean;
}

export function useTarotCollection(): TarotCollection {
  const rows = useLiveQuery(async () => {
    const [daily, longs] = await Promise.all([db.dailyDivinations.toArray(), db.longReadings.toArray()]);
    return { daily, longs };
  }, []);
  return useMemo(() => {
    const entries = new Map<string, TarotEntry>();
    if (rows) {
      for (const d of rows.daily) if (d.cardId) bump(entries, d.cardId, d.orientation, d.date);
      for (const r of rows.longs) {
        const date = new Date(r.createdAt).toISOString().slice(0, 10);
        for (const p of r.picked ?? []) if (p?.cardId) bump(entries, p.cardId, p.orientation, date);
      }
    }
    let majorCollected = 0;
    for (const c of MAJOR_ARCANA) {
      const e = entries.get(c.id);
      if (e?.upright.count) majorCollected++;
      if (e?.reversed.count) majorCollected++;
    }
    return { entries, majorCollected, loaded: !!rows };
  }, [rows]);
}

export type CollectedMark = SeasonMark & { collected: boolean; collectedAt?: string };
export type CollectedPage = Omit<SeasonPage, 'marks'> & { marks: CollectedMark[] };

export interface SeasonCollection {
  stamps: SeasonStamp[];
  years: number[];
  marksOf: (year: number) => CollectedMark[];
  /** 春夏秋冬四页（岁时册按季翻页） */
  pagesOf: (year: number) => CollectedPage[];
  /** 月相 / 委托 / 满月团战这类不按年历排的印记 */
  extras: SeasonStamp[];
  loaded: boolean;
}

export function useSeasonCollection(): SeasonCollection {
  const stamps = useLiveQuery(() => db.stamps.toArray(), []);
  return useMemo(() => {
    const list = stamps ?? [];
    const byId = new Map(list.map((s) => [s.id, s]));
    const thisYear = new Date().getFullYear();
    const years = Array.from(new Set([thisYear, ...list.map((s) => s.year)])).sort((a, b) => b - a);
    const decorate = (m: SeasonMark): CollectedMark => ({ ...m, collected: byId.has(m.key), collectedAt: byId.get(m.key)?.collectedAt });
    return {
      stamps: list,
      years,
      marksOf: (year: number) => seasonMarksOfYear(year).map(decorate),
      pagesOf: (year: number) => seasonPagesOf(year).map((p) => ({ ...p, marks: p.marks.map(decorate) })),
      extras: list.filter((s) => s.kind === 'moon' || s.kind === 'quest' || s.kind === 'raid').sort((a, b) => (a.date < b.date ? 1 : -1)),
      loaded: !!stamps,
    };
  }, [stamps]);
}
