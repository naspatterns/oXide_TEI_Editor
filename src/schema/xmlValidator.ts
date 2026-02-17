import type { ValidationError, ContentModel, ContentItem, ElementSpec } from '../types/schema';
import type { SchemaInfo } from '../types/schema';

/**
 * XML validator that provides two levels of checking:
 * 1. Well-formedness: Uses DOMParser to check basic XML syntax
 * 2. Schema-aware: Validates element nesting against ElementSpec data
 * 3. ContentModel-aware: Validates choice/cardinality constraints (Phase 2)
 *
 * This is lighter than full RelaxNG validation via salve, but catches
 * the most common authoring errors in real-time.
 */
export function validateXml(
  xmlStr: string,
  schema: SchemaInfo | null,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Phase 1: Well-formedness check
  const wellFormedErrors = checkWellFormedness(xmlStr);
  if (wellFormedErrors.length > 0) {
    return wellFormedErrors; // Can't do schema checks on malformed XML
  }

  // Phase 2: Schema-aware validation (if schema is loaded)
  if (schema) {
    errors.push(...checkSchemaConformance(xmlStr, schema));
  }

  return errors;
}

/**
 * Check XML well-formedness using DOMParser + regex fallback.
 * DOMParser only reports the first error, so we use regex to find additional issues.
 *
 * IMPORTANT: DOMParser's line numbers can be inaccurate, especially with:
 * - Multi-byte characters (Unicode, Korean, etc.)
 * - Different browser implementations
 * For tag mismatch errors, we run our own detection to get accurate line numbers.
 */
function checkWellFormedness(xmlStr: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlStr, 'application/xml');
  const errorNode = doc.querySelector('parsererror');

  if (errorNode) {
    const errorText = errorNode.textContent ?? 'XML is not well-formed';

    // Try to extract line/column from browser error messages
    // Chrome: "... error on line X at column Y: ..."
    // Firefox: "XML Parsing Error: ... Location: ... Line Number X, Column Y:"
    const lineMatch = errorText.match(/line\s*(?:number\s*)?(\d+)/i);
    const colMatch = errorText.match(/column\s*(\d+)/i);

    let line = lineMatch ? parseInt(lineMatch[1], 10) : 1;
    let column = colMatch ? parseInt(colMatch[1], 10) : 1;

    // Clean up the error message - extract only the actual error description
    // Chrome format: "This page contains the following errors:error on line X at column Y: StartTag: invalid element name\n\nBelow is..."
    // Firefox format: "XML Parsing Error: ... Line Number X, Column Y:"
    // We want just: "StartTag: invalid element name" or similar
    let message = errorText
      // Remove "Below is a rendering..." suffix
      .replace(/\s*Below is a rendering[\s\S]*$/i, '')
      // Extract the actual error message after "line X at column Y: " or "Column Y:"
      .replace(/^[\s\S]*(?:at\s+column\s+\d+|Column\s+\d+)[:\s]+/i, '')
      .trim();

    // Fallback: if message is empty or still contains noise, try another approach
    if (!message || /^[:\s]*$/.test(message) || message.length < 3) {
      // Try to find common error patterns
      const patterns = [
        /StartTag:\s*(.+)/i,
        /EndTag:\s*(.+)/i,
        /Opening and ending tag mismatch[:\s]*(.+)/i,
        /expected\s+(.+)/i,
        /not\s+well-?formed/i,
      ];
      for (const pattern of patterns) {
        const match = errorText.match(pattern);
        if (match) {
          message = match[0].trim();
          break;
        }
      }
    }

    if (!message) message = 'XML is not well-formed';

    // DOMParser's line numbers are often inaccurate, especially with:
    // - Multi-byte characters (Unicode, Korean, etc.)
    // - Different browser implementations
    // Always try our own detection first for more accurate line numbers.

    // Try 1: Check for malformed tag starts (e.g., "<>" or "< " or "<123")
    const malformedPos = findMalformedTagPosition(xmlStr);
    if (malformedPos) {
      line = malformedPos.line;
      column = malformedPos.column;
    } else {
      // Try 2: Check for tag mismatch errors (unclosed/orphan tags)
      const tagErrors = findTagMismatchErrors(xmlStr, -1);
      if (tagErrors.length > 0) {
        const firstTagError = tagErrors[0];
        line = firstTagError.line;
        column = firstTagError.column;
        message = firstTagError.message;
      }
    }

    errors.push({
      message,
      line,
      column,
      severity: 'error',
    });

    // DOMParser only reports first error - use regex to find more issues
    const additionalErrors = findAdditionalWellFormednessErrors(xmlStr, line);
    errors.push(...additionalErrors);
  }

  return errors;
}

