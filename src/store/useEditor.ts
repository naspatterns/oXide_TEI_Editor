import { createContext, useContext, type MutableRefObject } from 'react';
import type { EditorView } from '@codemirror/view';
import type { ViewMode } from '../types/editor';
import type { ValidationError } from '../types/schema';
import type { OpenDocument, MultiTabEditorState } from '../types/workspace';

/**
 * Legacy-compatible state interface.
 * Maps to the active document for backwards compatibility.
 */
export interface LegacyEditorState {
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

export interface EditorContextValue {
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
  openFileAsTab: (
    content: string,
    fileName: string,
    fileHandle: FileSystemFileHandle | null,
    filePath?: string | null,
  ) => void;
  /** Create a new empty tab */
  createNewTab: (content?: string, fileName?: string) => void;

  // Active document updates (legacy API)
  setContent: (content: string) => void;
  setFile: (
    fileName: string | null,
    fileHandle: FileSystemFileHandle | null,
    filePath?: string | null,
  ) => void;
  markSaved: () => void;
  setCursor: (line: number, column: number) => void;
  /** 성능 최적화: content와 cursor를 한 번에 업데이트 (dispatch 1회) */
  updateContentAndCursor: (content: string, line: number, column: number) => void;
  setErrors: (errors: ValidationError[]) => void;
  setValidating: (isValidating: boolean) => void;
  setViewMode: (viewMode: ViewMode) => void;
  loadDocument: (
    content: string,
    fileName: string | null,
    fileHandle: FileSystemFileHandle | null,
    filePath?: string | null,
  ) => void;

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
}

export const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditor(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor must be used within EditorProvider');
  return ctx;
}
