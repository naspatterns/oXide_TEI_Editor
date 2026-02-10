import type { CompletionContext, CompletionResult, Completion } from '@codemirror/autocomplete';
import { snippetCompletion } from '@codemirror/autocomplete';
import type { SchemaInfo, ElementSpec } from '../../types/schema';

/**
 * Creates a CodeMirror completion source with context-aware TEI suggestions.
 *
 * The completion uses a two-phase approach:
 * 1. Parse the document up to the cursor to determine the element context stack
 * 2. Look up the current parent element's allowed children/attributes in the schema
 *
 * This gives contextually valid completions — e.g., inside <teiHeader>,
 * only header-valid elements are suggested, not <p> or <lg>.
 */
export function createSchemaCompletionSource(schema: SchemaInfo | null) {
  return function teiCompletionSource(context: CompletionContext): CompletionResult | null {
    if (!schema) return null;

    const { state, pos } = context;
    const textBefore = state.doc.sliceString(Math.max(0, pos - 2000), pos);

    // Parse element stack up to cursor for context awareness
    const elementStack = getElementStack(textBefore);
    const parentName = elementStack.length > 0 ? elementStack[elementStack.length - 1] : null;
    const parentSpec = parentName ? schema.elementMap.get(parentName) : null;

    // Check if we're typing an element name after '<'
    const elementMatch = textBefore.match(/<([a-zA-Z_][\w.:_-]*)$/);
    if (elementMatch) {
      return completeElementName(schema, elementMatch[1], pos - elementMatch[1].length, parentSpec);
    }

    // Check if we just typed '<'
    if (textBefore.endsWith('<') && !textBefore.endsWith('</')) {
      return completeElementName(schema, '', pos, parentSpec);
    }

    // Check if we're typing an attribute value (after ="") — check before attribute name
    const valueMatch = textBefore.match(/<([a-zA-Z_][\w.:_-]*)\s[^>]*?([a-zA-Z_][\w.:_-]*)="([^"]*)$/);
    if (valueMatch) {
      return completeAttributeValue(schema, valueMatch[1], valueMatch[2], valueMatch[3], pos - valueMatch[3].length);
    }

    // Check if we're in an attribute context (inside an opening tag, after space)
    const attrMatch = textBefore.match(/<([a-zA-Z_][\w.:_-]*)\s[^>]*?([a-zA-Z_][\w.:_-]*)$/);
    if (attrMatch) {
      const usedAttrs = getUsedAttributes(textBefore);
      return completeAttributeName(schema, attrMatch[1], attrMatch[2], pos - attrMatch[2].length, usedAttrs);
    }

    // Check if we just typed space inside a tag (first space or after attribute)
    const spaceInTagMatch = textBefore.match(/<([a-zA-Z_][\w.:_-]*)(?:\s[^>]*)?\s$/);
    if (spaceInTagMatch && !textBefore.match(/=\s*$/)) {
      // Don't trigger if we're right after '=' (waiting for value)
      const usedAttrs = getUsedAttributes(textBefore);
      return completeAttributeName(schema, spaceInTagMatch[1], '', pos, usedAttrs);
    }

    // Check if we're typing a closing tag after '</'
    const closingMatch = textBefore.match(/<\/([a-zA-Z_][\w.:_-]*)$/);
    if (closingMatch) {
      return completeClosingTag(closingMatch[1], pos - closingMatch[1].length, elementStack);
    }

    if (textBefore.endsWith('</')) {
      return completeClosingTag('', pos, elementStack);
    }

    return null;
  };
}

/**
 * Extract attribute names already used in the current opening tag.
 */
function getUsedAttributes(text: string): Set<string> {
  const used = new Set<string>();
  // Find the last opening tag that's not closed
  const tagMatch = text.match(/<([a-zA-Z_][\w.:_-]*)(\s[^>]*)?$/);
  if (tagMatch && tagMatch[2]) {
    const attrString = tagMatch[2];
    const attrRegex = /([a-zA-Z_][\w.:_-]*)\s*=/g;
    let m: RegExpExecArray | null;
    while ((m = attrRegex.exec(attrString)) !== null) {
      used.add(m[1]);
    }
  }
  return used;
}

/**
 * Parse element stack from XML text, tracking open/close tags.
 * Returns the stack of currently open element names from root to cursor.
 */
function getElementStack(text: string): string[] {
  const stack: string[] = [];
  const tagRegex = /<\/?([a-zA-Z_][\w.:_-]*)(?:\s[^>]*)?\s*\/?>/g;
  let m: RegExpExecArray | null;

  while ((m = tagRegex.exec(text)) !== null) {
    const fullTag = m[0];
    const tagName = m[1];

    if (fullTag.startsWith('<?')) continue; // Processing instruction
    if (fullTag.startsWith('<!')) continue; // Comments/CDATA

    if (fullTag.startsWith('</')) {
      // Closing tag — pop matching element
      const idx = stack.lastIndexOf(tagName);
      if (idx !== -1) stack.splice(idx, 1);
    } else if (!fullTag.endsWith('/>')) {
      // Opening tag (not self-closing)
      stack.push(tagName);
    }
  }

  return stack;
}

