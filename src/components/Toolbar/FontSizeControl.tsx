import { useEditor } from '../../store/EditorContext';
import './FontSizeControl.css';

const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 24;
const STEP = 2;

export function FontSizeControl() {
  const { state, setEditorFontSize, setOutlineFontSize } = useEditor();

  const adjustEditorFont = (delta: number) => {
    const newSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, state.editorFontSize + delta));
    setEditorFontSize(newSize);
  };

  const adjustOutlineFont = (delta: number) => {
    const newSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, state.outlineFontSize + delta));
    setOutlineFontSize(newSize);
  };

  return (
    <div className="font-size-controls">
      <div className="font-size-group">
        <span className="font-size-label">Editor</span>
        <button
          className="font-size-btn"
          onClick={() => adjustEditorFont(-STEP)}
          disabled={state.editorFontSize <= MIN_FONT_SIZE}
          title="Decrease editor font size"
        >
          −
        </button>
        <span className="font-size-value">{state.editorFontSize}</span>
        <button
          className="font-size-btn"
          onClick={() => adjustEditorFont(STEP)}
          disabled={state.editorFontSize >= MAX_FONT_SIZE}
          title="Increase editor font size"
        >
          +
        </button>
      </div>
      <div className="font-size-group">
        <span className="font-size-label">Outline</span>
        <button
          className="font-size-btn"
          onClick={() => adjustOutlineFont(-STEP)}
          disabled={state.outlineFontSize <= MIN_FONT_SIZE}
          title="Decrease outline font size"
        >
          −
        </button>
        <span className="font-size-value">{state.outlineFontSize}</span>
        <button
          className="font-size-btn"
          onClick={() => adjustOutlineFont(STEP)}
          disabled={state.outlineFontSize >= MAX_FONT_SIZE}
          title="Increase outline font size"
        >
          +
        </button>
      </div>
    </div>
  );
}
