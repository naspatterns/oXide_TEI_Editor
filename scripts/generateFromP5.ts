#!/usr/bin/env npx tsx
/**
 * TEI P5 Schema Generator
 *
 * Parses TEI's p5subset.json to extract:
 * - All 580+ element definitions
 * - All 85 attribute classes
 * - Element-to-class membership mappings
 * - Content model structures
 *
 * Output: src/schema/teiP5Generated.ts
 *
 * Usage:
 *   npm run generate-p5-schema           # Use local file or download
 *   npm run generate-p5-schema:download  # Force download from TEI-C
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { fileURLToPath } from 'url';

// ES Module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// TEI Consortium's official p5subset.json URL
const P5_SUBSET_URL = 'https://tei-c.org/release/xml/tei/odd/p5subset.json';
const P5_LOCAL_PATH = path.join(__dirname, '..', 'data', 'p5subset.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'src', 'schema', 'teiP5Generated.ts');

// ============================================================================
// Types for p5subset.json structure (actual structure from TEI-C)
// ============================================================================

interface P5Subset {
  title: string;
  edition: string;
  generator: string;
  date: string;
  modules: P5Module[];
  elements: P5ElementSpec[];
  classes: {
    models: P5ClassSpec[];
    attributes: P5ClassSpec[];
  };
  macros: P5MacroSpec[];
  datatypes: P5DatatypeSpec[];
}

interface P5Module {
  ident: string;
  id: string;
  desc?: string[];
  shortDesc?: string;
}

interface P5ClassSpec {
  ident: string;
  type: string;
  module: string;
  desc?: string[];
  shortDesc?: string;
  gloss?: string[];
  classes?: {
    model: string[];
    atts: string[];
    unknown: string[];
  };
  attributes?: P5AttDef[];
}

interface P5ElementSpec {
  ident: string;
  type: string;
  module: string;
  desc?: string[];
  shortDesc?: string;
  gloss?: string[];
  classes?: {
    model: string[];
    atts: string[];
    unknown: string[];
  };
  attributes?: P5AttDef[];
  content?: P5Content[];
}

interface P5MacroSpec {
  ident: string;
  module: string;
  type: string;
  desc?: string[];
  shortDesc?: string;
  content?: P5Content[];
}

interface P5DatatypeSpec {
  ident: string;
  type: string;
  module: string;
  desc?: string[];
  shortDesc?: string;
}

interface P5AttDef {
  onElement: boolean;
  ident: string;
  mode: string;
  ns: string;
  usage?: string; // 'req' | 'opt' | 'rec'
  desc?: string[];
  shortDesc?: string;
  gloss?: string[];
  datatype?: {
    min?: string;
    max?: string;
    dataRef?: { key?: string; name?: string };
  };
  valList?: {
    type: 'closed' | 'semi' | 'open';
    valItem: { ident: string; desc?: string[]; shortDesc?: string }[];
  };
  defaultVal?: string;
}

interface P5Content {
  type: string; // 'sequence' | 'alternate' | 'elementRef' | 'classRef' | 'macroRef' | 'textNode' | 'empty' | 'anyElement'
  key?: string;
  minOccurs?: string;
  maxOccurs?: string;
  content?: P5Content[];
}

// ============================================================================
// Output types
// ============================================================================

interface AttrSpec {
  name: string;
  required?: boolean;
  values?: string[];
  defaultValue?: string;
  documentation?: string;
  datatype?: string;
}

interface ElementDef {
  name: string;
  documentation?: string;
  attrClasses: string[];
  modelClasses: string[];
  localAttrs: AttrSpec[];
  children: string[];
  contentModelType?: 'sequence' | 'choice' | 'interleave' | 'mixed' | 'empty';
  contentModel?: ContentModel;  // NEW: Full content model structure
}

// Import ContentModel types for output generation
interface ContentModel {
  type: 'sequence' | 'choice' | 'interleave' | 'group' | 'element' | 'text' | 'empty';
  items?: ContentItem[];
  minOccurs: number;
  maxOccurs: number;
}

interface ContentItem {
  kind: 'element' | 'text' | 'group' | 'model';
  name?: string;
  content?: ContentModel;
  minOccurs: number;
  maxOccurs: number;
}

interface AttrClassDef {
  name: string;
  documentation?: string;
  inherits: string[];
  attrs: AttrSpec[];
}

// ============================================================================
// Download and load
// ============================================================================

async function downloadP5Subset(): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log(`Downloading p5subset.json from ${P5_SUBSET_URL}...`);

    const fetch = (url: string) => {
      https.get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const redirectUrl = res.headers.location;
          if (redirectUrl) {
            fetch(redirectUrl);
            return;
          }
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
        res.on('error', reject);
      }).on('error', reject);
    };

    fetch(P5_SUBSET_URL);
  });
}

async function loadP5Subset(forceDownload: boolean): Promise<P5Subset> {
  let jsonStr: string;

  const dataDir = path.dirname(P5_LOCAL_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (forceDownload || !fs.existsSync(P5_LOCAL_PATH)) {
    jsonStr = await downloadP5Subset();
    fs.writeFileSync(P5_LOCAL_PATH, jsonStr);
    console.log(`Saved to ${P5_LOCAL_PATH}`);
  } else {
    console.log(`Loading from ${P5_LOCAL_PATH}...`);
    jsonStr = fs.readFileSync(P5_LOCAL_PATH, 'utf-8');
  }

  return JSON.parse(jsonStr);
}

// ============================================================================
// Parsing logic
// ============================================================================

function extractDescription(spec: { desc?: string[]; shortDesc?: string }): string | undefined {
  if (spec.shortDesc) {
    return spec.shortDesc.replace(/\n/g, ' ').trim();
  }
  if (spec.desc && spec.desc[0]) {
    // Extract text from XML desc element
    const match = spec.desc[0].match(/>([^<]+)</);
    if (match) return match[1].trim();
  }
  return undefined;
}

function extractAttrSpec(attDef: P5AttDef): AttrSpec {
  const spec: AttrSpec = {
    name: attDef.ident,
    required: attDef.usage === 'req',
    documentation: attDef.shortDesc?.replace(/\n/g, ' ').trim(),
  };

  // Extract enumerated values
  if (attDef.valList?.valItem) {
    spec.values = attDef.valList.valItem.map(v => v.ident);
  }

  // Extract datatype
  if (attDef.datatype?.dataRef?.key) {
    spec.datatype = attDef.datatype.dataRef.key;
  } else if (attDef.datatype?.dataRef?.name) {
    spec.datatype = attDef.datatype.dataRef.name;
  }

  // Default value
  if (attDef.defaultVal) {
    spec.defaultValue = attDef.defaultVal;
  }

  return spec;
}

function extractChildrenFromContent(
  content: P5Content[] | undefined,
  macros: Map<string, P5MacroSpec>,
  modelClasses: Map<string, P5ClassSpec>,
  elementsByModel: Map<string, string[]>,
  visited: Set<string> = new Set()
): string[] {
  if (!content || content.length === 0) return [];

  const children: string[] = [];

  for (const item of content) {
    switch (item.type) {
      case 'elementRef':
        if (item.key) {
          children.push(item.key);
        }
        break;

      case 'classRef':
        if (item.key) {
          // Expand model class to its member elements
          const members = elementsByModel.get(item.key);
          if (members) {
            children.push(...members);
          }
        }
        break;

      case 'macroRef':
        if (item.key && !visited.has(item.key)) {
          visited.add(item.key);
          const macro = macros.get(item.key);
          if (macro?.content) {
            children.push(...extractChildrenFromContent(
              macro.content, macros, modelClasses, elementsByModel, visited
            ));
          }
        }
        break;

      case 'sequence':
      case 'alternate':
      case 'interleave':
        if (item.content) {
          children.push(...extractChildrenFromContent(
            item.content, macros, modelClasses, elementsByModel, visited
          ));
        }
        break;
    }
  }

  return [...new Set(children)]; // Dedupe
}

function getContentModelType(content: P5Content[] | undefined): ElementDef['contentModelType'] {
  if (!content || content.length === 0) return 'empty';

  for (const item of content) {
    if (item.type === 'sequence') return 'sequence';
    if (item.type === 'alternate') return 'choice';
    if (item.type === 'interleave') return 'interleave';
    if (item.type === 'textNode') return 'mixed';
    if (item.type === 'empty') return 'empty';
  }

  // Check nested content
  for (const item of content) {
    if (item.content) {
      const nested = getContentModelType(item.content);
      if (nested && nested !== 'empty') return nested;
    }
  }

  return undefined;
}

// ============================================================================
// Phase 1: Full ContentModel Extraction
// ============================================================================

/**
 * Extract full ContentModel from P5Content array.
 * Preserves minOccurs/maxOccurs information for accurate validation.
 */
