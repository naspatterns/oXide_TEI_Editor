/**
 * ErrorBoundary tests (roadmap #1, 2026-07).
 *
 * The boundary exists so a render-time exception in one panel cannot propagate
 * to the root and unmount the editor holding unsaved work. It must: show a
 * recoverable fallback instead of the child, recover on manual retry, and
 * auto-recover when its resetKeys change (e.g. the user switches document/panel).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { ErrorBoundary } from '../src/components/ErrorBoundary/ErrorBoundary';

let shouldThrow = true;
function Bomb() {
  if (shouldThrow) throw new Error('boom in panel');
  return <div data-testid="child">safe child</div>;
}

beforeEach(() => {
  shouldThrow = true;
  // React logs caught render errors to console.error; keep test output clean.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('renders children normally when nothing throws', () => {
    shouldThrow = false;
    render(
      <ErrorBoundary label="패널">
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a recoverable fallback (with the label and message) when a child throws', () => {
    render(
      <ErrorBoundary label="패널">
        <Bomb />
      </ErrorBoundary>,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent('패널');
    expect(alert).toHaveTextContent('boom in panel');
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
    // The child is NOT mounted.
    expect(screen.queryByTestId('child')).toBeNull();
  });

  it('recovers when the retry button is clicked and the child no longer throws', () => {
    render(
      <ErrorBoundary label="패널">
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('auto-recovers when resetKeys change', () => {
    const { rerender } = render(
      <ErrorBoundary label="패널" resetKeys={['docA']}>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Simulate switching to another document (and its content no longer throws).
    shouldThrow = false;
    rerender(
      <ErrorBoundary label="패널" resetKeys={['docB']}>
        <Bomb />
      </ErrorBoundary>,
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('stays in the fallback while resetKeys are unchanged', () => {
    const { rerender } = render(
      <ErrorBoundary label="패널" resetKeys={['docA']}>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // A re-render with the SAME keys must not clear a latched error.
    shouldThrow = false;
    rerender(
      <ErrorBoundary label="패널" resetKeys={['docA']}>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByTestId('child')).toBeNull();
  });
});
