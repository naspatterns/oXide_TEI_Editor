# oXide TEI Editor - Project Guide

## Overview

**oXide TEI Editor** — 브라우저 기반 TEI(Text Encoding Initiative) XML 에디터. 디지털 인문학(DH) 연구자를 위해 스키마 인식 자동완성, 실시간 검증, XML Outline 트리 뷰를 제공한다. oXygen XML Editor($200+)의 무료 경량 대안.

## Quick Start

```bash
npm install
npm run dev      # Vite dev server (localhost:5173)
npm run build    # tsc + vite build → dist/
npm run preview  # dist/ 로컬 프리뷰
```

## Tech Stack

| 영역 | 기술 | 비고 |
|------|------|------|
| UI | React 18 + TypeScript | strict mode, `useReducer` 기반 상태관리 |
| 에디터 | CodeMirror 6 (`@uiw/react-codemirror`) | XML 구문강조, 자동태그닫기, 폴딩 |
| 자동완성 | `@codemirror/autocomplete` + 정적 스키마 | 컨텍스트 인식 (부모 엘리먼트 기반 필터링) |
| 검증 | 자체 구현 (`xmlValidator.ts`) | DOMParser well-formedness + 스키마 적합성 |
| 미리보기 | 자체 TEI→HTML 변환 (`teiTransform.ts`) | 60+ 엘리먼트 매핑, @rend 속성 지원 |
| 파일 | File System Access API + IndexedDB | Chrome/Edge 네이티브, Firefox/Safari 폴백 |
| 빌드 | Vite 6 | manualChunks: codemirror, react 분리 |
| PWA | Service Worker + manifest.json | 오프라인 캐싱 (network-first HTML, cache-first assets) |

## Architecture

### Component Hierarchy (v2.0 - 3-Panel Layout)

```
<App>                              ← 키보드 단축키, 자동저장, beforeunload
  <SchemaProvider>                 ← 스키마 상태 (TEI Lite / TEI All / 커스텀)
    <WorkspaceProvider>            ← 폴더/워크스페이스 상태
      <EditorProvider>             ← 다중 탭 에디터 상태 (openDocuments[], activeDocumentId)
        <AIProvider>               ← AI 상태 (messages[], authStatus, isLoading) (NEW)
          <AppShell>
            <Toolbar>
              <FileMenu />           ← New / Open / Save / Save As
              <SchemaSelector />     ← 스키마 선택 + 커스텀 .rng 업로드
              <ThemeToggle />        ← 다크/라이트 테마
            <MainLayout>             ← 3열 리사이저블 레이아웃
              <FileExplorer />       ← 왼쪽: 폴더 트리 뷰
              <EditorContainer>
                <EditorTabBar />     ← 탭 바
                <BreadcrumbBar />    ← XML 경로 네비게이션
                <XmlEditor />        ← CodeMirror 6 래퍼 (다중 탭 지원)
              <RightPanel>
                <OutlinePanel />     ← 오른쪽: XML 트리 구조 뷰
                <PreviewPanel />     ← HTML 미리보기
                <AIPanel />          ← AI 어시스턴트 채팅 (NEW)
            <StatusBar />            ← 검증 상태, 커서 위치, 스키마명
          <NewDocumentDialog />      ← 템플릿 선택 모달
```

### State Management

네 개의 React Context로 분리:

- **`SchemaContext`**: 현재 로드된 SchemaInfo (id, name, elements[], elementMap)
- **`WorkspaceContext`**: rootHandle, rootName, fileTree[], isLoading — 폴더 상태 관리
- **`EditorContext`**:
  - `multiTabState`: openDocuments[], activeDocumentId, tabOrder[], editorFontSize, outlineFontSize, viewMode
  - `state` (legacy 호환): 활성 문서의 상태를 반환하는 getter — 기존 컴포넌트 호환성 유지
- **`AIContext`** (NEW):
  - `authStatus`: 'unauthenticated' | 'mock' | 'authenticated'
  - `provider`: 'mock' | 'google' | 'openai' | 'anthropic'
  - `messages[]`: 채팅 메시지 히스토리
  - `isLoading`, `error`: 요청 상태

### Key Data Flow (성능 최적화 적용)

```
타이핑 → CodeMirror onUpdate (docChanged)
       → updateContentAndCursor(content, line, col)  ← 단일 dispatch (최적화됨)
       → React state 업데이트
                    ↓
             OutlinePanel (useDeferredValue → 지연 파싱, UI 블로킹 없음)
             AutoSave (30초 간격 IndexedDB)

타이핑 → CM6 linter extension (500ms debounce) → validateXml() → setErrors()
                                                                    ↓
                                                              StatusBar 표시

스키마 변경 → SchemaContext 업데이트 → extensions useMemo 업데이트 (remount 없음)
문서 변경 → documentVersion 증가 → XmlEditor key 변경 → CM6 remount
```

## File Structure

