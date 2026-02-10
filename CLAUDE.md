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

### Component Hierarchy

```
<App>                          ← 키보드 단축키, 자동저장, beforeunload
  <SchemaProvider>             ← 스키마 상태 (TEI Lite / TEI All / 커스텀)
    <EditorProvider>           ← 에디터 상태 (content, cursor, errors, viewMode)
      <AppShell>
        <Toolbar>
          <FileMenu />         ← New / Open / Save / Save As
          <SchemaSelector />   ← 스키마 선택 + 커스텀 .rng 업로드 (DTD는 미지원)
          <ThemeToggle />      ← 다크/라이트 테마
        <SplitPane>
          <XmlEditor />        ← CodeMirror 6 래퍼
          <OutlinePanel />     ← XML 트리 구조 뷰 (확장/축소)
        <StatusBar />          ← 검증 상태, 커서 위치, 스키마명
      <NewDocumentDialog />    ← 템플릿 선택 모달
```

### State Management

두 개의 React Context로 분리:

- **`EditorContext`** (`useReducer`): content, fileName, fileHandle, isDirty, cursorLine/Column, errors, isValidating, viewMode, documentVersion
- **`SchemaContext`**: 현재 로드된 SchemaInfo (id, name, elements[], elementMap)

### Key Data Flow

```
타이핑 → CodeMirror onChange → setContent(value) → React state 업데이트
                                                   ↓
                                            OutlinePanel (useMemo → parseXmlToTree)
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
│   └── file-system-access.d.ts  # File System Access API 타입 선언
├── schema/
│   ├── SchemaEngine.ts        # 스키마 로드/파싱 총괄 (싱글톤)
│   ├── teiStaticSchema.ts     # TEI Lite/All 정적 엘리먼트 정의 (130+개)
│   ├── rngParser.ts           # RelaxNG XML → ElementSpec[] 런타임 파싱
│   └── xmlValidator.ts        # well-formedness + 스키마 검증
├── store/
│   ├── EditorContext.tsx       # 에디터 상태 Context + Reducer
│   └── SchemaContext.tsx       # 스키마 상태 Context
├── components/
│   ├── Editor/
│   │   ├── XmlEditor.tsx      # CodeMirror 래퍼 (uncontrolled 모드)
│   │   ├── extensions.ts      # CM6 확장 조립 (xml, lint, autocomplete, theme)
│   │   ├── completionSource.ts  # 컨텍스트 인식 자동완성
│   │   ├── validationLinter.ts  # CM6 linter → validateXml 브릿지
│   │   └── theme.ts           # CSS 변수 기반 CM6 커스텀 테마
│   ├── Outline/
│   │   ├── OutlinePanel.tsx   # XML 트리 구조 뷰 (확장/축소)
│   │   └── OutlinePanel.css   # Outline 스타일링
│   ├── Preview/
│   │   ├── PreviewPanel.tsx   # TEI → HTML 미리보기 (현재 미사용)
│   │   ├── teiTransform.ts    # 60+ 엘리먼트 변환 엔진
│   │   └── tei-preview.css    # 학술 문서 타이포그래피
│   ├── Layout/                # AppShell, SplitPane, StatusBar
│   ├── Toolbar/               # Toolbar, FileMenu, SchemaSelector, ThemeToggle
│   └── FileDialog/            # NewDocumentDialog (템플릿 선택)
├── file/
│   ├── fileSystemAccess.ts    # FSA API 래퍼 + 레거시 폴백
│   ├── autoSave.ts            # IndexedDB 자동저장 (idb-keyval)
│   └── templates.ts           # TEI 문서 템플릿 4종
└── utils/
    ├── debounce.ts
    ├── xmlUtils.ts
    └── browserCompat.ts
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

## Known Issues & Caveats

- **DTD 스키마 미지원**: RelaxNG(.rng)만 지원. DTD 파일 업로드 시 변환 안내 메시지 표시. trang 도구(`java -jar trang.jar schema.dtd schema.rng`)로 변환 가능.
- **Dropbox 경로 특수문자**: 프로젝트 경로에 `@`와 한글이 포함되어 있어 Vite 파일 워칭이 간헐적으로 실패할 수 있음. 코드 수정 후 반영 안 되면 서버 재시작 + 하드 리프레시(Cmd+Shift+R).
- **PWA 아이콘 미생성**: `manifest.json`이 `icon-192.png`, `icon-512.png`을 참조하지만 실제 파일 미생성 상태.
- **salve 미통합**: 원래 계획에 있던 salve(RelaxNG 검증기) 통합은 미구현. 현재 검증은 자체 `xmlValidator.ts` (DOMParser + 정적 스키마 매칭).
- **TEI 엘리먼트 커버리지**: `teiStaticSchema.ts`에 130+개 엘리먼트가 정의되어 있으나 TEI 전체(500+개)를 커버하지는 않음. 필요 시 엘리먼트 추가 가능.
- **Service Worker 캐시**: `sw.js`에서 캐시 버전이 `oxide-tei-v1` 하드코딩. 업데이트 시 버전 변경 필요.
- **Outline 라인 번호**: XML 파싱 기반으로 라인 번호를 추정하므로 복잡한 문서에서 약간의 오차가 발생할 수 있음.

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

## Potential Next Steps

- **Outline ↔ 에디터 연동**: Outline 노드 클릭 시 해당 라인으로 에디터 커서 이동
- **TEI → HTML 미리보기 복원**: OutlinePanel 옆에 PreviewPanel 토글 옵션 추가
- salve 또는 @cwrc/salve-leafwriter 통합 (진정한 RelaxNG 검증)
- TEI 엘리먼트 커버리지 확대 (teiStaticSchema.ts)
- PWA 아이콘 생성
- GitHub Pages 배포 설정
- 대용량 문서(~1MB) 성능 최적화
- 접근성 개선 (ARIA, 키보드 네비게이션)

## Build Output

번들 크기 (~206KB gzipped):
```
dist/assets/index.css        ~2.7 KB gzip
dist/assets/index.js        ~16.3 KB gzip  (앱 코드)
dist/assets/react.js        ~43.2 KB gzip
dist/assets/codemirror.js  ~144.3 KB gzip
```
