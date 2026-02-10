import { useState, useEffect, useCallback, useRef } from 'react';
import { SchemaProvider } from './store/SchemaContext';
import { EditorProvider, useEditor } from './store/EditorContext';
import { AppShell } from './components/Layout/AppShell';
import { SplitPane } from './components/Layout/SplitPane';
import { Toolbar } from './components/Toolbar/Toolbar';
import { XmlEditor } from './components/Editor/XmlEditor';
import { OutlinePanel } from './components/Outline/OutlinePanel';
import { NewDocumentDialog } from './components/FileDialog/NewDocumentDialog';
import { openFile, saveFile, saveAsFile } from './file/fileSystemAccess';
import { startAutoSave, stopAutoSave, loadFromIDB } from './file/autoSave';

function EditorLayout() {
  const { state, loadDocument, setFile, markSaved } = useEditor();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    async (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      switch (e.key.toLowerCase()) {
        case 'n':
          e.preventDefault();
          setDialogOpen(true);
          break;
        case 'o':
          e.preventDefault();
          try {
            const result = await openFile();
            loadDocument(result.content, result.fileName, result.fileHandle);
          } catch { /* cancelled */ }
          break;
        case 's':
          e.preventDefault();
          try {
            if (e.shiftKey) {
              const result = await saveAsFile(state.content, state.fileName);
              setFile(result.fileName, result.fileHandle);
            } else {
              const result = await saveFile(state.content, state.fileHandle, state.fileName);
              setFile(result.fileName, result.fileHandle);
            }
            markSaved();
          } catch { /* cancelled */ }
          break;
      }
    },
    [state.content, state.fileHandle, state.fileName, loadDocument, setFile, markSaved],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Autosave
  useEffect(() => {
    startAutoSave(() => ({
      content: state.content,
      fileName: state.fileName,
    }));
    return stopAutoSave;
  }, [state.content, state.fileName]);

  // Track if recovery was already attempted (prevents double prompt in Strict Mode)
  const recoveryAttempted = useRef(false);

  // Check for autosaved content on mount
  useEffect(() => {
    // Prevent double execution in React Strict Mode
    if (recoveryAttempted.current) return;
    recoveryAttempted.current = true;

    (async () => {
      const saved = await loadFromIDB();
      if (saved && saved.content && saved.content.length > 100) {
        // Only offer recovery if the saved content seems meaningful
        const age = Date.now() - saved.timestamp;
        if (age < 24 * 60 * 60 * 1000) {
          // Less than 24 hours old
          const recover = window.confirm(
            `Found autosaved document${saved.fileName ? ` (${saved.fileName})` : ''} from ${new Date(saved.timestamp).toLocaleString()}. Recover it?`,
          );
          if (recover) {
            loadDocument(saved.content, saved.fileName, null);
          }
        }
      }
    })();
  // Only run on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Warn before closing with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (state.isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [state.isDirty]);

  return (
    <>
      <AppShell toolbar={<Toolbar onNewDocument={() => setDialogOpen(true)} />}>
        <SplitPane
          mode={state.viewMode}
          left={<XmlEditor />}
          right={<OutlinePanel />}
        />
      </AppShell>
      <NewDocumentDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </>
  );
}

export default function App() {
  return (
    <SchemaProvider>
      <EditorProvider>
        <EditorLayout />
      </EditorProvider>
    </SchemaProvider>
  );
}
