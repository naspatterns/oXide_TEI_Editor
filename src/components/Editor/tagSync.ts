/**
 * Tag Synchronization Extension for CodeMirror
 *
 * Provides real-time synchronization between opening and closing XML tags:
 * - When opening tag name changes → closing tag updates automatically
 * - When closing tag name changes → opening tag updates automatically
 * - When one tag is deleted → matching tag is also deleted
 *
 * Uses CodeMirror's transaction system for proper Undo/Redo integration.
 */

import { Extension, Annotation, Text } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface TagInfo {
  type: 'opening' | 'closing' | 'self-closing';
  name: string;
  nameStart: number; // Position after < or </
  nameEnd: number; // Position after tag name
  tagStart: number; // Position of <
  tagEnd: number; // Position after >
}

// ═══════════════════════════════════════════════════════════════════════════
// Annotations (for preventing infinite loops)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Annotation to mark transactions that are sync operations.
 * When this annotation is present, the sync listener will not trigger
 * another sync operation, preventing infinite loops.
 */
const syncAnnotation = Annotation.define<boolean>();

// ═══════════════════════════════════════════════════════════════════════════
// Tag Finding Utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Find the tag at the given cursor position.
 *
 * @param doc - CodeMirror Text object
 * @param pos - Cursor position
 * @returns TagInfo if cursor is inside a tag, null otherwise
 */
export function findTagAtPosition(doc: Text, pos: number): TagInfo | null {
  const text = doc.toString();

  // Find the nearest '<' before pos
  let tagStart = -1;
  for (let i = pos - 1; i >= 0; i--) {
    if (text[i] === '<') {
      tagStart = i;
      break;
    }
    // If we hit '>' before '<', cursor is not inside a tag
    if (text[i] === '>') {
      return null;
    }
  }

  if (tagStart === -1) return null;

  // Find the nearest '>' after pos
  let tagEnd = -1;
  for (let i = pos; i < text.length; i++) {
    if (text[i] === '>') {
      tagEnd = i + 1;
      break;
    }
    // If we hit '<' before '>', cursor is not inside a well-formed tag
    if (text[i] === '<') {
      return null;
    }
  }

  if (tagEnd === -1) return null;

  // Extract the tag content
  const tagContent = text.slice(tagStart, tagEnd);

  // Check for comments, CDATA, processing instructions
  if (tagContent.startsWith('<!--') || tagContent.startsWith('<![') || tagContent.startsWith('<?')) {
    return null;
  }

  // Determine tag type
  const isClosing = tagContent.startsWith('</');
  const isSelfClosing = tagContent.endsWith('/>');

  if (isSelfClosing && !isClosing) {
    return {
      type: 'self-closing',
      name: extractTagName(tagContent, false),
      nameStart: tagStart + 1,
      nameEnd: tagStart + 1 + extractTagName(tagContent, false).length,
      tagStart,
      tagEnd,
    };
  }

  if (isClosing) {
    const name = extractTagName(tagContent, true);
    return {
      type: 'closing',
      name,
      nameStart: tagStart + 2, // After </
      nameEnd: tagStart + 2 + name.length,
      tagStart,
      tagEnd,
    };
  }

  const name = extractTagName(tagContent, false);
  return {
    type: 'opening',
    name,
    nameStart: tagStart + 1, // After <
    nameEnd: tagStart + 1 + name.length,
    tagStart,
    tagEnd,
  };
}

/**
 * Extract tag name from tag content string.
 *
 * @param tagContent - The full tag string (e.g., "<div id='x'>", "</div>")
 * @param isClosing - Whether this is a closing tag
 * @returns The tag name
 */
function extractTagName(tagContent: string, isClosing: boolean): string {
  // Remove < or </
  const startOffset = isClosing ? 2 : 1;
  const rest = tagContent.slice(startOffset);

  // Find end of tag name (space, >, /)
  let endIdx = 0;
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '>' || c === '/') {
      break;
    }
    endIdx = i + 1;
  }

  return rest.slice(0, endIdx);
}

/**
 * Find the matching tag for the given tag.
 * For opening tags, finds the corresponding closing tag.
 * For closing tags, finds the corresponding opening tag.
 *
 * @param doc - CodeMirror Text object
 * @param tagInfo - The tag to find match for
 * @returns The matching TagInfo or null if not found
 */