```
src/
├── types/
│   ├── schema.ts              # SchemaInfo, ElementSpec, AttrSpec, ValidationError
│   ├── editor.ts              # EditorState, ViewMode
│   ├── file.ts                # 파일 관리 타입
│   ├── workspace.ts           # OpenDocument, FileTreeNode, MultiTabEditorState
│   └── file-system-access.d.ts  # File System Access API + Directory 타입 선언
├── ai/                          # AI 모듈 (NEW)
│   ├── types.ts               # AIMessage, AIAction, AIState 타입
│   ├── AIContext.tsx          # AI 상태 관리 Context
│   ├── providers/
│   │   ├── types.ts           # IAIProvider 인터페이스
│   │   ├── mock.ts            # Mock Provider (개발용)
│   │   └── index.ts           # Provider 팩토리
│   ├── prompts/
│   │   ├── system.ts          # TEI 시스템 프롬프트
│   │   ├── templates.ts       # Quick Action 템플릿
│   │   └── mockResponses.ts   # Mock 응답 데이터
│   └── utils/
│       ├── contextBuilder.ts  # XML → AI 컨텍스트 (샌드박싱)
│       └── responseParser.ts  # AI 응답 파싱 (xml-action)
├── schema/
│   ├── SchemaEngine.ts        # 스키마 로드/파싱 총괄 (싱글톤)
│   ├── teiStaticSchema.ts     # TEI Lite/All 정적 엘리먼트 정의 (130+개)
│   ├── rngParser.ts           # RelaxNG XML → ElementSpec[] 런타임 파싱
│   └── xmlValidator.ts        # well-formedness + 스키마 검증
├── store/
│   ├── EditorContext.tsx       # 다중 탭 에디터 상태 Context
│   ├── SchemaContext.tsx       # 스키마 상태 Context
│   └── WorkspaceContext.tsx    # 폴더/워크스페이스 상태 Context
├── components/
│   ├── Editor/
│   │   ├── XmlEditor.tsx      # CodeMirror 래퍼 (다중 탭 지원)
│   │   ├── EditorTabBar.tsx   # 탭 바 컴포넌트 (NEW)
│   │   ├── BreadcrumbBar.tsx  # XML 경로 네비게이션 (NEW)
│   │   ├── QuickTagMenu.tsx   # 텍스트 선택 시 태그 래핑 메뉴
│   │   ├── extensions.ts      # CM6 확장 조립 (xml, lint, autocomplete, theme)
│   │   ├── completionSource.ts  # 컨텍스트 인식 자동완성
│   │   ├── validationLinter.ts  # CM6 linter → validateXml 브릿지
│   │   └── theme.ts           # CSS 변수 기반 CM6 커스텀 테마
│   ├── FileExplorer/          # 파일 탐색기 (NEW)
│   │   ├── FileExplorer.tsx   # 폴더 트리 뷰 컴포넌트
│   │   ├── FileTreeItem.tsx   # 재귀 트리 아이템
│   │   └── FileExplorer.css
│   ├── Outline/
│   │   ├── OutlinePanel.tsx   # XML 트리 구조 뷰 (확장/축소)
│   │   └── OutlinePanel.css
│   ├── Preview/
│   │   ├── PreviewPanel.tsx   # TEI → HTML 미리보기
│   │   ├── teiTransform.ts    # 60+ 엘리먼트 변환 엔진
│   │   └── tei-preview.css
│   ├── AI/                      # AI 어시스턴트 (NEW)
│   │   ├── AIPanel.tsx        # 메인 AI 패널
│   │   ├── AIPanel.css        # 스타일
│   │   ├── ChatMessage.tsx    # 메시지 컴포넌트 (마크다운 렌더링)
│   │   ├── ChatInput.tsx      # 입력창
│   │   ├── AILoginPlaceholder.tsx # 로그인 플레이스홀더
│   │   └── AIActions.tsx      # Quick Action 버튼
│   ├── Layout/
│   │   ├── AppShell.tsx       # 전체 레이아웃 쉘
│   │   ├── MainLayout.tsx     # 3열 리사이저블 레이아웃 (NEW)
│   │   ├── SplitPane.tsx      # 2열 레이아웃 (기존, RightPanel용)
│   │   ├── RightPanel.tsx     # 오른쪽 패널 래퍼
│   │   └── StatusBar.tsx
│   ├── Toolbar/               # Toolbar, FileMenu, SchemaSelector, ThemeToggle
│   └── FileDialog/            # NewDocumentDialog, AlertDialog
├── file/
│   ├── fileSystemAccess.ts    # FSA API 래퍼 + 디렉토리 API (확장됨)
│   ├── autoSave.ts            # IndexedDB 자동저장 (idb-keyval)
│   └── templates.ts           # TEI 문서 템플릿 4종
└── utils/
    ├── debounce.ts
    ├── xmlUtils.ts
    ├── browserCompat.ts       # hasDirectoryPicker() 추가
    └── schemaDetector.ts      # 스키마 선언 감지 및 경고
```

## Critical Design Decisions

### 1. CodeMirror Uncontrolled Mode (중요!)

`XmlEditor.tsx`에서 CodeMirror는 **uncontrolled** 모드로 동작한다:

```tsx
const [initialContent] = useState(() => state.content);  // mount 시 1회만 캡처
// ...
<CodeMirror
  key={`editor-${state.documentVersion}`}  // 문서 변경 시만 remount (스키마 변경 시는 X)
  value={initialContent}  // 초기값만 전달, 매 렌더마다 갱신하지 않음
/>
```

**이유**: `value={state.content}`로 controlled 모드를 사용하면, `setCursor`나 `setErrors`에 의한 React 재렌더링 시 stale content가 CodeMirror로 전달되어 **사용자가 타이핑한 글자가 삭제되는 버그**가 발생한다. 또한 key에 `schema.id`를 포함하면 스키마 전환 시 편집 중인 내용이 손실된다. `onChange`는 여전히 React state를 업데이트하므로 Outline/저장은 정상 동작.

### 2. Schema Engine 캐싱 전략

- **빌트인 스키마 (tei_lite, tei_all)**: 캐시 없음. 매번 `teiStaticSchema.ts`에서 fresh 생성. HMR/코드 수정 시 stale 데이터 방지.
- **커스텀 .rng 스키마**: `customCache`에 캐싱. 파싱이 비싸므로.

### 3. Schema 전환 시 동적 업데이트 (Remount 없음)

**주의**: 이전에는 `key={schema?.id + documentVersion}` 패턴을 사용했으나, 스키마 전환 시 **편집 중인 내용이 손실되는 버그**가 있어 수정됨. 현재는 `key={documentVersion}`만 사용하고, 스키마 변경은 `useMemo`로 extensions를 동적 업데이트하여 처리한다.

### 4. 정적 스키마 기반 자동완성 (snippetCompletion)

salve(브라우저 RelaxNG 검증기) 대신 정적 ElementSpec[]/AttrSpec[] 배열 기반. `completionSource.ts`에서:
- **커서 위치 인식**: 부모 엘리먼트를 파싱하여 허용되는 자식 엘리먼트만 필터링
- **Self-closing 태그**: `children: []`인 요소(`pb`, `lb`, `gap` 등)는 `<tag/>` 형태로 완성
- **일반 태그**: `<tag>${cursor}</tag>` 형태로 완성, 커서가 태그 사이에 위치
- **속성 완성**: `attr="${cursor}"` 형태로 완성, 커서가 따옴표 안에 위치

### 5. 다중 탭 상태 관리 (NEW)

EditorContext가 다중 문서를 지원하도록 리팩토링됨:

```tsx
interface MultiTabEditorState {
  openDocuments: OpenDocument[];  // 열린 문서 배열
  activeDocumentId: string | null; // 현재 활성 탭 ID
  tabOrder: string[];              // 탭 순서
  // ... 전역 설정
}
```

