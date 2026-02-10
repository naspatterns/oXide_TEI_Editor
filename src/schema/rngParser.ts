import type { ElementSpec, AttrSpec } from '../types/schema';

/**
 * Parse a RelaxNG (.rng) XML document and extract ElementSpec[] and AttrSpec[].
 *
 * RelaxNG uses a grammar-based approach:
 *   <element name="p">
 *     <ref name="macro.paraContent"/>
 *   </element>
 *
 * TEI's RNG files heavily use <define> and <ref> for modularity.
 * This parser resolves refs to build a flat element list.
 */

const RNG_NS = 'http://relaxng.org/ns/structure/1.0';
const TEI_NS = 'http://www.tei-c.org/ns/1.0';

interface DefineNode {
  name: string;
  node: Element;
}

export function parseRng(rngXml: string): ElementSpec[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(rngXml, 'application/xml');

  const errorNode = doc.querySelector('parsererror');
  if (errorNode) {
    throw new Error(`RNG parse error: ${errorNode.textContent}`);
  }

  // Collect all <define> elements for ref resolution
  const defines = new Map<string, DefineNode>();
  const defineEls = doc.getElementsByTagNameNS(RNG_NS, 'define');
  for (let i = 0; i < defineEls.length; i++) {
    const el = defineEls[i];
    const name = el.getAttribute('name');
    if (name) {
      defines.set(name, { name, node: el });
    }
  }

  // Find all <element> declarations
  const elementEls = doc.getElementsByTagNameNS(RNG_NS, 'element');
  const elements: ElementSpec[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < elementEls.length; i++) {
    const el = elementEls[i];
    const name = el.getAttribute('name');
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const ns = el.getAttribute('ns') || TEI_NS;
    const spec = extractElementSpec(name, ns, el, defines, new Set());
    elements.push(spec);
  }

  return elements.sort((a, b) => a.name.localeCompare(b.name));
}

function extractElementSpec(
  name: string,
  ns: string,
  elementNode: Element,
  defines: Map<string, DefineNode>,
  visited: Set<string>,
): ElementSpec {
  const attributes = extractAttributes(elementNode, defines, visited);
  const children = extractChildElements(elementNode, defines, visited);
  const documentation = extractDocumentation(elementNode);

  return {
    name,
    ns: ns !== TEI_NS ? ns : undefined,
    documentation,
    children,
    attributes,
  };
}

function extractAttributes(
  node: Element,
  defines: Map<string, DefineNode>,
  visited: Set<string>,
): AttrSpec[] {
  const attrs: AttrSpec[] = [];
  const attrMap = new Map<string, number>(); // name -> index in attrs

  function walk(el: Element, required: boolean) {
    for (let i = 0; i < el.children.length; i++) {
      const child = el.children[i];
      const localName = child.localName;
      const childNs = child.namespaceURI;

      if (childNs === RNG_NS && localName === 'attribute') {
        const attrName = child.getAttribute('name');
        if (attrName) {
          const existingIdx = attrMap.get(attrName);
          if (existingIdx !== undefined) {
            // If this occurrence is required and existing was optional, upgrade to required
            if (required && !attrs[existingIdx].required) {
              attrs[existingIdx].required = true;
            }
          } else {
            // New attribute
            attrMap.set(attrName, attrs.length);
            attrs.push({
              name: attrName,
              required,
              values: extractValues(child),
              documentation: extractDocumentation(child),
            });
          }
        }
      } else if (childNs === RNG_NS && localName === 'optional') {
        walk(child, false);
      } else if (childNs === RNG_NS && localName === 'ref') {
        const refName = child.getAttribute('name');
        if (refName && !visited.has(refName)) {
          const def = defines.get(refName);
          if (def) {
            visited.add(refName);
            walk(def.node, required);
            visited.delete(refName);
          }
        }
      } else if (childNs === RNG_NS && (localName === 'group' || localName === 'interleave' || localName === 'choice' || localName === 'zeroOrMore' || localName === 'oneOrMore')) {
        const isRequired = required && localName !== 'choice' && localName !== 'zeroOrMore';
        walk(child, isRequired);
      }
    }
  }

  walk(node, true);
  return attrs;
}

function extractChildElements(
  node: Element,
  defines: Map<string, DefineNode>,
  visited: Set<string>,
): string[] {
  const children: string[] = [];
  const seen = new Set<string>();

  function walk(el: Element) {
    for (let i = 0; i < el.children.length; i++) {
      const child = el.children[i];
      const localName = child.localName;
      const childNs = child.namespaceURI;

      if (childNs === RNG_NS && localName === 'element') {
        const elName = child.getAttribute('name');
        if (elName && !seen.has(elName)) {
          seen.add(elName);
          children.push(elName);
        }
      } else if (childNs === RNG_NS && localName === 'ref') {
        const refName = child.getAttribute('name');
        if (refName && !visited.has(refName)) {
          const def = defines.get(refName);
          if (def) {
            visited.add(refName);
            walk(def.node);
            visited.delete(refName);
          }
        }
      } else if (childNs === RNG_NS && (localName === 'group' || localName === 'interleave' || localName === 'choice' || localName === 'optional' || localName === 'zeroOrMore' || localName === 'oneOrMore')) {
        walk(child);
      }
    }
  }

  walk(node);
  return children.sort();
}

function extractValues(attrNode: Element): string[] | undefined {
  const values: string[] = [];
  const valueEls = attrNode.getElementsByTagNameNS(RNG_NS, 'value');
  for (let i = 0; i < valueEls.length; i++) {
    const text = valueEls[i].textContent?.trim();
    if (text) values.push(text);
  }
  return values.length > 0 ? values : undefined;
}

function extractDocumentation(node: Element): string | undefined {
  // TEI uses <a:documentation> or <desc>
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.localName === 'documentation' || child.localName === 'desc') {
      return child.textContent?.trim() || undefined;
    }
  }
  return undefined;
}
