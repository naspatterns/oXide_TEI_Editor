import { useEditor } from '../../store/EditorContext';
import { openFile, saveFile, saveAsFile } from '../../file/fileSystemAccess';
import { detectSchemaDeclarations, analyzeSchemaDeclarations, buildSchemaAlertMessage } from '../../utils/schemaDetector';

interface Props {
  onNewDocument: () => void;
  onSchemaAlert?: (message: string) => void;
}

export function FileMenu({ onNewDocument, onSchemaAlert }: Props) {
  const { state, loadDocument, setFile, markSaved } = useEditor();

  const handleOpen = async () => {
    try {
      const result = await openFile();
      loadDocument(result.content, result.fileName, result.fileHandle);

      // Check for schema declarations and warn if needed
      const declarations = detectSchemaDeclarations(result.content);
      if (declarations.length > 0) {
        const analysis = analyzeSchemaDeclarations(declarations);
        const message = buildSchemaAlertMessage(analysis);
        if (message && onSchemaAlert) {
          setTimeout(() => onSchemaAlert(message), 100);
        }
      }
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
