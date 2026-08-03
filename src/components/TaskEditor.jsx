import React, { useState, useMemo, useCallback, useEffect } from 'react';

// ── Responsible palette ───────────────────────────────────────────────────────
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

const DEFAULT_DURATION = 150;
const DEFAULT_START = 0;
const TASK_GAP = 20;

// ── Auto-calculate startTime based on dependencies ────────────────────────────
const computeStartTimes = (rows) => {
  const byId = {};
  rows.forEach((r) => { byId[r.taskId] = r; });

  const memo = {};
  const getEnd = (id) => {
    if (memo[id] !== undefined) return memo[id];
    const r = byId[id];
    if (!r) return 0;
    const explicitStart = r.startTime !== '' && r.startTime !== null && r.startTime !== undefined
      ? parseInt(r.startTime, 10) : null;
    if (explicitStart !== null && !isNaN(explicitStart)) {
      memo[id] = explicitStart + (parseInt(r.duration, 10) || DEFAULT_DURATION);
      return memo[id];
    }
    const pres = splitList(r.pre);
    const start = pres.length ? Math.max(...pres.map((p) => getEnd(p))) + TASK_GAP : DEFAULT_START;
    memo[id] = start + (parseInt(r.duration, 10) || DEFAULT_DURATION);
    return memo[id];
  };
  rows.forEach((r) => getEnd(r.taskId));

  const startOf = {};
  rows.forEach((r) => {
    const explicitStart = r.startTime !== '' && r.startTime !== null && r.startTime !== undefined
      ? parseInt(r.startTime, 10) : null;
    if (explicitStart !== null && !isNaN(explicitStart)) {
      startOf[r.taskId] = explicitStart;
    } else {
      const pres = splitList(r.pre);
      startOf[r.taskId] = pres.length
        ? Math.max(...pres.map((p) => getEnd(p))) + TASK_GAP
        : DEFAULT_START;
    }
  });
  return startOf;
};

// ── Convert flat rows → workflow.json ────────────────────────────────────────
// Pass originalData to preserve per-activity metadata (chapters, etc.) that
// TaskEditor does not edit — so they aren't dropped when the user saves.
const rowsToWorkflow = (rows, originalData) => {
  const activitiesMap = {};
  const respColorMap = {};
  let presetIdx = 0;
  const sequencesSet = new Set();
  const hiddenRows = [];

  rows.forEach((r) => {
    splitList(r.sequences).forEach(seq => sequencesSet.add(seq));

    const actId = slugify(r.activity);
    if (!actId) {
      hiddenRows.push(r);
      return;
    }
    
    const actName = r.activity.toUpperCase();
    if (!activitiesMap[actId]) {
      activitiesMap[actId] = { id: actId, name: actName, toolsSet: new Set(), responsiblesMap: {}, docsSet: {}, rows: [] };
    }
    const act = activitiesMap[actId];
    act.rows.push(r);
    if (r.tool) act.toolsSet.add(r.tool);

    const respKey = slugify(r.responsible) || 'responsible_a';
    if (!act.responsiblesMap[respKey]) {
      if (!respColorMap[respKey]) { respColorMap[respKey] = RESP_PRESETS[presetIdx % RESP_PRESETS.length]; presetIdx++; }
      act.responsiblesMap[respKey] = { key: respKey, name: r.responsible.toUpperCase(), ...respColorMap[respKey] };
    }

    splitList(r.inputs).forEach((name) => { const id = slugify(name); if (!act.docsSet[id]) act.docsSet[id] = { id, name, type: 'input' }; });
    splitList(r.outputs).forEach((name) => { const id = slugify(name); if (!act.docsSet[id]) act.docsSet[id] = { id, name, type: 'output' }; });
  });

  // Build a lookup of original activities by id so we can preserve metadata
  const originalActivitiesById = {};
  if (originalData && originalData.activities) {
    originalData.activities.forEach((a) => { originalActivitiesById[a.id] = a; });
  }

  const rowToTask = (r, startTimes) => ({
    id: r.taskId,
    name: r.label,
    tool: r.tool,
    responsible: slugify(r.responsible) || 'responsible_a',
    startTime: startTimes[r.taskId] || DEFAULT_START,
    duration: parseInt(r.duration, 10) || DEFAULT_DURATION,
    details: r.notes || '',
    alternativeTools: splitList(r.altTools),
    // Zip pre-task IDs with interface formats → [{id, format?, type?, status?}, ...]
    dependencies: splitList(r.pre).map((id, i) => {
      const fmt = splitList(r.preFormats)[i] || '';
      const type = splitList(r.preTypes)[i] || splitList(r.preTypes)[0] || 'undefined';
      const status = splitList(r.preStatuses)[i] || splitList(r.preStatuses)[0] || 'undefined';
      return { id, format: fmt, type, status };
    }),
    inputs: splitList(r.inputs).map(slugify),
    outputs: splitList(r.outputs).map(slugify),
    sequences: splitList(r.sequences),
    isSequenceParent: !!r.isParent,
  });

  const activities = Object.values(activitiesMap).map((act) => {
    const startTimes = computeStartTimes(act.rows);
    const tasks = act.rows.map((r) => rowToTask(r, startTimes));
    const origAct = originalActivitiesById[act.id] || {};
    const result = {
      id: act.id,
      name: act.name,
      tools: [...act.toolsSet],
      responsibles: Object.values(act.responsiblesMap),
      documents: Object.values(act.docsSet),
      tasks,
      chapters: origAct.chapters && Array.isArray(origAct.chapters) ? origAct.chapters : []
    };
    return result;
  });

  const hiddenStartTimes = computeStartTimes(hiddenRows);
  const hiddenTasks = hiddenRows.map((r) => rowToTask(r, hiddenStartTimes));

  // Merge existing sequences with new ones to preserve properties like name
  const originalSequences = originalData?.sequences || [];
  const sequences = Array.from(sequencesSet).map(seqId => {
    const existing = originalSequences.find(s => s.id === seqId);
    return existing || { id: seqId, name: seqId };
  });

  return { activities, hiddenTasks, sequences };
};

