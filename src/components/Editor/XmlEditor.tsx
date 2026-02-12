import { useCallback, useMemo, useRef, useEffect, useState, useSyncExternalStore } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import type { EditorView, ViewUpdate } from '@codemirror/view';
import { useEditor } from '../../store/EditorContext';
import { useSchema } from '../../store/SchemaContext';
import { useFileDrop } from '../../hooks/useFileDrop';
import { useToast } from '../../components/Toast/Toast';
import { createEditorExtensions, FILE_DROP_EVENT } from './extensions';
import { validationErrorsCompartment, validationErrorsFacet } from './scrollbarMarkers';
import { isValidXmlFile, getDragData } from '../../utils/dragDropUtils';

// Subscribe to theme changes via MutationObserver
function subscribeToTheme(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  return () => observer.disconnect();
}

function getThemeSnapshot() {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}
import { QuickTagMenu } from './QuickTagMenu';
import './XmlEditor.css';

export function XmlEditor() {
  const {
    multiTabState,
    getActiveDocument,
    setCursor,
    updateContentAndCursor,
    setErrors,
    editorViewRef,
    wrapSelection,
    openFileAsTab,
  } = useEditor();
  const { schema } = useSchema();
  const { isDragOver, resetDragState, dragProps } = useFileDrop();
  const toast = useToast();

  // Subscribe to theme changes to update syntax highlighting
  const isDarkMode = useSyncExternalStore(subscribeToTheme, getThemeSnapshot);

  // Get the active document
  const activeDoc = getActiveDocument();

  // Use a ref to track content without causing re-renders
  const contentRef = useRef(activeDoc?.content ?? '');

  // Local ref for capturing EditorView from CodeMirror
  const localViewRef = useRef<EditorView | null>(null);

  // Quick tag menu state
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const selectionTimeoutRef = useRef<number | null>(null);
  // Suppress menu after wrap operation (prevents menu from reappearing)
  const suppressMenuUntilRef = useRef<number>(0);

  // Update content ref when active document changes
  useEffect(() => {
    if (activeDoc) {
      contentRef.current = activeDoc.content;
    }
  }, [activeDoc?.id, activeDoc?.content]);

  // Register EditorView with the context when it changes
  const handleCreateEditor = useCallback((view: EditorView) => {
    localViewRef.current = view;
    editorViewRef.current = view;
  }, [editorViewRef]);

  // Cleanup on unmount: EditorView 참조 + 타임아웃 정리
  useEffect(() => {
    return () => {
      // EditorView 참조 정리
      if (editorViewRef.current === localViewRef.current) {
        editorViewRef.current = null;
      }
      // 대기 중인 선택 타임아웃 정리 (메모리 누수 방지)
      if (selectionTimeoutRef.current) {
        clearTimeout(selectionTimeoutRef.current);
      }
    };
  }, [editorViewRef]);

  // Listen for custom file drop events from CodeMirror extension
  // This bridges CodeMirror's drop handling to React's file open logic
  useEffect(() => {
    const handleFileDrop = async (e: Event) => {
      // Reset drag state immediately (CodeMirror stops propagation, so parent handlers won't run)
      resetDragState();

      const customEvent = e as CustomEvent<{
        files?: File[];
        internalDragId?: string;
      }>;
      const { files, internalDragId } = customEvent.detail;

      // Handle internal drag (from FileExplorer)
      if (internalDragId) {
        const dragData = getDragData(internalDragId);
        if (dragData) {
          try {
            const file = await dragData.fileHandle.getFile();
            const content = await file.text();
            openFileAsTab(content, dragData.fileName, dragData.fileHandle, dragData.filePath);
            toast.success(`Opened ${dragData.fileName}`);
          } catch {
            toast.error(`Failed to open ${dragData.fileName}`);
          }
        }
        return;
      }

      // Handle external file drop (from OS)
      if (files && files.length > 0) {
        let openedCount = 0;
        let skippedCount = 0;
        let lastOpenedName = '';

        for (const file of files) {
          if (!isValidXmlFile(file.name)) {
            skippedCount++;
            continue;
          }
          try {
            const content = await file.text();
            openFileAsTab(content, file.name, null, null);
            openedCount++;
            lastOpenedName = file.name;
          } catch {
            toast.error(`Failed to open ${file.name}`);
          }
        }

        // Show toast
        if (openedCount === 1) {
          toast.success(`Opened ${lastOpenedName}`);
        } else if (openedCount > 1) {
          toast.success(`Opened ${openedCount} files`);
        }

        if (skippedCount > 0) {
          toast.warning(`Skipped ${skippedCount} non-XML file${skippedCount > 1 ? 's' : ''}`);
        }
      }
    };

    // Listen on document to catch events bubbling from CodeMirror
    document.addEventListener(FILE_DROP_EVENT, handleFileDrop);
    return () => document.removeEventListener(FILE_DROP_EVENT, handleFileDrop);
  }, [openFileAsTab, toast, resetDragState]);

  // Extensions는 schema, isDarkMode 변경 시에만 재생성
  // 에러 업데이트는 useEffect에서 Compartment.reconfigure()로 처리
  const extensions = useMemo(
    () => createEditorExtensions(schema, setErrors, isDarkMode),
    [schema, setErrors, isDarkMode],
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // Scrollbar 에러 마커 동적 업데이트
  // ═══════════════════════════════════════════════════════════════════════════
  // Compartment.reconfigure()를 사용하여 extensions 배열 재생성 없이
  // 에러 데이터만 업데이트합니다. 이렇게 하면:
  // - CodeMirror 내부 상태(자동완성, 커서 등)가 유지됩니다
  // - 성능이 향상됩니다 (불필요한 extensions 재생성 방지)
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;

    const currentErrors = activeDoc?.errors ?? [];

    // Compartment를 통해 facet 값만 동적으로 업데이트
    view.dispatch({
      effects: validationErrorsCompartment.reconfigure(
        validationErrorsFacet.of(currentErrors)
      ),
    });
  }, [activeDoc?.errors, editorViewRef]);

  // ═══════════════════════════════════════════════════════════════════════════
  // 성능 최적화 핵심 로직
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // CodeMirror는 "uncontrolled" 모드로 동작:
  // - controlled mode (value={state.content})를 사용하면 React 재렌더링 시
  //   stale content가 CodeMirror로 전달되어 타이핑한 문자가 삭제되는 버그 발생
  // - 따라서 onChange에서는 contentRef만 업데이트하고, React state는
  //   handleUpdate에서 UPDATE_CONTENT_AND_CURSOR로 한 번에 업데이트
  //
  // 최적화 결과:
  // - dispatch 2회 → 1회로 감소 (content + cursor 통합)
  // - React 재렌더링 1회 감소 → 타이핑 반응성 향상
  // ═══════════════════════════════════════════════════════════════════════════

  // onChange: contentRef만 업데이트 (React state 업데이트 없음)
  const handleChange = useCallback(
    (value: string) => {
      contentRef.current = value;
    },
    [],
  );

  // handleUpdate: docChanged와 selectionSet을 한 번에 처리 (dispatch 1회)
  const handleUpdate = useCallback(
    (update: ViewUpdate) => {
      const pos = update.state.selection.main.head;
      const line = update.state.doc.lineAt(pos);
      const cursorLine = line.number;
      const cursorColumn = pos - line.from + 1;

      // 문서 내용 변경 시: content와 cursor를 한 번에 업데이트 (dispatch 1회)
      if (update.docChanged) {
        const content = update.state.doc.toString();
        contentRef.current = content;
        updateContentAndCursor(content, cursorLine, cursorColumn);
      } else if (update.selectionSet) {
        // 커서/선택만 변경 시: cursor만 업데이트
        setCursor(cursorLine, cursorColumn);
      }

      // Toggle 'has-selection' class based on selection state
      // This allows CSS to hide activeLine highlight when text is selected
      // Only update DOM class when selection actually changes (performance optimization)
      const { from, to } = update.state.selection.main;
      const hasSelection = from !== to;
      if (update.selectionSet) {
        update.view.dom.classList.toggle('has-selection', hasSelection);
      }

      // Check for text selection to show quick tag menu
      if (update.selectionSet) {
        const selection = update.state.doc.sliceString(from, to);

        // Clear any pending timeout
        if (selectionTimeoutRef.current) {
          clearTimeout(selectionTimeoutRef.current);
        }

        // Only show menu for meaningful selections (not just cursor movement)
        // Also check if menu is suppressed (after wrap operation)
        const isSuppressed = Date.now() < suppressMenuUntilRef.current;
        if (!isSuppressed && selection.length >= 1 && selection.length <= 500 && !selection.includes('\n')) {
          // Delay to avoid showing on quick selections during editing
          selectionTimeoutRef.current = window.setTimeout(() => {
            // Double-check suppression in case it was set during delay
            if (Date.now() < suppressMenuUntilRef.current) return;

            const view = update.view;
            // Get coordinates at the end of selection
            const coords = view.coordsAtPos(to);
            if (coords) {
              setSelectedText(selection);
              setMenuPosition({ x: coords.left, y: coords.bottom });
            }
          }, 300); // 300ms delay for intentional selections
        } else {
          // Hide menu if selection is cleared or too long
          setMenuPosition(null);
          setSelectedText('');
        }
      }
    },
    [setCursor, updateContentAndCursor],
  );

  // Handle tag selection from quick menu
  const handleQuickTagSelect = useCallback((tagName: string) => {
    // Suppress menu for 500ms to prevent it from reappearing after wrap
    suppressMenuUntilRef.current = Date.now() + 500;
    wrapSelection(tagName);
    setMenuPosition(null);
    setSelectedText('');
  }, [wrapSelection]);

  // Close quick tag menu
  const handleMenuClose = useCallback(() => {
    setMenuPosition(null);
    setSelectedText('');
  }, []);

  // No active document - show empty state
  if (!activeDoc) {
    return (
      <div
        className={`xml-editor xml-editor-empty ${isDragOver ? 'drag-over' : ''}`}
        {...dragProps}
      >
        <div className="empty-state">
          <div className="empty-icon">📄</div>
          <p>No document open</p>
          <p className="empty-hint">Press Ctrl+N to create a new document<br />or Ctrl+O to open a file<br />or drag XML files here</p>
        </div>
        {isDragOver && (
          <div className="drop-overlay">
            <div className="drop-overlay-content">
              <span className="drop-icon">📄</span>
              <span className="drop-text">Drop XML file to open</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Key includes document ID and version - remount on tab switch or document reload
  const editorKey = `editor-${activeDoc.id}-${activeDoc.documentVersion}`;

  return (
    <div
      className={`xml-editor ${isDragOver ? 'drag-over' : ''}`}
      style={{ '--editor-font-size': `${multiTabState.editorFontSize}px` } as React.CSSProperties}
      {...dragProps}
    >
      <CodeMirror
        key={editorKey}
        value={activeDoc.content}
        height="100%"
        extensions={extensions}
        onChange={handleChange}
        onUpdate={handleUpdate}
        onCreateEditor={handleCreateEditor}
        basicSetup={{
          lineNumbers: false,  // Disabled - using custom visual line numbers
          highlightActiveLineGutter: true,
          highlightActiveLine: true,
          foldGutter: true,
          bracketMatching: true,
          closeBrackets: false,  // Disabled to avoid conflict with XML autoCloseTags
          indentOnInput: true,
          history: true,
          searchKeymap: true,
        }}
      />

      {/* Quick tag menu - appears when text is selected */}
      <QuickTagMenu
        position={menuPosition}
        selectedText={selectedText}
        onSelectTag={handleQuickTagSelect}
        onClose={handleMenuClose}
      />

      {/* Drop overlay - appears when dragging files over editor */}
      {isDragOver && (
        <div className="drop-overlay">
          <div className="drop-overlay-content">
            <span className="drop-icon">📄</span>
            <span className="drop-text">Drop XML file to open</span>
          </div>
        </div>
      )}
    </div>
  );
}
