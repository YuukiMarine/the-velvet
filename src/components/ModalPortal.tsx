import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * 把浮层挂到 <body> 下渲染。
 *
 * 为什么非它不可（v2.7.0.4，用户上报「塔罗的回响最下方的按钮被底部栏挡住」）：
 * 页面全部渲染在 App.tsx 的 PageShell（`relative z-[1]`）里，那是一个 **stacking
 * context**——页内浮层无论标多大的 z（50 / 150 / 200 都一样）对外只等效 z=1，
 * 而 BottomNav 是同一层 `relative z-10` 下的 z-40 兄弟。结论：**底部导航永远压在
 * 页内弹窗之上**，与弹窗自己写的 z 值毫无关系。utils/zIndex.ts 的阶梯只在
 * body 级 portal 之间可比（见该文件头注释），这里就是把浮层送进那个可比空间。
 *
 * ⚠️ portal 必须包在 AnimatePresence **外侧**，否则 exit 动画从不播放
 *   （portal 一旦随条件卸载，AnimatePresence 也跟着没了；同 ConfirmDialog 口径）。
 *
 *   ✅ return <ModalPortal><AnimatePresence>{open && …}</AnimatePresence></ModalPortal>
 *   ❌ return <AnimatePresence>{open && <ModalPortal>…</ModalPortal>}</AnimatePresence>
 *
 * `className`：把原本挂在页面根上的**毯式换肤类**（.p5-reskin / .p4-reskin）带进
 * portal。那些规则写成 `:root[data-ui-channel="p5"] .p5-reskin <后代>`，靠的是
 * **祖先类**——浮层一旦搬到 body 就掉出作用域，红/黄主题下会变回一张原始白卡。
 * 传进来的类名套在 portal 根上（静态 div，不建 stacking context，fixed 子层照旧
 * 相对视口），换肤照常命中。
 */
export const ModalPortal = ({ children, className }: { children: ReactNode; className?: string }) =>
  createPortal(
    className?.trim() ? <div className={className}>{children}</div> : <>{children}</>,
    document.body,
  );
