import type { ValidationError } from './schema';

/** View mode for the editor layout */
export type ViewMode = 'split' | 'editor' | 'preview';

/** Editor state shared across components */
export interface EditorState {
  /** Current document content */
  content: string;
  /** Current file name (if any) */
  fileName: string | null;
  /** File handle for File System Access API */
  fileHandle: FileSystemFileHandle | null;
  /** Whether content has been modified since last save */
  isDirty: boolean;
  /** Current cursor line (1-based) */
  cursorLine: number;
  /** Current cursor column (1-based) */
  cursorColumn: number;
  /** Current validation errors */
  errors: ValidationError[];
  /** Whether validation is currently running */
  isValidating: boolean;
  /** Current view mode */
  viewMode: ViewMode;
  /** Incremented on LOAD_DOCUMENT to force editor remount */
  documentVersion: number;
  /** Editor font size in pixels */
  editorFontSize: number;
  /** Outline panel font size in pixels */
  outlineFontSize: number;
}
