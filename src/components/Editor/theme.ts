import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

/**
 * Dark theme syntax colors for XML
 */
const darkSyntaxHighlighting = HighlightStyle.define([
  // Angle brackets < > </ />
  { tag: tags.angleBracket, color: '#808080' },
  // Tag names (div, p, lg, etc.)
  { tag: tags.tagName, color: '#569cd6' },  // bold 제거: ch 단위 들여쓰기 정렬을 위해
  // Attribute names (xml:id, type, etc.)
  { tag: tags.attributeName, color: '#9cdcfe' },
  // Attribute values ("TSP188", etc.)
  { tag: tags.attributeValue, color: '#ce9178' },
  // String literals
  { tag: tags.string, color: '#ce9178' },
  // Comments
  { tag: tags.comment, color: '#6a9955', fontStyle: 'italic' },
  // Processing instructions <?xml ...?>
  { tag: tags.processingInstruction, color: '#808080', fontStyle: 'italic' },
  // DOCTYPE, meta
  { tag: tags.documentMeta, color: '#c586c0' },
  { tag: tags.meta, color: '#c586c0' },
  // Content text - default
  { tag: tags.content, color: '#d4d4d4' },
]);

/**
 * Light theme syntax colors for XML
 */
const lightSyntaxHighlighting = HighlightStyle.define([
  // Angle brackets < > </ />
  { tag: tags.angleBracket, color: '#666666' },
  // Tag names
  { tag: tags.tagName, color: '#22863a' },  // bold 제거: ch 단위 들여쓰기 정렬을 위해
  // Attribute names
  { tag: tags.attributeName, color: '#6f42c1' },
  // Attribute values
  { tag: tags.attributeValue, color: '#032f62' },
  // Strings
  { tag: tags.string, color: '#032f62' },
  // Comments
  { tag: tags.comment, color: '#6a737d', fontStyle: 'italic' },
  // Processing instructions
  { tag: tags.processingInstruction, color: '#6a737d', fontStyle: 'italic' },
  // DOCTYPE, meta
  { tag: tags.documentMeta, color: '#6f42c1' },
  { tag: tags.meta, color: '#6f42c1' },
  // Content text - pure black for readability
  { tag: tags.content, color: '#000000' },
]);

/** Base editor theme (layout, not colors) */
const baseTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '14px',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, 'Courier New', monospace",
  },
  '.cm-content': {
    padding: '16px 24px',  // 문서 스타일 여유 공간
    lineHeight: '1.6',     // 넉넉한 줄 간격 (MS Word 느낌)
  },
  '.cm-line': {
    lineHeight: '1.6',     // 개별 줄에도 적용
    overflowWrap: 'break-word',  // 단어 중간 줄바꿈 방지
    // 들여쓰기는 paragraphIndent.ts가 문단 태그(<p>, <lg> 등) 내부만 선택적으로 처리
  },
  '.cm-gutters': {
    background: 'transparent',  // 투명 배경으로 은은하게
    border: 'none',
    color: 'var(--color-text-secondary)',
    opacity: '0.5',        // 줄 번호 눈에 덜 띄게
    fontSize: '12px',      // 작은 폰트
    minWidth: '40px',
  },
  '.cm-activeLineGutter': {
    background: 'rgba(128, 128, 128, 0.1)',  // 활성 줄 gutter도 은은하게
    opacity: '1',          // 활성 줄은 더 잘 보이게
  },
  '.cm-activeLine': {
    background: 'var(--cm-active-line, rgba(0, 0, 0, 0.04))',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--cm-cursor-color, var(--color-primary))',
    borderLeftWidth: '2px',
  },
  '.cm-selectionBackground': {
    background: 'var(--cm-selection-bg, rgba(74, 111, 165, 0.2)) !important',
  },
  '.cm-matchingBracket': {
    background: 'rgba(74, 111, 165, 0.3)',
    outline: 'none',
  },
  // Lint diagnostic styling
  '.cm-lintRange-error': {
    backgroundImage: 'none',
    textDecoration: 'underline wavy var(--color-error)',
    textDecorationSkipInk: 'none',
  },
  '.cm-lintRange-warning': {
    backgroundImage: 'none',
    textDecoration: 'underline wavy var(--color-warning)',
    textDecorationSkipInk: 'none',
  },
  '.cm-tooltip-autocomplete': {
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
  },
});

/** Combined theme with syntax highlighting */
export const teiEditorTheme = [
  baseTheme,
  syntaxHighlighting(darkSyntaxHighlighting),
];

/** Light theme variant */
export const teiEditorThemeLight = [
  baseTheme,
  syntaxHighlighting(lightSyntaxHighlighting),
];
