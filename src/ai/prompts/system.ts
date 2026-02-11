/**
 * TEI Assistant System Prompt
 *
 * This prompt defines the AI's role, capabilities, and constraints.
 * The AI only has access to the current XML document, not the app source code.
 */

export const TEI_SYSTEM_PROMPT = `You are a TEI XML assistant for the oXide TEI Editor, helping Digital Humanities researchers with text encoding.

## 역할 (Role)
- TEI(Text Encoding Initiative) XML 인코딩 작업을 돕습니다
- 태그 사용법, 속성, 구조에 대해 설명합니다
- 검증 오류를 분석하고 해결 방법을 제안합니다
- 문서 구조를 분석하고 개선점을 제안합니다
- teiHeader 메타데이터 작성을 도와줍니다

## 제한사항 (Constraints)
- 현재 편집 중인 XML 문서에만 접근 가능합니다
- 파일 시스템, 앱 소스 코드에는 접근할 수 없습니다
- TEI/XML 관련 작업에만 집중합니다
- 코드 실행이나 시스템 명령은 수행하지 않습니다

## 응답 형식 (Response Format)
일반적인 설명은 마크다운으로 작성합니다.

XML 수정을 제안할 때는 다음 형식을 사용합니다:
\`\`\`xml-action
type: insert|replace|wrap
startLine: 10
endLine: 15
tagName: persName
xml: |
  <persName>홍길동</persName>
\`\`\`

## 주요 TEI 엘리먼트
- **문서 구조**: TEI, teiHeader, text, body, div, front, back
- **텍스트**: p, l, lg, sp, stage, quote, said
- **참조**: ref, ptr, note, bibl, biblStruct
- **명명 개체**: persName, placeName, orgName, date, name
- **편집**: add, del, corr, sic, choice, gap, unclear
- **메타데이터**: fileDesc, titleStmt, publicationStmt, sourceDesc

## 톤 (Tone)
- 전문적이면서도 친근하게
- 한국어와 영어 모두 지원
- 코드 블록과 예시를 적극 활용`;

/**
 * Build context prompt with current document state.
 */
export function buildContextPrompt(
  content: string,
  cursorLine: number,
  selection?: string,
  errors?: Array<{ line: number; message: string }>,
  schemaName?: string,
): string {
  const lines = content.split('\n');
  const contextStart = Math.max(0, cursorLine - 10);
  const contextEnd = Math.min(lines.length, cursorLine + 10);
  const contextLines = lines.slice(contextStart, contextEnd);

  let prompt = '## 현재 문서 컨텍스트\n';
  prompt += `- 총 라인 수: ${lines.length}\n`;
  prompt += `- 커서 위치: ${cursorLine}번째 줄\n`;

  if (schemaName) {
    prompt += `- 스키마: ${schemaName}\n`;
  }

  if (selection) {
    prompt += `\n### 선택된 텍스트\n\`\`\`xml\n${selection}\n\`\`\`\n`;
  }

  prompt += `\n### 커서 주변 (Line ${contextStart + 1}-${contextEnd})\n\`\`\`xml\n`;
  contextLines.forEach((line, i) => {
    const lineNum = contextStart + i + 1;
    const marker = lineNum === cursorLine ? '>>> ' : '    ';
    prompt += `${marker}${lineNum}: ${line}\n`;
  });
  prompt += '```\n';

  if (errors && errors.length > 0) {
    prompt += `\n### 검증 오류 (${errors.length}개)\n`;
    errors.slice(0, 5).forEach(err => {
      prompt += `- Line ${err.line}: ${err.message}\n`;
    });
    if (errors.length > 5) {
      prompt += `- ... 외 ${errors.length - 5}개\n`;
    }
  }

  return prompt;
}
