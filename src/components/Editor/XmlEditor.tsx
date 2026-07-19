import { useCallback, useMemo, useRef, useEffect, useState, useSyncExternalStore } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import type { EditorView, ViewUpdate } from '@codemirror/view';
import { useEditor } from '../../store/useEditor';
import { useActiveSchema } from '../../hooks/useActiveSchema';
import { useSchema } from '../../store/useSchema';
import { useCursor } from '../../store/useCursor';
import { useFileDrop } from '../../hooks/useFileDrop';
import { useWrapSelection } from '../../hooks/useWrapSelection';
import { useToast } from '../../components/Toast/useToast';
import { createEditorExtensions, FILE_DROP_EVENT, QUICK_TAG_MENU_EVENT } from './extensions';
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
    setContent,
    setCursor,
    setTabCursor,
    setErrors,
    editorViewRef,
    openFileAsTab,
  } = useEditor();
  const schema = useActiveSchema();
  const { schematron } = useSchema();
  const { setLiveCursor } = useCursor();
  const wrapSelection = useWrapSelection();
  const { isDragOver, resetDragState, dragProps } = useFileDrop();
  const toast = useToast();

  // Cursor handling — see C7 in CHANGELOG. CursorContext is updated on every
  // selection change for live display (StatusBar / BreadcrumbBar). The
  // active document's persisted cursor is written on a 500 ms debounce so
  // tab switches restore the cursor without flooding the reducer.
  const lastCursorRef = useRef<{ line: number; column: number }>({ line: 1, column: 1 });
  const cursorPersistTimerRef = useRef<number | null>(null);
  const persistCursorDebounced = useCallback(() => {
    if (cursorPersistTimerRef.current !== null) {
      window.clearTimeout(cursorPersistTimerRef.current);
    }
    cursorPersistTimerRef.current = window.setTimeout(() => {
      cursorPersistTimerRef.current = null;
      setCursor(lastCursorRef.current.line, lastCursorRef.current.column);
    }, 500);
  }, [setCursor]);

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
  }, [activeDoc]);

  // On tab switch: push the newly-active doc's saved cursor into
  // CursorContext so StatusBar / BreadcrumbBar reflect it immediately.
  // We intentionally key on doc id only — `cursorLine` / `cursorColumn`
  // updates feed back here and would loop.
  const activeDocId = activeDoc?.id;
  useEffect(() => {
    if (activeDoc) {
      setLiveCursor(activeDoc.cursorLine, activeDoc.cursorColumn);
      lastCursorRef.current = {
        line: activeDoc.cursorLine,
        column: activeDoc.cursorColumn,
      };
    }
    // On tab switch (or unmount) this cleanup runs BEFORE the effect re-runs
    // for the new doc — while lastCursorRef still holds THIS doc's latest
    // cursor. Flush any pending debounced write to THIS doc by id, then clear
    // the timer. XmlEditor stays mounted across tab switches (only the inner
    // CodeMirror is re-keyed), so without this the pending 500 ms write either
    // never fires or fires against the already-switched active tab — losing
    // the last <500 ms of cursor position for the tab being left (#13).
    return () => {
      if (cursorPersistTimerRef.current !== null) {
        window.clearTimeout(cursorPersistTimerRef.current);
        cursorPersistTimerRef.current = null;
        if (activeDocId) {
          setTabCursor(activeDocId, lastCursorRef.current.line, lastCursorRef.current.column);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDocId]);

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

  // ═══════════════════════════════════════════════════════════════════════════
  // QuickTagMenu event handling (from CodeMirror extension)
  // ═══════════════════════════════════════════════════════════════════════════
  // The mouseup handler is now in CodeMirror extension (createMouseUpExtension)
  // which ensures the menu only appears when mouseup occurs inside the editor.
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const handleQuickTagMenuEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{
        selection?: string;
        x?: number;
        y?: number;
        cancel?: boolean;
      }>;
      const { selection, x, y, cancel } = customEvent.detail;

      // Handle cancel event (mousedown started)
      if (cancel) {
        if (selectionTimeoutRef.current) {
          clearTimeout(selectionTimeoutRef.current);
          selectionTimeoutRef.current = null;
        }
        return;
      }

      // Check suppression timeout
      if (Date.now() < suppressMenuUntilRef.current) return;

      // Schedule menu display with delay
      if (selectionTimeoutRef.current) {
        clearTimeout(selectionTimeoutRef.current);
      }

      selectionTimeoutRef.current = window.setTimeout(() => {
        if (Date.now() < suppressMenuUntilRef.current) return;

        if (selection && x !== undefined && y !== undefined) {
          setSelectedText(selection);
          setMenuPosition({ x, y });
        }
      }, 200); // 200ms delay for menu display
    };

    document.addEventListener(QUICK_TAG_MENU_EVENT, handleQuickTagMenuEvent);
    return () => document.removeEventListener(QUICK_TAG_MENU_EVENT, handleQuickTagMenuEvent);
  }, []);

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

  // Extensions는 schema, schematron, isDarkMode 변경 시에만 재생성
  // (reconfigure는 교체 방식 — tests/editorExtensions.test.ts가 고정)
  // 에러 업데이트는 useEffect에서 Compartment.reconfigure()로 처리
  const extensions = useMemo(
    () => createEditorExtensions(schema, setErrors, isDarkMode, schematron),
    [schema, setErrors, isDarkMode, schematron],
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

  // onChange: fires on every real doc change (not @uiw's own value-sync). The
  // `value` string was ALREADY materialized from the doc by @uiw, so reuse it
  // here for both contentRef and the React-state dispatch instead of calling
  // doc.toString() a second time in handleUpdate.
  const handleChange = useCallback(
    (value: string) => {
      contentRef.current = value;
      setContent(value);
    },
    [setContent],
  );

  // handleUpdate: docChanged + selectionSet을 분리 처리.
  // - 커서 변경: CursorContext에 즉시 반영(narrow consumer만 재렌더), reducer
  //   쓰기는 디바운스
  // - 콘텐츠 변경: SET_CONTENT 디스패치 (reducer state는 cursor와 분리)
  const handleUpdate = useCallback(
    (update: ViewUpdate) => {
      if (update.selectionSet || update.docChanged) {
        const pos = update.state.selection.main.head;
        const line = update.state.doc.lineAt(pos);
        const cursorLine = line.number;
        const cursorColumn = pos - line.from + 1;
        // Live update — cheap, only re-renders cursor consumers.
        setLiveCursor(cursorLine, cursorColumn);
        lastCursorRef.current = { line: cursorLine, column: cursorColumn };
        // Persist to active document on a 500 ms debounce for tab-switch
        // restoration.
        persistCursorDebounced();
      }

      // Content is persisted in handleChange (onChange) — no doc.toString()
      // here. handleUpdate only handles cursor + selection UI below.

      // Toggle 'has-selection' class based on selection state.
      // Only update DOM class when selection actually changes (perf).
      const { from, to } = update.state.selection.main;
      const hasSelection = from !== to;
      if (update.selectionSet) {
        update.view.dom.classList.toggle('has-selection', hasSelection);
      }

      // Close quick tag menu when selection is cleared.
      // Menu display is handled by mouseup handler only (not by selectionSet).
      if (update.selectionSet && from === to) {
        setMenuPosition(null);
        setSelectedText('');
      }
    },
    [setLiveCursor, persistCursorDebounced],
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

  // Handle Escape from quick tag menu — close it but KEEP the editor
  // selection. The user dismissed the menu, not their selection; follow-up
  // actions (replace-typing, copy, the toolbar Wrap button) still need it.
  const handleMenuEscape = useCallback(() => {
    editorViewRef.current?.focus();
    setMenuPosition(null);
    setSelectedText('');
  }, [editorViewRef]);

  // Remount CodeMirror only on tab switch / doc reload (id or documentVersion
  // change), never on a keystroke.
  const editorKey = activeDoc ? `editor-${activeDoc.id}-${activeDoc.documentVersion}` : 'editor-empty';
  // The value passed to CodeMirror is the doc content captured at MOUNT (keyed
  // on editorKey), NOT the live content. Feeding live content back made @uiw's
  // value-sync effect run on every keystroke — re-materializing the whole doc
  // via toString() and doing an O(n) string compare. CodeMirror now owns the
  // live text; React state stays current via handleChange's setContent for
  // other consumers. INVARIANT: any external reset of the active doc's content
  // must bump documentVersion (→ new editorKey → remount) to reach the editor.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recapture only when editorKey changes, not on content edits
  const initialContent = useMemo(() => (activeDoc?.content ?? ''), [editorKey]);

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

  return (
    <div
      className={`xml-editor ${isDragOver ? 'drag-over' : ''}`}
      style={{ '--editor-font-size': `${multiTabState.editorFontSize}px` } as React.CSSProperties}
      {...dragProps}
    >
      <CodeMirror
        key={editorKey}
        value={initialContent}
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
        onEscape={handleMenuEscape}
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
