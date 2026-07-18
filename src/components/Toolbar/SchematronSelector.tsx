import { useCallback, useRef } from 'react';
import { useSchema } from '../../store/useSchema';
import { Tooltip } from '../Tooltip/Tooltip';

/**
 * Schematron project-rules control (P2).
 *
 * Loads a .sch ruleset that validates ON TOP of every document's schema —
 * the "house rules" layer real TEI projects use for team consistency.
 * App-level by design: one project, one ruleset, all open documents.
 */
export function SchematronSelector() {
  const { schematron, loadSchematron, clearSchematron } = useSchema();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const schXml = await file.text();
        loadSchematron(schXml, file.name.replace(/\.(sch|xml)$/i, ''));
      } catch (err) {
        alert(`Failed to load Schematron rules: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }

      // Reset input so the same file can be re-selected after editing
      e.target.value = '';
    },
    [loadSchematron],
  );

  return (
    <>
      {schematron ? (
        <Tooltip content={`Schematron rules active: ${schematron.testCount} checks${schematron.title ? ` — ${schematron.title}` : ''}. Click to remove.`}>
          <button className="toolbar-btn-active" onClick={clearSchematron}>
            Rules: {schematron.name} ✕
          </button>
        </Tooltip>
      ) : (
        <Tooltip content="Load Schematron project rules (.sch) — validated on top of the schema">
          <button onClick={() => fileInputRef.current?.click()}>Rules...</button>
        </Tooltip>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".sch,.xml,application/xml"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />
    </>
  );
}
