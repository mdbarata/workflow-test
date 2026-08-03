import React, { useMemo } from 'react';
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
    const docIds = new Set();

    [...sequenceTasks, ...parentTasks].forEach(t => {
      if (t.tool) toolsSet.add(t.tool);
      if (t.responsible) respSet.add(t.responsible);
      (t.inputs || []).forEach(id => docIds.add(id));
      (t.outputs || []).forEach(id => docIds.add(id));
    });

    // Gather global definitions
    const globalResponsibles = [];
    const globalDocs = [];
    (workflowData.activities || []).forEach(act => {
      (act.responsibles || []).forEach(r => {
        if (respSet.has(r.key) && !globalResponsibles.find(x => x.key === r.key)) globalResponsibles.push(r);
      });
      (act.documents || []).forEach(d => {
        if (docIds.has(d.id) && !globalDocs.find(x => x.id === d.id)) globalDocs.push(d);
      });
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

  if (!sequenceActivity) {
    return <div className="workflow-d3-container"><p style={{ padding: 20 }}>Sequence not found.</p></div>;
  }

  return (
    <div className="sequence-canvas-wrapper" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f0f8ff', height: '100%' }}>
      <style>{`
        .sequence-canvas-wrapper .svg-container { background: transparent !important; }
        .sequence-canvas-wrapper svg { background: #e0f2fe !important; }
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
      {sequenceActivity.parentTasks && sequenceActivity.parentTasks.length > 0 && (
        <div style={{ padding: '12px 20px', background: '#e0f2fe', borderBottom: '1px solid #bae6fd', color: '#0369a1', fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Associated to:</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {sequenceActivity.parentTasks.map(pt => (
              <span key={pt.id} style={{ background: '#fff', padding: '4px 12px', borderRadius: 16, border: '1px solid #7dd3fc', fontSize: 13, color: '#0c4a6e', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                <strong>{pt.name}</strong> <span style={{ opacity: 0.7, fontWeight: 'normal' }}>(in {pt.activityName})</span>
              </span>
            ))}
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