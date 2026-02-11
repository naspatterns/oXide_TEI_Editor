import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useEditor } from '../../store/EditorContext';
import './XPathSearch.css';

// ═══════════════════════════════════════════════════════════
// XPath Search Types
// ═══════════════════════════════════════════════════════════

interface XPathMatch {
  nodeName: string;
  textContent: string;
  line: number;
}

// ═══════════════════════════════════════════════════════════
// XPath Evaluator Utility
// ═══════════════════════════════════════════════════════════

/**
 * Convert simple element names to local-name() based XPath
 * This handles the default namespace issue in TEI documents
 *
 * Examples:
 * - //p → //*[local-name()='p']
 * - //div[@type] → //*[local-name()='div'][@type]
 * - //tei:p → //tei:p (kept as-is for explicit namespace)
 */
function convertToLocalNameXPath(expression: string): string {
  // If user explicitly uses tei: prefix, don't convert
  if (expression.includes('tei:')) {
    return expression;
  }

  // Convert //tagname to //*[local-name()='tagname']
  // Also handle /tagname, //tagname[@attr], etc.
  return expression.replace(
    /\/\/([a-zA-Z_][\w-]*)([\[@]|$)/g,
    (_, tagName, suffix) => `//*[local-name()='${tagName}']${suffix || ''}`
  ).replace(
    /\/([a-zA-Z_][\w-]*)([\[@]|$)/g,
    (match, tagName, suffix) => {
      // Don't convert if it's already converted or part of a predicate
      if (match.includes('local-name')) return match;
      return `/*[local-name()='${tagName}']${suffix || ''}`;
    }
  );
}

function evaluateXPath(xmlContent: string, expression: string): { matches: XPathMatch[]; error: string | null } {
  if (!expression.trim()) {
    return { matches: [], error: null };
  }

  try {
    // Parse XML content
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlContent, 'application/xml');

    // Check for parse errors
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      return { matches: [], error: 'Invalid XML document' };
    }

    // Convert expression to handle namespaces
    const convertedExpression = convertToLocalNameXPath(expression);

    // Create namespace resolver for TEI documents
    const nsResolver = (prefix: string | null): string | null => {
      const namespaces: Record<string, string> = {
        tei: 'http://www.tei-c.org/ns/1.0',
        xml: 'http://www.w3.org/XML/1998/namespace',
      };
      return prefix ? namespaces[prefix] || null : null;
    };

    // Evaluate XPath expression
    const result = doc.evaluate(
      convertedExpression,
      doc,
      nsResolver,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null,
    );

    const matches: XPathMatch[] = [];
    const lines = xmlContent.split('\n');

    // Track found occurrences to handle duplicates
    const foundTags = new Map<string, number>();

    for (let i = 0; i < result.snapshotLength; i++) {
      const node = result.snapshotItem(i);
      if (!node) continue;

      let nodeName = '';
      let textContent = '';

      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        nodeName = element.localName || element.tagName;
        textContent = (element.textContent || '').slice(0, 60).trim().replace(/\s+/g, ' ');
      } else if (node.nodeType === Node.ATTRIBUTE_NODE) {
        nodeName = `@${(node as Attr).name}`;
        textContent = (node as Attr).value.slice(0, 60);
      } else if (node.nodeType === Node.TEXT_NODE) {
        nodeName = '#text';
        textContent = (node.textContent || '').slice(0, 60).trim();
      }

      // Find line number - search for the nth occurrence of this tag
      let line = 1;
      const occurrenceIndex = foundTags.get(nodeName) || 0;
      foundTags.set(nodeName, occurrenceIndex + 1);

      if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = (node as Element).localName || (node as Element).tagName;
        // Create pattern that matches the tag with or without namespace prefix
        const tagPattern = new RegExp(`<([a-zA-Z_][\\w-]*:)?${tagName}(\\s|>|/)`, 'g');
        let currentOccurrence = 0;

        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
          const lineContent = lines[lineIdx];
          tagPattern.lastIndex = 0;

          while (tagPattern.exec(lineContent) !== null) {
            if (currentOccurrence === occurrenceIndex) {
              line = lineIdx + 1;
              break;
            }
            currentOccurrence++;
          }
          if (currentOccurrence > occurrenceIndex) break;
        }
      }

      matches.push({
        nodeName,
        textContent,
        line,
      });
    }

    return { matches, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid XPath expression';
    // Make error messages more user-friendly
    if (message.includes('not a valid XPath')) {
      return { matches: [], error: 'Invalid XPath syntax' };
    }
    return { matches: [], error: message };
  }
}

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

  // Reset index when expression changes
  useEffect(() => {
    setCurrentIndex(0);
    if (expression.trim() && matches.length > 0) {
      setShowResults(true);
    }
  }, [expression, matches.length]);

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
