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
import { getTeiAllElements, getTeiLiteElements } from '../src/schema/teiStaticSchema';
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

// ============================================================================
// Test Suite: Orphan/Unclosed Tag Detection
// ============================================================================

describe('Orphan and Unclosed Tag Detection', () => {
  let schema: SchemaInfo;

  beforeEach(() => {
    schema = buildTestSchema(testElements);
  });

  describe('Orphan closing tag detection', () => {
    it('should detect orphan closing tag without matching opening', () => {
      const xml = `<?xml version="1.0"?>
<TEI>
  <p>text</date></p>
</TEI>`;
      const errors = validateXml(xml, schema);
      const orphanError = errors.find(e =>
        e.message.includes('Orphan') && e.message.includes('</date>')
      );
      expect(orphanError).toBeDefined();
      expect(orphanError!.severity).toBe('error');
    });

    it('should detect multiple orphan closing tags', () => {
      const xml = `<?xml version="1.0"?>
<TEI>
  <p>text</persName></p>
  <p>more</date></p>
</TEI>`;
      const errors = validateXml(xml, schema);
      const orphanErrors = errors.filter(e => e.message.includes('Orphan'));
      expect(orphanErrors.length).toBeGreaterThanOrEqual(1);
    });

    it('should not report properly matched tags as orphans', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt><title>Test</title></titleStmt>
      <publicationStmt><p>P</p></publicationStmt>
    </fileDesc>
  </teiHeader>
  <text>
    <body>
      <p><date>2024</date></p>
    </body>
  </text>
</TEI>`;
      const errors = validateXml(xml, schema);
      const orphanError = errors.find(e => e.message.includes('Orphan'));
      expect(orphanError).toBeUndefined();
    });
  });

  describe('Unclosed tag detection', () => {
    it('should detect unclosed opening tag', () => {
      const xml = `<?xml version="1.0"?>
<TEI>
  <p><persName>text</p>
</TEI>`;
      const errors = validateXml(xml, schema);
      const unclosedError = errors.find(e =>
        e.message.includes('Unclosed') && e.message.includes('<persName>')
      );
      expect(unclosedError).toBeDefined();
    });
  });

  describe('Self-closing tags', () => {
    it('should not report self-closing tags as unclosed', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt><title>Test</title></titleStmt>
      <publicationStmt><p>P</p></publicationStmt>
    </fileDesc>
  </teiHeader>
  <text>
    <body>
      <p>Line break here<lb/>and continues</p>
    </body>
  </text>
</TEI>`;
      const errors = validateXml(xml, schema);
      const lbUnclosedError = errors.find(e =>
        e.message.includes('Unclosed') && e.message.includes('lb')
      );
      expect(lbUnclosedError).toBeUndefined();
    });
  });

  describe('Unclosed tag line number accuracy', () => {
    it('should report FIRST unclosed tag, not last (stack-based tracking)', () => {
      // Scenario from screenshot:
      // Line 2: <p>First unclosed (this should be reported)
      // Line 3: <p>Second</p> (properly closed)
      // Line 4: <p>Third</p> (properly closed)
      const xml = `<root>
<p>First unclosed
<p>Second</p>
<p>Third</p>
</root>`;
      const errors = validateXml(xml, null);
      const unclosedPError = errors.find(e =>
        e.message.includes('Unclosed') && e.message.includes('<p>')
      );
      expect(unclosedPError).toBeDefined();
      // Should report line 2 (first unclosed), NOT line 4 (last <p> occurrence)
      expect(unclosedPError!.line).toBe(2);
    });

    it('should handle multiple unclosed tags of the same name', () => {
      // Two unclosed <p> tags - should report the first one
      const xml = `<root>
<p>First unclosed
<p>Second also unclosed
</root>`;
      const errors = validateXml(xml, null);
      const unclosedPError = errors.find(e =>
        e.message.includes('Unclosed') && e.message.includes('<p>')
      );
      expect(unclosedPError).toBeDefined();
      // Should report line 2 (first unclosed)
      expect(unclosedPError!.line).toBe(2);
    });

    it('should handle multiple unclosed tags of different names', () => {
      const xml = `<root>
<div>
<p>Text
</root>`;
      const errors = validateXml(xml, null);

      // Both <div> and <p> are unclosed
      const divError = errors.find(e =>
        e.message.includes('Unclosed') && e.message.includes('<div>')
      );
      const pError = errors.find(e =>
        e.message.includes('Unclosed') && e.message.includes('<p>')
      );

      expect(divError).toBeDefined();
      expect(pError).toBeDefined();
      expect(divError!.line).toBe(2);
      expect(pError!.line).toBe(3);
    });

    it('should correctly identify unclosed tag with nested same-name tags', () => {
      // Complex nesting: outer <p> is unclosed, inner ones are closed
      const xml = `<root>
<p>Outer unclosed
  <p>Inner 1</p>
  <p>Inner 2</p>
</root>`;
      const errors = validateXml(xml, null);
      const unclosedPError = errors.find(e =>
        e.message.includes('Unclosed') && e.message.includes('<p>')
      );
      expect(unclosedPError).toBeDefined();
      // Should report line 2 (the outer unclosed <p>)
      expect(unclosedPError!.line).toBe(2);
    });
  });

  describe('Malformed tag detection (invalid element name)', () => {
    it('should find empty tag <> at correct line', () => {
      const xml = `<root>
<p>normal</p>
<p>text<>more</p>
</root>`;
      const errors = validateXml(xml, null);
      // The error should be on line 3 where <> appears
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].line).toBe(3);
    });

    it('should find malformed tag with space < > at correct line', () => {
      const xml = `<root>
<p>first</p>
<p>second</p>
<p>text< space</p>
</root>`;
      const errors = validateXml(xml, null);
      expect(errors.length).toBeGreaterThan(0);
      // Should be line 4 where "< " appears
      expect(errors[0].line).toBe(4);
    });
  });

  describe('TEI P5 Attribute Class Validation', () => {
    // Build TEI All schema
    const teiAllElements = getTeiAllElements();
    const teiAllElementMap = new Map<string, ElementSpec>();
    for (const el of teiAllElements) {
      teiAllElementMap.set(el.name, el);
    }
    const teiAllSchema: SchemaInfo = {
      id: 'tei_all',
      name: 'TEI All',
      elements: teiAllElements,
      elementMap: teiAllElementMap,
      hasSalveGrammar: false,
    };

    it('should allow @key on <term> (att.canonical)', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text><body><p><term key="keyword">test</term></p></body></text>
</TEI>`;
      const errors = validateXml(xml, teiAllSchema);
      const keyError = errors.find(e => e.message.includes('key'));
      expect(keyError).toBeUndefined();
    });

    it('should allow @ref on <term> (att.canonical)', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text><body><p><term ref="#def1">test</term></p></body></text>
</TEI>`;
      const errors = validateXml(xml, teiAllSchema);
      const refError = errors.find(e => e.message.includes('ref'));
      expect(refError).toBeUndefined();
    });

    it('should allow @when on <date> (att.datable.w3c)', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text><body><p><date when="2024-01-01">Jan 1</date></p></body></text>
</TEI>`;
      const errors = validateXml(xml, teiAllSchema);
      const whenError = errors.find(e => e.message.includes('when'));
      expect(whenError).toBeUndefined();
    });

    it('should allow @facs on <p> (att.global.facs)', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text><body><p facs="#img1">Text with facsimile reference</p></body></text>
</TEI>`;
      const errors = validateXml(xml, teiAllSchema);
      const facsError = errors.find(e => e.message.includes('facs'));
      expect(facsError).toBeUndefined();
    });

    it('should allow @role on <persName> (att.naming)', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text><body><p><persName role="author">John Smith</persName></p></body></text>
</TEI>`;
      const errors = validateXml(xml, teiAllSchema);
      const roleError = errors.find(e => e.message.includes('role'));
      expect(roleError).toBeUndefined();
    });

    it('should still warn on truly unknown attributes', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text><body><p><term unknownAttr="val">test</term></p></body></text>
</TEI>`;
      const errors = validateXml(xml, teiAllSchema);
      const unknownAttrError = errors.find(e => e.message.includes('unknownAttr'));
      expect(unknownAttrError).toBeDefined();
    });
  });
});

