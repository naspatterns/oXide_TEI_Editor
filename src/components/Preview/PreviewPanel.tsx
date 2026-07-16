import { useMemo, useDeferredValue } from 'react';
import { useEditor } from '../../store/useEditor';
import { teiToHtml } from './teiTransform';
import './tei-preview.css';

export function PreviewPanel() {
  const { state } = useEditor();

  // Defer the transform off the urgent (keystroke) render, mirroring
  // OutlinePanel. teiToHtml runs a full DOMParser + recursive transform;
  // running it synchronously on every keystroke was the biggest typing-
  // latency contributor in split/preview mode on large documents.
  const deferredContent = useDeferredValue(state.content);
  const html = useMemo(() => teiToHtml(deferredContent), [deferredContent]);

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
