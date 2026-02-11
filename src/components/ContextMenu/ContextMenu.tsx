import { useState, useEffect, useRef, useCallback } from 'react';
import './ContextMenu.css';

// ═══════════════════════════════════════════════════════════
// Context Menu Types
// ═══════════════════════════════════════════════════════════

export interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  action: () => void;
  disabled?: boolean;
  danger?: boolean;
}

export interface MenuDivider {
  type: 'divider';
}

export type MenuItemOrDivider = MenuItem | MenuDivider;

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItemOrDivider[];
  onClose: () => void;
}

// ═══════════════════════════════════════════════════════════
// Context Menu Component
// ═══════════════════════════════════════════════════════════

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Get only non-divider items for keyboard navigation
  const actionableItems = items.filter((item): item is MenuItem => !('type' in item));

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!menuRef.current) return;

    const rect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let newX = x;
    let newY = y;

    // Adjust horizontal position
    if (x + rect.width > viewportWidth - 10) {
      newX = viewportWidth - rect.width - 10;
    }

    // Adjust vertical position
    if (y + rect.height > viewportHeight - 10) {
      newY = viewportHeight - rect.height - 10;
    }

    // Ensure minimum position
    newX = Math.max(10, newX);
    newY = Math.max(10, newY);

    setPosition({ x: newX, y: newY });
  }, [x, y]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleScroll = () => onClose();

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => {
            const next = prev + 1;
            return next >= actionableItems.length ? 0 : next;
          });
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => {
            const next = prev - 1;
            return next < 0 ? actionableItems.length - 1 : next;
          });
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < actionableItems.length) {
            const item = actionableItems[selectedIndex];
            if (!item.disabled) {
              item.action();
              onClose();
            }
          }
          break;
      }
    },
    [actionableItems, selectedIndex, onClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Track which actionable item corresponds to each menu item
  let actionableIndex = -1;

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: position.x, top: position.y }}
      role="menu"
      aria-label="Context menu"
    >
      {items.map((item, index) => {
        if ('type' in item && item.type === 'divider') {
          return <div key={`divider-${index}`} className="context-menu-divider" role="separator" />;
        }

        actionableIndex++;
        const currentActionableIndex = actionableIndex;
        const menuItem = item as MenuItem;
        const isSelected = currentActionableIndex === selectedIndex;

        return (
          <div
            key={menuItem.id}
            className={`context-menu-item ${isSelected ? 'selected' : ''} ${menuItem.disabled ? 'disabled' : ''} ${menuItem.danger ? 'danger' : ''}`}
            role="menuitem"
            aria-disabled={menuItem.disabled}
            onClick={() => {
              if (!menuItem.disabled) {
                menuItem.action();
                onClose();
              }
            }}
            onMouseEnter={() => setSelectedIndex(currentActionableIndex)}
          >
            {menuItem.icon && <span className="context-menu-icon">{menuItem.icon}</span>}
            <span className="context-menu-label">{menuItem.label}</span>
            {menuItem.shortcut && <kbd className="context-menu-shortcut">{menuItem.shortcut}</kbd>}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Hook for managing context menu state
// ═══════════════════════════════════════════════════════════

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
}

export function useContextMenu() {
  const [state, setState] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
  });

  const open = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setState({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
    });
  }, []);

  const close = useCallback(() => {
    setState(prev => ({ ...prev, isOpen: false }));
  }, []);

  return {
    ...state,
    open,
    close,
  };
}
