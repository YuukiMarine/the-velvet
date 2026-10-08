/**
 * 导入备份时的 AI 密钥口径（第 13 轮）：备份带 Key，导入时**备份里的优先**；备份里缺的才用本机的补上。
 * 单独一个模块、不 import store（store 的导入流程要用它，backup.ts 又 import store，放那边会成环）。
 */

/**
 * 补 Key 的规则：
 *   - 各家档案（aiProfiles[pv].key）：备份里那家有 Key 就用备份的；没有、而本机有，就用本机的；
 *   - 当前生效那家（summaryApiKey）：备份里有就用；老版本导出的备份不带 summaryApiKey（以前导出时剥掉了），
 *     就取备份里同一家档案的 Key，再没有才用本机的——以前恢复完当前那家要重填一遍。
 */
export function keepLocalAISecrets<T extends {
  summaryApiProvider?: string; summaryApiKey?: string;
  aiProfiles?: Partial<Record<string, { key?: string } & Record<string, unknown>>>;
}>(imported: T, local: T | undefined): T {
  const profiles: Record<string, ({ key?: string } & Record<string, unknown>) | undefined> = { ...(imported.aiProfiles ?? {}) };
  if (local) {
    const localActive = local.summaryApiProvider ?? 'deepseek';
    const localKeyOf = (pv: string): string =>
      local.aiProfiles?.[pv]?.key?.trim() || (pv === localActive ? local.summaryApiKey?.trim() ?? '' : '');
    for (const pv of new Set([...Object.keys(local.aiProfiles ?? {}), localActive])) {
      const k = localKeyOf(pv);
      if (k && !profiles[pv]?.key?.trim()) profiles[pv] = { ...(profiles[pv] ?? {}), key: k };
    }
  }
  const activePv = imported.summaryApiProvider ?? 'deepseek';
  const activeKey = imported.summaryApiKey?.trim() || profiles[activePv]?.key?.trim() || undefined;
  return {
    ...imported,
    ...(Object.keys(profiles).length ? { aiProfiles: profiles as T['aiProfiles'] } : {}),
    summaryApiKey: activeKey,
  };
}
