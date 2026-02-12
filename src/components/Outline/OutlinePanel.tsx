import { memo, useMemo, useState, useCallback, useDeferredValue } from 'react';
import { useEditor } from '../../store/EditorContext';
import type { ValidationError } from '../../types/schema';
import './OutlinePanel.css';

const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 24;
const FONT_STEP = 2;

/** Represents a node in the XML tree structure */
interface XmlNode {
  name: string;
  attributes: Record<string, string>;
  children: XmlNode[];
  line: number;  // Line number in source for navigation
  textContent?: string;  // Brief text preview
  // Error display fields
  hasError?: boolean;
  hasWarning?: boolean;
  errorMessages?: string[];
}

/** Parsing result interface */
interface ParseResult {
  root: XmlNode | null;
  parseErrors: Array<{ line: number; message: string }>;
}

/** Parse attributes from a tag string */
function parseAttributes(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([a-zA-Z_][\w.:_-]*)\s*=\s*["']([^"']*)["']/g;
  let match;
  while ((match = attrRegex.exec(attrStr)) !== null) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

/** Regex-based XML parsing (works even with malformed XML) */
function parseXmlWithRegex(xmlStr: string): ParseResult {
  const lines = xmlStr.split('\n');
  const parseErrors: Array<{ line: number; message: string }> = [];

  // Stack-based parsing
  const stack: Array<{ node: XmlNode; expectedClosing: string }> = [];
  const root: XmlNode = { name: '#root', attributes: {}, children: [], line: 0 };
  let current = root;

  // Tag matching regex
  const tagRegex = /<\/?([a-zA-Z_][\w.:_-]*)(\s[^>]*)?\s*\/?>/g;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const lineText = lines[lineIdx];
    const lineNum = lineIdx + 1;

    // Skip XML declaration, comments, CDATA
    if (lineText.includes('<?') || lineText.includes('<!--') || lineText.includes('<![CDATA[')) continue;

    tagRegex.lastIndex = 0; // Reset for each line
    let match;

    while ((match = tagRegex.exec(lineText)) !== null) {
      const fullTag = match[0];
      const tagName = match[1];
      const attrStr = match[2] ?? '';

      if (fullTag.startsWith('</')) {
        // Closing tag
        if (stack.length > 0) {
          const expected = stack[stack.length - 1];
          if (expected.expectedClosing !== tagName) {
            parseErrors.push({
              line: lineNum,
              message: `Expected </${expected.expectedClosing}>, found </${tagName}>`
            });
            // Recovery: find matching tag and clean up stack
            let found = false;
            for (let i = stack.length - 1; i >= 0; i--) {
              if (stack[i].expectedClosing === tagName) {
                stack.splice(i);
                current = stack.length > 0 ? stack[stack.length - 1].node : root;
                found = true;
                break;
              }
            }
            if (!found) continue; // No match, ignore
          } else {
            stack.pop();
            current = stack.length > 0 ? stack[stack.length - 1].node : root;
          }
        }
      } else if (fullTag.endsWith('/>')) {
        // Self-closing tag
        const node: XmlNode = {
          name: tagName,
          attributes: parseAttributes(attrStr),
          children: [],
          line: lineNum,
        };
        current.children.push(node);
      } else {
        // Opening tag
        const node: XmlNode = {
          name: tagName,
          attributes: parseAttributes(attrStr),
          children: [],
          line: lineNum,
        };
        current.children.push(node);
        stack.push({ node, expectedClosing: tagName });
        current = node;
      }
    }
  }

  // Report unclosed tags
  for (const item of stack) {
    parseErrors.push({
      line: item.node.line,
      message: `Unclosed tag <${item.expectedClosing}>`
    });
  }

  return {
    root: root.children[0] ?? null,
    parseErrors,
  };
}