// ============================================================================
// Test Suite: Complete TEI Document Validation (TEI All Schema)
// ============================================================================

describe('Complete TEI Document Validation', () => {
  // Build TEI All schema once for all tests in this suite
  const teiAllElements = getTeiAllElements();
  const teiAllElementMap = new Map<string, ElementSpec>();
  for (const el of teiAllElements) {
    teiAllElementMap.set(el.name, el);
  }
  const teiAllSchema: SchemaInfo = {
    id: 'tei_all',
    name: 'TEI All',
    elements: teiAllElements,
    elementMap: teiAllElementMap,
    hasSalveGrammar: false,
  };

  describe('Scenario 1: Valid TEI Document', () => {
    it('validates minimal valid TEI document with no errors', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt><title>Test Document</title></titleStmt>
      <publicationStmt><p>Published for testing</p></publicationStmt>
    </fileDesc>
  </teiHeader>
  <text><body><p>Hello, world!</p></body></text>
</TEI>`;
      const errors = validateXml(xml, teiAllSchema);
      // Filter to actual errors (not warnings about optional missing elements)
      const actualErrors = errors.filter(e => e.severity === 'error');
      expect(actualErrors).toHaveLength(0);
    });

    it('validates TEI document with multiple body elements', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt><title>Multi-paragraph Test</title></titleStmt>
      <publicationStmt><p>Test</p></publicationStmt>
    </fileDesc>
  </teiHeader>
  <text>
    <body>
      <div type="chapter">
        <head>Chapter 1</head>
        <p>First paragraph.</p>
        <p>Second paragraph.</p>
      </div>
    </body>
  </text>
</TEI>`;
      const errors = validateXml(xml, teiAllSchema);
      const actualErrors = errors.filter(e => e.severity === 'error');
      expect(actualErrors).toHaveLength(0);
    });
  });

  describe('Scenario 2: Invalid Child Element Detection', () => {
    it('detects span inside body (not allowed)', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text>
    <body>
      <span>Not allowed element</span>
    </body>
  </text>
</TEI>`;
      const errors = validateXml(xml, teiAllSchema);
      const spanError = errors.find(e =>
        e.message.includes('span') && e.message.includes('not allowed')
      );
      expect(spanError).toBeDefined();
      expect(spanError!.severity).toBe('error');
    });

    it('detects div directly inside p (not allowed)', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text>
    <body>
      <p><div>Block inside inline</div></p>
    </body>
  </text>
</TEI>`;
      const errors = validateXml(xml, teiAllSchema);
      const divError = errors.find(e =>
        e.message.includes('div') && e.message.includes('not allowed')
      );
      expect(divError).toBeDefined();
      expect(divError!.severity).toBe('error');
    });

    it('allows valid child elements', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text>
    <body>
      <p>This is <hi rend="bold">highlighted</hi> text.</p>
    </body>
  </text>
</TEI>`;
      const errors = validateXml(xml, teiAllSchema);
      const hiError = errors.find(e =>
        e.message.includes('hi') && e.message.includes('not allowed')
      );
      expect(hiError).toBeUndefined();
    });
  });

  describe('Scenario 3: Unknown Element Detection', () => {
    it('warns about completely unknown elements', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text>
    <body>
      <customElement>This element doesn't exist in TEI</customElement>
    </body>
  </text>
</TEI>`;
      const errors = validateXml(xml, teiAllSchema);
      const customError = errors.find(e =>
        e.message.includes('Unknown element') && e.message.includes('customElement')
      );
      expect(customError).toBeDefined();
      expect(customError!.severity).toBe('warning');
    });

    it('warns about misspelled element names', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text>
    <body>
      <paragraf>Misspelled paragraph</paragraf>
    </body>
  </text>
</TEI>`;
      const errors = validateXml(xml, teiAllSchema);
      const paragrafError = errors.find(e =>
        e.message.includes('Unknown element') && e.message.includes('paragraf')
      );
      expect(paragrafError).toBeDefined();
    });

    it('does not warn about valid TEI elements', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text>
    <body>
      <p><persName>John Doe</persName> met <placeName>Paris</placeName>.</p>
    </body>
  </text>
</TEI>`;
      const errors = validateXml(xml, teiAllSchema);
      const unknownErrors = errors.filter(e => e.message.includes('Unknown element'));
      expect(unknownErrors).toHaveLength(0);
    });
  });

  describe('Scenario 4: Attribute Class Inheritance Validation', () => {
    it('allows @key on term (att.canonical inheritance)', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text><body><p><term key="technical-term">API</term></p></body></text>
</TEI>`;
      const errors = validateXml(xml, teiAllSchema);
      const keyWarning = errors.find(e =>
        e.message.includes('key') && e.severity === 'warning'
      );
      expect(keyWarning).toBeUndefined();
    });

    it('allows @when on date (att.datable.w3c inheritance)', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text><body><p>Born on <date when="1990-05-15">May 15, 1990</date>.</p></body></text>
</TEI>`;
      const errors = validateXml(xml, teiAllSchema);
      const whenWarning = errors.find(e =>
        e.message.includes('when') && e.severity === 'warning'
      );
      expect(whenWarning).toBeUndefined();
    });

    it('allows @from and @to on date (att.datable.w3c inheritance)', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text><body><p>Active <date from="2020-01-01" to="2024-12-31">from 2020 to 2024</date>.</p></body></text>
</TEI>`;
      const errors = validateXml(xml, teiAllSchema);
      const dateWarnings = errors.filter(e =>
        (e.message.includes('from') || e.message.includes('to')) && e.severity === 'warning'
      );
      expect(dateWarnings).toHaveLength(0);
    });

    it('allows @xml:id on any element (att.global)', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text><body><p xml:id="para1">A paragraph with ID.</p></body></text>
</TEI>`;
      const errors = validateXml(xml, teiAllSchema);
      const xmlIdWarning = errors.find(e =>
        e.message.includes('xml:id') && e.severity === 'warning'
      );
      expect(xmlIdWarning).toBeUndefined();
    });

    it('allows @n on any element (att.global)', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text><body><div n="1"><p n="1.1">Numbered content.</p></div></body></text>
</TEI>`;
      const errors = validateXml(xml, teiAllSchema);
      const nWarning = errors.find(e =>
        e.message.includes('"n"') && e.severity === 'warning'
      );
      expect(nWarning).toBeUndefined();
    });
  });

  describe('Scenario 5: Required Children Detection (using test schema)', () => {
    // Note: The TEI All schema from teiP5Generated.ts doesn't have contentModel
    // defined for most elements, so required children detection only works
    // with the test schema that has explicit contentModel definitions.
    // These tests use the test schema (from earlier in this file) instead.

    it('warns when fileDesc is missing required titleStmt (test schema)', () => {
      const testSchema = buildTestSchema(testElements);
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <publicationStmt><p>Published</p></publicationStmt>
    </fileDesc>
  </teiHeader>
</TEI>`;
      const errors = validateXml(xml, testSchema);
      const titleStmtWarning = errors.find(e =>
        e.message.includes('titleStmt') && e.message.includes('requires')
      );
      expect(titleStmtWarning).toBeDefined();
    });

    it('warns when empty fileDesc element (test schema)', () => {
      const testSchema = buildTestSchema(testElements);
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc></fileDesc>
  </teiHeader>
</TEI>`;
      const errors = validateXml(xml, testSchema);
      const requiredWarning = errors.find(e =>
        e.message.includes('requires') || e.message.includes('required')
      );
      expect(requiredWarning).toBeDefined();
    });

    it('validates without required children errors in TEI All (no contentModel)', () => {
      // TEI All schema doesn't have contentModel, so it won't check required children
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt><title>Complete</title></titleStmt>
      <publicationStmt><p>Published</p></publicationStmt>
    </fileDesc>
  </teiHeader>
</TEI>`;
      const errors = validateXml(xml, teiAllSchema);
      const requiredErrors = errors.filter(e =>
        e.message.includes('requires') && e.severity === 'error'
      );
      expect(requiredErrors).toHaveLength(0);
    });
  });

  describe('TEI P5 Element Coverage', () => {
    it('has 588 elements in TEI All schema', () => {
      expect(teiAllElements.length).toBe(588);
    });

    it('includes core TEI elements', () => {
      const coreElements = ['TEI', 'teiHeader', 'fileDesc', 'text', 'body', 'p', 'div'];
      for (const name of coreElements) {
        expect(teiAllElementMap.has(name)).toBe(true);
      }
    });

    it('includes manuscript description elements', () => {
      const msDescElements = ['msDesc', 'msContents', 'msItem', 'physDesc', 'history'];
      for (const name of msDescElements) {
        expect(teiAllElementMap.has(name)).toBe(true);
      }
    });

    it('includes names and dates elements', () => {
      const nameElements = ['persName', 'placeName', 'orgName', 'date', 'birth', 'death'];
      for (const name of nameElements) {
        expect(teiAllElementMap.has(name)).toBe(true);
      }
    });

    it('includes transcription elements', () => {
      const transcrElements = ['add', 'del', 'subst', 'gap', 'unclear', 'supplied'];
      for (const name of transcrElements) {
        expect(teiAllElementMap.has(name)).toBe(true);
      }
    });
  });
});

