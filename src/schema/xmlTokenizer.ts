/**
 * Tag-level XML tokenizer.
 *
 * A lightweight, lazy tokenizer that scans XML text for tag-shaped tokens
 * (open / close / self-close / processing instruction / comment / CDATA) and
 * yields position information. Designed for the editor's outline tree and
 * completion-context computations, both of which need to walk tags but do
 * NOT require a full DOM or strict well-formedness validation.
 *
 * Notes:
 * - Returns offsets, line, column (1-based for line/column).
 * - Skips contents of comments and CDATA sections so that tag-shaped text
 *   inside them is not misinterpreted.
 * - For schema-aware error reporting, see `xmlValidator.ts`. This module is
 *   intentionally separate because the validator's well-formedness path has
 *   its own multi-byte and column-recovery quirks that are heavily tested.
 */

/** Kind of XML tag-level token. */
export type XmlTagKind = 'open' | 'close' | 'self-close' | 'pi' | 'comment' | 'cdata';

/** A single tag-level token from the source. */
export interface XmlTagToken {
  kind: XmlTagKind;
  /** Tag name. Empty string for `pi`/`comment`/`cdata`. */
  name: string;
  /** Raw attribute text (between name and `>`/`/>`). Empty for non-element tokens. */
  attributesText: string;
  /** 0-based offset of the opening `<`. */
  offset: number;
  /** Length of the entire token including `<` and `>`. */
  length: number;
  /** 1-based line of the opening `<`. */
  line: number;
  /** 1-based column of the opening `<`. */
  column: number;
}

const NAME_START = 'a-zA-Z_\\u00C0-\\uFFFD';
// NameChar adds '-', '.', digits, ':', and the extender U+00B7. U+00B7 is the
// one NameChar below the broad U+00C0-U+FFFD range NAME_START already covers;
// without it the tokenizer's parsed name would differ from the DOM's localName
// for a name containing U+00B7, desyncing line attribution.
const NAME_BODY = `${NAME_START}0-9.:\\u00B7-`;
const TAG_NAME_REGEX = new RegExp(`[${NAME_START}][${NAME_BODY}]*`);

/**
 * Tokenize tag-level structure of an XML document.
 *
 * Walks the source once, emitting a token for every `<...>` construct. Text
 * between tags is ignored. Returns a generator so callers can short-circuit.
 */
