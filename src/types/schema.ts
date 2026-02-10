/** Describes a TEI element from the schema */
export interface ElementSpec {
  name: string;
  /** Namespace URI (usually TEI or empty) */
  ns?: string;
  /** Human-readable documentation */
  documentation?: string;
  /** Allowed child element names */
  children?: string[];
  /** Allowed attributes */
  attributes?: AttrSpec[];
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