const TYPE_ICONS = { file: '📄', plugin: '🔌', undefined: '⚪' };
const STATUS_ICONS = { impl: '🟢', plan: '🟡', undefined: '⚪' };

// ── Empty row factory ─────────────────────────────────────────────────────────
let _uid = 1;
const emptyRow = (activityName = '', sequenceName = '') => ({
  _key: _uid++, taskId: '', activity: activityName, sequences: sequenceName, isParent: false, label: '', responsible: '', tool: '',
  startTime: '', duration: String(DEFAULT_DURATION), inputs: '', outputs: '',
  pre: '', preFormats: '', preTypes: 'undefined', preStatuses: 'undefined', notes: '', altTools: '',
});

// ── Seed rows from existing workflowData ──────────────────────────────────────
const workflowToRows = (data) => {
  const rows = [];
  const addRow = (t, activityName, documents, responsibles) => {
    const deps = (t.dependencies || []);
    const preIds = deps.map((d) => (typeof d === 'object' ? d.id : d));
    const preFmts = deps.map((d) => (typeof d === 'object' ? d.format || '' : ''));
    const preTypes = deps.map((d) => (typeof d === 'object' ? d.type || 'undefined' : 'undefined'));
    const preStatuses = deps.map((d) => (typeof d === 'object' ? d.status || 'undefined' : 'undefined'));
    rows.push({
      _key: _uid++,
      taskId: t.id,
      activity: activityName,
      sequences: joinList(t.sequences || []),
      isParent: !!t.isSequenceParent,
      label: t.name,
      responsible: responsibles.find((r) => r.key === t.responsible)?.name || t.responsible,
      tool: t.tool,
      startTime: t.startTime !== undefined && t.startTime !== null ? String(t.startTime) : '',
      duration: String(t.duration || DEFAULT_DURATION),
      inputs: joinList((t.inputs || []).map((id) => documents.find((d) => d.id === id)?.name || id)),
      outputs: joinList((t.outputs || []).map((id) => documents.find((d) => d.id === id)?.name || id)),
      pre: joinList(preIds),
      preFormats: joinList(preFmts),
      preTypes: joinList(preTypes),
      preStatuses: joinList(preStatuses),
      notes: t.details || '',
      altTools: joinList(t.alternativeTools || []),
    });
  };

  (data.activities || []).forEach((act) => {
    (act.tasks || []).forEach((t) => addRow(t, act.name, act.documents, act.responsibles));
  });

  (data.hiddenTasks || []).forEach((t) => {
    addRow(t, '', [], []);
  });

  return rows.length ? rows : [emptyRow()];
};

