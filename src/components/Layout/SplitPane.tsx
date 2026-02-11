import { useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import './SplitPane.css';

interface SplitPaneProps {
  left: ReactNode;
  right: ReactNode;
  /** 'split' | 'editor' | 'preview' */
  mode: 'split' | 'editor' | 'preview';
  /** Initial split position as fraction (0-1), default 0.75 (3:1 ratio) */
  initialSplit?: number;
}

export function SplitPane({ left, right, mode, initialSplit = 0.75 }: SplitPaneProps) {
  const [splitFraction, setSplitFraction] = useState(initialSplit);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const fraction = Math.max(0.2, Math.min(0.8, (e.clientX - rect.left) / rect.width));
      setSplitFraction(fraction);
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  if (mode === 'editor') {
    return <div className="split-pane" ref={containerRef}><div className="split-panel" style={{ width: '100%' }}>{left}</div></div>;
  }
  if (mode === 'preview') {
    return <div className="split-pane" ref={containerRef}><div className="split-panel" style={{ width: '100%' }}>{right}</div></div>;
  }

  return (
    <div className="split-pane" ref={containerRef}>
      <div className="split-panel" style={{ width: `${splitFraction * 100}%` }}>
        {left}
      </div>
      <div className="split-divider" onMouseDown={handleMouseDown}>
        <div className="split-handle" />
      </div>
      <div className="split-panel" style={{ width: `${(1 - splitFraction) * 100}%` }}>
        {right}
      </div>
    </div>
  );
}
