import './HelpDialog.css';

interface Props {
  open: boolean;
  onClose: () => void;
}

// Determine the modifier key based on platform
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const modKey = isMac ? '⌘' : 'Ctrl';

interface Shortcut {
  keys: string;
  description: string;
}

interface ShortcutSection {
  title: string;
  shortcuts: Shortcut[];
}

const SHORTCUTS: ShortcutSection[] = [
  {
    title: 'File',
    shortcuts: [
      { keys: `${modKey}+N`, description: 'New document' },
      { keys: `${modKey}+O`, description: 'Open file' },
      { keys: `${modKey}+S`, description: 'Save file' },
      { keys: `${modKey}+Shift+S`, description: 'Save as...' },
    ],
  },
  {
    title: 'Edit',
    shortcuts: [
      { keys: `${modKey}+Z`, description: 'Undo' },
      { keys: `${modKey}+Shift+Z`, description: 'Redo' },
      { keys: `${modKey}+F`, description: 'Find' },
      { keys: `${modKey}+G`, description: 'Find next' },
      { keys: `${modKey}+Shift+G`, description: 'Find previous' },
      { keys: `${modKey}+H`, description: 'Replace' },
    ],
  },
  {
    title: 'Editor',
    shortcuts: [
      { keys: `${modKey}+/`, description: 'Toggle comment' },
      { keys: 'Tab', description: 'Indent' },
      { keys: 'Shift+Tab', description: 'Outdent' },
      { keys: `${modKey}+[`, description: 'Fold code block' },
      { keys: `${modKey}+]`, description: 'Unfold code block' },
    ],
  },
  {
    title: 'Autocomplete',
    shortcuts: [
      { keys: `${modKey}+Space`, description: 'Trigger autocomplete' },
      { keys: 'Tab / Enter', description: 'Accept suggestion' },
      { keys: 'Esc', description: 'Dismiss autocomplete' },
    ],
  },
];

/**
 * Help dialog showing keyboard shortcuts
 */
export function HelpDialog({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="help-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="help-dialog-header">
          <h2 className="dialog-title">Keyboard Shortcuts</h2>
          <button className="help-dialog-close" onClick={onClose}>×</button>
        </div>
        <div className="help-dialog-content">
          {SHORTCUTS.map((section) => (
            <div key={section.title} className="shortcut-section">
              <h3 className="shortcut-section-title">{section.title}</h3>
              <div className="shortcut-list">
                {section.shortcuts.map((shortcut) => (
                  <div key={shortcut.keys} className="shortcut-item">
                    <span className="shortcut-keys">
                      {shortcut.keys.split('+').map((key, i, arr) => (
                        <span key={i}>
                          <kbd className="shortcut-key">{key}</kbd>
                          {i < arr.length - 1 && <span className="shortcut-plus">+</span>}
                        </span>
                      ))}
                    </span>
                    <span className="shortcut-desc">{shortcut.description}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="help-dialog-footer">
          <span className="help-tip">
            💡 Tip: In the Outline panel, click nodes to jump to that line in the editor.
          </span>
        </div>
      </div>
    </div>
  );
}