/**
 * Use regex to find additional well-formedness issues that DOMParser didn't report.
 *
 * This function detects:
 * - Malformed tag starts: `<` followed by invalid characters (e.g., `< `, `<123`)
 * - Orphan closing tags: `</tag>` without a matching opening tag
 * - Unclosed opening tags: `<tag>` without a matching closing tag
 *
 * Note: These checks use simple heuristics and may have edge cases in complex
 * malformed documents. DOMParser's first error is still the primary source.
 */
function findAdditionalWellFormednessErrors(xmlStr: string, firstErrorLine: number): ValidationError[] {
  const errors: ValidationError[] = [];
  const lines = xmlStr.split('\n');

  // Pattern: Malformed tag start (e.g., "< " or "<123")
  // Only match < followed by invalid chars, but not <?, <!, </
  const malformedTagStart = /<(?![?!/a-zA-Z_])/g;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const lineNum = lineIdx + 1;
    const line = lines[lineIdx];

    // Skip the line where DOMParser already reported an error
    if (lineNum === firstErrorLine) continue;

    // Check for malformed tag starts
    let match: RegExpExecArray | null;
    malformedTagStart.lastIndex = 0;
    while ((match = malformedTagStart.exec(line)) !== null) {
      // Skip if inside a comment
      const before = line.substring(0, match.index);
      if (before.includes('<!--') && !before.includes('-->')) continue;

      errors.push({
        message: 'Invalid character after "<"',
        line: lineNum,
        column: match.index + 1,
        severity: 'error',
      });
    }
  }

  // Check for orphan closing tags and unclosed opening tags
  const tagMismatchErrors = findTagMismatchErrors(xmlStr, firstErrorLine);
  errors.push(...tagMismatchErrors);

  // Limit to 5 additional errors max (avoid noise)
  return errors.slice(0, 5);
}

/**
 * Find the position of a malformed tag start (e.g., "<>" or "< " or "<123").
 * Returns the first occurrence's line and column.
 */
function findMalformedTagPosition(xmlStr: string): { line: number; column: number } | null {
  const lines = xmlStr.split('\n');

  // Pattern: Malformed tag start - < followed by invalid char (not ?, !, /, or valid name start)
  // Valid XML name start: letter or underscore
  // This catches: <>, < , <123, etc.
  const malformedTagStart = /<(?![?!/a-zA-Z_\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD])/g;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const lineNum = lineIdx + 1;
    const line = lines[lineIdx];

    malformedTagStart.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = malformedTagStart.exec(line)) !== null) {
      // Skip if inside a comment
      const before = line.substring(0, match.index);
      if (before.includes('<!--') && !before.includes('-->')) continue;

      // Skip if inside CDATA
      if (before.includes('<![CDATA[') && !before.includes(']]>')) continue;

      return {
        line: lineNum,
        column: match.index + 1,
      };
    }
  }

  return null;
}

/**
 * Build an array of line-start offsets for offset→line/column conversion.
 * lineStarts[i] = character offset where line (i+1) begins.
 */
function buildLineStarts(xmlStr: string): number[] {
  const starts = [0];
  for (let i = 0; i < xmlStr.length; i++) {
    if (xmlStr[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

/**
 * Convert a character offset to 1-based line and column using binary search.
 */
function offsetToLineCol(lineStarts: number[], offset: number): { line: number; column: number } {
  let lo = 0, hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: offset - lineStarts[lo] + 1 };
}

/**
 * Replace comments and CDATA sections with spaces (preserving string length).
 * This prevents regex from matching tags inside comments/CDATA.
 */
function stripCommentsAndCDATA(xmlStr: string): string {
  return xmlStr.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?]]>/g,
    (m) => ' '.repeat(m.length));
}

/**
 * Find orphan closing tags and unclosed opening tags.
 * Uses a stack-based approach to accurately track which specific opening tags
 * are unclosed (reports the FIRST unclosed tag, not the last).
 */
