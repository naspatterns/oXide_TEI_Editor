import { useState, useCallback, useEffect, useRef } from 'react';
import { useSchema } from '../../store/SchemaContext';
import './WrapTagDialog.css';

interface Props {
  open: boolean;
  onClose: () => void;
  onWrap: (tagName: string) => void;
  selectedText: string;
}

// Common TEI inline elements that are typically used to wrap text
const COMMON_INLINE_TAGS = [
  'hi', 'emph', 'name', 'persName', 'placeName', 'orgName', 'date', 'term',
  'foreign', 'q', 'quote', 'ref', 'title', 'mentioned', 'soCalled', 'rs',
  'abbr', 'expan', 'num', 'measure', 'add', 'del', 'corr', 'sic', 'choice',
  'unclear', 'supplied', 'gap', 'note', 'seg', 'w', 'c', 'pc'
];

export function WrapTagDialog({ open, onClose, onWrap, selectedText }: Props) {
  const { schema } = useSchema();
  const [tagName, setTagName] = useState('');
  const [filter, setFilter] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when dialog opens
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // Get available inline tags from schema (if available) or use common tags
  const availableTags = schema
    ? COMMON_INLINE_TAGS.filter(tag =>
        schema.elements.some(e => e.name === tag)
      )
    : COMMON_INLINE_TAGS;

  // Filter tags based on input
  const filteredTags = filter
    ? availableTags.filter(t => t.toLowerCase().includes(filter.toLowerCase()))
    : availableTags;

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const finalTag = tagName.trim() || filter.trim();
    if (finalTag) {
      onWrap(finalTag);
      setTagName('');
      setFilter('');
      onClose();
    }
  }, [tagName, filter, onWrap, onClose]);

  const handleTagClick = useCallback((tag: string) => {
    onWrap(tag);
    setTagName('');
    setFilter('');
    onClose();
  }, [onWrap, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  if (!open) return null;

  // Truncate preview if too long
  const preview = selectedText.length > 50
    ? selectedText.slice(0, 50) + '...'
    : selectedText;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="wrap-dialog" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="wrap-dialog-header">
          <h2 className="dialog-title">Wrap Selection with Tag</h2>
          <button className="wrap-dialog-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="wrap-dialog-form">
          <div className="wrap-preview">
            <span className="wrap-preview-label">Selected:</span>
            <span className="wrap-preview-text">"{preview}"</span>
          </div>

          <div className="wrap-input-group">
            <input
              ref={inputRef}
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Type tag name or filter..."
              className="wrap-input"
            />
          </div>

          <div className="wrap-tag-grid">
            {filteredTags.slice(0, 15).map((tag) => (
              <button
                key={tag}
                type="button"
                className="wrap-tag-btn"
                onClick={() => handleTagClick(tag)}
              >
                &lt;{tag}&gt;
              </button>
            ))}
          </div>

          {filter && !availableTags.includes(filter) && (
            <div className="wrap-custom-hint">
              Press Enter to wrap with custom tag: <code>&lt;{filter}&gt;</code>
            </div>
          )}
        </form>

        <div className="wrap-dialog-footer">
          <button type="button" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="dialog-primary"
            onClick={handleSubmit}
            disabled={!filter.trim() && !tagName.trim()}
          >
            Wrap
          </button>
        </div>
      </div>
    </div>
  );
}
