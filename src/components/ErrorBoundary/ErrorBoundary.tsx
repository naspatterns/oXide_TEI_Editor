import { Component, type ErrorInfo, type ReactNode } from 'react';
import './ErrorBoundary.css';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Human-readable name of the guarded region, shown in the fallback. */
  label?: string;
  /**
   * When any value in this array changes while an error is latched, the
   * boundary auto-recovers (clears the error). Pass e.g. the active document id
   * and view mode so switching document/panel re-renders the subtree cleanly.
   */
  resetKeys?: readonly unknown[];
  /** Optional callback fired when the boundary resets (manual retry or key change). */
  onReset?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

function keysChanged(a: readonly unknown[] = [], b: readonly unknown[] = []): boolean {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return true;
  }
  return false;
}

/**
 * Catches render-time exceptions in its subtree and shows a recoverable
 * fallback instead of letting the error propagate to the root — where, with no
 * boundary, React 18 unmounts the whole app and any unsaved editor work is lost.
 *
 * Error boundaries must be class components (getDerivedStateFromError /
 * componentDidCatch have no hook equivalent).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep a diagnostic trail; the fallback UI is intentionally terse.
    console.error(
      `[ErrorBoundary${this.props.label ? ` · ${this.props.label}` : ''}]`,
      error,
      info.componentStack,
    );
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.error && keysChanged(prevProps.resetKeys, this.props.resetKeys)) {
      this.reset();
    }
  }

  private reset(): void {
    this.props.onReset?.();
    this.setState({ error: null });
  }

  private handleRetry = (): void => {
    this.reset();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      const { label } = this.props;
      return (
        <div className="error-boundary" role="alert">
          <div className="error-boundary-icon" aria-hidden="true">⚠</div>
          <p className="error-boundary-title">
            {label ? `${label}을(를) 표시하는 중 문제가 발생했습니다` : '문제가 발생했습니다'}
          </p>
          <p className="error-boundary-detail">
            편집 내용은 그대로 있습니다. 다시 시도하거나 다른 탭으로 전환하세요.
          </p>
          {error.message && (
            <pre className="error-boundary-message">{error.message}</pre>
          )}
          <button type="button" className="error-boundary-retry" onClick={this.handleRetry}>
            다시 시도
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
