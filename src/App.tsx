import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { SchemaProvider } from './store/SchemaContext';
import { EditorProvider, useEditor } from './store/EditorContext';
import { WorkspaceProvider } from './store/WorkspaceContext';
import { AIProvider } from './ai/AIContext';
import { ToastProvider, useToast } from './components/Toast/Toast';
import { AppShell } from './components/Layout/AppShell';
import { MainLayout } from './components/Layout/MainLayout';
import { Toolbar } from './components/Toolbar/Toolbar';
import { FileExplorer } from './components/FileExplorer/FileExplorer';
import { EditorTabBar } from './components/Editor/EditorTabBar';
import { BreadcrumbBar } from './components/Editor/BreadcrumbBar';
import { XmlEditor } from './components/Editor/XmlEditor';
import { RightPanel } from './components/Layout/RightPanel';
import { NewDocumentDialog } from './components/FileDialog/NewDocumentDialog';

// Lazy load PreviewPanel (only shown in preview mode)
const PreviewPanel = lazy(() => import('./components/Preview/PreviewPanel').then(m => ({ default: m.PreviewPanel })));
import { AlertDialog } from './components/FileDialog/AlertDialog';
import { ConfirmDialog } from './components/FileDialog/ConfirmDialog';
import { HelpDialog } from './components/Toolbar/HelpDialog';
import logoUrl from '../imgs/logo-oxygen-style-transparent.svg';
import type { Command } from './components/CommandPalette/CommandPalette';
import { openFile, saveFile, saveAsFile } from './file/fileSystemAccess';
import { startAutoSave, stopAutoSave, loadFromIDB } from './file/autoSave';
import { detectSchemaDeclarations, analyzeSchemaDeclarations, buildSchemaAlertMessage } from './utils/schemaDetector';

// Lazy load CommandPalette (only shown when user presses Ctrl+K)
const CommandPalette = lazy(() => import('./components/CommandPalette/CommandPalette').then(m => ({ default: m.CommandPalette })));

