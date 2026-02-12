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
  private updateScheduled = false;

  constructor(readonly view: EditorView) {
    this.createContainer();
    this.updateMarkers();
  }

  update(update: ViewUpdate) {
    const newErrors = update.state.facet(validationErrorsFacet);
    const errorsChanged = !this.errorsEqual(newErrors, this.lastErrors);

    if (errorsChanged || update.geometryChanged || update.heightChanged) {
      this.lastErrors = newErrors;
      this.scheduleUpdate();
    }
  }

  destroy() {
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

    scrollDOM.appendChild(container);
    this.container = container;
  }

  private scheduleUpdate() {
    if (this.updateScheduled) return;
    this.updateScheduled = true;

    requestAnimationFrame(() => {
      this.updateScheduled = false;
      this.updateMarkers();
    });
  }

  private updateMarkers() {
    const container = this.container;
    if (!container) return;

    const doc = this.view.state.doc;
    const totalLines = doc.lines;
    const clientHeight = this.view.scrollDOM.clientHeight;

    // Clear existing markers
    container.innerHTML = '';

    if (totalLines === 0 || clientHeight === 0) return;

    // Group errors by line (prioritize 'error' over 'warning')
    const lineErrors = new Map<number, ValidationError>();
    for (const err of this.lastErrors) {
      const existing = lineErrors.get(err.line);
      if (!existing || (err.severity === 'error' && existing.severity === 'warning')) {
        lineErrors.set(err.line, err);
      }
    }

    // Create markers
    const fragment = document.createDocumentFragment();

    for (const [line, error] of lineErrors) {
      const marker = document.createElement('div');

      // Position calculation: line proportion * visible height
      const proportion = Math.max(0, Math.min(1, (line - 1) / Math.max(1, totalLines - 1)));
      const top = proportion * (clientHeight - 4); // -4 for marker height

      marker.className = `cm-scrollbar-marker cm-scrollbar-marker-${error.severity}`;
      marker.style.top = `${top}px`;
      marker.title = `Line ${line}: ${error.message}`;
      marker.dataset.line = String(line);

      // Click handler for navigation
      marker.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetLine = Math.min(line, totalLines);
        const lineInfo = doc.line(targetLine);
        this.view.dispatch({
          selection: { anchor: lineInfo.from },
          scrollIntoView: true,
        });
        this.view.focus();
      });

      fragment.appendChild(marker);
    }

    container.appendChild(fragment);
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