function extractFullContentModel(
  content: P5Content[] | undefined,
  macros: Map<string, P5MacroSpec>,
  modelClasses: Map<string, P5ClassSpec>,
  elementsByModel: Map<string, string[]>,
  visited: Set<string> = new Set()
): ContentModel | undefined {
  if (!content || content.length === 0) {
    return { type: 'empty', minOccurs: 0, maxOccurs: 1 };
  }

  // Single item - convert directly
  if (content.length === 1) {
    return convertP5ContentToModel(content[0], macros, modelClasses, elementsByModel, visited);
  }

  // Multiple items - wrap in sequence
  const items: ContentItem[] = [];
  for (const item of content) {
    const converted = convertP5ContentToItem(item, macros, modelClasses, elementsByModel, visited);
    if (converted) items.push(converted);
  }

  if (items.length === 0) {
    return { type: 'empty', minOccurs: 0, maxOccurs: 1 };
  }

  return {
    type: 'sequence',
    items,
    minOccurs: 1,
    maxOccurs: 1,
  };
}

/**
 * Convert a single P5Content item to a ContentModel.
 */
function convertP5ContentToModel(
  item: P5Content,
  macros: Map<string, P5MacroSpec>,
  modelClasses: Map<string, P5ClassSpec>,
  elementsByModel: Map<string, string[]>,
  visited: Set<string>
): ContentModel | undefined {
  const minOccurs = item.minOccurs ? parseInt(item.minOccurs, 10) : 1;
  const maxOccurs = item.maxOccurs === 'unbounded' ? Infinity :
                    item.maxOccurs ? parseInt(item.maxOccurs, 10) : 1;

  switch (item.type) {
    case 'sequence':
      return {
        type: 'sequence',
        items: item.content?.map(c => convertP5ContentToItem(c, macros, modelClasses, elementsByModel, visited)).filter((x): x is ContentItem => x !== undefined) ?? [],
        minOccurs,
        maxOccurs,
      };

    case 'alternate':
      return {
        type: 'choice',
        items: item.content?.map(c => convertP5ContentToItem(c, macros, modelClasses, elementsByModel, visited)).filter((x): x is ContentItem => x !== undefined) ?? [],
        minOccurs,
        maxOccurs,
      };

    case 'interleave':
      return {
        type: 'interleave',
        items: item.content?.map(c => convertP5ContentToItem(c, macros, modelClasses, elementsByModel, visited)).filter((x): x is ContentItem => x !== undefined) ?? [],
        minOccurs,
        maxOccurs,
      };

    case 'empty':
      return { type: 'empty', minOccurs: 0, maxOccurs: 0 };

    case 'textNode':
      return { type: 'text', minOccurs, maxOccurs };

    case 'elementRef':
      if (item.key) {
        return {
          type: 'element',
          items: [{ kind: 'element', name: item.key, minOccurs, maxOccurs }],
          minOccurs,
          maxOccurs,
        };
      }
      return undefined;

    case 'classRef':
      // Expand model class to its member elements
      if (item.key) {
        const members = elementsByModel.get(item.key);
        if (members && members.length > 0) {
          return {
            type: 'choice',
            items: members.map(m => ({ kind: 'element' as const, name: m, minOccurs: 1, maxOccurs: 1 })),
            minOccurs,
            maxOccurs,
          };
        }
      }
      return undefined;

    case 'macroRef':
      // Expand macro (prevent circular references)
      if (item.key && !visited.has(item.key)) {
        visited.add(item.key);
        const macro = macros.get(item.key);
        if (macro?.content) {
          const expanded = extractFullContentModel(macro.content, macros, modelClasses, elementsByModel, new Set(visited));
          if (expanded) {
            return {
              ...expanded,
              minOccurs,
              maxOccurs,
            };
          }
        }
      }
      return undefined;

    default:
      return undefined;
  }
}