function findTagMismatchErrors(xmlStr: string, firstErrorLine: number): ValidationError[] {
  const errors: ValidationError[] = [];
  const lineStarts = buildLineStarts(xmlStr);
  const stripped = stripCommentsAndCDATA(xmlStr);

  // Stack-based tracking: each tag name maps to a stack of opening tag positions
  // When a closing tag is found, we pop from the stack (LIFO matching)
  // Remaining items in the stack are unclosed tags
  const openingStacks = new Map<string, { line: number; column: number }[]>();

  // First pass: collect all tags and their positions
  interface TagOccurrence {
    name: string;
    type: 'opening' | 'closing';
    line: number;
    column: number;
  }
  const allTags: TagOccurrence[] = [];

  // Regex to match tags on the full (stripped) text — handles multi-line tags
  // Use permissive pattern to match Unicode tag names (Korean, etc.)
  // [\s\S] instead of [^>] so attributes spanning multiple lines are consumed
  const tagRegex = /<(\/?[^\s/>][^\s/>]*)(?:\s[\s\S]*?)?\s*\/?>/g;

  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(stripped)) !== null) {
    const fullMatch = match[0];
    const tagWithSlash = match[1];

    // Skip self-closing tags
    if (fullMatch.endsWith('/>')) continue;

    // Skip processing instructions
    if (fullMatch.startsWith('<?')) continue;

    const isClosing = tagWithSlash.startsWith('/');
    const tagName = isClosing ? tagWithSlash.slice(1) : tagWithSlash;
    const pos = offsetToLineCol(lineStarts, match.index);

    allTags.push({
      name: tagName,
      type: isClosing ? 'closing' : 'opening',
      line: pos.line,
      column: pos.column,
    });

    // Update stack
    if (isClosing) {
      // Closing tag: pop from stack (matches most recent opening tag)
      const stack = openingStacks.get(tagName);
      if (stack && stack.length > 0) {
        stack.pop();
      }
      // Note: orphan closing tags (no matching opening) are handled in Second Pass
    } else {
      // Opening tag: push to stack
      const stack = openingStacks.get(tagName) || [];
      stack.push({ line: pos.line, column: pos.column });
      openingStacks.set(tagName, stack);
    }
  }

  // Second pass: Find orphan closing tags (closing tags that appear before enough opening tags)
  // This uses running balance to detect closing tags that appear before their opening tags
  const runningBalance = new Map<string, number>();

  for (const tag of allTags) {
    const current = runningBalance.get(tag.name) || 0;

    if (tag.type === 'opening') {
      runningBalance.set(tag.name, current + 1);
    } else {
      // Closing tag
      if (current <= 0) {
        // Orphan closing tag - no matching opening tag before this point
        // Skip if this is on the same line as DOMParser's first error
        if (tag.line !== firstErrorLine) {
          errors.push({
            message: `Orphan closing tag </${tag.name}> without matching opening tag`,
            line: tag.line,
            column: tag.column,
            severity: 'error',
          });
        }
      } else {
        runningBalance.set(tag.name, current - 1);
      }
    }
  }

  // Third pass: Check for unclosed opening tags using the stack
  // The FIRST item in each stack is the FIRST unclosed tag (correct line number)
  for (const [tagName, stack] of openingStacks.entries()) {
    if (stack.length > 0) {
      // Stack still has items = unclosed opening tags
      // Report the FIRST one (stack[0]), not the last
      const firstUnclosed = stack[0];
      if (firstUnclosed.line !== firstErrorLine) {
        // Only report if we haven't already reported errors for this tag
        const hasOrphanError = errors.some(e => e.message.includes(`</${tagName}>`));
        if (!hasOrphanError) {
          errors.push({
            message: `Unclosed tag <${tagName}>`,
            line: firstUnclosed.line,
            column: firstUnclosed.column,
            severity: 'error',
          });
        }
      }
    }
  }

  return errors;
}

