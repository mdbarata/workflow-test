import React, { useState, useMemo, useCallback } from 'react';

// ── Responsible palette ───────────────────────────────────────────────────────
// Colour presets cycle when a new responsible name is first encountered.
const RESP_PRESETS = [
  { color: '#c7e9c0', borderColor: '#2d6a2d', taskColor: '#4CAF50' },
  { color: '#b3d9ff', borderColor: '#003d99', taskColor: '#1a3a99' },
  { color: '#f0c6ff', borderColor: '#9900cc', taskColor: '#d946ef' },
  { color: '#ffd6a5', borderColor: '#a05a00', taskColor: '#e07b00' },
  { color: '#ffb3b3', borderColor: '#990000', taskColor: '#cc2200' },
  { color: '#b3f0e0', borderColor: '#006644', taskColor: '#00886e' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const slugify = (str) =>
  str.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

const splitList = (str) =>
  str ? str.split(',').map((s) => s.trim()).filter(Boolean) : [];

const joinList = (arr) => (arr || []).join(', ');

// Derive startTime from dependency chain (simple topological pass).
// Tasks with no pre-tasks start at 100. Each dependent task starts after its
// latest dependency ends. Duration defaults to 150 units.
const DEFAULT_DURATION = 150;
const DEFAULT_START = 100;

const computeStartTimes = (rows) => {
  const byId = {};
  rows.forEach((r) => { byId[r.taskId] = r; });

  const memo = {};
  const getEnd = (id) => {
    if (memo[id] !== undefined) return memo[id];
    const r = byId[id];
    if (!r) return 0;
    const pres = splitList(r.pre);
    const start = pres.length
      ? Math.max(...pres.map((p) => getEnd(p))) + 20
      : DEFAULT_START;
    memo[id] = start + (parseInt(r.duration, 10) || DEFAULT_DURATION);
    return memo[id];
  };
  rows.forEach((r) => getEnd(r.taskId));

  const startOf = {};
  rows.forEach((r) => {
    const pres = splitList(r.pre);
    startOf[r.taskId] = pres.length
      ? Math.max(...pres.map((p) => getEnd(p))) + 20
      : DEFAULT_START;
  });
  return startOf;
};

// Convert flat editor rows → workflow.json shape consumed by WorkflowCanvas.
const rowsToWorkflow = (rows) => {
  const activitiesMap = {};
  const respColorMap = {};
  let presetIdx = 0;

  rows.forEach((r) => {
    const actId = slugify(r.activity) || 'activity_1';
    const actName = r.activity.toUpperCase();
    if (!activitiesMap[actId]) {
      activitiesMap[actId] = {
        id: actId,
        name: actName,
        toolsSet: new Set(),
        responsiblesMap: {},
        docsSet: {},
        rows: [],
      };
    }
    const act = activitiesMap[actId];
    act.rows.push(r);
    if (r.tool) act.toolsSet.add(r.tool);

    // Register responsible
    const respKey = slugify(r.responsible) || 'responsible_a';
    if (!act.responsiblesMap[respKey]) {
      if (!respColorMap[respKey]) {
        respColorMap[respKey] = RESP_PRESETS[presetIdx % RESP_PRESETS.length];
        presetIdx++;
      }
      act.responsiblesMap[respKey] = {
        key: respKey,
        name: r.responsible.toUpperCase(),
        ...respColorMap[respKey],
      };
    }

    // Collect documents
    splitList(r.inputs).forEach((name) => {
      const id = slugify(name);
      if (!act.docsSet[id]) act.docsSet[id] = { id, name, type: 'input' };
    });
    splitList(r.outputs).forEach((name) => {
      const id = slugify(name);
      if (!act.docsSet[id]) act.docsSet[id] = { id, name, type: 'output' };
    });
  });

  const activities = Object.values(activitiesMap).map((act) => {
    const startTimes = computeStartTimes(act.rows);

    const tasks = act.rows.map((r) => ({
      id: r.taskId,
      name: r.label,
      tool: r.tool,
      responsible: slugify(r.responsible) || 'responsible_a',
      startTime: startTimes[r.taskId] || DEFAULT_START,
      duration: parseInt(r.duration, 10) || DEFAULT_DURATION,
      details: r.notes || '',
      dependencies: splitList(r.pre),
      inputs: splitList(r.inputs).map(slugify),
      outputs: splitList(r.outputs).map(slugify),
    }));

    return {
      id: act.id,
      name: act.name,
      tools: [...act.toolsSet],
      responsibles: Object.values(act.responsiblesMap),
      documents: Object.values(act.docsSet),
      tasks,
    };
  });

  return { activities };
};

// ── Empty row factory ─────────────────────────────────────────────────────────
let _uid = 1;
const emptyRow = (activityName = '') => ({
  _key: _uid++,
  taskId: '',
  activity: activityName,
  label: '',
  responsible: '',
  tool: '',
  inputs: '',
  outputs: '',
  pre: '',
  post: '',
  duration: String(DEFAULT_DURATION),
  notes: '',
});

// Seed rows from existing workflowData so the editor reflects current state.
const workflowToRows = (data) => {
  const rows = [];
  (data.activities || []).forEach((act) => {
    (act.tasks || []).forEach((t) => {
      rows.push({
        _key: _uid++,
        taskId: t.id,
        activity: act.name,
        label: t.name,
        responsible:
          act.responsibles.find((r) => r.key === t.responsible)?.name ||
          t.responsible,
        tool: t.tool,
        inputs: joinList(
          (t.inputs || []).map(
            (id) => act.documents.find((d) => d.id === id)?.name || id
          )
        ),
        outputs: joinList(
          (t.outputs || []).map(
            (id) => act.documents.find((d) => d.id === id)?.name || id
          )
        ),
        pre: joinList(t.dependencies || []),
        post: '',
        duration: String(t.duration || DEFAULT_DURATION),
        notes: t.details || '',
      });
    });
  });
  return rows.length ? rows : [emptyRow()];
};

// ── Cell component (editable inline) ─────────────────────────────────────────
const Cell = ({ value, onChange, placeholder, wide, list }) => (
  <td style={{ padding: '3px 4px', minWidth: wide ? 110 : 80 }}>
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      list={list}
      style={{
        width: '100%',
        fontSize: 12,
        padding: '3px 6px',
        border: '0.5px solid transparent',
        borderRadius: 4,
        background: 'transparent',
        color: '#1e293b',
        fontFamily: 'system-ui, sans-serif',
        outline: 'none',
      }}
      onFocus={(e) => (e.target.style.borderColor = '#2563eb')}
      onBlur={(e) => (e.target.style.borderColor = 'transparent')}
    />
  </td>
);

// ── Main component ────────────────────────────────────────────────────────────
const TaskEditor = ({ workflowData, onSave, onClose }) => {
  const [rows, setRows] = useState(() => workflowToRows(workflowData));
  const [activeAct, setActiveAct] = useState('__all__');
  const [error, setError] = useState(null);

  // Derived lists for autocomplete datalists
  const activities = useMemo(() => [...new Set(rows.map((r) => r.activity).filter(Boolean))], [rows]);
  const tools = useMemo(() => [...new Set(rows.map((r) => r.tool).filter(Boolean))], [rows]);
  const responsibles = useMemo(() => [...new Set(rows.map((r) => r.responsible).filter(Boolean))], [rows]);
  const taskIds = useMemo(() => rows.map((r) => r.taskId).filter(Boolean), [rows]);

  const visibleRows = useMemo(
    () => (activeAct === '__all__' ? rows : rows.filter((r) => r.activity === activeAct)),
    [rows, activeAct]
  );

  const updateRow = useCallback((key, field, value) => {
    setRows((prev) =>
      prev.map((r) => (r._key === key ? { ...r, [field]: value } : r))
    );
    setError(null);
  }, []);

  const addRow = () => {
    const actName = activeAct === '__all__' ? (activities[0] || '') : activeAct;
    setRows((prev) => [...prev, emptyRow(actName)]);
  };

  const deleteRow = (key) => setRows((prev) => prev.filter((r) => r._key !== key));

  const duplicateRow = (key) => {
    const idx = rows.findIndex((r) => r._key === key);
    const copy = { ...rows[idx], _key: _uid++, taskId: '', label: rows[idx].label + ' (copy)' };
    setRows((prev) => [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)]);
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!parsed.activities) { setError('Missing "activities" in JSON.'); return; }
        setRows(workflowToRows(parsed));
        setError(null);
      } catch (err) {
        setError('Invalid JSON: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExport = () => {
    const withIds = rows.map((r, i) => ({
      ...r,
      taskId: r.taskId.trim() || `task${i + 1}`,
    }));
    const data = JSON.stringify(rowsToWorkflow(withIds), null, 2);
    const a = document.createElement('a');
    a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(data);
    a.download = 'workflow.json';
    a.click();
  };

  const handleSave = () => {
    // Basic validation
    const filled = rows.filter((r) => r.label.trim());
    if (!filled.length) { setError('Add at least one task with a label.'); return; }
    const missing = filled.filter((r) => !r.activity.trim());
    if (missing.length) { setError(`Some tasks are missing an activity name.`); return; }

    // Auto-assign taskIds if blank
    const withIds = rows.map((r, i) => ({
      ...r,
      taskId: r.taskId.trim() || `task${i + 1}`,
    }));

    onSave(rowsToWorkflow(withIds));
    onClose();
  };

  const thStyle = {
    padding: '6px 8px',
    fontSize: 11,
    fontWeight: 500,
    color: '#64748b',
    borderBottom: '0.5px solid #e2e8f0',
    whiteSpace: 'nowrap',
    background: '#f1f5f9',
    textAlign: 'left',
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2000, backdropFilter: 'blur(3px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: 12,
          width: '96vw', maxWidth: 1200,
          maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '0.5px solid #e2e8f0', background: '#ffffff' }}>
          <div>
            <span style={{ fontSize: 15, fontWeight: 500 }}>Edit tasks</span>
            <span style={{ marginLeft: 10, fontSize: 12, color: '#64748b' }}>
              Each row is one task. Inputs/outputs and pre/post tasks are comma-separated.
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, color: '#64748b', cursor: 'pointer', padding: '2px 6px', borderRadius: 4 }}>✕</button>
        </div>

        {/* Activity tabs */}
        <div style={{ display: 'flex', gap: 4, padding: '8px 20px 0', borderBottom: '0.5px solid #e2e8f0', background: '#f8fafc' }}>
          {['__all__', ...activities].map((act) => (
            <button
              key={act}
              onClick={() => setActiveAct(act)}
              style={{
                padding: '4px 14px', fontSize: 12, cursor: 'pointer',
                borderRadius: '6px 6px 0 0',
                border: '0.5px solid',
                borderColor: activeAct === act ? '#e2e8f0' : 'transparent',
                borderBottom: 'none',
                background: activeAct === act ? '#ffffff' : 'transparent',
                color: activeAct === act ? '#1e293b' : '#64748b',
                fontWeight: activeAct === act ? 500 : 400,
                marginBottom: -1,
              }}
            >
              {act === '__all__' ? 'All' : act}
            </button>
          ))}
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', background: '#ffffff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 28 }}>#</th>
                <th style={thStyle}>Task ID</th>
                <th style={{ ...thStyle, minWidth: 110 }}>Activity</th>
                <th style={{ ...thStyle, minWidth: 110 }}>Label</th>
                <th style={{ ...thStyle, minWidth: 120 }}>Responsible</th>
                <th style={{ ...thStyle, minWidth: 100 }}>Tool</th>
                <th style={{ ...thStyle, minWidth: 80 }}>Duration</th>
                <th style={{ ...thStyle, minWidth: 140 }}>Inputs</th>
                <th style={{ ...thStyle, minWidth: 140 }}>Outputs</th>
                <th style={{ ...thStyle, minWidth: 120 }}>Pre-tasks</th>
                <th style={{ ...thStyle, minWidth: 120 }}>Post-tasks</th>
                <th style={{ ...thStyle, minWidth: 160 }}>Notes</th>
                <th style={{ ...thStyle, width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, i) => (
                <tr
                  key={row._key}
                  style={{ borderBottom: '0.5px solid #e2e8f0' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                >
                  <td style={{ padding: '3px 6px', fontSize: 11, color: '#64748b', textAlign: 'center' }}>{i + 1}</td>
                  <Cell value={row.taskId} onChange={(v) => updateRow(row._key, 'taskId', v)} placeholder="task1" />
                  <Cell value={row.activity} onChange={(v) => updateRow(row._key, 'activity', v)} placeholder="Activity 1" list="act-list" wide />
                  <Cell value={row.label} onChange={(v) => updateRow(row._key, 'label', v)} placeholder="Task name" wide />
                  <Cell value={row.responsible} onChange={(v) => updateRow(row._key, 'responsible', v)} placeholder="Responsible A" list="resp-list" wide />
                  <Cell value={row.tool} onChange={(v) => updateRow(row._key, 'tool', v)} placeholder="Tool 1" list="tool-list" />
                  <Cell value={row.duration} onChange={(v) => updateRow(row._key, 'duration', v)} placeholder="150" />
                  <Cell value={row.inputs} onChange={(v) => updateRow(row._key, 'inputs', v)} placeholder="Doc A, Doc B" wide />
                  <Cell value={row.outputs} onChange={(v) => updateRow(row._key, 'outputs', v)} placeholder="Doc C" wide />
                  <Cell value={row.pre} onChange={(v) => updateRow(row._key, 'pre', v)} placeholder="task1, task2" list="id-list" wide />
                  <Cell value={row.post} onChange={(v) => updateRow(row._key, 'post', v)} placeholder="task3" list="id-list" wide />
                  <Cell value={row.notes} onChange={(v) => updateRow(row._key, 'notes', v)} placeholder="Details…" wide />
                  <td style={{ padding: '3px 4px', whiteSpace: 'nowrap' }}>
                    <button
                      title="Duplicate row"
                      onClick={() => duplicateRow(row._key)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '2px 4px', borderRadius: 3, fontSize: 13 }}
                    >⧉</button>
                    <button
                      title="Delete row"
                      onClick={() => deleteRow(row._key)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '2px 4px', borderRadius: 3, fontSize: 13 }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#dc2626'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b'; }}
                    >✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Add row button */}
          <button
            onClick={addRow}
            style={{
              width: '100%', padding: '9px', background: 'none', border: 'none',
              borderTop: '0.5px solid #e2e8f0',
              color: '#64748b', cursor: 'pointer',
              fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            + Add row
          </button>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 20px', borderTop: '0.5px solid #e2e8f0',
        }}>
          <div style={{ fontSize: 12, color: error ? '#dc2626' : '#64748b' }}>
            {error ? `⚠ ${error}` : `${rows.filter(r => r.label.trim()).length} tasks across ${activities.length || 0} activit${activities.length === 1 ? 'y' : 'ies'}`}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <label className="btn-secondary" style={{ cursor: 'pointer' }}>
                ↑ Import JSON
                <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
            </label>
            <button className="btn-secondary" onClick={handleExport}>↓ Export JSON</button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={handleSave}>Apply & view diagram</button>
          </div>
        </div>
      </div>

      {/* Datalists for autocomplete */}
      <datalist id="act-list">{activities.map((a) => <option key={a} value={a} />)}</datalist>
      <datalist id="tool-list">{tools.map((t) => <option key={t} value={t} />)}</datalist>
      <datalist id="resp-list">{responsibles.map((r) => <option key={r} value={r} />)}</datalist>
      <datalist id="id-list">{taskIds.map((id) => <option key={id} value={id} />)}</datalist>
    </div>
  );
};

export default TaskEditor;
