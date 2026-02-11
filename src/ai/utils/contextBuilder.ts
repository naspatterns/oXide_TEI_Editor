/**
 * XML Context Builder
 *
 * Builds the XML context object to send to the AI.
 * This is the ONLY information the AI has access to:
 * - Current document content
 * - Cursor position
 * - Selected text
 * - Validation errors
 * - Schema name
 *
 * The AI does NOT have access to:
 * - App source code
 * - Other open documents
 * - File system
 * - Workspace structure
 */

import type { XMLContext } from '../types';
import type { ValidationError } from '../../types/schema';

export interface ContextBuilderOptions {
  content: string;
  cursorLine: number;
  cursorColumn: number;
  selection?: string;
  errors?: ValidationError[];
  schemaName?: string;
}

/**
 * Build XML context for AI consumption.
 * Sanitizes and limits the context to prevent abuse.
 */
export function buildXMLContext(options: ContextBuilderOptions): XMLContext {
  const {
    content,
    cursorLine,
    cursorColumn,
    selection,
    errors,
    schemaName,
  } = options;

  // Limit content size (max 50KB to prevent token overflow)
  const MAX_CONTENT_SIZE = 50 * 1024;
  const sanitizedContent = content.slice(0, MAX_CONTENT_SIZE);

  // Build element path from cursor position
  const elementPath = buildElementPath(sanitizedContent, cursorLine);

  // Convert validation errors to AI-friendly format
  const formattedErrors = errors?.map(err => ({
    line: err.line,
    message: err.message,
    severity: err.severity as 'error' | 'warning',
  }));

  return {
    content: sanitizedContent,
    cursorLine,
    cursorColumn,
    selection: selection || undefined,
    elementPath,
    errors: formattedErrors,
    schemaName,
  };
}

/**
 * Build element path (breadcrumb) from cursor position.
 * Returns something like "TEI > text > body > div > p"
 */
function buildElementPath(content: string, cursorLine: number): string {
  const lines = content.split('\n');
  const targetLineIndex = Math.min(cursorLine - 1, lines.length - 1);

  const stack: string[] = [];
  const openTagRegex = /<(\w+)(?:\s[^>]*)?>(?!.*<\/\1>)/g;
  const closeTagRegex = /<\/(\w+)>/g;
  const selfCloseRegex = /<(\w+)[^>]*\/>/g;

  for (let i = 0; i <= targetLineIndex; i++) {
    const line = lines[i];

    // Find all tags on this line (simplified parsing)
    let match;

    // Remove self-closing tags (they don't affect the stack)
    const lineWithoutSelfClose = line.replace(selfCloseRegex, '');

    // Process close tags first (to handle same-line open/close)
    closeTagRegex.lastIndex = 0;
    while ((match = closeTagRegex.exec(lineWithoutSelfClose)) !== null) {
      const tagName = match[1];
      const lastIndex = stack.lastIndexOf(tagName);
      if (lastIndex !== -1) {
        stack.splice(lastIndex, 1);
      }
    }

    // Process open tags
    openTagRegex.lastIndex = 0;
    while ((match = openTagRegex.exec(lineWithoutSelfClose)) !== null) {
      const fullMatch = match[0];
      // Skip if this tag is closed on the same line
      if (!fullMatch.endsWith('/>')) {
        stack.push(match[1]);
      }
    }
  }

  return stack.join(' > ') || 'document';
}

/**
 * Get surrounding context lines.
 */
export function getSurroundingContext(
  content: string,
  cursorLine: number,
  contextLines: number = 5,
): string {
  const lines = content.split('\n');
  const start = Math.max(0, cursorLine - contextLines - 1);
  const end = Math.min(lines.length, cursorLine + contextLines);

  return lines
    .slice(start, end)
    .map((line, i) => {
      const lineNum = start + i + 1;
      const marker = lineNum === cursorLine ? '>>>' : '   ';
      return `${marker} ${lineNum}: ${line}`;
    })
    .join('\n');
}