/**
 * 스키마 적합성 검사
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 스택 기반 XML 검증 알고리즘
 * ═══════════════════════════════════════════════════════════════════════════
 * 1. 여는 태그(<tag>) → 스택에 push
 * 2. 닫는 태그(</tag>) → 스택 top과 매칭 시 pop
 * 3. 검증 항목:
 *    - 알 수 없는 요소 (스키마에 정의 없음)
 *    - 잘못된 중첩 (부모 요소의 허용 자식 목록에 없음)
 *    - 알 수 없는 속성 (요소에 정의 없음)
 *    - 필수 속성 누락
 *
 * 이 방식은 전체 RelaxNG 검증(salve)보다 가볍지만,
 * 실시간 편집 중 가장 흔한 오류를 빠르게 감지
 * ═══════════════════════════════════════════════════════════════════════════
 */
/**
 * Stack entry for tracking element nesting and children.
 * Used for ContentModel-based validation.
 */
interface StackEntry {
  name: string;
  line: number;
  children: { name: string; line: number }[];  // Track children for ContentModel validation
}

function checkSchemaConformance(
  xmlStr: string,
  schema: SchemaInfo,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const lineStarts = buildLineStarts(xmlStr);
  const stripped = stripCommentsAndCDATA(xmlStr);

  // 중첩 검증을 위한 요소 스택 (부모-자식 관계 추적)
  const stack: StackEntry[] = [];

  // Regex to match tags on the full (stripped) text — handles multi-line tags
  // Use permissive pattern to match Unicode tag names (Korean, etc.)
  // Capture group 1: tag name (with optional leading /), group 2: attribute string
  // [\s\S]*? so attributes spanning multiple lines are consumed
  const tagRegex = /<(\/?[^\s/>][^\s/>]*)(\s[\s\S]*?)?\s*\/?>/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(stripped)) !== null) {
    const fullTag = match[0];
    const tagWithSlash = match[1];  // May include leading / for closing tags
    const attrString = match[2] ?? '';
    const pos = offsetToLineCol(lineStarts, match.index);
    const col = pos.column;
    const lineNum = pos.line;

    // Skip processing instructions and XML declarations
    if (fullTag.startsWith('<?')) continue;

    // Determine if closing tag and extract clean tag name
    const isClosingTag = tagWithSlash.startsWith('/');
    const tagName = isClosingTag ? tagWithSlash.slice(1) : tagWithSlash;

    if (isClosingTag) {
      // Closing tag
      if (stack.length > 0 && stack[stack.length - 1].name === tagName) {
        const closedElement = stack.pop()!;
        const elSpec = schema.elementMap.get(tagName);

        // Phase 2: ContentModel validation on element close
        if (elSpec?.contentModel) {
          errors.push(...validateContentModel(elSpec, closedElement.children));
        }

        // Check for required children
        if (elSpec?.contentModel) {
          const required = getRequiredChildren(elSpec.contentModel);
          const actualNames = new Set(closedElement.children.map(c => c.name));
          for (const reqChild of required) {
            if (!actualNames.has(reqChild)) {
              errors.push({
                message: `<${tagName}> requires <${reqChild}> child element`,
                line: closedElement.line,
                column: 1,
                severity: 'warning',  // Warning to avoid blocking valid partial edits
              });
            }
          }
        }
      }
      continue;
    }

    // Opening tag (or self-closing)
    const elSpec = schema.elementMap.get(tagName);

    // Check 1: Is this element known?
    if (!elSpec && tagName !== 'xml') {
      errors.push({
        message: `Unknown element <${tagName}>`,
        line: lineNum,
        column: col,
        severity: 'warning',
      });
    }

    // Check 2: Is this element allowed in its parent?
    if (stack.length > 0 && elSpec) {
      const parent = stack[stack.length - 1];
      const parentSpec = schema.elementMap.get(parent.name);
      if (parentSpec?.children && parentSpec.children.length > 0) {
        if (!parentSpec.children.includes(tagName)) {
          errors.push({
            message: `<${tagName}> is not allowed inside <${parent.name}>`,
            line: lineNum,
            column: col,
            severity: 'error',
          });
        }
      }
    }

    // Check 3: Are attributes valid for this element?
    if (elSpec) {
      // Extract present attribute names and values
      const presentAttrs = new Set<string>();
      if (attrString) {
        // Offset in xmlStr where the attribute string begins
        const attrStringStart = match.index + match[0].indexOf(attrString);
        const attrRegex = /([a-zA-Z_][\w.:_-]*)\s*=/g;
        let attrMatch: RegExpExecArray | null;
        while ((attrMatch = attrRegex.exec(attrString)) !== null) {
          const attrName = attrMatch[1];
          presentAttrs.add(attrName);
          // Skip xmlns attributes for unknown check
          if (attrName === 'xmlns' || attrName.startsWith('xmlns:')) continue;

          const attrSpec = elSpec.attributes?.find((a) => a.name === attrName);
          if (!attrSpec) {
            const attrPos = offsetToLineCol(lineStarts, attrStringStart + attrMatch.index);
            errors.push({
              message: `Unknown attribute "${attrName}" on <${tagName}>`,
              line: attrPos.line,
              column: attrPos.column,
              severity: 'warning',
            });
          } else if (attrSpec.values && attrSpec.values.length > 0) {
            // Check 3.5: Validate enum attribute values
            const actualValue = extractAttributeValue(attrString, attrName);
            if (actualValue && !attrSpec.values.includes(actualValue)) {
              const allowedPreview = attrSpec.values.slice(0, 5).join(', ');
              const suffix = attrSpec.values.length > 5 ? '...' : '';
              const attrPos = offsetToLineCol(lineStarts, attrStringStart + attrMatch.index);
              errors.push({
                message: `Invalid value "${actualValue}" for @${attrName}. Allowed: ${allowedPreview}${suffix}`,
                line: attrPos.line,
                column: attrPos.column,
                severity: 'warning',
              });
            }
          }
        }
      }

      // Check 4: Are required attributes present?
      if (elSpec.attributes) {
        for (const attr of elSpec.attributes) {
          if (attr.required && !presentAttrs.has(attr.name)) {
            errors.push({
              message: `Missing required attribute "${attr.name}" on <${tagName}>`,
              line: lineNum,
              column: col,
              severity: 'error',
            });
          }
        }
      }
    }

    // Track as child of parent
    if (stack.length > 0) {
      stack[stack.length - 1].children.push({ name: tagName, line: lineNum });
    }

    // Push to stack if not self-closing
    if (!fullTag.endsWith('/>')) {
      stack.push({ name: tagName, line: lineNum, children: [] });
    } else {
      // Self-closing tag: validate empty constraint if applicable
      if (elSpec?.contentModel && elSpec.contentModel.type !== 'empty') {
        const required = getRequiredChildren(elSpec.contentModel);
        if (required.length > 0) {
          errors.push({
            message: `<${tagName}/> is self-closing but requires children: ${required.slice(0, 3).join(', ')}${required.length > 3 ? '...' : ''}`,
            line: lineNum,
            column: col,
            severity: 'warning',
          });
        }
      }
    }
  }

  return errors;
}