// ── Cell ──────────────────────────────────────────────────────────────────────
const Cell = ({ value, onChange, placeholder, wide, list, numeric }) => (
  <td style={{ padding: '3px 4px', minWidth: wide ? 110 : numeric ? 70 : 80 }}>
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      list={list}
      type={numeric ? 'number' : 'text'}
      style={{
        width: '100%', fontSize: 12, padding: '3px 6px',
        border: '0.5px solid transparent', borderRadius: 4,
        background: 'transparent', color: '#1e293b',
        fontFamily: 'system-ui, sans-serif', outline: 'none',
      }}
      onFocus={(e) => (e.target.style.borderColor = '#2563eb')}
      onBlur={(e) => (e.target.style.borderColor = 'transparent')}
    />
  </td>
);

// ── Rename controls (bulk rename across all rows) ─────────────────────────────
const RenameButton = ({ label, currentValue, onRename }) => {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(currentValue);

  if (!editing) {
    return (
      <button title={label} onClick={() => { setVal(currentValue); setEditing(true); }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 12, padding: '4px 6px', marginBottom: -1 }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#2563eb')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}>
        ✎
      </button>
    );
  }

  const commit = () => { onRename(val.trim()); setEditing(false); };

  return (
    <input
      autoFocus
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
      style={{ fontSize: 12, padding: '3px 6px', border: '1px solid #2563eb', borderRadius: 4, marginBottom: -1, width: 140 }}
    />
  );
};

