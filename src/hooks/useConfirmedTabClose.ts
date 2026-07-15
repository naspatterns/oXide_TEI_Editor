import { useCallback, useState } from 'react';
import { useEditor } from '../store/useEditor';

export interface PendingTabClose {
  id: string;
  fileName: string;
}

/**
 * Tab closing with a dirty-document guard.
 *
 * Every close entry point (tab-bar ×, File → Close Tab, Ctrl+W, command
 * palette) must go through `requestClose` so unsaved work is never discarded
 * without confirmation. The caller renders a ConfirmDialog driven by
 * `pending` and wires it to `confirm` / `cancel`.
 */
export function useConfirmedTabClose() {
  const { closeTab, getDocument } = useEditor();
  const [pending, setPending] = useState<PendingTabClose | null>(null);

  const requestClose = useCallback(
    (id: string) => {
      const doc = getDocument(id);
      if (!doc) return;
      if (doc.isDirty) {
        setPending({ id, fileName: doc.fileName });
      } else {
        closeTab(id);
      }
    },
    [closeTab, getDocument],
  );

  const confirm = useCallback(() => {
    setPending(current => {
      if (current) closeTab(current.id);
      return null;
    });
  }, [closeTab]);

  const cancel = useCallback(() => setPending(null), []);

  return { pending, requestClose, confirm, cancel };
}
