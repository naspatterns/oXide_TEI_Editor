import { useState, useCallback, useMemo } from 'react';
import { useEditor } from '../../store/EditorContext';
import type { ViewMode } from '../../types/editor';
import { MenuBar, type MenuDefinition } from './MenuBar';
import { SchemaSelector } from './SchemaSelector';
import { WrapTagDialog } from './WrapTagDialog';
import { SearchPanel } from './SearchPanel';
import { XPathSearch } from './XPathSearch';
import { Tooltip } from '../Tooltip/Tooltip';
import logoUrl from '../../../imgs/logo-oxygen-style.svg';
import './Toolbar.css';

interface Props {
  onNewDocument: () => void;
  onNewEmptyTab: () => void;
  onOpenFile: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onCloseTab: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onFind: () => void;
  onReplace: () => void;
  onToggleExplorer: () => void;
  onToggleTheme: () => void;
  onCommandPalette: () => void;
  onKeyboardShortcuts: () => void;
  onAbout: () => void;
}

export function Toolbar({
  onNewDocument,
  onNewEmptyTab,
  onOpenFile,
  onSave,
  onSaveAs,
  onCloseTab,
  onUndo,
  onRedo,
  onFind,
  onReplace,
  onToggleExplorer,
  onToggleTheme,
  onCommandPalette,
  onKeyboardShortcuts,
  onAbout,
}: Props) {
  const { state, setViewMode, getSelection, wrapSelection } = useEditor();
  const [wrapDialogOpen, setWrapDialogOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedText, setSelectedText] = useState('');

  const handleWrapClick = useCallback(() => {
    const selection = getSelection();
    if (!selection) {
      return;
    }
    setSelectedText(selection);
    setWrapDialogOpen(true);
  }, [getSelection]);

  const handleWrap = useCallback((tagName: string) => {
    wrapSelection(tagName);
    setWrapDialogOpen(false);
    setSelectedText('');
  }, [wrapSelection]);

  const menus = useMemo<MenuDefinition[]>(() => [
    {
      label: 'File',
      items: [
        { label: 'New Document', shortcut: 'Ctrl+N', action: onNewDocument },
        { label: 'New Empty Tab', shortcut: 'Ctrl+Shift+N', action: onNewEmptyTab },
        { divider: true, label: '' },
        { label: 'Open File', shortcut: 'Ctrl+O', action: onOpenFile },
        { divider: true, label: '' },
        { label: 'Save', shortcut: 'Ctrl+S', action: onSave },
        { label: 'Save As...', shortcut: 'Ctrl+Shift+S', action: onSaveAs },
        { divider: true, label: '' },
        { label: 'Close Tab', shortcut: 'Ctrl+W', action: onCloseTab },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', shortcut: 'Ctrl+Z', action: onUndo },
        { label: 'Redo', shortcut: 'Ctrl+Shift+Z', action: onRedo },
        { divider: true, label: '' },
        { label: 'Find', shortcut: 'Ctrl+F', action: onFind },
        { label: 'Replace', shortcut: 'Ctrl+H', action: onReplace },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Toggle File Explorer', shortcut: 'Ctrl+B', action: onToggleExplorer },
        { divider: true, label: '' },
        { label: 'Code View', action: () => setViewMode('editor') },
        { label: 'Split View', action: () => setViewMode('split') },
        { label: 'Preview', action: () => setViewMode('preview') },
        { divider: true, label: '' },
        { label: 'Toggle Dark/Light Theme', action: onToggleTheme },
        { divider: true, label: '' },
        { label: 'Command Palette', shortcut: 'Ctrl+K', action: onCommandPalette },
      ],
    },
    {
      label: 'Help',
      items: [
        { label: 'Keyboard Shortcuts', action: onKeyboardShortcuts },
        { divider: true, label: '' },
        { label: 'About oXide TEI Editor', action: onAbout },
      ],
    },
  ], [
    onNewDocument, onNewEmptyTab, onOpenFile, onSave, onSaveAs, onCloseTab,
    onUndo, onRedo, onFind, onReplace,
    onToggleExplorer, onToggleTheme, onCommandPalette,
    onKeyboardShortcuts, onAbout, setViewMode,
  ]);

  return (
    <>
      {/* Left section: Logo + Menu bar */}
      <div className="toolbar-section toolbar-left">
        <img src={logoUrl} alt="oXide TEI Editor" className="toolbar-logo" />
        <MenuBar menus={menus} />
      </div>

      {/* Center section: Schema (emphasized) + Edit tools */}
      <div className="toolbar-section toolbar-center">
        <div className="toolbar-group schema-group">
          <span className="schema-label">Schema</span>
          <SchemaSelector />
        </div>
        <div className="toolbar-separator" />
        <div className="toolbar-group">
          <XPathSearch />
        </div>
        <div className="toolbar-separator" />
        <div className="toolbar-group">
          <Tooltip content="Wrap selection with tag" shortcut="Select text first">
            <button onClick={handleWrapClick}>
              Wrap
            </button>
          </Tooltip>
          <Tooltip content="Search for tags" shortcut="Ctrl+Shift+F">
            <button
              onClick={() => setSearchOpen(prev => !prev)}
              className={searchOpen ? 'toolbar-btn-active' : ''}
            >
              Search
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Right section: View mode */}
      <div className="toolbar-section toolbar-right">
        <div className="toolbar-group">
          {(['editor', 'split', 'preview'] as ViewMode[]).map((mode) => (
            <Tooltip
              key={mode}
              content={`${mode.charAt(0).toUpperCase() + mode.slice(1)} view`}
            >
              <button
                className={state.viewMode === mode ? 'toolbar-btn-active' : ''}
                onClick={() => setViewMode(mode)}
              >
                {mode === 'editor' ? 'Code' : mode === 'split' ? 'Split' : 'Preview'}
              </button>
            </Tooltip>
          ))}
        </div>
      </div>

      {/* Wrap Tag Dialog */}
      <WrapTagDialog
        open={wrapDialogOpen}
        onClose={() => setWrapDialogOpen(false)}
        onWrap={handleWrap}
        selectedText={selectedText}
      />

      {/* Search Panel */}
      <SearchPanel
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
      />
    </>
  );
}
