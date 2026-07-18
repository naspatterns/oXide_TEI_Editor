/**
 * Detect schema declarations in XML content and validate availability.
 * Supports:
 * - <?xml-model href="..."> processing instructions
 * - <!DOCTYPE ... SYSTEM "..."> declarations
 */

export interface SchemaDeclaration {
  type: 'xml-model' | 'doctype';
  href: string;
  format: 'rng' | 'dtd' | 'xsd' | 'rnc' | 'unknown';
  isLocal: boolean;
  originalDeclaration: string;
}

/**
 * Parse XML content to find schema declarations
 */
export function detectSchemaDeclarations(xmlContent: string): SchemaDeclaration[] {
  const declarations: SchemaDeclaration[] = [];

  // Match <?xml-model href="..."> processing instructions
  const xmlModelRegex = /<\?xml-model\s+href=["']([^"']+)["'][^?]*\?>/gi;
  let match: RegExpExecArray | null;

  while ((match = xmlModelRegex.exec(xmlContent)) !== null) {
    const href = match[1];
    declarations.push({
      type: 'xml-model',
      href,
      format: getSchemaFormat(href),
      isLocal: isLocalPath(href),
      originalDeclaration: match[0],
    });
  }

  // Match <!DOCTYPE ... SYSTEM "..."> declarations
  const doctypeRegex = /<!DOCTYPE\s+\w+\s+SYSTEM\s+["']([^"']+)["']\s*>/gi;
  while ((match = doctypeRegex.exec(xmlContent)) !== null) {
    const href = decodeURIComponent(match[1]);
    declarations.push({
      type: 'doctype',
      href,
      format: getSchemaFormat(href),
      isLocal: isLocalPath(href),
      originalDeclaration: match[0],
    });
  }

  return declarations;
}

/**
 * Determine schema format from file extension
 */
function getSchemaFormat(href: string): SchemaDeclaration['format'] {
  const lower = href.toLowerCase();
  if (lower.endsWith('.rng')) return 'rng';
  if (lower.endsWith('.dtd')) return 'dtd';
  if (lower.endsWith('.xsd')) return 'xsd';
  if (lower.endsWith('.rnc')) return 'rnc';
  return 'unknown';
}

/**
 * Check if path is local (not a URL)
 */
function isLocalPath(href: string): boolean {
  return !href.startsWith('http://') && !href.startsWith('https://');
}

/**
 * Map a document's schema declarations to a built-in schema id.
 *
 * Pure — usable from EditorContext without importing SchemaContext (keeps
 * the providers decoupled). Returns null when nothing recognizable is
 * declared (caller falls back to the default schema); a local/custom .rng
 * reference also returns null — we cannot load it from disk automatically,
 * and the existing alert flow already tells the user to upload it.
 */
export function resolveSchemaIdFromDeclarations(declarations: SchemaDeclaration[]): string | null {
  for (const decl of declarations) {
    if (decl.format !== 'rng') continue;
    const href = decl.href.toLowerCase();
    if (/tei_all/.test(href)) return 'tei_all';
    if (/tei_lite|tei_minimal|tei_bare|teilite/.test(href)) return 'tei_lite';
  }
  return null;
}

/** Convenience: detect + resolve in one call from raw document content. */
export function detectSchemaIdFromContent(xmlContent: string): string | null {
  return resolveSchemaIdFromDeclarations(detectSchemaDeclarations(xmlContent));
}

/**
 * Analyze schema declarations and return user-friendly messages
 */
export function analyzeSchemaDeclarations(declarations: SchemaDeclaration[]): {
  warnings: string[];
  suggestions: string[];
  hasUnsupportedFormat: boolean;
  hasLocalSchema: boolean;
  localSchemas: SchemaDeclaration[];
} {
  const warnings: string[] = [];
  const suggestions: string[] = [];
  let hasUnsupportedFormat = false;
  let hasLocalSchema = false;
  const localSchemas: SchemaDeclaration[] = [];

  for (const decl of declarations) {
    if (decl.isLocal) {
      hasLocalSchema = true;
      localSchemas.push(decl);
    }

    if (decl.format === 'dtd') {
      hasUnsupportedFormat = true;
      warnings.push(`DTD 스키마는 지원되지 않습니다: ${decl.href}`);
      suggestions.push(
        'DTD를 RelaxNG(.rng)로 변환하세요:\n' +
        '• trang 사용: java -jar trang.jar schema.dtd schema.rng\n' +
        '• 온라인: https://relaxng.org/jclark/trang.html'
      );
    } else if (decl.format === 'xsd') {
      hasUnsupportedFormat = true;
      warnings.push(`XSD 스키마는 지원되지 않습니다: ${decl.href}`);
      suggestions.push('XSD를 RelaxNG(.rng)로 변환하세요.');
    } else if (decl.format === 'rnc') {
      hasUnsupportedFormat = true;
      warnings.push(`RNC(Compact RelaxNG)는 지원되지 않습니다: ${decl.href}`);
      suggestions.push(
        'RNC를 RNG(XML RelaxNG)로 변환하세요:\n' +
        '• trang 사용: java -jar trang.jar schema.rnc schema.rng'
      );
    }
  }

  return {
    warnings,
    suggestions,
    hasUnsupportedFormat,
    hasLocalSchema,
    localSchemas,
  };
}

/**
 * Build a user-friendly alert message for schema issues
 */
export function buildSchemaAlertMessage(
  analysis: ReturnType<typeof analyzeSchemaDeclarations>
): string | null {
  if (analysis.warnings.length === 0 && !analysis.hasLocalSchema) {
    return null;
  }

  const parts: string[] = [];

  if (analysis.warnings.length > 0) {
    parts.push('⚠️ 스키마 경고:\n');
    parts.push(analysis.warnings.join('\n'));
    parts.push('\n\n');
  }

  if (analysis.hasUnsupportedFormat) {
    // Primary recommendation: TEI Roma
    parts.push('💡 권장 사항:\n');
    parts.push('https://roma.tei-c.org/ 에서 .rng 스키마를 다운로드 받으세요.\n\n');

    // Secondary option: conversion tools
    if (analysis.suggestions.length > 0) {
      parts.push('혹은, ');
      parts.push(analysis.suggestions[0]);
    }
  }

  if (analysis.hasLocalSchema && !analysis.hasUnsupportedFormat) {
    const localPaths = analysis.localSchemas
      .filter(s => s.format === 'rng')
      .map(s => s.href);

    if (localPaths.length > 0) {
      parts.push('\n\n📁 로컬 스키마 참조:\n');
      parts.push(localPaths.join('\n'));
      parts.push('\n\n스키마 메뉴에서 해당 .rng 파일을 업로드하세요.');
    }
  }

  return parts.length > 0 ? parts.join('') : null;
}
