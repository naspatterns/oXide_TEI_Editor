import { EditorView } from '@codemirror/view';

/** Custom CodeMirror theme for the TEI editor */
export const teiEditorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '14px',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, 'Courier New', monospace",
  },
  '.cm-content': {
    padding: '8px 0',
  },
  '.cm-gutters': {
    background: 'var(--color-surface)',
    border: 'none',
    color: 'var(--color-text-secondary)',
  },
  '.cm-activeLineGutter': {
    background: 'var(--color-border)',
  },
  '.cm-activeLine': {
    background: 'var(--cm-active-line, rgba(0, 0, 0, 0.04))',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--color-primary)',
    borderLeftWidth: '2px',
  },
  '.cm-selectionBackground': {
    background: 'rgba(74, 111, 165, 0.2) !important',
  },
  '.cm-matchingBracket': {
    background: 'rgba(74, 111, 165, 0.3)',
    outline: 'none',
  },
  // XML processing instructions (<?xml ...?>) - gray italic
  '.cm-processingInstruction': {
    color: '#6a737d',
    fontStyle: 'italic',
  },
  // XML comments - gray italic
  '.cm-comment': {
    color: '#6a737d',
    fontStyle: 'italic',
  },
  // XML tag styling
  '.cm-tag': {
    color: '#22863a',
  },
  '.cm-attributeName': {
    color: '#6f42c1',
  },
  '.cm-attributeValue': {
    color: '#032f62',
  },
  // Lint diagnostic styling
  '.cm-lintRange-error': {
    backgroundImage: 'none',
    textDecoration: 'underline wavy var(--color-error)',
    textDecorationSkipInk: 'none',
  },
  '.cm-lintRange-warning': {
    backgroundImage: 'none',
    textDecoration: 'underline wavy var(--color-warning)',
    textDecorationSkipInk: 'none',
  },
  '.cm-tooltip-autocomplete': {
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
  },
});