// ============================================================================
// Phase 2: ContentModel-based Validation
// ============================================================================

/**
 * Validate content model constraints for a parent element.
 * Checks:
 * - Choice violations (mutually exclusive elements)
 * - Cardinality violations (min/max occurrences)
 * - Required children missing
 *
 * @param parentSpec - Parent element specification with contentModel
 * @param actualChildren - Array of actual child elements with their line numbers
 * @returns Array of validation errors
 */
export function validateContentModel(
  parentSpec: ElementSpec,
  actualChildren: { name: string; line: number }[],
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Only validate if contentModel is defined
  if (!parentSpec.contentModel) return errors;

  const model = parentSpec.contentModel;

  // Check based on model type
  switch (model.type) {
    case 'choice':
      errors.push(...validateChoice(parentSpec.name, model, actualChildren));
      break;

    case 'sequence':
    case 'interleave':
    case 'group':
      errors.push(...validateSequenceOrInterleave(parentSpec.name, model, actualChildren));
      break;

    case 'empty':
      // Empty elements should have no children
      if (actualChildren.length > 0) {
        errors.push({
          message: `<${parentSpec.name}> should be empty but contains children`,
          line: actualChildren[0].line,
          column: 1,
          severity: 'error',
        });
      }
      break;

    default:
      // text, element - handled by basic validation
      break;
  }

  return errors;
}

/**
 * Validate choice constraints - only one of the alternatives should be used.
 */
