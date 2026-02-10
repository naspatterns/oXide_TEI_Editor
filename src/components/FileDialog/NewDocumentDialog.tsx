import { useState } from 'react';
import { TEMPLATES, getTemplateContent } from '../../file/templates';
import { useEditor } from '../../store/EditorContext';
import './NewDocumentDialog.css';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function NewDocumentDialog({ open, onClose }: Props) {
  const [selected, setSelected] = useState('minimal');
  const { loadDocument } = useEditor();

  if (!open) return null;

  const handleCreate = () => {
    const content = getTemplateContent(selected);
    loadDocument(content, null, null);
    onClose();
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2 className="dialog-title">New TEI Document</h2>
        <div className="template-grid">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              className={`template-card ${selected === t.id ? 'template-selected' : ''}`}
              onClick={() => setSelected(t.id)}
            >
              <div className="template-name">{t.name}</div>
              <div className="template-desc">{t.description}</div>
            </button>
          ))}
        </div>
        <div className="dialog-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="dialog-primary" onClick={handleCreate}>
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
