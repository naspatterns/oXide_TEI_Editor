/**
 * Lightweight Schematron engine (P2 — the audit's "team house rules" layer).
 *
 * Interprets ISO Schematron (.sch) directly with the browser-native
 * DOMParser + document.evaluate (XPath 1.0) — no XSLT skeleton pipeline, no
 * added dependencies, and nothing the production CSP (`script-src 'self'`)
 * objects to.
 *
 * Supported subset (covers typical TEI project rules):
 *   <ns prefix uri>, <pattern>, <rule context>, <assert test>, <report test>,
 *   @role severity mapping, <name/> substitution inside messages,
 *   first-matching-rule-wins per pattern (ISO semantics).
 * Not supported (documented): phases, abstract patterns/rules, <let>,
 *   <value-of>, key(), document().
 *
 * Namespace handling: expressions are evaluated with a resolver built from
 * the schema's own <ns> declarations (plus tei/xml conveniences). If the
 * .sch declares NO namespaces, unprefixed name steps are rewritten via
 * convertToLocalNameXPath-style local-name() comparisons so that quick,
 * prefix-less rules still match default-namespaced TEI documents.
 *
 * NOTE (testing): jsdom's XPath engine cannot evaluate prefixed name tests
 * or local-name() predicates, so full evaluation against TEI-namespaced
 * documents is verified in a real browser; unit tests exercise parsing,
 * line attribution, and evaluation over no-namespace documents.
 */

import type { ValidationError } from '../types/schema';
import { createElementLineResolver } from './xmlTokenizer';
import { rewriteUnprefixedNamesToLocalName, splitTopLevelUnion } from './xpathLocalName';

/** One assert/report inside a rule. */
export interface SchematronTest {
  /** XPath test expression, evaluated with the rule's matched node as context. */
  test: string;
  /** Human message (with <name/> placeholders resolved at fire time). */
  message: string;
  /** 'assert' fires when the test is FALSE; 'report' fires when TRUE. */
  kind: 'assert' | 'report';
  severity: 'error' | 'warning';
}

export interface SchematronRule {
  context: string;
  tests: SchematronTest[];
}

export interface SchematronPattern {
  /** Rules in document order — the FIRST rule whose context matches a node wins. */
  rules: SchematronRule[];
}

export interface SchematronSchema {
  /** Display name (usually the uploaded file name). */
  name: string;
  /** <title> of the schema, if any. */
  title: string | null;
  /** prefix → namespace URI from <ns> declarations. */
  nsMap: Record<string, string>;
  patterns: SchematronPattern[];
  /** Total assert+report count (for UI display). */
  testCount: number;
}

const SCH_NAMESPACES = new Set([
  'http://purl.oclc.org/dsdl/schematron', // ISO
  'http://www.ascc.net/xml/schematron', // legacy 1.x
]);

/** True for a Schematron element of the given local name (namespace-tolerant). */
function isSch(el: Element, local: string): boolean {
  if (el.localName !== local) return false;
  return el.namespaceURI === null || SCH_NAMESPACES.has(el.namespaceURI);
}

function childrenOf(el: Element, local: string): Element[] {
  return Array.from(el.children).filter((c) => isSch(c, local));
}

function mapRoleToSeverity(role: string | null, kind: 'assert' | 'report'): 'error' | 'warning' {
  switch ((role ?? '').toLowerCase()) {
    case 'fatal':
    case 'error':
      return 'error';
    case 'warning':
    case 'warn':
    case 'info':
    case 'information':
      return 'warning';
    default:
      // Convention: violated asserts are errors, fired reports are advisory.
      return kind === 'assert' ? 'error' : 'warning';
  }
}

/**
 * Parse a Schematron document into an executable schema.
 * Throws with a readable message when the input is not usable.
 */
export function parseSchematron(schXml: string, name: string): SchematronSchema {
  const doc = new DOMParser().parseFromString(schXml, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('Not well-formed XML');
  }

  const root = doc.documentElement;
  if (!isSch(root, 'schema')) {
    throw new Error(`Root element is <${root.localName}>, expected Schematron <schema>`);
  }

  const nsMap: Record<string, string> = {};
  for (const ns of childrenOf(root, 'ns')) {
    const prefix = ns.getAttribute('prefix');
    const uri = ns.getAttribute('uri');
    if (prefix && uri) nsMap[prefix] = uri;
  }

  const titleEl = childrenOf(root, 'title')[0];
  const title = titleEl?.textContent?.trim() || null;

  const patterns: SchematronPattern[] = [];
  let testCount = 0;

  for (const patternEl of childrenOf(root, 'pattern')) {
    if (patternEl.getAttribute('abstract') === 'true') continue; // unsupported
    const rules: SchematronRule[] = [];

    for (const ruleEl of childrenOf(patternEl, 'rule')) {
      if (ruleEl.getAttribute('abstract') === 'true') continue; // unsupported
      const context = ruleEl.getAttribute('context');
      if (!context) continue;

      const tests: SchematronTest[] = [];
      for (const el of Array.from(ruleEl.children)) {
        const kind = isSch(el, 'assert') ? 'assert' : isSch(el, 'report') ? 'report' : null;
        if (!kind) continue;
        const test = el.getAttribute('test');
        if (!test) continue;
        tests.push({
          test,
          message: extractMessageTemplate(el),
          kind,
          severity: mapRoleToSeverity(el.getAttribute('role'), kind),
        });
      }

      if (tests.length > 0) {
        rules.push({ context, tests });
        testCount += tests.length;
      }
    }

    if (rules.length > 0) patterns.push({ rules });
  }

  if (testCount === 0) {
    throw new Error('No <rule>/<assert> found — is this a Schematron file?');
  }

  return { name, title, nsMap, patterns, testCount };
}

