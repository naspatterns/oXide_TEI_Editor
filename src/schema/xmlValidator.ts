import type { ValidationError } from '../types/schema';
import type { SchemaInfo } from '../types/schema';

/**
 * XML validator that provides two levels of checking:
 * 1. Well-formedness: Uses DOMParser to check basic XML syntax
 * 2. Schema-aware: Validates element nesting against ElementSpec data
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
 * Check schema conformance using ElementSpec data.
 * Validates:
 * - Unknown elements (not in schema)
 * - Invalid nesting (child not allowed in parent)
 * - Unknown attributes (not defined for element)
 */
function checkSchemaConformance(
  xmlStr: string,
  schema: SchemaInfo,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const lines = xmlStr.split('\n');

  // Track element stack for nesting validation
  const stack: { name: string; line: number }[] = [];

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
          stack.pop();
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
        // Extract present attribute names
        const presentAttrs = new Set<string>();
        if (attrString) {
          const attrRegex = /([a-zA-Z_][\w.:_-]*)\s*=/g;
          let attrMatch: RegExpExecArray | null;
          while ((attrMatch = attrRegex.exec(attrString)) !== null) {
            const attrName = attrMatch[1];
            presentAttrs.add(attrName);
            // Skip xmlns attributes for unknown check
            if (attrName === 'xmlns' || attrName.startsWith('xmlns:')) continue;
            const known = elSpec.attributes?.some((a) => a.name === attrName);
            if (!known) {
              errors.push({
                message: `Unknown attribute "${attrName}" on <${tagName}>`,
                line: lineNum,
                column: col + match.index + attrMatch.index,
                severity: 'warning',
              });
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

      // Push to stack if not self-closing
      if (!fullTag.endsWith('/>')) {
        stack.push({ name: tagName, line: lineNum });
      }
    }
  }

  return errors;
}
