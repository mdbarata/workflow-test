import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import TaskNode, { TASK_HEIGHT } from './TaskNode';
import DocumentNode, { DOC_WIDTH, DOC_HEIGHT } from './DocumentNode';
import { downloadStaticHtml } from '../exportStaticHtml';

// ── Export options modal ──────────────────────────────────────────────────────
const ExportModal = ({ onExport, onClose }) => {
  const [scope, setScope] = React.useState('current');
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, backdropFilter: 'blur(3px)' }} onClick={onClose}>
      <div style={{ background: '#ffffff', borderRadius: 12, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '0.5px solid #e2e8f0' }}>
          <span style={{ fontSize: 15, fontWeight: 500 }}>Export read-only viewer</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, color: '#64748b', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ padding: '20px 20px 8px' }}>
          <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px' }}>Choose what to include in the exported HTML file. The viewer will be fully interactive (zoom, pan, filter, collapse) but read-only.</p>
          {[{ value: 'current', label: 'Current activity', desc: 'Timeline diagram for the selected activity' },
          { value: 'all', label: 'All activities', desc: 'All timelines + architecture views + activity links' }].map((opt) => (
            <label key={opt.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', marginBottom: 8, borderRadius: 8, border: `1.5px solid ${scope === opt.value ? '#2563eb' : '#e2e8f0'}`, background: scope === opt.value ? '#eff6ff' : '#fff', cursor: 'pointer', transition: 'all .15s' }}>
              <input type="radio" name="scope" checked={scope === opt.value} onChange={() => setScope(opt.value)} style={{ marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{opt.label}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '0.5px solid #e2e8f0' }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => { onExport(scope); onClose(); }}>⬇ Export</button>
        </div>
      </div>
    </div>
  );
};

const MARGIN = { top: 110, right: 180, bottom: 60, left: 200 };
const TOOL_HEIGHT = 160;
const COLLAPSED_HEIGHT = 34;
const TASK_GAP = 18;
const LANE_GAP = 12;
const DOC_LEFT_X = 20;
const DOC_RIGHT_OFFSET = 30;
const ELBOW_STUB = 28;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.15;
const STORAGE_KEY = 'workflow_collapsed_tools';

const getCollapsedTools = () => {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); }
  catch { return new Set(); }
};
const saveCollapsedTools = (set) => localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
const getToolHeight = (tool, collapsedTools, tasks) => {
  if (collapsedTools.has(tool)) return COLLAPSED_HEIGHT;
  const count = tasks ? tasks.filter((t) => t.tool === tool).length : 1;
  const needed = 50 + count * (TASK_HEIGHT + TASK_GAP) + 10;
  return Math.max(TOOL_HEIGHT, needed);
};

const getTaskY = (task, tasks, tools, collapsedTools) => {
  const toolIndex = tools.indexOf(task.tool);
  if (toolIndex === -1 || collapsedTools.has(task.tool)) return -9999;
  const toolTasks = tasks.filter((t) => t.tool === task.tool);
  toolTasks.sort((a, b) => {
    if (a.startTime !== b.startTime) return a.startTime - b.startTime;
    return a.id.localeCompare(b.id);
  });
  const slotIndex = toolTasks.indexOf(task);
  let baseY = 50;
  for (let i = 0; i < toolIndex; i++) baseY += getToolHeight(tools[i], collapsedTools, tasks) + LANE_GAP;
  const offset = slotIndex * (TASK_HEIGHT + TASK_GAP);
  return baseY + offset;
};

const getTaskX = (task) => task.startTime;
const depId = (d) => (typeof d === 'object' ? d.id : d);
const curvedPath = (x1, y1, x2, y2) => { const m = (x1 + x2) / 2; return `M ${x1} ${y1} C ${m} ${y1}, ${m} ${y2}, ${x2} ${y2}`; };
const elbowPath = (x1, y1, x2, y2, isInput) => isInput
  ? `M ${x1} ${y1} H ${x1 + ELBOW_STUB} V ${y2} H ${x2}`
  : `M ${x1} ${y1} H ${x2 - ELBOW_STUB} V ${y2} H ${x2}`;

const buildDefaultPositions = (documents, tasks, tools, collapsedTools, canvasWidth) => {
  const positions = {};
  documents.forEach((doc) => {
    const isInput = doc.type === 'input';
    const connected = tasks.filter((t) =>
      isInput ? t.inputs?.includes(doc.id) : t.outputs?.includes(doc.id)
    );
    const x = isInput ? -MARGIN.left + DOC_LEFT_X : canvasWidth + DOC_RIGHT_OFFSET;
    let y;
    if (connected.length > 0) {
      const ys = connected.map((t) => getTaskY(t, tasks, tools, collapsedTools) + TASK_HEIGHT / 2);
      y = ys.reduce((a, b) => a + b, 0) / ys.length;
    } else {
      // fallback: centre in canvas
      const canvasHeight = tools.reduce((sum, tool) => sum + getToolHeight(tool, collapsedTools, tasks) + LANE_GAP, 0);
      y = canvasHeight / 2;
    }
    positions[doc.id] = { x, y };
  });

  // Enforce non-overlapping document positions
  ['input', 'output'].forEach((type) => {
    const typeDocs = documents.filter((d) => d.type === type && positions[d.id]);
    typeDocs.sort((a, b) => {
      const diff = positions[a.id].y - positions[b.id].y;
      return diff !== 0 ? diff : a.id.localeCompare(b.id);
    });
    for (let i = 1; i < typeDocs.length; i++) {
      const prevDoc = typeDocs[i - 1];
      const currDoc = typeDocs[i];
      const minSpacing = DOC_HEIGHT + 16;
      if (positions[currDoc.id].y < positions[prevDoc.id].y + minSpacing) {
        positions[currDoc.id].y = positions[prevDoc.id].y + minSpacing;
      }
    }
  });

  return positions;
};

const Tooltip = ({ task, responsible, documents, pos }) => {
  if (!task) return null;
  const inputDocs = documents.filter((d) => task.inputs?.includes(d.id));
  const outputDocs = documents.filter((d) => task.outputs?.includes(d.id));
  return (
    <div className="d3-tooltip" style={{ position: 'fixed', left: pos.x + 18, top: pos.y - 120, zIndex: 1000 }}>
      <div className="tooltip-header">
        <span className="tooltip-badge" style={{ backgroundColor: responsible?.taskColor || '#888' }} />
        {task.name}
      </div>
      <div className="tooltip-content">
        <p><strong>Tool:</strong> {task.tool}</p>
        <p><strong>Responsible:</strong> {responsible?.name || task.responsible}</p>
        <p><strong>Duration:</strong> {task.duration} units</p>
        <p><strong>Details:</strong> {task.details}</p>
        {task.dependencies.length > 0 && <p><strong>Depends on:</strong> {task.dependencies.map(depId).join(', ')}</p>}
        {inputDocs.length > 0 && <p><strong>Inputs:</strong> {inputDocs.map((d) => d.name).join(', ')}</p>}
        {outputDocs.length > 0 && <p><strong>Outputs:</strong> {outputDocs.map((d) => d.name).join(', ')}</p>}
      </div>
    </div>
  );
};

