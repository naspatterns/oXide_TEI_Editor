import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useSchema } from '../../store/useSchema';
import './QuickTagMenu.css';

interface Props {
  /** Screen coordinates where to show the menu */
  position: { x: number; y: number } | null;
  /** The selected text to wrap */
  selectedText: string;
  /** Called when a tag is selected */
  onSelectTag: (tagName: string) => void;
  /** Called when menu should close */
  onClose: () => void;
  /** Called when Escape is pressed - closes menu and deselects text */
  onEscape?: () => void;
}

// localStorage key for usage tracking
const USAGE_STORAGE_KEY = 'oxide-tag-usage';

// 메뉴 레이아웃 상수
const MENU_WIDTH = 280;   // 메뉴 너비 (px)
const MENU_HEIGHT = 350;  // 메뉴 높이 (px)
const MENU_PADDING = 8;   // 화면 경계로부터 여백 (px)
const MAX_VISIBLE_TAGS = 50;  // 한 번에 표시할 최대 태그 수

// Default weights for common inline tags (used as fallback)
const DEFAULT_INLINE_TAGS = new Set([
  'hi', 'emph', 'name', 'persName', 'placeName', 'orgName', 'date', 'title',
  'foreign', 'q', 'note', 'del', 'add', 'unclear', 'ref', 'rs', 'term', 'gloss',
  'mentioned', 'soCalled', 'supplied', 'gap', 'abbr', 'expan', 'choice',
]);

interface TagUsage {
  count: number;
  lastUsed: number;
}

type UsageData = Record<string, TagUsage>;

/**
 * Load tag usage data from localStorage
 */
