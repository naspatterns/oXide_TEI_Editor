import { useCallback, useState } from 'react';
import { useWorkspace } from '../../store/WorkspaceContext';
import { useEditor } from '../../store/EditorContext';
import { openFile, readFileContent } from '../../file/fileSystemAccess';
import { detectSchemaDeclarations, analyzeSchemaDeclarations, buildSchemaAlertMessage } from '../../utils/schemaDetector';
import { ContextMenu, useContextMenu, MenuItem, MenuDivider } from '../ContextMenu/ContextMenu';
import { FileTreeItem } from './FileTreeItem';
import type { FileTreeNode } from '../../types/workspace';
import './FileExplorer.css';

interface FileExplorerProps {
  onSchemaAlert?: (message: string) => void;
}

export function FileExplorer({ onSchemaAlert }: FileExplorerProps) {
  const { state, isSupported, openWorkspace, closeWorkspace, refreshFileTree } = useWorkspace();
  const { openFileAsTab } = useEditor();

  // Context menu state
  const contextMenu = useContextMenu();
  const [contextNode, setContextNode] = useState<FileTreeNode | null>(null);

  // Handle opening a file from the tree
  const handleOpenFile = useCallback(
    async (path: string, handle: FileSystemHandle) => {
      if (handle.kind !== 'file') return;

      try {
        const content = await readFileContent(handle as FileSystemFileHandle);
        const fileName = handle.name;
        openFileAsTab(content, fileName, handle as FileSystemFileHandle, path);

        // Check for schema declarations and warn if needed
        if (onSchemaAlert) {
          const declarations = detectSchemaDeclarations(content);
          if (declarations.length > 0) {
            const analysis = analyzeSchemaDeclarations(declarations);
            const message = buildSchemaAlertMessage(analysis);
            if (message) {
              setTimeout(() => onSchemaAlert(message), 100);
            }
          }
        }
      } catch (error) {
        console.error('Failed to open file:', error);
      }
    },
    [openFileAsTab, onSchemaAlert],
  );

  // Handle file tree item context menu
  const handleTreeContextMenu = useCallback(
    (e: React.MouseEvent, node: FileTreeNode) => {
      setContextNode(node);
      contextMenu.open(e);
    },
    [contextMenu],
  );

  // Copy file/folder path
  const handleCopyPath = useCallback(() => {
    if (contextNode) {
      navigator.clipboard.writeText(contextNode.path);
    }
  }, [contextNode]);

  // Build context menu items for file tree
  const getContextMenuItems = useCallback((): (MenuItem | MenuDivider)[] => {
    if (!contextNode) return [];

    const isFile = contextNode.type === 'file';

    return [
      ...(isFile
        ? [
            {
              id: 'open',
              label: 'Open',
              icon: '📄',
              action: () => handleOpenFile(contextNode.path, contextNode.handle),
            } as MenuItem,
            { type: 'divider' as const } as MenuDivider,
          ]
        : []),
      {
        id: 'copy-path',
        label: 'Copy Path',
        icon: '📋',
        action: handleCopyPath,
      },
      {
        id: 'copy-name',
        label: 'Copy Name',
        icon: '📝',
        action: () => navigator.clipboard.writeText(contextNode.name),
      },
    ];
  }, [contextNode, handleCopyPath, handleOpenFile]);

  // Handle opening a single file (without workspace)
  const handleOpenSingleFile = useCallback(async () => {
    try {
      const { content, fileName, fileHandle } = await openFile();
      openFileAsTab(content, fileName, fileHandle, null);

      // Check for schema declarations and warn if needed
      if (onSchemaAlert) {
        const declarations = detectSchemaDeclarations(content);
        if (declarations.length > 0) {
          const analysis = analyzeSchemaDeclarations(declarations);
          const message = buildSchemaAlertMessage(analysis);
          if (message) {
            setTimeout(() => onSchemaAlert(message), 100);
          }
        }
      }
    } catch (error) {
      // User cancelled or error occurred
      if (error instanceof Error && !error.message.includes('cancelled')) {
        console.error('Failed to open file:', error);
      }
    }
  }, [openFileAsTab, onSchemaAlert]);

  // Not supported in this browser (directory picker)
  if (!isSupported) {
    return (
      <div className="file-explorer">
        <div className="file-explorer-header">
          <span className="file-explorer-title">EXPLORER</span>
        </div>
        <div className="file-explorer-empty">
          <div className="file-explorer-welcome">
            <div className="welcome-icon">📂</div>
            <p className="welcome-text">Open a file to get started</p>
            <p className="welcome-hint">
              Project folders are supported in Chrome and Edge browsers
            </p>
          </div>
          <div className="file-explorer-buttons">
            <button className="file-explorer-btn primary" onClick={handleOpenSingleFile}>
              <span className="btn-icon">📄</span>
              <span className="btn-label">Open File</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // No workspace open - show welcome screen with two options
  if (!state.rootHandle) {
    return (
      <div className="file-explorer">
        <div className="file-explorer-header">
          <span className="file-explorer-title">EXPLORER</span>
        </div>
        <div className="file-explorer-empty">
          <div className="file-explorer-welcome">
            <div className="welcome-icon">📂</div>
            <p className="welcome-text">Open a project or file</p>
            <p className="welcome-hint">
              Choose a project folder to browse multiple files, or open a single document
            </p>
          </div>
          <div className="file-explorer-buttons">
            <button className="file-explorer-btn primary" onClick={openWorkspace}>
              <span className="btn-icon">📁</span>
              <span className="btn-label">Open Project</span>
            </button>
            <button className="file-explorer-btn secondary" onClick={handleOpenSingleFile}>
              <span className="btn-icon">📄</span>
              <span className="btn-label">Open File</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading
  if (state.isLoading) {
    return (
      <div className="file-explorer">
        <div className="file-explorer-header">
          <span className="file-explorer-title">EXPLORER</span>
        </div>
        <div className="file-explorer-loading">
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="file-explorer">
      <div className="file-explorer-header">
        <span className="file-explorer-title">EXPLORER</span>
        <div className="file-explorer-actions">
          <button
            className="file-explorer-action-btn"
            onClick={refreshFileTree}
            title="Refresh"
          >
            ↻
          </button>
          <button
            className="file-explorer-action-btn"
            onClick={closeWorkspace}
            title="Close Project"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="file-explorer-workspace-name">
        <span className="folder-icon">📁</span>
        <span className="workspace-name">{state.rootName}</span>
      </div>

      <div className="file-explorer-tree">
        {state.fileTree.length === 0 ? (
          <div className="file-explorer-empty-tree">
            <p>No XML files found</p>
          </div>
        ) : (
          state.fileTree.map(node => (
            <FileTreeItem
              key={node.path}
              node={node}
              depth={0}
              onFileClick={handleOpenFile}
              onContextMenu={handleTreeContextMenu}
            />
          ))
        )}
      </div>

      {/* Context Menu */}
      {contextMenu.isOpen && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems()}
          onClose={contextMenu.close}
        />
      )}
    </div>
  );
}
