/**
 * 全站 z-index 阶梯（UI_AUDIT_V2.5.md §4.8）。
 *
 * 背景：审计 S1 —— 底部导航与全部标准弹窗同为 z-50，仅靠 DOM 顺序保证覆盖关系；
 * ImageCropDialog 的 z-[1000] 是体系外孤值；cooperation 域 150–220 的手工阶梯
 * 是全仓做得最好的部分，收编为 system 段。
 *
 * ⚠️ 可比性前提：本表数值**仅在 body 级 portal 之间可比**。App.tsx 的
 * `<div className="relative z-10">` 是 stacking context——仍渲染在树内的旧浮层
 * （PWAUpdateToast / CallingCardCutIn / LoginModal / battle 系 overlay 等）对外
 * 只等效 z=10，任何 portaled 新组件都会盖住它们，无论各自标的 z 值大小。
 * 迁移顺序必须自顶向下：先把上述顶层旧浮层 portal 到 body（最迟与首个
 * SheetModal/ConfirmDialog 消费者同 PR），再迁低层组件，否则会出现
 * 「确认弹窗盖住 cut-in / 抽屉盖住更新 Toast」的层级反转。
 *
 * 用法：
 *   - Tailwind：className={zClass.confirm} —— 字面量必须出现在本文件源码中，
 *     JIT 扫描器才会生成对应规则，所以 zClass 的值不要用模板字符串拼接。
 *   - inline style / Canvas 层：style={{ zIndex: Z.cutin }}
 *
 * 迁移期：旧组件逐页迁移时替换为本表；新组件一律从这里取值。
 */
export const Z = {
  /** 底部导航 / 侧边栏 */
  nav: 40,
  /** 标准弹窗、抽屉（SheetModal） */
  modal: 50,
  /** 确认层（可叠在 modal 之上） */
  confirm: 60,
  /** 庆祝弹窗（CelebrationCutIn） */
  celebration: 90,
  /** 全屏 cut-in 演出（CallingCardCutIn / 黑猫剪影过场） */
  cutin: 120,
  /** 系统级浮层段起点（auth / cooperation 既有 150–220 阶梯原样归此段，已 portaled） */
  system: 150,
  /**
   * Toast（PWAUpdateToast 等，永远最顶）。
   * 230 而非 200：coop 域现存 z-[201]~z-[220] 的 portaled 浮层
   * （CounselChat/AiMatch/AllOut/PrayerEffect），200 压不住「永远最顶」不成立。
   */
  toast: 230,
} as const;

export const zClass = {
  nav: 'z-40',
  modal: 'z-50',
  confirm: 'z-[60]',
  celebration: 'z-[90]',
  cutin: 'z-[120]',
  system: 'z-[150]',
  toast: 'z-[230]',
} as const;
