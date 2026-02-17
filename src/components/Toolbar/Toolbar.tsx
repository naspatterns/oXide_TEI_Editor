import { useState, useCallback } from 'react';
import { useEditor } from '../../store/EditorContext';
import type { ViewMode } from '../../types/editor';
import { FileMenu } from './FileMenu';
import { SchemaSelector } from './SchemaSelector';
import { ThemeToggle } from './ThemeToggle';
import { WrapTagDialog } from './WrapTagDialog';
import { SearchPanel } from './SearchPanel';
import { XPathSearch } from './XPathSearch';
import { Tooltip } from '../Tooltip/Tooltip';
import logoUrl from '../../../imgs/logo-oxygen-style.svg';
import './Toolbar.css';

interface Props {
  onNewDocument: () => void;
  onSchemaAlert?: (message: string) => void;
  onHelp?: () => void;
}

export function Toolbar({ onNewDocument, onSchemaAlert, onHelp }: Props) {
  const { state, setViewMode, getSelection, wrapSelection } = useEditor();
  const [wrapDialogOpen, setWrapDialogOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedText, setSelectedText] = useState('');

  const handleWrapClick = useCallback(() => {
    const selection = getSelection();
    if (!selection) {
      // No selection - could show a tooltip or just open anyway
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

  return (
    <>
      {/* Left section: File menu */}
      <div className="toolbar-section toolbar-left">
        <img src={logoUrl} alt="oXide TEI Editor" className="toolbar-logo" />
        <div className="toolbar-group">
          <FileMenu onNewDocument={onNewDocument} onSchemaAlert={onSchemaAlert} />
        </div>
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

      {/* Right section: View mode + Settings */}
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
        <div className="toolbar-separator" />
        <div className="toolbar-group">
          <ThemeToggle />
          <Tooltip content="Keyboard shortcuts" shortcut="Cmd+K">
            <button className="toolbar-help-btn" onClick={onHelp}>
              ?
            </button>
          </Tooltip>
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
