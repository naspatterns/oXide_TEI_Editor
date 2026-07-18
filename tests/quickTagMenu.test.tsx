/**
 * QuickTagMenu keyboard-routing tests (P1 + P2, 2026-07).
 *
 * Model: when the menu opens, the filter INPUT is auto-focused, so the
 * editor never holds focus while the menu is up. That is what prevents any
 * keystroke — regular OR IME composition (keyCode 229, which document-level
 * keydown interception cannot reliably catch) — from reaching the document
 * and replacing the selected wrap target. The menu owns Ctrl/Cmd+C so copy
 * still yields the editor selection rather than the (empty) filter.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { QuickTagMenu } from '../src/components/Editor/QuickTagMenu';

// The component resolves the ACTIVE document's schema (M3) — mock the join
// hook, since these tests render without Editor/Schema providers.
vi.mock('../src/hooks/useActiveSchema', () => ({
  useActiveSchema: () => ({
    id: 'test',
    name: 'Test',
    elements: [
      { name: 'hi', documentation: 'Highlighted text', children: [], attributes: [] },
      { name: 'name', documentation: 'Name', children: [], attributes: [] },
      { name: 'persName', documentation: 'Personal name', children: [], attributes: [] },
    ],
    elementMap: new Map(),
    hasSalveGrammar: false,
  }),
}));

// jsdom does not implement scrollIntoView (used by the keep-selected-visible effect)
Element.prototype.scrollIntoView = vi.fn();

let writeText: ReturnType<typeof vi.fn>;
beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
});
afterEach(cleanup);

function renderMenu(overrides: Partial<Parameters<typeof QuickTagMenu>[0]> = {}) {
  const onSelectTag = vi.fn();
  const onClose = vi.fn();
  const onEscape = vi.fn();
  render(
    <QuickTagMenu
      position={{ x: 100, y: 100 }}
      selectedText="Rose"
      onSelectTag={onSelectTag}
      onClose={onClose}
      onEscape={onEscape}
      {...overrides}
    />,
  );
  const input = screen.getByPlaceholderText(/Filter tags/) as HTMLInputElement;
  return { onSelectTag, onClose, onEscape, input };
}

describe('QuickTagMenu focus + keyboard model', () => {
  it('auto-focuses the filter input on open (IME-safety linchpin)', () => {
    const { input } = renderMenu();
    expect(document.activeElement).toBe(input);
  });

  it('typing into the focused input filters the list without touching the editor', () => {
    const { input } = renderMenu();
    fireEvent.change(input, { target: { value: 'pers' } });
    expect(input.value).toBe('pers');
    // Only persName matches "pers"
    const items = Array.from(document.querySelectorAll('.quick-tag-item .quick-tag-name')).map(e => e.textContent);
    expect(items).toEqual(['<persName>']);
  });

  it('ArrowDown on the input navigates the list', () => {
    const { input } = renderMenu();
    const first = document.querySelector('.quick-tag-item.selected');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const second = document.querySelector('.quick-tag-item.selected');
    expect(second).not.toBe(first);
  });

  it('Enter on the input applies the selected tag', () => {
    const { onSelectTag, onClose, input } = renderMenu();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelectTag).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Enter wraps EXACTLY ONCE even when applying moves focus off the input', () => {
    // Regression: the real wrapSelection calls view.focus(), moving focus to
    // the editor mid-event. If the document-level handler also processed
    // Enter behind an activeElement guard, the guard would race (focus已moved)
    // and wrap a second time. onSelectTag here blurs the input to reproduce.
    let inputEl: HTMLInputElement | null = null;
    const onSelectTag = vi.fn(() => inputEl?.blur());
    render(
      <QuickTagMenu
        position={{ x: 100, y: 100 }}
        selectedText="Rose"
        onSelectTag={onSelectTag}
        onClose={vi.fn()}
        onEscape={vi.fn()}
      />,
    );
    inputEl = screen.getByPlaceholderText(/Filter tags/) as HTMLInputElement;
    fireEvent.keyDown(inputEl, { key: 'Enter' });
    expect(onSelectTag).toHaveBeenCalledTimes(1);
  });

  it('Escape closes via onEscape exactly once (document handler owns it, no double-fire)', () => {
    const { onEscape, onClose, input } = renderMenu();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Ctrl/Cmd+C on the input copies the EDITOR selection, not the filter', () => {
    const { input } = renderMenu();
    const notPrevented = fireEvent.keyDown(input, { key: 'c', ctrlKey: true });
    expect(notPrevented).toBe(false); // default prevented
    expect(writeText).toHaveBeenCalledWith('Rose');
  });

  it('ignores keydowns that are part of an IME composition', () => {
    const { onSelectTag, input } = renderMenu();
    // A composing Enter (isComposing) must NOT commit a tag — it confirms the
    // IME candidate instead.
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(onSelectTag).not.toHaveBeenCalled();

    // keyCode 229 (composition-in-progress) is likewise ignored
    fireEvent.keyDown(input, { key: 'ArrowDown', keyCode: 229 });
    // selection index unchanged (first item still selected)
    const items = Array.from(document.querySelectorAll('.quick-tag-item'));
    expect(items[0].classList.contains('selected')).toBe(true);
  });

  it('document-level Escape still closes when the input is not focused', () => {
    const { onEscape, input } = renderMenu();
    input.blur();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });
});
