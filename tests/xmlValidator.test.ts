/**
 * XML Validator Tests
 *
 * Tests for ContentModel validation, choice violations, attribute value validation,
 * required children detection, nesting rules, and schema merging.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateXml,
  validateContentModel,
  getRequiredChildren,
} from '../src/schema/xmlValidator';
import { getTeiAllElements } from '../src/schema/teiStaticSchema';
import type { SchemaInfo, ElementSpec, ContentModel, ContentItem, AttrSpec } from '../src/types/schema';

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

/** fileDesc: requires titleStmt and publicationStmt */
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

/** titleStmt: requires title */
const titleStmtSpec: ElementSpec = {
  name: 'titleStmt',
  documentation: 'Title statement',
  children: ['title', 'author', 'editor'],
  attributes: [],
  contentModel: {
    type: 'sequence',
    items: [
      { kind: 'element', name: 'title', minOccurs: 1, maxOccurs: Infinity },
      { kind: 'element', name: 'author', minOccurs: 0, maxOccurs: Infinity },
      { kind: 'element', name: 'editor', minOccurs: 0, maxOccurs: Infinity },
    ],
    minOccurs: 1,
    maxOccurs: 1,
  },
};

/** choice: abbr/expan or orig/reg or sic/corr (choice model) */
const choiceSpec: ElementSpec = {
  name: 'choice',
  documentation: 'Editorial choice',
  children: ['abbr', 'expan', 'orig', 'reg', 'sic', 'corr'],
  attributes: [],
  contentModel: {
    type: 'choice',
    items: [
      {
        kind: 'group',
        content: {
          type: 'sequence',
          items: [
            { kind: 'element', name: 'abbr', minOccurs: 1, maxOccurs: 1 },
          ],
          minOccurs: 1,
          maxOccurs: 1,
        },
        minOccurs: 1,
        maxOccurs: 1,
      },
      {
        kind: 'group',
        content: {
          type: 'sequence',
          items: [
            { kind: 'element', name: 'expan', minOccurs: 1, maxOccurs: 1 },
          ],
          minOccurs: 1,
          maxOccurs: 1,
        },
        minOccurs: 1,
        maxOccurs: 1,
      },
      {
        kind: 'group',
        content: {
          type: 'sequence',
          items: [
            { kind: 'element', name: 'orig', minOccurs: 1, maxOccurs: 1 },
          ],
          minOccurs: 1,
          maxOccurs: 1,
        },
        minOccurs: 1,
        maxOccurs: 1,
      },
      {
        kind: 'group',
        content: {
          type: 'sequence',
          items: [
            { kind: 'element', name: 'reg', minOccurs: 1, maxOccurs: 1 },
          ],
          minOccurs: 1,
          maxOccurs: 1,
        },
        minOccurs: 1,
        maxOccurs: 1,
      },
      {
        kind: 'group',
        content: {
          type: 'sequence',
          items: [
            { kind: 'element', name: 'sic', minOccurs: 1, maxOccurs: 1 },
          ],
          minOccurs: 1,
          maxOccurs: 1,
        },
        minOccurs: 1,
        maxOccurs: 1,
      },
      {
        kind: 'group',
        content: {
          type: 'sequence',
          items: [
            { kind: 'element', name: 'corr', minOccurs: 1, maxOccurs: 1 },
          ],
          minOccurs: 1,
          maxOccurs: 1,
        },
        minOccurs: 1,
        maxOccurs: 1,
      },
    ],
    minOccurs: 1,
    maxOccurs: 1,
  },
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

/** div: with type attribute (open values) */
const divSpec: ElementSpec = {
  name: 'div',
  documentation: 'Text division',
  children: ['head', 'p', 'div', 'lg'],
  attributes: [
    {
      name: 'type',
      documentation: 'Type of division',
    },
  ],
};

/** p: paragraph element */
const pSpec: ElementSpec = {
  name: 'p',
  documentation: 'Paragraph',
  children: ['hi', 'persName', 'placeName', 'date', 'choice'],
  attributes: [],
};

/** publicationStmt: publication statement */
const publicationStmtSpec: ElementSpec = {
  name: 'publicationStmt',
  documentation: 'Publication statement',
  children: ['p', 'publisher', 'date'],
  attributes: [],
};

/** body: text body container */
const bodySpec: ElementSpec = {
  name: 'body',
  documentation: 'Document body',
  children: ['div', 'p', 'lg'],
  attributes: [],
};

/** TEI: root element */
const teiSpec: ElementSpec = {
  name: 'TEI',
  documentation: 'Root element',
  children: ['teiHeader', 'text'],
  attributes: [],
};

/** text: text container */
const textSpec: ElementSpec = {
  name: 'text',
  documentation: 'Text body',
  children: ['body', 'front', 'back'],
  attributes: [],
};

/** hi: highlighted text */
const hiSpec: ElementSpec = {
  name: 'hi',
  documentation: 'Highlighted text',
  children: [],
  attributes: [
    {
      name: 'rend',
      documentation: 'Rendition',
    },
  ],
};

/** abbr: abbreviation */
const abbrSpec: ElementSpec = {
  name: 'abbr',
  documentation: 'Abbreviation',
  children: [],
  attributes: [],
};

/** expan: expansion */
const expanSpec: ElementSpec = {
  name: 'expan',
  documentation: 'Expansion',
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
  textSpec,
  bodySpec,
  divSpec,
  pSpec,
  publicationStmtSpec,
  hiSpec,
  choiceSpec,
  abbrSpec,
  expanSpec,
];

// ============================================================================
// Test Suite: Required Children Validation
// ============================================================================

describe('Required Children Validation', () => {
  let schema: SchemaInfo;

  beforeEach(() => {
    schema = buildTestSchema(testElements);
  });

  describe('Test 1.1: teiHeader empty tag', () => {
    it('should warn that fileDesc is required', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader></teiHeader>
</TEI>`;
      const errors = validateXml(xml, schema);
      expect(errors.length).toBeGreaterThan(0);
      const fileDescError = errors.find(e => e.message.includes('fileDesc'));
      expect(fileDescError).toBeDefined();
      expect(fileDescError!.severity).toBe('warning');
    });
  });

  describe('Test 1.2: teiHeader self-closing', () => {
    it('should warn that self-closing requires children', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader/>
</TEI>`;
      const errors = validateXml(xml, schema);
      expect(errors.length).toBeGreaterThan(0);
      const selfClosingError = errors.find(e =>
        e.message.includes('self-closing') || e.message.includes('requires')
      );
      expect(selfClosingError).toBeDefined();
    });
  });

  describe('Test 1.3: fileDesc empty tag', () => {
    it('should warn that titleStmt is required', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc></fileDesc>
  </teiHeader>
</TEI>`;
      const errors = validateXml(xml, schema);
      const titleStmtError = errors.find(e => e.message.includes('titleStmt'));
      expect(titleStmtError).toBeDefined();
    });
  });

  describe('Test 1.4: Valid structure', () => {
    it('should have no errors for proper structure', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt>
        <title>Test Document</title>
      </titleStmt>
      <publicationStmt>
        <p>Published</p>
      </publicationStmt>
    </fileDesc>
  </teiHeader>
  <text>
    <body>
      <p>Content</p>
    </body>
  </text>
</TEI>`;
      const errors = validateXml(xml, schema);
      // Filter out warnings about missing optional elements
      const actualErrors = errors.filter(e => e.severity === 'error');
      expect(actualErrors.length).toBe(0);
    });
  });
});

