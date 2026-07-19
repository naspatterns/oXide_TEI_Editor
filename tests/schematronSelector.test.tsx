/**
 * SchematronSelector UI tests (audit #U6).
 *
 * The "Rules…" toolbar control loads a project-level .sch ruleset and, once
 * loaded, flips to a "Rules: <name> ✕" button that clears it. useSchema is
 * mocked so the component renders without the Schema provider.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { SchematronSelector } from '../src/components/Toolbar/SchematronSelector';

const hooks = vi.hoisted(() => ({
  schematron: null as null | { name: string; testCount: number; title?: string },
  loadSchematron: vi.fn(),
  clearSchematron: vi.fn(),
}));

vi.mock('../src/store/useSchema', () => ({
  useSchema: () => ({
    schematron: hooks.schematron,
    loadSchematron: hooks.loadSchematron,
    clearSchematron: hooks.clearSchematron,
  }),
}));

afterEach(() => {
  cleanup();
  hooks.schematron = null;
  hooks.loadSchematron.mockClear();
  hooks.clearSchematron.mockClear();
});

describe('SchematronSelector (#U6)', () => {
  it('shows the "Rules..." button when no ruleset is loaded', () => {
    render(<SchematronSelector />);
    expect(screen.getByRole('button', { name: 'Rules...' })).toBeInTheDocument();
    // A hidden file input backs the button.
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.accept).toContain('.sch');
  });

  it('shows the active ruleset name + ✕ and clears it on click', () => {
    hooks.schematron = { name: 'house-rules', testCount: 12, title: 'House rules' };
    render(<SchematronSelector />);
    const btn = screen.getByRole('button', { name: /Rules: house-rules ✕/ });
    expect(btn).toHaveClass('toolbar-btn-active');
    fireEvent.click(btn);
    expect(hooks.clearSchematron).toHaveBeenCalledTimes(1);
  });

  it('loads a selected .sch file and derives the ruleset name from the filename', async () => {
    render(<SchematronSelector />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['<schema/>'], 'my-rules.sch', { type: 'application/xml' });
    // jsdom Blob.text() may be absent — provide a deterministic reader.
    Object.defineProperty(file, 'text', { value: () => Promise.resolve('<schema/>') });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(hooks.loadSchematron).toHaveBeenCalledWith('<schema/>', 'my-rules'),
    );
    // Input is reset so the same file can be re-picked after editing.
    expect(input.value).toBe('');
  });

  it('does nothing when the file picker is dismissed with no file', () => {
    render(<SchematronSelector />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });
    expect(hooks.loadSchematron).not.toHaveBeenCalled();
  });
});