export function findMatchingTag(doc: Text, tagInfo: TagInfo): TagInfo | null {
  if (tagInfo.type === 'self-closing') {
    return null;
  }

  const text = doc.toString();

  if (tagInfo.type === 'opening') {
    return findMatchingClosingTag(text, tagInfo);
  } else {
    return findMatchingOpeningTag(text, tagInfo);
  }
}

/**
 * Find matching closing tag for an opening tag.
 * Handles nested same-name tags by counting depth.
 */
function findMatchingClosingTag(text: string, openingTag: TagInfo): TagInfo | null {
  const targetName = openingTag.name;
  let depth = 1;
  let pos = openingTag.tagEnd;

  while (pos < text.length && depth > 0) {
    // Find next tag
    const nextTagStart = text.indexOf('<', pos);
    if (nextTagStart === -1) break;

    // Find end of this tag
    const nextTagEnd = text.indexOf('>', nextTagStart);
    if (nextTagEnd === -1) break;

    const tagContent = text.slice(nextTagStart, nextTagEnd + 1);

    // Skip comments, CDATA, processing instructions
    if (tagContent.startsWith('<!--') || tagContent.startsWith('<![') || tagContent.startsWith('<?')) {
      pos = nextTagEnd + 1;
      continue;
    }

    const isClosing = tagContent.startsWith('</');
    const isSelfClosing = tagContent.endsWith('/>');
    const name = extractTagName(tagContent, isClosing);

    if (name === targetName) {
      if (isClosing) {
        depth--;
        if (depth === 0) {
          return {
            type: 'closing',
            name,
            nameStart: nextTagStart + 2,
            nameEnd: nextTagStart + 2 + name.length,
            tagStart: nextTagStart,
            tagEnd: nextTagEnd + 1,
          };
        }
      } else if (!isSelfClosing) {
        depth++;
      }
    }

    pos = nextTagEnd + 1;
  }

  return null;
}

/**
 * Find matching opening tag for a closing tag.
 * Scans backward and handles nested same-name tags.
 */