// ============================================================================
// Test Suite: Choice Violation Validation
// ============================================================================

describe('Choice Violation Validation', () => {
  let schema: SchemaInfo;

  beforeEach(() => {
    schema = buildTestSchema(testElements);
  });

  describe('Test 2.1: choice violation (abbr + expan)', () => {
    it('should error when multiple choice branches are used', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt>
        <title>Test</title>
      </titleStmt>
      <publicationStmt><p>P</p></publicationStmt>
    </fileDesc>
  </teiHeader>
  <text>
    <body>
      <p>
        <choice>
          <abbr>A</abbr>
          <expan>B</expan>
        </choice>
      </p>
    </body>
  </text>
</TEI>`;
      const errors = validateXml(xml, schema);
      const choiceError = errors.find(e => e.message.includes('choice violation'));
      expect(choiceError).toBeDefined();
      expect(choiceError!.severity).toBe('error');
    });
  });

  describe('Test 2.2: Valid choice (abbr only)', () => {
    it('should have no errors with single choice branch', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt>
        <title>Test</title>
      </titleStmt>
      <publicationStmt><p>P</p></publicationStmt>
    </fileDesc>
  </teiHeader>
  <text>
    <body>
      <p>
        <choice>
          <abbr>A</abbr>
        </choice>
      </p>
    </body>
  </text>
</TEI>`;
      const errors = validateXml(xml, schema);
      const choiceErrors = errors.filter(e => e.message.includes('choice'));
      expect(choiceErrors.length).toBe(0);
    });
  });

  describe('Test 2.3: Valid choice (expan only)', () => {
    it('should have no errors with expan only', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt>
        <title>Test</title>
      </titleStmt>
      <publicationStmt><p>P</p></publicationStmt>
    </fileDesc>
  </teiHeader>
  <text>
    <body>
      <p>
        <choice>
          <expan>Expansion</expan>
        </choice>
      </p>
    </body>
  </text>
</TEI>`;
      const errors = validateXml(xml, schema);
      const choiceErrors = errors.filter(e => e.message.includes('choice'));
      expect(choiceErrors.length).toBe(0);
    });
  });
});

// ============================================================================
// Test Suite: Attribute Value Validation
// ============================================================================

describe('Attribute Value Validation', () => {
  let schema: SchemaInfo;

  beforeEach(() => {
    schema = buildTestSchema(testElements);
  });

  describe('Test 3.1: Invalid enum value', () => {
    it('should warn about invalid level value', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt>
        <title level="invalid">Test</title>
      </titleStmt>
      <publicationStmt><p>P</p></publicationStmt>
    </fileDesc>
  </teiHeader>
</TEI>`;
      const errors = validateXml(xml, schema);
      const levelError = errors.find(e =>
        e.message.includes('Invalid value') && e.message.includes('level')
      );
      expect(levelError).toBeDefined();
      expect(levelError!.severity).toBe('warning');
    });
  });

  describe('Test 3.2: Valid enum value', () => {
    it('should not error on valid level value', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt>
        <title level="m">Test</title>
      </titleStmt>
      <publicationStmt><p>P</p></publicationStmt>
    </fileDesc>
  </teiHeader>
</TEI>`;
      const errors = validateXml(xml, schema);
      const levelError = errors.find(e =>
        e.message.includes('Invalid value') && e.message.includes('level')
      );
      expect(levelError).toBeUndefined();
    });
  });

  describe('Test 3.3: Open attribute value (type)', () => {
    it('should allow any value for open attribute', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt>
        <title>Test</title>
      </titleStmt>
      <publicationStmt><p>P</p></publicationStmt>
    </fileDesc>
  </teiHeader>
  <text>
    <body>
      <div type="custom-value">
        <p>Content</p>
      </div>
    </body>
  </text>
</TEI>`;
      const errors = validateXml(xml, schema);
      // type attribute has no values array, so any value should be allowed
      const typeError = errors.find(e =>
        e.message.includes('Invalid value') && e.message.includes('type')
      );
      expect(typeError).toBeUndefined();
    });
  });

  describe('Test 3.4: rend attribute (open values)', () => {
    it('should allow any rend value', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt>
        <title>Test</title>
      </titleStmt>
      <publicationStmt><p>P</p></publicationStmt>
    </fileDesc>
  </teiHeader>
  <text>
    <body>
      <p><hi rend="bold">Bold text</hi></p>
    </body>
  </text>
</TEI>`;
      const errors = validateXml(xml, schema);
      const rendError = errors.find(e =>
        e.message.includes('Invalid value') && e.message.includes('rend')
      );
      expect(rendError).toBeUndefined();
    });
  });
});

// ============================================================================
// Test Suite: Invalid Nesting Validation
// ============================================================================

describe('Invalid Nesting Validation', () => {
  let schema: SchemaInfo;

  beforeEach(() => {
    schema = buildTestSchema(testElements);
  });

  describe('Test 4.1: p inside div (invalid)', () => {
    it('should error when div is inside p', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt>
        <title>Test</title>
      </titleStmt>
      <publicationStmt><p>P</p></publicationStmt>
    </fileDesc>
  </teiHeader>
  <text>
    <body>
      <p><div><p>Nested</p></div></p>
    </body>
  </text>
</TEI>`;
      const errors = validateXml(xml, schema);
      const nestingError = errors.find(e =>
        e.message.includes('div') && e.message.includes('not allowed')
      );
      expect(nestingError).toBeDefined();
      expect(nestingError!.severity).toBe('error');
    });
  });

  describe('Test 4.2: p directly in TEI (invalid)', () => {
    it('should error when p is directly inside TEI', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <p>Direct paragraph</p>
</TEI>`;
      const errors = validateXml(xml, schema);
      const nestingError = errors.find(e =>
        e.message.includes('p') && e.message.includes('not allowed')
      );
      expect(nestingError).toBeDefined();
    });
  });

  describe('Test 4.3: Valid nesting', () => {
    it('should not error on valid nesting', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt>
        <title>Test</title>
      </titleStmt>
      <publicationStmt><p>P</p></publicationStmt>
    </fileDesc>
  </teiHeader>
  <text>
    <body>
      <p>Valid paragraph</p>
    </body>
  </text>
</TEI>`;
      const errors = validateXml(xml, schema);
      const nestingErrors = errors.filter(e => e.message.includes('not allowed'));
      expect(nestingErrors.length).toBe(0);
    });
  });
});

