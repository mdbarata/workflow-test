import React from 'react';

const FilterBar = ({ activity, filters, onChange, onImport }) => {
  const { responsibles, tools } = activity;

  const toggle = (type, key) => {
    const current = filters[type];
    const next = current.includes(key)
      ? current.filter((k) => k !== key)
      : [...current, key];
    onChange({ ...filters, [type]: next });
  };

  const clearAll = () =>
    onChange({ responsibles: [], tools: [] });

  const hasFilters = filters.responsibles.length > 0 || filters.tools.length > 0;

  return (
    <div className="filter-bar">
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

      <button className="import-btn" onClick={onImport}>
        ↑ Import JSON
      </button>
    </div>
  );
};

export default FilterBar;
