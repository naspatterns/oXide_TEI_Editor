import { useMemo, useState, useCallback } from 'react';
import { useEditor } from '../../store/EditorContext';
import './OutlinePanel.css';

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

    // Calculate line numbers from source
    const lines = xmlStr.split('\n');
    const lineMap = new Map<string, number>();

    // Build a simple line mapping for elements
    lines.forEach((line, idx) => {
      const match = line.match(/<([a-zA-Z_][\w.:_-]*)/g);
      if (match) {
        match.forEach(tag => {
          const tagName = tag.slice(1);
          if (!lineMap.has(`${tagName}-${idx}`)) {
            lineMap.set(`${tagName}-${idx}`, idx + 1);
          }
        });
      }
    });

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
  const { state } = useEditor();

  const tree = useMemo(() => parseXmlToTree(state.content), [state.content]);

  const handleNodeClick = useCallback((_line: number) => {
    // TODO: Navigate to line in editor (requires editor API integration)
  }, []);

  return (
    <div className="outline-panel">
      <div className="outline-header">Outline</div>
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
