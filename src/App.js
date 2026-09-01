import React, { useState, useCallback } from 'react';
import './App.css';
import defaultData from './data/workflow.json';
import WorkflowCanvas from './components/WorkflowCanvas';
import FilterBar from './components/FilterBar';
import TaskEditor from './components/TaskEditor';
import ChapterEditor from './components/ChapterEditor';
import ActivityLinksView from './components/ActivityLinksView';
import SequenceCanvas from './components/SequenceCanvas';
import { loadAppState, clearAppState, useAutoSave } from './useWorkflowPersistence';
import FeedbackViewerModal from './components/FeedbackViewerModal';

// ── Bulk tool notes editor modal ──────────────────────────────────────────────
const ToolNotesEditor = ({ tools, toolNotes, onChange, onClose }) => {
  const [draft, setDraft] = useState({ ...toolNotes });

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      // Normalize line endings to avoid issues with CRLF vs LF
      const textContent = ev.target.result.replace(/\r\n/g, '\n');
      const sections = textContent.split(/\n---\n/);
      const parsed = {};
      sections.forEach((section) => {
        const match = section.trim().match(/^##\s+(.+)\n([\s\S]*)/);
        if (match) {
          const tool = match[1].trim();
          const text = match[2].trim();
          if (text && text !== '(no notes)') parsed[tool] = text;
        }
      });
      setDraft((prev) => {
        const next = { ...prev };
        Object.keys(parsed).forEach((tool) => {
          if (next[tool] && next[tool].trim() !== '') {
            next[tool] = next[tool] + '\n\n' + parsed[tool];
          } else {
            next[tool] = parsed[tool];
          }
        });
        return next;
      });
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
            <button className="btn-secondary" onClick={() => { if (window.confirm('Clear all notes?')) setDraft({}); }} style={{ color: '#ef4444' }}>Clear All</button>
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={() => { onChange(draft); onClose(); }}>Save notes</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Import Choice Modal ────────────────────────────────────────────────────────
const ImportChoiceModal = ({ pendingImport, onJoin, onReplace, onClose }) => {
  const { totalFiles, totalStages, totalSequences } = pendingImport;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, backdropFilter: 'blur(3px)' }} onClick={onClose}>
      <div style={{ background: '#ffffff', borderRadius: 12, width: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '0.5px solid #e2e8f0', background: '#f8fafc' }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1e293b' }}>Import JSON Workflow</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, color: '#64748b', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ padding: '20px' }}>
          <p style={{ fontSize: 13, color: '#334155', margin: '0 0 16px', lineHeight: '1.5' }}>
            Ready to import <strong>{totalStages} stage{totalStages === 1 ? '' : 's'}</strong>{totalSequences > 0 && <> and <strong>{totalSequences} sequence{totalSequences === 1 ? '' : 's'}</strong></>} across <strong>{totalFiles} file{totalFiles === 1 ? '' : 's'}</strong>. How would you like to load this data?
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              onClick={onJoin}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderRadius: '8px', border: '1.5px solid #2563eb', background: '#eff6ff', color: '#1e40af', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#dbeafe'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#eff6ff'}
            >
              <span style={{ fontSize: '20px' }}>➕</span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700 }}>Add as new tab(s) (Recommended)</div>
                <div style={{ fontSize: '11px', color: '#3b82f6', marginTop: '2px' }}>Appends stages and sequences as new tabs alongside your current diagram. New sequences and hidden tasks are merged by ID — existing ones are preserved.</div>
              </div>
            </button>

            <button
              onClick={onReplace}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderRadius: '8px', border: '1.5px solid #cbd5e1', background: '#f8fafc', color: '#334155', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.background = '#fef2f2'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#f8fafc'; }}
            >
              <span style={{ fontSize: '20px' }}>🔄</span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#b91c1c' }}>Replace entire workspace</div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Overwrites all current stages, sequences, and hidden tasks and replaces your entire workspace with the imported file(s).</div>
              </div>
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 20px', borderTop: '0.5px solid #e2e8f0', background: '#f8fafc' }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

