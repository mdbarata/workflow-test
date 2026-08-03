import React, { useState, useCallback, useRef, useEffect } from 'react';

// ── Unique key generator ──────────────────────────────────────────────────────
let _uid = 1;
const nextUid = () => `ch_${_uid++}`;

// ── TaskPickerPopover ─────────────────────────────────────────────────────────
// A floating checklist where the user can toggle individual tasks for a chapter.
const TaskPickerPopover = ({ allTasks, selectedTaskIds, onToggle, onClose, anchorRef }) => {
  const [search, setSearch] = useState('');
  const popoverRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target) &&
        anchorRef.current && !anchorRef.current.contains(e.target)
      ) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, anchorRef]);

  const filtered = allTasks.filter((t) => {
    const q = search.toLowerCase();
    return (t.id || '').toLowerCase().includes(q) || (t.name || '').toLowerCase().includes(q);
  });

  return (
    <div
      ref={popoverRef}
      style={{
        position: 'absolute', top: '100%', left: 0, zIndex: 3000,
        background: '#ffffff', border: '1.5px solid #2563eb', borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)', width: 310,
        maxHeight: 310, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        marginTop: 4,
      }}
    >
      {/* Search */}
      <div style={{ padding: '8px 10px', borderBottom: '0.5px solid #e2e8f0' }}>
        <input
          autoFocus
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks…"
          style={{
            width: '100%', fontSize: 12, padding: '4px 8px',
            border: '1px solid #cbd5e1', borderRadius: 4, outline: 'none',
            background: '#f8fafc', color: '#1e293b', fontFamily: 'system-ui, sans-serif',
          }}
          onFocus={(e) => (e.target.style.borderColor = '#2563eb')}
          onBlur={(e) => (e.target.style.borderColor = '#cbd5e1')}
        />
      </div>

      {/* Task list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {filtered.length === 0 && (
          <div style={{ padding: '12px 14px', fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
            No tasks found
          </div>
        )}
        {filtered.map((t) => {
          const checked = selectedTaskIds.includes(t.id);
          return (
            <label
              key={t.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px',
                cursor: 'pointer', fontSize: 12, color: '#1e293b',
                background: checked ? '#eff6ff' : 'transparent',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => { if (!checked) e.currentTarget.style.background = '#f8fafc'; }}
              onMouseLeave={(e) => { if (!checked) e.currentTarget.style.background = 'transparent'; }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(t.id)}
                style={{ accentColor: '#2563eb', width: 14, height: 14, flexShrink: 0 }}
              />
              <span>
                <span style={{ fontWeight: 600, color: '#2563eb', marginRight: 4 }}>{t.id}</span>
                {t.name}
              </span>
            </label>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '6px 10px', borderTop: '0.5px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#64748b' }}>{selectedTaskIds.length} selected</span>
        <button
          onClick={onClose}
          style={{ fontSize: 11, padding: '4px 10px', background: '#1e40af', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
        >
          Done
        </button>
      </div>
    </div>
  );
};

// ── TasksCell ─────────────────────────────────────────────────────────────────
// A table cell that shows the selection summary and hosts the popover.
const TasksCell = ({ allTasks, selectedTaskIds, onUpdate }) => {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);

  const toggle = useCallback((id) => {
    const next = selectedTaskIds.includes(id)
      ? selectedTaskIds.filter((x) => x !== id)
      : [...selectedTaskIds, id];
    onUpdate(next);
  }, [selectedTaskIds, onUpdate]);

  const label = selectedTaskIds.length === 0
    ? 'Select tasks…'
    : selectedTaskIds.length === 1
      ? `1 task`
      : `${selectedTaskIds.length} tasks`;

  // Get names for tooltip
  const preview = selectedTaskIds
    .slice(0, 3)
    .map((id) => allTasks.find((t) => t.id === id)?.name || id)
    .join(', ') + (selectedTaskIds.length > 3 ? `… (+${selectedTaskIds.length - 3})` : '');

  return (
    <td style={{ padding: '3px 4px', position: 'relative', minWidth: 140 }}>
      <div style={{ position: 'relative' }}>
        <button
          ref={btnRef}
          onClick={() => setOpen((o) => !o)}
          title={selectedTaskIds.length > 0 ? preview : 'Click to select tasks'}
          style={{
            width: '100%', fontSize: 12, padding: '4px 8px', textAlign: 'left',
            border: `1px solid ${open ? '#2563eb' : 'transparent'}`,
            borderRadius: 4, background: selectedTaskIds.length > 0 ? '#eff6ff' : 'transparent',
            color: selectedTaskIds.length > 0 ? '#1d4ed8' : '#94a3b8',
            cursor: 'pointer', fontFamily: 'system-ui, sans-serif', whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#2563eb'; }}
          onMouseLeave={(e) => { if (!open) e.currentTarget.style.borderColor = 'transparent'; }}
        >
          {label} ▾
        </button>
        {open && (
          <TaskPickerPopover
            allTasks={allTasks}
            selectedTaskIds={selectedTaskIds}
            onToggle={toggle}
            onClose={() => setOpen(false)}
            anchorRef={btnRef}
          />
        )}
      </div>
    </td>
  );
};

// ── SimpleCell ────────────────────────────────────────────────────────────────
const SimpleCell = ({ value, onChange, placeholder, numeric }) => (
  <td style={{ padding: '3px 4px', minWidth: numeric ? 80 : 100 }}>
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
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

// ── Main component ────────────────────────────────────────────────────────────
const ChapterEditor = ({ activity, onSave, onClose }) => {
  const allTasks = activity.tasks || [];
  const existingChapters = activity.chapters || [];

  const [rows, setRows] = useState(() =>
    existingChapters.length > 0
      ? existingChapters.map((c) => ({ _key: nextUid(), id: c.id, name: c.name, tasks: c.tasks || [], notes: c.notes || '' }))
      : []
  );
  const [error, setError] = useState(null);
  const [dragKey, setDragKey] = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null);

  const addRow = () => {
    setRows((prev) => [...prev, { _key: nextUid(), id: '', name: '', tasks: [], notes: '' }]);
  };

  const deleteRow = (key) => setRows((prev) => prev.filter((r) => r._key !== key));

  const duplicateRow = (key) => {
    const idx = rows.findIndex((r) => r._key === key);
    const copy = { ...rows[idx], _key: nextUid(), id: '', name: rows[idx].name + ' (copy)' };
    setRows((prev) => [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)]);
  };

  const updateRow = useCallback((key, field, value) => {
    setRows((prev) => prev.map((r) => (r._key === key ? { ...r, [field]: value } : r)));
    setError(null);
  }, []);

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

  const handleSave = () => {
    const filled = rows.filter((r) => r.name.trim());
    if (rows.length > 0 && filled.length === 0) {
      setError('Each chapter needs a name.'); return;
    }
    const withIds = filled.map((r, i) => ({
      id: r.id.trim() || `chapter${i + 1}`,
      name: r.name.trim(),
      tasks: r.tasks,
      notes: r.notes.trim(),
    }));
    // Check for duplicate IDs
    const ids = withIds.map((c) => c.id);
    if (new Set(ids).size !== ids.length) { setError('Chapter IDs must be unique.'); return; }
    onSave(withIds);
    onClose();
  };

  const thStyle = {
    padding: '6px 8px', fontSize: 11, fontWeight: 500, color: '#64748b',
    borderBottom: '0.5px solid #e2e8f0', whiteSpace: 'nowrap',
    background: '#f1f5f9', textAlign: 'left',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, backdropFilter: 'blur(3px)' }}>
      <div style={{ background: '#ffffff', borderRadius: 12, width: '90vw', maxWidth: 1100, minHeight: '70vh', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '0.5px solid #e2e8f0', background: '#ffffff' }}>
          <div>
            <span style={{ fontSize: 15, fontWeight: 500 }}>📖 Chapters</span>
            <span style={{ marginLeft: 10, fontSize: 12, color: '#64748b' }}>
              Group tasks into chapters. Tasks can belong to multiple chapters.
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, color: '#64748b', cursor: 'pointer', padding: '2px 6px', borderRadius: 4 }}>✕</button>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', background: '#ffffff' }}>
          {rows.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 180, color: '#94a3b8', gap: 12 }}>
              <span style={{ fontSize: 36 }}>📖</span>
              <span style={{ fontSize: 13 }}>No chapters yet. Click <strong>+ Add chapter</strong> below to get started.</span>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: 20 }}></th>
                  <th style={{ ...thStyle, width: 28 }}>#</th>
                  <th style={thStyle}>Chapter ID</th>
                  <th style={{ ...thStyle, minWidth: 140 }}>Name</th>
                  <th style={{ ...thStyle, minWidth: 140 }}>Included Tasks</th>
                  <th style={{ ...thStyle, minWidth: 180 }}>Notes</th>
                  <th style={{ ...thStyle, width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row._key}
                    onDragOver={(e) => { e.preventDefault(); if (dragOverKey !== row._key) setDragOverKey(row._key); }}
                    onDrop={(e) => { e.preventDefault(); if (dragKey) moveRow(dragKey, row._key); setDragKey(null); setDragOverKey(null); }}
                    style={{
                      borderBottom: '0.5px solid #e2e8f0',
                      background: dragOverKey === row._key && dragKey !== row._key ? '#dbeafe' : undefined,
                      opacity: dragKey === row._key ? 0.4 : 1,
                    }}
                    onMouseEnter={(e) => { if (!dragKey) e.currentTarget.style.background = '#f1f5f9'; }}
                    onMouseLeave={(e) => { if (!dragKey) e.currentTarget.style.background = ''; }}
                  >
                    {/* Drag handle */}
                    <td
                      draggable
                      onDragStart={(e) => { e.stopPropagation(); setDragKey(row._key); }}
                      onDragEnd={() => { setDragKey(null); setDragOverKey(null); }}
                      style={{ padding: '3px 2px', textAlign: 'center', cursor: 'grab', color: '#cbd5e1', fontSize: 13 }}
                      title="Drag to reorder"
                    >⠿</td>
                    <td style={{ padding: '3px 6px', fontSize: 11, color: '#64748b', textAlign: 'center' }}>{i + 1}</td>
                    <SimpleCell value={row.id} onChange={(v) => updateRow(row._key, 'id', v)} placeholder={`chapter${i + 1}`} />
                    <SimpleCell value={row.name} onChange={(v) => updateRow(row._key, 'name', v)} placeholder="Chapter name" />
                    <TasksCell
                      allTasks={allTasks}
                      selectedTaskIds={row.tasks}
                      onUpdate={(ids) => updateRow(row._key, 'tasks', ids)}
                    />
                    <SimpleCell value={row.notes} onChange={(v) => updateRow(row._key, 'notes', v)} placeholder="Optional notes…" />
                    <td style={{ padding: '3px 4px', whiteSpace: 'nowrap' }}>
                      <button
                        title="Duplicate chapter"
                        onClick={() => duplicateRow(row._key)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '2px 4px', borderRadius: 3, fontSize: 13 }}
                      >⧉</button>
                      <button
                        title="Delete chapter"
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
          )}

          <button
            onClick={addRow}
            style={{ width: '100%', padding: '9px', background: 'none', border: 'none', borderTop: '0.5px solid #e2e8f0', color: '#64748b', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            + Add chapter
          </button>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '0.5px solid #e2e8f0', background: '#ffffff' }}>
          <div style={{ fontSize: 12, color: error ? '#dc2626' : '#64748b' }}>
            {error ? `⚠ ${error}` : `${rows.filter(r => r.name.trim()).length} chapter${rows.filter(r => r.name.trim()).length === 1 ? '' : 's'} · ${allTasks.length} tasks available`}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={handleSave}>Apply & view diagram</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChapterEditor;