function findMatchingOpeningTag(text: string, closingTag: TagInfo): TagInfo | null {
  const targetName = closingTag.name;
  let depth = 1;
  let pos = closingTag.tagStart - 1;

  while (pos >= 0 && depth > 0) {
    // Find previous tag end
    const prevTagEnd = text.lastIndexOf('>', pos);
    if (prevTagEnd === -1) break;

    // Find the start of this tag
    let prevTagStart = prevTagEnd;
    while (prevTagStart > 0 && text[prevTagStart - 1] !== '<') {
      prevTagStart--;
    }
    if (prevTagStart > 0) prevTagStart--;

    if (text[prevTagStart] !== '<') {
      pos = prevTagStart - 1;
      continue;
    }

    const tagContent = text.slice(prevTagStart, prevTagEnd + 1);

    // Skip comments, CDATA, processing instructions
    if (tagContent.startsWith('<!--') || tagContent.startsWith('<![') || tagContent.startsWith('<?')) {
      pos = prevTagStart - 1;
      continue;
    }

    const isClosing = tagContent.startsWith('</');
    const isSelfClosing = tagContent.endsWith('/>');
    const name = extractTagName(tagContent, isClosing);

    if (name === targetName) {
      if (!isClosing && !isSelfClosing) {
        depth--;
        if (depth === 0) {
          return {
            type: 'opening',
            name,
            nameStart: prevTagStart + 1,
            nameEnd: prevTagStart + 1 + name.length,
            tagStart: prevTagStart,
            tagEnd: prevTagEnd + 1,
          };
        }
      } else if (isClosing) {
        depth++;
      }
    }

    pos = prevTagStart - 1;
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Tag Sync Extension
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create the tag synchronization extension.
 * This extension watches for changes in tag names and synchronizes
 * the matching tag automatically.
 */
export function createTagSyncExtension(): Extension {
  return [
    // Handle document changes - sync tag names
    EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;

      // Skip if this change is a sync operation
      if (update.transactions.some((tr) => tr.annotation(syncAnnotation))) {
        return;
      }

      // Get the cursor position after the change
      const cursorPos = update.state.selection.main.head;

      // Find tag at current cursor position
      const currentTag = findTagAtPosition(update.state.doc, cursorPos);

      if (!currentTag || currentTag.type === 'self-closing') {
        return;
      }

      // Check if we're still editing within a tag name
      if (cursorPos < currentTag.nameStart || cursorPos > currentTag.nameEnd) {
        // Cursor is in attributes or elsewhere, not tag name
        return;
      }

      // Find matching tag in the updated document
      const matchingTag = findMatchingTag(update.state.doc, currentTag);

      if (!matchingTag) {
        return;
      }

      // Check if tag names differ - need to sync
      if (currentTag.name !== matchingTag.name) {
        // Apply the sync change
        update.view.dispatch({
          changes: {
            from: matchingTag.nameStart,
            to: matchingTag.nameEnd,
            insert: currentTag.name,
          },
          annotations: syncAnnotation.of(true),
        });
      }
    }),

    // Handle closing tag "/" deletion - when </tag> becomes <tag>
    EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;

      // Skip sync-triggered changes
      if (update.transactions.some((tr) => tr.annotation(syncAnnotation))) {
        return;
      }

      for (const tr of update.transactions) {
        if (tr.annotation(syncAnnotation)) continue;

        tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
          // Only check pure deletions (no insertion)
          if (inserted.length !== 0) return;

          const deletedText = update.startState.doc.sliceString(fromA, toA);

          // Check if "/" was deleted
          if (deletedText === '/') {
            // Check if this was part of a closing tag "</"
            const charBefore = fromA > 0 ? update.startState.doc.sliceString(fromA - 1, fromA) : '';

            if (charBefore === '<') {
              // "</" became "<" - a closing tag became an opening tag
              // Find what the original closing tag was in the previous state
              const originalClosingTag = findTagAtPosition(update.startState.doc, fromA + 1);

              if (originalClosingTag && originalClosingTag.type === 'closing') {
                // Find the matching opening tag that should be deleted
                const matchingOpening = findMatchingTag(update.startState.doc, originalClosingTag);

                if (matchingOpening) {
                  // Calculate adjusted position after the "/" deletion
                  let adjustedStart = matchingOpening.tagStart;
                  let adjustedEnd = matchingOpening.tagEnd;

                  // If matching opening tag is after the deletion point, adjust
                  if (matchingOpening.tagStart > fromA) {
                    adjustedStart -= 1; // "/" was 1 char
                    adjustedEnd -= 1;
                  }

                  // Delete the matching opening tag
                  update.view.dispatch({
                    changes: {
                      from: adjustedStart,
                      to: adjustedEnd,
                      insert: '',
                    },
                    annotations: syncAnnotation.of(true),
                  });
                }
              }
            }
          }
        });
      }
    }),

    // Handle tag deletion - both complete tag deletion and progressive deletion
    EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;

      // Skip sync-triggered changes
      if (update.transactions.some((tr) => tr.annotation(syncAnnotation))) {
        return;
      }

      // Check each transaction for deletions
      for (const tr of update.transactions) {
        if (tr.annotation(syncAnnotation)) continue;

        // Collect all deletions in this transaction
        const deletions: Array<{ fromA: number; toA: number }> = [];
        tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
          // Only check pure deletions (no insertion)
          if (inserted.length === 0) {
            deletions.push({ fromA, toA });
          }
        });

        // Process each deletion
        for (const { fromA, toA } of deletions) {
          // Check if the deleted range is a complete tag
          const deletedText = update.startState.doc.sliceString(fromA, toA);

          // Look for a complete tag in the deleted text
          const tagMatch = deletedText.match(/^<\/?([a-zA-Z_][\w.:_-]*)(?:\s[^>]*)?\s*\/?>$/);
          if (!tagMatch) continue;

          // Parse the deleted tag
          const isClosing = deletedText.startsWith('</');
          const isSelfClosing = deletedText.endsWith('/>');

          if (isSelfClosing && !isClosing) continue; // Self-closing tags don't have matches

          const name = tagMatch[1];
          const deletedTag: TagInfo = {
            type: isClosing ? 'closing' : 'opening',
            name,
            nameStart: fromA + (isClosing ? 2 : 1),
            nameEnd: fromA + (isClosing ? 2 : 1) + name.length,
            tagStart: fromA,
            tagEnd: toA,
          };

          // Find the matching tag in the ORIGINAL document (before deletion)
          const matchingTag = findMatchingTag(update.startState.doc, deletedTag);
          if (!matchingTag) continue;

          // Calculate the new position of the matching tag after the first deletion
          const deleteOffset = deletedTag.tagEnd - deletedTag.tagStart;
          let adjustedStart = matchingTag.tagStart;
          let adjustedEnd = matchingTag.tagEnd;

          // If matching tag is after the deleted tag, adjust positions
          if (matchingTag.tagStart > deletedTag.tagStart) {
            adjustedStart -= deleteOffset;
            adjustedEnd -= deleteOffset;
          }

          // Dispatch deletion of matching tag
          update.view.dispatch({
            changes: {
              from: adjustedStart,
              to: adjustedEnd,
              insert: '',
            },
            annotations: syncAnnotation.of(true),
          });
        }
      }
    }),

    // Handle progressive tag deletion - when a tag is deleted character by character
    // Detect when a tag that existed before no longer exists after the edit
    EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;

      // Skip sync-triggered changes
      if (update.transactions.some((tr) => tr.annotation(syncAnnotation))) {
        return;
      }

      for (const tr of update.transactions) {
        if (tr.annotation(syncAnnotation)) continue;

        tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
          // Check if this is a deletion (can also be deletion + insertion)
          if (toA <= fromA) return;

          // Check if there was a tag at the deletion position in the original document
          const originalTag = findTagAtPosition(update.startState.doc, fromA + 1);
          if (!originalTag) return;

          // Check if the tag still exists in the new document
          // Need to adjust position based on change
          const insertedLength = inserted.length;
          const deletedLength = toA - fromA;
          const adjustment = insertedLength - deletedLength;

          // Calculate where the tag would be in the new document
          let newPos = fromA;
          if (originalTag.tagStart < fromA) {
            // Tag started before deletion point
            newPos = originalTag.tagStart + 1;
          } else {
            // Tag started at or after deletion point
            newPos = Math.max(0, originalTag.tagStart + adjustment + 1);
          }

          // Check if a complete tag exists at the new position
          const newTag = findTagAtPosition(update.state.doc, Math.min(newPos, update.state.doc.length));

          // If no tag exists where there was one before, and the original tag had a match,
          // we should delete the orphaned matching tag
          if (!newTag || (newTag.type !== originalTag.type) || (newTag.name !== originalTag.name)) {
            // The tag was destroyed - check if we need to clean up the matching tag
            // But only if the original tag was complete (had a name)
            if (originalTag.name && (originalTag.type === 'opening' || originalTag.type === 'closing')) {
              const matchingTag = findMatchingTag(update.startState.doc, originalTag);

              if (matchingTag) {
                // Calculate adjusted position in the new document
                let adjustedStart = matchingTag.tagStart;
                let adjustedEnd = matchingTag.tagEnd;

                if (matchingTag.tagStart > fromA) {
                  adjustedStart += adjustment;
                  adjustedEnd += adjustment;
                }

                // Verify the matching tag still exists at the adjusted position
                const stillExists = findTagAtPosition(update.state.doc, adjustedStart + 1);
                if (stillExists &&
                    stillExists.name === matchingTag.name &&
                    stillExists.type === matchingTag.type) {
                  // Delete the orphaned matching tag
                  update.view.dispatch({
                    changes: {
                      from: adjustedStart,
                      to: adjustedEnd,
                      insert: '',
                    },
                    annotations: syncAnnotation.of(true),
                  });
                }
              }
            }
          }
        });
      }
    }),
  ];
}

/**
 * Check if a change is within a tag name region.
 * Used to determine if sync should be triggered.
 */
export function isChangeInTagName(
  doc: Text,
  changeFrom: number,
  changeTo: number
): boolean {
  // Find tag at change position
  const tag = findTagAtPosition(doc, changeFrom);
  if (!tag || tag.type === 'self-closing') return false;

  // Check if change overlaps with tag name region
  return changeFrom >= tag.nameStart && changeTo <= tag.nameEnd;
}
