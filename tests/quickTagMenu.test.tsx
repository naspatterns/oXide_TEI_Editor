/**
 * QuickTagMenu keyboard-routing tests (P1, 2026-07).
 *
 * Pins the focus-trap fix: with the menu open and the editor still focused,
 * typing must go into the FILTER (with the default prevented so the editor
 * never sees the character — previously the first keystroke replaced the
 * selected text in the document), and ↑↓/Enter must drive menu navigation
 * instead of moving the editor cursor.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { QuickTagMenu } from '../src/components/Editor/QuickTagMenu';

vi.mock('../src/store/useSchema', () => ({
  useSchema: () => ({
    schema: {
      id: 'test',
      name: 'Test',
      elements: [
        { name: 'hi', documentation: 'Highlighted text', children: [], attributes: [] },
        { name: 'name', documentation: 'Name', children: [], attributes: [] },
        { name: 'persName', documentation: 'Personal name', children: [], attributes: [] },
      ],
      elementMap: new Map(),
      hasSalveGrammar: false,
    },
  }),
}));

// jsdom does not implement scrollIntoView (used by the menu's
// keep-selected-item-visible effect)
Element.prototype.scrollIntoView = vi.fn();

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
  return { onSelectTag, onClose, onEscape };
}

describe('QuickTagMenu document-level keyboard routing', () => {
  it('routes printable characters into the filter and prevents the default', () => {
    renderMenu();
    const input = screen.getByPlaceholderText(/Filter tags/) as HTMLInputElement;
    expect(document.activeElement).not.toBe(input);

    // fireEvent returns false when preventDefault was called
    const notPrevented = fireEvent.keyDown(document, { key: 'n' });

    expect(notPrevented).toBe(false); // default prevented — editor never sees it
    expect(input.value).toBe('n');
    expect(document.activeElement).toBe(input);
  });

  it('ArrowDown/ArrowUp navigate the list without reaching the editor', () => {
    renderMenu();

    const first = document.querySelector('.quick-tag-item.selected');
    expect(first).not.toBeNull();

    const notPrevented = fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(notPrevented).toBe(false);

    const second = document.querySelector('.quick-tag-item.selected');
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
  });

  it('Enter applies the selected tag', () => {
    const { onSelectTag, onClose } = renderMenu();

    fireEvent.keyDown(document, { key: 'Enter' });

    expect(onSelectTag).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape closes via onEscape (selection preservation is the caller contract)', () => {
    const { onEscape, onClose } = renderMenu();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not intercept Ctrl+C / Cmd+C (copy must keep working)', () => {
    renderMenu();
    const input = screen.getByPlaceholderText(/Filter tags/) as HTMLInputElement;

    const notPrevented = fireEvent.keyDown(document, { key: 'c', ctrlKey: true });

    expect(notPrevented).toBe(true); // default NOT prevented
    expect(input.value).toBe('');
    expect(document.activeElement).not.toBe(input);
  });

  it('does not double-handle keys when the input already has focus', () => {
    renderMenu();
    const input = screen.getByPlaceholderText(/Filter tags/) as HTMLInputElement;
    input.focus();

    fireEvent.keyDown(input, { key: 'ArrowDown' });

    // One step down exactly (input handler), not two (input + document)
    const items = Array.from(document.querySelectorAll('.quick-tag-item'));
    const selectedIndex = items.findIndex(el => el.classList.contains('selected'));
    expect(selectedIndex).toBe(1);
  });
});
