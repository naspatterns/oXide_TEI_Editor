import { useCallback } from 'react';
import { useEditor } from '../store/useEditor';
import { useSchema } from '../store/useSchema';
import { getRequiredAttributes } from '../schema/schemaQuery';

/**
 * "Wrap selection in <tagName>...</tagName>" operation.
 *
 * Lives in a hook (rather than on EditorContext) because it joins two
 * independent contexts: the active CodeMirror view (from EditorContext)
 * and the schema (from SchemaContext) used to seed required attributes.
 *
 * Keeping the join here means EditorProvider does not need to import
 * SchemaContext, so the two providers remain independently testable.
 */
export function useWrapSelection(): (tagName: string) => void {
  const { editorViewRef } = useEditor();
  const { schema } = useSchema();

  return useCallback(
    (tagName: string) => {
      const view = editorViewRef.current;
      if (!view) return;

      const { from, to } = view.state.selection.main;
      const selectedText = view.state.doc.sliceString(from, to);

      // Find required attributes from the schema so that wrapping with an
      // element like <date when=""> places the cursor inside the first
      // required attribute rather than on the wrapped text.
      const requiredAttrs = getRequiredAttributes(schema, tagName);

      let openTag = `<${tagName}`;
      let firstAttrValuePos = -1;
      for (let i = 0; i < requiredAttrs.length; i++) {
        const attr = requiredAttrs[i];
        openTag += ` ${attr.name}=""`;
        if (i === 0) {
          // Position is: from + '<tagName '.length + 'attrName="'.length
          firstAttrValuePos = from + tagName.length + 2 + attr.name.length + 2;
        }
      }
      openTag += '>';

      const closeTag = `</${tagName}>`;
      const wrappedText = `${openTag}${selectedText}${closeTag}`;

      if (firstAttrValuePos > 0) {
        view.dispatch({
          changes: { from, to, insert: wrappedText },
          selection: { anchor: firstAttrValuePos },
        });
      } else {
        view.dispatch({
          changes: { from, to, insert: wrappedText },
          selection: {
            anchor: from + openTag.length,
            head: from + openTag.length + selectedText.length,
          },
        });
      }

      view.focus();
    },
    [editorViewRef, schema],
  );
}
