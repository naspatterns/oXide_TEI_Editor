/**
 * Namespace-agnostic XPath rewriting shared by the Schematron engine and the
 * XPath search toolbar.
 *
 * TEI documents live in a default namespace, but users write prefix-less
 * XPath (`//div/head`) and quick prefix-less Schematron rules. In XPath 1.0 an
 * unprefixed name step never matches a namespaced element, so we rewrite each
 * unprefixed *element name step* to `*[local-name()='name']`.
 *
 * This is done with a small character scanner rather than a regex, because a
 * naive regex (the previous implementation) silently mangled real expressions:
 *   - it skipped `div`/`mod` unconditionally, but those are TEI element names
 *     (`<div>` is the core structural element) as well as XPath operators;
 *   - it rewrote name-looking words INSIDE string literals
 *     (`@rend = 'bold italic underline'`);
 *   - it left axis-qualified steps (`child::p`) and non-final path steps
 *     (`//div/head`) untouched.
 * The scanner tracks quote state, prefixes, axes, attribute/variable sigils,
 * function calls, and operator position so only genuine element name steps are
 * rewritten.
 */

const NAME_START = /[A-Za-z_]/;
const NAME_CHAR = /[A-Za-z0-9_.-]/;
const KEYWORD_OPERATORS = new Set(['and', 'or', 'div', 'mod']);

/**
 * Rewrite every unprefixed element name step in an XPath 1.0 expression to a
 * `*[local-name()='name']` comparison. Leaves untouched: string literals,
 * numbers, prefixed names (`tei:div`), attribute (`@n`) and variable (`$x`)
 * names, function/node-type calls (`not(...)`, `text()`), and the operator
 * keywords `and`/`or`/`div`/`mod` when they appear in operator position.
 */
export function rewriteUnprefixedNamesToLocalName(expr: string): string {
  const out: string[] = [];
  const n = expr.length;
  let i = 0;
  // Whether the previous significant token produces a value (an operand). Used
  // to tell an operator keyword (`count(a) div count(b)`) from an element name
  // step (`//div`). `false` after openers/operators/axes/sigils.
  let prevIsOperand = false;
  // Whether the previous token was `@`, `$`, or a namespace prefix `:`, so the
  // upcoming name is an attribute/variable/local part and must be copied as-is.
  let copyNextName = false;

  const push = (s: string, operand: boolean, copyNext = false): void => {
    out.push(s);
    prevIsOperand = operand;
    copyNextName = copyNext;
  };

  while (i < n) {
    const c = expr[i];

    // Whitespace — passthrough, does not change token state.
    if (/\s/.test(c)) {
      out.push(c);
      i++;
      continue;
    }

    // String literal — copy verbatim (never rewrite inside quotes).
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n && expr[j] !== c) j++;
      out.push(expr.slice(i, Math.min(j + 1, n)));
      i = j + 1;
      prevIsOperand = true;
      copyNextName = false;
      continue;
    }

    // Number literal.
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(expr[i + 1] ?? ''))) {
      let j = i;
      while (j < n && /[0-9.]/.test(expr[j])) j++;
      out.push(expr.slice(i, j));
      i = j;
      prevIsOperand = true;
      copyNextName = false;
      continue;
    }

    // '..' (parent) and '.' (self).
    if (c === '.') {
      out.push(expr[i + 1] === '.' ? '..' : '.');
      i += expr[i + 1] === '.' ? 2 : 1;
      prevIsOperand = true;
      copyNextName = false;
      continue;
    }

    // Attribute (`@`) and variable (`$`) sigils — the following name is copied.
    if (c === '@' || c === '$') {
      push(c, false, true);
      i++;
      continue;
    }

    // Axis separator `::` — the axis name before it was already emitted; the
    // node-test name after it is a real step and should be rewritten.
    if (c === ':' && expr[i + 1] === ':') {
      push('::', false, false);
      i += 2;
      continue;
    }

    // Name token.
    if (NAME_START.test(c)) {
      let j = i + 1;
      while (j < n && NAME_CHAR.test(expr[j])) j++;
      const name = expr.slice(i, j);
      let k = j;
      while (k < n && /\s/.test(expr[k])) k++;
      const nextNonWs = expr[k] ?? '';

      // Axis name: `name::` — copy the axis verbatim; the node test after the
      // `::` is the real step and is rewritten on the next iteration.
      if (expr[j] === ':' && expr[j + 1] === ':') {
        push(name, false, false);
        i = j;
        continue;
      }

      // Namespace prefix: `name:` (but not `name::`). Emit the prefix and copy
      // the local part next; the whole thing is an already-qualified name.
      if (expr[j] === ':' && expr[j + 1] !== ':') {
        out.push(name + ':');
        i = j + 1;
        prevIsOperand = false;
        copyNextName = true;
        continue;
      }

      // Function or node-type test: `name(` — copy the function name as-is.
      if (nextNonWs === '(') {
        push(name, false, false);
        i = j;
        continue;
      }

      // Attribute/variable/prefixed-local name — copy verbatim.
      if (copyNextName) {
        push(name, true, false);
        i = j;
        continue;
      }

      // Operator keyword in operand position (`a div b`, `x and y`).
      if (KEYWORD_OPERATORS.has(name) && prevIsOperand) {
        push(name, false, false);
        i = j;
        continue;
      }

      // Genuine unprefixed element name step — rewrite.
      push(`*[local-name()='${name}']`, true, false);
      i = j;
      continue;
    }

    // Path separators and openers put us in step/operand-expecting position.
    if (c === '/' && expr[i + 1] === '/') {
      push('//', false, false);
      i += 2;
      continue;
    }
    if (c === '/' || c === '(' || c === '[' || c === ',' || c === '|') {
      push(c, false, false);
      i++;
      continue;
    }
    // Closers produce an operand.
    if (c === ')' || c === ']') {
      push(c, true, false);
      i++;
      continue;
    }
    // `*` — treat as an operand (wildcard / result), so a following div/mod
    // reads as an operator.
    if (c === '*') {
      push('*', true, false);
      i++;
      continue;
    }
    // Comparison / arithmetic operators.
    if (c === '=' || c === '!' || c === '<' || c === '>' || c === '+' || c === '-') {
      push(c, false, false);
      i++;
      continue;
    }

    // Anything else — copy through unchanged.
    out.push(c);
    i++;
  }

  return out.join('');
}

/**
 * Split an XPath union expression on top-level `|` only (ignoring `|` inside
 * predicates `[...]`, parentheses, or string literals). Returns the branches
 * with surrounding whitespace trimmed. A non-union expression returns a single
 * element.
 */
export function splitTopLevelUnion(expr: string): string[] {
  const branches: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
    } else if (c === '[' || c === '(') {
      depth++;
    } else if (c === ']' || c === ')') {
      depth--;
    } else if (c === '|' && depth === 0) {
      branches.push(expr.slice(start, i).trim());
      start = i + 1;
    }
  }
  branches.push(expr.slice(start).trim());
  return branches;
}
