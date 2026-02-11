import { StateField, type Extension, type Text, RangeSet, Range } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';

/**
 * 문단 블록 태그(<p>, <lg> 등) 내부 콘텐츠에 시각적 들여쓰기 적용
 *
 * 규칙:
 * - <p>로 시작하는 줄 → 들여쓰기 안 함 (태그 자체는 원래 위치)
 * - 문단 내부 줄 (depth > 0) → 태그 너비만큼 들여쓰기 (ch 단위)
 * - </p>로 시작하는 줄 → 들여쓰기 안 함 (닫기 태그도 원래 위치)
 *
 * 태그별 들여쓰기 너비:
 * - <p> = 3ch, <lg> = 4ch, <ab> = 4ch, <sp> = 4ch, <cit> = 5ch, <quote> = 7ch
 */

// 문단 수준 블록 태그 (들여쓰기 적용 대상)
const PARAGRAPH_TAGS = ['p', 'lg', 'ab', 'sp', 'quote', 'cit'];

// 성능 최적화: 모듈 레벨에서 정규식 캐싱 (매 keystroke마다 재컴파일 방지)
const PARAGRAPH_OPEN_REGEX = new RegExp(`^\\s*<(${PARAGRAPH_TAGS.join('|')})(\\s|>)`, 'i');
const PARAGRAPH_CLOSE_REGEX = new RegExp(`^\\s*</(${PARAGRAPH_TAGS.join('|')})>`, 'i');
const TAG_PATTERN_REGEX = new RegExp(`<(/?)\\s*(${PARAGRAPH_TAGS.join('|')})(?:\\s[^>]*)?>`, 'gi');

// 태그별 CSS 클래스 매핑 (태그명 길이 + 2 = <> 포함)
const TAG_INDENT_MAP: Record<string, string> = {
  'p':     'cm-indent-3ch',   // <p> = 3글자
  'lg':    'cm-indent-4ch',   // <lg> = 4글자
  'ab':    'cm-indent-4ch',   // <ab> = 4글자
  'sp':    'cm-indent-4ch',   // <sp> = 4글자
  'cit':   'cm-indent-5ch',   // <cit> = 5글자
  'quote': 'cm-indent-7ch',   // <quote> = 7글자
};

// 기본 들여쓰기 (알 수 없는 태그용)
const DEFAULT_INDENT_CLASS = 'cm-indent-3ch';

/**
 * 문단 블록 들여쓰기 확장
 */
export function paragraphIndentation(): Extension {
  const indentDecoration = StateField.define<DecorationSet>({
    create(state) {
      return buildDecorations(state.doc);
    },
    update(decorations, tr) {
      if (tr.docChanged) {
        return buildDecorations(tr.state.doc);
      }
      return decorations;
    },
    provide: field => EditorView.decorations.from(field),
  });

  // ch 단위 기반 들여쓰기 테마
  // border-left 패턴 사용: paddingLeft는 CodeMirror의 selection/activeLine 하이라이트가
  // 패딩 영역을 무시하는 문제가 있음. border-left는 이 문제를 해결함.
  // 참고: https://discuss.codemirror.net/t/making-codemirror-6-respect-indent-for-wrapped-lines/2881
  //
  // 참고: CSS ch 단위는 "0" 문자 기준. 실제 <tag> 렌더링 너비와 맞추기 위해 미세 조정.
  // 모노스페이스 폰트에서 대략 1 문자 = 1ch, 하지만 브라우저/폰트 차이로 약간의 오차 발생 가능.
  const indentTheme = EditorView.theme({
    '.cm-indent-3ch': { borderLeft: '3ch solid transparent' },  // <p> = 3글자
    '.cm-indent-4ch': { borderLeft: '4ch solid transparent' },  // <lg>, <ab>, <sp> = 4글자
    '.cm-indent-5ch': { borderLeft: '5ch solid transparent' },  // <cit> = 5글자
    '.cm-indent-7ch': { borderLeft: '7ch solid transparent' },  // <quote> = 7글자
  });

  return [indentDecoration, indentTheme];
}

/**
 * 문서 전체를 스캔하여 문단 태그 내부 줄에 데코레이션 적용
 */
function buildDecorations(doc: Text): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const openTagStack: string[] = [];  // 열린 태그 스택 추적

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;

    // 이 줄이 문단 열기 태그로 시작하는지 확인 (캐시된 정규식 사용)
    const startsWithParagraphOpen = PARAGRAPH_OPEN_REGEX.test(text);

    // 이 줄이 문단 닫기 태그로 시작하는지 확인 (캐시된 정규식 사용)
    const startsWithParagraphClose = PARAGRAPH_CLOSE_REGEX.test(text);

    // 들여쓰기 적용 조건:
    // - 스택에 열린 태그가 있음 (문단 내부에 있음)
    // - 열기 태그로 시작하지 않음 (태그 줄 자체는 들여쓰기 안함)
    // - 닫기 태그로 시작하지 않음 (닫기 태그도 들여쓰기 안함)
    if (openTagStack.length > 0 && !startsWithParagraphOpen && !startsWithParagraphClose) {
      // 가장 최근에 열린 태그의 클래스 사용
      const currentTag = openTagStack[openTagStack.length - 1];
      const indentClass = TAG_INDENT_MAP[currentTag] || DEFAULT_INDENT_CLASS;
      const decoration = Decoration.line({ attributes: { class: indentClass } });
      decorations.push(decoration.range(line.from));
    }

    // 줄 처리 후 스택 업데이트
    updateTagStack(text, openTagStack);
  }

  return RangeSet.of(decorations);
}

/**
 * 한 줄의 텍스트를 분석하여 태그 스택 업데이트
 * 열기 태그는 push, 닫기 태그는 pop
 */
function updateTagStack(text: string, stack: string[]): void {
  // 태그 순서를 정확히 추적하기 위해 모든 태그를 위치순으로 찾음
  // 캐시된 정규식 사용 (g 플래그이므로 lastIndex 리셋 필요)
  TAG_PATTERN_REGEX.lastIndex = 0;

  const matches: Array<{ isClose: boolean; tagName: string; index: number }> = [];
  let match;

  while ((match = TAG_PATTERN_REGEX.exec(text)) !== null) {
    const fullMatch = match[0];
    const isClose = match[1] === '/';
    const tagName = match[2].toLowerCase();

    // self-closing 태그 제외 (/>로 끝나는 경우)
    if (!isClose && fullMatch.endsWith('/>')) {
      continue;
    }

    matches.push({ isClose, tagName, index: match.index });
  }

  // 위치순으로 정렬 후 스택 업데이트
  matches.sort((a, b) => a.index - b.index);

  for (const m of matches) {
    if (m.isClose) {
      // 닫기 태그: 매칭되는 열기 태그를 스택에서 제거
      // (가장 최근에 열린 같은 태그를 찾아 제거)
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i] === m.tagName) {
          stack.splice(i, 1);
          break;
        }
      }
    } else {
      // 열기 태그: 스택에 추가
      stack.push(m.tagName);
    }
  }
}
