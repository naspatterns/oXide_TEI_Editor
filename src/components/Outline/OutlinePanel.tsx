import { memo, useMemo, useState, useCallback, useDeferredValue } from 'react';
import { useEditor } from '../../store/useEditor';
import { type XmlNode, parseXmlToTreeTolerant, annotateTreeWithErrors } from './outlineModel';
import './OutlinePanel.css';

const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 24;
const FONT_STEP = 2;

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

  // Parse keyed on CONTENT only — an error-only change (which happens on every
  // lint pass) must not trigger a full O(doc) re-parse.
  const parsed = useMemo(() => parseXmlToTreeTolerant(deferredContent), [deferredContent]);

  // Annotate keyed on the parse result + errors. annotateTreeWithErrors walks
  // iteratively (O(nodes)), so re-annotating on an error change is cheap.
  const { tree, parseIssues } = useMemo(
    () => ({
      tree: parsed.root ? annotateTreeWithErrors(parsed.root, deferredErrors) : null,
      parseIssues: parsed.parseErrors,
    }),
    [parsed, deferredErrors],
  );

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
