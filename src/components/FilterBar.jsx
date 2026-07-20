import React, { useState, useEffect } from 'react';

const FilterBar = ({ activity, filters, onChange, onImport, onToolNotes, onChapters, onSaveJson, onLoadJson, searchQuery, onSearchChange }) => {
  const { responsibles, tools } = activity;

  // Local state so typing is always instant (no React state round-trip stutter)
  const [localSearch, setLocalSearch] = useState(searchQuery || '');

  // When the parent resets searchQuery to '' (e.g. on tab switch), mirror that here
  useEffect(() => {
    if (!searchQuery) setLocalSearch('');
  }, [searchQuery]);

  const handleSearchChange = (val) => {
    setLocalSearch(val);
    onSearchChange && onSearchChange(val);
  };

  const toggle = (type, key) => {
    const current = filters[type] || [];
    const next = current.includes(key)
      ? current.filter((k) => k !== key)
      : [...current, key];
    onChange({ ...filters, [type]: next });
  };

  const clearAll = () =>
    onChange({ responsibles: [], tools: [], chapters: [] });

  const hasFilters = filters.responsibles.length > 0 || filters.tools.length > 0 || (filters.chapters || []).length > 0;

  return (
    <div className="filter-bar">
      {/* Search box — uses local state so typing is always responsive */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f1f5f9', border: '1.5px solid #cbd5e1', borderRadius: 8, padding: '3px 10px', minWidth: 180, maxWidth: 240 }}>
        <span style={{ fontSize: 13, color: '#94a3b8', flexShrink: 0 }}>🔍</span>
        <input
          type="text"
          value={localSearch}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search tasks, tools…"
          style={{ border: 'none', background: 'none', outline: 'none', fontSize: 11, color: '#1e293b', width: '100%', fontFamily: 'inherit' }}
        />
        {localSearch && (
          <button onClick={() => handleSearchChange('')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 12, padding: 0, lineHeight: 1 }}>✕</button>
        )}
      </div>

      <div className="filter-divider" />

      {/* CHAPTER filter section — only visible when chapters exist */}
      {(activity.chapters || []).length > 0 && (
        <>
          <div className="filter-section">
            <span className="filter-label">CHAPTER</span>
            <div className="filter-chips">
              {(activity.chapters || []).map((ch) => {
                const active = (filters.chapters || []).includes(ch.id);
                return (
                  <button
                    key={ch.id}
                    className={`chip ${active ? 'chip-active chip-chapter-active' : 'chip-chapter'}`}
                    onClick={() => toggle('chapters', ch.id)}
                    title={ch.notes || ch.name}
                  >
                    <span className="chip-dot" style={{ backgroundColor: active ? '#7c3aed' : '#a78bfa' }} />
                    {ch.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="filter-divider" />
        </>
      )}

      <div className="filter-section">
        <span className="filter-label">RESPONSIBLE</span>
        <div className="filter-chips">
          {responsibles.map((r) => {
            const active = filters.responsibles.includes(r.key);
            return (
              <button
                key={r.key}
                className={`chip ${active ? 'chip-active' : ''}`}
                style={
                  active
                    ? { backgroundColor: r.taskColor, borderColor: r.borderColor, color: 'white' }
                    : { borderColor: r.borderColor, color: r.borderColor }
                }
                onClick={() => toggle('responsibles', r.key)}
              >
                <span
                  className="chip-dot"
                  style={{ backgroundColor: r.taskColor }}
                />
                {r.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="filter-divider" />

      <div className="filter-section">
        <span className="filter-label">TOOL</span>
        <div className="filter-chips">
          {tools.map((tool) => {
            const active = filters.tools.includes(tool);
            return (
              <button
                key={tool}
                className={`chip ${active ? 'chip-active chip-tool-active' : 'chip-tool'}`}
                onClick={() => toggle('tools', tool)}
              >
                {tool}
              </button>
            );
          })}
        </div>
      </div>

      {hasFilters && (
        <>
          <div className="filter-divider" />
          <button className="chip chip-clear" onClick={clearAll}>
            ✕ Clear filters
          </button>
        </>
      )}

      <div className="filter-spacer" />

      <button className="import-btn" style={{ marginRight: 6, background: '#059669' }} onClick={onSaveJson} title="Download complete workflow state including tasks, layout, and chapters to a JSON file">
        ⬇ Save JSON
      </button>
      <label className="import-btn" style={{ marginRight: 6, background: '#059669', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }} title="Load a workflow JSON file">
        ⬆ Load JSON
        <input type="file" accept=".json" onChange={onLoadJson} style={{ display: 'none' }} />
      </label>
      <button className="import-btn" style={{ marginRight: 6 }} onClick={onToolNotes}>
        ☰ Tool notes
      </button>
      <button className="import-btn" style={{ marginRight: 6, background: '#6d28d9' }} onClick={onChapters}>
        📖 Chapters
      </button>
      <button className="import-btn" onClick={onImport}>
        ✎ Edit tasks
      </button>
    </div>
  );
};

export default FilterBar;