/** Create a snippet completion for an element with cursor between tags */
function makeElementCompletion(el: ElementSpec, boost: number): Completion {
  // Check if this is an empty element (no children defined = self-closing)
  const isEmpty = !el.children || el.children.length === 0;

  // Find required attributes
  const requiredAttrs = el.attributes?.filter(a => a.required) ?? [];

  // Build attribute snippet part with tab stops
  // Each required attr gets a tab stop: attr1="${1}" attr2="${2}" ...
  let attrSnippet = '';
  let tabIndex = 1;
  for (const attr of requiredAttrs) {
    attrSnippet += ` ${attr.name}="\${${tabIndex}}"`;
    tabIndex++;
  }

  // The final cursor position (content area or after tag)
  const contentTabStop = `\${${tabIndex}}`;

  if (isEmpty) {
    // Self-closing tag: <tagName attr=""/>
    return snippetCompletion(`${el.name}${attrSnippet}/>`, {
      label: el.name,
      type: 'type',
      detail: el.documentation?.substring(0, 60),
      boost,
    });
  }

  // Regular tag with content: <tagName attr="">$0</tagName>
  return snippetCompletion(`${el.name}${attrSnippet}>${contentTabStop}</${el.name}>`, {
    label: el.name,
    type: 'type',
    detail: el.documentation?.substring(0, 60),
    boost,
  });
}

function completeElementName(
  schema: SchemaInfo,
  partial: string,
  from: number,
  parentSpec: ElementSpec | null | undefined,
): CompletionResult {
  // Use context-aware filtering: only suggest children valid in the parent
  if (parentSpec?.children && parentSpec.children.length > 0) {
    const allowedSet = new Set(parentSpec.children);
    // Show allowed children first, then all elements as a fallback
    const allowed = schema.elements.filter((el) => allowedSet.has(el.name));
    const others = schema.elements.filter((el) => !allowedSet.has(el.name));

    const options: Completion[] = [
      ...allowed
        .filter((el) => el.name.toLowerCase().startsWith(partial.toLowerCase()))
        .map((el) => makeElementCompletion(el, getElementBoost(el.name) + 100)),
      ...others
        .filter((el) => el.name.toLowerCase().startsWith(partial.toLowerCase()))
        .map((el) => makeElementCompletion(el, getElementBoost(el.name) - 50)),
    ];

    return { from, options, validFor: /^[a-zA-Z_][\w.:_-]*$/ };
  }

  // No parent context — show all elements
  const options: Completion[] = schema.elements
    .filter((el) => el.name.toLowerCase().startsWith(partial.toLowerCase()))
    .map((el) => makeElementCompletion(el, getElementBoost(el.name)));

  return { from, options, validFor: /^[a-zA-Z_][\w.:_-]*$/ };
}

function completeAttributeName(
  schema: SchemaInfo,
  elementName: string,
  partial: string,
  from: number,
  usedAttrs: Set<string> = new Set(),
): CompletionResult {
  const elSpec = schema.elementMap.get(elementName);
  const attrs = elSpec?.attributes ?? [];

  // Use snippetCompletion to place cursor inside quotes
  // Filter out already used attributes
  const options: Completion[] = attrs
    .filter((a) => !usedAttrs.has(a.name))
    .filter((a) => a.name.toLowerCase().startsWith(partial.toLowerCase()))
    .map((a) => snippetCompletion(`${a.name}="\${1}"`, {
      label: a.name,
      type: 'property',
      detail: a.required ? '(required) ' + (a.documentation?.substring(0, 40) ?? '') : a.documentation?.substring(0, 60),
      boost: a.required ? 10 : 0,
    }));

  // validFor must allow empty string (when cursor is right after space)
  // Using /^[\w.:_-]*$/ allows zero or more word characters
  return { from, options, validFor: /^[\w.:_-]*$/ };
}

function completeAttributeValue(
  schema: SchemaInfo,
  elementName: string,
  attrName: string,
  partial: string,
  from: number,
): CompletionResult | null {
  const elSpec = schema.elementMap.get(elementName);
  const attrSpec = elSpec?.attributes?.find((a) => a.name === attrName);
  if (!attrSpec?.values) return null;

  const options: Completion[] = attrSpec.values
    .filter((v) => v.toLowerCase().startsWith(partial.toLowerCase()))
    .map((v) => ({
      label: v,
      type: 'enum' as const,
    }));

  return { from, options, validFor: /^[a-zA-Z_][\w.:_-]*$/ };
}

function completeClosingTag(
  partial: string,
  from: number,
  elementStack: string[],
): CompletionResult {
  const options: Completion[] = [];

  // Suggest open tags in reverse order (most recent first)
  const reversed = [...elementStack].reverse();
  for (let i = 0; i < reversed.length; i++) {
    const name = reversed[i];
    if (name.toLowerCase().startsWith(partial.toLowerCase())) {
      options.push({
        label: name,
        type: 'type' as const,
        detail: 'Close tag',
        boost: 100 - i, // Most recent open tag gets highest boost
        apply: `${name}>`,
      });
    }
  }

  return { from, options, validFor: /^[a-zA-Z_][\w.:_-]*$/ };
}

/** Boost common structural elements to top of list */
function getElementBoost(name: string): number {
  const boosts: Record<string, number> = {
    p: 50, div: 45, head: 40, hi: 35, note: 30,
    persName: 28, placeName: 26, date: 24, ref: 22,
    l: 20, lg: 18, sp: 16, speaker: 14,
    list: 12, item: 10, table: 8, row: 6, cell: 4,
  };
  return boosts[name] ?? 0;
}