/** Error-tolerant XML parsing: DOMParser first, regex fallback on failure */
function parseXmlToTreeTolerant(xmlStr: string): ParseResult {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlStr, 'application/xml');
    const errorNode = doc.querySelector('parsererror');

    if (!errorNode) {
      // Parse succeeded - use DOM-based conversion
      const lines = xmlStr.split('\n');

      function domToNode(element: Element, lineHint: number): XmlNode {
        // Try to find actual line number
        let line = lineHint;
        for (let i = lineHint - 1; i < lines.length; i++) {
          if (lines[i]?.includes(`<${element.tagName}`)) {
            line = i + 1;
            break;
          }
        }

        // Get attributes
        const attributes: Record<string, string> = {};
        for (const attr of element.attributes) {
          attributes[attr.name] = attr.value;
        }

        // Get direct text content (not from children)
        let textContent = '';
        for (const child of element.childNodes) {
          if (child.nodeType === Node.TEXT_NODE) {
            const text = child.textContent?.trim();
            if (text) {
              textContent = text.length > 30 ? text.slice(0, 30) + '...' : text;
              break;
            }
          }
        }

        // Process child elements
        const children: XmlNode[] = [];
        let childLineHint = line;
        for (const child of element.children) {
          const childNode = domToNode(child, childLineHint);
          children.push(childNode);
          childLineHint = childNode.line + 1;
        }

        return {
          name: element.tagName,
          attributes,
          children,
          line,
          textContent: textContent || undefined,
        };
      }

      const root = doc.documentElement
        ? domToNode(doc.documentElement, 1)
        : null;

      return { root, parseErrors: [] };
    }

    // DOMParser error - use regex fallback
    return parseXmlWithRegex(xmlStr);

  } catch {
    // Exception - try regex fallback
    return parseXmlWithRegex(xmlStr);
  }
}

/** Annotate tree nodes with ValidationError information */
function annotateTreeWithErrors(
  node: XmlNode,
  errors: ValidationError[]
): XmlNode {
  // Build line -> errors map
  const errorMap = new Map<number, ValidationError[]>();
  for (const err of errors) {
    if (!errorMap.has(err.line)) {
      errorMap.set(err.line, []);
    }
    errorMap.get(err.line)!.push(err);
  }

  // Recursively annotate nodes
  function annotate(n: XmlNode): XmlNode {
    const lineErrors = errorMap.get(n.line) ?? [];
    const hasError = lineErrors.some(e => e.severity === 'error');
    const hasWarning = lineErrors.some(e => e.severity === 'warning');

    return {
      ...n,
      hasError: hasError || undefined,
      hasWarning: (!hasError && hasWarning) || undefined,
      errorMessages: lineErrors.length > 0
        ? lineErrors.map(e => e.message)
        : undefined,
      children: n.children.map(annotate),
    };
  }

  return annotate(node);
}

/** Tree node component with expand/collapse functionality */
const TreeNode = memo(function TreeNode({
  node,
  depth = 0,
  defaultExpanded = true,
  onNodeClick,
}: {
  node: XmlNode;
  depth?: number;
  defaultExpanded?: boolean;
  onNodeClick?: (line: number) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded && depth < 3);
  const hasChildren = node.children.length > 0;

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(prev => !prev);
  }, []);

  const handleClick = useCallback(() => {
    onNodeClick?.(node.line);
  }, [node.line, onNodeClick]);

  // Get display info
  const attrPreview = node.attributes['xml:id']
    || node.attributes['n']
    || node.attributes['type']
    || '';

  // Compute node class based on error/warning state
  const nodeClass = [
    'tree-node-header',
    node.hasError ? 'tree-node-error' : '',
    node.hasWarning ? 'tree-node-warning' : '',
  ].filter(Boolean).join(' ');

  // Tooltip text (include error messages if present)
  const tooltipText = node.errorMessages?.length
    ? `Line ${node.line}: ${node.errorMessages.join(', ')}`
    : `Line ${node.line}`;

  return (
    <div className="tree-node">
      <div
        className={nodeClass}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onClick={handleClick}
        title={tooltipText}
      >
        {/* Error/warning icon */}
        {(node.hasError || node.hasWarning) && (
          <span className={`tree-node-status-icon ${node.hasError ? 'error' : 'warning'}`}>
            {node.hasError ? '⚠' : '⚡'}
          </span>
        )}
        {hasChildren ? (
          <span
            className={`tree-toggle ${expanded ? 'expanded' : ''}`}
            onClick={handleToggle}
          >
            ▶
          </span>
        ) : (
          <span className="tree-toggle-placeholder" />
        )}
        <span className="tree-node-name">&lt;{node.name}&gt;</span>
        {attrPreview && (
          <span className="tree-node-attr">{attrPreview}</span>
        )}
        {node.textContent && (
          <span className="tree-node-text">{node.textContent}</span>
        )}
      </div>
      {hasChildren && expanded && (
        <div className="tree-node-children">
          {node.children.map((child) => (
            <TreeNode
              key={`${child.line}_${child.name}`}
              node={child}
              depth={depth + 1}
              defaultExpanded={depth < 2}
              onNodeClick={onNodeClick}
            />
          ))}
        </div>
      )}
    </div>
  );
});