const ToolNotePanel = ({ tool, note, toolY, onClose, onSave }) => {
  const [text, setText] = useState(note || '');
  return (
    <div style={{ position: 'absolute', top: MARGIN.top + toolY + 36, left: MARGIN.left + 40, width: 320, background: '#ffffff', border: '1.5px solid #2563eb', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', zIndex: 500, padding: 14 }} onMouseDown={(e) => e.stopPropagation()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#1d4ed8' }}>{tool}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16 }}>✕</button>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Add notes about this tool…" autoFocus
        style={{ width: '100%', height: 100, fontSize: 12, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, resize: 'vertical', fontFamily: 'system-ui, sans-serif', color: '#1e293b', background: '#f8fafc' }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={() => { onSave(tool, text); onClose(); }}>Save</button>
      </div>
    </div>
  );
};

const ZoomControls = ({ zoom, onZoom, onFit }) => (
  <div style={{ position: 'absolute', bottom: 16, right: 16, zIndex: 100, display: 'flex', alignItems: 'center', gap: 4, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
    <button onClick={() => onZoom(-1)} style={zBtnStyle} title="Zoom out">−</button>
    <span style={{ fontSize: 11, fontWeight: 500, color: '#64748b', minWidth: 38, textAlign: 'center' }}>{(zoom * 100).toFixed(0)}%</span>
    <button onClick={() => onZoom(1)} style={zBtnStyle} title="Zoom in">+</button>
    <div style={{ width: 1, height: 16, background: '#e2e8f0', margin: '0 2px' }} />
    <button onClick={onFit} style={{ ...zBtnStyle, fontSize: 13 }} title="Fit to screen">⊡</button>
  </div>
);
const zBtnStyle = { background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, fontWeight: 600, color: '#64748b', padding: '0 4px', lineHeight: 1, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24 };

const ARCH_BOX_W = 180;
const ARCH_BOX_H = 90;
const ARCH_COL_GAP = 100;
const ARCH_ROW_GAP = 80;
const ARCH_MAX_COLS = 4;
const ARCH_POS_KEY = (actId) => `arch_positions_${actId}`;
const loadPositions = (actId) => { try { return JSON.parse(localStorage.getItem(ARCH_POS_KEY(actId)) || 'null'); } catch { return null; } };
const savePositions = (actId, pos) => localStorage.setItem(ARCH_POS_KEY(actId), JSON.stringify(pos));

const computeToolLayout = (tools, tasks) => {
  const toolSet = new Set(tools);
  const edges = {};
  tools.forEach((t) => { edges[t] = new Set(); });
  tasks.forEach((task) => {
    task.dependencies.forEach((dep) => {
      const fromTool = tasks.find((t) => t.id === depId(dep))?.tool;
      if (fromTool && fromTool !== task.tool && toolSet.has(fromTool) && toolSet.has(task.tool)) edges[fromTool].add(task.tool);
    });
  });
  const depth = {};
  tools.forEach((t) => { depth[t] = 0; });
  for (let pass = 0; pass < tools.length; pass++)
    tools.forEach((from) => edges[from].forEach((to) => { if (depth[to] <= depth[from]) depth[to] = depth[from] + 1; }));
  const maxDepth = tools.reduce((m, t) => Math.max(m, depth[t]), 0);
  const ordered = [];
  for (let d = 0; d <= maxDepth; d++) tools.filter((t) => depth[t] === d).forEach((t) => ordered.push(t));
  const pos = {};
  ordered.forEach((tool, idx) => {
    pos[tool] = { x: (idx % ARCH_MAX_COLS) * (ARCH_BOX_W + ARCH_COL_GAP) + 60, y: Math.floor(idx / ARCH_MAX_COLS) * (ARCH_BOX_H + ARCH_ROW_GAP) + 60 };
  });
  return { pos, edges };
};

const computeToolEdgeFormats = (tasks) => {
  const map = {};
  tasks.forEach((task) => {
    task.dependencies.forEach((dep) => {
      const fromTool = tasks.find((t) => t.id === depId(dep))?.tool;
      if (fromTool && fromTool !== task.tool) {
        const key = `${fromTool}→${task.tool}`;
        if (!map[key]) map[key] = { formats: new Set(), types: new Set(), statuses: new Set() };
        const fmt = typeof dep === 'object' ? dep.format : '';
        const type = typeof dep === 'object' ? dep.type || 'file' : 'file';
        const status = typeof dep === 'object' ? dep.status || 'impl' : 'impl';
        if (fmt) map[key].formats.add(fmt);
        map[key].types.add(type);
        map[key].statuses.add(status);
      }
    });
  });
  return map;
};

const ArchitectureView = ({ activity, filters, toolNotes, onToolNoteChange, onToolClick, onFilterChange }) => {
  const { tasks, tools, responsibles } = activity;
  const [openNoteTool, setOpenNoteTool] = useState(null);
  const [hoveredTool, setHoveredTool] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [draggingTool, setDraggingTool] = useState(null);
  const [toolPositions, setToolPositions] = useState(null);
  const svgRef = useRef(null);
  const wrapperRef = useRef(null);

  const visibleTasks = useMemo(() => tasks.filter((t) => {
    const byResp = filters.responsibles.length === 0 || filters.responsibles.includes(t.responsible);
    const byTool = filters.tools.length === 0 || filters.tools.includes(t.tool);
    return byResp && byTool;
  }), [tasks, filters]);

  const visibleTools = useMemo(() => { const s = new Set(visibleTasks.map((t) => t.tool)); return tools.filter((t) => s.has(t)); }, [tools, visibleTasks]);
  const { pos: autoPos, edges } = useMemo(() => computeToolLayout(visibleTools, visibleTasks), [visibleTools, visibleTasks]);
  const edgeFormats = useMemo(() => computeToolEdgeFormats(visibleTasks), [visibleTasks]);

  const pos = useMemo(() => {
    const savedPos = toolPositions || loadPositions(activity.id) || {};
    const merged = { ...autoPos };
    visibleTools.forEach((tool) => { if (savedPos[tool]) merged[tool] = savedPos[tool]; });
    return merged;
  }, [autoPos, toolPositions, visibleTools, activity.id]);

  const respMap = useMemo(() => { const m = {}; responsibles.forEach((r) => { m[r.key] = r; }); return m; }, [responsibles]);
  const toolResps = useMemo(() => {
    const m = {};
    visibleTools.forEach((tool) => {
      const resps = [...new Set(visibleTasks.filter((t) => t.tool === tool).map((t) => t.responsible))];
      m[tool] = resps.map((k) => respMap[k]).filter(Boolean);
    });
    return m;
  }, [visibleTools, visibleTasks, respMap]);

  const taskCount = (tool) => visibleTasks.filter((t) => t.tool === tool).length;
  const vals = Object.values(pos);
  const maxX = (vals.length ? vals.reduce((m, p) => Math.max(m, p.x), 0) : 0) + ARCH_BOX_W + 120;
  const maxY = (vals.length ? vals.reduce((m, p) => Math.max(m, p.y), 0) : 0) + ARCH_BOX_H + 120;

  const handleWheel = useCallback((e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom((prev) => {
      const nz = Math.min(Math.max(prev * (e.deltaY > 0 ? 0.9 : 1.1), MIN_ZOOM), MAX_ZOOM);
      if (svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        const r = nz / prev;
        setPan((p) => ({ x: (e.clientX - rect.left) - ((e.clientX - rect.left) - p.x) * r, y: (e.clientY - rect.top) - ((e.clientY - rect.top) - p.y) * r }));
      }
      return nz;
    });
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handleFit = useCallback(() => {
    if (!wrapperRef.current) return;
    const wr = wrapperRef.current.getBoundingClientRect();
    setZoom(Math.min(wr.width / maxX, wr.height / maxY, 1));
    setPan({ x: 0, y: 0 });
  }, [maxX, maxY]);

  useEffect(() => { handleFit(); }, [visibleTools.length]); // eslint-disable-line

  const handleStepZoom = useCallback((dir) => {
    setZoom((prev) => {
      const nz = Math.min(Math.max(prev + dir * ZOOM_STEP, MIN_ZOOM), MAX_ZOOM);
      if (wrapperRef.current) {
        const wr = wrapperRef.current.getBoundingClientRect();
        const cx = wr.width / 2, cy = wr.height / 2;
        const r = nz / prev;
        setPan((p) => ({ x: cx - (cx - p.x) * r, y: cy - (cy - p.y) * r }));
      }
      return nz;
    });
  }, []);

  const handleBoxMouseDown = useCallback((e, tool) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const p = pos[tool];
    setDraggingTool({ tool, offsetX: (e.clientX - rect.left - pan.x) / zoom - p.x, offsetY: (e.clientY - rect.top - pan.y) / zoom - p.y });
  }, [pos, pan, zoom]);

  const handleSvgMouseMove = useCallback((e) => {
    if (draggingTool) {
      const rect = svgRef.current.getBoundingClientRect();
      const newX = (e.clientX - rect.left - pan.x) / zoom - draggingTool.offsetX;
      const newY = (e.clientY - rect.top - pan.y) / zoom - draggingTool.offsetY;
      setToolPositions((prev) => ({ ...(prev || {}), ...pos, [draggingTool.tool]: { x: newX, y: newY } }));
      return;
    }
    if (isPanning) {
      setPan((prev) => ({ x: prev.x + e.clientX - panStart.x, y: prev.y + e.clientY - panStart.y }));
      setPanStart({ x: e.clientX, y: e.clientY });
    }
  }, [draggingTool, isPanning, panStart, pan, zoom, pos]);

  const handleSvgMouseUp = useCallback(() => {
    if (draggingTool) {
      setToolPositions((prev) => { const s = prev || pos; savePositions(activity.id, s); return s; });
      setDraggingTool(null);
    }
    setIsPanning(false);
  }, [draggingTool, pos, activity.id]);

  const handleSvgMouseDown = useCallback((e) => { if (e.button !== 0) return; setIsPanning(true); setPanStart({ x: e.clientX, y: e.clientY }); }, []);
  const handleResetLayout = useCallback(() => { setToolPositions(null); localStorage.removeItem(ARCH_POS_KEY(activity.id)); }, [activity.id]);

  const GAP = 20;
  const drawEdge = (from, to) => {
    const f = pos[from], t = pos[to];
    if (!f || !t) return null;
    const key = `${from}→${to}`;
    const edgeData = edgeFormats[key];
    const fmts = edgeData && edgeData.formats ? [...edgeData.formats].join(', ') : '';
    const isPlanned = edgeData && edgeData.statuses ? edgeData.statuses.has('plan') : false;
    const isPlugin = edgeData && edgeData.types ? edgeData.types.has('plugin') : false;
    const isHov = hoveredTool === from || hoveredTool === to;
    const color = isHov ? '#2563eb' : isPlanned ? '#d97706' : '#64748b';
    const fromRight = f.x + ARCH_BOX_W / 2 < t.x + ARCH_BOX_W / 2;

    const lx1 = fromRight ? f.x + ARCH_BOX_W : f.x;
    const ly1 = f.y + ARCH_BOX_H / 2;
    const lx2 = fromRight ? t.x : t.x + ARCH_BOX_W;
    const ly2 = t.y + ARCH_BOX_H / 2;
    const mx = (lx1 + lx2) / 2;

    const ax1 = lx1, ay1 = ly1;
    const ax2 = fromRight ? lx1 + GAP : lx1 - GAP, ay2 = ly1;

    const midX = (lx1 + lx2) / 2, midY = (ly1 + ly2) / 2;
    const markerId = isHov ? 'arch-arr-blue' : isPlanned ? 'arch-arr-orange' : 'arch-arr-gray';

    let labelTxt = fmts;
    if (!labelTxt && isPlugin) labelTxt = 'Plug-in';
    const isFile = edgeData && edgeData.types ? edgeData.types.has('file') : false;
    if (labelTxt) {
      if (isPlugin) labelTxt = '🔌 ' + labelTxt;
      else if (isFile) labelTxt = '📄 ' + labelTxt;
    }
    const badgeW = labelTxt ? labelTxt.length * 6.5 + 12 : 0;
    const badgeFill = isPlugin ? '#faf5ff' : isPlanned ? '#fffbeb' : isHov ? '#eff6ff' : '#f1f5f9';
    const badgeStroke = isPlugin ? '#9333ea' : isPlanned ? '#d97706' : color;
    const badgeTextFill = isPlugin ? '#6b21a8' : isPlanned ? '#b45309' : isHov ? '#1d4ed8' : '#475569';

    return (
      <g key={key}>
        <line x1={ax1} y1={ay1} x2={ax2} y2={ay2}
          stroke={color} strokeWidth={isHov ? 2 : 1.5}
          strokeDasharray={isPlanned ? '6,4' : undefined}
          strokeOpacity={hoveredTool && !isHov ? 0.12 : 0.8}
          markerEnd={`url(#${markerId})`} />
        <path d={`M ${ax2} ${ly1} C ${mx} ${ly1}, ${mx} ${ly2}, ${lx2} ${ly2}`}
          fill="none" stroke={color} strokeWidth={isHov ? 2 : 1.5}
          strokeDasharray={isPlanned ? '6,4' : undefined}
          strokeOpacity={hoveredTool && !isHov ? 0.12 : 0.8} />
        {labelTxt && (
          <g transform={`translate(${midX}, ${midY - 12})`}>
            <rect x={-badgeW / 2} y={-8} width={badgeW} height={16} rx={4}
              fill={badgeFill} stroke={badgeStroke} strokeWidth={1} />
            <text textAnchor="middle" y={4} fontSize="9px" fontWeight="600" fill={badgeTextFill}
              style={{ pointerEvents: 'none', userSelect: 'none' }}>{labelTxt}</text>
          </g>
        )}
      </g>
    );
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative', overflow: 'hidden', width: '100%', height: '100%', background: '#f8f9fb' }}>
      <button onClick={handleResetLayout} style={{ position: 'absolute', top: 12, right: 12, zIndex: 100, padding: '8px 12px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500, color: '#64748b', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        ↺ Reset layout
      </button>

      <ZoomControls zoom={zoom} onZoom={handleStepZoom} onFit={handleFit} />

      <svg ref={svgRef} width={maxX} height={maxY}
        style={{ display: 'block', userSelect: 'none', cursor: draggingTool ? 'grabbing' : isPanning ? 'grabbing' : 'grab', width: '100%', height: '100%' }}
        viewBox={`${-pan.x / zoom} ${-pan.y / zoom} ${maxX / zoom} ${maxY / zoom}`}
        onMouseDown={handleSvgMouseDown} onMouseMove={handleSvgMouseMove}
        onMouseUp={handleSvgMouseUp} onMouseLeave={handleSvgMouseUp}>

        <defs>
          <marker id="arch-arr-gray" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <polygon points="0 0, 6 3, 0 6" fill="#64748b" />
          </marker>
          <marker id="arch-arr-blue" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <polygon points="0 0, 6 3, 0 6" fill="#2563eb" />
          </marker>
          <marker id="arch-arr-orange" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <polygon points="0 0, 6 3, 0 6" fill="#d97706" />
          </marker>
        </defs>

        {visibleTools.map((from) => [...(edges[from] || [])].map((to) => drawEdge(from, to)))}

        {visibleTools.map((tool) => {
          const p = pos[tool];
          if (!p) return null;
          const resps = toolResps[tool] || [];
          const count = taskCount(tool);
          const hasNote = !!(toolNotes && toolNotes[tool]?.trim());
          const isHov = hoveredTool === tool;
          const isDragging = draggingTool?.tool === tool;
          const isSearchMatch = !searchMatchTools || searchMatchTools.has(tool);
          return (
            <g key={tool} style={{ cursor: isDragging ? 'grabbing' : 'grab', opacity: isSearchMatch ? 1 : 0.18, transition: 'opacity 0.2s ease' }}
              onMouseEnter={() => !draggingTool && setHoveredTool(tool)}
              onMouseLeave={() => setHoveredTool(null)}
              onMouseDown={(e) => handleBoxMouseDown(e, tool)}
              onDoubleClick={(e) => { e.stopPropagation(); onToolClick(tool); }}>
              <rect x={p.x + 3} y={p.y + 3} width={ARCH_BOX_W} height={ARCH_BOX_H} rx={10} fill="rgba(0,0,0,0.07)" />
              <rect x={p.x} y={p.y} width={ARCH_BOX_W} height={ARCH_BOX_H} rx={10} fill="#ffffff"
                stroke={isDragging ? '#2563eb' : isHov ? '#2563eb' : '#cbd5e1'}
                strokeWidth={isDragging || isHov ? 2.5 : 1.5}
                style={{ filter: isDragging ? 'drop-shadow(0 6px 16px rgba(0,0,0,0.18))' : 'none' }} />
              {resps[0] && <rect x={p.x} y={p.y} width={ARCH_BOX_W} height={8} rx={10} fill={resps[0].taskColor} />}
              {resps[0] && <rect x={p.x} y={p.y + 4} width={ARCH_BOX_W} height={4} fill={resps[0].taskColor} />}
              <text x={p.x + ARCH_BOX_W / 2} y={p.y + 30} textAnchor="middle" fontSize="12px" fontWeight="700" fill="#1e293b" style={{ pointerEvents: 'none', userSelect: 'none' }}>{tool}</text>
              <text x={p.x + ARCH_BOX_W / 2} y={p.y + 48} textAnchor="middle" fontSize="10px" fill="#64748b" style={{ pointerEvents: 'none', userSelect: 'none' }}>{count} task{count !== 1 ? 's' : ''}</text>
              {resps.slice(0, 4).map((r, ri) => (
                <circle key={r.key} cx={p.x + 14 + ri * 16} cy={p.y + 68} r={6} fill={r.taskColor} stroke="#ffffff" strokeWidth={1.5} />
              ))}
              <g onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setOpenNoteTool(openNoteTool === tool ? null : tool); }}>
                <circle cx={p.x + ARCH_BOX_W - 14} cy={p.y + 68} r={9} fill={hasNote ? '#2563eb' : '#eff6ff'} stroke="#2563eb" strokeWidth={1.5} />
                <text x={p.x + ARCH_BOX_W - 14} y={p.y + 72} textAnchor="middle" fontSize="11px" fontWeight="700" fill={hasNote ? '#fff' : '#2563eb'} style={{ pointerEvents: 'none', userSelect: 'none' }}>{hasNote ? '✎' : '+'}</text>
              </g>
            </g>
          );
        })}
      </svg>

      {openNoteTool && pos[openNoteTool] && (
        <div style={{ position: 'absolute', top: (pos[openNoteTool].y + ARCH_BOX_H + 8) * zoom + pan.y, left: pos[openNoteTool].x * zoom + pan.x, width: 300, background: '#ffffff', border: '1.5px solid #2563eb', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', zIndex: 500, padding: 14 }} onMouseDown={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1d4ed8' }}>{openNoteTool}</span>
            <button onClick={() => setOpenNoteTool(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16 }}>✕</button>
          </div>
          <ArchNoteEditor tool={openNoteTool} note={toolNotes?.[openNoteTool] || ''} onSave={(tool, text) => { onToolNoteChange(tool, text); setOpenNoteTool(null); }} onClose={() => setOpenNoteTool(null)} />
        </div>
      )}
    </div>
  );
};

const ArchNoteEditor = ({ tool, note, onSave, onClose }) => {
  const [text, setText] = useState(note);
  return (
    <>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={`Notes about ${tool}…`} autoFocus
        style={{ width: '100%', height: 90, fontSize: 12, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, resize: 'vertical', fontFamily: 'system-ui, sans-serif', color: '#1e293b', background: '#f8fafc' }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={() => onSave(tool, text)}>Save</button>
      </div>
    </>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
// docPositions / onDocPositionsChange (optional props): when provided, the
// canvas reads its initial document layout from docPositions instead of
// always recomputing defaults, and reports every change upward so the
// parent (App.js) can persist it (e.g. to localStorage) across sessions.
const WorkflowCanvas = ({ activity, filters, toolNotes, onToolNoteChange, onFilterChange, docPositions: persistedDocPositions, onDocPositionsChange, workflowData, activeActivityIndex, searchQuery }) => {
  const { tasks, tools, responsibles, documents, name } = activity;
  const [view, setView] = useState('timeline');
  const [showExportModal, setShowExportModal] = useState(false);
  const canvasWidth = Math.max(...tasks.map((t) => t.startTime + t.duration), 600) + 20;

  // ── Search matching ──────────────────────────────────────────────────────────
  const sq = (searchQuery || '').trim().toLowerCase();
  const searchMatchTaskIds = useMemo(() => {
    if (!sq) return null; // null = no search active (show all)
    const matched = new Set();
    const docMap = {};
    (documents || []).forEach((d) => { docMap[d.id] = d.name || ''; });
    tasks.forEach((t) => {
      const resp = responsibles.find((r) => r.key === t.responsible);
      const docNames = [];
      (t.inputs || []).forEach((id) => { if (docMap[id]) docNames.push(docMap[id]); });
      (t.outputs || []).forEach((id) => { if (docMap[id]) docNames.push(docMap[id]); });
      const tNote = toolNotes?.[t.tool] || '';
      const hay = [
        JSON.stringify(t),
        resp?.name || '',
        activity.name || '',
        docNames.join(' '),
        tNote,
      ].join(' ').toLowerCase();
      if (hay.includes(sq)) matched.add(t.id);
    });
    return matched;
  }, [sq, tasks, responsibles, activity.name, documents, toolNotes]);

  const searchMatchTools = useMemo(() => {
    if (!sq) return null;
    const matched = new Set();
    tools.forEach((tool) => {
      const tNote = toolNotes?.[tool] || '';
      if (tool.toLowerCase().includes(sq) || tNote.toLowerCase().includes(sq)) {
        matched.add(tool);
      }
    });
    if (searchMatchTaskIds) {
      tasks.forEach((t) => { if (searchMatchTaskIds.has(t.id)) matched.add(t.tool); });
    }
    return matched;
  }, [sq, tools, tasks, searchMatchTaskIds, toolNotes]);

  const searchMatchDocIds = useMemo(() => {
    if (!sq) return null;
    const matched = new Set();
    (documents || []).forEach((d) => {
      if ((d.name || '').toLowerCase().includes(sq) || (d.id || '').toLowerCase().includes(sq)) {
        matched.add(d.id);
      }
    });
    if (searchMatchTaskIds) {
      tasks.forEach((t) => {
        if (searchMatchTaskIds.has(t.id)) {
          (t.inputs || []).forEach((id) => matched.add(id));
          (t.outputs || []).forEach((id) => matched.add(id));
        }
      });
    }
    return matched;
  }, [sq, documents, tasks, searchMatchTaskIds]);

  const [hoveredTaskId, setHoveredTaskId] = useState(null);
  const [hoveredDocId, setHoveredDocId] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [docPositions, setDocPositions] = useState(() =>
    persistedDocPositions || buildDefaultPositions(documents, tasks, tools, new Set(), canvasWidth)
  );
  const [docHeights, setDocHeights] = useState({});
  const [dragging, setDragging] = useState(null);
  const [openNoteTool, setOpenNoteTool] = useState(null);
  const [collapsedTools, setCollapsedTools] = useState(() => getCollapsedTools());
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  useEffect(() => { panRef.current = pan; }, [pan]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  const wrapperRef = useRef(null);
  const svgRef = useRef(null);

  const handleDocHeight = useCallback((docId, h) => {
    setDocHeights((prev) => (prev[docId] === h ? prev : { ...prev, [docId]: h }));
  }, []);

  // When the activity changes, load that activity's persisted layout if we
  // have one, otherwise fall back to the computed default.
  useEffect(() => {
    setDocPositions(
      persistedDocPositions || buildDefaultPositions(documents, tasks, tools, collapsedTools, canvasWidth)
    );
    setDocHeights({});
  }, [activity.id]); // eslint-disable-line

  // Backfill positions for any document missing one (e.g. newly added via
  // TaskEditor after the layout was already loaded/persisted), so it still renders.
  useEffect(() => {
    const missing = documents.filter((d) => !docPositions[d.id]);
    if (missing.length === 0) return;
    const defaults = buildDefaultPositions(missing, tasks, tools, collapsedTools, canvasWidth);
    setDocPositions((prev) => ({ ...defaults, ...prev }));
  }, [documents]); // eslint-disable-line

  // Report doc-position changes only when NOT dragging to avoid parent re-renders on every mousemove.
  useEffect(() => {
    if (!dragging && onDocPositionsChange) {
      onDocPositionsChange(docPositions);
    }
  }, [docPositions, dragging]); // eslint-disable-line

  const toggleToolCollapse = useCallback((tool) => {
    setCollapsedTools((prev) => { const next = new Set(prev); next.has(tool) ? next.delete(tool) : next.add(tool); saveCollapsedTools(next); return next; });
  }, []);

  const handleWheel = useCallback((e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom((prevZoom) => {
      const newZoom = Math.min(Math.max(prevZoom * (e.deltaY > 0 ? 0.9 : 1.1), MIN_ZOOM), MAX_ZOOM);
      if (svgRef.current && newZoom !== prevZoom) {
        const rect = svgRef.current.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        const r = newZoom / prevZoom;
        setPan((prev) => {
          const nextPan = { x: mx - (mx - prev.x) * r, y: my - (my - prev.y) * r };
          panRef.current = nextPan;
          zoomRef.current = newZoom;
          if (svgRef.current) {
            const sw = parseFloat(svgRef.current.getAttribute('width') || '1000');
            const sh = parseFloat(svgRef.current.getAttribute('height') || '800');
            svgRef.current.setAttribute('viewBox', `${-nextPan.x / newZoom} ${-nextPan.y / newZoom} ${sw / newZoom} ${sh / newZoom}`);
          }
          return nextPan;
        });
      }
      return newZoom;
    });
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handleFit = useCallback(() => {
    if (!svgRef.current || !wrapperRef.current) return;
    const wr = wrapperRef.current.getBoundingClientRect();
    const sw = parseInt(svgRef.current.getAttribute('width'));
    const sh = parseInt(svgRef.current.getAttribute('height'));
    const newZoom = Math.max(Math.min(wr.width / sw, wr.height / sh), MIN_ZOOM);
    zoomRef.current = newZoom;
    panRef.current = { x: 0, y: 0 };
    setZoom(newZoom);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => { handleFit(); }, [canvasWidth, tools.length]); // eslint-disable-line

  const handleStepZoom = useCallback((dir) => {
    setZoom((prev) => {
      const nz = Math.min(Math.max(prev + dir * ZOOM_STEP, MIN_ZOOM), MAX_ZOOM);
      if (svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        const cx = rect.width / 2, cy = rect.height / 2;
        const r = nz / prev;
        setPan((p) => {
          const np = { x: cx - (cx - p.x) * r, y: cy - (cy - p.y) * r };
          panRef.current = np;
          zoomRef.current = nz;
          return np;
        });
      }
      return nz;
    });
  }, []);

  const handleSvgMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX, y: e.clientY });
  }, []);

  const handleSvgMouseMove = useCallback((e) => {
    if (dragging) {
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseDocX = (e.clientX - rect.left) / zoomRef.current - panRef.current.x / zoomRef.current - MARGIN.left;
      const mouseDocY = (e.clientY - rect.top) / zoomRef.current - panRef.current.y / zoomRef.current - MARGIN.top;
      setDocPositions((prev) => ({
        ...prev,
        [dragging.id]: {
          x: mouseDocX - dragging.offsetX,
          y: mouseDocY - dragging.offsetY,
        },
      }));
      return;
    }
    if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      const nextPan = { x: panRef.current.x + dx, y: panRef.current.y + dy };
      panRef.current = nextPan;
      setPanStart({ x: e.clientX, y: e.clientY });
      if (svgRef.current) {
        const sw = parseFloat(svgRef.current.getAttribute('width') || '1000');
        const sh = parseFloat(svgRef.current.getAttribute('height') || '800');
        svgRef.current.setAttribute('viewBox', `${-nextPan.x / zoomRef.current} ${-nextPan.y / zoomRef.current} ${sw / zoomRef.current} ${sh / zoomRef.current}`);
      }
    }
  }, [dragging, isPanning, panStart]);

  const handleSvgMouseUp = useCallback(() => {
    if (isPanning) {
      setPan(panRef.current);
    }
    setDragging(null);
    setIsPanning(false);
  }, [isPanning]);

  const handleSvgMouseLeave = useCallback(() => {
    if (isPanning) {
      setPan(panRef.current);
    }
    setIsPanning(false);
  }, [isPanning]);

  const handleDocMouseDown = useCallback((e, docId) => {
    e.preventDefault(); e.stopPropagation(); setIsPanning(false);
    const rect = e.currentTarget.closest('svg').getBoundingClientRect();
    const pos = docPositions[docId];
    const mouseDocX = (e.clientX - rect.left) / zoomRef.current - panRef.current.x / zoomRef.current - MARGIN.left;
    const mouseDocY = (e.clientY - rect.top) / zoomRef.current - panRef.current.y / zoomRef.current - MARGIN.top;
    setDragging({ id: docId, offsetX: mouseDocX - pos.x, offsetY: mouseDocY - pos.y });
  }, [docPositions]);

  const visibleTasks = useMemo(() => tasks.filter((t) => {
    const byResp = filters.responsibles.length === 0 || filters.responsibles.includes(t.responsible);
    const byTool = filters.tools.length === 0 || filters.tools.includes(t.tool);
    return byResp && byTool;
  }), [tasks, filters]);

  const visibleTools = useMemo(() => { const s = new Set(visibleTasks.map((t) => t.tool)); return tools.filter((tool) => s.has(tool)); }, [tools, visibleTasks]);
  const visibleDocIds = useMemo(() => { const s = new Set(); visibleTasks.forEach((t) => { (t.inputs || []).forEach((id) => s.add(id)); (t.outputs || []).forEach((id) => s.add(id)); }); return s; }, [visibleTasks]);
  const visibleDocuments = useMemo(() => documents.filter((d) => visibleDocIds.has(d.id)), [documents, visibleDocIds]);
  const canvasHeight = visibleTools.reduce((sum, tool) => sum + getToolHeight(tool, collapsedTools, visibleTasks) + LANE_GAP, 0);
  const svgWidth = canvasWidth + MARGIN.left + MARGIN.right;
  const svgHeight = canvasHeight + MARGIN.top + MARGIN.bottom;

  const hoveredTask = tasks.find((t) => t.id === hoveredTaskId) || null;
  const depChain = useMemo(() => {
    if (!hoveredTask) return new Set();
    const chain = new Set();
    const walk = (id) => { const t = tasks.find((x) => x.id === id); if (!t) return; t.dependencies.forEach((d) => { chain.add(depId(d)); walk(depId(d)); }); };
    walk(hoveredTask.id);
    return chain;
  }, [hoveredTask, tasks]);

  const highlightedDocs = useMemo(() => {
    const s = new Set();
    if (hoveredTask) { (hoveredTask.inputs || []).forEach((id) => s.add(id)); (hoveredTask.outputs || []).forEach((id) => s.add(id)); }
    if (hoveredDocId) s.add(hoveredDocId);
    return s;
  }, [hoveredTask, hoveredDocId]);

  const docHoverTaskIds = useMemo(() => {
    if (!hoveredDocId) return new Set();
    return new Set(tasks.filter((t) => t.inputs?.includes(hoveredDocId) || t.outputs?.includes(hoveredDocId)).map((t) => t.id));
  }, [hoveredDocId, tasks]);

  const respMap = useMemo(() => { const m = {}; responsibles.forEach((r) => { m[r.key] = r; }); return m; }, [responsibles]);

  const getDocLineProps = (docId, isInput) => {
    const isDocHighlighted = highlightedDocs.has(docId);
    const color = isDocHighlighted ? (isInput ? '#2563eb' : '#059669') : '#94a3b8';
    const opacity = hoveredTask || hoveredDocId ? (isDocHighlighted ? 0.95 : 0.06) : 0.35;
    return { color, opacity, strokeWidth: hoveredDocId === docId || isDocHighlighted ? 2.2 : 1.5 };
  };

  const openNoteToolIndex = openNoteTool ? visibleTools.indexOf(openNoteTool) : -1;
  let openNoteToolY = 0;
  for (let i = 0; i < openNoteToolIndex; i++) openNoteToolY += getToolHeight(visibleTools[i], collapsedTools, visibleTasks) + LANE_GAP;

  const handleToolClick = useCallback((tool) => { onFilterChange({ responsibles: [], tools: [tool] }); setView('timeline'); }, [onFilterChange]);

  if (view === 'arch') {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <button onClick={() => setView('timeline')}
          style={{ position: 'absolute', top: 12, left: 12, zIndex: 101, padding: '8px 14px', background: '#1e40af', color: '#ffffff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
          ← Timeline view
        </button>
        <ArchitectureView activity={activity} filters={filters} toolNotes={toolNotes} onToolNoteChange={onToolNoteChange} onToolClick={handleToolClick} onFilterChange={onFilterChange} />
      </div>
    );
  }

  return (
    <div className="canvas-wrapper" ref={wrapperRef} style={{ position: 'relative', overflow: 'hidden', width: '100%', height: '100%' }}>
      <button onClick={() => { onFilterChange({ responsibles: [], tools: [] }); setView('arch'); }}
        style={{ position: 'absolute', top: 12, left: 12, zIndex: 100, padding: '8px 14px', background: '#1e40af', color: '#ffffff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
        ⬡ Architecture view
      </button>
      <button onClick={() => setShowExportModal(true)}
        title="Download a read-only, self-contained HTML file of this diagram — nothing is uploaded or stored remotely"
        style={{ position: 'absolute', top: 12, left: 168, zIndex: 100, padding: '8px 14px', background: '#ffffff', color: '#1e40af', border: '1.5px solid #1e40af', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        ⬇ Export viewer
      </button>

      <ZoomControls zoom={zoom} onZoom={handleStepZoom} onFit={handleFit} />

      <svg ref={svgRef} width={svgWidth} height={svgHeight}
        style={{ background: '#f8f9fb', display: 'block', userSelect: 'none', cursor: isPanning ? 'grabbing' : 'grab', width: '100%', height: '100%' }}
        viewBox={`${-pan.x / zoom} ${-pan.y / zoom} ${svgWidth / zoom} ${svgHeight / zoom}`}
        onMouseMove={handleSvgMouseMove} onMouseUp={handleSvgMouseUp}
        onMouseLeave={handleSvgMouseLeave} onMouseDown={handleSvgMouseDown}>

        <defs>
          <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#64748b" /></marker>
          <marker id="arrow-gold" markerWidth="10" markerHeight="10" refX="8" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#FFD700" /></marker>
          <marker id="arrow-orange" markerWidth="10" markerHeight="10" refX="8" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#d97706" /></marker>
          <marker id="arrow-doc" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto"><polygon points="0 0, 8 3.5, 0 7" fill="#94a3b8" /></marker>
          <marker id="arrow-doc-blue" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto"><polygon points="0 0, 8 3.5, 0 7" fill="#2563eb" /></marker>
          <marker id="arrow-doc-green" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto"><polygon points="0 0, 8 3.5, 0 7" fill="#059669" /></marker>
        </defs>

        <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
          <g transform={`translate(0, -${MARGIN.top - 16})`}>
            {responsibles.map((r, i) => (
              <g key={r.key} transform={`translate(${i * 280}, 0)`}>
                <rect width={36} height={26} rx={4} fill={r.color} stroke={r.borderColor} strokeWidth={2} />
                <rect x={6} y={6} width={24} height={14} rx={3} fill={r.taskColor} />
                <text x={46} y={18} fontSize="12px" fontWeight="600" fill="#374151">{r.name}</text>
              </g>
            ))}
            <text x={responsibles.length * 280 + 20} y={18} fontSize="10px" fill="#94a3b8" fontStyle="italic">✥ drag documents to reposition</text>
          </g>

          <text x={canvasWidth / 2} y={-30} textAnchor="middle" fontSize="18px" fontWeight="700" fill="#1e293b">{name}</text>

          {visibleTools.map((tool, i) => {
            let toolY = 0;
            for (let j = 0; j < i; j++) toolY += getToolHeight(visibleTools[j], collapsedTools, visibleTasks) + LANE_GAP;
            const isCollapsed = collapsedTools.has(tool);
            const toolDisplayHeight = getToolHeight(tool, collapsedTools, visibleTasks);
            const hasNote = !!(toolNotes && toolNotes[tool]?.trim());
            return (
              <g key={tool}>
                <rect x={0} y={toolY} width={canvasWidth} height={toolDisplayHeight} rx={6} fill="#ffffff" stroke="#2563eb" strokeWidth={2} />
                <text x={12} y={toolY + 24} fontSize="12px" fontWeight="700" fill="#1d4ed8" style={{ pointerEvents: 'none' }}>{tool}</text>
                <g style={{ cursor: 'pointer' }} onClick={() => toggleToolCollapse(tool)}>
                  <circle cx={150} cy={toolY + 17} r={12} fill="#ffffff" fillOpacity="0.01" stroke="#94a3b8" strokeWidth={1.5} />
                  <text x={150} y={toolY + 22} textAnchor="middle" fontSize="12px" fontWeight="700" fill="#94a3b8"
                    transform={isCollapsed ? `rotate(-90, 150, ${toolY + 22})` : undefined}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}>▼</text>
                </g>
                {!isCollapsed && <line x1={0} y1={toolY + 34} x2={canvasWidth} y2={toolY + 34} stroke="#2563eb" strokeWidth={1} strokeOpacity={0.15} />}
                <g style={{ cursor: 'pointer' }} onClick={() => setOpenNoteTool(openNoteTool === tool ? null : tool)}>
                  <circle cx={canvasWidth - 18} cy={toolY + 17} r={10} fill={hasNote ? '#2563eb' : '#eff6ff'} stroke="#2563eb" strokeWidth={1.5} />
                  <text x={canvasWidth - 18} y={toolY + 22} textAnchor="middle" fontSize="13px" fontWeight="700" fill={hasNote ? '#ffffff' : '#2563eb'} style={{ pointerEvents: 'none', userSelect: 'none' }}>{hasNote ? '✎' : '+'}</text>
                </g>
              </g>
            );
          })}

          {visibleDocuments.map((doc) => {
            const pos = docPositions[doc.id];
            if (!pos) return null;
            const isInput = doc.type === 'input';
            const connectedTasks = visibleTasks.filter((t) => isInput ? t.inputs?.includes(doc.id) : t.outputs?.includes(doc.id));
            if (connectedTasks.length === 0) return null;
            const { color, opacity, strokeWidth } = getDocLineProps(doc.id, isInput);
            const arrowId = color === '#2563eb' ? 'arrow-doc-blue' : color === '#059669' ? 'arrow-doc-green' : 'arrow-doc';
            const docCenterY = pos.y + (docHeights[doc.id] || DOC_HEIGHT) / 2;
            return connectedTasks.map((ct) => {
              const ty = getTaskY(ct, visibleTasks, visibleTools, collapsedTools);
              if (ty < -1000) return null;
              return (
                <path key={`${doc.id}<->${ct.id}`}
                  d={elbowPath(isInput ? pos.x + DOC_WIDTH : pos.x, docCenterY, isInput ? getTaskX(ct) : getTaskX(ct) + ct.duration, ty + TASK_HEIGHT / 2, isInput)}
                  fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray="5,4" strokeOpacity={opacity} strokeLinecap="round"
                  markerEnd={`url(#${arrowId})`} style={{ transition: 'stroke 0.18s ease, stroke-opacity 0.18s ease' }}
                />
              );
            });
          })}

          {visibleTasks.map((task) =>
            task.dependencies.map((dep) => {
              const dId = depId(dep);
              const fmt = typeof dep === 'object' ? dep.format || '' : '';
              const depTask = visibleTasks.find((t) => t.id === dId);
              if (!depTask) return null;
              const y1 = getTaskY(depTask, visibleTasks, visibleTools, collapsedTools) + TASK_HEIGHT / 2;
              const y2 = getTaskY(task, visibleTasks, visibleTools, collapsedTools) + TASK_HEIGHT / 2;
              if (y1 < -1000 || y2 < -1000) return null;
              const x1 = getTaskX(depTask) + depTask.duration;
              const x2 = getTaskX(task);
              const isGold = hoveredTask && (hoveredTask.id === task.id || depChain.has(task.id)) && depChain.has(dId);
              return (
                <g key={`${dId}->${task.id}`}>
                  <path d={curvedPath(x1, y1, x2, y2)} fill="none"
                    stroke={isGold ? '#FFD700' : '#64748b'} strokeWidth={isGold ? 2.5 : 1.8}
                    strokeOpacity={isGold ? 1 : hoveredTask ? 0.13 : 0.6}
                    markerEnd={`url(#${isGold ? 'arrow-gold' : 'arrow'})`}
                    style={{ transition: 'stroke 0.2s ease, stroke-opacity 0.2s ease, stroke-width 0.2s ease' }} />
                  {depTask.tool !== task.tool && fmt && (
                    <g transform={`translate(${(x1 + x2) / 2}, ${(y1 + y2) / 2})`}>
                      <rect x={-fmt.length * 3.2 - 4} y={-9} rx={4} width={fmt.length * 6.4 + 8} height={17}
                        fill={isGold ? '#FFF8DC' : '#f1f5f9'} stroke={isGold ? '#FFD700' : '#94a3b8'} strokeWidth={1} />
                      <text textAnchor="middle" y={4} fontSize="9px" fontWeight="600" fill={isGold ? '#92400e' : '#475569'} style={{ pointerEvents: 'none', userSelect: 'none' }}>{fmt}</text>
                    </g>
                  )}
                </g>
              );
            })
          )}

          {visibleTasks.map((task) => {
            const taskY = getTaskY(task, visibleTasks, visibleTools, collapsedTools);
            if (taskY < -1000) return null;
            const resp = respMap[task.responsible];
            const isHovered = task.id === hoveredTaskId;
            const isDocRelated = docHoverTaskIds.has(task.id);
            const isSearchMatch = !searchMatchTaskIds || searchMatchTaskIds.has(task.id);
            return (
              <TaskNode key={task.id} task={task} x={getTaskX(task)} y={taskY} width={task.duration}
                responsible={resp} isHovered={isHovered || isDocRelated}
                isDimmed={
                  (!isSearchMatch) ||
                  (!!hoveredTask && !isHovered && !depChain.has(task.id)) ||
                  (!!hoveredDocId && !isDocRelated)
                }
                isDepHighlighted={depChain.has(task.id)}
                onMouseEnter={(e) => { setHoveredTaskId(task.id); setTooltipPos({ x: e.clientX, y: e.clientY }); }}
                onMouseLeave={() => setHoveredTaskId(null)} />
            );
          })}

          {visibleDocuments.map((doc) => {
            const pos = docPositions[doc.id];
            if (!pos) return null;
            const isHighlighted = highlightedDocs.has(doc.id);
            const isSearchMatchDoc = !searchMatchDocIds || searchMatchDocIds.has(doc.id);
            return (
              <DocumentNode key={doc.id} doc={doc} x={pos.x} y={pos.y} isHighlighted={isHighlighted}
                isDimmed={(!isSearchMatchDoc) || (!!hoveredTask && !isHighlighted) || (!!hoveredDocId && hoveredDocId !== doc.id && !isHighlighted)}
                isDragging={dragging?.id === doc.id}
                onMouseEnter={() => setHoveredDocId(doc.id)} onMouseLeave={() => setHoveredDocId(null)}
                onMouseDown={(e) => handleDocMouseDown(e, doc.id)} onHeightChange={(h) => handleDocHeight(doc.id, h)} />
            );
          })}
        </g>
      </svg>

      {openNoteTool && openNoteToolIndex >= 0 && (
        <ToolNotePanel tool={openNoteTool} note={toolNotes?.[openNoteTool] || ''} toolY={openNoteToolY}
          onClose={() => setOpenNoteTool(null)} onSave={(tool, text) => onToolNoteChange(tool, text)} />
      )}
      <Tooltip task={hoveredTask} responsible={hoveredTask ? respMap[hoveredTask.responsible] : null} documents={documents} pos={tooltipPos} />

      {showExportModal && (
        <ExportModal
          onClose={() => setShowExportModal(false)}
          onExport={(scope) => downloadStaticHtml(workflowData || { activities: [activity] }, {
            collapsedTools: [...collapsedTools],
            toolNotes: toolNotes || {},
            scope,
            activeActivityIndex: activeActivityIndex || 0,
          })}
        />
      )}
    </div>
  );
};

export default WorkflowCanvas;