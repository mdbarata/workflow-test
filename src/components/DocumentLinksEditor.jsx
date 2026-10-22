import React, { useState, useMemo } from 'react';

// Normalise user input: trim, add https:// when the scheme is missing.
// Returns '' for empty input, or null when the value is not an http(s) URL.
export const normalizeDocUrl = (raw) => {
  const v = (raw || '').trim();
  if (!v) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
  if (!/^https?:\/\//i.test(withScheme)) return null;
  try {
    new URL(withScheme);
  } catch {
    return null;
  }
  return withScheme;
};

// Collects every unique document (by id) across activities, hidden docs and root docs.
const collectDocuments = (workflowData) => {
  const map = {};
  const ensure = (d) => {
    if (!d || !d.id) return null;
    if (!map[d.id]) {
      map[d.id] = { id: d.id, name: d.name || d.id, url: d.url || '', inputIn: new Set(), outputIn: new Set(), declaredType: d.type };
    } else if (!map[d.id].url && d.url) {
      map[d.id].url = d.url;
    }
    return map[d.id];
  };

  (workflowData.activities || []).forEach((act) => {
    (act.documents || []).forEach(ensure);
    (act.tasks || []).forEach((t) => {
      (t.inputs || []).forEach((id) => { const e = map[id]; if (e) e.inputIn.add(act.name); });
      (t.outputs || []).forEach((id) => { const e = map[id]; if (e) e.outputIn.add(act.name); });
    });
  });
  (workflowData.hiddenDocuments || []).forEach(ensure);
  (workflowData.documents || []).forEach(ensure);

  return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
};

const thStyle = {
  padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#64748b',
  borderBottom: '0.5px solid #e2e8f0', whiteSpace: 'nowrap',
  background: '#f1f5f9', textAlign: 'left', position: 'sticky', top: 0, zIndex: 1,
};

const DocumentLinksEditor = ({ workflowData, onSave, onClose }) => {
  const docs = useMemo(() => collectDocuments(workflowData), [workflowData]);
  const [urls, setUrls] = useState(() => {
    const init = {};
    docs.forEach((d) => { init[d.id] = d.url || ''; });
    return init;
  });
  const [search, setSearch] = useState('');
  const [errors, setErrors] = useState({});

  const q = search.trim().toLowerCase();
  const filtered = docs.filter((d) => !q || d.name.toLowerCase().includes(q) || (urls[d.id] || '').toLowerCase().includes(q));
  const linkedCount = docs.filter((d) => (urls[d.id] || '').trim()).length;

  const setUrl = (id, value) => {
    setUrls((prev) => ({ ...prev, [id]: value }));
    if (errors[id]) setErrors((prev) => { const n = { ...prev }; delete n[id]; return n; });
  };

  const handleTest = (id) => {
    const normalized = normalizeDocUrl(urls[id]);
    if (!normalized) { setErrors((prev) => ({ ...prev, [id]: 'Enter a valid http(s) link' })); return; }
    window.open(normalized, '_blank', 'noopener,noreferrer');
  };

  const handleSave = () => {
    const nextErrors = {};
    const result = {};
    docs.forEach((d) => {
      const normalized = normalizeDocUrl(urls[d.id]);
      if (normalized === null) nextErrors[d.id] = 'Enter a valid http(s) link';
      else result[d.id] = normalized;
    });
    if (Object.keys(nextErrors).length > 0) { setErrors(nextErrors); return; }
    onSave(result);
    onClose();
  };

  const typeLabel = (d) => {
    const isIn = d.inputIn.size > 0;
    const isOut = d.outputIn.size > 0;
    if (isIn && isOut) return 'Input / Output';
    if (isOut) return 'Output';
    if (isIn) return 'Input';
    return d.declaredType === 'output' ? 'Output' : 'Input';
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, backdropFilter: 'blur(3px)' }}>
      <div style={{ background: '#ffffff', borderRadius: 12, width: '90vw', maxWidth: 1100, minHeight: '60vh', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '0.5px solid #e2e8f0' }}>
          <div>
            <span style={{ fontSize: 15, fontWeight: 500 }}>🔗 Document links</span>
            <span style={{ marginLeft: 10, fontSize: 12, color: '#64748b' }}>
              Paste a Google Docs (or any web) link for each document. Double-click the grey box in the diagram to open it.
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, color: '#64748b', cursor: 'pointer', padding: '2px 6px' }}>✕</button>
        </div>

        <div style={{ padding: '10px 20px', borderBottom: '0.5px solid #e2e8f0' }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Filter documents…"
            style={{ width: 260, fontSize: 12, padding: '5px 10px', border: '1px solid #cbd5e1', borderRadius: 6, outline: 'none', background: '#f8fafc' }}
          />
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {docs.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              No documents found. Add inputs/outputs to tasks in the task editor first.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, minWidth: 180 }}>Document</th>
                  <th style={{ ...thStyle, width: 100 }}>Type</th>
                  <th style={{ ...thStyle, minWidth: 150 }}>Used in stage(s)</th>
                  <th style={{ ...thStyle, minWidth: 320 }}>Link (URL)</th>
                  <th style={{ ...thStyle, width: 70 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => {
                  const stages = Array.from(new Set([...d.inputIn, ...d.outputIn]));
                  const hasUrl = !!(urls[d.id] || '').trim();
                  return (
                    <tr key={d.id} style={{ borderBottom: '0.5px solid #e2e8f0' }}>
                      <td style={{ padding: '6px 10px', fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{d.name}</td>
                      <td style={{ padding: '6px 10px', fontSize: 11, color: '#475569' }}>{typeLabel(d)}</td>
                      <td style={{ padding: '6px 10px', fontSize: 11, color: '#64748b' }}>{stages.join(', ') || '—'}</td>
                      <td style={{ padding: '4px 10px' }}>
                        <input
                          type="text"
                          value={urls[d.id] || ''}
                          onChange={(e) => setUrl(d.id, e.target.value)}
                          placeholder="https://docs.google.com/document/d/…"
                          style={{ width: '100%', fontSize: 12, padding: '5px 8px', border: `1px solid ${errors[d.id] ? '#dc2626' : '#cbd5e1'}`, borderRadius: 5, outline: 'none', background: '#fff', boxSizing: 'border-box' }}
                        />
                        {errors[d.id] && <div style={{ fontSize: 10, color: '#dc2626', marginTop: 2 }}>{errors[d.id]}</div>}
                      </td>
                      <td style={{ padding: '4px 10px', whiteSpace: 'nowrap' }}>
                        <button
                          disabled={!hasUrl}
                          onClick={() => handleTest(d.id)}
                          title="Open link in a new tab"
                          style={{ background: 'none', border: '1px solid #cbd5e1', borderRadius: 5, padding: '3px 8px', fontSize: 11, color: hasUrl ? '#2563eb' : '#cbd5e1', cursor: hasUrl ? 'pointer' : 'default' }}
                        >↗ Test</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '0.5px solid #e2e8f0' }}>
          <div style={{ fontSize: 12, color: '#64748b' }}>{linkedCount} of {docs.length} document{docs.length === 1 ? '' : 's'} linked</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={handleSave}>Save links</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentLinksEditor;