**핵심 패턴:**
- **하위 호환성**: `state` getter가 활성 문서의 상태를 반환 → 기존 컴포넌트 수정 불필요
- **중복 방지**: 같은 `filePath` 파일은 새 탭 대신 기존 탭 활성화
- **탭 닫기 로직**: 활성 탭 닫으면 인접 탭 자동 활성화

### 6. QuickTagMenu 억제 로직

텍스트 선택 후 태그 wrap 시 메뉴가 다시 나타나는 문제 해결:

```tsx
// wrap 후 500ms 동안 메뉴 표시 억제
suppressMenuUntilRef.current = Date.now() + 500;
wrapSelection(tagName);
```

**이유**: `wrapSelection()`이 새 selection을 설정 → `handleUpdate` 트리거 → 메뉴 재표시. 시간 기반 억제로 해결.

### 7. 키보드 입력 성능 최적화 (Session 3)

대용량 문서에서 타이핑 지연(70~200ms)을 해결하기 위해 3가지 최적화 적용:

**7-1. OutlinePanel useDeferredValue**
```tsx
// Before: 매 keystroke마다 XML 파싱 (30-100ms 블로킹)
const tree = useMemo(() => parseXmlToTree(state.content), [state.content]);

// After: React 18 concurrent rendering으로 지연 처리
const deferredContent = useDeferredValue(state.content);
const tree = useMemo(() => parseXmlToTree(deferredContent), [deferredContent]);
```
- XML 파싱이 UI를 블로킹하지 않음. 타이핑은 즉시 반영되고, Outline은 여유 시간에 업데이트.

**7-2. paragraphIndent 정규식 캐싱**
```tsx
// Before: 매 라인마다 new RegExp() (2000줄 문서에서 ~20-50ms)
const startsWithParagraphOpen = new RegExp(`^\\s*<(${PARAGRAPH_TAGS.join('|')})(\\s|>)`, 'i').test(text);

// After: 모듈 레벨에서 한 번만 생성
const PARAGRAPH_OPEN_REGEX = new RegExp(`^\\s*<(${PARAGRAPH_TAGS.join('|')})(\\s|>)`, 'i');
const startsWithParagraphOpen = PARAGRAPH_OPEN_REGEX.test(text);
```
- 파일: `src/components/Editor/paragraphIndent.ts`
- 3개 정규식 캐싱: `PARAGRAPH_OPEN_REGEX`, `PARAGRAPH_CLOSE_REGEX`, `TAG_PATTERN_REGEX`
- `g` 플래그 정규식은 사용 전 `lastIndex = 0` 리셋 필요

**7-3. dispatch 통합 (UPDATE_CONTENT_AND_CURSOR)**
```tsx
// Before: 2개 dispatch → 2회 React 재렌더링
handleChange: setContent(value);      // dispatch #1
handleUpdate: setCursor(line, col);   // dispatch #2

// After: 1개 dispatch → 1회 React 재렌더링
handleUpdate: updateContentAndCursor(content, line, col);  // 단일 dispatch
```
- 파일: `src/store/EditorContext.tsx`, `src/components/Editor/XmlEditor.tsx`
- 새 액션 타입: `UPDATE_CONTENT_AND_CURSOR`

**성능 개선 결과:**
| 항목 | Before | After |
|------|--------|-------|
| OutlinePanel XML 파싱 | 30-100ms (블로킹) | ~0ms (deferred) |
| paragraphIndent 정규식 | ~10-20ms | ~1-2ms |
| React dispatch | 2회 재렌더링 | 1회 재렌더링 |
| **체감 지연** | **70-205ms** | **~30-70ms** |

### 8. QuickTagMenu 스키마 인식 + 사용 빈도 추적 (Session 3)

하드코딩된 14개 태그 → 스키마 전체 태그(130+개) 제안으로 개선:

```tsx
// 스키마에서 모든 엘리먼트 가져오기
const allTags = schema.elements.map(el => ({
  name: el.name,
  doc: el.documentation || '',
}));

// 사용 빈도순 정렬 (localStorage 추적)
allTags.sort((a, b) => getTagScore(b.name, usageData) - getTagScore(a.name, usageData));
```

**사용 빈도 추적:**
- localStorage 키: `oxide-tag-usage`
- 데이터 구조: `{ tagName: { count: number, lastUsed: timestamp } }`
- 정렬 점수: `count + (1시간 이내 사용 시 +5 보너스)`

**키보드 네비게이션:**
| 키 | 동작 |
|----|------|
| `↑` / `↓` | 태그 선택 이동 |
| `Tab` / `Shift+Tab` | 순환 이동 |
| `Enter` | 선택한 태그로 래핑 |
| `Esc` | 메뉴 닫기 |

## Known Issues & Caveats

- **DTD 스키마 미지원**: RelaxNG(.rng)만 지원. DTD 파일 업로드 시 변환 안내 메시지 표시. trang 도구(`java -jar trang.jar schema.dtd schema.rng`)로 변환 가능.
- **Dropbox 경로 특수문자**: 프로젝트 경로에 `@`와 한글이 포함되어 있어 Vite 파일 워칭이 간헐적으로 실패할 수 있음. 코드 수정 후 반영 안 되면 서버 재시작 + 하드 리프레시(Cmd+Shift+R).
- **salve 미통합**: 원래 계획에 있던 salve(RelaxNG 검증기) 통합은 미구현. 현재 검증은 자체 `xmlValidator.ts` (DOMParser + 정적 스키마 매칭).
- **TEI 엘리먼트 커버리지**: `teiStaticSchema.ts`에 **367개** 엘리먼트가 정의되어 있으며 TEI P5의 ~73%를 커버함. `npm run generate-schema`로 RNG에서 추가 요소 자동 생성 가능.
- **Service Worker 캐시**: `sw.js`에서 캐시 버전이 `CACHE_VERSION` 상수로 관리됨. 배포 시 버전 변경 필요.
- **Outline 라인 번호**: XML 파싱 기반으로 라인 번호를 추정하므로 복잡한 문서에서 약간의 오차가 발생할 수 있음.
- **Directory Picker**: Chrome/Edge에서만 지원. Firefox/Safari는 단일 파일만 열기 가능 (친화적 에러 메시지 표시됨).

## Implementation Status

