import { useCallback, useState } from 'react';
import { useEditor } from '../../store/EditorContext';
import { ContextMenu, useContextMenu, MenuItem, MenuDivider } from '../ContextMenu/ContextMenu';
import { ConfirmDialog } from '../FileDialog/ConfirmDialog';
import './EditorTabBar.css';

const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 24;
const FONT_STEP = 2;

export function EditorTabBar() {
  const { multiTabState, setActiveTab, closeTab, getDocument, setEditorFontSize } = useEditor();
  const { tabOrder, activeDocumentId } = multiTabState;

  // Context menu state
  const contextMenu = useContextMenu();
  const [contextTabId, setContextTabId] = useState<string | null>(null);

  // Close confirmation dialog state
  const [closeConfirm, setCloseConfirm] = useState<{ id: string; fileName: string } | null>(null);

  const handleTabClick = useCallback(
    (id: string) => {
      setActiveTab(id);
    },
    [setActiveTab],
  );

  const handleTabContextMenu = useCallback(
    (e: React.MouseEvent, id: string) => {
      setContextTabId(id);
      contextMenu.open(e);
    },
    [contextMenu],
  );

  const doCloseTab = useCallback(
    (id: string) => {
      const doc = getDocument(id);
      if (doc?.isDirty) {
        setCloseConfirm({ id, fileName: doc.fileName });
      } else {
        closeTab(id);
      }
    },
    [closeTab, getDocument],
  );

  const handleCloseTab = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      doCloseTab(id);
    },
    [doCloseTab],
  );

  const handleCloseOthers = useCallback(() => {
    if (!contextTabId) return;
    tabOrder.filter(id => id !== contextTabId).forEach(id => {
      const doc = getDocument(id);
      if (!doc?.isDirty) {
        closeTab(id);
      }
    });
  }, [contextTabId, tabOrder, closeTab, getDocument]);

  const handleCloseAll = useCallback(() => {
    tabOrder.forEach(id => {
      const doc = getDocument(id);
      if (!doc?.isDirty) {
        closeTab(id);
      }
    });
  }, [tabOrder, closeTab, getDocument]);

  const handleCopyPath = useCallback(() => {
    if (!contextTabId) return;
    const doc = getDocument(contextTabId);
    if (doc?.filePath) {
      navigator.clipboard.writeText(doc.filePath);
    }
  }, [contextTabId, getDocument]);

  const adjustEditorFont = useCallback((delta: number) => {
    const newSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, multiTabState.editorFontSize + delta));
    setEditorFontSize(newSize);
  }, [multiTabState.editorFontSize, setEditorFontSize]);

  // Build context menu items
  const contextMenuItems: (MenuItem | MenuDivider)[] = contextTabId
    ? [
        {
          id: 'close',
          label: 'Close',
          shortcut: 'Ctrl+W',
          icon: '✕',
          action: () => doCloseTab(contextTabId),
        },
        {
          id: 'close-others',
          label: 'Close Others',
          icon: '⊟',
          action: handleCloseOthers,
          disabled: tabOrder.length <= 1,
        },
        {
          id: 'close-all',
          label: 'Close All',
          icon: '⊠',
          action: handleCloseAll,
        },
        { type: 'divider' as const },
        {
          id: 'copy-path',
          label: 'Copy Path',
          icon: '📋',
          action: handleCopyPath,
          disabled: !getDocument(contextTabId)?.filePath,
        },
      ]
    : [];

  // No tabs open
  if (tabOrder.length === 0) {
    return null;
  }

  return (
    <div className="editor-tab-bar">
      <div className="editor-tabs">
        {tabOrder.map(id => {
          const doc = getDocument(id);
          if (!doc) return null;

          const isActive = id === activeDocumentId;

          return (
            <div
              key={id}
              className={`editor-tab ${isActive ? 'active' : ''}`}
              onClick={() => handleTabClick(id)}
              onContextMenu={e => handleTabContextMenu(e, id)}
              title={doc.filePath || doc.fileName}
            >
              <span className="tab-dirty-indicator">
                {doc.isDirty ? '●' : ''}
              </span>
              <span className="tab-name">{doc.fileName}</span>
              <button
                className="tab-close-btn"
                onClick={e => handleCloseTab(e, id)}
                title="Close tab"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <div className="editor-font-control">
        <button
          className="font-btn"
          onClick={() => adjustEditorFont(-FONT_STEP)}
          disabled={multiTabState.editorFontSize <= MIN_FONT_SIZE}
          title="Decrease editor font size"
        >
          A−
        </button>
        <span className="font-size-value">{multiTabState.editorFontSize}</span>
        <button
          className="font-btn"
          onClick={() => adjustEditorFont(FONT_STEP)}
          disabled={multiTabState.editorFontSize >= MAX_FONT_SIZE}
          title="Increase editor font size"
        >
          A+
        </button>
      </div>

      {/* Context Menu */}
      {contextMenu.isOpen && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={contextMenu.close}
        />
      )}

      {/* Close Confirmation Dialog */}
      <ConfirmDialog
        open={closeConfirm !== null}
        title="Unsaved Changes"
        message={`"${closeConfirm?.fileName}" has unsaved changes. Close anyway?`}
        confirmLabel="Close"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => {
          if (closeConfirm) {
            closeTab(closeConfirm.id);
            setCloseConfirm(null);
          }
        }}
        onCancel={() => setCloseConfirm(null)}
      />
    </div>
  );
}