/**
 * Flatten an assert/report body into a message template. `<name/>` becomes
 * the placeholder `\u0000name\u0000`, resolved to the context element's name
 * when the diagnostic fires; other child elements contribute their text.
 */
const NAME_PLACEHOLDER = '\u0000name\u0000';

function extractMessageTemplate(el: Element): string {
  let out = '';
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? '';
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const child = node as Element;
      out += isSch(child, 'name') && !child.getAttribute('path') ? NAME_PLACEHOLDER : (child.textContent ?? '');
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Build the descendant-or-absolute context expression for a rule. Schematron
 * contexts are match patterns ("tei:div" means every div anywhere), so each
 * relative UNION BRANCH gets the descendant prefix independently — a union
 * like "head | trailer" must become "//head | //trailer", not "//head |
 * trailer" (whose second branch would be relative to the document root).
 */
function contextToXPath(context: string): string {
  return splitTopLevelUnion(context)
    .map((branch) => (branch.startsWith('/') ? branch : `//${branch}`))
    .join(' | ');
}

/**
 * Validate a document against a parsed Schematron schema.
 * Returns ValidationError[] in the same shape the schema validator emits, so
 * the linter can simply concatenate the two result sets.
 */
export function validateSchematron(xmlContent: string, schema: SchematronSchema): ValidationError[] {
  const errors: ValidationError[] = [];

  const doc = new DOMParser().parseFromString(xmlContent, 'application/xml');
  if (doc.querySelector('parsererror')) {
    // Not well-formed — the main validator already reports this.
    return errors;
  }

  const hasNs = Object.keys(schema.nsMap).length > 0;
  const resolver = (prefix: string | null): string | null => {
    if (!prefix) return null;
    return schema.nsMap[prefix]
      ?? ({ tei: 'http://www.tei-c.org/ns/1.0', xml: 'http://www.w3.org/XML/1998/namespace' } as Record<string, string>)[prefix]
      ?? null;
  };
  // Unprefixed XPath names never match a default-namespaced document
  // (XPath 1.0), so when the .sch declares no namespaces AND the document
  // uses one, rewrite name steps to local-name() comparisons. Documents
  // without a namespace evaluate unprefixed names natively.
  const needsRewrite = !hasNs && !!doc.documentElement.namespaceURI;
  const prep = (expr: string): string => (needsRewrite ? rewriteUnprefixedNamesToLocalName(expr) : expr);

  // Node→line attribution, built lazily on the first fired diagnostic (most
  // lint passes fire nothing, so a clean document never pays for this). The
  // shared resolver does ONE tokenizer pass (skips comments/CDATA, spans
  // multi-line tags) + a DOM walk, so it stays aligned with document order.
  // This replaces the old per-error findNthTagLine, which re-compiled a RegExp
  // and rescanned every line for EACH fired error — O(errors × lines) — and
  // miscounted commented-out/multi-line markup (audit #4, also fixes #29 here).
  // The resolver is now shared with the XPath toolbar search so the two paths
  // can't drift (that drift is exactly what regressed XPath — audit #19/#20).
  let resolveLine: ((el: Element) => number) | null = null;
  const lineOf = (el: Element): number => {
    if (!resolveLine) resolveLine = createElementLineResolver(xmlContent, doc);
    return resolveLine(el);
  };

  const ruleErrorReported = new Set<string>();
  const reportRuleError = (expr: string, err: unknown) => {
    if (ruleErrorReported.has(expr)) return;
    ruleErrorReported.add(expr);
    errors.push({
      message: `Schematron rule could not be evaluated: ${expr} (${err instanceof Error ? err.message : 'XPath error'})`,
      line: 1,
      column: 1,
      severity: 'warning',
    });
  };

  for (const pattern of schema.patterns) {
    // ISO semantics: within a pattern, a node is checked only by the FIRST
    // rule whose context matches it.
    const claimed = new Set<Element>();

    for (const rule of pattern.rules) {
      const contextExpr = contextToXPath(rule.context);

      let matched: Element[];
      try {
        const snapshot = doc.evaluate(
          prep(contextExpr),
          doc,
          resolver,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null,
        );
        matched = [];
        for (let i = 0; i < snapshot.snapshotLength; i++) {
          const node = snapshot.snapshotItem(i);
          if (node && node.nodeType === Node.ELEMENT_NODE) matched.push(node as Element);
        }
        // A context that resolved to only non-element nodes (attribute, text,
        // root, or comment contexts) is silently inert under this
        // element-only engine — surface it instead of reporting a false clean.
        if (snapshot.snapshotLength > 0 && matched.length === 0) {
          reportRuleError(
            rule.context,
            new Error('context matched only non-element nodes (attribute/text/root contexts are not supported)'),
          );
          continue;
        }
      } catch (err) {
        reportRuleError(rule.context, err);
        continue;
      }

      for (const el of matched) {
        if (claimed.has(el)) continue;
        claimed.add(el);

        for (const t of rule.tests) {
          let value: boolean;
          try {
            value = doc.evaluate(prep(t.test), el, resolver, XPathResult.BOOLEAN_TYPE, null).booleanValue;
          } catch (err) {
            reportRuleError(t.test, err);
            continue;
          }

          const fired = t.kind === 'assert' ? !value : value;
          if (fired) {
            errors.push({
              message: `[Schematron] ${t.message.split(NAME_PLACEHOLDER).join(`<${el.localName}>`)}`,
              line: lineOf(el),
              column: 1,
              severity: t.severity,
            });
          }
        }
      }
    }
  }

  return errors;
}
