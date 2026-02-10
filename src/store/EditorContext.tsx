import { createContext, useContext, useReducer, useCallback, type ReactNode } from 'react';
import type { EditorState, ViewMode } from '../types/editor';
import type { ValidationError } from '../types/schema';

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

type Action =
  | { type: 'SET_CONTENT'; content: string }
  | { type: 'SET_FILE'; fileName: string | null; fileHandle: FileSystemFileHandle | null }
  | { type: 'MARK_SAVED' }
  | { type: 'SET_CURSOR'; line: number; column: number }
  | { type: 'SET_ERRORS'; errors: ValidationError[] }
  | { type: 'SET_VALIDATING'; isValidating: boolean }
  | { type: 'SET_VIEW_MODE'; viewMode: ViewMode }
  | { type: 'LOAD_DOCUMENT'; content: string; fileName: string | null; fileHandle: FileSystemFileHandle | null };

function reducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case 'SET_CONTENT':
      return { ...state, content: action.content, isDirty: true };
    case 'SET_FILE':
      return { ...state, fileName: action.fileName, fileHandle: action.fileHandle };
    case 'MARK_SAVED':
      return { ...state, isDirty: false };
    case 'SET_CURSOR':
      return { ...state, cursorLine: action.line, cursorColumn: action.column };
    case 'SET_ERRORS':
      return { ...state, errors: action.errors, isValidating: false };
    case 'SET_VALIDATING':
      return { ...state, isValidating: action.isValidating };
    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.viewMode };
    case 'LOAD_DOCUMENT':
      return {
        ...state,
        content: action.content,
        fileName: action.fileName,
        fileHandle: action.fileHandle,
        isDirty: false,
        errors: [],
        documentVersion: state.documentVersion + 1,
      };
    default:
      return state;
  }
}

const initialState: EditorState = {
  content: DEFAULT_CONTENT,
  fileName: null,
  fileHandle: null,
  isDirty: false,
  cursorLine: 1,
  cursorColumn: 1,
  errors: [],
  isValidating: false,
  viewMode: 'split',
  documentVersion: 0,
};

interface EditorContextValue {
  state: EditorState;
  setContent: (content: string) => void;
  setFile: (fileName: string | null, fileHandle: FileSystemFileHandle | null) => void;
  markSaved: () => void;
  setCursor: (line: number, column: number) => void;
  setErrors: (errors: ValidationError[]) => void;
  setValidating: (isValidating: boolean) => void;
  setViewMode: (viewMode: ViewMode) => void;
  loadDocument: (content: string, fileName: string | null, fileHandle: FileSystemFileHandle | null) => void;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const setContent = useCallback((content: string) => dispatch({ type: 'SET_CONTENT', content }), []);
  const setFile = useCallback((fileName: string | null, fileHandle: FileSystemFileHandle | null) => dispatch({ type: 'SET_FILE', fileName, fileHandle }), []);
  const markSaved = useCallback(() => dispatch({ type: 'MARK_SAVED' }), []);
  const setCursor = useCallback((line: number, column: number) => dispatch({ type: 'SET_CURSOR', line, column }), []);
  const setErrors = useCallback((errors: ValidationError[]) => dispatch({ type: 'SET_ERRORS', errors }), []);
  const setValidating = useCallback((isValidating: boolean) => dispatch({ type: 'SET_VALIDATING', isValidating }), []);
  const setViewMode = useCallback((viewMode: ViewMode) => dispatch({ type: 'SET_VIEW_MODE', viewMode }), []);
  const loadDocument = useCallback((content: string, fileName: string | null, fileHandle: FileSystemFileHandle | null) => dispatch({ type: 'LOAD_DOCUMENT', content, fileName, fileHandle }), []);

  return (
    <EditorContext.Provider value={{ state, setContent, setFile, markSaved, setCursor, setErrors, setValidating, setViewMode, loadDocument }}>
      {children}
    </EditorContext.Provider>
  );
}

export function useEditor(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor must be used within EditorProvider');
  return ctx;
}
