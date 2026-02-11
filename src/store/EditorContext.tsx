import { createContext, useContext, useReducer, useCallback, useRef, useMemo, type ReactNode, type MutableRefObject } from 'react';
import type { EditorView } from '@codemirror/view';
import type { ViewMode } from '../types/editor';
import type { ValidationError } from '../types/schema';
import type { OpenDocument, MultiTabEditorState } from '../types/workspace';
import { generateDocumentId, createNewDocument } from '../types/workspace';
import { useSchema } from './SchemaContext';

const DEFAULT_CONTENT = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-model href="http://www.tei-c.org/release/xml/tei/custom/schema/relaxng/tei_lite.rng" type="application/xml" schematypens="http://relaxng.org/ns/structure/1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt>
        <title>Untitled Document</title>
      </titleStmt>
      <publicationStmt>
        <p>Unpublished</p>
      </publicationStmt>
      <sourceDesc>
        <p>Born digital</p>
      </sourceDesc>
    </fileDesc>
  </teiHeader>
  <text>
    <body>
      <div>
        <head>Section Title</head>
        <p>Start writing here...</p>
      </div>
    </body>
  </text>
</TEI>`;

// Create initial document
function createInitialDocument(): OpenDocument {
  return {
    id: generateDocumentId(),
    fileName: 'Untitled.xml',
    filePath: null,
    fileHandle: null,
    content: DEFAULT_CONTENT,
    isDirty: false,
    cursorLine: 1,
    cursorColumn: 1,
    errors: [],
    isValidating: false,
    documentVersion: 0,
  };
}

type Action =
  // Tab management
  | { type: 'OPEN_TAB'; document: OpenDocument }
  | { type: 'CLOSE_TAB'; id: string }
  | { type: 'SET_ACTIVE_TAB'; id: string }
  // Active document updates (route to active tab)
  | { type: 'SET_CONTENT'; content: string }
  | { type: 'SET_FILE'; fileName: string | null; fileHandle: FileSystemFileHandle | null; filePath?: string | null }
  | { type: 'MARK_SAVED' }
  | { type: 'SET_CURSOR'; line: number; column: number }
  // 성능 최적화: content와 cursor를 한 번에 업데이트 (dispatch 1회로 감소)
  | { type: 'UPDATE_CONTENT_AND_CURSOR'; content: string; line: number; column: number }
  | { type: 'SET_ERRORS'; errors: ValidationError[] }
  | { type: 'SET_VALIDATING'; isValidating: boolean }
  | { type: 'SET_VIEW_MODE'; viewMode: ViewMode }
  | { type: 'LOAD_DOCUMENT'; content: string; fileName: string | null; fileHandle: FileSystemFileHandle | null; filePath?: string | null }
  // Specific tab updates
  | { type: 'UPDATE_TAB_CONTENT'; id: string; content: string }
  | { type: 'MARK_TAB_SAVED'; id: string }
  | { type: 'SET_TAB_ERRORS'; id: string; errors: ValidationError[] }
  // Global settings
  | { type: 'SET_EDITOR_FONT_SIZE'; size: number }
  | { type: 'SET_OUTLINE_FONT_SIZE'; size: number }
  // Document version (for forcing remount)
  | { type: 'INCREMENT_DOCUMENT_VERSION'; id: string };

/**
 * Helper to update a specific document in the array.
 */
function updateDocument(
  documents: OpenDocument[],
  id: string,
  updates: Partial<OpenDocument>,
): OpenDocument[] {
  return documents.map(doc =>
    doc.id === id ? { ...doc, ...updates } : doc,
  );
}

function reducer(state: MultiTabEditorState, action: Action): MultiTabEditorState {
  switch (action.type) {
    // ─── Tab management ───

    case 'OPEN_TAB': {
      // Check if document with same path is already open
      if (action.document.filePath) {
        const existing = state.openDocuments.find(d => d.filePath === action.document.filePath);
        if (existing) {
          // Activate existing tab instead
          return { ...state, activeDocumentId: existing.id };
        }
      }
      return {
        ...state,
        openDocuments: [...state.openDocuments, action.document],
        tabOrder: [...state.tabOrder, action.document.id],
        activeDocumentId: action.document.id,
      };
    }

    case 'CLOSE_TAB': {
      const remainingDocs = state.openDocuments.filter(d => d.id !== action.id);
      const remainingOrder = state.tabOrder.filter(id => id !== action.id);

      // Determine new active tab
      let newActiveId = state.activeDocumentId;
      if (state.activeDocumentId === action.id) {
        // Find adjacent tab
        const closedIndex = state.tabOrder.indexOf(action.id);
        if (remainingOrder.length > 0) {
          newActiveId = remainingOrder[Math.min(closedIndex, remainingOrder.length - 1)];
        } else {
          newActiveId = null;
        }
      }

      return {
        ...state,
        openDocuments: remainingDocs,
        tabOrder: remainingOrder,
        activeDocumentId: newActiveId,
      };
    }

    case 'SET_ACTIVE_TAB': {
      // 탭 존재 여부 검증 (존재하지 않는 탭 ID면 무시)
      const tabExists = state.openDocuments.some(d => d.id === action.id);
      if (!tabExists) {
        console.warn(`SET_ACTIVE_TAB: Tab ${action.id} does not exist`);
        return state;
      }
      return { ...state, activeDocumentId: action.id };
    }

    // ─── Active document updates ───

    case 'SET_CONTENT': {
      if (!state.activeDocumentId) return state;
      return {
        ...state,
        openDocuments: updateDocument(state.openDocuments, state.activeDocumentId, {
          content: action.content,
          isDirty: true,
        }),
      };
    }

    case 'SET_FILE': {
      if (!state.activeDocumentId) return state;
      return {
        ...state,
        openDocuments: updateDocument(state.openDocuments, state.activeDocumentId, {
          fileName: action.fileName ?? 'Untitled.xml',
          fileHandle: action.fileHandle,
          filePath: action.filePath ?? null,
        }),
      };
    }

    case 'MARK_SAVED': {
      if (!state.activeDocumentId) return state;
      return {
        ...state,
        openDocuments: updateDocument(state.openDocuments, state.activeDocumentId, {
          isDirty: false,
        }),
      };
    }

    case 'SET_CURSOR': {
      if (!state.activeDocumentId) return state;
      return {
        ...state,
        openDocuments: updateDocument(state.openDocuments, state.activeDocumentId, {
          cursorLine: action.line,
          cursorColumn: action.column,
        }),
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // UPDATE_CONTENT_AND_CURSOR: 성능 최적화 핵심
    // ═══════════════════════════════════════════════════════════════════════
    // Before: SET_CONTENT + SET_CURSOR → dispatch 2회 → React 재렌더링 2회
    // After:  UPDATE_CONTENT_AND_CURSOR → dispatch 1회 → React 재렌더링 1회
    //
    // 이유: CodeMirror의 onUpdate 콜백에서 content와 cursor를 동시에 알 수 있으므로
    // 별도 dispatch 대신 통합 dispatch로 렌더링 비용 절감
    // ═══════════════════════════════════════════════════════════════════════
    case 'UPDATE_CONTENT_AND_CURSOR': {
      if (!state.activeDocumentId) return state;
      return {
        ...state,
        openDocuments: updateDocument(state.openDocuments, state.activeDocumentId, {
          content: action.content,
          isDirty: true,
          cursorLine: action.line,
          cursorColumn: action.column,
        }),
      };
    }

    case 'SET_ERRORS': {
      if (!state.activeDocumentId) return state;
      return {
        ...state,
        openDocuments: updateDocument(state.openDocuments, state.activeDocumentId, {
          errors: action.errors,
          isValidating: false,
        }),
      };
    }

    case 'SET_VALIDATING': {
      if (!state.activeDocumentId) return state;
      return {
        ...state,
        openDocuments: updateDocument(state.openDocuments, state.activeDocumentId, {
          isValidating: action.isValidating,
        }),
      };
    }

    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.viewMode };

    case 'LOAD_DOCUMENT': {
      if (!state.activeDocumentId) return state;
      const activeDoc = state.openDocuments.find(d => d.id === state.activeDocumentId);
      return {
        ...state,
        openDocuments: updateDocument(state.openDocuments, state.activeDocumentId, {
          content: action.content,
          fileName: action.fileName ?? 'Untitled.xml',
          fileHandle: action.fileHandle,
          filePath: action.filePath ?? null,
          isDirty: false,
          errors: [],
          documentVersion: (activeDoc?.documentVersion ?? 0) + 1,
        }),
      };
    }

    // ─── Specific tab updates ───

    case 'UPDATE_TAB_CONTENT':
      return {
        ...state,
        openDocuments: updateDocument(state.openDocuments, action.id, {
          content: action.content,
          isDirty: true,
        }),
      };

    case 'MARK_TAB_SAVED':
      return {
        ...state,
        openDocuments: updateDocument(state.openDocuments, action.id, {
          isDirty: false,
        }),
      };

    case 'SET_TAB_ERRORS':
      return {
        ...state,
        openDocuments: updateDocument(state.openDocuments, action.id, {
          errors: action.errors,
          isValidating: false,
        }),
      };

    case 'INCREMENT_DOCUMENT_VERSION': {
      const doc = state.openDocuments.find(d => d.id === action.id);
      if (!doc) return state;
      return {
        ...state,
        openDocuments: updateDocument(state.openDocuments, action.id, {
          documentVersion: doc.documentVersion + 1,
        }),
      };
    }

    // ─── Global settings ───

    case 'SET_EDITOR_FONT_SIZE':
      return { ...state, editorFontSize: action.size };

    case 'SET_OUTLINE_FONT_SIZE':
      return { ...state, outlineFontSize: action.size };

    default:
      return state;
  }
}

// Create initial state with one empty document
const initialDoc = createInitialDocument();
const initialState: MultiTabEditorState = {
  openDocuments: [initialDoc],
  activeDocumentId: initialDoc.id,
  tabOrder: [initialDoc.id],
  editorFontSize: 14,
  outlineFontSize: 12,
  viewMode: 'split',
};

/**
 * Legacy-compatible state interface.
 * Maps to the active document for backwards compatibility.
 */
interface LegacyEditorState {
  content: string;
  fileName: string | null;
  fileHandle: FileSystemFileHandle | null;
  isDirty: boolean;
  cursorLine: number;
  cursorColumn: number;
  errors: ValidationError[];
  isValidating: boolean;
  viewMode: ViewMode;
  documentVersion: number;
  editorFontSize: number;
  outlineFontSize: number;
}

interface EditorContextValue {
  /** Multi-tab state */
  multiTabState: MultiTabEditorState;
  /** Legacy-compatible single-document state (active document) */
  state: LegacyEditorState;
  /** Get active document */
  getActiveDocument: () => OpenDocument | null;
  /** Get document by ID */
  getDocument: (id: string) => OpenDocument | undefined;

  // Tab management
  openTab: (document: OpenDocument) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  /** Open a file and create a new tab */
  openFileAsTab: (content: string, fileName: string, fileHandle: FileSystemFileHandle | null, filePath?: string | null) => void;
  /** Create a new empty tab */
  createNewTab: (content?: string, fileName?: string) => void;

  // Active document updates (legacy API)
  setContent: (content: string) => void;
  setFile: (fileName: string | null, fileHandle: FileSystemFileHandle | null, filePath?: string | null) => void;
  markSaved: () => void;
  setCursor: (line: number, column: number) => void;
  /** 성능 최적화: content와 cursor를 한 번에 업데이트 (dispatch 1회) */
  updateContentAndCursor: (content: string, line: number, column: number) => void;
  setErrors: (errors: ValidationError[]) => void;
  setValidating: (isValidating: boolean) => void;
  setViewMode: (viewMode: ViewMode) => void;
  loadDocument: (content: string, fileName: string | null, fileHandle: FileSystemFileHandle | null, filePath?: string | null) => void;

  // Specific tab updates
  updateTabContent: (id: string, content: string) => void;
  markTabSaved: (id: string) => void;
  setTabErrors: (id: string, errors: ValidationError[]) => void;

  // Global settings
  setEditorFontSize: (size: number) => void;
  setOutlineFontSize: (size: number) => void;

  // Editor view ref and helpers
  editorViewRef: MutableRefObject<EditorView | null>;
  scrollToLine: (line: number) => void;
  /** Alias for scrollToLine - used by XPath search */
  goToLine: (line: number) => void;
  getSelection: () => string;
  wrapSelection: (tagName: string) => void;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [multiTabState, dispatch] = useReducer(reducer, initialState);
  const { schema } = useSchema();

  // Ref to hold the CodeMirror EditorView instance (set by XmlEditor)
  const editorViewRef = useRef<EditorView | null>(null);

  // Get active document
  const getActiveDocument = useCallback(() => {
    if (!multiTabState.activeDocumentId) return null;
    return multiTabState.openDocuments.find(d => d.id === multiTabState.activeDocumentId) ?? null;
  }, [multiTabState.activeDocumentId, multiTabState.openDocuments]);

  // Get document by ID
  const getDocument = useCallback(
    (id: string) => multiTabState.openDocuments.find(d => d.id === id),
    [multiTabState.openDocuments],
  );

  // Legacy-compatible state (memoized)
  const state = useMemo<LegacyEditorState>(() => {
    const activeDoc = multiTabState.activeDocumentId
      ? multiTabState.openDocuments.find(d => d.id === multiTabState.activeDocumentId)
      : null;

    if (!activeDoc) {
      return {
        content: '',
        fileName: null,
        fileHandle: null,
        isDirty: false,
        cursorLine: 1,
        cursorColumn: 1,
        errors: [],
        isValidating: false,
        viewMode: multiTabState.viewMode,
        documentVersion: 0,
        editorFontSize: multiTabState.editorFontSize,
        outlineFontSize: multiTabState.outlineFontSize,
      };
    }

    return {
      content: activeDoc.content,
      fileName: activeDoc.fileName,
      fileHandle: activeDoc.fileHandle,
      isDirty: activeDoc.isDirty,
      cursorLine: activeDoc.cursorLine,
      cursorColumn: activeDoc.cursorColumn,
      errors: activeDoc.errors,
      isValidating: activeDoc.isValidating,
      viewMode: multiTabState.viewMode,
      documentVersion: activeDoc.documentVersion,
      editorFontSize: multiTabState.editorFontSize,
      outlineFontSize: multiTabState.outlineFontSize,
    };
  }, [multiTabState]);

  // ─── Tab management ───

  const openTab = useCallback((document: OpenDocument) => {
    dispatch({ type: 'OPEN_TAB', document });
  }, []);

  const closeTab = useCallback((id: string) => {
    dispatch({ type: 'CLOSE_TAB', id });
  }, []);

  const setActiveTab = useCallback((id: string) => {
    dispatch({ type: 'SET_ACTIVE_TAB', id });
  }, []);

  const openFileAsTab = useCallback(
    (content: string, fileName: string, fileHandle: FileSystemFileHandle | null, filePath: string | null = null) => {
      const doc = createNewDocument(fileName, content);
      doc.fileHandle = fileHandle;
      doc.filePath = filePath;
      dispatch({ type: 'OPEN_TAB', document: doc });
    },
    [],
  );

  const createNewTab = useCallback((content: string = DEFAULT_CONTENT, fileName: string = 'Untitled.xml') => {
    const doc = createNewDocument(fileName, content);
    dispatch({ type: 'OPEN_TAB', document: doc });
  }, []);

  // ─── Active document updates (legacy API) ───

  const setContent = useCallback((content: string) => dispatch({ type: 'SET_CONTENT', content }), []);
  const setFile = useCallback((fileName: string | null, fileHandle: FileSystemFileHandle | null, filePath?: string | null) => dispatch({ type: 'SET_FILE', fileName, fileHandle, filePath }), []);
  const markSaved = useCallback(() => dispatch({ type: 'MARK_SAVED' }), []);
  const setCursor = useCallback((line: number, column: number) => dispatch({ type: 'SET_CURSOR', line, column }), []);
  // 성능 최적화: content와 cursor를 한 번에 업데이트 (React 재렌더링 1회)
  const updateContentAndCursor = useCallback(
    (content: string, line: number, column: number) =>
      dispatch({ type: 'UPDATE_CONTENT_AND_CURSOR', content, line, column }),
    [],
  );
  const setErrors = useCallback((errors: ValidationError[]) => dispatch({ type: 'SET_ERRORS', errors }), []);
  const setValidating = useCallback((isValidating: boolean) => dispatch({ type: 'SET_VALIDATING', isValidating }), []);
  const setViewMode = useCallback((viewMode: ViewMode) => dispatch({ type: 'SET_VIEW_MODE', viewMode }), []);
  const loadDocument = useCallback((content: string, fileName: string | null, fileHandle: FileSystemFileHandle | null, filePath?: string | null) => dispatch({ type: 'LOAD_DOCUMENT', content, fileName, fileHandle, filePath }), []);

  // ─── Specific tab updates ───

  const updateTabContent = useCallback((id: string, content: string) => dispatch({ type: 'UPDATE_TAB_CONTENT', id, content }), []);
  const markTabSaved = useCallback((id: string) => dispatch({ type: 'MARK_TAB_SAVED', id }), []);
  const setTabErrors = useCallback((id: string, errors: ValidationError[]) => dispatch({ type: 'SET_TAB_ERRORS', id, errors }), []);

  // ─── Global settings ───

  const setEditorFontSize = useCallback((size: number) => dispatch({ type: 'SET_EDITOR_FONT_SIZE', size }), []);
  const setOutlineFontSize = useCallback((size: number) => dispatch({ type: 'SET_OUTLINE_FONT_SIZE', size }), []);

  // ─── Editor view helpers ───

  const scrollToLine = useCallback((line: number) => {
    const view = editorViewRef.current;
    if (!view) return;

    try {
      const maxLine = view.state.doc.lines;
      const targetLine = Math.max(1, Math.min(line, maxLine));
      const lineInfo = view.state.doc.line(targetLine);

      view.dispatch({
        selection: { anchor: lineInfo.from },
        scrollIntoView: true,
      });

      view.focus();
    } catch (e) {
      console.warn('scrollToLine failed:', e);
    }
  }, []);

  const getSelection = useCallback(() => {
    const view = editorViewRef.current;
    if (!view) return '';

    const { from, to } = view.state.selection.main;
    return view.state.doc.sliceString(from, to);
  }, []);

  const wrapSelection = useCallback((tagName: string) => {
    const view = editorViewRef.current;
    if (!view) return;

    const { from, to } = view.state.selection.main;
    const selectedText = view.state.doc.sliceString(from, to);

    // Find required attributes from schema
    const elementSpec = schema?.elementMap.get(tagName);
    const requiredAttrs = elementSpec?.attributes?.filter(a => a.required) ?? [];

    // Build opening tag with required attributes
    let openTag = `<${tagName}`;
    let firstAttrValuePos = -1;

    for (let i = 0; i < requiredAttrs.length; i++) {
      const attr = requiredAttrs[i];
      openTag += ` ${attr.name}=""`;
      // Remember position of first attribute value for cursor placement
      if (i === 0) {
        // Position is: from + '<tagName '.length + 'attrName="'.length
        firstAttrValuePos = from + tagName.length + 2 + attr.name.length + 2;
      }
    }
    openTag += '>';

    const closeTag = `</${tagName}>`;
    const wrappedText = `${openTag}${selectedText}${closeTag}`;

    // If there are required attributes, place cursor in first attribute value
    // Otherwise, select the wrapped text as before
    if (firstAttrValuePos > 0) {
      view.dispatch({
        changes: { from, to, insert: wrappedText },
        selection: { anchor: firstAttrValuePos },
      });
    } else {
      view.dispatch({
        changes: { from, to, insert: wrappedText },
        selection: { anchor: from + openTag.length, head: from + openTag.length + selectedText.length },
      });
    }

    view.focus();
  }, [schema]);

  return (
    <EditorContext.Provider
      value={{
        multiTabState,
        state,
        getActiveDocument,
        getDocument,
        openTab,
        closeTab,
        setActiveTab,
        openFileAsTab,
        createNewTab,
        setContent,
        setFile,
        markSaved,
        setCursor,
        updateContentAndCursor,
        setErrors,
        setValidating,
        setViewMode,
        loadDocument,
        updateTabContent,
        markTabSaved,
        setTabErrors,
        setEditorFontSize,
        setOutlineFontSize,
        editorViewRef,
        scrollToLine,
        goToLine: scrollToLine, // Alias for XPath search
        getSelection,
        wrapSelection,
      }}
    >
      {children}
    </EditorContext.Provider>
  );
}

export function useEditor(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor must be used within EditorProvider');
  return ctx;
}