export function OutlinePanel() {
  const { state, scrollToLine, setOutlineFontSize } = useEditor();

  // ═══════════════════════════════════════════════════════════════════════════
  // useDeferredValue: 성능 최적화 핵심
  // ═══════════════════════════════════════════════════════════════════════════
  // React 18의 concurrent rendering 기능을 활용하여:
  // - 타이핑 입력은 높은 우선순위 (즉시 반영)
  // - XML 파싱은 낮은 우선순위 (여유 시간에 실행)
  //
  // Before: 매 keystroke마다 XML 파싱 (30-100ms 블로킹)
  // After:  타이핑은 즉시 반영, Outline은 지연 업데이트 (블로킹 없음)
  //
  // 결과: 대용량 문서(2000줄+)에서도 부드러운 타이핑 경험 제공
  // ═══════════════════════════════════════════════════════════════════════════
  const deferredContent = useDeferredValue(state.content);
  const deferredErrors = useDeferredValue(state.errors);

  // Parse XML and annotate with errors
  const { tree, parseIssues } = useMemo(() => {
    const result = parseXmlToTreeTolerant(deferredContent);

    // Annotate tree nodes with ValidationError info
    const annotatedTree = result.root
      ? annotateTreeWithErrors(result.root, deferredErrors)
      : null;

    return {
      tree: annotatedTree,
      parseIssues: result.parseErrors,
    };
  }, [deferredContent, deferredErrors]);

  const handleNodeClick = useCallback((line: number) => {
    scrollToLine(line);
  }, [scrollToLine]);

  const adjustOutlineFont = useCallback((delta: number) => {
    const newSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, state.outlineFontSize + delta));
    setOutlineFontSize(newSize);
  }, [state.outlineFontSize, setOutlineFontSize]);

  return (
    <div className="outline-panel" style={{ '--outline-font-size': `${state.outlineFontSize}px` } as React.CSSProperties}>
      <div className="outline-header">
        <span className="outline-title">Outline</span>
        <div className="outline-font-control">
          <button
            className="font-btn"
            onClick={() => adjustOutlineFont(-FONT_STEP)}
            disabled={state.outlineFontSize <= MIN_FONT_SIZE}
            title="Decrease outline font size"
          >
            A−
          </button>
          <span className="font-size-value">{state.outlineFontSize}</span>
          <button
            className="font-btn"
            onClick={() => adjustOutlineFont(FONT_STEP)}
            disabled={state.outlineFontSize >= MAX_FONT_SIZE}
            title="Increase outline font size"
          >
            A+
          </button>
        </div>
      </div>
      <div className="outline-content">
        {tree ? (
          <TreeNode
            node={tree}
            defaultExpanded={true}
            onNodeClick={handleNodeClick}
          />
        ) : parseIssues.length > 0 ? (
          // Show parse issues list when no tree is available
          <div className="outline-parse-issues">
            <div className="parse-issues-header">
              ⚠ Parse Issues ({parseIssues.length})
            </div>
            {parseIssues.slice(0, 10).map((issue, i) => (
              <div
                key={i}
                className="parse-issue-item"
                onClick={() => scrollToLine(issue.line)}
                title={issue.message}
              >
                <span className="issue-line">Ln {issue.line}</span>
                <span className="issue-message">{issue.message}</span>
              </div>
            ))}
            {parseIssues.length > 10 && (
              <div className="parse-issues-more">
                +{parseIssues.length - 10} more issues...
              </div>
            )}
          </div>
        ) : (
          <div className="outline-error">
            Unable to parse XML structure.
            <br />
            Fix any syntax errors first.
          </div>
        )}
      </div>
    </div>
  );
}
