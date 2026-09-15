/**
 * PocketBase filter 表达式的字符串转义 —— **全站唯一实现**。
 *
 * 顺序是关键：**反斜杠必须先替**，否则第二步补出来的 `\"` 里的反斜杠
 * 会被第一步的规则再转义一次，转义器自己把自己吃掉。
 */
export const escapePbString = (s: string): string =>
  s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/**
 * 把值安全地包成 filter 里的字符串字面量（含两侧引号）。
 *
 * 比裸用 escapePbString 更难写错：调用点写 `username = ${pbQuote(name)}`，
 * 引号由这里补，不会出现"记得转义了、却忘了自己加引号"或反过来的情况。
 */
export const pbQuote = (s: string): string => `"${escapePbString(s)}"`;
