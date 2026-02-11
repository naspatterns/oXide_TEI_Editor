import { createContext, useContext, useReducer, useCallback, type ReactNode } from 'react';
import type { FileTreeNode, WorkspaceState } from '../types/workspace';
import { openDirectory, buildFileTree, supportsDirectoryPicker } from '../file/fileSystemAccess';

/**
 * Actions for workspace state management.
 */
type WorkspaceAction =
  | { type: 'SET_ROOT'; handle: FileSystemDirectoryHandle; name: string }
  | { type: 'SET_FILE_TREE'; fileTree: FileTreeNode[] }
  | { type: 'SET_LOADING'; isLoading: boolean }
  | { type: 'CLOSE_WORKSPACE' }
  | { type: 'TOGGLE_DIRECTORY'; path: string };

function reducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'SET_ROOT':
      return {
        ...state,
        rootHandle: action.handle,
        rootName: action.name,
        isLoading: true,
      };

    case 'SET_FILE_TREE':
      return {
        ...state,
        fileTree: action.fileTree,
        isLoading: false,
      };

    case 'SET_LOADING':
      return { ...state, isLoading: action.isLoading };

    case 'CLOSE_WORKSPACE':
      return {
        rootHandle: null,
        rootName: null,
        fileTree: [],
        isLoading: false,
      };

    case 'TOGGLE_DIRECTORY': {
      // Recursively find and toggle the directory
      const toggleDir = (nodes: FileTreeNode[]): FileTreeNode[] =>
        nodes.map(node => {
          if (node.path === action.path && node.type === 'directory') {
            return { ...node, isExpanded: !node.isExpanded };
          }
          if (node.children) {
            return { ...node, children: toggleDir(node.children) };
          }
          return node;
        });

      return { ...state, fileTree: toggleDir(state.fileTree) };
    }

    default:
      return state;
  }
}

const initialState: WorkspaceState = {
  rootHandle: null,
  rootName: null,
  fileTree: [],
  isLoading: false,
};

interface WorkspaceContextValue {
  state: WorkspaceState;
  /** Whether directory picker is supported in this browser */
  isSupported: boolean;
  /** Open a folder as workspace */
  openWorkspace: () => Promise<void>;
  /** Close the current workspace */
  closeWorkspace: () => void;
  /** Refresh the file tree (re-scan directory) */
  refreshFileTree: () => Promise<void>;
  /** Toggle directory expanded/collapsed state */
  toggleDirectory: (path: string) => void;
  /** Find a file node by path */
  findFileNode: (path: string) => FileTreeNode | null;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const isSupported = supportsDirectoryPicker();

  const openWorkspace = useCallback(async () => {
    try {
      const { handle, name } = await openDirectory();
      dispatch({ type: 'SET_ROOT', handle, name });

      // Build file tree
      const fileTree = await buildFileTree(handle);
      dispatch({ type: 'SET_FILE_TREE', fileTree });
    } catch (error) {
      // User cancelled or permission denied
      console.warn('Failed to open workspace:', error);
      dispatch({ type: 'SET_LOADING', isLoading: false });
    }
  }, []);

  const closeWorkspace = useCallback(() => {
    dispatch({ type: 'CLOSE_WORKSPACE' });
  }, []);

  const refreshFileTree = useCallback(async () => {
    if (!state.rootHandle) return;

    dispatch({ type: 'SET_LOADING', isLoading: true });
    try {
      const fileTree = await buildFileTree(state.rootHandle);
      dispatch({ type: 'SET_FILE_TREE', fileTree });
    } catch (error) {
      console.warn('Failed to refresh file tree:', error);
      dispatch({ type: 'SET_LOADING', isLoading: false });
    }
  }, [state.rootHandle]);

  const toggleDirectory = useCallback((path: string) => {
    dispatch({ type: 'TOGGLE_DIRECTORY', path });
  }, []);

  const findFileNode = useCallback(
    (path: string): FileTreeNode | null => {
      const searchInNodes = (nodes: FileTreeNode[]): FileTreeNode | null => {
        for (const node of nodes) {
          if (node.path === path) return node;
          if (node.children) {
            const found = searchInNodes(node.children);
            if (found) return found;
          }
        }
        return null;
      };
      return searchInNodes(state.fileTree);
    },
    [state.fileTree],
  );

  return (
    <WorkspaceContext.Provider
      value={{
        state,
        isSupported,
        openWorkspace,
        closeWorkspace,
        refreshFileTree,
        toggleDirectory,
        findFileNode,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
