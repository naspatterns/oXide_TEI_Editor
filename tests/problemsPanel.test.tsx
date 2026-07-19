/**
 * ProblemsPanel UI tests (audit #U6).
 *
 * Corpus-validation panel: renders the empty/running/summary states and, on a
 * diagnostic click, opens the offending file (deduped) and navigates to the
 * line. The three data hooks + the file reader are mocked so the panel renders
 * without the Workspace/Editor providers.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { ProblemsPanel } from '../src/components/Problems/ProblemsPanel';

const ws = vi.hoisted(() => ({
  state: { rootHandle: null as unknown },
  batch: {
    results: null as null | Array<Record<string, unknown>>,
    running: false,
    done: 0,
    total: 0,
  },
  findFileNode: vi.fn(),
}));
const ed = vi.hoisted(() => ({ openFileAsTab: vi.fn(), goToLine: vi.fn() }));
const runBatch = vi.hoisted(() => vi.fn());
const readFileContent = vi.hoisted(() => vi.fn());

vi.mock('../src/store/useWorkspace', () => ({ useWorkspace: () => ws }));
vi.mock('../src/store/useEditor', () => ({ useEditor: () => ed }));
vi.mock('../src/hooks/useBatchValidation', () => ({ useBatchValidation: () => runBatch }));
vi.mock('../src/file/fileSystemAccess', () => ({ readFileContent }));

function resetState() {
  ws.state = { rootHandle: null };
  ws.batch = { results: null, running: false, done: 0, total: 0 };
  ws.findFileNode.mockReset();
  ed.openFileAsTab.mockReset();
  ed.goToLine.mockReset();
  runBatch.mockReset();
  readFileContent.mockReset();
}

beforeEach(resetState);
afterEach(cleanup);

describe('ProblemsPanel render states (#U6)', () => {
  it('prompts to open a folder and disables the run button with no workspace', () => {
    render(<ProblemsPanel />);
    expect(screen.getByText(/Open a project folder to validate/)).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: 'Validate workspace' });
    expect(btn).toBeDisabled();
  });

  it('enables the run button and prompts to run once a workspace is open', () => {
    ws.state = { rootHandle: {} };
    render(<ProblemsPanel />);
    expect(screen.getByText(/Run .Validate workspace./)).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: 'Validate workspace' });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(runBatch).toHaveBeenCalledTimes(1);
  });

  it('shows progress and disables the button while validating', () => {
    ws.state = { rootHandle: {} };
    ws.batch = { results: null, running: true, done: 2, total: 5 };
    render(<ProblemsPanel />);
    const btn = screen.getByRole('button', { name: /Validating… 2\/5/ });
    expect(btn).toBeDisabled();
  });

  it('reports a clean corpus with a summary line', () => {
    ws.state = { rootHandle: {} };
    ws.batch = {
      results: [
        { path: 'a.xml', fileName: 'a.xml', schemaId: 'tei_lite', errors: [], errorCount: 0, warningCount: 0 },
        { path: 'b.xml', fileName: 'b.xml', schemaId: 'tei_lite', errors: [], errorCount: 0, warningCount: 0 },
      ],
      running: false,
      done: 2,
      total: 2,
    };
    render(<ProblemsPanel />);
    expect(screen.getByText('✓ All files valid')).toBeInTheDocument();
    expect(screen.getByText(/2 files checked/)).toBeInTheDocument();
    expect(screen.getByText(/0 errors/)).toBeInTheDocument();
  });

  it('groups diagnostics per file and lists each error with its line', () => {
    ws.state = { rootHandle: {} };
    ws.batch = {
      results: [
        {
          path: 'nested/poem.xml',
          fileName: 'poem.xml',
          schemaId: 'tei_all',
          errorCount: 1,
          warningCount: 1,
          errors: [
            { line: 12, column: 3, message: 'Unknown element <foo>', severity: 'error' },
            { line: 20, column: 1, message: 'Missing required attribute', severity: 'warning' },
          ],
        },
      ],
      running: false,
      done: 1,
      total: 1,
    };
    render(<ProblemsPanel />);
    expect(screen.getByText('poem.xml')).toBeInTheDocument();
    expect(screen.getByText('tei_all')).toBeInTheDocument();
    expect(screen.getByText('Unknown element <foo>')).toBeInTheDocument();
    expect(screen.getByText(':12')).toBeInTheDocument();
    expect(screen.getByText(':20')).toBeInTheDocument();
  });
});

describe('ProblemsPanel diagnostic navigation (#U6)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('opens the file (deduped) and navigates to the error line on click', async () => {
    ws.state = { rootHandle: {} };
    const handle = { kind: 'file' };
    ws.findFileNode.mockReturnValue({ type: 'file', name: 'poem.xml', handle });
    readFileContent.mockResolvedValue('<TEI/>');
    ws.batch = {
      results: [
        {
          path: 'nested/poem.xml',
          fileName: 'poem.xml',
          schemaId: 'tei_all',
          errorCount: 1,
          warningCount: 0,
          errors: [{ line: 12, column: 3, message: 'Unknown element <foo>', severity: 'error' }],
        },
      ],
      running: false,
      done: 1,
      total: 1,
    };
    render(<ProblemsPanel />);

    // Click the diagnostic; the async readFileContent → openFileAsTab chain
    // must settle before the goToLine timers.
    await act(async () => {
      fireEvent.click(screen.getByText('Unknown element <foo>'));
    });

    expect(ws.findFileNode).toHaveBeenCalledWith('nested/poem.xml');
    expect(ed.openFileAsTab).toHaveBeenCalledWith('<TEI/>', 'poem.xml', handle, 'nested/poem.xml');

    // goToLine fires on 50ms + 400ms timers.
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(ed.goToLine).toHaveBeenCalledWith(12);
    expect(ed.goToLine).toHaveBeenCalledTimes(2);
  });
});
