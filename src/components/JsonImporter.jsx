import React, { useRef, useState } from 'react';

const SCHEMA_HINT = `Expected structure:
{
  "activities": [{
    "id": "activity_1",
    "name": "ACTIVITY 1",
    "tools": ["TOOL 1", ...],
    "responsibles": [{
      "key": "RESPONSIBLE_A",
      "name": "RESPONSIBLE A",
      "color": "#c7e9c0",
      "borderColor": "#2d6a2d",
      "taskColor": "#4CAF50"
    }],
    "documents": [{
      "id": "doc_in_1",
      "name": "Document Input 1",
      "type": "input"  // or "output"
    }],
    "tasks": [{
      "id": "task1",
      "name": "Task 1",
      "tool": "TOOL 1",
      "responsible": "RESPONSIBLE_A",
      "startTime": 100,
      "duration": 150,
      "details": "Description here",
      "dependencies": [],
      "inputs": ["doc_in_1"],
      "outputs": []
    }]
  }]
}`;

const JsonImporter = ({ onImport, onClose }) => {
  const fileRef = useRef();
  const [error, setError] = useState(null);
  const [text, setText] = useState('');

  const validate = (data) => {
    if (!data.activities || !Array.isArray(data.activities))
      return 'Missing "activities" array at root level.';
    for (const act of data.activities) {
      if (!act.id || !act.name) return 'Each activity must have "id" and "name".';
      if (!Array.isArray(act.tasks)) return `Activity "${act.id}" missing "tasks" array.`;
      if (!Array.isArray(act.tools)) return `Activity "${act.id}" missing "tools" array.`;
      if (!Array.isArray(act.responsibles)) return `Activity "${act.id}" missing "responsibles" array.`;
    }
    return null;
  };

  const process = (raw) => {
    try {
      const parsed = JSON.parse(raw);
      const err = validate(parsed);
      if (err) { setError(err); return; }
      onImport(parsed);
      onClose();
    } catch (e) {
      setError('Invalid JSON: ' + e.message);
    }
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => process(ev.target.result);
    reader.readAsText(file);
  };

  const handlePaste = () => process(text);

  return (
    <div className="importer-overlay" onClick={onClose}>
      <div className="importer-modal" onClick={(e) => e.stopPropagation()}>
        <div className="importer-header">
          <h2>Import Workflow JSON</h2>
          <button className="importer-close" onClick={onClose}>✕</button>
        </div>

        <div className="importer-body">
          <div className="importer-upload">
            <button className="upload-btn" onClick={() => fileRef.current.click()}>
              📂 Select JSON file
            </button>
            <input ref={fileRef} type="file" accept=".json" onChange={handleFile} style={{ display: 'none' }} />
            <span className="upload-hint">or paste JSON below and click Apply</span>
          </div>

          <textarea
            className="importer-textarea"
            placeholder={SCHEMA_HINT}
            value={text}
            onChange={(e) => { setText(e.target.value); setError(null); }}
            spellCheck={false}
          />

          {error && <div className="importer-error">⚠ {error}</div>}

          <div className="importer-actions">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={handlePaste} disabled={!text.trim()}>
              Apply JSON
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JsonImporter;
