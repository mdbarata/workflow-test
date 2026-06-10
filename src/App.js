import React, { useState } from 'react';
import './App.css';
import defaultData from './data/workflow.json';
import WorkflowCanvas from './components/WorkflowCanvas';
import FilterBar from './components/FilterBar';
import TaskEditor from './components/TaskEditor';

// ── Bulk tool notes editor modal ──────────────────────────────────────────────
const ToolNotesEditor = ({ tools, toolNotes, onChange, onClose }) => {
  const [draft, setDraft] = useState({ ...toolNotes });

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const sections = ev.target.result.split(/\n---\n/);
      const parsed = {};
      sections.forEach((section) => {
        const match = section.match(/^##\s+(.+)\n([\s\S]*)/);
        if (match) {
          const tool = match[1].trim();
          const text = match[2].replace(/^\n/, '').replace(/\n$/, '').trim();
          if (text && text !== '(no notes)') parsed[tool] = text;
        }
      });
      setDraft((prev) => ({ ...prev, ...parsed }));
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExport = () => {
    const lines = tools.map((t) => `## ${t}\n\n${draft[t] || '(no notes)'}\n`).join('\n---\n\n');
    const blob = new Blob([lines], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tool-notes.md';
    a.click();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 2000, backdropFilter: 'blur(3px)',
    }} onClick={onClose}>
      <div style={{
        background: '#ffffff', borderRadius: 12, width: 640,
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden',
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '0.5px solid #e2e8f0', background: '#ffffff' }}>
          <span style={{ fontSize: 15, fontWeight: 500 }}>Tool notes</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, color: '#64748b', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16, background: '#ffffff' }}>
          {tools.map((tool) => (
            <div key={tool}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#1d4ed8', marginBottom: 6 }}>{tool}</label>
              <textarea
                value={draft[tool] || ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, [tool]: e.target.value }))}
                placeholder={`Notes about ${tool}…`}
                style={{
                  width: '100%', height: 80, fontSize: 12, padding: '8px 10px',
                  border: '1px solid #e2e8f0', borderRadius: 6, resize: 'vertical',
                  fontFamily: 'system-ui, sans-serif', color: '#1e293b', background: '#f8fafc',
                }}
              />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderTop: '0.5px solid #e2e8f0', background: '#ffffff' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" onClick={handleExport}>↓ Export as Markdown</button>
            <label className="btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
              ↑ Import Markdown
              <input type="file" accept=".md,.txt" onChange={handleImport} style={{ display: 'none' }} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={() => { onChange(draft); onClose(); }}>Save notes</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── App ───────────────────────────────────────────────────────────────────────
const App = () => {
  const [workflowData, setWorkflowData] = useState(defaultData);
  const [activeActivityIndex, setActiveActivityIndex] = useState(0);
  const [filters, setFilters] = useState({ responsibles: [], tools: [] });
  const [showEditor, setShowEditor] = useState(false);
  const [showToolNotes, setShowToolNotes] = useState(false);
  // toolNotes: { [toolName]: string } — shared across all activities
  const [toolNotes, setToolNotes] = useState({});

  const activities = workflowData.activities || [];
  const activity = activities[activeActivityIndex];

  const handleSave = (newData) => {
    setWorkflowData(newData);
    setActiveActivityIndex(0);
    setFilters({ responsibles: [], tools: [] });
  };

  const handleToolNoteChange = (tool, text) => {
    setToolNotes((prev) => ({ ...prev, [tool]: text }));
  };

  if (!activity) {
    return (
      <div className="workflow-d3-container">
        <p style={{ color: '#ef4444', padding: '20px' }}>
          No activity found. Use "Edit tasks" to add one.
        </p>
      </div>
    );
  }

  return (
    <div className="workflow-d3-container">
      {activities.length > 1 && (
        <div className="activity-tabs">
          {activities.map((act, i) => (
            <button
              key={act.id}
              className={`activity-tab ${i === activeActivityIndex ? 'active' : ''}`}
              onClick={() => { setActiveActivityIndex(i); setFilters({ responsibles: [], tools: [] }); }}
            >
              {act.name}
            </button>
          ))}
        </div>
      )}

      <FilterBar
        activity={activity}
        filters={filters}
        onChange={setFilters}
        onImport={() => setShowEditor(true)}
        onToolNotes={() => setShowToolNotes(true)}
      />

      <div className="svg-container">
        <WorkflowCanvas
          activity={activity}
          filters={filters}
          toolNotes={toolNotes}
          onToolNoteChange={handleToolNoteChange}
          onFilterChange={setFilters}
        />
      </div>

      {showEditor && (
        <TaskEditor
          workflowData={workflowData}
          onSave={handleSave}
          onClose={() => setShowEditor(false)}
        />
      )}

      {showToolNotes && (
        <ToolNotesEditor
          tools={activity.tools}
          toolNotes={toolNotes}
          onChange={setToolNotes}
          onClose={() => setShowToolNotes(false)}
        />
      )}
    </div>
  );
};

export default App;
