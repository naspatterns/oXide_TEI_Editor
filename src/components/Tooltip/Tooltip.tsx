import { useState, useRef, useEffect, useCallback, ReactNode, cloneElement, isValidElement, ReactElement } from 'react';
import { createPortal } from 'react-dom';
import './Tooltip.css';

// ═══════════════════════════════════════════════════════════
// Tooltip Types
// ═══════════════════════════════════════════════════════════

type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  content: ReactNode;
  shortcut?: string;
  position?: TooltipPosition;
  delay?: number;
  children: ReactElement;
  disabled?: boolean;
}

// ═══════════════════════════════════════════════════════════
// Tooltip Component
// ═══════════════════════════════════════════════════════════

export function Tooltip({
  content,
  shortcut,
  position = 'bottom',
  delay = 500,
  children,
  disabled = false,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [actualPosition, setActualPosition] = useState(position);
  const triggerRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | null>(null);

  const showTooltip = useCallback(() => {
    if (disabled) return;

    timeoutRef.current = window.setTimeout(() => {
      if (!triggerRef.current) return;

      const rect = triggerRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Calculate initial position based on desired position
      let x = rect.left + rect.width / 2;
      let y = position === 'top' ? rect.top : rect.bottom;
      let finalPosition = position;

      // Adjust if tooltip would go off screen (we'll refine after measuring)
      if (position === 'top' && rect.top < 60) {
        finalPosition = 'bottom';
        y = rect.bottom;
      } else if (position === 'bottom' && rect.bottom > viewportHeight - 60) {
        finalPosition = 'top';
        y = rect.top;
      } else if (position === 'left' && rect.left < 120) {
        finalPosition = 'right';
        x = rect.right;
        y = rect.top + rect.height / 2;
      } else if (position === 'right' && rect.right > viewportWidth - 120) {
        finalPosition = 'left';
        x = rect.left;
        y = rect.top + rect.height / 2;
      }

      // For left/right positions, adjust y
      if (finalPosition === 'left' || finalPosition === 'right') {
        y = rect.top + rect.height / 2;
        x = finalPosition === 'left' ? rect.left : rect.right;
      }

      setCoords({ x, y });
      setActualPosition(finalPosition);
      setIsVisible(true);
    }, delay);
  }, [position, delay, disabled]);

  const hideTooltip = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Clone the child and attach event handlers and ref
  if (!isValidElement(children)) {
    return children;
  }

  // Get existing event handlers from children
  const existingProps = children.props as {
    onMouseEnter?: (e: React.MouseEvent) => void;
    onMouseLeave?: (e: React.MouseEvent) => void;
    onFocus?: (e: React.FocusEvent) => void;
    onBlur?: (e: React.FocusEvent) => void;
  };

  const childProps = {
    onMouseEnter: (e: React.MouseEvent) => {
      showTooltip();
      existingProps.onMouseEnter?.(e);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      hideTooltip();
      existingProps.onMouseLeave?.(e);
    },
    onFocus: (e: React.FocusEvent) => {
      showTooltip();
      existingProps.onFocus?.(e);
    },
    onBlur: (e: React.FocusEvent) => {
      hideTooltip();
      existingProps.onBlur?.(e);
    },
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      // Handle existing ref on child
      const { ref } = children as { ref?: React.Ref<HTMLElement> };
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref && typeof ref === 'object') {
        (ref as React.MutableRefObject<HTMLElement | null>).current = node;
      }
    },
  };

  const clonedChild = cloneElement(children, childProps);

  return (
    <>
      {clonedChild}
      {isVisible &&
        createPortal(
          <div
            ref={tooltipRef}
            className={`tooltip tooltip-${actualPosition}`}
            style={{
              left: coords.x,
              top: coords.y,
            }}
            role="tooltip"
          >
            <span className="tooltip-content">{content}</span>
            {shortcut && <kbd className="tooltip-shortcut">{shortcut}</kbd>}
          </div>,
          document.body,
        )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// Simple Tooltip (no children wrapper needed, just positioning)
// Use for programmatic tooltip positioning
// ═══════════════════════════════════════════════════════════

interface TooltipPortalProps {
  content: ReactNode;
  shortcut?: string;
  x: number;
  y: number;
  position?: TooltipPosition;
  visible: boolean;
}

export function TooltipPortal({
  content,
  shortcut,
  x,
  y,
  position = 'bottom',
  visible,
}: TooltipPortalProps) {
  if (!visible) return null;

  return createPortal(
    <div
      className={`tooltip tooltip-${position}`}
      style={{ left: x, top: y }}
      role="tooltip"
    >
      <span className="tooltip-content">{content}</span>
      {shortcut && <kbd className="tooltip-shortcut">{shortcut}</kbd>}
    </div>,
    document.body,
  );
}
