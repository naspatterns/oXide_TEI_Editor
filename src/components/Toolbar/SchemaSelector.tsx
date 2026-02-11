import { useCallback, useRef } from 'react';
import { useSchema } from '../../store/SchemaContext';
import { schemaEngine } from '../../schema/SchemaEngine';

export function SchemaSelector() {
  const { schema, availableSchemas, isLoading, loadSchema, setSchema } = useSchema();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      if (value === '__upload__') {
        fileInputRef.current?.click();
        // Reset select to current value so "Upload" doesn't stay selected
        e.target.value = schema?.id ?? '';
        return;
      }
      loadSchema(value);
    },
    [loadSchema, schema],
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
        setSchema(info);
      } catch (err) {
        alert(`Failed to load schema: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }

      // Reset input so the same file can be re-selected
      e.target.value = '';
    },
    [setSchema],
  );

  return (
    <>
      <select
        value={schema?.id ?? ''}
        onChange={handleChange}
        disabled={isLoading}
        title="Select TEI schema"
      >
        <option value="" disabled>
          Schema...
        </option>
        {availableSchemas.map((id) => (
          <option key={id} value={id}>
            {id === 'tei_lite' ? 'TEI Lite' : id === 'tei_all' ? 'TEI All' : id}
          </option>
        ))}
        {/* Show custom schema if loaded */}
        {schema && !availableSchemas.includes(schema.id) && (
          <option value={schema.id}>{schema.name}</option>
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