| Phase | 내용 | 상태 |
|-------|------|------|
| 1 | 기초 세팅 + XML 에디팅 | Done |
| 2 | 스키마 엔진 + 정적 자동완성 | Done |
| 3 | 실시간 검증 | Done |
| 4 | XML Outline 트리 뷰 | Done |
| 5 | 파일 관리 (FSA, 자동저장, 템플릿) | Done |
| 6 | 컨텍스트 인식 자동완성 + 커스텀 .rng | Done |
| 7 | PWA + 다크모드 + 반응형 | Done |
| 8 | 버그 수정 및 UX 개선 | Done |
| 9 | VS Code 스타일 3-패널 레이아웃 | Done |
| 10 | 키보드 입력 성능 최적화 + QuickTagMenu 개선 | Done |
| 11 | UX/UI 개선 (Toast, Command Palette, 컨텍스트 메뉴, 접근성) | Done |
| 12 | AI Assistant 통합 (Mock 모드, 채팅 UI, Quick Actions) | Done |
| 13 | UI 일관성 개선 (XPath 검색 스타일 통일) | Done |
| 14 | TEI 어휘 인식 범위 대폭 확장 (148→367개 요소, 73% 커버리지) | Done |
| **15** | **GitHub Pages 배포 준비 (PWA 아이콘, Private Mode 호환, CI/CD)** | **Done** |

## Potential Next Steps

- **AI 백엔드 구축**: OAuth 연동, API 프록시, 세션 관리
- salve 또는 @cwrc/salve-leafwriter 통합 (진정한 RelaxNG 검증)
- 탭 드래그 앤 드롭 재정렬
- 파일 탐색기에서 파일 생성/삭제/이름 변경 기능
- Split Editor (두 문서 동시 편집)
- 미니맵
- TEI 특화 기능:
  - Interactive Apparatus Viewer (이형 비교 팝업)
  - Facsimile Image Panel (IIIF 지원)
  - TEI Header Wizard (폼 기반 메타데이터)

## Build Output

번들 크기 (~303KB gzipped, Session 8 이후):
```
dist/index.html              1.48 kB │ gzip:   0.74 kB
dist/assets/index.css       60.99 kB │ gzip:  10.49 kB
dist/assets/index.js       416.34 kB │ gzip: 103.63 kB
dist/assets/react.js       134.67 kB │ gzip:  43.22 kB
dist/assets/codemirror.js  444.43 kB │ gzip: 145.84 kB
```

PWA 아이콘:
```
dist/icon-192.png           11.47 kB
dist/icon-512.png           31.79 kB
```

---

## 🚀 Current Status (2026-02-11)

### Version
- **v1.0.0-beta.1** (Git 태그 완료)
- Git 저장소 초기화 완료 (54 files, 6,777 lines)

### 오늘 완료한 작업 - Session 1 (2026-02-11) - ⚠️ 절대 되돌리지 말 것!

#### 1. 자동완성 `validFor` 정규식 수정
- **파일**: `src/components/Editor/completionSource.ts:216`
- **변경**: `/^[a-zA-Z_][\w.:_-]*$/` → `/^[\w.:_-]*$/`
- **이유**: 스페이스 직후 빈 문자열('')에서 속성 드롭다운 선택이 안 되는 버그 수정

#### 2. React Strict Mode 이중 팝업 해결
- **파일**: `src/App.tsx`
- **변경**: `useRef(false)`로 `recoveryAttempted` 추적 추가

#### 3. 에러 상세 팝업 (StatusBar)
- **파일**: `src/components/Layout/StatusBar.tsx`, `StatusBar.css`
- **기능**: 에러 영역 더블클릭 → 모달로 전체 에러 목록 표시

#### 4. 브랜딩 변경
- **이름**: oXide TEI Editor (oXygen 패러디)
- **Favicon**: 시안→마젠타 그라데이션, 다크 배경, "oX" 텍스트

---

### 오늘 완료한 작업 - Session 2 (2026-02-11) - VS Code 스타일 3-패널 레이아웃

#### 🎯 핵심 변경사항

**1. 다중 파일/탭 지원**
- 단일 문서 → `openDocuments[]` + `activeDocumentId` 구조로 변경
- 탭 전환 시 각 문서의 커서 위치, 에러 상태 독립 유지
- 같은 경로 파일 중복 열기 방지 (기존 탭 활성화)

**2. 워크스페이스 (폴더) 지원**
- `showDirectoryPicker()` API로 폴더 열기
- XML 파일만 필터링하여 트리 표시
- Chrome/Edge에서만 지원 (Firefox/Safari는 단일 파일만)

**3. 3-패널 레이아웃**
- 왼쪽: FileExplorer (폴더 트리)
- 가운데: TabBar + BreadcrumbBar + Editor
- 오른쪽: Outline/Preview

#### 📁 새로 추가된 파일

| 파일 | 설명 |
|------|------|
| `src/types/workspace.ts` | OpenDocument, FileTreeNode, MultiTabEditorState 타입 |
| `src/store/WorkspaceContext.tsx` | 폴더/워크스페이스 상태 관리 |
| `src/components/Layout/MainLayout.tsx` | 3열 리사이저블 레이아웃 |
| `src/components/FileExplorer/FileExplorer.tsx` | 파일 탐색기 컴포넌트 |
| `src/components/FileExplorer/FileTreeItem.tsx` | 트리 아이템 컴포넌트 |
| `src/components/Editor/EditorTabBar.tsx` | 탭 바 컴포넌트 |
| `src/components/Editor/BreadcrumbBar.tsx` | XML 경로 네비게이션 |

#### ⌨️ 새 키보드 단축키

| 단축키 | 동작 |
|--------|------|
| `Ctrl+N` | 새 문서 다이얼로그 (기존) |
| `Ctrl+Shift+N` | 빈 탭 즉시 생성 |
| `Ctrl+O` | 파일 열기 → 새 탭으로 |
| `Ctrl+S` | 현재 탭 저장 |
| `Ctrl+B` | 왼쪽 패널(Explorer) 토글 |

#### ⚠️ 핵심 설계 결정

**1. EditorContext 하위 호환성 유지**
```tsx
// multiTabState: 새로운 다중 탭 상태
// state: 기존 API 호환 (활성 문서 상태 반환)
const { state, multiTabState } = useEditor();
```
- 기존 컴포넌트(StatusBar, OutlinePanel 등)가 수정 없이 동작

