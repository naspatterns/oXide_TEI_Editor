import './AlertDialog.css';

interface Props {
  open: boolean;
  title?: string;
  message: string;
  logo?: string;
  onClose: () => void;
}

/**
 * Custom alert dialog that replaces native alert()
 * - Properly sized to avoid scrollbars
 * - Supports multi-line messages with proper formatting
 * - Styled consistently with the app theme
 */
export function AlertDialog({ open, title, message, logo, onClose }: Props) {
  if (!open) return null;

  // Parse message to handle line breaks and formatting
  const lines = message.split('\n');

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="alert-dialog" onClick={(e) => e.stopPropagation()}>
        {logo && <img src={logo} alt="" className="alert-logo" />}
        {title && <h2 className="dialog-title">{title}</h2>}
        <div className="alert-content">
          {lines.map((line, i) => {
            // Empty line = paragraph break
            if (line.trim() === '') {
              return <div key={i} className="alert-spacer" />;
            }
            // Lines starting with • are list items
            if (line.startsWith('•')) {
              return (
                <div key={i} className="alert-list-item">
                  {line}
                </div>
              );
            }
            // Lines starting with emoji are section headers
            if (/^[⚠️💡📁]/.test(line)) {
              return (
                <div key={i} className="alert-section">
                  {line}
                </div>
              );
            }
            // Regular text
            return (
              <div key={i} className="alert-line">
                {line}
              </div>
            );
          })}
        </div>
        <div className="dialog-actions">
          <button className="dialog-primary" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
