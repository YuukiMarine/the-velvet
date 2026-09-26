/**
 * 局部错误边界：把一块可能因为「别人写来的数据」而抛错的界面圈起来，坏了只换成一行提示，
 * 不让整个 App 崩进 main.tsx 的根级错误页（那一页只剩「重新加载」，用户连删掉那条数据的机会都没有）。
 * resetKey 变了就重新尝试渲染。
 */
import React from 'react';

interface Props {
  fallback?: React.ReactNode;
  resetKey?: unknown;
  children: React.ReactNode;
}

interface State {
  failed: boolean;
}

export class LocalErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.warn('[LocalErrorBoundary] a block failed to render', error, info.componentStack);
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render(): React.ReactNode {
    if (this.state.failed) {
      return this.props.fallback ?? (
        <p className="px-3 py-2 text-[11px] text-gray-400 dark:text-gray-500">这一块的内容有问题，先跳过了。</p>
      );
    }
    return this.props.children;
  }
}
