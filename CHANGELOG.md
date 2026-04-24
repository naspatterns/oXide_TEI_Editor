# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.2] - 2026-04-25

Bug-fix release. Fixes the two latent `createTagSyncExtension` defects
that were discovered (and pinned with characterization tests) during the
v0.2.1 coverage sprint. **User-visible improvement**: opening and closing
XML tag names now stay in sync as you type or paste a rename, both
character-by-character and via whole-name replacement.

### Fixed

- **tagSync rename listener never actually synced sibling tags**
  (`src/components/Editor/tagSync.ts`). The listener queried
  `findMatchingTag` against the *new* (mid-rename) tag name, which by
  construction had no match in the document, so the sync silently
  no-oped on every interactive edit. Real-time UX appeared to work only
  because CodeMirror's `autoCloseTags` extension creates the matching
  closing tag at `>` time.

  The listener now resolves the matching tag in `update.startState.doc`
  (where both sides still share the OLD name) and translates its
  position into the post-change document via `update.changes.mapPos`.
  Single-character typing, backspacing, and whole-name paste-rename all
  propagate correctly to the sibling tag.

- **Progressive-deletion listener interfered with renames**. When a
  multi-character `replace` (a paste, programmatic dispatch, or
  select-and-type) changed a tag's name, the progressive-deletion
  listener interpreted the name change as "the original tag was
  destroyed" and dispatched a sibling deletion that conflicted with
  the rename listener's sibling rename. The result was that the matching
  tag got wiped instead of renamed (the v0.2.1 characterization tests
  pinned the resulting `<bar>x` / `x</bar>` outputs).

  The listener's destruction predicate no longer fires when the tag at
  the same position is the same kind (opening / closing / self-closing)
  but has a different name — that is a rename and is handled by the
  rename listener.

### Test changes

- `tests/tagSyncExtension.test.ts` — the two characterization tests that
  pinned the buggy outputs are now behavioral assertions of the correct
  outputs. Added five new tests for previously-broken scenarios:
  single-character grow / shrink in opening and closing tags, and a
  nested same-name rename (`<div><div>x</div></div>` → rename outer to
  `box` keeps the inner pair untouched).

### Project metrics

| Metric | 0.2.1 | 0.2.2 |
|---|---|---|
| Tests | 286 → 300 (coverage sprint) | **305** |
| Line coverage | ~89% | ~89% |
| `tagSync.ts` line coverage | 88% | 88% |
| Known tagSync bugs | 2 (documented) | **0** |

### Rebuild instructions (after `git clone` of v0.2.2)

No new dev dependencies versus v0.2.1.

```bash
npm install
npm run build
npm run test:run       # 305 passing
npm run lint           # 0 errors / 0 warnings
npm run dev            # http://localhost:5173
```

## [0.2.1] - 2026-04-24

Second-wave architectural refactor following the v0.2.0 sprints. All seven
remaining items from the architectural review have landed. No user-facing
feature changes; the user-visible improvements are (1) a toast warning when
autosave is unavailable (Private Mode etc.), (2) the TEI P5 chunk no longer
downloads on initial page load for Lite users, and (3) cursor moves no
longer trigger full editor-tree re-renders.

### Added

#### Architecture / hooks

- `src/hooks/useWrapSelection.ts` — extracted "wrap selection in
  `<tagName>...</tagName>`" out of `EditorContext`. The hook joins
  `useEditor` + `useSchema` so neither provider has to import the other.
- `src/hooks/useEditorActions.ts` — `EditorActions` interface bundling the
  imperative editor mutations that need a live `EditorView`:
  `wrapSelection`, `insertAtCursor`, `replaceSelection`, `goToLine`.
  Replaces ~30 lines of inline `view.dispatch({...})` calls in `AIPanel`.
- `src/store/CursorContext.tsx` + `src/store/useCursor.ts` — separate
  Provider that owns the *live* cursor position. Only `StatusBar` and
  `BreadcrumbBar` subscribe, so cursor moves no longer re-render every
  editor consumer.

#### File I/O reliability

- `autoSave.ts` `startAutoSave` / `saveToIDB` / `loadFromIDB` now accept an
  optional `onError` handler. The App layer registers a handler that toasts
  the user *once per session* if IndexedDB is unavailable (typical in
  Private/Incognito mode), so users no longer wonder why their autosave
  silently disappears.

