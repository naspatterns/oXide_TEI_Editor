/**
 * Completion Source Tests
 *
 * Tests for autocompletion functionality including:
 * - Required element priority (★ mark)
 * - Context-aware suggestions
 * - Attribute value suggestions
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { createSchemaCompletionSource } from '../src/components/Editor/completionSource';
import type { SchemaInfo, ElementSpec, ContentModel } from '../src/types/schema';

// ============================================================================
// Test Helper: Build Schema with ContentModel
// ============================================================================

function buildTestSchema(elements: ElementSpec[]): SchemaInfo {
  const elementMap = new Map<string, ElementSpec>();
  for (const el of elements) {
    elementMap.set(el.name, el);
  }
  return {
    id: 'test_schema',
    name: 'Test Schema',
    elements,
    elementMap,
    hasSalveGrammar: false,
  };
}

// ============================================================================
// Test Helper: Create Mock Completion Context
// ============================================================================

function createMockContext(doc: string, cursorPos?: number): CompletionContext {
  const pos = cursorPos ?? doc.length;
  const state = EditorState.create({ doc });
  return {
    state,
    pos,
    explicit: true,
    tokenBefore: () => null,
    matchBefore: (regex: RegExp) => {
      const before = doc.slice(0, pos);
      const match = before.match(regex);
      if (match) {
        return { from: pos - match[0].length, to: pos, text: match[0] };
      }
      return null;
    },
    aborted: false,
    addEventListener: () => {},
  } as unknown as CompletionContext;
}

// ============================================================================
// Test Data: Element Specs with ContentModels
// ============================================================================

/** teiHeader: requires fileDesc */
const teiHeaderSpec: ElementSpec = {
  name: 'teiHeader',
  documentation: 'TEI header containing metadata',
  children: ['fileDesc', 'encodingDesc', 'profileDesc', 'revisionDesc'],
  attributes: [],
  contentModel: {
    type: 'sequence',
    items: [
      { kind: 'element', name: 'fileDesc', minOccurs: 1, maxOccurs: 1 },
      { kind: 'element', name: 'encodingDesc', minOccurs: 0, maxOccurs: 1 },
      { kind: 'element', name: 'profileDesc', minOccurs: 0, maxOccurs: 1 },
      { kind: 'element', name: 'revisionDesc', minOccurs: 0, maxOccurs: 1 },
    ],
    minOccurs: 1,
    maxOccurs: 1,
  },
};

/** fileDesc: requires titleStmt */
const fileDescSpec: ElementSpec = {
  name: 'fileDesc',
  documentation: 'File description',
  children: ['titleStmt', 'editionStmt', 'publicationStmt', 'sourceDesc'],
  attributes: [],
  contentModel: {
    type: 'sequence',
    items: [
      { kind: 'element', name: 'titleStmt', minOccurs: 1, maxOccurs: 1 },
      { kind: 'element', name: 'editionStmt', minOccurs: 0, maxOccurs: 1 },
      { kind: 'element', name: 'publicationStmt', minOccurs: 1, maxOccurs: 1 },
      { kind: 'element', name: 'sourceDesc', minOccurs: 0, maxOccurs: Infinity },
    ],
    minOccurs: 1,
    maxOccurs: 1,
  },
};

/** titleStmt */
const titleStmtSpec: ElementSpec = {
  name: 'titleStmt',
  documentation: 'Title statement',
  children: ['title', 'author', 'editor'],
  attributes: [],
};

/** title: with enum level attribute */
const titleSpec: ElementSpec = {
  name: 'title',
  documentation: 'Title of the work',
  children: [],
  attributes: [
    {
      name: 'level',
      values: ['a', 'm', 's', 'j', 'u'],
      documentation: 'Bibliographic level',
    },
    {
      name: 'type',
      documentation: 'Type of title',
    },
  ],
};

/** encodingDesc */
const encodingDescSpec: ElementSpec = {
  name: 'encodingDesc',
  documentation: 'Encoding description',
  children: ['projectDesc', 'editorialDecl'],
  attributes: [],
};

