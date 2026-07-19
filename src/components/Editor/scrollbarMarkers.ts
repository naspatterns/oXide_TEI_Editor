/**
 * Scrollbar Error Markers Extension for CodeMirror 6
 *
 * Displays error/warning positions visually alongside the scrollbar,
 * allowing users to see the distribution of issues across the document
 * and click to navigate directly to each error.
 */

import { ViewPlugin, ViewUpdate, EditorView } from '@codemirror/view';
import { Extension, Facet, Compartment } from '@codemirror/state';
import type { ValidationError } from '../../types/schema';

/**
 * Compartment for dynamic error facet updates.
 * Allows updating error data without recreating the entire extensions array.
 */
export const validationErrorsCompartment = new Compartment();

/**
 * Facet for providing validation errors to the scrollbar marker plugin.
 * Errors are typically provided from the linter or editor state.
 */
export const validationErrorsFacet = Facet.define<ValidationError[], ValidationError[]>({
  combine: (values) => values.flat(),
});

/**
 * ViewPlugin that renders error markers alongside the scrollbar.
 */
class ScrollbarMarkerPlugin {
  private container: HTMLDivElement | null = null;
  private lastErrors: ValidationError[] = [];
  private markers: HTMLDivElement[] = [];
  private updateScheduled = false;
  private needsRebuild = false;
  // Last geometry the markers were positioned for, so a keystroke that changes
  // neither the line count nor the viewport height is a true no-op.
  private lastTotalLines = -1;
  private lastClientHeight = -1;

  constructor(readonly view: EditorView) {
    this.createContainer();
    this.needsRebuild = true;
    this.render();
  }

  update(update: ViewUpdate) {
    const newErrors = update.state.facet(validationErrorsFacet);
    if (!this.errorsEqual(newErrors, this.lastErrors)) {
      // The set of markers (which lines, which severity) changed — rebuild.
      this.lastErrors = newErrors;
      this.needsRebuild = true;
      this.scheduleUpdate();
    } else if (update.geometryChanged || update.heightChanged) {
      // geometryChanged is true for EVERY docChanged, so this fires on every
      // keystroke. Marker POSITIONS depend only on line count + viewport
      // height, so reposition existing nodes — never tear down and recreate
      // the DOM (audit #32). positionMarkers() itself no-ops when neither
      // changed (typing within a line).
      this.scheduleUpdate();
    }
  }

  destroy() {
    this.container?.removeEventListener('click', this.onContainerClick);
    this.container?.remove();
    this.container = null;
  }

  private createContainer() {
    const container = document.createElement('div');
    container.className = 'cm-scrollbar-markers';
    container.setAttribute('aria-hidden', 'true');

    // Ensure scrollDOM has position: relative for absolute positioning
    const scrollDOM = this.view.scrollDOM;
    const computedStyle = getComputedStyle(scrollDOM);
    if (computedStyle.position === 'static') {
      scrollDOM.style.position = 'relative';
    }

    // One delegated click listener instead of one per marker; it reads the
    // CURRENT doc at click time, so repositioned (not recreated) markers still
    // navigate correctly.
    container.addEventListener('click', this.onContainerClick);
    scrollDOM.appendChild(container);
    this.container = container;
  }

  private onContainerClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    const lineAttr = target?.dataset?.line;
    if (!lineAttr) return;
    e.stopPropagation();
    const doc = this.view.state.doc;
    const targetLine = Math.max(1, Math.min(Number(lineAttr), doc.lines));
    const lineInfo = doc.line(targetLine);
    this.view.dispatch({
      selection: { anchor: lineInfo.from },
      scrollIntoView: true,
    });
    this.view.focus();
  };

  private scheduleUpdate() {
    if (this.updateScheduled) return;
    this.updateScheduled = true;

    requestAnimationFrame(() => {
      this.updateScheduled = false;
      this.render();
    });
  }

  private render() {
    const rebuilt = this.needsRebuild;
    if (this.needsRebuild) {
      this.rebuildMarkers();
      this.needsRebuild = false;
    }
    this.positionMarkers(rebuilt);
  }

  /** Recreate the marker DOM — only when the error set changed. */
  private rebuildMarkers() {
    const container = this.container;
    if (!container) return;

    container.innerHTML = '';
    this.markers = [];

    // Group errors by line (prioritize 'error' over 'warning')
    const lineErrors = new Map<number, ValidationError>();
    for (const err of this.lastErrors) {
      const existing = lineErrors.get(err.line);
      if (!existing || (err.severity === 'error' && existing.severity === 'warning')) {
        lineErrors.set(err.line, err);
      }
    }

    const fragment = document.createDocumentFragment();
    for (const [line, error] of lineErrors) {
      const marker = document.createElement('div');
      marker.className = `cm-scrollbar-marker cm-scrollbar-marker-${error.severity}`;
      marker.title = `Line ${line}: ${error.message}`;
      marker.dataset.line = String(line);
      this.markers.push(marker);
      fragment.appendChild(marker);
    }
    container.appendChild(fragment);
    // Force a reposition of the freshly-created nodes.
    this.lastTotalLines = -1;
    this.lastClientHeight = -1;
  }

  /** Set each marker's vertical position. Cheap: O(markers) style writes, no
   * DOM churn. No-ops when the line count and viewport height are unchanged. */
  private positionMarkers(force: boolean) {
    const totalLines = this.view.state.doc.lines;
    const clientHeight = this.view.scrollDOM.clientHeight;
    if (!force && totalLines === this.lastTotalLines && clientHeight === this.lastClientHeight) {
      return;
    }
    this.lastTotalLines = totalLines;
    this.lastClientHeight = clientHeight;
    if (totalLines === 0 || clientHeight === 0) return;

    for (const marker of this.markers) {
      const line = Number(marker.dataset.line);
      const proportion = Math.max(0, Math.min(1, (line - 1) / Math.max(1, totalLines - 1)));
      marker.style.top = `${proportion * (clientHeight - 4)}px`; // -4 for marker height
    }
  }

  private errorsEqual(a: ValidationError[], b: ValidationError[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i].line !== b[i].line ||
          a[i].severity !== b[i].severity ||
          a[i].message !== b[i].message) {
        return false;
      }
    }
    return true;
  }
}

const scrollbarMarkerPlugin = ViewPlugin.fromClass(ScrollbarMarkerPlugin);

/**
 * Create the scrollbar markers extension.
 * Includes the Compartment for dynamic error updates.
 * Initial state: empty error array.
 */
export function createScrollbarMarkersExtension(): Extension {
  return [
    scrollbarMarkerPlugin,
    // Compartment으로 감싸서 나중에 reconfigure 가능하게 함
    validationErrorsCompartment.of(validationErrorsFacet.of([])),
  ];
}