/**
 * Convert a P5Content item to a ContentItem (for use within a parent model).
 */
function convertP5ContentToItem(
  item: P5Content,
  macros: Map<string, P5MacroSpec>,
  modelClasses: Map<string, P5ClassSpec>,
  elementsByModel: Map<string, string[]>,
  visited: Set<string>
): ContentItem | undefined {
  const minOccurs = item.minOccurs ? parseInt(item.minOccurs, 10) : 1;
  const maxOccurs = item.maxOccurs === 'unbounded' ? Infinity :
                    item.maxOccurs ? parseInt(item.maxOccurs, 10) : 1;

  switch (item.type) {
    case 'elementRef':
      return item.key ? { kind: 'element', name: item.key, minOccurs, maxOccurs } : undefined;

    case 'classRef':
      // Model class reference -> expand to member elements as choice
      if (item.key) {
        const members = elementsByModel.get(item.key);
        if (members && members.length > 0) {
          return {
            kind: 'group',
            content: {
              type: 'choice',
              items: members.map(m => ({ kind: 'element' as const, name: m, minOccurs: 1, maxOccurs: 1 })),
              minOccurs: 1,
              maxOccurs: 1,
            },
            minOccurs,
            maxOccurs,
          };
        }
      }
      return undefined;

    case 'macroRef':
      // Expand macro (prevent circular references)
      if (item.key && !visited.has(item.key)) {
        visited.add(item.key);
        const macro = macros.get(item.key);
        if (macro?.content) {
          const expanded = extractFullContentModel(macro.content, macros, modelClasses, elementsByModel, new Set(visited));
          if (expanded) {
            return { kind: 'group', content: expanded, minOccurs, maxOccurs };
          }
        }
      }
      return undefined;

    case 'sequence':
    case 'alternate':
    case 'interleave': {
      const nested = convertP5ContentToModel(item, macros, modelClasses, elementsByModel, visited);
      if (nested) {
        return { kind: 'group', content: nested, minOccurs, maxOccurs };
      }
      return undefined;
    }

    case 'textNode':
      return { kind: 'text', minOccurs, maxOccurs };

    default:
      return undefined;
  }
}

