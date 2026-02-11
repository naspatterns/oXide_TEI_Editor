// ============================================================================
// Content Model Types (Phase 2: Accurate Context Recognition)
// ============================================================================

/**
 * Represents a content model structure from RNG.
 * Supports sequence, choice, interleave with cardinality constraints.
 */
export interface ContentModel {
  /** Type of content model */
  type: 'sequence' | 'choice' | 'interleave' | 'group' | 'element' | 'text' | 'empty';
  /** Child items (for sequence/choice/interleave/group) */
  items?: ContentItem[];
  /** Minimum occurrences (0 = optional, 1+ = required) */
  minOccurs: number;
  /** Maximum occurrences (Infinity = unbounded) */
  maxOccurs: number;
}

/**
 * A single item within a content model.
 */
export interface ContentItem {
  /** What kind of content this is */
  kind: 'element' | 'text' | 'group' | 'model';
  /** Element name (for kind='element') or model class name (for kind='model') */
  name?: string;
  /** Nested content model (for kind='group') */
  content?: ContentModel;
  /** Minimum occurrences */
  minOccurs: number;
  /** Maximum occurrences */
  maxOccurs: number;
}

/**
 * Result of evaluating allowed children at a specific point.
 */
export interface AllowedChild {
  /** Element name */
  name: string;
  /** Whether this child is required (must appear) */
  required: boolean;
  /** How many more times this element can appear (-1 = unlimited) */
  remaining: number;
}

// ============================================================================
// Element and Attribute Types
// ============================================================================

/** Describes a TEI element from the schema */
export interface ElementSpec {
  name: string;
  /** Namespace URI (usually TEI or empty) */
  ns?: string;
  /** Human-readable documentation */
  documentation?: string;
  /** Allowed child element names (simple list, for backward compatibility) */
  children?: string[];
  /** Allowed attributes */
  attributes?: AttrSpec[];
  /** Structured content model (Phase 2: for accurate validation) */
  contentModel?: ContentModel;
  /** Content model type hint from P5 data */
  contentModelType?: 'sequence' | 'choice' | 'interleave' | 'mixed' | 'empty';
}

/** Describes an attribute from the schema */
export interface AttrSpec {
  name: string;
  /** Whether the attribute is required */
  required?: boolean;
  /** Enumerated allowed values */
  values?: string[];
  /** Default value */
  defaultValue?: string;
  /** Human-readable documentation */
  documentation?: string;
  /** TEI datatype (e.g., teidata.pointer, teidata.temporal.w3c) */
  datatype?: string;
}

/** A validation error with position information */
export interface ValidationError {
  /** Error message */
  message: string;
  /** 1-based line number */
  line: number;
  /** 1-based column number */
  column: number;
  /** Severity: error or warning */
  severity: 'error' | 'warning';
  /** Optional end position for range highlighting */
  endLine?: number;
  endColumn?: number;
}

/** Schema information loaded by SchemaEngine */
export interface SchemaInfo {
  /** Schema identifier */
  id: string;
  /** Display name */
  name: string;
  /** All known elements */
  elements: ElementSpec[];
  /** Map from element name to its spec for fast lookup */
  elementMap: Map<string, ElementSpec>;
  /** Whether salve grammar is available for dynamic validation */
  hasSalveGrammar: boolean;
}
