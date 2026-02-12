import { useState, useCallback, lazy, Suspense } from 'react';
import { OutlinePanel } from '../Outline/OutlinePanel';
import './RightPanel.css';

// Lazy load heavy panels to reduce initial bundle size
const PreviewPanel = lazy(() => import('../Preview/PreviewPanel').then(m => ({ default: m.PreviewPanel })));
const AIPanel = lazy(() => import('../AI/AIPanel').then(m => ({ default: m.AIPanel })));

type PanelMode = 'outline' | 'preview' | 'ai';

/** Loading fallback for lazy-loaded panels */
function PanelLoader() {
  return (
    <div className="panel-loader">
      <span className="loader-spinner" />
      <span>Loading...</span>
    </div>
  );
}

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
        {mode === 'preview' && (
          <Suspense fallback={<PanelLoader />}>
            <PreviewPanel />
          </Suspense>
        )}
        {mode === 'ai' && (
          <Suspense fallback={<PanelLoader />}>
            <AIPanel />
          </Suspense>
        )}
      </div>
    </div>
  );
}