// ============================================================================
// Test Suite: Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  let schema: SchemaInfo;

  beforeEach(() => {
    schema = buildTestSchema(testElements);
  });

  describe('Test 6.1: Empty document', () => {
    it('should not crash on empty content', () => {
      const errors = validateXml('', schema);
      expect(errors).toBeDefined();
      // Empty string may cause well-formedness error, which is fine
    });
  });

  describe('Test 6.2: XML declaration only', () => {
    it('should not crash on XML declaration alone', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>`;
      const errors = validateXml(xml, schema);
      expect(errors).toBeDefined();
    });
  });

  describe('Test 6.3: Deep nesting', () => {
    it('should handle deep nesting without error', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt>
        <title>Test</title>
      </titleStmt>
      <publicationStmt><p>P</p></publicationStmt>
    </fileDesc>
  </teiHeader>
  <text>
    <body>
      <div>
        <div>
          <div>
            <div>
              <div>
                <div>
                  <div>
                    <div>
                      <div>
                        <p>Deep content</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </body>
  </text>
</TEI>`;
      const errors = validateXml(xml, schema);
      // Should complete without throwing
      expect(errors).toBeDefined();
    });
  });

  describe('Test 6.4: Large document performance', () => {
    it('should validate large documents in reasonable time', () => {
      // Generate a document with 100 paragraphs
      const paragraphs = Array.from({ length: 100 }, (_, i) =>
        `      <p>Paragraph ${i + 1} with some content.</p>`
      ).join('\n');

      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt>
        <title>Test</title>
      </titleStmt>
      <publicationStmt><p>P</p></publicationStmt>
    </fileDesc>
  </teiHeader>
  <text>
    <body>
${paragraphs}
    </body>
  </text>
</TEI>`;

      const start = performance.now();
      const errors = validateXml(xml, schema);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(1000); // Should complete in under 1 second
      expect(errors).toBeDefined();
    });
  });
});

// ============================================================================
// Test Suite: getRequiredChildren Helper
// ============================================================================

describe('getRequiredChildren Helper', () => {
  it('should return required elements from sequence', () => {
    const model: ContentModel = {
      type: 'sequence',
      items: [
        { kind: 'element', name: 'fileDesc', minOccurs: 1, maxOccurs: 1 },
        { kind: 'element', name: 'encodingDesc', minOccurs: 0, maxOccurs: 1 },
      ],
      minOccurs: 1,
      maxOccurs: 1,
    };
    const required = getRequiredChildren(model);
    expect(required).toContain('fileDesc');
    expect(required).not.toContain('encodingDesc');
  });

  it('should return empty for choice model', () => {
    const model: ContentModel = {
      type: 'choice',
      items: [
        { kind: 'element', name: 'abbr', minOccurs: 1, maxOccurs: 1 },
        { kind: 'element', name: 'expan', minOccurs: 1, maxOccurs: 1 },
      ],
      minOccurs: 1,
      maxOccurs: 1,
    };
    const required = getRequiredChildren(model);
    expect(required.length).toBe(0);
  });

  it('should return empty for empty items', () => {
    const model: ContentModel = {
      type: 'sequence',
      items: [],
      minOccurs: 0,
      maxOccurs: 1,
    };
    const required = getRequiredChildren(model);
    expect(required.length).toBe(0);
  });
});

// ============================================================================
// Test Suite: validateContentModel Direct Tests
// ============================================================================

describe('validateContentModel Direct Tests', () => {
  it('should detect cardinality violation', () => {
    const parentSpec: ElementSpec = {
      name: 'titleStmt',
      children: ['title'],
      contentModel: {
        type: 'sequence',
        items: [
          { kind: 'element', name: 'title', minOccurs: 1, maxOccurs: 1 },
        ],
        minOccurs: 1,
        maxOccurs: 1,
      },
    };
    const children = [
      { name: 'title', line: 1 },
      { name: 'title', line: 2 }, // Extra title
    ];
    const errors = validateContentModel(parentSpec, children);
    const cardinalityError = errors.find(e => e.message.includes('at most 1'));
    expect(cardinalityError).toBeDefined();
  });

  it('should detect missing required element', () => {
    const parentSpec: ElementSpec = {
      name: 'titleStmt',
      children: ['title', 'author'],
      contentModel: {
        type: 'sequence',
        items: [
          { kind: 'element', name: 'title', minOccurs: 1, maxOccurs: 1 },
          { kind: 'element', name: 'author', minOccurs: 0, maxOccurs: 1 },
        ],
        minOccurs: 1,
        maxOccurs: 1,
      },
    };
    const children: { name: string; line: number }[] = [];
    const errors = validateContentModel(parentSpec, children);
    const missingError = errors.find(e => e.message.includes('title'));
    expect(missingError).toBeDefined();
  });

  it('should pass for valid content', () => {
    const parentSpec: ElementSpec = {
      name: 'titleStmt',
      children: ['title'],
      contentModel: {
        type: 'sequence',
        items: [
          { kind: 'element', name: 'title', minOccurs: 1, maxOccurs: Infinity },
        ],
        minOccurs: 1,
        maxOccurs: 1,
      },
    };
    const children = [
      { name: 'title', line: 1 },
      { name: 'title', line: 2 },
    ];
    const errors = validateContentModel(parentSpec, children);
    expect(errors.length).toBe(0);
  });
});

// ============================================================================
// Test Suite: TEI Schema Merging (getTeiAllElements)
// ============================================================================

describe('TEI Schema Merging', () => {
  it('should include children from both static and P5 definitions', () => {
    const teiAllElements = getTeiAllElements();
    const elementMap = new Map<string, ElementSpec>();
    for (const el of teiAllElements) {
      elementMap.set(el.name, el);
    }

    const lgElement = elementMap.get('lg');
    expect(lgElement).toBeDefined();
    expect(lgElement!.children).toBeDefined();

    // 'trailer' comes from static TEI Lite definition
    expect(lgElement!.children).toContain('trailer');
    // 'l' should be in both
    expect(lgElement!.children).toContain('l');
    // 'lg' (self-nesting) should be present
    expect(lgElement!.children).toContain('lg');
  });

  it('should validate trailer inside lg in TEI All schema', () => {
    // Build TEI All schema from merged elements
    const teiAllElements = getTeiAllElements();
    const elementMap = new Map<string, ElementSpec>();
    for (const el of teiAllElements) {
      elementMap.set(el.name, el);
    }
    const schema: SchemaInfo = {
      id: 'tei_all',
      name: 'TEI All',
      elements: teiAllElements,
      elementMap,
      hasSalveGrammar: false,
    };

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt><title>Test</title></titleStmt>
      <publicationStmt><p>Published</p></publicationStmt>
    </fileDesc>
  </teiHeader>
  <text>
    <body>
      <lg>
        <l>A line</l>
        <trailer>The end</trailer>
      </lg>
    </body>
  </text>
</TEI>`;

    const errors = validateXml(xml, schema);
    const trailerError = errors.find(e =>
      e.message.includes('trailer') && e.message.includes('not allowed')
    );
    expect(trailerError).toBeUndefined();
  });

  it('should validate lb inside lg in TEI All schema', () => {
    // Build TEI All schema from merged elements
    const teiAllElements = getTeiAllElements();
    const elementMap = new Map<string, ElementSpec>();
    for (const el of teiAllElements) {
      elementMap.set(el.name, el);
    }
    const schema: SchemaInfo = {
      id: 'tei_all',
      name: 'TEI All',
      elements: teiAllElements,
      elementMap,
      hasSalveGrammar: false,
    };

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt><title>Test</title></titleStmt>
      <publicationStmt><p>Published</p></publicationStmt>
    </fileDesc>
  </teiHeader>
  <text>
    <body>
      <lg>
        <lb/>
        <l>A line</l>
      </lg>
    </body>
  </text>
</TEI>`;

    const errors = validateXml(xml, schema);
    const lbError = errors.find(e =>
      e.message.includes('lb') && e.message.includes('not allowed')
    );
    expect(lbError).toBeUndefined();
  });
});