function loadUsageData(): UsageData {
  try {
    const stored = localStorage.getItem(USAGE_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return {};
}

/**
 * Save tag usage data to localStorage
 */
function saveUsageData(data: UsageData): void {
  try {
    localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Record a tag usage
 */
function recordTagUsage(tagName: string): void {
  const data = loadUsageData();
  const existing = data[tagName] || { count: 0, lastUsed: 0 };
  data[tagName] = {
    count: existing.count + 1,
    lastUsed: Date.now(),
  };
  saveUsageData(data);
}

/**
 * Calculate sort score for a tag based on usage
 */
function getTagScore(tagName: string, usageData: UsageData): number {
  const usage = usageData[tagName];
  if (!usage) {
    // Give a small boost to common inline tags even if not used
    return DEFAULT_INLINE_TAGS.has(tagName) ? 0.1 : 0;
  }

  // Score = count + recency bonus (tags used in last hour get extra boost)
  const hourAgo = Date.now() - 3600000;
  const recencyBonus = usage.lastUsed > hourAgo ? 5 : 0;
  return usage.count + recencyBonus;
}

export function QuickTagMenu({ position, selectedText, onSelectTag, onClose, onEscape }: Props) {
  const { schema } = useSchema();
  const menuRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // 사용 빈도 데이터 로드 (메뉴 표시될 때마다 갱신)
  // position이 null → 값으로 변경될 때 최신 데이터 로드
  const isOpen = Boolean(position);
  const usageData = useMemo(
    () => (isOpen ? loadUsageData() : {}),
    [isOpen]
  );

  // Build tag list from schema, sorted by usage
  const allTags = useMemo(() => {
    if (!schema) return [];

    return schema.elements
      .map(element => {
        const requiredAttrs = element.attributes?.filter(a => a.required) ?? [];
        return {
          name: element.name,
          doc: element.documentation || '',
          requiredAttrs: requiredAttrs.map(a => a.name),
        };
      })
      .sort((a, b) => {
        const scoreA = getTagScore(a.name, usageData);
        const scoreB = getTagScore(b.name, usageData);
        // Sort by score descending, then alphabetically
        if (scoreB !== scoreA) return scoreB - scoreA;
        return a.name.localeCompare(b.name);
      });
  }, [schema, usageData]);

  // Filter tags based on user input
  const filteredTags = useMemo(() => {
    if (!filter) return allTags;

    const lowerFilter = filter.toLowerCase();
    return allTags.filter(tag =>
      tag.name.toLowerCase().includes(lowerFilter) ||
      tag.doc.toLowerCase().includes(lowerFilter)
    );
  }, [allTags, filter]);

  // Reset selected index when filter changes (render-time pattern)
  const [prevFilter, setPrevFilter] = useState(filter);
  if (prevFilter !== filter) {
    setPrevFilter(filter);
    setSelectedIndex(0);
  }

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const handleTagClick = useCallback((tagName: string) => {
    recordTagUsage(tagName);
    onSelectTag(tagName);
    onClose();
  }, [onSelectTag, onClose]);

  // Shared navigation logic for both the input's onKeyDown and the
  // document-level listener. Returns true when the key was handled.
  const handleNavigationKey = useCallback((key: string, shiftKey: boolean): boolean => {
    switch (key) {
      case 'ArrowDown':
        setSelectedIndex(prev => Math.min(prev + 1, filteredTags.length - 1));
        return true;
      case 'ArrowUp':
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        return true;
      case 'Enter':
        if (filteredTags.length > 0 && selectedIndex < filteredTags.length) {
          handleTagClick(filteredTags[selectedIndex].name);
        } else if (filter && filter.match(/^[a-zA-Z_][\w.:_-]*$/)) {
          // Valid XML tag name - use custom tag
          handleTagClick(filter);
        }
        return true;
      case 'Tab':
        // Tab cycles through options
        if (shiftKey) {
          setSelectedIndex(prev => (prev - 1 + filteredTags.length) % filteredTags.length);
        } else {
          setSelectedIndex(prev => (prev + 1) % filteredTags.length);
        }
        return true;
      default:
        return false;
    }
  }, [filter, filteredTags, selectedIndex, handleTagClick]);

  // Copy the editor's selected text to the clipboard. With the filter input
  // focused (see the focus effect below), a bare Ctrl/Cmd+C would copy the
  // input's content instead — so the menu owns the copy shortcut and copies
  // the wrap target explicitly.
  const copySelection = useCallback(() => {
    try {
      void navigator.clipboard?.writeText(selectedText);
    } catch {
      // Clipboard unavailable (permissions / older browser) — ignore.
    }
  }, [selectedText]);

  // Focus the filter input as soon as the menu opens. This is the linchpin
  // of the input-routing model: while the menu is open the EDITOR does not
  // hold focus, so no keystroke — regular OR IME composition (keyCode 229,
  // which document-level keydown interception cannot reliably catch) — can
  // reach the document and replace the selected text. Typing filters; the
  // editor selection is untouched and restored on close.
  useEffect(() => {
    if (position) inputRef.current?.focus();
  }, [position]);

  // Document-level handler for keys that must work regardless of which
  // element holds focus. It owns Escape exclusively (so it fires whether the
  // input, a tag button, or nothing is focused, and cannot double-fire with
  // the input's handler). Navigation/typing/copy are handled by the focused
  // input's onKeyDown and are deliberately NOT duplicated here: a selected
  // tag's wrap calls view.focus(), which moves focus to the editor mid-event
  // — so an activeElement guard here would race and process the same Enter a
  // second time (double-wrap).
  useEffect(() => {
    if (!position) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Leave IME composition alone (Escape cancels the candidate, etc.)
      if (e.isComposing || e.keyCode === 229) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        if (onEscape) {
          onEscape();
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [position, onClose, onEscape]);

  // Reset filter when menu closes (render-time pattern)
  const [prevPosition, setPrevPosition] = useState(position);
  if (prevPosition !== position) {
    setPrevPosition(position);
    if (!position) {
      setFilter('');
      setSelectedIndex(0);
    }
  }

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.querySelector('.quick-tag-item.selected');
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Never act on keystrokes that are part of an in-progress IME
    // composition — let the input compose normally. (Escape is owned by the
    // document-level handler so it fires regardless of which element has
    // focus, and without double-firing here.)
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;

    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      e.preventDefault();
      copySelection();
      return;
    }
    if (handleNavigationKey(e.key, e.shiftKey)) {
      e.preventDefault();
    }
  }, [handleNavigationKey, copySelection]);

  if (!position) return null;

  // 메뉴 위치 계산 (뷰포트 내에 유지)
  let left = position.x;
  let top = position.y + 5;

  if (left + MENU_WIDTH > window.innerWidth - MENU_PADDING) {
    left = window.innerWidth - MENU_WIDTH - MENU_PADDING;
  }

  if (top + MENU_HEIGHT > window.innerHeight - MENU_PADDING) {
    top = position.y - MENU_HEIGHT - 5;
  }

  // Truncate selected text for display
  const displayText = selectedText.length > 20
    ? selectedText.slice(0, 20) + '...'
    : selectedText;

  // Show count info
  const tagCountInfo = filter
    ? `${filteredTags.length} / ${allTags.length}`
    : `${allTags.length} tags`;

  return (
    <div
      ref={menuRef}
      className="quick-tag-menu"
      style={{ left, top }}
    >
      <div className="quick-tag-header">
        <span className="quick-tag-title">Wrap with tag</span>
        <span className="quick-tag-selection">"{displayText}"</span>
      </div>

      <div className="quick-tag-search">
        <input
          ref={inputRef}
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="Filter tags... (↑↓ to navigate)"
          className="quick-tag-input"
        />
        <span className="quick-tag-count">{tagCountInfo}</span>
      </div>

      <div className="quick-tag-list" ref={listRef}>
        {filteredTags.slice(0, MAX_VISIBLE_TAGS).map((tag, index) => {
          const usage = usageData[tag.name];
          const isSelected = index === selectedIndex;

          return (
            <button
              key={tag.name}
              className={`quick-tag-item ${isSelected ? 'selected' : ''}`}
              onClick={() => handleTagClick(tag.name)}
              onMouseEnter={() => setSelectedIndex(index)}
              title={tag.requiredAttrs.length > 0 ? `Required: @${tag.requiredAttrs.join(', @')}` : undefined}
            >
              <span className="quick-tag-name">&lt;{tag.name}&gt;</span>
              {tag.requiredAttrs.length > 0 && (
                <span className="quick-tag-required" title={`Required: @${tag.requiredAttrs.join(', @')}`}>
                  @{tag.requiredAttrs.length}
                </span>
              )}
              {tag.doc && (
                <span className="quick-tag-desc" title={tag.doc}>
                  {tag.doc.length > 25 ? tag.doc.slice(0, 25) + '...' : tag.doc}
                </span>
              )}
              {usage && usage.count > 0 && (
                <span className="quick-tag-usage">×{usage.count}</span>
              )}
            </button>
          );
        })}

        {filteredTags.length === 0 && filter && (
          <div className="quick-tag-custom">
            Press Enter to wrap with &lt;{filter}&gt;
          </div>
        )}

        {filteredTags.length > MAX_VISIBLE_TAGS && (
          <div className="quick-tag-more">
            +{filteredTags.length - MAX_VISIBLE_TAGS} more tags...
          </div>
        )}
      </div>
    </div>
  );
}