**2. XmlEditor key 전략**
```tsx
key={`editor-${activeDoc.id}-${activeDoc.documentVersion}`}
```
- 탭 전환 또는 문서 재로드 시에만 CodeMirror remount
- 스키마 변경은 extensions로 동적 업데이트 (remount 없음)

**3. QuickTagMenu 재표시 방지**
```tsx
suppressMenuUntilRef.current = Date.now() + 500;
```
- wrap 후 500ms 동안 메뉴 표시 억제 (selection 변경에 의한 재표시 방지)

#### 📊 빌드 결과

```
dist/index.html           1.48 kB │ gzip:   0.75 kB
dist/assets/index.css    34.77 kB │ gzip:   6.34 kB
dist/assets/index.js     90.20 kB │ gzip:  27.51 kB
dist/assets/react.js    134.67 kB │ gzip:  43.22 kB
dist/assets/codemirror  444.41 kB │ gzip: 145.83 kB
```

---

---

### 오늘 완료한 작업 - Session 3 (2026-02-11) - 성능 최적화 + QuickTagMenu 개선

#### 🚀 키보드 입력 성능 최적화

대용량 문서(2000줄+)에서 체감되던 타이핑 지연(70~200ms) 해결:

**수정된 파일:**

| 파일 | 변경 내용 |
|------|----------|
| `src/components/Outline/OutlinePanel.tsx` | `useDeferredValue(state.content)` 적용 |
| `src/components/Editor/paragraphIndent.ts` | 정규식 3개 모듈 레벨 캐싱 + `lastIndex` 리셋 |
| `src/store/EditorContext.tsx` | `UPDATE_CONTENT_AND_CURSOR` 액션 추가 |
| `src/components/Editor/XmlEditor.tsx` | `handleUpdate`에서 통합 업데이트 사용 |

**핵심 코드 패턴:**

```tsx
// OutlinePanel.tsx - React 18 useDeferredValue
const deferredContent = useDeferredValue(state.content);
const tree = useMemo(() => parseXmlToTree(deferredContent), [deferredContent]);

// paragraphIndent.ts - 모듈 레벨 정규식 캐싱
const PARAGRAPH_OPEN_REGEX = new RegExp(`^\\s*<(${PARAGRAPH_TAGS.join('|')})(\\s|>)`, 'i');
TAG_PATTERN_REGEX.lastIndex = 0;  // g 플래그 정규식은 반드시 리셋

// XmlEditor.tsx - 통합 dispatch
if (update.docChanged) {
  updateContentAndCursor(content, cursorLine, cursorColumn);  // 1회 dispatch
} else if (update.selectionSet) {
  setCursor(cursorLine, cursorColumn);  // cursor만 변경 시
}
```

#### 🏷️ QuickTagMenu 스키마 인식 개선

**수정된 파일:**
- `src/components/Editor/QuickTagMenu.tsx` - 전면 재작성
- `src/components/Editor/QuickTagMenu.css` - 스타일 업데이트

**새로운 기능:**

| 기능 | 설명 |
|------|------|
| 스키마 전체 태그 | 현재 로드된 스키마의 모든 엘리먼트 표시 (130+개) |
| 사용 빈도 표시 | 태그 옆에 `×N` 형태로 사용 횟수 표시 |
| 자동 정렬 | 자주 사용하는 태그가 상위에 표시 |
| 최근 사용 부스트 | 1시간 이내 사용한 태그에 +5 우선순위 |
| 태그 수 표시 | 필터링 시 `12 / 130` 형태로 표시 |
| 설명 표시 | 스키마의 `documentation` 필드 활용 |
| 키보드 네비게이션 | ↑↓ 화살표, Tab, Enter 지원 |

**localStorage 키:** `oxide-tag-usage`

```tsx
// 사용 빈도 데이터 구조
interface TagUsage {
  count: number;    // 누적 사용 횟수
  lastUsed: number; // 마지막 사용 timestamp
}
type UsageData = Record<string, TagUsage>;
```

#### 📊 빌드 결과 (Session 3)

```
dist/index.html              1.48 kB │ gzip:   0.75 kB
dist/assets/index.css       35.64 kB │ gzip:   6.45 kB
dist/assets/index.js        93.18 kB │ gzip:  28.48 kB
dist/assets/react.js       134.67 kB │ gzip:  43.22 kB
dist/assets/codemirror.js  444.43 kB │ gzip: 145.84 kB
```

---

### 오늘 완료한 작업 - Session 4 (2026-02-11) - UX/UI 개선 (Phase 1-3)

#### 🎯 핵심 변경사항

**Phase 1: Foundation**
- **Toast 알림 시스템**: 저장 완료, 파일 열기 등 사용자 피드백 제공
- **CSS 변수 통일**: `--color-hover`, `--color-active`, `--color-focus-ring` 등 누락 변수 추가
- **다이얼로그 애니메이션**: slideUp + fadeIn 효과로 현대적 UX
- **버튼 인터랙션**: 클릭 시 scale(0.98) 효과

**Phase 2: Interactions**
- **Command Palette** (`Ctrl+K` / `Ctrl+Shift+P`): VS Code 스타일 명령어 검색
- **컨텍스트 메뉴**: 탭 바, 파일 탐색기에서 우클릭 메뉴 지원
- **리치 툴팁**: 키보드 단축키 배지가 포함된 커스텀 툴팁
- **XPath 검색창**: TEI 전문가를 위한 XPath 표현식 검색 기능

**Phase 3: Accessibility**
- **키보드 단축키 확장**: `Ctrl+W` (탭 닫기), `Ctrl+1~8` (탭 전환)
- **ARIA 레이블**: 스크린 리더를 위한 시맨틱 정보 추가
- **포커스 관리**: 에러 항목 등에 키보드 접근성 추가

#### 📁 새로 추가된 파일

| 파일 | 설명 |
|------|------|
| `src/components/Toast/Toast.tsx` | Toast 알림 시스템 (Context + 컴포넌트) |
| `src/components/Toast/Toast.css` | Toast 스타일 |
| `src/components/CommandPalette/CommandPalette.tsx` | Command Palette 컴포넌트 |
| `src/components/CommandPalette/CommandPalette.css` | Command Palette 스타일 |
| `src/components/ContextMenu/ContextMenu.tsx` | 컨텍스트 메뉴 컴포넌트 + useContextMenu 훅 |
| `src/components/ContextMenu/ContextMenu.css` | 컨텍스트 메뉴 스타일 |
| `src/components/Tooltip/Tooltip.tsx` | 리치 툴팁 컴포넌트 |
| `src/components/Tooltip/Tooltip.css` | 툴팁 스타일 |
| `src/components/Toolbar/XPathSearch.tsx` | XPath 검색 컴포넌트 |
| `src/components/Toolbar/XPathSearch.css` | XPath 검색 스타일 |
| `src/components/FileDialog/ConfirmDialog.tsx` | 확인 다이얼로그 (window.confirm 대체) |