const RenameDropdown = ({ label, options, onRename }) => {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState('');
  const [val, setVal] = useState('');

  if (!options.length) return null;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 11, padding: '4px 8px', marginBottom: -1 }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#2563eb')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}>
        {label}
      </button>
    );
  }

  const commit = () => {
    if (target && val.trim()) onRename(target, val.trim());
    setOpen(false); setTarget(''); setVal('');
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: -1 }}>
      <select value={target} onChange={(e) => { setTarget(e.target.value); setVal(e.target.value); }}
        style={{ fontSize: 11, padding: '3px 4px', border: '1px solid #e2e8f0', borderRadius: 4 }}>
        <option value="">select…</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="new name" autoFocus={!!target}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setOpen(false); setTarget(''); } }}
        style={{ fontSize: 11, padding: '3px 6px', border: '1px solid #2563eb', borderRadius: 4, width: 110 }} />
      <button onClick={commit} style={{ fontSize: 11, padding: '3px 6px', background: '#1e40af', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>✓</button>
      <button onClick={() => { setOpen(false); setTarget(''); }} style={{ fontSize: 11, padding: '3px 6px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
const TaskEditor = ({ workflowData, onSave, onClose }) => {
  const [rows, setRows] = useState(() => workflowToRows(workflowData));
  const [activeAct, setActiveAct] = useState('__all__');
  const [activeSeq, setActiveSeq] = useState('__all__');
  const [tabMode, setTabMode] = useState('stages');
  const [error, setError] = useState(null);
  const [dragKey, setDragKey] = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null);

  const activities = useMemo(() => [...new Set(rows.map((r) => r.activity).filter(Boolean))], [rows]);
  const tools = useMemo(() => [...new Set(rows.map((r) => r.tool).filter(Boolean))], [rows]);
  const responsibles = useMemo(() => [...new Set(rows.map((r) => r.responsible).filter(Boolean))], [rows]);
  const taskIds = useMemo(() => rows.map((r) => r.taskId).filter(Boolean), [rows]);
  const sequencesList = useMemo(() => [...new Set(rows.flatMap((r) => splitList(r.sequences)).filter(Boolean))], [rows]);

  // Pin the set of row keys visible on the current tab. This set is only
  // recomputed when the tab changes or rows are added/removed — NOT when a
  // row's `activity` field is edited — so typing a new stage name on a row
  // doesn't yank it out of view mid-keystroke.
  const rowKeySignature = useMemo(() => rows.map((r) => r._key).join(','), [rows]);
  const [pinnedKeys, setPinnedKeys] = useState(null);

  useEffect(() => {
    if (tabMode === 'stages') {
      if (activeAct === '__all__') { setPinnedKeys(null); return; }
      setPinnedKeys(new Set(rows.filter((r) => r.activity === activeAct).map((r) => r._key)));
    } else {
      if (activeSeq === '__all__') { setPinnedKeys(null); return; }
      setPinnedKeys(new Set(rows.filter((r) => splitList(r.sequences).includes(activeSeq)).map((r) => r._key)));
    }
  }, [tabMode, activeAct, activeSeq, rowKeySignature]);

  const visibleRows = useMemo(() => {
    const isAll = (tabMode === 'stages' && activeAct === '__all__') || (tabMode === 'sequences' && activeSeq === '__all__');
    if (isAll || !pinnedKeys) return rows;
    return rows.filter((r) => pinnedKeys.has(r._key));
  }, [rows, tabMode, activeAct, activeSeq, pinnedKeys]);

  const updateRow = useCallback((key, field, value) => {
    setRows((prev) => prev.map((r) => (r._key === key ? { ...r, [field]: value } : r)));
    setError(null);
  }, []);

  // Bulk-rename every row whose `field` equals `oldVal` to `newVal`.
  // Used to rename a stage/tool/responsible everywhere at once.
  const renameValue = useCallback((field, oldVal, newVal) => {
    if (!newVal || !newVal.trim() || newVal === oldVal) return;
    setRows((prev) => prev.map((r) => (r[field] === oldVal ? { ...r, [field]: newVal } : r)));
    if (field === 'activity' && activeAct === oldVal) setActiveAct(newVal);
    setError(null);
  }, [activeAct]);

  const addRow = () => {
    const actName = tabMode === 'stages' && activeAct !== '__all__' ? activeAct : (tabMode === 'stages' ? (activities[0] || '') : '');
    const seqName = tabMode === 'sequences' && activeSeq !== '__all__' ? activeSeq : '';
    setRows((prev) => [...prev, emptyRow(actName, seqName)]);
  };

  const deleteRow = (key) => setRows((prev) => prev.filter((r) => r._key !== key));

  const moveRow = useCallback((draggedKey, targetKey) => {
    if (draggedKey === targetKey) return;
    setRows((prev) => {
      const from = prev.findIndex((r) => r._key === draggedKey);
      const to = prev.findIndex((r) => r._key === targetKey);
      if (from === -1 || to === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const duplicateRow = (key) => {
    const idx = rows.findIndex((r) => r._key === key);
    const copy = { ...rows[idx], _key: _uid++, taskId: '', label: rows[idx].label + ' (copy)' };
    setRows((prev) => [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)]);
  };

  const handleAutoArrange = () => {
    const withIds = rows.map((r, i) => ({ ...r, taskId: r.taskId.trim() || `task${i + 1}`, startTime: '' }));
    const startTimes = computeStartTimes(withIds);
    setRows((prev) => prev.map((r, i) => ({ ...r, startTime: String(startTimes[withIds[i].taskId] || DEFAULT_START) })));
    setError(null);
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
      } catch (err) { setError('Invalid JSON: ' + err.message); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExport = () => {
    const withIds = rows.map((r, i) => ({ ...r, taskId: r.taskId.trim() || `task${i + 1}` }));
    const data = JSON.stringify(rowsToWorkflow(withIds, workflowData), null, 2);
    const a = document.createElement('a');
    a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(data);
    a.download = 'workflow.json';
    a.click();
  };

  const handleSave = () => {
    const filled = rows.filter((r) => r.label.trim());
    if (!filled.length) { setError('Add at least one task with a label.'); return; }
    if (filled.some((r) => !r.activity.trim() && !r.sequences.trim())) { setError('Some tasks are missing both a stage name and sequences. Please provide at least one.'); return; }
    const withIds = rows.map((r, i) => ({ ...r, taskId: r.taskId.trim() || `task${i + 1}` }));
    onSave(rowsToWorkflow(withIds, workflowData));
    onClose();
  };

  const thStyle = {
    padding: '6px 8px', fontSize: 11, fontWeight: 500, color: '#64748b',
    borderBottom: '0.5px solid #e2e8f0', whiteSpace: 'nowrap',
    background: '#f1f5f9', textAlign: 'left',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, backdropFilter: 'blur(3px)' }}>
      <div style={{ background: '#ffffff', borderRadius: 12, width: '96vw', maxWidth: 1300, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>

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

        {/* Stage / Sequence tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 20px 0', borderBottom: '0.5px solid #e2e8f0', background: '#f8fafc' }}>
          
          <div style={{ display: 'flex', background: '#e2e8f0', padding: 2, borderRadius: 6, marginRight: 8 }}>
            <button onClick={() => setTabMode('stages')} style={{ padding: '4px 12px', fontSize: 12, borderRadius: 4, border: 'none', cursor: 'pointer', background: tabMode === 'stages' ? '#fff' : 'transparent', color: tabMode === 'stages' ? '#1e293b' : '#64748b', fontWeight: tabMode === 'stages' ? 500 : 400, boxShadow: tabMode === 'stages' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>Stages</button>
            <button onClick={() => setTabMode('sequences')} style={{ padding: '4px 12px', fontSize: 12, borderRadius: 4, border: 'none', cursor: 'pointer', background: tabMode === 'sequences' ? '#fff' : 'transparent', color: tabMode === 'sequences' ? '#1e293b' : '#64748b', fontWeight: tabMode === 'sequences' ? 500 : 400, boxShadow: tabMode === 'sequences' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>Sequences</button>
          </div>

          {['__all__', ...(tabMode === 'stages' ? activities : sequencesList)].map((item) => {
            const isActive = tabMode === 'stages' ? activeAct === item : activeSeq === item;
            return (
              <button key={item} onClick={() => tabMode === 'stages' ? setActiveAct(item) : setActiveSeq(item)} style={{
                padding: '4px 14px', fontSize: 12, cursor: 'pointer', borderRadius: '6px 6px 0 0',
                border: '0.5px solid', borderColor: isActive ? '#e2e8f0' : 'transparent',
                borderBottom: 'none', background: isActive ? '#ffffff' : 'transparent',
                color: isActive ? '#1e293b' : '#64748b',
                fontWeight: isActive ? 500 : 400, marginBottom: -1,
              }}>
                {item === '__all__' ? 'All' : item}
              </button>
            );
          })}
          
          {tabMode === 'stages' && activeAct !== '__all__' && (
            <RenameButton
              label="Rename stage"
              currentValue={activeAct}
              onRename={(newVal) => renameValue('activity', activeAct, newVal)}
            />
          )}
          {tabMode === 'sequences' && activeSeq !== '__all__' && (
            <RenameButton
              label="Rename sequence (in tasks)"
              currentValue={activeSeq}
              onRename={(newVal) => {
                if (!newVal || !newVal.trim() || newVal === activeSeq) return;
                setRows((prev) => prev.map((r) => {
                  let seqs = splitList(r.sequences);
                  if (seqs.includes(activeSeq)) {
                    seqs = seqs.map(s => s === activeSeq ? newVal : s);
                    return { ...r, sequences: seqs.join(', ') };
                  }
                  return r;
                }));
                setActiveSeq(newVal);
                setError(null);
              }}
            />
          )}
          <div style={{ flex: 1 }} />
          <RenameDropdown label="Rename tool…" options={tools} onRename={(oldVal, newVal) => renameValue('tool', oldVal, newVal)} />
          <RenameDropdown label="Rename responsible…" options={responsibles} onRename={(oldVal, newVal) => renameValue('responsible', oldVal, newVal)} />
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', background: '#ffffff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1200 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 20 }}></th>
                <th style={{ ...thStyle, width: 28 }}>#</th>
                <th style={thStyle}>Task ID</th>
                <th style={{ ...thStyle, minWidth: 110 }}>Stage</th>
                <th style={{ ...thStyle, minWidth: 110 }}>Sequences</th>
                <th style={{ ...thStyle, minWidth: 70, textAlign: 'center' }} title="Is Parent of Sequence?">Seq. Parent?</th>
                <th style={{ ...thStyle, minWidth: 110 }}>Label</th>
                <th style={{ ...thStyle, minWidth: 120 }}>Responsible</th>
                <th style={{ ...thStyle, minWidth: 100 }}>Tool</th>
                <th style={{ ...thStyle, minWidth: 70 }}>Start</th>
                <th style={{ ...thStyle, minWidth: 70 }}>Duration</th>
                <th style={{ ...thStyle, minWidth: 140 }}>Inputs</th>
                <th style={{ ...thStyle, minWidth: 140 }}>Outputs</th>
                <th style={{ ...thStyle, minWidth: 120 }}>Pre-tasks</th>
                <th style={{ ...thStyle, minWidth: 130 }}>Interface format</th>
                <th style={{ ...thStyle, minWidth: 50, textAlign: 'center' }} title="Interface Type">Type</th>
                <th style={{ ...thStyle, minWidth: 50, textAlign: 'center' }} title="Interface Status">Status</th>
                <th style={{ ...thStyle, minWidth: 160 }}>Notes</th>
                <th style={{ ...thStyle, minWidth: 140 }}>Alt. tools</th>
                <th style={{ ...thStyle, width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, i) => (
                <tr key={row._key}
                  onDragOver={(e) => { e.preventDefault(); if (dragOverKey !== row._key) setDragOverKey(row._key); }}
                  onDrop={(e) => { e.preventDefault(); if (dragKey) moveRow(dragKey, row._key); setDragKey(null); setDragOverKey(null); }}
                  style={{
                    borderBottom: '0.5px solid #e2e8f0',
                    background: dragOverKey === row._key && dragKey !== row._key ? '#dbeafe' : undefined,
                    opacity: dragKey === row._key ? 0.4 : 1,
                  }}
                  onMouseEnter={(e) => { if (!dragKey) e.currentTarget.style.background = '#f1f5f9'; }}
                  onMouseLeave={(e) => { if (!dragKey) e.currentTarget.style.background = ''; }}>
                  <td draggable
                    onDragStart={(e) => { e.stopPropagation(); setDragKey(row._key); }}
                    onDragEnd={() => { setDragKey(null); setDragOverKey(null); }}
                    style={{ padding: '3px 2px', textAlign: 'center', cursor: 'grab', color: '#cbd5e1', fontSize: 13 }} title="Drag to reorder">⠿</td>
                  <td style={{ padding: '3px 6px', fontSize: 11, color: '#64748b', textAlign: 'center' }}>{i + 1}</td>
                  <Cell value={row.taskId} onChange={(v) => updateRow(row._key, 'taskId', v)} placeholder="task1" />
                  <Cell value={row.activity} onChange={(v) => updateRow(row._key, 'activity', v)} placeholder="Stage 1" list="act-list" wide />
                  <Cell value={row.sequences} onChange={(v) => updateRow(row._key, 'sequences', v)} placeholder="seq_1, seq_2" wide />
                  <td style={{ padding: '3px 4px', textAlign: 'center' }}>
                    <input type="checkbox" checked={!!row.isParent} onChange={(e) => updateRow(row._key, 'isParent', e.target.checked)} style={{ cursor: 'pointer' }} title="Is this task the parent of the listed sequences?" />
                  </td>
                  <Cell value={row.label} onChange={(v) => updateRow(row._key, 'label', v)} placeholder="Task name" wide />
                  <Cell value={row.responsible} onChange={(v) => updateRow(row._key, 'responsible', v)} placeholder="Responsible A" list="resp-list" wide />
                  <Cell value={row.tool} onChange={(v) => updateRow(row._key, 'tool', v)} placeholder="Tool 1" list="tool-list" />
                  <Cell value={row.startTime} onChange={(v) => updateRow(row._key, 'startTime', v)} placeholder="auto" numeric />
                  <Cell value={row.duration} onChange={(v) => updateRow(row._key, 'duration', v)} placeholder="150" numeric />
                  <Cell value={row.inputs} onChange={(v) => updateRow(row._key, 'inputs', v)} placeholder="Doc A, Doc B" wide />
                  <Cell value={row.outputs} onChange={(v) => updateRow(row._key, 'outputs', v)} placeholder="Doc C" wide />
                  <Cell value={row.pre} onChange={(v) => updateRow(row._key, 'pre', v)} placeholder="task1, task2" list="id-list" wide />
                  <Cell value={row.preFormats} onChange={(v) => updateRow(row._key, 'preFormats', v)} placeholder="REST/JSON, CSV" wide />
                  <td style={{ padding: '3px 4px', textAlign: 'center' }}>
                    <div style={{ position: 'relative', width: 34, height: 26, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer' }}>
                      <span style={{ fontSize: 14, pointerEvents: 'none', userSelect: 'none' }}>
                        {TYPE_ICONS[row.preTypes] || TYPE_ICONS.undefined}
                      </span>
                      <select value={row.preTypes || 'undefined'} onChange={(e) => updateRow(row._key, 'preTypes', e.target.value)}
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}>
                        <option value="undefined">⚪ Undefined</option>
                        <option value="file">📄 File format</option>
                        <option value="plugin">🔌 Plug-in / Native</option>
                      </select>
                    </div>
                  </td>
                  <td style={{ padding: '3px 4px', textAlign: 'center' }}>
                    <div style={{ position: 'relative', width: 34, height: 26, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer' }}>
                      <span style={{ fontSize: 14, pointerEvents: 'none', userSelect: 'none' }}>
                        {STATUS_ICONS[row.preStatuses] || STATUS_ICONS.undefined}
                      </span>
                      <select value={row.preStatuses || 'undefined'} onChange={(e) => updateRow(row._key, 'preStatuses', e.target.value)}
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}>
                        <option value="undefined">⚪ Undefined</option>
                        <option value="impl">🟢 Implemented</option>
                        <option value="plan">🟡 Planned / Wip</option>
                      </select>
                    </div>
                  </td>
                  <Cell value={row.notes} onChange={(v) => updateRow(row._key, 'notes', v)} placeholder="Details…" wide />
                  <Cell value={row.altTools} onChange={(v) => updateRow(row._key, 'altTools', v)} placeholder="e.g. Figma, Sketch" wide />
                  <td style={{ padding: '3px 4px', whiteSpace: 'nowrap' }}>
                    <button title="Duplicate row" onClick={() => duplicateRow(row._key)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '2px 4px', borderRadius: 3, fontSize: 13 }}>⧉</button>
                    <button title="Delete row" onClick={() => deleteRow(row._key)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '2px 4px', borderRadius: 3, fontSize: 13 }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#dc2626'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b'; }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button onClick={addRow} style={{ width: '100%', padding: '9px', background: 'none', border: 'none', borderTop: '0.5px solid #e2e8f0', color: '#64748b', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
            + Add row
          </button>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '0.5px solid #e2e8f0', background: '#ffffff' }}>
          <div style={{ fontSize: 12, color: error ? '#dc2626' : '#64748b' }}>
            {error ? `⚠ ${error}` : `${rows.filter(r => r.label.trim()).length} tasks across ${activities.length || 0} stage${activities.length === 1 ? '' : 's'}`}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" onClick={handleAutoArrange} title="Recalculate start times from dependencies">
              🔄 Auto-arrange
            </button>
            <label className="btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
              ↑ Import JSON
              <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
            </label>
            <button className="btn-secondary" onClick={handleExport}>↓ Export JSON</button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={handleSave}>Apply & view diagram</button>
          </div>
        </div>
      </div>

      <datalist id="act-list">{activities.map((a) => <option key={a} value={a} />)}</datalist>
      <datalist id="tool-list">{tools.map((t) => <option key={t} value={t} />)}</datalist>
      <datalist id="resp-list">{responsibles.map((r) => <option key={r} value={r} />)}</datalist>
      <datalist id="id-list">{taskIds.map((id) => <option key={id} value={id} />)}</datalist>
    </div>
  );
};

export default TaskEditor;
