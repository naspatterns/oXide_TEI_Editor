import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useEditor } from '../../store/useEditor';
import { evaluateXPath } from './xpathEvaluator';
import './XPathSearch.css';

// ═══════════════════════════════════════════════════════════
// XPath Search Component - Inline Toolbar Style
// ═══════════════════════════════════════════════════════════

export function XPathSearch() {
  const { state, goToLine } = useEditor();
  const [expression, setExpression] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Evaluate XPath expression
  const { matches, error } = useMemo(() => {
    return evaluateXPath(state.content, expression);
  }, [state.content, expression]);

  // Navigate to match
  const navigateToMatch = useCallback(
    (index: number) => {
      if (matches.length === 0) return;
      const validIndex = ((index % matches.length) + matches.length) % matches.length;
      setCurrentIndex(validIndex);
      const match = matches[validIndex];
      if (match) {
        goToLine(match.line);
      }
    },
    [matches, goToLine],
  );

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (matches.length > 0) {
          // First Enter navigates to first match, subsequent Enters go to next
          if (currentIndex === 0 && !showResults) {
            navigateToMatch(0);
            setShowResults(true);
          } else {
            navigateToMatch(e.shiftKey ? currentIndex - 1 : currentIndex + 1);
          }
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowResults(false);
        inputRef.current?.blur();
      } else if (e.key === 'ArrowDown' && matches.length > 0) {
        e.preventDefault();
        navigateToMatch(currentIndex + 1);
      } else if (e.key === 'ArrowUp' && matches.length > 0) {
        e.preventDefault();
        navigateToMatch(currentIndex - 1);
      }
    },
    [matches, currentIndex, showResults, navigateToMatch],
  );

  // Reset index and reveal results panel when expression or match count
  // changes (render-time pattern, see React docs: "Adjusting state when a
  // prop changes")
  const [prevDeps, setPrevDeps] = useState({ expression, matchesLen: matches.length });
  if (prevDeps.expression !== expression || prevDeps.matchesLen !== matches.length) {
    setPrevDeps({ expression, matchesLen: matches.length });
    setCurrentIndex(0);
    if (expression.trim() && matches.length > 0) {
      setShowResults(true);
    }
  }

  // Close results when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="xpath-search-inline" ref={containerRef}>
      <span className="xpath-label">XPath</span>
      <div className="xpath-input-container">
        <input
          ref={inputRef}
          type="text"
          className={`xpath-input ${error ? 'error' : ''} ${matches.length > 0 ? 'has-matches' : ''}`}
          placeholder="//p, //div[@type], ..."
          value={expression}
          onChange={e => setExpression(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => expression.trim() && setShowResults(true)}
          spellCheck={false}
        />

        {/* Status indicator */}
        {expression.trim() && (
          <span className={`xpath-status ${error ? 'error' : matches.length > 0 ? 'success' : 'empty'}`}>
            {error ? '!' : matches.length > 0 ? `${currentIndex + 1}/${matches.length}` : '0'}
          </span>
        )}

        {/* Navigation buttons */}
        {matches.length > 0 && (
          <div className="xpath-nav-buttons">
            <button
              className="xpath-nav-btn"
              onClick={() => navigateToMatch(currentIndex - 1)}
              title="Previous (Shift+Enter)"
            >
              ▲
            </button>
            <button
              className="xpath-nav-btn"
              onClick={() => navigateToMatch(currentIndex + 1)}
              title="Next (Enter)"
            >
              ▼
            </button>
          </div>
        )}

        {/* Clear button */}
        {expression && (
          <button
            className="xpath-clear-btn"
            onClick={() => {
              setExpression('');
              setShowResults(false);
              inputRef.current?.focus();
            }}
            title="Clear"
          >
            ×
          </button>
        )}
      </div>

      {/* Results dropdown */}
      {showResults && expression.trim() && (
        <div className="xpath-results-dropdown">
          {error ? (
            <div className="xpath-error-msg">{error}</div>
          ) : matches.length === 0 ? (
            <div className="xpath-no-results">No matches found</div>
          ) : (
            <>
              <div className="xpath-results-header">
                {matches.length} match{matches.length !== 1 ? 'es' : ''}
              </div>
              <div className="xpath-results-list">
                {matches.slice(0, 50).map((match, idx) => (
                  <button
                    key={`${match.line}-${idx}`}
                    className={`xpath-result-item ${idx === currentIndex ? 'active' : ''}`}
                    onClick={() => {
                      setCurrentIndex(idx);
                      goToLine(match.line);
                    }}
                  >
                    <span className="xpath-result-line">Ln {match.line}</span>
                    <span className="xpath-result-tag">&lt;{match.nodeName}&gt;</span>
                    {match.textContent && (
                      <span className="xpath-result-preview">{match.textContent}</span>
                    )}
                  </button>
                ))}
                {matches.length > 50 && (
                  <div className="xpath-results-more">
                    +{matches.length - 50} more results
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
