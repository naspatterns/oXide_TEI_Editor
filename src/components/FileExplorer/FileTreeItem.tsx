import { useCallback } from 'react';
import { useWorkspace } from '../../store/WorkspaceContext';
import type { FileTreeNode } from '../../types/workspace';

interface FileTreeItemProps {
  node: FileTreeNode;
  depth: number;
  onFileClick: (path: string, handle: FileSystemHandle) => void;
  onContextMenu?: (e: React.MouseEvent, node: FileTreeNode) => void;
}

/** Get icon for file based on extension */
function getFileIcon(fileName: string): string {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
  switch (ext) {
    case '.xml':
      return '📄';
    case '.tei':
      return '📜';
    case '.rng':
      return '📋';
    default:
      return '📄';
  }
}

export function FileTreeItem({ node, depth, onFileClick, onContextMenu }: FileTreeItemProps) {
  const { toggleDirectory } = useWorkspace();

  const handleClick = useCallback(() => {
    if (node.type === 'directory') {
      toggleDirectory(node.path);
    } else {
      onFileClick(node.path, node.handle);
    }
  }, [node, toggleDirectory, onFileClick]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onContextMenu?.(e, node);
    },
    [node, onContextMenu],
  );

  const isFolder = node.type === 'directory';
  const icon = isFolder
    ? node.isExpanded ? '📂' : '📁'
    : getFileIcon(node.name);

  return (
    <div className="file-tree-item-container">
      <div
        className={`file-tree-item ${isFolder ? 'folder' : 'file'}`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        title={node.path}
      >
        {isFolder && (
          <span className={`tree-chevron ${node.isExpanded ? 'expanded' : ''}`}>
            ▶
          </span>
        )}
        <span className="file-icon">{icon}</span>
        <span className="file-name">{node.name}</span>
      </div>

      {isFolder && node.isExpanded && node.children && (
        <div className="file-tree-children">
          {node.children.map(child => (
            <FileTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              onFileClick={onFileClick}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
}
