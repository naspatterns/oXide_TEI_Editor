import { describe, it, expect } from 'vitest';
import type { ElementSpec, SchemaInfo } from '../src/types/schema';
import {
  getElement,
  hasElement,
  getAttributes,
  getRequiredAttributes,
  getAttribute,
  getChildNames,
} from '../src/schema/schemaQuery';

function buildSchema(elements: ElementSpec[]): SchemaInfo {
  const elementMap = new Map<string, ElementSpec>();
  for (const el of elements) elementMap.set(el.name, el);
  return {
    id: 'test',
    name: 'Test',
    elements,
    elementMap,
    hasSalveGrammar: false,
  };
}

const SCHEMA = buildSchema([
  {
    name: 'p',
    children: ['hi', 'foreign', 'note'],
    attributes: [
      { name: 'xml:id' },
      { name: 'rend' },
      { name: 'type', required: true },
    ],
  },
  {
    name: 'note',
    children: [],
    attributes: [{ name: 'place', values: ['foot', 'end', 'margin'] }],
  },
]);

describe('schemaQuery', () => {
  it('returns undefined for unknown elements', () => {
    expect(getElement(SCHEMA, 'unknown')).toBeUndefined();
    expect(getElement(null, 'p')).toBeUndefined();
  });

  it('looks up known elements', () => {
    expect(getElement(SCHEMA, 'p')?.name).toBe('p');
  });

  it('hasElement reflects map membership and tolerates null', () => {
    expect(hasElement(SCHEMA, 'p')).toBe(true);
    expect(hasElement(SCHEMA, 'unknown')).toBe(false);
    expect(hasElement(null, 'p')).toBe(false);
  });

  it('getAttributes returns the element attributes or empty', () => {
    expect(getAttributes(SCHEMA, 'p').map((a) => a.name)).toEqual([
      'xml:id',
      'rend',
      'type',
    ]);
    expect(getAttributes(SCHEMA, 'unknown')).toEqual([]);
  });

  it('getRequiredAttributes filters by required flag', () => {
    const req = getRequiredAttributes(SCHEMA, 'p');
    expect(req).toHaveLength(1);
    expect(req[0].name).toBe('type');
  });

  it('getAttribute looks up a single attribute on an element', () => {
    expect(getAttribute(SCHEMA, 'note', 'place')?.values).toEqual([
      'foot',
      'end',
      'margin',
    ]);
    expect(getAttribute(SCHEMA, 'note', 'missing')).toBeUndefined();
  });

  it('getChildNames returns the simple children list or empty', () => {
    expect(getChildNames(SCHEMA, 'p')).toEqual(['hi', 'foreign', 'note']);
    expect(getChildNames(SCHEMA, 'unknown')).toEqual([]);
  });
});
