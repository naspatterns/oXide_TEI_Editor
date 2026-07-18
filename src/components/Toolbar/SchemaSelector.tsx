import { useCallback, useRef } from 'react';
import { useSchema } from '../../store/useSchema';
import { useEditor } from '../../store/useEditor';
import { schemaEngine } from '../../schema/SchemaEngine';

/**
 * Schema selector for the ACTIVE document (M3 per-document schema).
 *
 * The selection reads/writes the active tab's `schemaId` — switching tabs
 * switches the displayed schema, and picking a schema here affects only the
 * current document. Uploaded custom schemas are registered app-wide (any tab
 * may select them) but are only ASSIGNED to the active document.
 */
export function SchemaSelector() {
  const { schemasById, availableSchemas, isLoading, ensureSchema, registerCustomSchema } = useSchema();
  const { getActiveDocument, setDocumentSchemaId } = useEditor();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeDoc = getActiveDocument();
  const activeSchemaId = activeDoc?.schemaId ?? 'tei_lite';

  const customSchemaIds = Object.keys(schemasById).filter(id => !availableSchemas.includes(id));

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      if (value === '__upload__') {
        fileInputRef.current?.click();
        // Reset select to current value so "Upload" doesn't stay selected
        e.target.value = activeSchemaId;
        return;
      }
      if (!activeDoc) return;
      void ensureSchema(value);
      setDocumentSchemaId(activeDoc.id, value);
    },
    [activeDoc, activeSchemaId, ensureSchema, setDocumentSchemaId],
  );

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Check for DTD files
      if (file.name.toLowerCase().endsWith('.dtd')) {
        alert(
          '⚠️ DTD schemas are not directly supported.\n\n' +
          'Only RelaxNG (.rng) schemas can be uploaded.\n\n' +
          'To convert DTD to RelaxNG:\n' +
          '• Using trang: java -jar trang.jar schema.dtd schema.rng\n' +
          '• Online: https://relaxng.org/jclark/trang.html'
        );
        e.target.value = '';
        return;
      }

      try {
        const rngXml = await file.text();
        const name = file.name.replace(/\.(rng|xml)$/i, '');
        const info = await schemaEngine.loadCustomRng(rngXml, name);
        registerCustomSchema(info);
        if (activeDoc) {
          setDocumentSchemaId(activeDoc.id, info.id);
        }
      } catch (err) {
        alert(`Failed to load schema: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }

      // Reset input so the same file can be re-selected
      e.target.value = '';
    },
    [activeDoc, registerCustomSchema, setDocumentSchemaId],
  );

  return (
    <>
      <select
        value={activeSchemaId}
        onChange={handleChange}
        disabled={isLoading || !activeDoc}
        title="Select TEI schema for the current document"
      >
        <option value="" disabled>
          Schema...
        </option>
        {availableSchemas.map((id) => (
          <option key={id} value={id}>
            {id === 'tei_lite' ? 'TEI Lite' : id === 'tei_all' ? 'TEI All' : id}
          </option>
        ))}
        {customSchemaIds.map((id) => (
          <option key={id} value={id}>
            {schemasById[id].name}
          </option>
        ))}
        {/* The active doc may reference a custom schema not (yet) registered */}
        {!availableSchemas.includes(activeSchemaId) && !customSchemaIds.includes(activeSchemaId) && (
          <option value={activeSchemaId}>{activeSchemaId.replace(/^custom_/, '')}</option>
        )}
        <option value="__upload__">Upload .rng...</option>
      </select>
      <input
        ref={fileInputRef}
        type="file"
        accept=".rng,.xml,.dtd,application/xml"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />
    </>
  );
}