// ============================================================================
// Test Suite: TEI Lite Schema Validation
// ============================================================================

describe('TEI Lite Schema Validation', () => {
  // Build TEI Lite schema once for all tests
  const teiLiteElements = getTeiLiteElements();
  const teiLiteElementMap = new Map<string, ElementSpec>();
  for (const el of teiLiteElements) {
    teiLiteElementMap.set(el.name, el);
  }
  const teiLiteSchema: SchemaInfo = {
    id: 'tei_lite',
    name: 'TEI Lite',
    elements: teiLiteElements,
    elementMap: teiLiteElementMap,
    hasSalveGrammar: false,
  };

  // Build TEI All schema for comparison tests
  const teiAllElements = getTeiAllElements();
  const teiAllElementMap = new Map<string, ElementSpec>();
  for (const el of teiAllElements) {
    teiAllElementMap.set(el.name, el);
  }
  const teiAllSchema: SchemaInfo = {
    id: 'tei_all',
    name: 'TEI All',
    elements: teiAllElements,
    elementMap: teiAllElementMap,
    hasSalveGrammar: false,
  };

  describe('TEI Lite Element Coverage', () => {
    it('has exactly 106 elements in TEI Lite schema', () => {
      expect(teiLiteElements.length).toBe(106);
    });

    it('includes core TEI Lite elements', () => {
      const coreElements = ['TEI', 'teiHeader', 'fileDesc', 'body', 'p', 'persName', 'placeName', 'date'];
      for (const name of coreElements) {
        expect(teiLiteElementMap.has(name)).toBe(true);
      }
    });

    it('includes header elements', () => {
      const headerElements = ['teiHeader', 'fileDesc', 'titleStmt', 'publicationStmt', 'sourceDesc', 'encodingDesc', 'profileDesc', 'revisionDesc'];
      for (const name of headerElements) {
        expect(teiLiteElementMap.has(name)).toBe(true);
      }
    });

    it('includes text structure elements', () => {
      const structElements = ['text', 'front', 'body', 'back', 'div', 'p', 'ab', 'head'];
      for (const name of structElements) {
        expect(teiLiteElementMap.has(name)).toBe(true);
      }
    });

    it('includes poetry elements', () => {
      const poetryElements = ['lg', 'l'];
      for (const name of poetryElements) {
        expect(teiLiteElementMap.has(name)).toBe(true);
      }
    });

    it('includes drama elements', () => {
      const dramaElements = ['sp', 'speaker', 'stage'];
      for (const name of dramaElements) {
        expect(teiLiteElementMap.has(name)).toBe(true);
      }
    });

    it('includes editorial elements', () => {
      const editorialElements = ['choice', 'abbr', 'expan', 'orig', 'reg', 'sic', 'corr', 'add', 'del', 'subst', 'supplied', 'unclear', 'gap'];
      for (const name of editorialElements) {
        expect(teiLiteElementMap.has(name)).toBe(true);
      }
    });

    it('includes name and date elements', () => {
      const nameElements = ['name', 'persName', 'placeName', 'orgName', 'date', 'num', 'measure'];
      for (const name of nameElements) {
        expect(teiLiteElementMap.has(name)).toBe(true);
      }
    });

    it('includes milestone elements', () => {
      const milestoneElements = ['pb', 'lb', 'cb', 'milestone'];
      for (const name of milestoneElements) {
        expect(teiLiteElementMap.has(name)).toBe(true);
      }
    });
  });

  describe('TEI Lite vs TEI All Differences', () => {
    it('facsimile is known in TEI All but unknown in TEI Lite', () => {
      // facsimile is in TEI All (TEI_ALL_EXTRA_ELEMENTS) but should generate warning in TEI Lite
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader><fileDesc><titleStmt><title>Test</title></titleStmt><publicationStmt><p>P</p></publicationStmt></fileDesc></teiHeader>
  <facsimile><surface/></facsimile>
</TEI>`;

      const liteErrors = validateXml(xml, teiLiteSchema);
      const allErrors = validateXml(xml, teiAllSchema);

      // TEI Lite: should warn about unknown element
      const liteUnknownError = liteErrors.find(e => e.message.includes('Unknown') && e.message.includes('facsimile'));
      expect(liteUnknownError).toBeDefined();
      expect(liteUnknownError!.severity).toBe('warning');

      // TEI All: facsimile should be known (no Unknown error)
      const allUnknownError = allErrors.find(e => e.message.includes('Unknown') && e.message.includes('facsimile'));
      expect(allUnknownError).toBeUndefined();
    });

    it('surface is known in TEI All but unknown in TEI Lite', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <surface><zone/></surface>
</TEI>`;

      const liteErrors = validateXml(xml, teiLiteSchema);
      const allErrors = validateXml(xml, teiAllSchema);

      // TEI Lite: should warn about unknown element
      const liteUnknownError = liteErrors.find(e => e.message.includes('Unknown') && e.message.includes('surface'));
      expect(liteUnknownError).toBeDefined();

      // TEI All: surface should be known
      const allUnknownError = allErrors.find(e => e.message.includes('Unknown') && e.message.includes('surface'));
      expect(allUnknownError).toBeUndefined();
    });

    it('zone is known in TEI All but unknown in TEI Lite', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <zone/>
</TEI>`;

      const liteErrors = validateXml(xml, teiLiteSchema);
      const allErrors = validateXml(xml, teiAllSchema);

      // TEI Lite: should warn about unknown element
      const liteUnknownError = liteErrors.find(e => e.message.includes('Unknown') && e.message.includes('zone'));
      expect(liteUnknownError).toBeDefined();

      // TEI All: zone should be known
      const allUnknownError = allErrors.find(e => e.message.includes('Unknown') && e.message.includes('zone'));
      expect(allUnknownError).toBeUndefined();
    });

    it('both schemas accept standard p element', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text><body><p>Test paragraph</p></body></text>
</TEI>`;

      const liteErrors = validateXml(xml, teiLiteSchema);
      const allErrors = validateXml(xml, teiAllSchema);

      // Neither should report Unknown element for p
      const litePError = liteErrors.find(e => e.message.includes('Unknown') && e.message.includes('p'));
      const allPError = allErrors.find(e => e.message.includes('Unknown') && e.message.includes('p'));

      expect(litePError).toBeUndefined();
      expect(allPError).toBeUndefined();
    });
  });

  describe('TEI Lite Attribute Validation', () => {
    it('allows global attributes on all elements (xml:id)', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text><body><p xml:id="p1">Text</p></body></text>
</TEI>`;
      const errors = validateXml(xml, teiLiteSchema);
      const xmlIdError = errors.find(e => e.message.includes('xml:id'));
      expect(xmlIdError).toBeUndefined();
    });

    it('allows global attributes on all elements (n)', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text><body><p n="1">Text</p></body></text>
</TEI>`;
      const errors = validateXml(xml, teiLiteSchema);
      const nError = errors.find(e => e.message.includes('"n"'));
      expect(nError).toBeUndefined();
    });

    it('allows @when on date (att.datable.w3c inheritance)', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text><body><p><date when="2024-01-01">Today</date></p></body></text>
</TEI>`;
      const errors = validateXml(xml, teiLiteSchema);
      const whenError = errors.find(e => e.message.includes('when'));
      expect(whenError).toBeUndefined();
    });

    it('allows @notBefore and @notAfter on date (att.datable.w3c)', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text><body><p><date notBefore="1800" notAfter="1900">19th century</date></p></body></text>
</TEI>`;
      const errors = validateXml(xml, teiLiteSchema);
      const dateAttrErrors = errors.filter(e =>
        (e.message.includes('notBefore') || e.message.includes('notAfter')) && e.severity === 'warning'
      );
      expect(dateAttrErrors).toHaveLength(0);
    });

    it('allows @key on term (att.canonical)', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text><body><p><term key="keyword">Term</term></p></body></text>
</TEI>`;
      const errors = validateXml(xml, teiLiteSchema);
      const keyError = errors.find(e => e.message.includes('key'));
      expect(keyError).toBeUndefined();
    });

    it('allows @ref on term (att.canonical)', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text><body><p><term ref="#def1">Term</term></p></body></text>
</TEI>`;
      const errors = validateXml(xml, teiLiteSchema);
      const refError = errors.find(e => e.message.includes('"ref"') && e.message.includes('Unknown'));
      expect(refError).toBeUndefined();
    });

    it('allows @rend on hi (open value attribute)', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text><body><p><hi rend="bold">Bold text</hi></p></body></text>
</TEI>`;
      const errors = validateXml(xml, teiLiteSchema);
      const rendError = errors.find(e => e.message.includes('rend'));
      expect(rendError).toBeUndefined();
    });

    it('allows @target on ref element', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text><body><p><ref target="http://example.com">Link</ref></p></body></text>
</TEI>`;
      const errors = validateXml(xml, teiLiteSchema);
      const targetError = errors.find(e => e.message.includes('target'));
      expect(targetError).toBeUndefined();
    });

    it('warns on unknown attributes', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text><body><p unknownAttr="value">Text</p></body></text>
</TEI>`;
      const errors = validateXml(xml, teiLiteSchema);
      const unknownError = errors.find(e => e.message.includes('unknownAttr'));
      expect(unknownError).toBeDefined();
      expect(unknownError!.severity).toBe('warning');
    });

    it('validates @level enum values on title', () => {
      // Valid value
      const validXml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader><fileDesc><titleStmt><title level="m">Test</title></titleStmt><publicationStmt><p>P</p></publicationStmt></fileDesc></teiHeader>
</TEI>`;
      const validErrors = validateXml(validXml, teiLiteSchema);
      const validLevelError = validErrors.find(e => e.message.includes('Invalid value') && e.message.includes('level'));
      expect(validLevelError).toBeUndefined();

      // Invalid value
      const invalidXml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader><fileDesc><titleStmt><title level="invalid">Test</title></titleStmt><publicationStmt><p>P</p></publicationStmt></fileDesc></teiHeader>
</TEI>`;
      const invalidErrors = validateXml(invalidXml, teiLiteSchema);
      const invalidLevelError = invalidErrors.find(e => e.message.includes('Invalid value') && e.message.includes('level'));
      expect(invalidLevelError).toBeDefined();
      expect(invalidLevelError!.severity).toBe('warning');
    });
  });

  describe('TEI Lite Children Validation', () => {
    it('allows p inside body', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text><body><p>Text</p></body></text>
</TEI>`;
      const errors = validateXml(xml, teiLiteSchema);
      const pError = errors.find(e => e.message.includes('p') && e.message.includes('not allowed'));
      expect(pError).toBeUndefined();
    });

    it('allows div inside body', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text><body><div><p>Text</p></div></body></text>
</TEI>`;
      const errors = validateXml(xml, teiLiteSchema);
      const divError = errors.find(e => e.message.includes('div') && e.message.includes('not allowed'));
      expect(divError).toBeUndefined();
    });

    it('allows persName inside p', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text><body><p><persName>John Doe</persName></p></body></text>
</TEI>`;
      const errors = validateXml(xml, teiLiteSchema);
      const persNameError = errors.find(e => e.message.includes('persName') && e.message.includes('not allowed'));
      expect(persNameError).toBeUndefined();
    });

    it('errors when div is inside p (block inside inline)', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text><body><p><div>Block inside inline</div></p></body></text>
</TEI>`;
      const errors = validateXml(xml, teiLiteSchema);
      const divError = errors.find(e => e.message.includes('div') && e.message.includes('not allowed'));
      expect(divError).toBeDefined();
      expect(divError!.severity).toBe('error');
    });

    it('allows lg elements in body', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text><body><lg><l>A line of poetry</l></lg></body></text>
</TEI>`;
      const errors = validateXml(xml, teiLiteSchema);
      const lgError = errors.find(e => e.message.includes('lg') && e.message.includes('not allowed'));
      expect(lgError).toBeUndefined();
    });

    it('allows l inside lg', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text><body><lg><l>Line 1</l><l>Line 2</l></lg></body></text>
</TEI>`;
      const errors = validateXml(xml, teiLiteSchema);
      const lError = errors.find(e => e.message.includes('"l"') && e.message.includes('not allowed'));
      expect(lError).toBeUndefined();
    });

    it('allows nested lg elements', () => {
      const xml = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text><body><lg><lg><l>Nested line</l></lg></lg></body></text>
</TEI>`;
      const errors = validateXml(xml, teiLiteSchema);
      const nestedLgError = errors.find(e => e.message.includes('lg') && e.message.includes('not allowed'));
      expect(nestedLgError).toBeUndefined();
    });
  });

  describe('TEI Lite Valid Document Scenarios', () => {
    it('validates minimal valid TEI Lite document', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt><title>Test Document</title></titleStmt>
      <publicationStmt><p>Published</p></publicationStmt>
    </fileDesc>
  </teiHeader>
  <text><body><p>Hello, world!</p></body></text>
</TEI>`;
      const errors = validateXml(xml, teiLiteSchema);
      const actualErrors = errors.filter(e => e.severity === 'error');
      expect(actualErrors).toHaveLength(0);
    });

    it('validates TEI Lite document with multiple div sections', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt><title>Multi-section Document</title></titleStmt>
      <publicationStmt><p>Test</p></publicationStmt>
    </fileDesc>
  </teiHeader>
  <text>
    <body>
      <div type="chapter">
        <head>Chapter 1</head>
        <p>First paragraph.</p>
        <p>Second paragraph.</p>
      </div>
      <div type="chapter">
        <head>Chapter 2</head>
        <p>Another chapter.</p>
      </div>
    </body>
  </text>
</TEI>`;
      const errors = validateXml(xml, teiLiteSchema);
      const actualErrors = errors.filter(e => e.severity === 'error');
      expect(actualErrors).toHaveLength(0);
    });

    it('validates TEI Lite document with named entities', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt><title>Named Entities Test</title></titleStmt>
      <publicationStmt><p>Test</p></publicationStmt>
    </fileDesc>
  </teiHeader>
  <text>
    <body>
      <p><persName>홍길동</persName>은 <placeName>서울</placeName>에서 <orgName>조선</orgName>을 위해 일했다.</p>
      <p>그는 <date when="1500-01-01">1500년</date>에 태어났다.</p>
    </body>
  </text>
</TEI>`;
      const errors = validateXml(xml, teiLiteSchema);
      const actualErrors = errors.filter(e => e.severity === 'error');
      expect(actualErrors).toHaveLength(0);
    });

    it('validates TEI Lite document with poetry structure', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt><title>Poetry Test</title></titleStmt>
      <publicationStmt><p>Test</p></publicationStmt>
    </fileDesc>
  </teiHeader>
  <text>
    <body>
      <lg type="poem">
        <head>A Poem</head>
        <lg type="stanza">
          <l>First line of the poem</l>
          <l>Second line of the poem</l>
        </lg>
        <lg type="stanza">
          <l>Third line of the poem</l>
          <l>Fourth line of the poem</l>
        </lg>
      </lg>
    </body>
  </text>
</TEI>`;
      const errors = validateXml(xml, teiLiteSchema);
      const actualErrors = errors.filter(e => e.severity === 'error');
      expect(actualErrors).toHaveLength(0);
    });

    it('validates TEI Lite document with editorial interventions', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt><title>Editorial Test</title></titleStmt>
      <publicationStmt><p>Test</p></publicationStmt>
    </fileDesc>
  </teiHeader>
  <text>
    <body>
      <p>This has a <choice><sic>teh</sic><corr>the</corr></choice> correction.</p>
      <p>This word was <del>removed</del><add>added</add>.</p>
      <p>There is a <gap reason="illegible" extent="5" unit="chars"/> here.</p>
      <p>The text is <unclear>hard to read</unclear>.</p>
    </body>
  </text>
</TEI>`;
      const errors = validateXml(xml, teiLiteSchema);
      const actualErrors = errors.filter(e => e.severity === 'error');
      expect(actualErrors).toHaveLength(0);
    });
  });

  describe('TEI Lite P5 Attribute Class Integration', () => {
    it('term element has P5 attribute classes merged', () => {
      // term should have key and ref from att.canonical class
      const termSpec = teiLiteElementMap.get('term');
      expect(termSpec).toBeDefined();
      expect(termSpec!.attributes).toBeDefined();

      const attrNames = termSpec!.attributes!.map(a => a.name);
      expect(attrNames).toContain('key');
      expect(attrNames).toContain('ref');
    });

    it('date element has P5 datable attributes merged', () => {
      // date should have when, notBefore, notAfter from att.datable.w3c
      const dateSpec = teiLiteElementMap.get('date');
      expect(dateSpec).toBeDefined();
      expect(dateSpec!.attributes).toBeDefined();

      const attrNames = dateSpec!.attributes!.map(a => a.name);
      expect(attrNames).toContain('when');
      expect(attrNames).toContain('notBefore');
      expect(attrNames).toContain('notAfter');
    });

    it('p element has global attributes', () => {
      const pSpec = teiLiteElementMap.get('p');
      expect(pSpec).toBeDefined();
      expect(pSpec!.attributes).toBeDefined();

      const attrNames = pSpec!.attributes!.map(a => a.name);
      expect(attrNames).toContain('xml:id');
      expect(attrNames).toContain('n');
      expect(attrNames).toContain('type');
      expect(attrNames).toContain('rend');
    });
  });
});