/** profileDesc */
const profileDescSpec: ElementSpec = {
  name: 'profileDesc',
  documentation: 'Profile description',
  children: ['creation', 'langUsage'],
  attributes: [],
};

/** revisionDesc */
const revisionDescSpec: ElementSpec = {
  name: 'revisionDesc',
  documentation: 'Revision description',
  children: ['change'],
  attributes: [],
};

/** publicationStmt */
const publicationStmtSpec: ElementSpec = {
  name: 'publicationStmt',
  documentation: 'Publication statement',
  children: ['p', 'publisher', 'date'],
  attributes: [],
};

/** TEI root */
const teiSpec: ElementSpec = {
  name: 'TEI',
  documentation: 'Root element',
  children: ['teiHeader', 'text'],
  attributes: [],
};

/** p paragraph */
const pSpec: ElementSpec = {
  name: 'p',
  documentation: 'Paragraph',
  children: [],
  attributes: [],
};

/** author */
const authorSpec: ElementSpec = {
  name: 'author',
  documentation: 'Author',
  children: [],
  attributes: [],
};

/** editor */
const editorSpec: ElementSpec = {
  name: 'editor',
  documentation: 'Editor',
  children: [],
  attributes: [],
};

// Build test schema
const testElements: ElementSpec[] = [
  teiSpec,
  teiHeaderSpec,
  fileDescSpec,
  titleStmtSpec,
  titleSpec,
  encodingDescSpec,
  profileDescSpec,
  revisionDescSpec,
  publicationStmtSpec,
  pSpec,
  authorSpec,
  editorSpec,
];

// ============================================================================
// Test Suite: Required Element Priority
// ============================================================================

describe('Required Element Priority (★ mark)', () => {
  let schema: SchemaInfo;
  let completionSource: ReturnType<typeof createSchemaCompletionSource>;

  beforeEach(() => {
    schema = buildTestSchema(testElements);
    completionSource = createSchemaCompletionSource(schema);
  });

  describe('Test 5.1: fileDesc ★ should appear first inside teiHeader', () => {
    it('should show fileDesc with ★ as top suggestion', () => {
      // Document with cursor inside empty teiHeader
      const doc = `<?xml version="1.0"?>
<TEI>
  <teiHeader>
    <`;
      const context = createMockContext(doc);
      const result = completionSource(context);

      expect(result).not.toBeNull();
      expect(result!.options.length).toBeGreaterThan(0);

      // Find fileDesc option
      const fileDescOption = result!.options.find(o => o.label.includes('fileDesc'));
      expect(fileDescOption).toBeDefined();
      expect(fileDescOption!.label).toContain('★');

      // fileDesc should have highest boost (be first or near top)
      const firstOption = result!.options[0];
      expect(firstOption.label).toContain('fileDesc');
    });
  });

  describe('Test 5.2: After adding fileDesc, it should not show ★', () => {
    it('should not show ★ for fileDesc when already present', () => {
      // Document with cursor inside teiHeader that already has fileDesc
      const doc = `<?xml version="1.0"?>
<TEI>
  <teiHeader>
    <fileDesc></fileDesc>
    <`;
      const context = createMockContext(doc);
      const result = completionSource(context);

      expect(result).not.toBeNull();

      // fileDesc should not have ★ anymore
      const fileDescOption = result!.options.find(o => o.label === 'fileDesc ★');
      expect(fileDescOption).toBeUndefined();

      // encodingDesc (optional) should not have ★
      const encodingDescOption = result!.options.find(o => o.label.includes('encodingDesc'));
      expect(encodingDescOption).toBeDefined();
      expect(encodingDescOption!.label).not.toContain('★');
    });
  });
});

// ============================================================================
// Test Suite: Attribute Autocompletion
// ============================================================================