#### ⌨️ 새 키보드 단축키

| 단축키 | 동작 |
|--------|------|
| `Ctrl+K` / `Ctrl+Shift+P` | Command Palette 열기 |
| `Ctrl+W` | 현재 탭 닫기 |
| `Ctrl+1~8` | 해당 번호 탭으로 전환 |
| 우클릭 | 컨텍스트 메뉴 (탭 바, 파일 탐색기) |

#### 📊 빌드 결과 (Session 4)

```
dist/index.html              1.48 kB │ gzip:   0.74 kB
dist/assets/index.css       52.97 kB │ gzip:   9.07 kB  (+17KB from new components)
dist/assets/index.js       114.70 kB │ gzip:  34.77 kB  (+21KB from new features)
dist/assets/react.js       134.67 kB │ gzip:  43.22 kB
dist/assets/codemirror.js  444.43 kB │ gzip: 145.84 kB
```

---

### 오늘 완료한 작업 - Session 5 (2026-02-11) - AI Assistant 통합 (Phase 1-2)

#### 🎯 핵심 변경사항

**Mock 모드로 AI 어시스턴트 구현 (백엔드 없이)**
- TEI XML 인코딩을 돕는 채팅 인터페이스
- 미리 준비된 Mock 응답으로 UI/UX 테스트 가능
- OAuth 로그인 버튼 (플레이스홀더, 추후 백엔드 연동)

**보안 샌드박싱**
- AI는 현재 편집 중인 XML 문서에만 접근 가능
- 앱 소스 코드, 파일 시스템, 다른 문서 접근 불가
- `buildXMLContext()`가 안전한 컨텍스트만 전달

#### 📁 새로 추가된 파일

| 파일 | 설명 |
|------|------|
| `src/ai/types.ts` | AI 관련 타입 정의 (AIMessage, AIAction, AIState 등) |
| `src/ai/AIContext.tsx` | AI 상태 관리 Context |
| `src/ai/providers/types.ts` | AI Provider 인터페이스 |
| `src/ai/providers/mock.ts` | Mock AI Provider (개발용) |
| `src/ai/providers/index.ts` | Provider 팩토리 |
| `src/ai/prompts/system.ts` | TEI 시스템 프롬프트 |
| `src/ai/prompts/templates.ts` | Quick Action 템플릿 |
| `src/ai/prompts/mockResponses.ts` | Mock 응답 데이터 (persName, date, header 등) |
| `src/ai/utils/contextBuilder.ts` | XML → AI 컨텍스트 변환 (샌드박싱) |
| `src/ai/utils/responseParser.ts` | AI 응답 파싱 (xml-action 블록 추출) |
| `src/components/AI/AIPanel.tsx` | 메인 AI 패널 컴포넌트 |
| `src/components/AI/AIPanel.css` | AI 패널 스타일 |
| `src/components/AI/ChatMessage.tsx` | 메시지 컴포넌트 (마크다운 렌더링) |
| `src/components/AI/ChatInput.tsx` | 입력창 컴포넌트 |
| `src/components/AI/AILoginPlaceholder.tsx` | 로그인 플레이스홀더 |
| `src/components/AI/AIActions.tsx` | Quick Action 버튼 |

#### 🔧 수정된 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/components/Layout/RightPanel.tsx` | "AI ✨" 탭 추가 |
| `src/App.tsx` | `<AIProvider>` 래퍼 추가 |

#### 🚀 주요 기능

| 기능 | 설명 |
|------|------|
| 채팅 인터페이스 | 마크다운 지원, 코드 블록 하이라이팅 |
| Quick Actions | 선택 설명, 오류 수정, 헤더 생성, 구조 분석 |
| xml-action 파싱 | AI 응답에서 `insert/replace/wrap` 액션 추출 |
| 액션 적용 | "적용" 버튼 클릭 → 에디터에 XML 삽입/래핑 |
| Mock 응답 | persName, date, placeName, header, 오류 수정 등 |

#### 📊 빌드 결과 (Session 5)

```
dist/index.html              1.48 kB │ gzip:   0.75 kB
dist/assets/index.css       61.15 kB │ gzip:  10.47 kB  (+8KB from AI panel)
dist/assets/index.js       135.55 kB │ gzip:  42.65 kB  (+21KB from AI module)
dist/assets/react.js       134.67 kB │ gzip:  43.22 kB
dist/assets/codemirror.js  444.43 kB │ gzip: 145.84 kB
```

#### 🏗️ 아키텍처

```
AIProvider (Context)
├── state: { authStatus, provider, messages[], isLoading, error }
├── sendMessage(content, context) → Provider.chat() → parseResponse()
├── applyAction(action) → EditorView dispatch
└── startMockMode() / logout()

Provider Interface
├── MockAIProvider (현재) - 하드코딩된 응답
├── OpenAIProvider (이후) - 백엔드 프록시 경유
└── AnthropicProvider (이후) - 백엔드 프록시 경유

buildXMLContext() - 샌드박싱
├── content (최대 50KB)
├── cursorLine, cursorColumn
├── selection
├── errors[]
└── schemaName
```

#### ⚠️ 제한사항

1. **Mock 모드만 지원**: 실제 AI API 연동은 백엔드 구축 후
2. **OAuth 미구현**: 로그인 버튼은 "서비스 준비 중" 메시지만 표시
3. **스트리밍 미지원**: 응답이 한 번에 표시됨 (이후 SSE로 개선 예정)

---

### 오늘 완료한 작업 - Session 6 (2026-02-11) - XPath 검색 UI 스타일 개선

#### 🎯 목표

XPath 검색 박스를 SCHEMA 셀렉터와 동일한 스타일로 통일하여 UI 일관성 개선

#### 📁 수정된 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/components/Toolbar/XPathSearch.css` | 컨테이너 테두리 + 레이블 스타일 + 입력창 스타일 변경 |

#### 🔧 변경 사항

**1. 컨테이너 스타일 (`.xpath-search-inline`)**

