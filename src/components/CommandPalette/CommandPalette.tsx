import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './CommandPalette.css';

// ═══════════════════════════════════════════════════════════
// Command Types
// ═══════════════════════════════════════════════════════════

export interface Command {
  id: string;
  label: string;
  category?: 'File' | 'Edit' | 'View' | 'Search' | 'Schema' | 'Help';
  shortcut?: string;
  icon?: string;
  action: () => void;
  disabled?: boolean;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}

// ═══════════════════════════════════════════════════════════
// Fuzzy Search Utility
// ═══════════════════════════════════════════════════════════

function fuzzyMatch(query: string, text: string): { matches: boolean; score: number; indices: number[] } {
  if (!query) return { matches: true, score: 0, indices: [] };

  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  const indices: number[] = [];
  let queryIdx = 0;
  let score = 0;
  let lastMatchIdx = -1;

  for (let i = 0; i < textLower.length && queryIdx < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIdx]) {
      indices.push(i);
      // Bonus for consecutive matches
      if (lastMatchIdx === i - 1) {
        score += 2;
      }
      // Bonus for matching at word start
      if (i === 0 || text[i - 1] === ' ' || text[i - 1] === ':') {
        score += 3;
      }
      lastMatchIdx = i;
      queryIdx++;
      score += 1;
    }
  }

  return {
    matches: queryIdx === queryLower.length,
    score,
    indices,
  };
}

// ═══════════════════════════════════════════════════════════
// Highlight Component
// ═══════════════════════════════════════════════════════════

function HighlightedText({ text, indices }: { text: string; indices: number[] }) {
  if (indices.length === 0) return <>{text}</>;

  const parts: React.ReactNode[] = [];
  let lastIdx = 0;

  indices.forEach((idx, i) => {
    if (idx > lastIdx) {
      parts.push(<span key={`t-${i}`}>{text.slice(lastIdx, idx)}</span>);
    }
    parts.push(
      <mark key={`m-${i}`} className="command-match">
        {text[idx]}
      </mark>
    );
    lastIdx = idx + 1;
  });

  if (lastIdx < text.length) {
    parts.push(<span key="end">{text.slice(lastIdx)}</span>);
  }

  return <>{parts}</>;
}

// ═══════════════════════════════════════════════════════════
// Command Palette Component
// ═══════════════════════════════════════════════════════════

export function CommandPalette({ open, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter and sort commands
  const filteredCommands = useMemo(() => {
    return commands
      .map(cmd => {
        const labelMatch = fuzzyMatch(query, cmd.label);
        const categoryMatch = cmd.category ? fuzzyMatch(query, cmd.category) : { matches: false, score: 0, indices: [] };
        const shortcutMatch = cmd.shortcut ? fuzzyMatch(query, cmd.shortcut) : { matches: false, score: 0, indices: [] };

        const bestMatch = [labelMatch, categoryMatch, shortcutMatch]
          .filter(m => m.matches)
          .sort((a, b) => b.score - a.score)[0];

        return {
          command: cmd,
          matches: bestMatch?.matches ?? false,
          score: bestMatch?.score ?? 0,
          labelIndices: labelMatch.matches ? labelMatch.indices : [],
        };
      })
      .filter(item => item.matches && !item.command.disabled)
      .sort((a, b) => b.score - a.score);
  }, [commands, query]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selectedItem = listRef.current.querySelector('.command-item.selected');
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            filteredCommands[selectedIndex].command.action();
            onClose();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'Tab':
          e.preventDefault();
          if (e.shiftKey) {
            setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
          } else {
            setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
          }
          break;
      }
    },
    [filteredCommands, selectedIndex, onClose]
  );

  const handleItemClick = useCallback(
    (cmd: Command) => {
      cmd.action();
      onClose();
    },
    [onClose]
  );

  if (!open) return null;

  // Group commands by category for display
  const groupedCommands = new Map<string, typeof filteredCommands>();
  filteredCommands.forEach(item => {
    const category = item.command.category ?? 'Other';
    if (!groupedCommands.has(category)) {
      groupedCommands.set(category, []);
    }
    groupedCommands.get(category)!.push(item);
  });

  let globalIndex = -1;

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div className="command-palette" onClick={e => e.stopPropagation()}>
        <div className="command-input-wrapper">
          <span className="command-input-icon">⌘</span>
          <input
            ref={inputRef}
            type="text"
            className="command-input"
            placeholder="Type a command or search..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Command search"
            aria-autocomplete="list"
            aria-controls="command-list"
            aria-activedescendant={filteredCommands[selectedIndex]?.command.id}
          />
          <kbd className="command-hint">ESC</kbd>
        </div>

        <div
          ref={listRef}
          id="command-list"
          className="command-list"
          role="listbox"
          aria-label="Commands"
        >
          {filteredCommands.length === 0 ? (
            <div className="command-empty">No matching commands</div>
          ) : (
            Array.from(groupedCommands.entries()).map(([category, items]) => (
              <div key={category} className="command-group">
                <div className="command-category">{category}</div>
                {items.map(item => {
                  globalIndex++;
                  const isSelected = globalIndex === selectedIndex;
                  return (
                    <div
                      key={item.command.id}
                      id={item.command.id}
                      className={`command-item ${isSelected ? 'selected' : ''}`}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleItemClick(item.command)}
                      onMouseEnter={() => setSelectedIndex(globalIndex)}
                    >
                      {item.command.icon && (
                        <span className="command-icon">{item.command.icon}</span>
                      )}
                      <span className="command-label">
                        <HighlightedText text={item.command.label} indices={item.labelIndices} />
                      </span>
                      {item.command.shortcut && (
                        <kbd className="command-shortcut">{item.command.shortcut}</kbd>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="command-footer">
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span>esc Close</span>
        </div>
      </div>
    </div>
  );
}
