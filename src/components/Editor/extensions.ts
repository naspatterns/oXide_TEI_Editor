import { xml, autoCloseTags } from '@codemirror/lang-xml';
import { autocompletion } from '@codemirror/autocomplete';
import { lintGutter } from '@codemirror/lint';
import { keymap, EditorView } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import type { Extension } from '@codemirror/state';
import type { SchemaInfo } from '../../types/schema';
import type { ValidationError } from '../../types/schema';
import { createSchemaCompletionSource } from './completionSource';
import { createValidationLinter } from './validationLinter';
import { teiEditorTheme, teiEditorThemeLight } from './theme';
import { visualLineNumbers } from './visualLineNumbers';
import { paragraphIndentation } from './paragraphIndent';

/**
 * Assemble all CodeMirror 6 extensions for the TEI XML editor.
 */
export function createEditorExtensions(
  schema: SchemaInfo | null,
  onValidationErrors?: (errors: ValidationError[]) => void,
  isDarkMode?: boolean,
): Extension[] {
  // Determine theme: check parameter first, then DOM attribute
  const dark = isDarkMode ?? document.documentElement.getAttribute('data-theme') === 'dark';
  const editorTheme = dark ? teiEditorTheme : teiEditorThemeLight;

  return [
    // Visual line numbers (each wrapped line gets its own number)
    visualLineNumbers(),
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
    // Line wrapping (no horizontal scroll)
    EditorView.lineWrapping,
    // Custom theme (Light or Dark based on current setting)
    editorTheme,
    // Paragraph block indentation (<p>, <lg> 등 내부 콘텐츠 들여쓰기)
    paragraphIndentation(),
  ];
}