| 속성 | Before | After |
|------|--------|-------|
| background | 없음 | `var(--color-surface)` |
| border | 없음 | `2px solid var(--color-success)` |
| border-radius | 없음 | `6px` |
| padding | 없음 | `4px 8px` |
| box-shadow | 없음 | `0 0 0 1px rgba(40, 167, 69, 0.1)` |
| gap | `6px` | `8px` |

**2. 레이블 스타일 (`.xpath-label`)**

| 속성 | Before | After |
|------|--------|-------|
| font-size | `12px` | `10px` |
| font-weight | `500` | `600` |
| text-transform | 없음 | `uppercase` |
| letter-spacing | 없음 | `0.5px` |
| color | `var(--color-text-secondary)` | `var(--color-success)` |

**3. 입력창 스타일 (`.xpath-input`)**

| 속성 | Before | After |
|------|--------|-------|
| padding | `4px 8px` | `2px 4px` |
| background | `var(--color-surface)` | `transparent` |
| border | `1px solid var(--color-border)` | `none` |
| border-radius | `4px` | 제거 |
| transition | `all var(--transition-fast)` | 제거 |

**4. 다크 모드**

```css
[data-theme="dark"] .xpath-search-inline {
  border-color: var(--color-success);
  background: rgba(40, 167, 69, 0.1);
}
```

#### 💡 설계 원칙

- **컨테이너가 테두리/배경 담당**: SCHEMA 박스와 동일한 패턴
- **내부 input은 투명**: 컨테이너가 이미 스타일링되어 있으므로
- **색상 구분**: SCHEMA(파란색, primary) vs XPath(녹색, success)
- **크기 일치**: select와 input의 padding을 `2px 4px`로 통일

#### 📊 빌드 결과 (Session 6)

```
dist/index.html                       1.48 kB │ gzip:   0.75 kB
dist/assets/index.css                61.00 kB │ gzip:  10.41 kB
dist/assets/index.js                135.55 kB │ gzip:  42.65 kB
dist/assets/react.js                134.67 kB │ gzip:  43.22 kB
dist/assets/codemirror.js           444.43 kB │ gzip: 145.84 kB
```

---

### 오늘 완료한 작업 - Session 7 (2026-02-11) - TEI 어휘 인식 범위 대폭 확장

#### 🎯 목표

TEI 요소 커버리지를 **148개 → 350+개**로 확장하여 더 많은 TEI 프로젝트 유형 지원

#### 📊 결과 요약

| 항목 | Before | After |
|------|--------|-------|
| TEI 요소 개수 | 148개 | **367개** |
| TEI P5 커버리지 | ~30% | **~73%** |
| 빌드 크기 | 135.55 KB | 159.21 KB |

#### 📁 추가된 TEI 모듈

| 모듈 | 요소 수 | 용도 |
|------|---------|------|
| `TEI_MSDESC_ELEMENTS` | ~70개 | 필사본 기술 (msContents, physDesc, history 등) |
| `TEI_HEADER_EXTRA_ELEMENTS` | ~45개 | 메타데이터 (abstract, langUsage, textClass 등) |
| `TEI_NAMESDATES_ELEMENTS` | ~40개 | 명명 개체 (birth, death, relation 등) |
| `TEI_TEXTCRIT_ELEMENTS` | ~8개 | 비평 장치 (listWit, witness, rdgGrp 등) |
| `TEI_LINKING_ELEMENTS` | ~8개 | 링킹 (link, join, timeline 등) |
| `TEI_ANALYSIS_ELEMENTS` | ~1개 | 분석 (spanGrp) |
| `TEI_TRANSCR_ELEMENTS` | ~15개 | 전사 (surfaceGrp, metamark, transpose 등) |
| `TEI_GAIJI_ELEMENTS` | ~11개 | 특수 문자 (charDecl, g, glyph 등) |
| `TEI_VERSE_ELEMENTS` | ~4개 | 시 (caesura, rhyme, metDecl 등) |
| `TEI_SPOKEN_ELEMENTS` | ~12개 | 구술 텍스트 (u, pause, vocal 등) |
| `TEI_FIGURES_ELEMENTS` | ~4개 | 그림/수식 (formula, notatedMusic 등) |

#### 📁 새로 추가/수정된 파일

| 파일 | 설명 |
|------|------|
| `src/schema/teiStaticSchema.ts` | 11개 새 모듈 배열 + `getTeiAllElements()` 함수 |
| `src/schema/teiAutoGenerated.ts` | 자동 생성 요소 플레이스홀더 (신규) |
| `src/schema/SchemaEngine.ts` | `getTeiAllElements()` 사용으로 업데이트 |
| `scripts/generateTeiSchema.ts` | RNG 파서 스크립트 (신규) |
| `package.json` | `generate-schema` 스크립트 + `tsx` 의존성 추가 |

#### 🔧 새 npm 스크립트

```bash
npm run generate-schema           # 로컬 RNG 파일 사용하여 자동 생성
npm run generate-schema:download  # TEI-C에서 RNG 다운로드 후 생성
```

#### 🏗️ 아키텍처 변경

```
teiStaticSchema.ts
├── TEI_LITE_ELEMENTS (82개) - 기본 요소
├── TEI_ALL_EXTRA_ELEMENTS (66개) - 기존 추가 요소
├── TEI_MSDESC_ELEMENTS (70개) - 필사본 기술 [NEW]
├── TEI_HEADER_EXTRA_ELEMENTS (45개) - 헤더 확장 [NEW]
├── TEI_NAMESDATES_ELEMENTS (40개) - 명명 개체 [NEW]
├── TEI_TEXTCRIT_ELEMENTS (8개) - 비평 장치 [NEW]
├── TEI_LINKING_ELEMENTS (8개) - 링킹 [NEW]
├── TEI_ANALYSIS_ELEMENTS (1개) - 분석 [NEW]
├── TEI_TRANSCR_ELEMENTS (15개) - 전사 [NEW]
├── TEI_GAIJI_ELEMENTS (11개) - 특수 문자 [NEW]
├── TEI_VERSE_ELEMENTS (4개) - 시 [NEW]
├── TEI_SPOKEN_ELEMENTS (12개) - 구술 텍스트 [NEW]
├── TEI_FIGURES_ELEMENTS (4개) - 그림/수식 [NEW]
└── TEI_AUTO_GENERATED_ELEMENTS (0개*) - RNG에서 자동 생성

* generate-schema 실행 후 추가 요소 포함 가능
```