function parseP5(p5: P5Subset): {
  elements: ElementDef[];
  attrClasses: AttrClassDef[];
} {
  const elements: ElementDef[] = [];
  const attrClasses: AttrClassDef[] = [];

  // Build helper maps
  const macros = new Map<string, P5MacroSpec>();
  const modelClasses = new Map<string, P5ClassSpec>();
  const elementsByModel = new Map<string, string[]>(); // model class -> element names

  // Collect macros
  for (const macro of p5.macros) {
    macros.set(macro.ident, macro);
  }

  // Collect model classes
  for (const cls of p5.classes.models) {
    modelClasses.set(cls.ident, cls);
    elementsByModel.set(cls.ident, []);
  }

  // First pass: collect elements and their model class memberships
  for (const elSpec of p5.elements) {
    const modelMembership = elSpec.classes?.model ?? [];
    for (const modelClass of modelMembership) {
      const members = elementsByModel.get(modelClass);
      if (members) {
        members.push(elSpec.ident);
      }
    }
  }

  // Parse attribute classes
  for (const cls of p5.classes.attributes) {
    const attrClass: AttrClassDef = {
      name: cls.ident,
      documentation: extractDescription(cls),
      inherits: cls.classes?.atts ?? [],
      attrs: (cls.attributes ?? []).map(extractAttrSpec),
    };
    attrClasses.push(attrClass);
  }

  // Parse elements
  for (const elSpec of p5.elements) {
    const element: ElementDef = {
      name: elSpec.ident,
      documentation: extractDescription(elSpec),
      attrClasses: elSpec.classes?.atts ?? [],
      modelClasses: elSpec.classes?.model ?? [],
      localAttrs: (elSpec.attributes ?? []).map(extractAttrSpec),
      children: extractChildrenFromContent(
        elSpec.content, macros, modelClasses, elementsByModel
      ).sort(),
      contentModelType: getContentModelType(elSpec.content),
      // NEW: Extract full content model structure
      contentModel: extractFullContentModel(
        elSpec.content, macros, modelClasses, elementsByModel
      ),
    };
    elements.push(element);
  }

  return { elements, attrClasses };
}