function EditorLayout() {
  const {
    state,
    multiTabState,
    loadDocument,
    setFile,
    markSaved,
    openFileAsTab,
    createNewTab,
    getActiveDocument,
    closeTab,
    setActiveTab,
  } = useEditor();
  const toast = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [showExplorer, setShowExplorer] = useState(true);
  const [recoveryData, setRecoveryData] = useState<{ content: string; fileName: string | null; timestamp: number } | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    async (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      switch (e.key.toLowerCase()) {
        case 'n':
          e.preventDefault();
          if (e.shiftKey) {
            // Ctrl+Shift+N: Create new empty tab
            createNewTab();
          } else {
            // Ctrl+N: Open new document dialog
            setDialogOpen(true);
          }
          break;
        case 'o':
          e.preventDefault();
          try {
            const result = await openFile();
            // Open as new tab instead of replacing current document
            openFileAsTab(result.content, result.fileName, result.fileHandle, null);
            toast.info(`Opened ${result.fileName}`);

            // Check for schema declarations and warn if needed
            const declarations = detectSchemaDeclarations(result.content);
            if (declarations.length > 0) {
              const analysis = analyzeSchemaDeclarations(declarations);
              const message = buildSchemaAlertMessage(analysis);
              if (message) {
                setTimeout(() => setAlertMessage(message), 100);
              }
            }
          } catch { /* cancelled */ }
          break;
        case 's':
          e.preventDefault();
          try {
            const activeDoc = getActiveDocument();
            if (!activeDoc) return;

            if (e.shiftKey) {
              const result = await saveAsFile(activeDoc.content, activeDoc.fileName);
              setFile(result.fileName, result.fileHandle);
              toast.success(`Saved as ${result.fileName}`);
            } else {
              const result = await saveFile(activeDoc.content, activeDoc.fileHandle, activeDoc.fileName);
              setFile(result.fileName, result.fileHandle);
              toast.success(`Saved ${result.fileName}`);
            }
            markSaved();
          } catch { /* cancelled */ }
          break;
        case 'b':
          // Ctrl+B: Toggle explorer panel
          e.preventDefault();
          setShowExplorer(prev => !prev);
          break;
        case 'k':
          // Ctrl+K / Cmd+K: Open command palette
          e.preventDefault();
          setCommandPaletteOpen(true);
          break;
        case 'p':
          // Ctrl+Shift+P: Open command palette
          if (e.shiftKey) {
            e.preventDefault();
            setCommandPaletteOpen(true);
          }
          break;
        case 'w':
          // Ctrl+W: Close current tab
          e.preventDefault();
          if (multiTabState.activeDocumentId) {
            const activeDoc = getActiveDocument();
            if (activeDoc?.isDirty) {
              // Show confirmation for unsaved changes - handled by EditorTabBar
              // For now, just let it close (the user was warned on beforeunload)
            }
            closeTab(multiTabState.activeDocumentId);
          }
          break;
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
          // Ctrl+1-8: Switch to tab by number
          e.preventDefault();
          const tabIndex = parseInt(e.key) - 1;
          if (tabIndex < multiTabState.tabOrder.length) {
            setActiveTab(multiTabState.tabOrder[tabIndex]);
          }
          break;
      }
    },
    [loadDocument, setFile, markSaved, openFileAsTab, createNewTab, getActiveDocument, multiTabState, closeTab, setActiveTab],
  );

  // Define available commands
  const commands = useMemo<Command[]>(() => {
    const handleOpenFile = async () => {
      try {
        const result = await openFile();
        openFileAsTab(result.content, result.fileName, result.fileHandle, null);
        toast.info(`Opened ${result.fileName}`);
      } catch { /* cancelled */ }
    };

    const handleSave = async () => {
      try {
        const activeDoc = getActiveDocument();
        if (!activeDoc) return;
        const result = await saveFile(activeDoc.content, activeDoc.fileHandle, activeDoc.fileName);
        setFile(result.fileName, result.fileHandle);
        markSaved();
        toast.success(`Saved ${result.fileName}`);
      } catch { /* cancelled */ }
    };

    const handleSaveAs = async () => {
      try {
        const activeDoc = getActiveDocument();
        if (!activeDoc) return;
        const result = await saveAsFile(activeDoc.content, activeDoc.fileName);
        setFile(result.fileName, result.fileHandle);
        markSaved();
        toast.success(`Saved as ${result.fileName}`);
      } catch { /* cancelled */ }
    };

    return [
      // File commands
      {
        id: 'file:new',
        label: 'New Document',
        category: 'File',
        shortcut: 'Ctrl+N',
        icon: '📄',
        action: () => setDialogOpen(true),
      },
      {
        id: 'file:new-empty',
        label: 'New Empty Tab',
        category: 'File',
        shortcut: 'Ctrl+Shift+N',
        icon: '➕',
        action: createNewTab,
      },
      {
        id: 'file:open',
        label: 'Open File',
        category: 'File',
        shortcut: 'Ctrl+O',
        icon: '📂',
        action: handleOpenFile,
      },
      {
        id: 'file:save',
        label: 'Save',
        category: 'File',
        shortcut: 'Ctrl+S',
        icon: '💾',
        action: handleSave,
      },
      {
        id: 'file:save-as',
        label: 'Save As...',
        category: 'File',
        shortcut: 'Ctrl+Shift+S',
        icon: '💾',
        action: handleSaveAs,
      },
      // Edit commands
      {
        id: 'edit:close-tab',
        label: 'Close Tab',
        category: 'Edit',
        shortcut: 'Ctrl+W',
        icon: '✕',
        action: () => {
          if (multiTabState.activeDocumentId) {
            closeTab(multiTabState.activeDocumentId);
          }
        },
      },
      // View commands
      {
        id: 'view:toggle-explorer',
        label: 'Toggle File Explorer',
        category: 'View',
        shortcut: 'Ctrl+B',
        icon: '📁',
        action: () => setShowExplorer(prev => !prev),
      },
      // Help commands
      {
        id: 'help:shortcuts',
        label: 'Keyboard Shortcuts',
        category: 'Help',
        icon: '⌨️',
        action: () => setHelpOpen(true),
      },
      {
        id: 'help:about',
        label: 'About oXide TEI Editor',
        category: 'Help',
        icon: 'ℹ️',
        action: () => setAboutOpen(true),
      },
    ];
  }, [createNewTab, getActiveDocument, markSaved, openFileAsTab, setFile, toast]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Autosave - save active document
  useEffect(() => {
    startAutoSave(() => {
      const activeDoc = getActiveDocument();
      return {
        content: activeDoc?.content ?? '',
        fileName: activeDoc?.fileName ?? null,
      };
    });
    return stopAutoSave;
  }, [getActiveDocument]);

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
          // Less than 24 hours old - show recovery dialog
          setRecoveryData(saved);
        }
      }
    })();
  // Only run on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRecoverDocument = useCallback(() => {
    if (recoveryData) {
      loadDocument(recoveryData.content, recoveryData.fileName, null);
      toast.success('Document recovered successfully');
      setRecoveryData(null);
    }
  }, [recoveryData, loadDocument, toast]);

  const handleDiscardRecovery = useCallback(() => {
    setRecoveryData(null);
  }, []);

  // Warn before closing with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      // Check if any document is dirty
      const hasUnsavedChanges = multiTabState.openDocuments.some(doc => doc.isDirty);
      if (hasUnsavedChanges) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [multiTabState.openDocuments]);

  return (
    <>
      <AppShell toolbar={<Toolbar onNewDocument={() => setDialogOpen(true)} onSchemaAlert={setAlertMessage} onHelp={() => setHelpOpen(true)} />}>
        <MainLayout
          left={<FileExplorer onSchemaAlert={setAlertMessage} />}
          center={
            <div className="editor-container">
              <EditorTabBar />
              <BreadcrumbBar />
              <XmlEditor />
            </div>
          }
          right={state.viewMode === 'preview' ? (
            <Suspense fallback={<div className="panel-loader"><span className="loader-spinner" /><span>Loading...</span></div>}>
              <PreviewPanel />
            </Suspense>
          ) : <RightPanel />}
          showLeft={showExplorer}
        />
      </AppShell>
      <NewDocumentDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <AlertDialog
        open={alertMessage !== null}
        title="스키마 알림"
        message={alertMessage ?? ''}
        onClose={() => setAlertMessage(null)}
      />
      <AlertDialog
        open={aboutOpen}
        logo={logoUrl}
        message={'v0.1.0\n\nA lightweight, browser-based TEI XML editor for Digital Humanities researchers.\n\n• Schema-aware autocomplete\n• Real-time validation\n• Multiple document tabs\n• Dark/Light themes'}
        onClose={() => setAboutOpen(false)}
      />
      <ConfirmDialog
        open={recoveryData !== null}
        title="Recover Document"
        message={`Found autosaved document${recoveryData?.fileName ? ` (${recoveryData.fileName})` : ''} from ${recoveryData ? new Date(recoveryData.timestamp).toLocaleString() : ''}. Would you like to recover it?`}
        confirmLabel="Recover"
        cancelLabel="Discard"
        onConfirm={handleRecoverDocument}
        onCancel={handleDiscardRecovery}
      />
      {commandPaletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette
            open={commandPaletteOpen}
            onClose={() => setCommandPaletteOpen(false)}
            commands={commands}
          />
        </Suspense>
      )}
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <SchemaProvider>
        <WorkspaceProvider>
          <EditorProvider>
            <AIProvider>
              <EditorLayout />
            </AIProvider>
          </EditorProvider>
        </WorkspaceProvider>
      </SchemaProvider>
    </ToastProvider>
  );
}