#### ⚡ 주요 추가 요소 예시

**필사본 기술 (msdescription):**
- `msContents`, `msItem`, `incipit`, `explicit`, `rubric`, `colophon`
- `physDesc`, `objectDesc`, `supportDesc`, `layoutDesc`
- `handDesc`, `handNote`, `scriptDesc`, `decoDesc`
- `history`, `origin`, `provenance`, `acquisition`

**명명 개체 (namesdates):**
- `birth`, `death`, `floruit`, `residence`, `affiliation`
- `education`, `faith`, `nationality`, `occupation`, `socecStatus`
- `relation`, `relationGrp`, `listRelation`
- `location`, `geo`, `climate`, `terrain`, `population`

**헤더 확장:**
- `abstract`, `creation`, `langUsage`, `language`, `textClass`
- `taxonomy`, `category`, `catDesc`, `tagsDecl`, `rendition`
- `editorialDecl`, `correction`, `normalization`, `hyphenation`

#### 📊 빌드 결과 (Session 7)

```
dist/index.html                       1.48 kB │ gzip:   0.75 kB
dist/assets/index.css                61.00 kB │ gzip:  10.41 kB
dist/assets/index.js                159.21 kB │ gzip:  48.01 kB  (+24KB from new elements)
dist/assets/react.js                134.67 kB │ gzip:  43.22 kB
dist/assets/codemirror.js           444.43 kB │ gzip: 145.84 kB
```

---

### 오늘 완료한 작업 - Session 8 (2026-02-11) - GitHub Pages 배포 준비

#### 🎯 목표

GitHub Pages 배포 시 발생할 수 있는 문제점을 사전에 해결:
- PWA 아이콘 미존재 (manifest.json 404 에러)
- Private Mode (Safari/Firefox) 충돌
- Service Worker 캐시 버전 관리
- CI/CD 자동화

#### 📁 새로 추가된 파일

| 파일 | 설명 |
|------|------|
| `public/icon-192.png` | PWA 아이콘 192x192 (11KB) |
| `public/icon-512.png` | PWA 아이콘 512x512 (31KB) |
| `scripts/generateIcons.ts` | sharp 기반 아이콘 생성 스크립트 |
| `.github/workflows/deploy.yml` | GitHub Actions 자동 배포 워크플로우 |

#### 🔧 수정된 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/main.tsx` | localStorage try-catch 추가 (Private Mode 호환) |
| `src/components/Toolbar/ThemeToggle.tsx` | `safeSetItem()` 헬퍼 함수 추가 |
| `public/sw.js` | `CACHE_VERSION` 상수 기반 버전 관리 |
| `src/file/autoSave.ts` | IndexedDB 모든 함수에 try-catch 추가 |
| `src/file/fileSystemAccess.ts` | `DirectoryPickerNotSupportedError` 커스텀 에러 클래스 |
| `src/components/Toast/Toast.css` | `@supports (backdrop-filter)` 폴백 추가 |
| `package.json` | `sharp` 의존성 + `generate-icons` 스크립트 |

#### 🛡️ 브라우저 호환성 개선

**Private Mode 충돌 방지 패턴:**

```tsx
// localStorage (main.tsx, ThemeToggle.tsx)
try {
  const saved = localStorage.getItem('key');
} catch {
  // Private Mode에서 graceful fallback
}

// IndexedDB (autoSave.ts)
try {
  await set(AUTOSAVE_KEY, data);
} catch (error) {
  console.warn('Autosave unavailable:', error);
}
```

**Directory Picker 친화적 에러:**

```tsx
// 기존: throw new Error('Directory picker not supported')
// 신규: 사용자 친화적 메시지
export class DirectoryPickerNotSupportedError extends Error {
  constructor() {
    super('Folder opening requires Chrome or Edge browser. ' +
          'In Firefox or Safari, you can still open individual XML files.');
  }
}
```

**CSS 폴백 (Firefox):**

```css
/* backdrop-filter 미지원 브라우저 대응 */
@supports (backdrop-filter: blur(8px)) {
  .toast {
    backdrop-filter: blur(8px);
    background: color-mix(in srgb, var(--color-surface) 85%, transparent);
  }
}
```

#### 🚀 GitHub Actions 워크플로우

`.github/workflows/deploy.yml`:
- **트리거**: `main` 브랜치 push 또는 수동 실행
- **Node.js**: v20
- **캐싱**: npm dependencies
- **배포**: GitHub Pages (artifacts)

```yaml
# 주요 단계
- npm ci
- npm run build
- actions/upload-pages-artifact (dist/)
- actions/deploy-pages
```

#### 🔧 새 npm 스크립트

```bash
npm run generate-icons  # PWA 아이콘 생성 (sharp 사용)
```

#### 📊 빌드 결과 (Session 8)

```
dist/index.html              1.48 kB │ gzip:   0.74 kB
dist/assets/index.css       60.99 kB │ gzip:  10.49 kB
dist/assets/index.js       416.34 kB │ gzip: 103.63 kB
dist/assets/react.js       134.67 kB │ gzip:  43.22 kB
dist/assets/codemirror.js  444.43 kB │ gzip: 145.84 kB
dist/icon-192.png           11.47 kB
dist/icon-512.png           31.79 kB
```

#### 🚀 GitHub 배포 단계

1. **리포지토리 생성 및 푸시:**
   ```bash
   gh repo create oXide-TEI-Editor --public --source=. --push
   ```

2. **GitHub Pages 활성화:**
   - Settings → Pages → Source: **GitHub Actions**

3. **자동 배포 확인:**
   - Actions 탭에서 워크플로우 실행 확인
   - `https://<username>.github.io/<repo-name>/` 접속

---

### ⚠️ 다음 할 일

1. **GitHub 배포 완료**
   - 리포지토리 생성: `gh repo create`
   - Settings → Pages → Source: GitHub Actions
   - 배포 후 PWA 설치 테스트

2. **AI 백엔드 구축 (이후)**
   - Express/Fastify 서버
   - Google/OpenAI OAuth 통합
   - AI API 프록시 (API 키 보호)

3. **추가 기능 (선택)**
   - 탭 드래그 앤 드롭 재정렬
   - 최근 열었던 파일/폴더 목록
   - Split Editor (두 문서 동시 편집)
   - 미니맵
