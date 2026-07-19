/**
 * Paragraph-indent decoration logic tests (roadmap #3, finding #1).
 *
 * The extension moved from a StateField that rebuilt whole-document
 * decorations every keystroke to a viewport-bound ViewPlugin. The per-line
 * decision (which indent class, if any) is unchanged — these tests pin that
 * pure logic so the viewport optimization can't silently alter what the user
 * sees. `indentClassForLine` reads the open paragraph-tag stack BEFORE the
 * line; `updateTagStack` advances it after.
 */
import { describe, it, expect } from 'vitest';
import { indentClassForLine, updateTagStack } from '../src/components/Editor/paragraphIndent';

/** Mirror the plugin's per-line walk over a whole document for testing. */
function classesFor(lines: string[]): Array<string | null> {
  const stack: string[] = [];
  const out: Array<string | null> = [];
  for (const text of lines) {
    out.push(indentClassForLine(text, stack));
    updateTagStack(text, stack);
  }
  return out;
}

describe('indentClassForLine (via a full-document walk)', () => {
  it('indents lines inside a paragraph tag by that tag width, not the tag lines', () => {
    const classes = classesFor([
      '<lg>',
      '  <l>a</l>',
      '  <l>b</l>',
      '</lg>',
    ]);
    expect(classes).toEqual([
      null, // <lg> open line — not indented
      'cm-indent-4ch', // inside <lg>
      'cm-indent-4ch',
      null, // </lg> close line — not indented
    ]);
  });

  it('uses the correct width per tag', () => {
    expect(classesFor(['<p>', 'x', '</p>'])[1]).toBe('cm-indent-3ch');
    expect(classesFor(['<cit>', 'x', '</cit>'])[1]).toBe('cm-indent-5ch');
    expect(classesFor(['<quote>', 'x', '</quote>'])[1]).toBe('cm-indent-7ch');
    expect(classesFor(['<ab>', 'x', '</ab>'])[1]).toBe('cm-indent-4ch');
  });

  it('uses the INNERMOST open paragraph tag when nested', () => {
    const classes = classesFor([
      '<quote>',   // open quote
      '<p>',       // open p (starts with open → not indented)
      'inner',     // inside p → 3ch
      '</p>',      // close p
      'outer',     // back inside quote → 7ch
      '</quote>',
    ]);
    expect(classes).toEqual([
      null,
      null,
      'cm-indent-3ch',
      null,
      'cm-indent-7ch',
      null,
    ]);
  });

  it('does not indent when no paragraph tag is open', () => {
    expect(classesFor(['<div>', '  <head>Title</head>', '</div>'])).toEqual([null, null, null]);
  });

  it('ignores self-closing paragraph tags (they open nothing)', () => {
    const classes = classesFor([
      '<body>',
      '  <p/>',      // self-closing — does not open
      '  next',      // still no open paragraph → not indented
      '</body>',
    ]);
    expect(classes).toEqual([null, null, null, null]);
  });

  it('handles multiple paragraph tags opened/closed on one line', () => {
    const stack: string[] = [];
    updateTagStack('<p>a</p><lg>', stack); // p opens+closes, lg stays open
    expect(stack).toEqual(['lg']);
    expect(indentClassForLine('  line', stack)).toBe('cm-indent-4ch');
  });
});
