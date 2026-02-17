import { useState, useRef, useEffect, useCallback } from 'react';
import './MenuBar.css';

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

export interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  divider?: boolean;
}

export interface MenuDefinition {
  label: string;
  items: MenuItem[];
}

interface MenuBarProps {
  menus: MenuDefinition[];
}

// ═══════════════════════════════════════════════════════════
// MenuBar Component
// ═══════════════════════════════════════════════════════════

export function MenuBar({ menus }: MenuBarProps) {
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const [selectedItemIndex, setSelectedItemIndex] = useState(-1);
  const menuBarRef = useRef<HTMLDivElement>(null);
  const dropdownRefs = useRef<(HTMLDivElement | null)[]>([]);

  const isOpen = openMenuIndex !== null;

  // Close menu on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenuIndex(null);
        setSelectedItemIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpenMenuIndex(null);
        setSelectedItemIndex(-1);
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen]);

  // Get actionable items (non-divider, non-disabled) for keyboard nav
  const getActionableIndices = useCallback((menuIndex: number): number[] => {
    if (menuIndex < 0 || menuIndex >= menus.length) return [];
    return menus[menuIndex].items
      .map((item, i) => ({ item, i }))
      .filter(({ item }) => !item.divider && !item.disabled)
      .map(({ i }) => i);
  }, [menus]);

  // Keyboard navigation when menu is open
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const currentMenu = openMenuIndex!;
      const actionable = getActionableIndices(currentMenu);

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          e.stopPropagation();
          if (actionable.length === 0) return;
          const currentPos = actionable.indexOf(selectedItemIndex);
          const nextPos = currentPos < actionable.length - 1 ? currentPos + 1 : 0;
          setSelectedItemIndex(actionable[nextPos]);
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          e.stopPropagation();
          if (actionable.length === 0) return;
          const currentPos = actionable.indexOf(selectedItemIndex);
          const prevPos = currentPos > 0 ? currentPos - 1 : actionable.length - 1;
          setSelectedItemIndex(actionable[prevPos]);
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          e.stopPropagation();
          const nextMenu = (currentMenu + 1) % menus.length;
          setOpenMenuIndex(nextMenu);
          setSelectedItemIndex(-1);
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          e.stopPropagation();
          const prevMenu = (currentMenu - 1 + menus.length) % menus.length;
          setOpenMenuIndex(prevMenu);
          setSelectedItemIndex(-1);
          break;
        }
        case 'Enter': {
          e.preventDefault();
          e.stopPropagation();
          if (selectedItemIndex >= 0) {
            const item = menus[currentMenu].items[selectedItemIndex];
            if (item && !item.disabled && !item.divider && item.action) {
              item.action();
              setOpenMenuIndex(null);
              setSelectedItemIndex(-1);
            }
          }
          break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, openMenuIndex, selectedItemIndex, menus, getActionableIndices]);

  // Scroll selected item into view
  useEffect(() => {
    if (openMenuIndex === null || selectedItemIndex < 0) return;
    const dropdown = dropdownRefs.current[openMenuIndex];
    if (!dropdown) return;
    const items = dropdown.querySelectorAll('.menubar-dropdown-item, .menubar-dropdown-divider');
    const selectedEl = items[selectedItemIndex] as HTMLElement | undefined;
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }, [openMenuIndex, selectedItemIndex]);

  const handleMenuClick = useCallback((index: number) => {
    if (openMenuIndex === index) {
      setOpenMenuIndex(null);
      setSelectedItemIndex(-1);
    } else {
      setOpenMenuIndex(index);
      setSelectedItemIndex(-1);
    }
  }, [openMenuIndex]);

  const handleMenuHover = useCallback((index: number) => {
    if (isOpen && openMenuIndex !== index) {
      setOpenMenuIndex(index);
      setSelectedItemIndex(-1);
    }
  }, [isOpen, openMenuIndex]);

  const handleItemClick = useCallback((item: MenuItem) => {
    if (item.disabled || item.divider || !item.action) return;
    item.action();
    setOpenMenuIndex(null);
    setSelectedItemIndex(-1);
  }, []);

  // Format shortcut for display (Ctrl → Cmd on macOS)
  const formatShortcut = useCallback((shortcut: string): string => {
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    if (isMac) {
      return shortcut
        .replace('Ctrl+Shift+', '\u21E7\u2318')
        .replace('Ctrl+', '\u2318')
        .replace('Alt+', '\u2325');
    }
    return shortcut;
  }, []);

  return (
    <div className="menubar" ref={menuBarRef} role="menubar">
      {menus.map((menu, menuIndex) => (
        <div key={menu.label} className="menubar-menu">
          <button
            className={`menubar-trigger${openMenuIndex === menuIndex ? ' menubar-trigger-active' : ''}`}
            onClick={() => handleMenuClick(menuIndex)}
            onMouseEnter={() => handleMenuHover(menuIndex)}
            role="menuitem"
            aria-haspopup="true"
            aria-expanded={openMenuIndex === menuIndex}
          >
            {menu.label}
          </button>

          {openMenuIndex === menuIndex && (
            <div
              className="menubar-dropdown"
              ref={(el) => { dropdownRefs.current[menuIndex] = el; }}
              role="menu"
              aria-label={menu.label}
            >
              {menu.items.map((item, itemIndex) =>
                item.divider ? (
                  <div key={`div-${itemIndex}`} className="menubar-dropdown-divider" role="separator" />
                ) : (
                  <div
                    key={item.label}
                    className={`menubar-dropdown-item${selectedItemIndex === itemIndex ? ' selected' : ''}${item.disabled ? ' disabled' : ''}`}
                    role="menuitem"
                    aria-disabled={item.disabled}
                    onClick={() => handleItemClick(item)}
                    onMouseEnter={() => setSelectedItemIndex(itemIndex)}
                    onMouseLeave={() => setSelectedItemIndex(-1)}
                  >
                    <span className="menubar-dropdown-label">{item.label}</span>
                    {item.shortcut && (
                      <span className="menubar-dropdown-shortcut">{formatShortcut(item.shortcut)}</span>
                    )}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
