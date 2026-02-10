import { useEditor } from '../../store/EditorContext';
import type { ViewMode } from '../../types/editor';
import { FileMenu } from './FileMenu';
import { SchemaSelector } from './SchemaSelector';
import { ThemeToggle } from './ThemeToggle';
import './Toolbar.css';

interface Props {
  onNewDocument: () => void;
}

export function Toolbar({ onNewDocument }: Props) {
  const { state, setViewMode } = useEditor();

  return (
    <>
      <div className="toolbar-group">
        <FileMenu onNewDocument={onNewDocument} />
      </div>
      <div className="toolbar-separator" />
      <div className="toolbar-group">
        <SchemaSelector />
      </div>
      <div className="toolbar-spacer" />
      <div className="toolbar-group">
        {(['editor', 'split', 'preview'] as ViewMode[]).map((mode) => (
          <button
            key={mode}
            className={state.viewMode === mode ? 'toolbar-btn-active' : ''}
            onClick={() => setViewMode(mode)}
            title={`${mode.charAt(0).toUpperCase() + mode.slice(1)} view`}
          >
            {mode === 'editor' ? 'Code' : mode === 'split' ? 'Split' : 'Preview'}
          </button>
        ))}
      </div>
      <div className="toolbar-separator" />
      <div className="toolbar-group">
        <ThemeToggle />
      </div>
    </>
  );
}
