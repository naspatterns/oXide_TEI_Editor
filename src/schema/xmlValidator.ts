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
 * Check XML well-formedness using DOMParser.
 * Parse the error message to extract line/column info.
 */
function checkWellFormedness(xmlStr: string): ValidationError[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlStr, 'application/xml');
  const errorNode = doc.querySelector('parsererror');

  if (!errorNode) return [];

  const errorText = errorNode.textContent ?? 'XML is not well-formed';

  // Try to extract line/column from browser error messages
  // Chrome: "... error on line X at column Y: ..."
  // Firefox: "XML Parsing Error: ... Location: ... Line Number X, Column Y:"
  const lineMatch = errorText.match(/line\s*(?:number\s*)?(\d+)/i);
  const colMatch = errorText.match(/column\s*(\d+)/i);

  const line = lineMatch ? parseInt(lineMatch[1], 10) : 1;
  const column = colMatch ? parseInt(colMatch[1], 10) : 1;

  // Clean up the error message
  let message = errorText
    .replace(/^[\s\S]*?error[:\s]*/i, '')
    .replace(/\s*Below is a rendering[\s\S]*$/, '')
    .trim();
  if (!message) message = 'XML is not well-formed';

  return [{
    message,
    line,
    column,
    severity: 'error',
  }];
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
  const lines = xmlStr.split('\n');

  // 중첩 검증을 위한 요소 스택 (부모-자식 관계 추적)
  const stack: StackEntry[] = [];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const lineNum = lineIdx + 1;

    // Find all tags in this line
    const tagRegex = /<\/?([a-zA-Z_][\w.:_-]*)(\s[^>]*)?\s*\/?>/g;
    let match: RegExpExecArray | null;

    while ((match = tagRegex.exec(line)) !== null) {
      const fullTag = match[0];
      const tagName = match[1];
      const attrString = match[2] ?? '';
      const col = match.index + 1;

      // Skip processing instructions and XML declarations
      if (fullTag.startsWith('<?')) continue;

      if (fullTag.startsWith('</')) {
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
          const attrRegex = /([a-zA-Z_][\w.:_-]*)\s*=/g;
          let attrMatch: RegExpExecArray | null;
          while ((attrMatch = attrRegex.exec(attrString)) !== null) {
            const attrName = attrMatch[1];
            presentAttrs.add(attrName);
            // Skip xmlns attributes for unknown check
            if (attrName === 'xmlns' || attrName.startsWith('xmlns:')) continue;

            const attrSpec = elSpec.attributes?.find((a) => a.name === attrName);
            if (!attrSpec) {
              errors.push({
                message: `Unknown attribute "${attrName}" on <${tagName}>`,
                line: lineNum,
                column: col + match.index + attrMatch.index,
                severity: 'warning',
              });
            } else if (attrSpec.values && attrSpec.values.length > 0) {
              // Check 3.5: Validate enum attribute values
              const actualValue = extractAttributeValue(attrString, attrName);
              if (actualValue && !attrSpec.values.includes(actualValue)) {
                const allowedPreview = attrSpec.values.slice(0, 5).join(', ');
                const suffix = attrSpec.values.length > 5 ? '...' : '';
                errors.push({
                  message: `Invalid value "${actualValue}" for @${attrName}. Allowed: ${allowedPreview}${suffix}`,
                  line: lineNum,
                  column: col + match.index + attrMatch.index,
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