export function* tokenizeXmlTags(xml: string): Generator<XmlTagToken> {
  const len = xml.length;
  let i = 0;
  let line = 1;
  let lineStart = 0;

  while (i < len) {
    const ch = xml.charCodeAt(i);

    // Track newlines outside of tag bodies. Inside a tag body, line tracking
    // is handled by the consumer if needed (we record start position only).
    if (ch === 10 /* \n */) {
      line++;
      lineStart = i + 1;
      i++;
      continue;
    }

    if (ch !== 60 /* < */) {
      i++;
      continue;
    }

    const startOffset = i;
    const startLine = line;
    const startColumn = startOffset - lineStart + 1;

    // Comment: <!-- ... -->
    if (xml.startsWith('<!--', i)) {
      const end = xml.indexOf('-->', i + 4);
      const closeAt = end === -1 ? len : end + 3;
      yield {
        kind: 'comment',
        name: '',
        attributesText: '',
        offset: startOffset,
        length: closeAt - startOffset,
        line: startLine,
        column: startColumn,
      };
      // Advance line counter through the comment body.
      for (let j = i; j < closeAt; j++) {
        if (xml.charCodeAt(j) === 10) {
          line++;
          lineStart = j + 1;
        }
      }
      i = closeAt;
      continue;
    }

    // CDATA: <![CDATA[ ... ]]>
    if (xml.startsWith('<![CDATA[', i)) {
      const end = xml.indexOf(']]>', i + 9);
      const closeAt = end === -1 ? len : end + 3;
      yield {
        kind: 'cdata',
        name: '',
        attributesText: '',
        offset: startOffset,
        length: closeAt - startOffset,
        line: startLine,
        column: startColumn,
      };
      for (let j = i; j < closeAt; j++) {
        if (xml.charCodeAt(j) === 10) {
          line++;
          lineStart = j + 1;
        }
      }
      i = closeAt;
      continue;
    }

    // Processing instruction: <? ... ?>
    if (xml.charCodeAt(i + 1) === 63 /* ? */) {
      const end = xml.indexOf('?>', i + 2);
      const closeAt = end === -1 ? len : end + 2;
      yield {
        kind: 'pi',
        name: '',
        attributesText: '',
        offset: startOffset,
        length: closeAt - startOffset,
        line: startLine,
        column: startColumn,
      };
      for (let j = i; j < closeAt; j++) {
        if (xml.charCodeAt(j) === 10) {
          line++;
          lineStart = j + 1;
        }
      }
      i = closeAt;
      continue;
    }

    // Markup declaration: <!DOCTYPE ...>, and its internal-subset <!ENTITY>/
    // <!ELEMENT>/... (<!-- and <![CDATA[ were handled above). Skip the WHOLE
    // declaration as a unit — XML lets an entity replacement value legally
    // contain '<'/'>' (e.g. <!ENTITY g "<pb/>">), so char-by-char scanning
    // would tokenize that as a phantom element and desync line attribution
    // (audit adversarial-review finding). Scan to the closing '>' that is
    // outside any quoted literal AND outside the internal subset '[ ... ]'.
    if (xml.charCodeAt(i + 1) === 33 /* ! */) {
      let j = i + 2;
      let depth = 0;
      let q: 0 | 34 | 39 = 0;
      while (j < len) {
        const c = xml.charCodeAt(j);
        if (c === 10) {
          line++;
          lineStart = j + 1;
        }
        if (q) {
          if (c === q) q = 0;
        } else if (c === 34 /* " */ || c === 39 /* ' */) {
          q = c;
        } else if (c === 91 /* [ */) {
          depth++;
        } else if (c === 93 /* ] */) {
          if (depth > 0) depth--;
        } else if (c === 62 /* > */ && depth === 0) {
          break;
        }
        j++;
      }
      i = j < len ? j + 1 : len;
      continue;
    }

    // Closing tag: </name>
    const isClosing = xml.charCodeAt(i + 1) === 47; /* / */
    const nameStart = isClosing ? i + 2 : i + 1;
    const remaining = xml.slice(nameStart);
    const nameMatch = remaining.match(TAG_NAME_REGEX);
    const name = nameMatch && nameMatch.index === 0 ? nameMatch[0] : '';

    if (!name) {
      // Bare `<` not followed by a valid name — skip past it. Validation of
      // this case lives in xmlValidator, not here.
      i++;
      continue;
    }

    // Find the matching `>` while respecting quoted attribute values so that
    // `>` inside an attribute does not terminate the tag prematurely.
    let j = nameStart + name.length;
    let inQuote: 0 | 34 | 39 = 0;
    while (j < len) {
      const c = xml.charCodeAt(j);
      if (inQuote) {
        if (c === inQuote) inQuote = 0;
      } else if (c === 34 /* " */ || c === 39 /* ' */) {
        inQuote = c;
      } else if (c === 62 /* > */) {
        break;
      }
      if (c === 10) {
        line++;
        lineStart = j + 1;
      }
      j++;
    }

    if (j >= len) {
      // Unterminated tag. Emit nothing and bail.
      return;
    }

    const isSelfClose = !isClosing && xml.charCodeAt(j - 1) === 47; /* / */
    const attrEnd = isSelfClose ? j - 1 : j;
    const attributesText = xml.slice(nameStart + name.length, attrEnd).trim();

    yield {
      kind: isClosing ? 'close' : isSelfClose ? 'self-close' : 'open',
      name,
      attributesText,
      offset: startOffset,
      length: j + 1 - startOffset,
      line: startLine,
      column: startColumn,
    };

    i = j + 1;
  }
}

/**
 * Convenience: collect tokens into an array. Use sparingly — prefer the
 * generator for streaming consumers.
 */
export function tokenizeXmlTagsToArray(xml: string): XmlTagToken[] {
  return Array.from(tokenizeXmlTags(xml));
}

/**
 * Compute the open-element stack at the given offset using only well-nested
 * matches. Mismatched closing tags do not pop the stack (this matches the
 * editor's "be tolerant for autocomplete" behavior).
 *
 * Used by the completion source to determine the parent element at the cursor.
 */
export function getOpenElementStack(xml: string, offset: number = xml.length): string[] {
  const stack: string[] = [];
  for (const tok of tokenizeXmlTags(xml)) {
    if (tok.offset >= offset) break;
    if (tok.kind === 'open') {
      stack.push(tok.name);
    } else if (tok.kind === 'close') {
      // Only pop if the top matches; otherwise leave stack intact so that
      // completions in malformed regions still see a sensible parent.
      if (stack[stack.length - 1] === tok.name) {
        stack.pop();
      }
    }
  }
  return stack;
}

/**
 * One open element on the cursor's ancestor chain, together with the child
 * elements seen so far inside THIS instance (not other same-named elements).
 */
export interface OpenElementFrame {
  name: string;
  children: string[];
}

/**
 * Like {@link getOpenElementStack}, but each frame also records the child
 * elements encountered so far inside that specific open instance. The
 * completion source uses the top frame to know both the parent element at
 * the cursor AND which required children are already present — computed in
 * a single pass over the document.
 */
