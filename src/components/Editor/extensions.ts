import { xml, autoCloseTags } from '@codemirror/lang-xml';
import { autocompletion } from '@codemirror/autocomplete';
import { lintGutter } from '@codemirror/lint';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import type { Extension } from '@codemirror/state';
import type { SchemaInfo } from '../../types/schema';
import type { ValidationError } from '../../types/schema';
import { createSchemaCompletionSource } from './completionSource';
import { createValidationLinter } from './validationLinter';
import { teiEditorTheme } from './theme';

/**
 * Assemble all CodeMirror 6 extensions for the TEI XML editor.
 */
export function createEditorExtensions(
  schema: SchemaInfo | null,
  onValidationErrors?: (errors: ValidationError[]) => void,
): Extension[] {
  return [
    // XML language support
    xml(),
    // Auto-close tags when typing > or /
    autoCloseTags,
    // Schema-aware autocompletion
    autocompletion({
      activateOnTyping: true,
      maxRenderedOptions: 50,
      override: [createSchemaCompletionSource(schema)],
    }),
    // Real-time validation linter
    createValidationLinter(schema, onValidationErrors),
    // Lint gutter for error markers
    lintGutter(),
    // Tab indentation
    keymap.of([indentWithTab]),
    // Custom theme
    teiEditorTheme,
  ];
}
