/**
 * Types for multi-document workspace support (VS Code-style).
 */

import type { ValidationError } from './schema';

/**
 * Represents a single open document (tab) in the editor.
 * Each document maintains its own independent state.
 */
export interface OpenDocument {
  /** Unique identifier for this document instance */
  id: string;
  /** Display name (file name without path) */
  fileName: string;
  /** Full path within workspace (null for standalone files) */
  filePath: string | null;
  /** File handle for File System Access API (null for legacy/unsaved) */
  fileHandle: FileSystemFileHandle | null;
  /** Document content */
  content: string;
  /** Whether content has been modified since last save */
  isDirty: boolean;
  /** Current cursor line (1-based) */
  cursorLine: number;
  /** Current cursor column (1-based) */
  cursorColumn: number;
  /** Validation errors for this document */
  errors: ValidationError[];
  /** Whether validation is currently running */
  isValidating: boolean;
  /** Incremented on content reload to force editor remount */
  documentVersion: number;
  /** Scroll position (top line) for state restoration */
  scrollTop?: number;
}

/**
 * Represents a node in the file explorer tree.
 * Supports both files and directories recursively.
 */
export interface FileTreeNode {
  /** File or folder name */
  name: string;
  /** Full path relative to workspace root */
  path: string;
  /** Node type - determines icon and behavior */
  type: 'file' | 'directory';
  /** File System Access handle for file operations */
  handle: FileSystemHandle;
  /** Child nodes (only for directories) */
  children?: FileTreeNode[];
  /** Whether directory is expanded in UI */
  isExpanded?: boolean;
}

/**
 * Workspace state for folder-based editing.
 */
export interface WorkspaceState {
  /** Root directory handle (null when no folder is open) */
  rootHandle: FileSystemDirectoryHandle | null;
  /** Root folder name for display */
  rootName: string | null;
  /** File tree structure */
  fileTree: FileTreeNode[];
  /** Whether file tree is being loaded */
  isLoading: boolean;
}

/**
 * Multi-tab editor state.
 * Extends single-document EditorState to support multiple documents.
 */
export interface MultiTabEditorState {
  /** All currently open documents */
  openDocuments: OpenDocument[];
  /** ID of the currently active document (shown in editor) */
  activeDocumentId: string | null;
  /** Order of document IDs for tab bar */
  tabOrder: string[];
  /** Global editor font size (shared across all tabs) */
  editorFontSize: number;
  /** Global outline font size */
  outlineFontSize: number;
  /** Current view mode */
  viewMode: 'split' | 'editor' | 'preview';
}

/**
 * Generate a unique document ID.
 * Uses timestamp + random suffix for uniqueness.
 */
export function generateDocumentId(): string {
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a new empty document with default values.
 */
export function createNewDocument(
  fileName: string = 'Untitled.xml',
  content: string = '',
): OpenDocument {
  return {
    id: generateDocumentId(),
    fileName,
    filePath: null,
    fileHandle: null,
    content,
    isDirty: false,
    cursorLine: 1,
    cursorColumn: 1,
    errors: [],
    isValidating: false,
    documentVersion: 0,
  };
}
