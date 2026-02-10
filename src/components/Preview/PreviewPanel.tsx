import { useMemo } from 'react';
import { useEditor } from '../../store/EditorContext';
import { teiToHtml } from './teiTransform';
import './tei-preview.css';

export function PreviewPanel() {
  const { state } = useEditor();

  const html = useMemo(() => teiToHtml(state.content), [state.content]);

  return (
    <div className="preview-panel">
      <div className="preview-header">Preview</div>
      <div
        className="preview-content tei-rendered"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
