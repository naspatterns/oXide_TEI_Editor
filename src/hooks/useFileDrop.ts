import { useCallback, useRef, useState } from 'react';
import { useEditor } from '../store/EditorContext';
import { useToast } from '../components/Toast/Toast';
import { isValidXmlFile, getDragData, INTERNAL_DRAG_TYPE } from '../utils/dragDropUtils';

/**
 * Custom hook for file drag-and-drop functionality.
 * Handles both external (OS) and internal (FileExplorer) drops.
 */
export function useFileDrop() {
  const { openFileAsTab } = useEditor();
  const toast = useToast();

  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes(INTERNAL_DRAG_TYPE)) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragOver(false);

    // Internal drag (from FileExplorer)
    const internalDragId = e.dataTransfer.getData(INTERNAL_DRAG_TYPE);
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

    // External drop (from OS)
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

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
  }, [openFileAsTab, toast]);

  // Reset drag state manually (used when CodeMirror intercepts the drop)
  const resetDragState = useCallback(() => {
    dragCounterRef.current = 0;
    setIsDragOver(false);
  }, []);

  return {
    isDragOver,
    resetDragState,
    dragProps: {
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
    },
  };
}
