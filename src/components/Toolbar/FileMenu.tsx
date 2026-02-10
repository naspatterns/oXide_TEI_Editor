import { useEditor } from '../../store/EditorContext';
import { openFile, saveFile, saveAsFile } from '../../file/fileSystemAccess';

interface Props {
  onNewDocument: () => void;
}

export function FileMenu({ onNewDocument }: Props) {
  const { state, loadDocument, setFile, markSaved } = useEditor();

  const handleOpen = async () => {
    try {
      const result = await openFile();
      loadDocument(result.content, result.fileName, result.fileHandle);
    } catch {
      // User cancelled — ignore
    }
  };

  const handleSave = async () => {
    try {
      const result = await saveFile(state.content, state.fileHandle, state.fileName);
      setFile(result.fileName, result.fileHandle);
      markSaved();
    } catch {
      // User cancelled — ignore
    }
  };

  const handleSaveAs = async () => {
    try {
      const result = await saveAsFile(state.content, state.fileName);
      setFile(result.fileName, result.fileHandle);
      markSaved();
    } catch {
      // User cancelled — ignore
    }
  };

  return (
    <>
      <button onClick={onNewDocument} title="New document (Ctrl+N)">
        New
      </button>
      <button onClick={handleOpen} title="Open file (Ctrl+O)">
        Open
      </button>
      <button onClick={handleSave} title="Save file (Ctrl+S)">
        Save
      </button>
      <button onClick={handleSaveAs} title="Save As (Ctrl+Shift+S)">
        Save As
      </button>
    </>
  );
}