// ── Alt Tools Modal ────────────────────────────────────────────────────────────
const AltToolsModal = ({ workflowData, onClose }) => {
  const tasksByTool = {};
  
  const allTasks = [];
  (workflowData.activities || []).forEach(act => {
    (act.tasks || []).forEach(t => allTasks.push({ ...t, stageName: act.name }));
  });
  (workflowData.hiddenTasks || []).forEach(t => allTasks.push({ ...t, stageName: 'Hidden Tasks' }));

  allTasks.forEach(task => {
    if (task.alternativeTools && task.alternativeTools.length > 0) {
      const tool = task.tool || 'Unassigned Tool';
      if (!tasksByTool[tool]) tasksByTool[tool] = [];
      tasksByTool[tool].push(task);
    }
  });

  const tools = Object.keys(tasksByTool).sort();

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, backdropFilter: 'blur(3px)' }} onClick={onClose}>
      <div style={{ background: '#ffffff', borderRadius: 12, width: 600, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '0.5px solid #e2e8f0', background: '#f8fafc' }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1e293b' }}>Alternative Tools Compilation</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, color: '#64748b', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {tools.length === 0 ? (
            <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', margin: '40px 0' }}>No alternative tools proposed in any task.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {tools.map(tool => (
                <div key={tool}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: 15, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ padding: '4px 8px', background: '#eff6ff', color: '#1d4ed8', borderRadius: 6, fontSize: 13, border: '1px solid #bfdbfe' }}>{tool}</span>
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {tasksByTool[tool].map((task, i) => (
                      <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px', background: '#f8fafc' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <strong style={{ fontSize: 14, color: '#334155' }}>{task.name}</strong>
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>{task.stageName}</span>
                        </div>
                        <div style={{ fontSize: 13, color: '#475569', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                          <span style={{ fontWeight: 600, color: '#059669', flexShrink: 0 }}>Alternatives:</span>
                          <span style={{ lineHeight: 1.4 }}>{task.alternativeTools.join(', ')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 20px', borderTop: '0.5px solid #e2e8f0', background: '#f8fafc' }}>
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

// ── App ───────────────────────────────────────────────────────────────────────
const App = () => {
  const saved = loadAppState();

  const [workflowData, setWorkflowData] = useState(saved?.workflowData || defaultData);
  const [activeActivityIndex, setActiveActivityIndex] = useState(saved?.activeActivityIndex || 0);
  const [filters, setFilters] = useState(saved?.filters || { responsibles: [], tools: [], chapters: [] });
  const [searchQuery, setSearchQuery] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [showChapterEditor, setShowChapterEditor] = useState(false);
  const [showToolNotes, setShowToolNotes] = useState(false);
  const [showLinks, setShowLinks] = useState(saved?.showLinks || false);
  const [showAltTools, setShowAltTools] = useState(false);
  const [activeSequenceId, setActiveSequenceId] = useState(null);
  // toolNotes: { [toolName]: string } — shared across all activities
  const [toolNotes, setToolNotes] = useState(saved?.toolNotes || {});
  // docPositions: { [activityId]: { [docId]: { x, y } } } — per-activity drag layout
  const [docPositions, setDocPositions] = useState(saved?.docPositions || {});
  // archPositions: { [activityId]: { [toolName]: { x, y } } } — per-activity architecture layout
  const [archPositions, setArchPositions] = useState(saved?.archPositions || {});
  // edgeSides: { [activityId]: { [edgeKey]: { from, to } } } — per-activity edge port sides
  const [edgeSides, setEdgeSides] = useState(saved?.edgeSides || {});
  // feedbackItems: array of imported reviewer comments
  const [feedbackItems, setFeedbackItems] = useState(saved?.feedbackItems || []);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [pendingImport, setPendingImport] = useState(null);
  const [activeVariant, setActiveVariant] = useState(saved?.activeVariant || 'option_1');
  const [activeToolSetting, setActiveToolSetting] = useState(saved?.activeToolSetting || 'setting_1');

  useAutoSave({ workflowData, activeActivityIndex, filters, showLinks, toolNotes, docPositions, archPositions, edgeSides, feedbackItems, activeVariant, activeToolSetting });

  const activities = workflowData.activities || [];
  const activity = activities[activeActivityIndex];

  const handleDocPositionsChange = useCallback((activityId, positions) => {
    setDocPositions((prev) => {
      if (!positions) {
        const next = { ...prev };
        delete next[activityId];
        return next;
      }
      return { ...prev, [activityId]: positions };
    });
  }, []);

  const handleArchPositionsChange = useCallback((activityId, positions) => {
    setArchPositions((prev) => {
      if (!positions) {
        const next = { ...prev };
        delete next[activityId];
        return next;
      }
      return { ...prev, [activityId]: positions };
    });
  }, []);

  const handleEdgeSidesChange = useCallback((activityId, sides) => {
    setEdgeSides((prev) => {
      if (!sides) {
        const next = { ...prev };
        delete next[activityId];
        return next;
      }
      return { ...prev, [activityId]: sides };
    });
  }, []);

  const handleVariantNamesChange = useCallback((names) => {
    setWorkflowData((prev) => ({ ...prev, variantNames: { ...(prev.variantNames || {}), ...names } }));
  }, []);

  const handleToolSettingNamesChange = useCallback((names) => {
    setWorkflowData((prev) => ({ ...prev, toolSettingNames: { ...(prev.toolSettingNames || {}), ...names } }));
  }, []);

  const handleResetSession = () => {
    if (!window.confirm('Clear saved layout, notes, and loaded data? This cannot be undone.')) return;
    clearAppState();
    setWorkflowData(defaultData);
    setActiveActivityIndex(0);
    setFilters({ responsibles: [], tools: [], chapters: [] });
    setShowLinks(false);
    setToolNotes({});
    setDocPositions({});
    setArchPositions({});
    setEdgeSides({});
    setFeedbackItems([]);
  };

  // Save chapters for the current activity into workflowData
  const handleSaveChapters = (chapters) => {
    setWorkflowData((prev) => ({
      ...prev,
      activities: prev.activities.map((act, i) =>
        i === activeActivityIndex ? { ...act, chapters } : act
      ),
    }));
    // Reset chapter filter so user sees full diagram first
    setFilters((f) => ({ ...f, chapters: [] }));
  };

  const handleSaveJson = () => {
    // Ensure activities always have at least a clean chapters array in the exported JSON
    const cleanData = {
      ...workflowData,
      activities: (workflowData.activities || []).map((act) => ({
        ...act,
        chapters: Array.isArray(act.chapters) ? act.chapters : []
      }))
    };
    const data = JSON.stringify(cleanData, null, 2);
    const a = document.createElement('a');
    a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(data);
    a.download = 'workflow.json';
    a.click();
  };

  const handleLoadJson = async (e) => {
    const files = Array.from(e.target.files);
    if (!files || files.length === 0) return;

    const readPromises = files.map((file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const parsed = JSON.parse(ev.target.result);
          resolve(parsed);
        } catch (err) {
          reject(new Error(`Failed to parse ${file.name}: ${err.message}`));
        }
      };
      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
      reader.readAsText(file);
    }));

    try {
      const parsedFiles = await Promise.all(readPromises);
      const validPayloads = [];
      let totalStages = 0;
      let totalSequences = 0;
      for (const parsed of parsedFiles) {
        if (!parsed.activities || !Array.isArray(parsed.activities)) {
          alert('Invalid JSON file skipped: missing "activities" array.');
          continue;
        }
        const cleanedActivities = parsed.activities.map((act) => ({
          ...act,
          chapters: Array.isArray(act.chapters) ? act.chapters : []
        }));
        validPayloads.push({ ...parsed, activities: cleanedActivities });
        totalStages += cleanedActivities.length;
        totalSequences += (parsed.sequences || []).length;
      }
      if (validPayloads.length === 0) return;

      setPendingImport({
        payloads: validPayloads,
        totalFiles: validPayloads.length,
        totalStages,
        totalSequences
      });
    } catch (err) {
      alert(err.message);
    } finally {
      e.target.value = '';
    }
  };

  const handleJoinImport = () => {
    if (!pendingImport) return;
    const prevActivities = workflowData.activities || [];
    const newActivities = [...prevActivities];
    const newNotes = { ...toolNotes };
    const newDocPos = { ...docPositions };
    const newArchPos = { ...archPositions };
    const newEdgeSides = { ...edgeSides };
    // Merge sequences and hiddenTasks by ID so existing entries are preserved.
    const existingSeqIds = new Set((workflowData.sequences || []).map(s => s.id));
    const newSequences = [...(workflowData.sequences || [])];
    const existingHiddenIds = new Set((workflowData.hiddenTasks || []).map(t => t.id));
    const newHiddenTasks = [...(workflowData.hiddenTasks || [])];

    const firstNewIndex = prevActivities.length;

    pendingImport.payloads.forEach((payload) => {
      Object.assign(newNotes, payload.toolNotes || {});

      // Merge sequences — skip those whose ID already exists
      (payload.sequences || []).forEach((seq) => {
        if (!existingSeqIds.has(seq.id)) {
          existingSeqIds.add(seq.id);
          newSequences.push(seq);
        }
      });

      // Merge hiddenTasks — skip those whose ID already exists
      (payload.hiddenTasks || []).forEach((t) => {
        if (!existingHiddenIds.has(t.id)) {
          existingHiddenIds.add(t.id);
          newHiddenTasks.push(t);
        }
      });

      payload.activities.forEach((act) => {
        const oldId = act.id || `stage-${Date.now()}`;
        let newId = oldId;
        let newName = act.name || 'Stage';

        if (newActivities.some(a => a.id === newId)) {
          newId = `${oldId}-imported-${Math.random().toString(36).substring(2, 7)}`;
        }
        if (newActivities.some(a => a.name === newName)) {
          let c = 2;
          while (newActivities.some(a => a.name === `${newName} (${c})`)) c++;
          newName = `${newName} (${c})`;
        }

        if (payload.docPositions?.[oldId]) newDocPos[newId] = payload.docPositions[oldId];
        if (payload.toolPositions?.[oldId]) newArchPos[newId] = payload.toolPositions[oldId];
        if (payload.edgeSides?.[oldId]) newEdgeSides[newId] = payload.edgeSides[oldId];

        newActivities.push({ ...act, id: newId, name: newName });
      });
    });

    setWorkflowData((prev) => ({
      ...prev,
      activities: newActivities,
      sequences: newSequences,
      hiddenTasks: newHiddenTasks,
      toolNotes: newNotes,
      docPositions: newDocPos,
      toolPositions: newArchPos,
      edgeSides: newEdgeSides
    }));
    setToolNotes(newNotes);
    setDocPositions(newDocPos);
    setArchPositions(newArchPos);
    setEdgeSides(newEdgeSides);
    setActiveActivityIndex(firstNewIndex);
    setFilters({ responsibles: [], tools: [], chapters: [] });
    setPendingImport(null);
  };

  const handleReplaceImport = () => {
    if (!pendingImport) return;
    const combinedActivities = [];
    const combinedNotes = {};
    const combinedDocPos = {};
    const combinedArchPos = {};
    const combinedEdgeSides = {};
    // Collect sequences and hiddenTasks from all imported files, de-duped by ID.
    const seenSeqIds = new Set();
    const combinedSequences = [];
    const seenHiddenIds = new Set();
    const combinedHiddenTasks = [];

    pendingImport.payloads.forEach((payload) => {
      Object.assign(combinedNotes, payload.toolNotes || {});

      // Collect sequences
      (payload.sequences || []).forEach((seq) => {
        if (!seenSeqIds.has(seq.id)) {
          seenSeqIds.add(seq.id);
          combinedSequences.push(seq);
        }
      });

      // Collect hiddenTasks
      (payload.hiddenTasks || []).forEach((t) => {
        if (!seenHiddenIds.has(t.id)) {
          seenHiddenIds.add(t.id);
          combinedHiddenTasks.push(t);
        }
      });

      payload.activities.forEach((act) => {
        const oldId = act.id || `stage-${Date.now()}`;
        let actId = oldId;
        let actName = act.name || 'Stage';
        if (combinedActivities.some(a => a.id === actId)) {
          actId = `${actId}-${Math.random().toString(36).substring(2, 6)}`;
        }
        if (combinedActivities.some(a => a.name === actName)) {
          let c = 2;
          while (combinedActivities.some(a => a.name === `${actName} (${c})`)) c++;
          actName = `${actName} (${c})`;
        }

        if (payload.docPositions?.[oldId]) combinedDocPos[actId] = payload.docPositions[oldId];
        if (payload.toolPositions?.[oldId]) combinedArchPos[actId] = payload.toolPositions[oldId];
        if (payload.edgeSides?.[oldId]) combinedEdgeSides[actId] = payload.edgeSides[oldId];

        combinedActivities.push({ ...act, id: actId, name: actName });
      });
    });

    setWorkflowData({
      activities: combinedActivities,
      sequences: combinedSequences,
      hiddenTasks: combinedHiddenTasks,
      toolNotes: combinedNotes,
      docPositions: combinedDocPos,
      toolPositions: combinedArchPos,
      edgeSides: combinedEdgeSides
    });
    setToolNotes(combinedNotes);
    setDocPositions(combinedDocPos);
    setArchPositions(combinedArchPos);
    setEdgeSides(combinedEdgeSides);
    setActiveActivityIndex(0);
    setFilters({ responsibles: [], tools: [], chapters: [] });
    setPendingImport(null);
  };

  const handleSave = (newData, activityIdMap) => {
    if (activityIdMap && Object.keys(activityIdMap).length > 0) {
      // A stage was renamed, which changes its derived id. Migrate any
      // layout/notes data that was keyed by the old id so it isn't orphaned.
      setDocPositions((prev) => {
        const next = { ...prev };
        Object.entries(activityIdMap).forEach(([oldId, newId]) => {
          if (next[oldId] && !next[newId]) {
            next[newId] = next[oldId];
            delete next[oldId];
          }
        });
        return next;
      });
      setArchPositions((prev) => {
        const next = { ...prev };
        Object.entries(activityIdMap).forEach(([oldId, newId]) => {
          if (next[oldId] && !next[newId]) {
            next[newId] = next[oldId];
            delete next[oldId];
          }
        });
        return next;
      });
      setEdgeSides((prev) => {
        const next = { ...prev };
        Object.entries(activityIdMap).forEach(([oldId, newId]) => {
          if (next[oldId] && !next[newId]) {
            next[newId] = next[oldId];
            delete next[oldId];
          }
        });
        return next;
      });
      Object.entries(activityIdMap).forEach(([oldId, newId]) => {
        try {
          const oldKey = `arch_positions_${oldId}`;
          const newKey = `arch_positions_${newId}`;
          const saved = localStorage.getItem(oldKey);
          if (saved && !localStorage.getItem(newKey)) {
            localStorage.setItem(newKey, saved);
          }
          localStorage.removeItem(oldKey);
        } catch { /* ignore storage errors */ }
      });
    }
    setWorkflowData(newData);
    // If activeSequenceId is set, ensure it still exists in the saved sequences
    if (activeSequenceId) {
      const stillExists = (newData.sequences || []).some(s => s.id === activeSequenceId || s.name === activeSequenceId);
      if (!stillExists) {
        setActiveSequenceId(newData.sequences?.[0]?.id || null);
      }
    }
    setActiveActivityIndex(0);
    setFilters({ responsibles: [], tools: [], chapters: [] });
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

  const isLinksViewActive = showLinks && activities.length > 1;

  return (
    <div className="workflow-d3-container">
      {/* Floating Buttons Group (Bottom Left) */}
      <div style={{ position: 'fixed', bottom: 24, left: 24, zIndex: 3000, display: 'flex', gap: 12 }}>
        {workflowData.sequences && workflowData.sequences.length > 0 && (
          <button
            onClick={() => {
              if (activeSequenceId) {
                setActiveSequenceId(null);
              } else {
                setActiveSequenceId(workflowData.sequences[0].id);
                setShowLinks(false);
                setFilters({ responsibles: [], tools: [], chapters: [] });
              }
            }}
            style={{
              padding: '10px 16px', background: activeSequenceId ? '#2563eb' : '#ffffff',
              color: activeSequenceId ? '#ffffff' : '#1e293b',
              border: `1.5px solid ${activeSequenceId ? '#2563eb' : '#cbd5e1'}`,
              borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', cursor: 'pointer',
              fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s'
            }}
          >
            <span style={{ fontSize: 16 }}>📚</span> {activeSequenceId ? 'Exit Sequences' : 'Sequences View'}
          </button>
        )}
        <button
          onClick={() => setShowAltTools(true)}
          style={{
            padding: '10px 16px', background: showAltTools ? '#059669' : '#ffffff',
            color: showAltTools ? '#ffffff' : '#1e293b',
            border: `1.5px solid ${showAltTools ? '#059669' : '#cbd5e1'}`,
            borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', cursor: 'pointer',
            fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s'
          }}
          title="View alternative tools proposed across the workflow"
        >
          <span style={{ fontSize: 16 }}>💡</span> Alternative Tools
        </button>
      </div>

      {showAltTools && (
        <AltToolsModal workflowData={workflowData} onClose={() => setShowAltTools(false)} />
      )}

      <div className="activity-tabs">
        {activeSequenceId ? (
          <>
            {(workflowData.sequences || []).map((seq) => (
              <button
                key={seq.id}
                className={`activity-tab ${seq.id === activeSequenceId ? 'active' : ''}`}
                onClick={() => setActiveSequenceId(seq.id)}
              >
                {seq.name}
              </button>
            ))}
            <button
              className="activity-tab"
              onClick={() => setActiveSequenceId(null)}
              style={{ marginLeft: 'auto', color: '#64748b' }}
            >
              ← Back to Stages
            </button>
          </>
        ) : (
          <>
            {activities.length > 1 && activities.map((act, i) => (
              <button
                key={act.id}
                className={`activity-tab ${!isLinksViewActive && i === activeActivityIndex ? 'active' : ''}`}
                onClick={() => { setActiveActivityIndex(i); setFilters({ responsibles: [], tools: [] }); setShowLinks(false); setSearchQuery(''); }}
              >
                {act.name}
              </button>
            ))}
            {activities.length > 1 && (
              <button
                className={`activity-tab ${isLinksViewActive ? 'active' : ''}`}
                onClick={() => setShowLinks(true)}
              >
                Activity links
              </button>
            )}
          </>
        )}
        <button
          className="activity-tab"
          onClick={() => setShowFeedbackModal(true)}
          style={{ marginLeft: 'auto', color: '#1e40af', background: feedbackItems.length > 0 ? '#eff6ff' : undefined, fontWeight: 600, border: '1px solid #bfdbfe', borderRadius: '6px', padding: '4px 12px' }}
        >
          💬 Feedback {feedbackItems.length > 0 && <span style={{ background: '#2563eb', color: '#fff', borderRadius: '10px', padding: '1px 6px', fontSize: '10px', marginLeft: '6px' }}>{feedbackItems.length}</span>}
        </button>
        <button
          className="activity-tab"
          title="Clear saved session and reload default data"
          onClick={handleResetSession}
          style={{ color: '#94a3b8' }}
        >
          ↺ Reset session
        </button>
      </div>

      {!isLinksViewActive && !activeSequenceId && (
        <FilterBar
          activity={activity}
          filters={filters}
          onChange={setFilters}
          onImport={() => setShowEditor(true)}
          onToolNotes={() => setShowToolNotes(true)}
          onChapters={() => setShowChapterEditor(true)}
          onSaveJson={handleSaveJson}
          onLoadJson={handleLoadJson}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeVariant={activeVariant}
          activeToolSetting={activeToolSetting}
        />
      )}

      <div className="svg-container">
        {activeSequenceId ? (
          <SequenceCanvas
            activeSequenceId={activeSequenceId}
            workflowData={workflowData}
            filters={filters}
            toolNotes={toolNotes}
            onToolNoteChange={handleToolNoteChange}
            onFilterChange={setFilters}
            docPositions={docPositions[`seq_${activeSequenceId}`] || {}}
            onDocPositionsChange={(pos) => handleDocPositionsChange(`seq_${activeSequenceId}`, pos)}
            archPositions={archPositions[`seq_${activeSequenceId}`] || {}}
            onArchPositionsChange={(pos) => handleArchPositionsChange(`seq_${activeSequenceId}`, pos)}
            edgeSides={edgeSides[`seq_${activeSequenceId}`] || {}}
            onEdgeSidesChange={(sides) => handleEdgeSidesChange(`seq_${activeSequenceId}`, sides)}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onEditTasks={() => setShowEditor(true)}
            onToolNotes={() => setShowToolNotes(true)}
            activeVariant={activeVariant}
            setActiveVariant={setActiveVariant}
            activeToolSetting={activeToolSetting}
            setActiveToolSetting={setActiveToolSetting}
            onToolSettingNamesChange={handleToolSettingNamesChange}
            onSaveJson={handleSaveJson}
            onLoadJson={handleLoadJson}
          />
        ) : isLinksViewActive ? (
          <ActivityLinksView activities={activities} onEditTasks={() => setShowEditor(true)} />
        ) : (
          <WorkflowCanvas
            activity={activity}
            filters={filters}
            toolNotes={toolNotes}
            onToolNoteChange={handleToolNoteChange}
            onFilterChange={setFilters}
            docPositions={docPositions[activity.id]}
            onDocPositionsChange={(positions) => handleDocPositionsChange(activity.id, positions)}
            archPositions={archPositions[activity.id]}
            onArchPositionsChange={(positions) => handleArchPositionsChange(activity.id, positions)}
            allArchPositions={archPositions}
            edgeSides={edgeSides[activity.id]}
            onEdgeSidesChange={(sides) => handleEdgeSidesChange(activity.id, sides)}
            allEdgeSides={edgeSides}
            workflowData={workflowData}
            activeActivityIndex={activeActivityIndex}
            searchQuery={searchQuery}
            onNavigateToSequence={(seqId) => {
              setActiveSequenceId(seqId);
              setShowLinks(false);
              setFilters({ responsibles: [], tools: [], chapters: [] });
            }}
            activeVariant={activeVariant}
            setActiveVariant={setActiveVariant}
            onVariantNamesChange={handleVariantNamesChange}
            activeToolSetting={activeToolSetting}
            setActiveToolSetting={setActiveToolSetting}
            onToolSettingNamesChange={handleToolSettingNamesChange}
          />
        )}
      </div>

      {showEditor && (
        <TaskEditor
          workflowData={workflowData}
          onSave={handleSave}
          onClose={() => setShowEditor(false)}
          initialTabMode={activeSequenceId ? 'sequences' : 'stages'}
          initialSequenceId={activeSequenceId}
        />
      )}

      {showChapterEditor && (
        <ChapterEditor
          activity={activity}
          onSave={handleSaveChapters}
          onClose={() => setShowChapterEditor(false)}
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

      {showFeedbackModal && (
        <FeedbackViewerModal
          isOpen={showFeedbackModal}
          onClose={() => setShowFeedbackModal(false)}
          feedbackItems={feedbackItems}
          onImportFeedback={(newItems) => setFeedbackItems((prev) => [...prev, ...newItems])}
          onDeleteComment={(id) => setFeedbackItems((prev) => prev.filter(c => c.id !== id))}
          onClearAll={() => { if (window.confirm('Clear all imported feedback?')) setFeedbackItems([]); }}
          workflowData={workflowData}
        />
      )}

      {pendingImport && (
        <ImportChoiceModal
          pendingImport={pendingImport}
          onJoin={handleJoinImport}
          onReplace={handleReplaceImport}
          onClose={() => setPendingImport(null)}
        />
      )}
    </div>
  );
};

export default App;