import { useMemo, useState, useCallback, useDeferredValue } from 'react';
import { useEditor } from '../../store/EditorContext';
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
}

/** Parse XML string into tree structure */
function parseXmlToTree(xmlStr: string): XmlNode | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlStr, 'application/xml');

    // Check for parse errors
    const errorNode = doc.querySelector('parsererror');
    if (errorNode) return null;

    // 소스에서 라인 번호 계산을 위해 라인 배열 생성
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

    if (doc.documentElement) {
      return domToNode(doc.documentElement, 1);
    }
    return null;
  } catch {
    return null;
  }
}

/** Tree node component with expand/collapse functionality */
function TreeNode({
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

  return (
    <div className="tree-node">
      <div
        className="tree-node-header"
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onClick={handleClick}
        title={`Line ${node.line}`}
      >
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
          {node.children.map((child, idx) => (
            <TreeNode
              key={`${child.name}-${child.line}-${idx}`}
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
}

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
  const tree = useMemo(() => parseXmlToTree(deferredContent), [deferredContent]);

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