// ============================================================================
// Code generation
// ============================================================================

function escapeString(s: string | undefined): string {
  if (!s) return '';
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 200);
}

/**
 * Serialize ContentModel to TypeScript object literal.
 * Handles Infinity serialization and deep nesting.
 */
function serializeContentModel(model: ContentModel): string | null {
  if (!model || model.type === 'empty') return null;

  const parts: string[] = [];
  parts.push(`type: '${model.type}'`);

  if (model.items && model.items.length > 0) {
    const itemStrs = model.items.map(item => serializeContentItem(item)).filter(Boolean);
    if (itemStrs.length > 0) {
      parts.push(`items: [${itemStrs.join(', ')}]`);
    }
  }

  parts.push(`minOccurs: ${model.minOccurs}`);
  parts.push(`maxOccurs: ${model.maxOccurs === Infinity ? 'Infinity' : model.maxOccurs}`);

  return `{ ${parts.join(', ')} }`;
}

/**
 * Serialize a ContentItem to TypeScript object literal.
 */
function serializeContentItem(item: ContentItem): string {
  const parts: string[] = [];
  parts.push(`kind: '${item.kind}'`);

  if (item.name) {
    parts.push(`name: '${item.name}'`);
  }

  if (item.content) {
    const nested = serializeContentModel(item.content);
    if (nested) {
      parts.push(`content: ${nested}`);
    }
  }

  parts.push(`minOccurs: ${item.minOccurs}`);
  parts.push(`maxOccurs: ${item.maxOccurs === Infinity ? 'Infinity' : item.maxOccurs}`);

  return `{ ${parts.join(', ')} }`;
}

function generateAttrSpecCode(attr: AttrSpec): string {
  const parts = [`name: '${attr.name}'`];

  if (attr.required) {
    parts.push('required: true');
  }

  if (attr.values && attr.values.length > 0 && attr.values.length <= 20) {
    parts.push(`values: [${attr.values.map(v => `'${escapeString(v)}'`).join(', ')}]`);
  }

  if (attr.documentation) {
    parts.push(`documentation: '${escapeString(attr.documentation)}'`);
  }

  if (attr.datatype) {
    parts.push(`datatype: '${attr.datatype}'`);
  }

  return `{ ${parts.join(', ')} }`;
}

