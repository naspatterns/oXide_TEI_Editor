/**
 * Mock AI Responses
 *
 * Pre-defined responses for development and testing.
 * These simulate realistic AI responses for common queries.
 */

import type { XMLContext } from '../types';

/** Response patterns with keywords and responses */
interface ResponsePattern {
  keywords: string[];
  response: string;
}

const RESPONSE_PATTERNS: ResponsePattern[] = [
  // TEI Tag Questions
  {
    keywords: ['persname', 'persName', '인물', '사람', '이름'],
    response: `## persName 태그

\`<persName>\` 엘리먼트는 인물명을 마크업할 때 사용합니다.

### 기본 사용법
\`\`\`xml
<persName>홍길동</persName>
\`\`\`

### 속성 활용
\`\`\`xml
<persName ref="#person001" type="historical">
  세종대왕
</persName>
\`\`\`

### 주요 속성
- \`@ref\`: 인물 ID 참조 (예: #person001)
- \`@type\`: 인물 유형 (historical, fictional, mythological)
- \`@key\`: 외부 식별자 (VIAF, ISNI 등)
- \`@role\`: 텍스트 내 역할 (author, recipient 등)

### xml-action 예시

\`\`\`xml-action
type: wrap
tagName: persName
xml: |
  <persName ref="#">선택한 텍스트</persName>
\`\`\`

💡 **Tip**: 인물 정보를 \`<listPerson>\`에 정의하고 @ref로 참조하면 일관성을 유지할 수 있습니다.`,
  },
  {
    keywords: ['placename', 'placeName', '장소', '지명', '위치'],
    response: `## placeName 태그

\`<placeName>\` 엘리먼트는 지명(장소명)을 마크업할 때 사용합니다.

### 기본 사용법
\`\`\`xml
<placeName>서울</placeName>
\`\`\`

### 상세 마크업
\`\`\`xml
<placeName>
  <settlement>서울</settlement>
  <country>대한민국</country>
</placeName>
\`\`\`

### 좌표 정보 포함
\`\`\`xml
<placeName ref="#place001">
  <geo>37.5665 126.9780</geo>
  경복궁
</placeName>
\`\`\`

### 주요 속성
- \`@ref\`: 장소 ID 참조
- \`@type\`: 장소 유형 (city, country, region)
- \`@key\`: 외부 식별자 (GeoNames 등)

💡 **Tip**: 역사적 지명과 현대 지명이 다른 경우, \`<choice>\`를 활용하세요.`,
  },
  {
    keywords: ['date', '날짜', '연도', '시간'],
    response: `## date 태그

\`<date>\` 엘리먼트는 날짜를 마크업할 때 사용합니다.

### 기본 사용법
\`\`\`xml
<date when="1446-10-09">훈민정음 반포일</date>
\`\`\`

### 기간 표시
\`\`\`xml
<date from="1392" to="1910">조선시대</date>
\`\`\`

### 불확실한 날짜
\`\`\`xml
<date notBefore="1400" notAfter="1450" cert="medium">
  15세기 초
</date>
\`\`\`

### 주요 속성
- \`@when\`: 정확한 날짜 (ISO 8601 형식)
- \`@from\`, \`@to\`: 기간
- \`@notBefore\`, \`@notAfter\`: 불확실한 범위
- \`@cert\`: 확실성 (high, medium, low)
- \`@calendar\`: 달력 체계 (#gregorian, #lunar 등)

💡 **Tip**: 음력 날짜는 \`@calendar="#lunar"\`를 사용하고, 양력 환산값을 \`@when\`에 넣으세요.`,
  },
  {
    keywords: ['header', 'teiheader', '헤더', '메타데이터'],
    response: `## teiHeader 구조

\`<teiHeader>\`는 문서 메타데이터를 담는 필수 요소입니다.

### 기본 구조
\`\`\`xml
<teiHeader>
  <fileDesc>
    <titleStmt>
      <title>문서 제목</title>
      <author>저자명</author>
    </titleStmt>
    <publicationStmt>
      <publisher>출판사/기관</publisher>
      <date when="2024">2024</date>
      <availability>
        <licence>CC BY 4.0</licence>
      </availability>
    </publicationStmt>
    <sourceDesc>
      <bibl>원본 출처 정보</bibl>
    </sourceDesc>
  </fileDesc>
</teiHeader>
\`\`\`

### 확장 구조
- \`<encodingDesc>\`: 인코딩 규칙 설명
- \`<profileDesc>\`: 텍스트 프로필 (언어, 장르 등)
- \`<revisionDesc>\`: 수정 이력

\`\`\`xml-action
type: insert
startLine: 3
xml: |
  <teiHeader>
    <fileDesc>
      <titleStmt>
        <title>문서 제목을 입력하세요</title>
      </titleStmt>
      <publicationStmt>
        <p>출판 정보</p>
      </publicationStmt>
      <sourceDesc>
        <p>원본 출처</p>
      </sourceDesc>
    </fileDesc>
  </teiHeader>
\`\`\``,
  },
  {
    keywords: ['오류', '에러', 'error', 'fix', '수정'],
    response: `## 오류 분석

현재 문서의 오류를 확인해 보겠습니다.

### 일반적인 TEI 오류 유형

**1. 태그 불일치**
\`\`\`xml
<!-- 잘못된 예 -->
<p>텍스트<p>  <!-- 닫는 태그 누락 -->

<!-- 올바른 예 -->
<p>텍스트</p>
\`\`\`

**2. 필수 속성 누락**
\`\`\`xml
<!-- ref 엘리먼트는 target 필수 -->
<ref target="#note1">주석 참조</ref>
\`\`\`

**3. 잘못된 중첩**
\`\`\`xml
<!-- 잘못된 예 -->
<p>단락 <div>블록</div> 계속</p>

<!-- 올바른 예 -->
<p>단락</p>
<div>블록</div>
<p>계속</p>
\`\`\`

**4. 네임스페이스 누락**
\`\`\`xml
<!-- TEI 루트에 네임스페이스 필수 -->
<TEI xmlns="http://www.tei-c.org/ns/1.0">
\`\`\`

💡 **Tip**: StatusBar의 에러 영역을 더블클릭하면 전체 오류 목록을 볼 수 있습니다.`,
  },
  {
    keywords: ['구조', 'structure', '분석', 'analyze'],
    response: `## 문서 구조 분석

TEI 문서의 기본 구조를 분석해 드리겠습니다.

### 표준 TEI 구조
\`\`\`
TEI
├── teiHeader (필수)
│   └── fileDesc
│       ├── titleStmt
│       ├── publicationStmt
│       └── sourceDesc
└── text
    ├── front (선택)
    ├── body (필수)
    │   └── div, p, ...
    └── back (선택)
\`\`\`

### 권장사항

1. **div 계층 구조**: 논리적 섹션 구분에 \`<div>\` 사용
2. **type 속성**: \`<div type="chapter">\`처럼 섹션 유형 명시
3. **xml:id**: 참조가 필요한 요소에 고유 ID 부여
4. **참조 링크**: \`<ref target="#id">\`로 내부 참조

### 개선 제안
- 긴 문서는 \`<div>\`로 섹션 분리
- 페이지/라인 참조용 \`<pb>\`, \`<lb>\` 추가
- 명명 개체(인물, 장소, 날짜) 마크업

Outline 패널에서 현재 문서 구조를 시각적으로 확인할 수 있습니다.`,
  },
  // Default/Greeting
  {
    keywords: ['안녕', '반가', 'hello', 'hi', '도움'],
    response: `안녕하세요! 👋 TEI XML 인코딩을 도와드리는 AI 어시스턴트입니다.

## 제가 도와드릴 수 있는 것들

- 🏷️ **TEI 태그 사용법**: persName, placeName, date 등
- 🔧 **오류 수정**: 검증 오류 분석 및 해결 방법
- 📋 **헤더 생성**: teiHeader 메타데이터 작성
- 🔍 **구조 분석**: 문서 구조 개선 제안

## 빠른 시작

아래 **Quick Actions** 버튼을 사용하거나, 직접 질문해 주세요:

- "persName 태그는 어떻게 사용하나요?"
- "현재 문서의 오류를 수정해 주세요"
- "teiHeader를 생성해 주세요"

무엇을 도와드릴까요?`,
  },
];

/** Default response when no pattern matches */
const DEFAULT_RESPONSE = `죄송합니다, 질문을 정확히 이해하지 못했습니다.

다음과 같은 질문을 해보세요:
- "persName 태그는 어떻게 사용하나요?"
- "날짜를 마크업하는 방법을 알려주세요"
- "teiHeader 구조를 설명해 주세요"
- "현재 오류를 분석해 주세요"

또는 아래 **Quick Actions** 버튼을 사용해 보세요.`;

/**
 * Get a mock response based on user input and context.
 */
export function getMockResponse(userMessage: string, _context: XMLContext): string {
  const lowerMessage = userMessage.toLowerCase();

  // Find matching pattern
  for (const pattern of RESPONSE_PATTERNS) {
    if (pattern.keywords.some(kw => lowerMessage.includes(kw.toLowerCase()))) {
      return pattern.response;
    }
  }

  return DEFAULT_RESPONSE;
}
