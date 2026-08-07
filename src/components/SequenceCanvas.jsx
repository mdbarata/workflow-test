import React, { useMemo, useState } from 'react';
import WorkflowCanvas from './WorkflowCanvas';
import FilterBar from './FilterBar';

const SequenceCanvas = ({
  activeSequenceId,
  workflowData,
  filters,
  toolNotes,
  onToolNoteChange,
  onFilterChange,
  docPositions,
  onDocPositionsChange,
  archPositions,
  onArchPositionsChange,
  edgeSides,
  onEdgeSidesChange,
  searchQuery,
  onSearchChange,
  onEditTasks,
  onToolNotes
}) => {
  const sequenceActivity = useMemo(() => {
    if (!activeSequenceId || !workflowData) return null;
    
    // Aggregating all tasks that belong to this sequence
    const sequenceTasks = [];
    const parentTasks = [];
    (workflowData.activities || []).forEach(act => {
      (act.tasks || []).forEach(t => {
        if ((t.sequences || []).includes(activeSequenceId)) {
          if (t.isSequenceParent) {
            parentTasks.push({ ...t, activityName: act.name });
          } else {
            sequenceTasks.push(t);
          }
        }
      });
    });
    (workflowData.hiddenTasks || []).forEach(t => {
      if ((t.sequences || []).includes(activeSequenceId)) {
        if (t.isSequenceParent) {
          parentTasks.push({ ...t, activityName: 'Hidden Tasks' });
        } else {
          sequenceTasks.push(t);
        }
      }
    });

    // Compute unique tools, responsibles, documents used by these tasks
    const toolsSet = new Set();
    const respSet = new Set();
    const inputDocIds = new Set();
    const outputDocIds = new Set();

    [...sequenceTasks, ...parentTasks].forEach(t => {
      if (t.tool) toolsSet.add(t.tool);
      if (t.responsible) respSet.add(t.responsible);
      (t.inputs || []).forEach(id => inputDocIds.add(id));
      (t.outputs || []).forEach(id => outputDocIds.add(id));
    });
    const allDocIds = new Set([...inputDocIds, ...outputDocIds]);

    // Build a global document map from all activities AND hiddenTasks
    const globalDocMap = {};
    (workflowData.activities || []).forEach(act => {
      (act.documents || []).forEach(d => {
        if (!globalDocMap[d.id]) globalDocMap[d.id] = d;
      });
    });
    // hiddenTasks don't have a documents array — reconstruct entries from task data
    (workflowData.hiddenTasks || []).forEach(t => {
      (t.inputs || []).forEach(id => {
        if (!globalDocMap[id]) globalDocMap[id] = { id, name: id, type: 'input' };
      });
      (t.outputs || []).forEach(id => {
        if (!globalDocMap[id]) globalDocMap[id] = { id, name: id, type: 'output' };
      });
    });

    // Gather global definitions
    const globalResponsibles = [];
    const globalDocs = [];
    (workflowData.activities || []).forEach(act => {
      (act.responsibles || []).forEach(r => {
        if (respSet.has(r.key) && !globalResponsibles.find(x => x.key === r.key)) globalResponsibles.push(r);
      });
    });

    // Collect documents referenced by the sequence tasks, preserving their
    // type as stored (or deriving it from usage if not found in globalDocMap).
    // WorkflowCanvas now checks both t.inputs and t.outputs regardless of doc.type,
    // so we don't need to duplicate docs used in both directions.
    allDocIds.forEach(id => {
      if (globalDocMap[id]) {
        const isUsedAsInput = inputDocIds.has(id);
        globalDocs.push({ ...globalDocMap[id], type: isUsedAsInput ? 'input' : 'output' });
      } else {
        // Fallback: doc not found in any activity's document list
        const isInput = inputDocIds.has(id) && !outputDocIds.has(id);
        globalDocs.push({ id, name: id, type: isInput ? 'input' : 'output' });
      }
    });

    const seqInfo = (workflowData.sequences || []).find(s => s.id === activeSequenceId);

    return {
      id: activeSequenceId,
      name: seqInfo ? seqInfo.name : activeSequenceId,
      tools: Array.from(toolsSet),
      responsibles: globalResponsibles,
      documents: globalDocs,
      tasks: sequenceTasks,
      parentTasks: parentTasks,
      chapters: [] // Chapters don't make sense in sequence view right now
    };
  }, [activeSequenceId, workflowData]);

  const [assocOpen, setAssocOpen] = useState(false);

  if (!sequenceActivity) {
    return <div className="workflow-d3-container"><p style={{ padding: 20 }}>Sequence not found.</p></div>;
  }

  const parentCount = sequenceActivity.parentTasks ? sequenceActivity.parentTasks.length : 0;

  return (
    <div className="sequence-canvas-wrapper" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f0f8ff', height: '100%' }}>
      <style>{`
        .sequence-canvas-wrapper .svg-container { background: transparent !important; }
        .sequence-canvas-wrapper svg { background: #e0f2fe !important; }
        .assoc-toggle-btn {
          display: flex; align-items: center; gap: 6px;
          background: none; border: none; cursor: pointer;
          color: #0369a1; font-size: 13px; font-weight: 600;
          padding: 0; user-select: none;
        }
        .assoc-toggle-btn:hover { color: #0c4a6e; }
        .assoc-chevron {
          display: inline-block;
          transition: transform 0.2s ease;
          font-style: normal;
          line-height: 1;
          font-size: 11px;
        }
        .assoc-chevron.open { transform: rotate(90deg); }
        .assoc-panel {
          overflow: hidden;
          transition: max-height 0.25s ease, opacity 0.25s ease;
          max-height: 0;
          opacity: 0;
        }
        .assoc-panel.open {
          max-height: 200px;
          opacity: 1;
        }
      `}</style>
      <FilterBar
        activity={sequenceActivity}
        filters={filters}
        onChange={onFilterChange}
        onImport={onEditTasks}
        onToolNotes={onToolNotes}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        // Exclude chapters for sequences
        onChapters={() => {}} 
        onSaveJson={() => {}}
        onLoadJson={() => {}}
      />
      {parentCount > 0 && (
        <div style={{ background: '#e0f2fe', borderBottom: assocOpen ? '1px solid #bae6fd' : 'none' }}>
          {/* Collapsed header / toggle */}
          <div style={{ padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: assocOpen ? '1px solid #bae6fd' : 'none' }}>
            <button className="assoc-toggle-btn" onClick={() => setAssocOpen(o => !o)}>
              <i className={`assoc-chevron${assocOpen ? ' open' : ''}`}>&#9654;</i>
              Associated to
              <span style={{ background: '#7dd3fc', color: '#0c4a6e', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700, marginLeft: 2 }}>{parentCount}</span>
            </button>
          </div>
          {/* Expandable content */}
          <div className={`assoc-panel${assocOpen ? ' open' : ''}`}>
            <div style={{ padding: '8px 16px 10px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {sequenceActivity.parentTasks.map(pt => (
                <span key={pt.id} style={{ background: '#fff', padding: '4px 12px', borderRadius: 16, border: '1px solid #7dd3fc', fontSize: 13, color: '#0c4a6e', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                  <strong>{pt.name}</strong> <span style={{ opacity: 0.7, fontWeight: 'normal' }}>(in {pt.activityName})</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
      <WorkflowCanvas
        activity={sequenceActivity}
        filters={filters}
        toolNotes={toolNotes}
        onToolNoteChange={onToolNoteChange}
        onFilterChange={onFilterChange}
        docPositions={docPositions}
        onDocPositionsChange={onDocPositionsChange}
        archPositions={archPositions}
        onArchPositionsChange={onArchPositionsChange}
        allArchPositions={{}} // Isolated
        edgeSides={edgeSides}
        onEdgeSidesChange={onEdgeSidesChange}
        allEdgeSides={{}} // Isolated
        workflowData={workflowData}
        searchQuery={searchQuery}
        isSequenceMode={true}
      />
    </div>
  );
};

export default SequenceCanvas;