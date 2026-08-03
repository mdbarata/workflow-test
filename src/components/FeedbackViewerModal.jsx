import React, { useState, useMemo } from 'react';

const FeedbackViewerModal = ({ isOpen, onClose, feedbackItems = [], onImportFeedback, onDeleteComment, onClearAll, workflowData }) => {
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'matched', 'unmatched'
  const [dragOver, setDragOver] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Smart matching algorithm against current workflowData
  const { matched, unmatched } = useMemo(() => {
    const activities = workflowData?.activities || [];
    const allTools = new Set();
    const allActNames = new Set();
    const allActIds = new Set();

    activities.forEach(act => {
      if (act.id) allActIds.add(act.id);
      if (act.name) allActNames.add(act.name.trim().toLowerCase());
      (act.tools || []).forEach(t => allTools.add(t.trim().toLowerCase()));
    });

    const mList = [];
    const uList = [];

    feedbackItems.forEach(item => {
      if (item.targetType === 'general' || !item.targetType) {
        mList.push(item);
        return;
      }

      if (item.targetType === 'tool') {
        const key = (item.targetKey || '').trim().toLowerCase();
        if (allTools.has(key)) {
          mList.push(item);
        } else {
          uList.push(item);
        }
      } else if (item.targetType === 'activity') {
        const key = (item.targetKey || '').trim().toLowerCase();
        if (allActIds.has(item.activityId) || allActNames.has(key)) {
          mList.push(item);
        } else {
          uList.push(item);
        }
      } else if (item.targetType === 'link') {
        // Simple heuristic: if at least one side of the link or any activities exist
        mList.push(item);
      } else {
        mList.push(item);
      }
    });

    return { matched: mList, unmatched: uList };
  }, [feedbackItems, workflowData]);

  if (!isOpen) return null;

  const handleFiles = async (files) => {
    setErrorMsg('');
    const newComments = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.name.endsWith('.json')) continue;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (Array.isArray(data.comments)) {
          data.comments.forEach(c => {
            newComments.push({
              ...c,
              importedAt: new Date().toISOString(),
              sourceFile: file.name
            });
          });
        }
      } catch (err) {
        setErrorMsg(`Failed to parse ${file.name}: Invalid JSON.`);
      }
    }
    if (newComments.length > 0) {
      onImportFeedback(newComments);
    } else if (!errorMsg) {
      setErrorMsg('No valid comments found in the uploaded file(s).');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  const displayList = activeTab === 'matched' ? matched : activeTab === 'unmatched' ? unmatched : feedbackItems;

  const groupedTargets = useMemo(() => {
    const map = {};
    displayList.forEach((item) => {
      const isUnmatched = unmatched.includes(item);
      
      if (item.targetType === 'link') {
        const label = isUnmatched ? `⚠️ Target Modified: Link: ${item.targetKey}` : `📌 Link: ${item.targetKey}`;
        if (!map[label]) map[label] = { isUnmatched, items: [] };
        map[label].items.push(item);
      } else {
        const tools = item.associatedTools && item.associatedTools.length > 0 
          ? item.associatedTools 
          : (item.targetType === 'tool' ? [item.targetKey] : []);

        if (tools.length === 0) {
          const baseLabel = item.targetType === 'task' ? `Task: ${item.targetKey}` : `General Workflow`;
          const label = isUnmatched ? `⚠️ Target Modified: ${baseLabel}` : `📌 ${baseLabel}`;
          if (!map[label]) map[label] = { isUnmatched, items: [] };
          map[label].items.push(item);
        } else {
          tools.forEach(t => {
            const baseLabel = `Tool: ${t}`;
            const label = isUnmatched ? `⚠️ Target Modified: ${baseLabel}` : `📌 ${baseLabel}`;
            if (!map[label]) map[label] = { isUnmatched, items: [] };
            map[label].items.push(item);
          });
        }
      }
    });
    return map;
  }, [displayList, unmatched]);

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>💬</span>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#1e293b' }}>Reviewer Feedback</h3>
            <span style={styles.countBadge}>{feedbackItems.length}</span>
          </div>
          <button onClick={onClose} style={styles.closeBtn} title="Close">✕</button>
        </div>

        {/* Drop zone / Upload bar */}
        <div
          style={{ ...styles.dropzone, ...(dragOver ? styles.dropzoneOver : {}) }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <div style={{ fontSize: '13px', color: '#475569', fontWeight: 600 }}>
            📥 Drag & Drop reviewer feedback (.json) files here to import
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
            or{' '}
            <label style={styles.browseLink}>
              browse your computer
              <input type="file" accept=".json" multiple onChange={handleFileInput} style={{ display: 'none' }} />
            </label>
          </div>
          {errorMsg && <div style={styles.errorText}>{errorMsg}</div>}
        </div>

        {/* Filter Tabs */}
        {feedbackItems.length > 0 && (
          <div style={styles.tabs}>
            <button
              style={{ ...styles.tabBtn, ...(activeTab === 'all' ? styles.tabBtnActive : {}) }}
              onClick={() => setActiveTab('all')}
            >
              All Comments ({feedbackItems.length})
            </button>
            <button
              style={{ ...styles.tabBtn, ...(activeTab === 'matched' ? styles.tabBtnActive : {}) }}
              onClick={() => setActiveTab('matched')}
            >
              ✅ Active in Model ({matched.length})
            </button>
            <button
              style={{ ...styles.tabBtn, ...(activeTab === 'unmatched' ? styles.tabBtnActiveUnmatched : {}) }}
              onClick={() => setActiveTab('unmatched')}
            >
              ⚠️ Unmatched / Modified Targets ({unmatched.length})
            </button>
            {feedbackItems.length > 0 && (
              <button onClick={onClearAll} style={styles.clearAllBtn}>Clear All</button>
            )}
          </div>
        )}

        {/* Unmatched Warning Banner */}
        {activeTab === 'unmatched' && unmatched.length > 0 && (
          <div style={styles.warningBanner}>
            <strong>⚠️ Note:</strong> These comments reference tools or activities that could not be found in your current model (they may have been renamed, deleted, or replaced since the feedback was exported).
          </div>
        )}

        {/* Comments List grouped by target */}
        <div style={styles.body}>
          {feedbackItems.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>📭</div>
              <div style={{ fontWeight: 600, color: '#334155' }}>No feedback loaded yet</div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                When stakeholders review your HTML export and download their feedback JSON, drop the file above to see their notes here!
              </div>
            </div>
          ) : Object.keys(groupedTargets).length === 0 ? (
            <div style={styles.emptyState}>No comments in this category.</div>
          ) : (
            Object.entries(groupedTargets).map(([groupLabel, groupData]) => (
              <div key={groupLabel} style={{ marginBottom: '8px' }}>
                <div style={{ ...styles.groupHeader, ...(groupData.isUnmatched ? styles.groupHeaderUnmatched : {}) }}>
                  <span>{groupLabel}</span>
                  <span style={{ fontSize: '11px', fontWeight: 600, opacity: 0.8 }}>
                    {groupData.items.length} {groupData.items.length === 1 ? 'comment' : 'comments'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '6px', borderLeft: '2px solid #e2e8f0', marginTop: '8px' }}>
                  {groupData.items.map((item) => (
                    <CommentCard 
                      key={`${groupLabel}-${item.id || Math.random()}`} 
                      item={item} 
                      groupData={groupData} 
                      onDeleteComment={onDeleteComment} 
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button onClick={onClose} style={styles.doneBtn}>Done</button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(3px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000
  },
  modal: {
    background: '#ffffff', width: '640px', maxHeight: '85vh', borderRadius: '12px',
    boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #e2e8f0'
  },
  header: {
    padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
  },
  countBadge: {
    background: '#2563eb', color: '#fff', fontSize: '11px', fontWeight: 700,
    padding: '2px 8px', borderRadius: '12px'
  },
  closeBtn: {
    background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b'
  },
  dropzone: {
    padding: '16px', margin: '16px 20px 8px', background: '#f8fafc', border: '2px dashed #cbd5e1',
    borderRadius: '8px', textAlign: 'center', transition: 'all 0.15s'
  },
  dropzoneOver: {
    background: '#eff6ff', borderColor: '#3b82f6'
  },
  browseLink: {
    color: '#2563eb', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline'
  },
  errorText: {
    color: '#ef4444', fontSize: '12px', fontWeight: 600, marginTop: '8px'
  },
  tabs: {
    display: 'flex', gap: '6px', padding: '0 20px', borderBottom: '1px solid #e2e8f0',
    background: '#fff', alignItems: 'center'
  },
  tabBtn: {
    padding: '10px 14px', background: 'none', border: 'none', borderBottom: '2px solid transparent',
    fontSize: '12px', fontWeight: 600, color: '#64748b', cursor: 'pointer'
  },
  tabBtnActive: {
    color: '#2563eb', borderBottomColor: '#2563eb'
  },
  tabBtnActiveUnmatched: {
    color: '#d97706', borderBottomColor: '#d97706'
  },
  clearAllBtn: {
    marginLeft: 'auto', background: 'none', border: 'none', color: '#ef4444',
    fontSize: '11px', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline'
  },
  warningBanner: {
    margin: '12px 20px 0', padding: '10px 14px', background: '#fffbeb', border: '1px solid #fef3c7',
    borderRadius: '6px', fontSize: '12px', color: '#92400e', lineHeight: 1.4
  },
  body: {
    flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px'
  },
  emptyState: {
    textAlign: 'center', padding: '40px 20px', color: '#94a3b8'
  },
  card: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', position: 'relative', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' },
  cardUnmatched: { border: '1px dashed #fca5a5', background: '#fffcfc' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' },
  delBtn: { background: 'none', border: 'none', padding: '2px', color: '#cbd5e1', cursor: 'pointer', fontSize: '14px', lineHeight: 1 },
  targetBadge: { background: '#eff6ff', color: '#1e40af', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, border: '1px solid #bfdbfe' },
  groupHeader: { background: '#eff6ff', color: '#1e40af', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  groupHeaderUnmatched: { background: '#fef2f2', borderBottom: '1px solid #fecaca', color: '#991b1b' },
  cardText: { fontSize: '12px', color: '#334155', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  footer: { padding: '14px 20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end' },
  doneBtn: { padding: '8px 24px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }
};

const CommentCard = ({ item, groupData, onDeleteComment }) => {
  const [showNote, setShowNote] = useState(false);

  return (
    <div style={{ ...styles.card, ...(groupData.isUnmatched ? styles.cardUnmatched : {}) }}>
      <div style={styles.cardHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '13px' }}>
            {item.author || 'Anonymous'}
          </span>
          {item.sourceFile && (
            <span style={{ fontSize: '10px', color: '#94a3b8', background: '#f1f5f9', padding: '1px 5px', borderRadius: '4px' }}>
              from {item.sourceFile}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: '#64748b' }}>
            {new Date(item.timestamp || Date.now()).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
          <button onClick={() => onDeleteComment(item.id)} style={styles.delBtn} title="Dismiss comment">✕</button>
        </div>
      </div>
      
      {(item.targetType === 'task' || item.targetType === 'link') && (
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#2563eb', marginBottom: '4px' }}>
          {item.targetType === 'task' ? `[Task: ${item.targetKey}]` : `[Link: ${item.targetKey}]`}
        </div>
      )}
      <div style={styles.cardText}>{item.text}</div>
      
      {item.referenceNote && (
        <div style={{ marginTop: '8px' }}>
          <button 
            onClick={() => setShowNote(!showNote)}
            style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '11px', fontWeight: 600, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
          >
            {showNote ? 'Hide Note' : 'Expand/View Note'}
          </button>
          {showNote && (
            <div style={{ marginTop: '6px', padding: '8px', background: '#f8fafc', borderLeft: '3px solid #cbd5e1', fontSize: '12px', color: '#475569', fontStyle: 'italic' }}>
              <strong style={{ fontStyle: 'normal', display: 'block', marginBottom: '4px', fontSize: '11px', textTransform: 'uppercase', color: '#94a3b8' }}>Reference Note</strong>
              {item.referenceNote}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FeedbackViewerModal;