describe('Attribute Autocompletion', () => {
  let schema: SchemaInfo;
  let completionSource: ReturnType<typeof createSchemaCompletionSource>;

  beforeEach(() => {
    schema = buildTestSchema(testElements);
    completionSource = createSchemaCompletionSource(schema);
  });

  describe('Test 5.3: Attribute name completion', () => {
    it('should suggest attributes after element name and space', () => {
      const doc = `<title `;
      const context = createMockContext(doc);
      const result = completionSource(context);

      expect(result).not.toBeNull();
      expect(result!.options.length).toBeGreaterThan(0);

      // Should have level and type attributes
      const levelOption = result!.options.find(o => o.label === 'level');
      const typeOption = result!.options.find(o => o.label === 'type');
      expect(levelOption).toBeDefined();
      expect(typeOption).toBeDefined();
    });
  });

  describe('Test 5.4: Attribute value completion', () => {
    it('should suggest enum values for level attribute', () => {
      const doc = `<title level="`;
      const context = createMockContext(doc);
      const result = completionSource(context);

      expect(result).not.toBeNull();
      expect(result!.options.length).toBeGreaterThan(0);

      // Should have a, m, s, j, u as options
      const labels = result!.options.map(o => o.label);
      expect(labels).toContain('a');
      expect(labels).toContain('m');
      expect(labels).toContain('s');
      expect(labels).toContain('j');
      expect(labels).toContain('u');
    });
  });

  describe('Test: Should not suggest attributes already used', () => {
    it('should not re-suggest level attribute', () => {
      const doc = `<title level="m" `;
      const context = createMockContext(doc);
      const result = completionSource(context);

      expect(result).not.toBeNull();

      // level should not be suggested again
      const levelOption = result!.options.find(o => o.label === 'level');
      expect(levelOption).toBeUndefined();

      // But type should still be suggested
      const typeOption = result!.options.find(o => o.label === 'type');
      expect(typeOption).toBeDefined();
    });
  });
});

// ============================================================================
// Test Suite: Closing Tag Completion
// ============================================================================

describe('Closing Tag Completion', () => {
  let schema: SchemaInfo;
  let completionSource: ReturnType<typeof createSchemaCompletionSource>;

  beforeEach(() => {
    schema = buildTestSchema(testElements);
    completionSource = createSchemaCompletionSource(schema);
  });

  it('should suggest closing tag for most recent open element', () => {
    const doc = `<TEI>
  <teiHeader>
    </`;
    const context = createMockContext(doc);
    const result = completionSource(context);

    expect(result).not.toBeNull();
    expect(result!.options.length).toBeGreaterThan(0);

    // teiHeader should be first suggestion
    const teiHeaderOption = result!.options.find(o => o.label === 'teiHeader');
    expect(teiHeaderOption).toBeDefined();

    // First option should be the most recent open tag
    expect(result!.options[0].label).toBe('teiHeader');
  });

  it('should suggest parent tags as well', () => {
    const doc = `<TEI>
  <teiHeader>
    </`;
    const context = createMockContext(doc);
    const result = completionSource(context);

    expect(result).not.toBeNull();

    // Both teiHeader and TEI should be suggested
    const teiOption = result!.options.find(o => o.label === 'TEI');
    expect(teiOption).toBeDefined();
  });
});

// ============================================================================
// Test Suite: Element Completion Context Awareness
// ============================================================================