function generateTypeScript(
  elements: ElementDef[],
  attrClasses: AttrClassDef[],
): string {
  const lines: string[] = [];

  lines.push(`/**
 * AUTO-GENERATED FILE - DO NOT EDIT
 *
 * Generated from TEI P5 p5subset.json
 * Contains ${elements.length} element definitions and ${attrClasses.length} attribute classes
 *
 * Run 'npm run generate-p5-schema' to regenerate
 */

import type { AttrSpec, ContentModel } from '../types/schema';

`);

  // Generate attribute classes
  lines.push('// ============================================================================');
  lines.push(`// TEI Attribute Classes (${attrClasses.length} classes defining shared attributes)`);
  lines.push('// ============================================================================');
  lines.push('');
  lines.push('export const TEI_ATTRIBUTE_CLASSES: Record<string, AttrSpec[]> = {');

  for (const cls of attrClasses.sort((a, b) => a.name.localeCompare(b.name))) {
    if (cls.attrs.length === 0) continue;
    lines.push(`  '${cls.name}': [`);
    for (const attr of cls.attrs) {
      lines.push(`    ${generateAttrSpecCode(attr)},`);
    }
    lines.push('  ],');
  }

  lines.push('};');
  lines.push('');

  // Generate class inheritance map
  lines.push('// ============================================================================');
  lines.push('// Attribute Class Inheritance');
  lines.push('// ============================================================================');
  lines.push('');
  lines.push('export const TEI_ATTR_CLASS_INHERITANCE: Record<string, string[]> = {');

  for (const cls of attrClasses.sort((a, b) => a.name.localeCompare(b.name))) {
    if (cls.inherits.length === 0) continue;
    lines.push(`  '${cls.name}': [${cls.inherits.map(i => `'${i}'`).join(', ')}],`);
  }

  lines.push('};');
  lines.push('');

  // Generate element-to-class mappings
  lines.push('// ============================================================================');
  lines.push('// Element-to-Attribute-Class Mappings');
  lines.push('// ============================================================================');
  lines.push('');
  lines.push('export const TEI_ELEMENT_CLASSES: Record<string, string[]> = {');

  for (const el of elements.sort((a, b) => a.name.localeCompare(b.name))) {
    if (el.attrClasses.length > 0) {
      lines.push(`  '${el.name}': [${el.attrClasses.map(c => `'${c}'`).join(', ')}],`);
    }
  }

  lines.push('};');
  lines.push('');

  // Generate element definitions
  lines.push('// ============================================================================');
  lines.push(`// TEI P5 Element Definitions (${elements.length} elements)`);
  lines.push('// ============================================================================');
  lines.push('');
  lines.push('export interface P5ElementDef {');
  lines.push('  name: string;');
  lines.push('  documentation?: string;');
  lines.push('  children: string[];');
  lines.push('  localAttrs: AttrSpec[];');
  lines.push("  contentModelType?: 'sequence' | 'choice' | 'interleave' | 'mixed' | 'empty';");
  lines.push('  contentModel?: ContentModel;  // Full content model structure for validation');
  lines.push('}');
  lines.push('');
  lines.push('export const TEI_P5_ELEMENTS: P5ElementDef[] = [');

  for (const el of elements.sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push('  {');
    lines.push(`    name: '${el.name}',`);

    if (el.documentation) {
      lines.push(`    documentation: '${escapeString(el.documentation)}',`);
    }

    if (el.children.length > 0) {
      if (el.children.length > 10) {
        lines.push('    children: [');
        for (let i = 0; i < el.children.length; i += 10) {
          const chunk = el.children.slice(i, i + 10);
          lines.push(`      ${chunk.map(c => `'${c}'`).join(', ')},`);
        }
        lines.push('    ],');
      } else {
        lines.push(`    children: [${el.children.map(c => `'${c}'`).join(', ')}],`);
      }
    } else {
      lines.push('    children: [],');
    }

    if (el.localAttrs.length > 0) {
      lines.push('    localAttrs: [');
      for (const attr of el.localAttrs) {
        lines.push(`      ${generateAttrSpecCode(attr)},`);
      }
      lines.push('    ],');
    } else {
      lines.push('    localAttrs: [],');
    }

    if (el.contentModelType) {
      lines.push(`    contentModelType: '${el.contentModelType}',`);
    }

    // Output contentModel if present (serialized as JSON for complex structure)
    if (el.contentModel && el.contentModel.type !== 'empty') {
      const serialized = serializeContentModel(el.contentModel);
      if (serialized) {
        lines.push(`    contentModel: ${serialized},`);
      }
    }

    lines.push('  },');
  }

  lines.push('];');
  lines.push('');

  // Generate helper functions
  lines.push('// ============================================================================');
  lines.push('// Helper Functions');
  lines.push('// ============================================================================');
  lines.push('');
  lines.push(`/**
 * Get all attributes for an element, including inherited class attributes.
 * Resolves the full attribute class hierarchy.
 */
export function getElementAttributes(elementName: string): AttrSpec[] {
  const attrs: AttrSpec[] = [];
  const seen = new Set<string>();

  // Get element definition
  const elDef = TEI_P5_ELEMENTS.find(e => e.name === elementName);
  if (!elDef) return attrs;

  // Add local attributes first
  for (const attr of elDef.localAttrs) {
    if (!seen.has(attr.name)) {
      seen.add(attr.name);
      attrs.push(attr);
    }
  }

  // Get classes this element belongs to
  const classes = TEI_ELEMENT_CLASSES[elementName] ?? [];

  // Resolve class hierarchy and collect attributes
  const resolvedClasses = new Set<string>();
  const queue = [...classes];

  while (queue.length > 0) {
    const className = queue.shift()!;
    if (resolvedClasses.has(className)) continue;
    resolvedClasses.add(className);

    // Add parent classes to queue
    const parents = TEI_ATTR_CLASS_INHERITANCE[className];
    if (parents) {
      queue.push(...parents);
    }

    // Add attributes from this class
    const classAttrs = TEI_ATTRIBUTE_CLASSES[className];
    if (classAttrs) {
      for (const attr of classAttrs) {
        if (!seen.has(attr.name)) {
          seen.add(attr.name);
          attrs.push(attr);
        }
      }
    }
  }

  return attrs;
}
`);

  lines.push('');
  lines.push(`/**
 * Get statistics about the generated schema
 */
export function getP5Stats(): { elements: number; attrClasses: number; totalAttrs: number } {
  let totalAttrs = 0;
  for (const attrs of Object.values(TEI_ATTRIBUTE_CLASSES)) {
    totalAttrs += attrs.length;
  }
  return {
    elements: TEI_P5_ELEMENTS.length,
    attrClasses: Object.keys(TEI_ATTRIBUTE_CLASSES).length,
    totalAttrs,
  };
}
`);

  lines.push('');
  lines.push(`/**
 * Get element definition by name
 */
export function getP5Element(name: string): P5ElementDef | undefined {
  return TEI_P5_ELEMENTS.find(e => e.name === name);
}
`);

  return lines.join('\n');
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const forceDownload = process.argv.includes('--download');

  console.log('TEI P5 Schema Generator');
  console.log('=======================');

  try {
    const p5 = await loadP5Subset(forceDownload);
    console.log(`Loaded: ${p5.title} (${p5.date})`);
    console.log(`  - ${p5.modules.length} modules`);
    console.log(`  - ${p5.elements.length} elements`);
    console.log(`  - ${p5.classes.attributes.length} attribute classes`);
    console.log(`  - ${p5.classes.models.length} model classes`);
    console.log(`  - ${p5.macros.length} macros`);

    const { elements, attrClasses } = parseP5(p5);

    console.log(`\nParsed:`);
    console.log(`  - ${elements.length} element definitions`);
    console.log(`  - ${attrClasses.length} attribute classes`);

    // Count attrs
    let totalAttrs = 0;
    for (const cls of attrClasses) {
      totalAttrs += cls.attrs.length;
    }
    console.log(`  - ${totalAttrs} total attribute definitions in classes`);

    // Count elements with content
    const withContent = elements.filter(e => e.children.length > 0);
    console.log(`  - ${withContent.length} elements with content model`);

    // Generate output
    const output = generateTypeScript(elements, attrClasses);

    const outputDir = path.dirname(OUTPUT_PATH);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_PATH, output);
    console.log(`\nGenerated: ${OUTPUT_PATH}`);
    console.log(`File size: ${(output.length / 1024).toFixed(1)} KB`);

    // Summary
    console.log('\nTop 10 elements with most children:');
    const byChildren = [...elements].sort((a, b) => b.children.length - a.children.length);
    for (let i = 0; i < Math.min(10, byChildren.length); i++) {
      console.log(`  ${byChildren[i].name}: ${byChildren[i].children.length} children`);
    }

    console.log('\nTop 10 attribute classes with most attributes:');
    const byAttrs = [...attrClasses].sort((a, b) => b.attrs.length - a.attrs.length);
    for (let i = 0; i < Math.min(10, byAttrs.length); i++) {
      console.log(`  ${byAttrs[i].name}: ${byAttrs[i].attrs.length} attributes`);
    }

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
