/**
 * Schema query helpers.
 *
 * Callers (editor, completion, validator) should ask schema questions through
 * these functions instead of reaching into `schema.elementMap` directly. This
 * keeps the physical representation of a schema an implementation detail of
 * this package — future changes (lazy loading, indexed attribute lookup,
 * namespace awareness) only touch this file.
 */

import type { AttrSpec, ElementSpec, SchemaInfo } from '../types/schema';

/** Look up the spec for an element by name. Returns `undefined` if unknown. */
export function getElement(
  schema: SchemaInfo | null | undefined,
  name: string,
): ElementSpec | undefined {
  return schema?.elementMap.get(name);
}

/** Whether the schema defines an element with the given name. */
export function hasElement(
  schema: SchemaInfo | null | undefined,
  name: string,
): boolean {
  return schema?.elementMap.has(name) ?? false;
}

/** All attributes declared for an element. Empty array if unknown element. */
export function getAttributes(
  schema: SchemaInfo | null | undefined,
  elementName: string,
): AttrSpec[] {
  return getElement(schema, elementName)?.attributes ?? [];
}

/** Only required attributes for an element. */
export function getRequiredAttributes(
  schema: SchemaInfo | null | undefined,
  elementName: string,
): AttrSpec[] {
  return getAttributes(schema, elementName).filter((a) => a.required);
}

/** Look up a single attribute spec on a given element. */
export function getAttribute(
  schema: SchemaInfo | null | undefined,
  elementName: string,
  attrName: string,
): AttrSpec | undefined {
  return getAttributes(schema, elementName).find((a) => a.name === attrName);
}

/**
 * Allowed child element names for an element (from the simple `children` list,
 * not the structured content model). Empty array if unknown.
 */
export function getChildNames(
  schema: SchemaInfo | null | undefined,
  elementName: string,
): string[] {
  return getElement(schema, elementName)?.children ?? [];
}
