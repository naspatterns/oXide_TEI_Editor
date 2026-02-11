/**
 * AI Response Parser
 *
 * Parses AI responses to extract:
 * - Plain text explanations
 * - xml-action blocks for editor operations
 */

import type { AIAction, AIActionType } from '../types';

/** Pattern to match xml-action code blocks */
const XML_ACTION_PATTERN = /```xml-action\n([\s\S]*?)```/g;

/** Pattern to parse YAML-like action content */
const ACTION_FIELD_PATTERN = /^(\w+):\s*(.+)$/;
const MULTILINE_PATTERN = /^(\w+):\s*\|\s*$/;

/**
 * Parse AI response and extract actions.
 */
export function parseAIResponse(response: string): {
  content: string;
  actions: AIAction[];
} {
  const actions: AIAction[] = [];
  let cleanContent = response;

  // Extract all xml-action blocks
  let match;
  XML_ACTION_PATTERN.lastIndex = 0;

  while ((match = XML_ACTION_PATTERN.exec(response)) !== null) {
    const actionContent = match[1];
    const action = parseActionBlock(actionContent);
    if (action) {
      actions.push(action);
    }
  }

  // Remove xml-action blocks from display content
  // but keep a placeholder
  cleanContent = response.replace(
    XML_ACTION_PATTERN,
    '\n_[액션 블록 - 아래 버튼으로 적용]_\n',
  );

  return { content: cleanContent, actions };
}

/**
 * Parse a single xml-action block content.
 */
function parseActionBlock(content: string): AIAction | null {
  const lines = content.trim().split('\n');
  const fields: Record<string, string> = {};

  let currentField: string | null = null;
  let multilineValue: string[] = [];

  for (const line of lines) {
    // Check for multiline start
    const multilineMatch = line.match(MULTILINE_PATTERN);
    if (multilineMatch) {
      // Save previous field if exists
      if (currentField && multilineValue.length > 0) {
        fields[currentField] = multilineValue.join('\n');
      }
      currentField = multilineMatch[1];
      multilineValue = [];
      continue;
    }

    // If we're in a multiline field
    if (currentField) {
      // Check if this line starts a new field
      const fieldMatch = line.match(ACTION_FIELD_PATTERN);
      if (fieldMatch && !line.startsWith('  ')) {
        // Save current multiline and start new field
        fields[currentField] = multilineValue.join('\n');
        currentField = null;
        fields[fieldMatch[1]] = fieldMatch[2];
      } else {
        // Continue multiline (remove leading indentation)
        multilineValue.push(line.replace(/^  /, ''));
      }
      continue;
    }

    // Regular field
    const fieldMatch = line.match(ACTION_FIELD_PATTERN);
    if (fieldMatch) {
      fields[fieldMatch[1]] = fieldMatch[2];
    }
  }

  // Save last multiline field
  if (currentField && multilineValue.length > 0) {
    fields[currentField] = multilineValue.join('\n');
  }

  // Validate required field
  if (!fields.type) {
    return null;
  }

  const actionType = fields.type as AIActionType;
  if (!['insert', 'replace', 'wrap', 'navigate', 'explain'].includes(actionType)) {
    return null;
  }

  return {
    type: actionType,
    payload: {
      xml: fields.xml?.trim(),
      startLine: fields.startLine ? parseInt(fields.startLine, 10) : undefined,
      endLine: fields.endLine ? parseInt(fields.endLine, 10) : undefined,
      tagName: fields.tagName,
      explanation: fields.explanation,
    },
  };
}

/**
 * Check if response contains any actions.
 */
export function hasActions(response: string): boolean {
  XML_ACTION_PATTERN.lastIndex = 0;
  return XML_ACTION_PATTERN.test(response);
}

/**
 * Remove action blocks from response for plain display.
 */
export function stripActions(response: string): string {
  return response.replace(XML_ACTION_PATTERN, '').trim();
}
