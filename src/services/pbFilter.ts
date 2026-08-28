/**
 * PocketBase filter 表达式的字符串转义 —— **全站唯一实现**。
 *
 * 原来 services/auth.ts 与 services/friends.ts 各写了一份一模一样的
 * `s.replace(/"/g, '\\"')`，两份都漏了同一件事：**没转义反斜杠**。
 *
 * 漏的后果：用户输入里以 `\` 结尾时，它会和转义器补上的那个 `\` 拼成 `\\`
 * ——在 PB 的表达式解析器眼里这是"一个转义后的反斜杠"，紧随其后的引号于是
 * **不再被转义**，字符串提前闭合，后面的内容落到表达式层被当语法解析。
 *
 *     输入:  x\" || username != "
 *     旧版:  username = "x\\" || username != \""
 *                        └─ 字符串在这里就闭合了
 *
 * 实际要把它拼成一条**语法合法**的 filter 并不容易（多数尝试会被解析器打回 400），
 * 所以这不是一个能直接拿去拖库的洞。但 searchUserByUserId 之所以刻意做成
 * 精确匹配、不给模糊搜索，图的就是"别人没法枚举用户"——而这正是被绕开的那一层。
 * 一行的事，没有理由留着。
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
