import { useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import './MainLayout.css';

interface MainLayoutProps {
  /** Left panel (File Explorer) */
  left: ReactNode;
  /** Center panel (Editor + Tabs) */
  center: ReactNode;
  /** Right panel (Outline/Preview) */
  right: ReactNode;
  /** Initial left panel width in pixels */
  initialLeftWidth?: number;
  /** Initial right panel width in pixels */
  initialRightWidth?: number;
  /** Minimum panel width */
  minPanelWidth?: number;
  /** Whether left panel is visible */
  showLeft?: boolean;
  /** Whether right panel is visible */
  showRight?: boolean;
}

export function MainLayout({
  left,
  center,
  right,
  initialLeftWidth = 220,
  initialRightWidth = 280,
  minPanelWidth = 150,
  showLeft = true,
  showRight = true,
}: MainLayoutProps) {
  const [leftWidth, setLeftWidth] = useState(initialLeftWidth);
  const [rightWidth, setRightWidth] = useState(initialRightWidth);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<'left' | 'right' | null>(null);

  const handleMouseDown = useCallback((side: 'left' | 'right') => (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = side;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const containerWidth = rect.width;

      if (dragging.current === 'left') {
        // Left resizer: measure from left edge
        const newLeftWidth = Math.max(minPanelWidth, Math.min(containerWidth * 0.4, e.clientX - rect.left));
        setLeftWidth(newLeftWidth);
      } else {
        // Right resizer: measure from right edge
        const newRightWidth = Math.max(minPanelWidth, Math.min(containerWidth * 0.4, rect.right - e.clientX));
        setRightWidth(newRightWidth);
      }
    };

    const handleMouseUp = () => {
      if (dragging.current) {
        dragging.current = null;
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
  }, [minPanelWidth]);

  return (
    <div className="main-layout" ref={containerRef}>
      {/* Left Panel (Explorer) */}
      {showLeft && (
        <>
          <div className="main-layout-panel main-layout-left" style={{ width: leftWidth }}>
            {left}
          </div>
          <div className="main-layout-resizer" onMouseDown={handleMouseDown('left')}>
            <div className="main-layout-resizer-handle" />
          </div>
        </>
      )}

      {/* Center Panel (Editor) */}
      <div className="main-layout-panel main-layout-center">
        {center}
      </div>

      {/* Right Panel (Outline) */}
      {showRight && (
        <>
          <div className="main-layout-resizer" onMouseDown={handleMouseDown('right')}>
            <div className="main-layout-resizer-handle" />
          </div>
          <div className="main-layout-panel main-layout-right" style={{ width: rightWidth }}>
            {right}
          </div>
        </>
      )}
    </div>
  );
}
