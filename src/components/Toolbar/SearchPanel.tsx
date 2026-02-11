import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useEditor } from '../../store/EditorContext';
import './SearchPanel.css';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface SearchResult {
  line: number;
  tagName: string;
  preview: string;
  matchStart: number;
  matchEnd: number;
}

/**
 * Search panel for finding XML tags in the document
 */
export function SearchPanel({ open, onClose }: Props) {
  const { state, scrollToLine } = useEditor();
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'tag' | 'attr' | 'text'>('tag');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when panel opens
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // Search for matches in the content
  const results = useMemo(() => {
    if (!query.trim()) return [];

    const lines = state.content.split('\n');
    const matches: SearchResult[] = [];

    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      let pattern: RegExp;

      try {
        switch (searchMode) {
          case 'tag':
            // Search for tag names: <tagName or </tagName
            pattern = new RegExp(`</?${query}[\\s>/]`, 'gi');
            break;
          case 'attr':
            // Search for attribute values
            pattern = new RegExp(`${query}\\s*=\\s*["'][^"']*["']`, 'gi');
            break;
          case 'text':
            // Search in text content (simple substring)
            pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            break;
        }
      } catch {
        // Invalid regex - fall back to substring
        pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      }

      let match;
      while ((match = pattern.exec(line)) !== null) {
        // Extract tag name from the match
        let tagName = query;
        if (searchMode === 'tag') {
          const tagMatch = line.slice(match.index).match(/<\/?([a-zA-Z_][\w.:_-]*)/);
          if (tagMatch) tagName = tagMatch[1];
        }

        // Create a preview with context
        const start = Math.max(0, match.index - 20);
        const end = Math.min(line.length, match.index + match[0].length + 30);
        let preview = line.slice(start, end).trim();
        if (start > 0) preview = '...' + preview;
        if (end < line.length) preview = preview + '...';

        matches.push({
          line: lineNum,
          tagName,
          preview,
          matchStart: match.index,
          matchEnd: match.index + match[0].length,
        });

        // Limit to prevent performance issues
        if (matches.length >= 100) break;
      }

      if (matches.length >= 100) return;
    });

    return matches;
  }, [state.content, query, searchMode]);

  const handleResultClick = useCallback((result: SearchResult) => {
    scrollToLine(result.line);
  }, [scrollToLine]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  if (!open) return null;

  return (
    <div className="search-panel" onKeyDown={handleKeyDown}>
      <div className="search-panel-header">
        <h3>Search</h3>
        <button className="search-panel-close" onClick={onClose}>×</button>
      </div>

      <div className="search-panel-controls">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search..."
          className="search-input"
        />
        <div className="search-mode-group">
          <button
            className={`search-mode-btn ${searchMode === 'tag' ? 'search-mode-active' : ''}`}
            onClick={() => setSearchMode('tag')}
            title="Search by tag name"
          >
            Tag
          </button>
          <button
            className={`search-mode-btn ${searchMode === 'attr' ? 'search-mode-active' : ''}`}
            onClick={() => setSearchMode('attr')}
            title="Search by attribute"
          >
            Attr
          </button>
          <button
            className={`search-mode-btn ${searchMode === 'text' ? 'search-mode-active' : ''}`}
            onClick={() => setSearchMode('text')}
            title="Search text content"
          >
            Text
          </button>
        </div>
      </div>

      <div className="search-panel-results">
        {query && results.length === 0 ? (
          <div className="search-no-results">No matches found</div>
        ) : (
          results.map((result, idx) => (
            <div
              key={`${result.line}-${result.matchStart}-${idx}`}
              className="search-result-item"
              onClick={() => handleResultClick(result)}
            >
              <span className="search-result-line">Ln {result.line}</span>
              <span className="search-result-tag">&lt;{result.tagName}&gt;</span>
              <span className="search-result-preview">{result.preview}</span>
            </div>
          ))
        )}
        {results.length >= 100 && (
          <div className="search-truncated">
            Results limited to 100 matches
          </div>
        )}
      </div>

      <div className="search-panel-footer">
        <span className="search-count">
          {results.length} match{results.length !== 1 ? 'es' : ''}
        </span>
      </div>
    </div>
  );
}