function validateChoice(
  parentName: string,
  model: ContentModel,
  actualChildren: { name: string; line: number }[],
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!model.items) return errors;

  // Get all element names from each choice alternative
  const choiceGroups: Set<string>[] = [];

  for (const item of model.items) {
    const group = new Set<string>();
    collectElementNames(item, group);
    if (group.size > 0) {
      choiceGroups.push(group);
    }
  }

  // Check which groups have been used (Set for O(1) lookup)
  const usedGroups = new Set<number>();
  for (const child of actualChildren) {
    for (let i = 0; i < choiceGroups.length; i++) {
      if (choiceGroups[i].has(child.name)) {
        usedGroups.add(i);
      }
    }
  }

  // If more than one group is used, it's a choice violation
  if (usedGroups.size > 1) {
    // Find the second usage to report
    const usedGroupArray = Array.from(usedGroups);
    const firstGroupElements = choiceGroups[usedGroupArray[0]];
    const secondGroupElements = choiceGroups[usedGroupArray[1]];

    // Find first element from second group
    for (const child of actualChildren) {
      if (secondGroupElements.has(child.name) && !firstGroupElements.has(child.name)) {
        const firstUsed = actualChildren.find(c => firstGroupElements.has(c.name));
        errors.push({
          message: `<${child.name}> cannot be used together with <${firstUsed?.name}> inside <${parentName}> (choice violation)`,
          line: child.line,
          column: 1,
          severity: 'error',
        });
        break;
      }
    }
  }

  return errors;
}

/**
 * Validate sequence/interleave cardinality constraints.
 */
function validateSequenceOrInterleave(
  parentName: string,
  model: ContentModel,
  actualChildren: { name: string; line: number }[],
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!model.items) return errors;

  // Count occurrences of each child element
  const childCounts = new Map<string, number>();
  for (const child of actualChildren) {
    childCounts.set(child.name, (childCounts.get(child.name) ?? 0) + 1);
  }

  // Check each item's cardinality
  for (const item of model.items) {
    if (item.kind === 'element' && item.name) {
      const count = childCounts.get(item.name) ?? 0;

      // Check minimum
      if (count < item.minOccurs) {
        errors.push({
          message: `<${item.name}> must appear at least ${item.minOccurs} time(s) in <${parentName}>`,
          line: actualChildren.length > 0 ? actualChildren[0].line : 1,
          column: 1,
          severity: 'warning', // Warning since we may not have complete content yet
        });
      }

      // Check maximum
      if (item.maxOccurs !== Infinity && count > item.maxOccurs) {
        // Find the extra occurrence
        let occurrenceCount = 0;
        for (const child of actualChildren) {
          if (child.name === item.name) {
            occurrenceCount++;
            if (occurrenceCount > item.maxOccurs) {
              errors.push({
                message: `<${item.name}> can appear at most ${item.maxOccurs} time(s) in <${parentName}>`,
                line: child.line,
                column: 1,
                severity: 'error',
              });
              break;
            }
          }
        }
      }
    } else if (item.kind === 'group' && item.content) {
      // Recursively validate nested content model
      errors.push(...validateContentModel(
        { name: parentName, contentModel: item.content } as ElementSpec,
        actualChildren,
      ));
    }
  }

  return errors;
}

/**
 * Collect all element names from a content item recursively.
 */
function collectElementNames(item: ContentItem, names: Set<string>): void {
  if (item.kind === 'element' && item.name) {
    names.add(item.name);
  } else if (item.kind === 'group' && item.content?.items) {
    for (const subItem of item.content.items) {
      collectElementNames(subItem, names);
    }
  }
}

/**
 * Get required children from a content model.
 */
export function getRequiredChildren(model: ContentModel): string[] {
  const required: string[] = [];

  if (!model.items) return required;

  if (model.type === 'choice') {
    // For choice, nothing is strictly required (one of many)
    return required;
  }

  for (const item of model.items) {
    if (item.kind === 'element' && item.name && item.minOccurs > 0) {
      required.push(item.name);
    } else if (item.kind === 'group' && item.content && item.minOccurs > 0) {
      required.push(...getRequiredChildren(item.content));
    }
  }

  return required;
}

/**
 * Extract the value of a specific attribute from an attribute string.
 * Handles both single and double quoted values.
 */
function extractAttributeValue(attrString: string, attrName: string): string | null {
  // Match attrName="value" or attrName='value'
  const regex = new RegExp(`${attrName}\\s*=\\s*["']([^"']*)["']`);
  const match = attrString.match(regex);
  return match ? match[1] : null;
}
