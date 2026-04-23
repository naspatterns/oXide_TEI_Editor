import type { CompletionContext, CompletionResult, Completion } from '@codemirror/autocomplete';
import { snippetCompletion } from '@codemirror/autocomplete';
import type { SchemaInfo, ElementSpec } from '../../types/schema';
import { getRequiredChildren } from '../../schema/xmlValidator';
import { getOpenElementStack, tokenizeXmlTags } from '../../schema/xmlTokenizer';
import { getAttribute, getAttributes, getElement } from '../../schema/schemaQuery';

// ═══════════════════════════════════════════════════════════════════════════
// 정규식 캐싱 (모듈 레벨)
// 매 함수 호출마다 정규식을 생성하면 성능 저하 발생 → 한 번만 생성하여 재사용
// ═══════════════════════════════════════════════════════════════════════════

/** 요소명 시작 패턴: <tagName */
const ELEMENT_START_REGEX = /<([a-zA-Z_][\w.:_-]*)$/;
/** 속성값 입력 패턴: <tag attr="value */
const ATTR_VALUE_REGEX = /<([a-zA-Z_][\w.:_-]*)\s[^>]*?([a-zA-Z_][\w.:_-]*)="([^"]*)$/;
/** 속성명 입력 패턴: <tag attr */
const ATTR_NAME_REGEX = /<([a-zA-Z_][\w.:_-]*)\s[^>]*?([a-zA-Z_][\w.:_-]*)$/;
/** 태그 내 스페이스 패턴: <tag space */
const SPACE_IN_TAG_REGEX = /<([a-zA-Z_][\w.:_-]*)(?:\s[^>]*)?\s$/;
/** 닫는 태그 입력 패턴: </tagName */
const CLOSING_TAG_REGEX = /<\/([a-zA-Z_][\w.:_-]*)$/;
/** 열린 태그 패턴: <tag attrs... */
const OPEN_TAG_REGEX = /<([a-zA-Z_][\w.:_-]*)(\s[^>]*)?$/;
/** 속성 추출 패턴 (g 플래그 - lastIndex 리셋 필요) */
const ATTR_EXTRACT_REGEX = /([a-zA-Z_][\w.:_-]*)\s*=/g;
/** 등호 직후 패턴 */
const AFTER_EQUALS_REGEX = /=\s*$/;

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
    const elementStack = getOpenElementStack(textBefore);
    const parentName = elementStack.length > 0 ? elementStack[elementStack.length - 1] : null;
    const parentSpec = parentName ? getElement(schema, parentName) : null;

    // Get existing children for required element detection
    const existingChildren = getExistingChildren(textBefore, parentName);

    // 요소명 자동완성: '<' 뒤에서 요소명 타이핑 중
    const elementMatch = textBefore.match(ELEMENT_START_REGEX);
    if (elementMatch) {
      return completeElementName(schema, elementMatch[1], pos - elementMatch[1].length, parentSpec, existingChildren);
    }

    // 요소 시작: '<' 직후 (닫는 태그 제외)
    if (textBefore.endsWith('<') && !textBefore.endsWith('</')) {
      return completeElementName(schema, '', pos, parentSpec, existingChildren);
    }

    // 속성값 자동완성: attr="value 입력 중 (속성명보다 먼저 체크)
    const valueMatch = textBefore.match(ATTR_VALUE_REGEX);
    if (valueMatch) {
      return completeAttributeValue(schema, valueMatch[1], valueMatch[2], valueMatch[3], pos - valueMatch[3].length);
    }

    // 속성명 자동완성: 여는 태그 내에서 속성명 타이핑 중
    const attrMatch = textBefore.match(ATTR_NAME_REGEX);
    if (attrMatch) {
      const usedAttrs = getUsedAttributes(textBefore);
      return completeAttributeName(schema, attrMatch[1], attrMatch[2], pos - attrMatch[2].length, usedAttrs);
    }

    // 태그 내 스페이스: 첫 스페이스 또는 속성 후 스페이스
    const spaceInTagMatch = textBefore.match(SPACE_IN_TAG_REGEX);
    if (spaceInTagMatch && !AFTER_EQUALS_REGEX.test(textBefore)) {
      // '=' 직후에는 트리거하지 않음 (값 입력 대기 중)
      const usedAttrs = getUsedAttributes(textBefore);
      return completeAttributeName(schema, spaceInTagMatch[1], '', pos, usedAttrs);
    }

    // 닫는 태그 자동완성: '</' 뒤에서 타이핑 중
    const closingMatch = textBefore.match(CLOSING_TAG_REGEX);
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
 * 현재 열린 태그에서 이미 사용된 속성명 추출
 * (중복 속성 제안 방지용)
 */
function getUsedAttributes(text: string): Set<string> {
  const used = new Set<string>();
  // 닫히지 않은 마지막 여는 태그 찾기
  const tagMatch = text.match(OPEN_TAG_REGEX);
  if (tagMatch && tagMatch[2]) {
    const attrString = tagMatch[2];
    // g 플래그 정규식은 재사용 전 lastIndex 리셋 필수
    ATTR_EXTRACT_REGEX.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ATTR_EXTRACT_REGEX.exec(attrString)) !== null) {
      used.add(m[1]);
    }
  }
  return used;
}

