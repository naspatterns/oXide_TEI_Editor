import { type Extension, RangeSetBuilder } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

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
 *
 * 성능(감사 #1): 이전 구현은 StateField로 매 keystroke마다 문서 "전체"의
 * 데코레이션과 RangeSet를 동기 재빌드했다. 이제 ViewPlugin으로 "보이는 줄"만
 * 데코레이션한다. 뷰포트 시작 지점의 문단-태그 스택은 문서 처음부터 스캔해서
 * 구하지만(정규식/스택만, 데코레이션 할당 없음), 대부분의 줄에는 문단 태그가
 * 없어 정규식이 빠르게 실패하므로 저렴하다. 보이는 줄에 대한 출력은 이전과
 * 동일하다. (앞부분 스캔까지 없애려면 lang-xml 구문트리 기반으로 확장 가능.)
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

// 클래스별 Decoration을 한 번만 생성해 재사용 (줄마다 새로 할당하지 않음)
const LINE_DECORATIONS: Record<string, Decoration> = Object.fromEntries(
  [...new Set([...Object.values(TAG_INDENT_MAP), DEFAULT_INDENT_CLASS])].map(
    (cls) => [cls, Decoration.line({ attributes: { class: cls } })],
  ),
);

/**
 * 한 줄에 적용할 들여쓰기 클래스를 반환한다. `openStack`은 이 줄을 처리하기
 * "전"의 열린 문단-태그 스택이다. 들여쓰기 대상이 아니면 null.
 */
export function indentClassForLine(text: string, openStack: string[]): string | null {
  const startsWithOpen = PARAGRAPH_OPEN_REGEX.test(text);
  const startsWithClose = PARAGRAPH_CLOSE_REGEX.test(text);
  if (openStack.length > 0 && !startsWithOpen && !startsWithClose) {
    const currentTag = openStack[openStack.length - 1];
    return TAG_INDENT_MAP[currentTag] || DEFAULT_INDENT_CLASS;
  }
  return null;
}

/**
 * 한 줄의 텍스트를 분석하여 태그 스택 업데이트
 * 열기 태그는 push, 닫기 태그는 pop
 */
export function updateTagStack(text: string, stack: string[]): void {
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

/**
 * 문단 블록 들여쓰기 확장 (뷰포트 한정 ViewPlugin)
 */
export function paragraphIndentation(): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildVisibleDecorations(view);
      }

      update(update: ViewUpdate): void {
        // 편집 또는 스크롤(뷰포트 이동) 시에만 재계산
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildVisibleDecorations(update.view);
        }
      }
    },
    {
      decorations: (v) => v.decorations,
    },
  );

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

  return [plugin, indentTheme];
}

/**
 * 현재 보이는 범위의 줄에만 들여쓰기 데코레이션을 만든다. 각 보이는 범위의
 * 시작 줄에서의 문단-태그 스택은 문서 처음부터 스캔해서 구한다.
 */
function buildVisibleDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;

  for (const { from, to } of view.visibleRanges) {
    const startLine = doc.lineAt(from).number;
    const endLine = doc.lineAt(to).number;

    // 첫 보이는 줄 직전까지의 열린 문단-태그 스택을 계산 (데코레이션 할당 없이)
    const stack: string[] = [];
    for (let i = 1; i < startLine; i++) {
      updateTagStack(doc.line(i).text, stack);
    }

    // 보이는 줄만 데코레이션
    for (let i = startLine; i <= endLine; i++) {
      const line = doc.line(i);
      const cls = indentClassForLine(line.text, stack);
      if (cls) {
        builder.add(line.from, line.from, LINE_DECORATIONS[cls]);
      }
      updateTagStack(line.text, stack);
    }
  }

  return builder.finish();
}