export function getOpenElementStackWithChildren(xml: string, offset: number = xml.length): OpenElementFrame[] {
  const stack: OpenElementFrame[] = [];
  for (const tok of tokenizeXmlTags(xml)) {
    if (tok.offset >= offset) break;
    if (tok.kind === 'pi' || tok.kind === 'comment' || tok.kind === 'cdata') continue;

    if (tok.kind === 'close') {
      // Only pop if the top matches; otherwise leave stack intact so that
      // completions in malformed regions still see a sensible parent.
      if (stack[stack.length - 1]?.name === tok.name) {
        stack.pop();
      }
    } else if (tok.kind === 'open') {
      if (stack.length > 0) {
        stack[stack.length - 1].children.push(tok.name);
      }
      stack.push({ name: tok.name, children: [] });
    } else {
      // self-close: a child of the current parent, never enters the stack
      if (stack.length > 0) {
        stack[stack.length - 1].children.push(tok.name);
      }
    }
  }
  return stack;
}

/**
 * Build a node→line resolver: for each element of a parsed document, the
 * 1-based line of its opening `<` in the raw source `xml`.
 *
 * A single tokenizer pass — which skips comments/CDATA and spans multi-line
 * tags — yields, per local name, the source line of every element in document
 * order. The DOM gives each element its document-order occurrence index among
 * same-local-name elements. Indexing one by the other resolves ANY element
 * directly, so it is correct for a filtered/subset match set (not just "the
 * nth `<tag>` in the file") and robust where a naive per-line `<tag` regex
 * under/over-counted (multi-line tags, tag-shaped text inside comments/CDATA).
 * Returns 1 when a line can't be resolved.
 *
 * Shared by the XPath toolbar search and the Schematron layer so their line
 * attribution cannot drift apart.
 */
export function createElementLineResolver(
  xml: string,
  doc: Document,
): (el: Element) => number {
  // occ: element → its 0-based index among same-local-name elements (doc order)
  const occ = new Map<Element, number>();
  const counters = new Map<string, number>();
  for (const el of Array.from(doc.getElementsByTagName('*'))) {
    const n = counters.get(el.localName) ?? 0;
    occ.set(el, n);
    counters.set(el.localName, n + 1);
  }

  // lines: local name → source lines of its open/self-close tokens (doc order)
  const lines = new Map<string, number[]>();
  for (const tok of tokenizeXmlTags(xml)) {
    if (tok.kind !== 'open' && tok.kind !== 'self-close') continue;
    const colon = tok.name.indexOf(':');
    const local = colon === -1 ? tok.name : tok.name.slice(colon + 1);
    const arr = lines.get(local);
    if (arr) arr.push(tok.line);
    else lines.set(local, [tok.line]);
  }

  return (el: Element) => lines.get(el.localName)?.[occ.get(el) ?? 0] ?? 1;
}

const ATTR_NAME_START = /[a-zA-Z_]/;
const ATTR_NAME_BODY = /[\w.:-]/;
const WHITESPACE = /\s/;

/** One attribute-name occurrence inside a tag's attribute text. */
export interface AttributeNameOccurrence {
  name: string;
  /** 0-based index of the name within the attribute text. */
  index: number;
}

/**
 * Scan a tag's attribute text for attribute NAMES, quote-aware.
 *
 * Unlike a naive `name=` regex, `name=value` patterns INSIDE quoted
 * attribute values are ignored — `target="…?title=Worm&amp;oldid=5"` yields
 * only `target`, not the URL's query parameters. An unterminated quote
 * (mid-typing) swallows the rest of the text, which is the safe reading.
 */
export function scanAttributeNames(attrText: string): AttributeNameOccurrence[] {
  const out: AttributeNameOccurrence[] = [];
  const n = attrText.length;
  let i = 0;

  while (i < n) {
    const ch = attrText[i];

    if (ch === '"' || ch === "'") {
      const close = attrText.indexOf(ch, i + 1);
      i = close === -1 ? n : close + 1;
      continue;
    }

    if (ATTR_NAME_START.test(ch)) {
      let j = i + 1;
      while (j < n && ATTR_NAME_BODY.test(attrText[j])) j++;
      let k = j;
      while (k < n && WHITESPACE.test(attrText[k])) k++;
      if (attrText[k] === '=') {
        out.push({ name: attrText.slice(i, j), index: i });
        i = k + 1; // continue right after '=' so the value quote is skipped next
      } else {
        i = j;
      }
      continue;
    }

    i++;
  }

  return out;
}

const ATTR_PAIR_REGEX = /([a-zA-Z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/**
 * Parse an attribute string (the body between the tag name and the closing
 * `>`/`/>`) into a key/value map. Quoted values only — entity decoding is
 * out of scope.
 */
export function parseAttributes(attributesText: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!attributesText) return out;
  ATTR_PAIR_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_PAIR_REGEX.exec(attributesText)) !== null) {
    out[m[1]] = m[2] ?? m[3] ?? '';
  }
  return out;
}
