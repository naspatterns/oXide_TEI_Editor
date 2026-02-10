import { useCallback, useMemo, useState, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import type { ViewUpdate } from '@codemirror/view';
import { useEditor } from '../../store/EditorContext';
import { useSchema } from '../../store/SchemaContext';
import { createEditorExtensions } from './extensions';
import './XmlEditor.css';

export function XmlEditor() {
  const { state, setContent, setCursor, setErrors } = useEditor();
  const { schema } = useSchema();

  // Capture content at mount time. This value never changes during the
  // component's lifetime — the `key` prop forces a full remount only when
  // documentVersion changes (new/open file), at which point a fresh
  // `initialContent` is captured from the (updated) state.
  const [initialContent] = useState(() => state.content);

  // Use a ref to track dirty/content for the status bar cursor updates
  // without causing CodeMirror to re-render with stale value props.
  const contentRef = useRef(state.content);

  const extensions = useMemo(
    () => createEditorExtensions(schema, setErrors),
    [schema, setErrors],
  );

  const handleChange = useCallback(
    (value: string) => {
      contentRef.current = value;
      setContent(value);
    },
    [setContent],
  );

  const handleUpdate = useCallback(
    (update: ViewUpdate) => {
      if (update.selectionSet) {
        const pos = update.state.selection.main.head;
        const line = update.state.doc.lineAt(pos);
        setCursor(line.number, pos - line.from + 1);
      }
    },
    [setCursor],
  );

  // Only use documentVersion for key - schema changes should NOT cause remount
  // as that would lose unsaved content. Instead, extensions update dynamically.
  const editorKey = `editor-${state.documentVersion}`;

  return (
    <div className="xml-editor">
      <CodeMirror
        key={editorKey}
        value={initialContent}
        height="100%"
        extensions={extensions}
        onChange={handleChange}
        onUpdate={handleUpdate}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: true,
          highlightActiveLine: true,
          foldGutter: true,
          bracketMatching: true,
          closeBrackets: false,  // Disabled to avoid conflict with XML autoCloseTags
          indentOnInput: true,
          history: true,
          searchKeymap: true,
        }}
      />
    </div>
  );
}