/**
 * Create a snippet completion for an element with cursor between tags.
 * @param el - Element specification
 * @param boost - Priority boost for ordering
 * @param isRequired - Whether this element is required in the parent context
 */
function makeElementCompletion(el: ElementSpec, boost: number, isRequired: boolean = false): Completion {
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

  // Label with required indicator
  const label = isRequired ? `${el.name} ★` : el.name;
  const detail = isRequired
    ? `(required) ${el.documentation?.substring(0, 40) ?? ''}`
    : el.documentation?.substring(0, 60);

  if (isEmpty) {
    // Self-closing tag: <tagName attr=""/>
    return snippetCompletion(`${el.name}${attrSnippet}/>`, {
      label,
      type: 'type',
      detail,
      boost,
    });
  }

  // Regular tag with content: <tagName attr="">$0</tagName>
  return snippetCompletion(`${el.name}${attrSnippet}>${contentTabStop}</${el.name}>`, {
    label,
    type: 'type',
    detail,
    boost,
  });
}

/**
 * Get existing children of the current parent element from the text before cursor.
 * Used to determine which required children are still missing.
 */
function getExistingChildren(text: string, parentName: string | null): string[] {
  if (!parentName) return [];

  const children: string[] = [];
  const stack: string[] = [];

  for (const tok of tokenizeXmlTags(text)) {
    if (tok.kind === 'pi' || tok.kind === 'comment' || tok.kind === 'cdata') continue;

    if (tok.kind === 'close') {
      if (stack[stack.length - 1] === tok.name) {
        stack.pop();
      }
    } else if (tok.kind === 'open') {
      if (stack[stack.length - 1] === parentName) {
        children.push(tok.name);
      }
      stack.push(tok.name);
    } else {
      // self-close: also a child if we're in the parent
      if (stack[stack.length - 1] === parentName) {
        children.push(tok.name);
      }
    }
  }

  return children;
}

/**
 * Get allowed children with required status based on ContentModel.
 */
function getAllowedNextChildren(
  parentSpec: ElementSpec | null | undefined,
  existingChildren: string[],
): { name: string; required: boolean }[] {
  if (!parentSpec?.children) return [];

  const result: { name: string; required: boolean }[] = [];
  const existingSet = new Set(existingChildren);

  // Get required children from content model
  let requiredSet = new Set<string>();
  if (parentSpec.contentModel) {
    const required = getRequiredChildren(parentSpec.contentModel);
    requiredSet = new Set(required);
  }

  for (const name of parentSpec.children) {
    // A child is "required" if it's in the required set AND not yet present
    const isRequired = requiredSet.has(name) && !existingSet.has(name);
    result.push({ name, required: isRequired });
  }

  return result;
}

function completeElementName(
  schema: SchemaInfo,
  partial: string,
  from: number,
  parentSpec: ElementSpec | null | undefined,
  existingChildren: string[] = [],
): CompletionResult {
  // Use context-aware filtering: only suggest children valid in the parent
  if (parentSpec?.children && parentSpec.children.length > 0) {
    const allowedInfo = getAllowedNextChildren(parentSpec, existingChildren);
    const allowedSet = new Set(allowedInfo.map(a => a.name));
    const requiredSet = new Set(allowedInfo.filter(a => a.required).map(a => a.name));

    const allowed = schema.elements.filter((el) => allowedSet.has(el.name));
    // ✅ others 제거됨 - 허용되지 않는 요소는 제안하지 않음

    const options: Completion[] = [
      // Required elements: highest priority (+200)
      ...allowed
        .filter((el) => requiredSet.has(el.name))
        .filter((el) => el.name.toLowerCase().startsWith(partial.toLowerCase()))
        .map((el) => makeElementCompletion(el, getElementBoost(el.name) + 200, true)),
      // Allowed but not required elements: medium priority (+100)
      ...allowed
        .filter((el) => !requiredSet.has(el.name))
        .filter((el) => el.name.toLowerCase().startsWith(partial.toLowerCase()))
        .map((el) => makeElementCompletion(el, getElementBoost(el.name) + 100, false)),
      // ✅ others 부분 삭제됨 - 부모에서 허용하지 않는 요소는 제안하지 않음
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
  const attrs = getAttributes(schema, elementName);

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
  const attrSpec = getAttribute(schema, elementName, attrName);
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

/**
 * 자주 사용되는 구조 요소에 높은 우선순위 부여
 * (자동완성 목록에서 상위에 표시)
 */
function getElementBoost(name: string): number {
  const boosts: Record<string, number> = {
    p: 50, div: 45, head: 40, hi: 35, note: 30,
    persName: 28, placeName: 26, date: 24, ref: 22,
    l: 20, lg: 18, sp: 16, speaker: 14,
    list: 12, item: 10, table: 8, row: 6, cell: 4,
  };
  return boosts[name] ?? 0;
}