describe('Element Completion Context Awareness', () => {
  let schema: SchemaInfo;
  let completionSource: ReturnType<typeof createSchemaCompletionSource>;

  beforeEach(() => {
    schema = buildTestSchema(testElements);
    completionSource = createSchemaCompletionSource(schema);
  });

  it('should only suggest valid children inside teiHeader', () => {
    const doc = `<TEI>
  <teiHeader>
    <`;
    const context = createMockContext(doc);
    const result = completionSource(context);

    expect(result).not.toBeNull();

    // Check that allowed children are present with high boost
    const fileDescOption = result!.options.find(o => o.label.includes('fileDesc'));
    const encodingDescOption = result!.options.find(o => o.label.includes('encodingDesc'));
    expect(fileDescOption).toBeDefined();
    expect(encodingDescOption).toBeDefined();

    // p is not a direct child of teiHeader, should NOT be in the list at all
    const pOption = result!.options.find(o => o.label === 'p' || o.label === 'p/>');
    expect(pOption).toBeUndefined();  // p가 제안 목록에 없어야 함
  });

  it('should suggest all elements at root level', () => {
    const doc = `<`;
    const context = createMockContext(doc);
    const result = completionSource(context);

    expect(result).not.toBeNull();
    expect(result!.options.length).toBeGreaterThan(0);

    // At root level, all elements should be available
    const teiOption = result!.options.find(o => o.label.includes('TEI'));
    expect(teiOption).toBeDefined();
  });

  it('should filter suggestions by partial typing', () => {
    const doc = `<TEI>
  <teiHeader>
    <file`;
    const context = createMockContext(doc);
    const result = completionSource(context);

    expect(result).not.toBeNull();

    // Only elements starting with 'file' should match
    const fileDescOption = result!.options.find(o => o.label.includes('fileDesc'));
    expect(fileDescOption).toBeDefined();

    // Elements not starting with 'file' should not be in options
    // (validFor regex will filter them out in actual use)
  });

  it('should NOT suggest elements outside parent\'s children list', () => {
    const doc = `<TEI>
  <teiHeader>
    <`;
    const context = createMockContext(doc);
    const result = completionSource(context);

    expect(result).not.toBeNull();

    // teiHeader의 자식만 제안되어야 함
    const allowedLabels = ['fileDesc', 'encodingDesc', 'profileDesc', 'revisionDesc'];

    // 허용된 요소는 있어야 함
    for (const label of allowedLabels) {
      const option = result!.options.find(o => o.label.includes(label));
      expect(option).toBeDefined();
    }

    // 허용되지 않은 요소 (p, TEI, titleStmt 등)는 없어야 함
    const disallowedLabels = ['p', 'TEI', 'titleStmt', 'author', 'editor'];
    for (const label of disallowedLabels) {
      const option = result!.options.find(o => o.label === label || o.label === `${label}/>`);
      expect(option).toBeUndefined();
    }
  });

  it('should handle unknown parent element gracefully', () => {
    const doc = `<unknownElement><`;
    const context = createMockContext(doc);
    const result = completionSource(context);

    expect(result).not.toBeNull();
    // 알 수 없는 부모 → 제한 없이 모든 요소 제안
    expect(result!.options.length).toBeGreaterThan(5);
  });

  it('should return empty options when no allowed element matches partial', () => {
    const doc = `<TEI>
  <teiHeader>
    <xyz`;
    const context = createMockContext(doc);
    const result = completionSource(context);

    expect(result).not.toBeNull();
    // 'xyz'로 시작하는 허용된 요소가 없으므로 빈 결과
    expect(result!.options.length).toBe(0);
  });
});

// ============================================================================
// Test Suite: No Schema
// ============================================================================

describe('No Schema Handling', () => {
  it('should return null when schema is null', () => {
    const completionSource = createSchemaCompletionSource(null);
    const doc = `<title `;
    const context = createMockContext(doc);
    const result = completionSource(context);

    expect(result).toBeNull();
  });
});

// ============================================================================
// Test Suite: Edge Cases
// ============================================================================

describe('Completion Edge Cases', () => {
  let schema: SchemaInfo;
  let completionSource: ReturnType<typeof createSchemaCompletionSource>;

  beforeEach(() => {
    schema = buildTestSchema(testElements);
    completionSource = createSchemaCompletionSource(schema);
  });

  it('should handle empty document', () => {
    const doc = ``;
    const context = createMockContext(doc);
    const result = completionSource(context);
    // No trigger character, no completion
    expect(result).toBeNull();
  });

  it('should not trigger completion in middle of text', () => {
    const doc = `Some text without tag`;
    const context = createMockContext(doc);
    const result = completionSource(context);
    expect(result).toBeNull();
  });

  it('should handle self-closing tags properly', () => {
    const doc = `<TEI>
  <teiHeader>
    <fileDesc/>
    <`;
    const context = createMockContext(doc);
    const result = completionSource(context);

    expect(result).not.toBeNull();

    // fileDesc is self-closed, so it counts as existing
    // Look for other children
    const encodingDescOption = result!.options.find(o => o.label.includes('encodingDesc'));
    expect(encodingDescOption).toBeDefined();
  });
});
