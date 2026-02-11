import { useState, useCallback } from 'react';
import { OutlinePanel } from '../Outline/OutlinePanel';
import { PreviewPanel } from '../Preview/PreviewPanel';
import { AIPanel } from '../AI/AIPanel';
import './RightPanel.css';

type PanelMode = 'outline' | 'preview' | 'ai';

/**
 * Right panel wrapper that allows toggling between Outline, Preview, and AI
 * Used in split mode to give users flexibility in what they see
 */
export function RightPanel() {
  const [mode, setMode] = useState<PanelMode>('outline');

  const handleModeChange = useCallback((newMode: PanelMode) => {
    setMode(newMode);
  }, []);

  return (
    <div className="right-panel">
      <div className="right-panel-tabs">
        <button
          className={`right-panel-tab ${mode === 'outline' ? 'right-panel-tab-active' : ''}`}
          onClick={() => handleModeChange('outline')}
          title="XML structure tree"
        >
          Outline
        </button>
        <button
          className={`right-panel-tab ${mode === 'preview' ? 'right-panel-tab-active' : ''}`}
          onClick={() => handleModeChange('preview')}
          title="Rendered HTML preview"
        >
          Preview
        </button>
        <button
          className={`right-panel-tab ${mode === 'ai' ? 'right-panel-tab-active' : ''}`}
          onClick={() => handleModeChange('ai')}
          title="AI Assistant for TEI encoding"
        >
          AI ✨
        </button>
      </div>
      <div className="right-panel-content">
        {mode === 'outline' && <OutlinePanel />}
        {mode === 'preview' && <PreviewPanel />}
        {mode === 'ai' && <AIPanel />}
      </div>
    </div>
  );
}