#### PWA cache invalidation

- New `injectPwaCacheVersion` Vite plugin in `vite.config.ts` rewrites the
  `__BUILD_HASH__` placeholder in `dist/sw.js` to
  `<package version>-<base36 timestamp>` at build time. Old caches are
  evicted on the next service-worker `activate`, so users always pick up
  fresh code on the visit after a deploy. The plugin runs only during
  `vite build`; in dev the literal placeholder is served, which is fine
  because `public/` files aren't transformed in dev.

### Changed

#### Performance

- **TEI P5 schema is now truly lazy-loaded** (deferred from v0.2.0, where
  only the chunk split landed). `getTeiAllElements()` is `async` and
  triggers a one-time dynamic `import('./teiP5Generated')`. The 528 KB
  chunk is no longer in the entry-HTML `modulepreload` list, so Lite-only
  users never download it. SchemaEngine.loadBuiltin already returned a
  Promise, so no consumer-side breakage.
- **Trade-off**: TEI Lite no longer enriches its element specs with
  P5 class-resolved attributes (e.g., `att.canonical`'s `@key`,
  `att.global.linking`'s `@corresp`). Lite still carries every attribute
  in `globalAttrs` plus the element-specific attrs declared in
  `teiStaticSchema.ts`. Users who need full P5 attribute completion
  should switch to **TEI All**.
- **Cursor state separated from content state** (P2-10). On every cursor
  change `XmlEditor` writes only to `CursorContext` (cheap, only
  re-renders `StatusBar` and `BreadcrumbBar`); the active document's
  persisted cursor (used by tab-switch restoration) is written on a
  500 ms debounce. Arrow-key / mouse-click cursor moves now skip the
  reducer entirely.
- `AIContext` message list **windowed render** (P2-11). Only the most
  recent 50 messages are placed in the DOM by default; older messages are
  revealed via a "Load older" button. `content-visibility: auto` on
  `.chat-message` lets the browser skip layout/paint of off-screen
  messages. No virtualization library added — the AI feature is mock-
  default-gated, and this is enough for realistic chat sizes.

#### Decoupling

- `EditorProvider` no longer calls `useSchema()`. Its `wrapSelection`
  callback was the only schema consumer; the logic now lives in
  `useWrapSelection`. The two providers are independently testable.
- `EditorContext.wrapSelection` removed from the value object; callers
  (`Toolbar`, `XmlEditor`, `AIPanel`) get the function from
  `useWrapSelection()` (or via `useEditorActions().wrapSelection`).

### Test changes

- `tests/xmlValidator.test.ts` was retargeted to the async P5 loader:
  every `getTeiAllElements()` call inside `describe()` blocks moved into
  `beforeAll(async () => { ... })`; in-`it` calls became `await`
  expressions.
- The "TEI Lite P5 Attribute Class Integration" describe was rewritten as
  "TEI Lite Static Attribute Coverage" — it now pins the static
  attribute set and explicitly asserts the *absence* of P5-class
  attributes (so a future regression that re-introduces P5 enrichment
  via a different path would be caught).
- The "@key on `<term>`" test in TEI Lite was deleted (duplicated by an
  equivalent assertion in the TEI All schema suite at line 1204).

### Project metrics (cumulative since 0.1.0)

| Metric | 0.1.0 | 0.2.0 | 0.2.1 |
|---|---|---|---|
| Initial JS load (Lite users) | ~700 KB | ~700 KB (P5 preloaded as sibling chunk) | **~170 KB main + ~143 KB react + ~435 KB codemirror** (P5 not preloaded) |
| Cursor-move re-renders | full editor tree | full editor tree | **StatusBar + BreadcrumbBar only** |
| Autosave-failure UX | silent | silent | one-shot toast |
| PWA cache invalidation | manual `CACHE_VERSION` bump | manual | **auto-stamped per build** |
| Tests | 236 | 286 | 286 (test count steady; coverage broader) |
| Lint errors / warnings | n/a (no lint) | 0 / 0 | 0 / 0 |

### Rebuild instructions (after `git clone` of v0.2.1)

```bash
npm install            # @testing-library/* and dev tools may have grown vs 0.2.0
npm run build          # tsc -b && vite build — clean
npm run test:run       # 286 passing (TEI All schema tests now async)
npm run lint           # 0 errors / 0 warnings
npm run dev            # http://localhost:5173
```

### Notes for contributors (additions)

- New cursor data flow:
  - **Live display** (StatusBar, BreadcrumbBar, AIPanel prompt context) →
    `useCursor()`.
  - **Persisted per-tab cursor** (so tab switches restore the position) →
    still in `OpenDocument.cursorLine` / `cursorColumn`, written on a
    500 ms debounce by `XmlEditor`.
  - Reducer's `setCursor` and `updateContentAndCursor` actions are still
    available; do not call them from a hot path. The XmlEditor stops
    using `updateContentAndCursor` entirely (uses `setContent` plus
    debounced `setCursor`).
- New imperative editor operations should go on
  `useEditorActions().{wrapSelection,insertAtCursor,replaceSelection,goToLine}`
  rather than reaching into `editorViewRef.current.dispatch(...)` from
  consumer components.
- TEI Lite users **do not** get P5 class-resolved attribute completion
  any more. If you add a new TEI Lite element that needs an attribute
  beyond `globalAttrs`, declare it explicitly in `TEI_LITE_ELEMENTS`
  (`teiStaticSchema.ts`).
- The PWA cache version is generated at build time. Do not hand-edit
  `__BUILD_HASH__` in `public/sw.js` — leave the placeholder.

## [0.2.0] - 2026-04-24

A foundational refactor focused on code quality, performance, and testability.
No user-facing feature changes — the editor behaves identically — but the
internal architecture is substantially improved and a real test/lint
infrastructure is now in place.

### Added

#### Tooling

- **ESLint 10** with `typescript-eslint`, `eslint-plugin-react-hooks` (v7,
  including the new `set-state-in-effect`, `refs`, `purity`, and
  `immutability` rules), and `eslint-plugin-react-refresh`. Configured via
  the new flat-config file `eslint.config.js`.
- **Prettier 3** with `.prettierrc.json` and `.prettierignore` for
  consistent formatting.
- **Vitest v8 coverage** reporter (`@vitest/coverage-v8`) wired into
  `vitest.config.ts`. Generates `text`, `html`, and `lcov` reports under
  `./coverage/`.
- **React Testing Library** (`@testing-library/react`,
  `@testing-library/jest-dom`, `@testing-library/user-event`) plus
  `tests/setup.ts` registering jest-dom matchers globally.
- New npm scripts: `lint`, `lint:fix`, `format`, `format:check`,
  `test:coverage`.

#### Architecture

- `src/schema/xmlTokenizer.ts` — a single, well-tested tag-level XML
  tokenizer used by the outline panel and the autocompletion engine.
  Exports:
  - `tokenizeXmlTags(xml)` — generator yielding `XmlTagToken`s with
    `kind`, `name`, `attributesText`, `offset`, `length`, `line`, `column`.
  - `getOpenElementStack(xml, offset?)` — open-element stack at a position,
    tolerant of mismatched closes.
  - `parseAttributes(text)` — `attr="v"` / `attr='v'` parser.
- `src/schema/schemaQuery.ts` — schema query helpers
  (`getElement`, `hasElement`, `getAttributes`, `getRequiredAttributes`,
  `getAttribute`, `getChildNames`). Replaces direct `schema.elementMap.get`
  reaches from outside the schema package.

#### Hook files (Provider/Hook split for Fast Refresh)

Each Context now lives in two files: a `XxxContext.tsx` that exports only
the Provider component, and a `useXxx.ts` that exports the Context object,
the value-type interface, and the hook. This satisfies React Refresh and
keeps non-component exports out of `.tsx` files.

- `src/store/useEditor.ts` (with `EditorContext`, `EditorContextValue`,
  `LegacyEditorState`)
- `src/store/useSchema.ts`
- `src/store/useWorkspace.ts`
- `src/ai/useAI.ts`
- `src/components/Toast/useToast.ts`
- `src/components/ContextMenu/useContextMenu.ts`

#### Tests

- `tests/xmlTokenizer.test.ts` — 19 cases covering CDATA, namespaces,
  multi-line tags, `>` inside attribute quotes, malformed-tag recovery,
  open-stack tolerance, etc.
- `tests/schemaQuery.test.ts` — 7 cases for the new query API.
- `tests/integration/editorContext.test.tsx` — 8 multi-tab provider tests
  (open/close/switch tabs, content preservation, dirty/saved, value
  memoization assertion).
- `tests/integration/schemaLoading.test.ts` — 8 tests against the *real*
  generated TEI Lite and TEI All schemas (catches generator/runtime drift).
- `tests/integration/realSchemaPipeline.test.ts` — 8 end-to-end validator
  + completion tests using the loaded TEI Lite schema.
- `tests/setup.ts` — jest-dom matcher registration.

Test count: **236 → 286** (+50).

### Changed

#### Performance

- **Vite chunk splitting**. `vite.config.ts` switched to a function-form
  `manualChunks` that puts `teiP5Generated.ts` (~528 KB) and
  `teiAutoGenerated.ts` into their own chunks. Main app bundle dropped
  from ~700 KB to **~170 KB**, with the heavy schema data fetched in
  parallel and independently cacheable across releases.
- **All four store contexts now memoize their value objects** via
  `useMemo`, with stable `useCallback`-wrapped dispatchers. Without this,
  every Provider rerender forced every consumer to rerender even when no
  state had changed:
  - `EditorContext` (28-field value)
  - `SchemaContext` (5)
  - `WorkspaceContext` (7)
  - `AIContext` (7)
  - `Toast` provider value (7) was also memoized for consistency.

#### React idioms

- Six `useEffect`-based "reset state when prop X changes" patterns were
  rewritten to the React docs' "Adjusting state when a prop changes" form
  (`if (prev !== curr) { setPrev(curr); ... }` at render time). These
  removed an extra render per reset and cleared the
  `react-hooks/set-state-in-effect` lint violations:
  - `CommandPalette` × 2 (query change, open transition)
  - `QuickTagMenu` × 2 (filter change, position close)
  - `XPathSearch` × 1 (expression/match-count change)
  - `SchemaContext` is the one remaining intentional case (a one-time
    async data fetch on mount); kept with a documented
    `eslint-disable-next-line` comment.
- `XmlEditor` content-ref effect dependency normalized to `[activeDoc]`.

#### Migration to shared modules

- `OutlinePanel.parseXmlWithRegex` now uses `tokenizeXmlTags` /
  `parseAttributes` from `xmlTokenizer.ts`. ~40 lines of duplicated
  regex-based parsing removed.
- `completionSource.getElementStack` and `getExistingChildren` now use
  `getOpenElementStack` / `tokenizeXmlTags`. The local `TAG_PARSE_REGEX`
  constant was removed.
- `completionSource.completeAttributeName`,
  `completeAttributeValue`, and the parent-spec lookup all go through
  `schemaQuery.ts` instead of touching `schema.elementMap` directly.
- `EditorContext.wrapSelection` uses `getRequiredAttributes` instead of
  filtering `attributes?.filter(a => a.required)` inline.

### Fixed

- **`AIContext.applyActionHandler` was a plain `let` inside the Provider
  body**, so it reset to `null` on every render. The setter looked
  correct but its writes were wiped by the next rerender. Replaced with
  `useRef` so the handler survives re-renders without triggering a
  re-render cascade across all AI consumers.
- **`AIPanel.hasSelection` was stored in a `useRef`** but read during
  render to drive the `AIActions` `hasSelection` prop. Refs do not
  trigger re-renders, so the UI never updated when selection appeared
  or disappeared. Converted to `useState` with a guarded setter
  (`setHasSelection(prev => prev === next ? prev : next)`) to avoid any
  re-render churn when the value is unchanged.
- **`AlertDialog` regex `/^[⚠️💡📁]/` was buggy** — the U+FE0F variation
  selector inside the warning emoji and the surrogate pairs in 💡/📁
  cause a character class to match unintended codepoints. Rewritten as
  `/^(⚠️|💡|📁)/u` (alternation + `u` flag).
- **`Toast.useRef(Date.now())` is impure during render**. Initialized to
  `0` instead; `startTimer()` overwrites with `Date.now()` before any
  reader needs it.
- **`Tooltip` ref-forwarding** — the `cloneElement(children, childProps)`
  ref-forwarding pattern triggers strict React 19 ref/immutability rules
  but is a legitimate use. Refactored the ref cast to a structural type
  (`{ current: HTMLElement | null }`) to avoid the deprecated
  `MutableRefObject` API and added documented `eslint-disable` comments
  explaining the design tradeoff (alternative: wrap children in a `<span>`,
  which would break CSS in many call sites).
- **Several `no-useless-assignment` and regex-noise issues**:
  `responseParser.ts`, `ChatMessage.tsx` (key++ in terminal positions),
  `tagSync.ts`, `XPathSearch.tsx` (unnecessary `\[` escapes inside
  character classes).
- **Unused imports/vars** in `tests/*.test.ts`,
  `scripts/generateTeiSchema.ts`, and an unused `eslint-disable`
  directive in `App.tsx`.

### Removed

- `src/utils/xmlUtils.ts` — both exports were dead code:
  - `checkWellFormed` had zero callers (the architectural review flagged
    it).
  - `getElementStack` was shadowed by an identically-named local
    function inside `completionSource.ts` that was the actual code path
    in use; no consumer ever imported the `xmlUtils` version.
- ~120 lines of duplicated regex-based tag parsing across
  `completionSource.ts` and `OutlinePanel.tsx` — replaced by
  `xmlTokenizer.ts` consumers.

### Project metrics

| Metric | Before (0.1.0) | After (0.2.0) |
|---|---|---|
| Initial JS bundle | ~700 KB | ~170 KB (TEI P5 split into a 528 KB sibling chunk) |
| ESLint setup | None | Flat config, 0 errors / 0 warnings |
| Prettier setup | None | Configured |
| Tests | 236 | 286 |
| Coverage reporter | None | v8 (`npm run test:coverage`) |
| Line coverage | (unmeasured) | ~81% |
| `react-hooks` set-state-in-effect violations | 6 | 0 |
| Direct `schema.elementMap.get` outside `src/schema/` | 4 sites | 0 |
| Distinct XML tag-parsers in the codebase | 3 | 1 (+ specialized validator) |
| Context value objects recreated every render | 4 | 0 (all `useMemo`-wrapped) |

### Rebuild instructions (after `git clone` of v0.2.0)

```bash
npm install            # installs ESLint, Prettier, Testing Library, coverage-v8 (additions vs 0.1.0)
npm run build          # tsc -b && vite build — should complete clean
npm run test:run       # 286 tests, all green
npm run lint           # 0 errors / 0 warnings expected
npm run dev            # http://localhost:5173
```

Optional:

```bash
npm run test:coverage  # generates ./coverage/ HTML report
npm run format:check   # verify Prettier formatting
npm run lint:fix       # auto-fix the auto-fixable subset
```

The deploy workflow (`.github/workflows/deploy.yml`) only runs
`npm ci && npm run build` and is unchanged — lint and tests are not
gated in CI yet.

### Notes for contributors

- The Provider/Hook file split is load-bearing for React Fast Refresh:
  `XxxContext.tsx` files must export *only* their Provider component.
  Put the `useXxx` hook, the `XxxContext` object, and any types in the
  paired `useXxx.ts` file.
- New code touching XML structure should prefer `xmlTokenizer.ts` over
  rolling fresh regexes. The exception is `xmlValidator.ts`, which
  intentionally keeps its own well-formedness path for accurate column
  recovery in the presence of multi-byte characters.
- New code outside `src/schema/` should access schemas through
  `schemaQuery.ts` rather than reading `schema.elementMap` directly.
- The lint setup uses the new `react-hooks` v7 rules (`set-state-in-effect`,
  `purity`, `refs`, `immutability`). When one of these fires, prefer a
  proper refactor; reach for `eslint-disable-next-line` only with a
  comment explaining why the pattern is legitimate (e.g. the SchemaContext
  initial-load case).

## [0.1.0] - 2026-04-23

Initial public release.

- Browser-based TEI XML editor (React 18 + CodeMirror 6 + Vite 6).
- Built-in TEI Lite (106 elements) and TEI All / P5 (588 elements) schemas.
- Custom RelaxNG (.rng) schema upload (TEI-conformant only).
- Multi-tab editing, outline tree, TEI→HTML preview, dark/light themes.
- PWA support with IndexedDB-backed autosave.
- Desktop-style File / Edit / View / Help menu bar.
- oXygen-style branding (logo, favicon, web fonts).
- Multi-line tag recognition fix in `xmlValidator` with comprehensive
  test coverage.
- GitHub Pages deployment workflow.
