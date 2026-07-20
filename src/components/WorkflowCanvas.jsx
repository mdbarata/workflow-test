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
const ARCH_SIDES_KEY = (actId) => `arch_sides_${actId}`;
const loadEdgeSides = (actId) => { try { return JSON.parse(localStorage.getItem(ARCH_SIDES_KEY(actId)) || 'null'); } catch { return null; } };
const saveEdgeSides = (actId, sides) => localStorage.setItem(ARCH_SIDES_KEY(actId), JSON.stringify(sides));

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

const ArchitectureView = ({ activity, filters, toolNotes, onToolNoteChange, onToolClick, onFilterChange, searchMatchTools, archPositions, onArchPositionsChange, edgeSides: propEdgeSides, onEdgeSidesChange }) => {
  const { tasks, tools, responsibles } = activity;
  const [openNoteTool, setOpenNoteTool] = useState(null);
  const [hoveredTool, setHoveredTool] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [draggingTool, setDraggingTool] = useState(null);
  const [toolPositions, setToolPositions] = useState(() => archPositions || loadPositions(activity.id) || null);
  const [edgeSides, setEdgeSides] = useState(() => propEdgeSides || loadEdgeSides(activity.id) || {});
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [draggingHandle, setDraggingHandle] = useState(null);

  const archPosKey = JSON.stringify(archPositions || null);
  const edgeSidesKey = JSON.stringify(propEdgeSides || null);
  useEffect(() => {
    setToolPositions(archPositions || loadPositions(activity.id) || null);
  }, [activity.id, archPosKey]);

  useEffect(() => {
    setEdgeSides(propEdgeSides || loadEdgeSides(activity.id) || {});
  }, [activity.id, edgeSidesKey]);
  const svgRef = useRef(null);
  const wrapperRef = useRef(null);

  const updateEdgeConfig = useCallback((key, updates) => {
    const s = { ...edgeSides, [key]: { ...(edgeSides[key] || {}), ...updates } };
    setEdgeSides(s);
    saveEdgeSides(activity.id, s);
    if (onEdgeSidesChange) onEdgeSidesChange(s);
  }, [edgeSides, activity.id, onEdgeSidesChange]);

  const togglePortSide = useCallback((key, end /* 'from' | 'to' */, currentSide) => {
    const order = ['right', 'bottom', 'left', 'top'];
    const idx = order.indexOf(currentSide || 'right');
    const nextSide = order[(idx + 1) % order.length];
    updateEdgeConfig(key, { [end]: nextSide });
  }, [updateEdgeConfig]);

  // Two-stage filter so chapter filtering is always recomputed when either
  // filters.chapters or activity.chapters changes (avoids stale-closure issues
  // with a single merged useMemo).
  const visibleTasksByFilter = useMemo(() => tasks.filter((t) => {
    const byResp = (filters.responsibles || []).length === 0 || (filters.responsibles || []).includes(t.responsible);
    const byTool = (filters.tools || []).length === 0 || (filters.tools || []).includes(t.tool);
    return byResp && byTool;
  }), [tasks, filters.responsibles, filters.tools]);

  const visibleTasks = useMemo(() => {
    const activeChapters = filters.chapters || [];
    if (activeChapters.length === 0) return visibleTasksByFilter;
    const chapters = activity.chapters || [];
    const selectedChapters = chapters.filter((c) => activeChapters.includes(c.id));
    if (selectedChapters.length === 0) return [];
    return visibleTasksByFilter.filter((t) =>
      selectedChapters.some((c) => (c.tasks || []).includes(t.id))
    );
  }, [visibleTasksByFilter, filters.chapters, activity.chapters]);

  const visibleTools = useMemo(() => { const s = new Set(visibleTasks.map((t) => t.tool)); return tools.filter((t) => s.has(t)); }, [tools, visibleTasks]);
  const { pos: autoPos, edges } = useMemo(() => computeToolLayout(visibleTools, visibleTasks), [visibleTools, visibleTasks]);
  const edgeFormats = useMemo(() => computeToolEdgeFormats(visibleTasks), [visibleTasks]);

  const pos = useMemo(() => {
    const savedPos = toolPositions || loadPositions(activity.id) || {};
    const merged = { ...autoPos };
    visibleTools.forEach((tool) => { if (savedPos[tool]) merged[tool] = savedPos[tool]; });
    return merged;
  }, [autoPos, toolPositions, visibleTools, activity.id]);

  const edgePorts = useMemo(() => {
    const allEdges = [];
    visibleTools.forEach((from) => {
      (edges[from] || new Set()).forEach((to) => {
        if (pos[from] && pos[to]) allEdges.push({ from, to });
      });
    });

    const getSide = (e, end) => {
      const key = `${e.from}→${e.to}`;
      if (edgeSides[key] && edgeSides[key][end]) return edgeSides[key][end];
      const pf = pos[e.from], pt = pos[e.to];
      if (!pf || !pt) return end === 'from' ? 'right' : 'left';
      if (end === 'from') {
        return pf.x > pt.x ? 'left' : 'right';
      } else {
        return pf.x > pt.x ? 'right' : 'left';
      }
    };

    const ports = {};
    visibleTools.forEach((tool) => {
      const p = pos[tool];
      if (!p) return;

      const sides = { left: { in: [], out: [] }, right: { in: [], out: [] }, top: { in: [], out: [] }, bottom: { in: [], out: [] } };
      allEdges.forEach((e) => {
        if (e.from === tool) {
          const s = getSide(e, 'from');
          if (sides[s]) sides[s].out.push(e);
        }
        if (e.to === tool) {
          const s = getSide(e, 'to');
          if (sides[s]) sides[s].in.push(e);
        }
      });

      ['left', 'right', 'top', 'bottom'].forEach((sName) => {
        const inList = sides[sName].in;
        inList.sort((a, b) => {
          const ta = pos[a.from], tb = pos[b.from];
          return (ta ? ta.y : 0) - (tb ? tb.y : 0) || (ta ? ta.x : 0) - (tb ? tb.x : 0);
        });
        inList.forEach((e, idx) => {
          const key = `${e.from}→${e.to}`;
          if (!ports[key]) ports[key] = {};
          ports[key].toSide = sName;
          if (sName === 'left' || sName === 'right') {
            ports[key].lx2 = sName === 'left' ? p.x : p.x + ARCH_BOX_W;
            ports[key].ly2 = inList.length === 1 ? p.y + 27 : p.y + 14 + idx * (26 / (inList.length - 1));
          } else {
            ports[key].ly2 = sName === 'top' ? p.y : p.y + ARCH_BOX_H;
            ports[key].lx2 = inList.length === 1 ? p.x + ARCH_BOX_W / 2 : p.x + 24 + idx * ((ARCH_BOX_W - 48) / (inList.length - 1));
          }
        });

        const outList = sides[sName].out;
        outList.sort((a, b) => {
          const tb = pos[b.to], ta = pos[a.to];
          return (ta ? ta.y : 0) - (tb ? tb.y : 0) || (ta ? ta.x : 0) - (tb ? tb.x : 0);
        });
        outList.forEach((e, idx) => {
          const key = `${e.from}→${e.to}`;
          if (!ports[key]) ports[key] = {};
          ports[key].fromSide = sName;
          if (sName === 'left' || sName === 'right') {
            ports[key].lx1 = sName === 'left' ? p.x : p.x + ARCH_BOX_W;
            ports[key].ly1 = outList.length === 1 ? p.y + 63 : p.y + 50 + idx * (26 / (outList.length - 1));
          } else {
            ports[key].ly1 = sName === 'top' ? p.y : p.y + ARCH_BOX_H;
            ports[key].lx1 = outList.length === 1 ? p.x + ARCH_BOX_W / 2 : p.x + 24 + idx * ((ARCH_BOX_W - 48) / (outList.length - 1));
          }
        });
      });
    });
    return ports;
  }, [visibleTools, edges, pos, edgeSides]);

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
    if (!wrapperRef.current || !maxX || !maxY) return;
    const wr = wrapperRef.current.getBoundingClientRect();
    const fitZoom = Math.min(wr.width / maxX, wr.height / maxY, 1);
    const validZoom = (!fitZoom || isNaN(fitZoom) || fitZoom < MIN_ZOOM) ? 1 : fitZoom;
    setZoom(validZoom);
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
    const p = pos[tool] || { x: 0, y: 0 };
    const mouseX = (e.clientX - rect.left) / zoom - pan.x / zoom;
    const mouseY = (e.clientY - rect.top) / zoom - pan.y / zoom;
    setDraggingTool({ tool, offsetX: mouseX - p.x, offsetY: mouseY - p.y });
  }, [pos, zoom, pan]);

  const handleSvgMouseMove = useCallback((e) => {
    if (draggingTool) {
      const rect = svgRef.current.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left) / zoom - pan.x / zoom;
      const mouseY = (e.clientY - rect.top) / zoom - pan.y / zoom;
      const newX = Math.max(20, mouseX - draggingTool.offsetX);
      const newY = Math.max(20, mouseY - draggingTool.offsetY);
      setToolPositions((prev) => ({ ...(prev || {}), ...pos, [draggingTool.tool]: { x: newX, y: newY } }));
      return;
    }
    if (draggingHandle) {
      const dx = (e.clientX - draggingHandle.startX) / zoom;
      const dy = (e.clientY - draggingHandle.startY) / zoom;
      updateEdgeConfig(draggingHandle.key, {
        dx: draggingHandle.startDx + dx,
        dy: draggingHandle.startDy + dy
      });
      return;
    }
    if (isPanning) {
      setPan((prev) => ({ x: prev.x + e.clientX - panStart.x, y: prev.y + e.clientY - panStart.y }));
      setPanStart({ x: e.clientX, y: e.clientY });
    }
  }, [draggingTool, draggingHandle, updateEdgeConfig, isPanning, panStart, pan, zoom, pos]);

  const handleSvgMouseUp = useCallback(() => {
    if (draggingTool) {
      const s = toolPositions || pos;
      savePositions(activity.id, s);
      if (onArchPositionsChange) onArchPositionsChange(s);
      setDraggingTool(null);
    }
    if (draggingHandle) {
      setDraggingHandle(null);
    }
    setIsPanning(false);
  }, [draggingTool, draggingHandle, toolPositions, pos, activity.id, onArchPositionsChange]);

  const handleSvgMouseDown = useCallback((e) => { if (e.button !== 0) return; setIsPanning(true); setPanStart({ x: e.clientX, y: e.clientY }); }, []);
  const handleResetLayout = useCallback(() => {
    setToolPositions(null);
    localStorage.removeItem(ARCH_POS_KEY(activity.id));
    if (onArchPositionsChange) onArchPositionsChange(null);
    setEdgeSides({});
    localStorage.removeItem(ARCH_SIDES_KEY(activity.id));
    if (onEdgeSidesChange) onEdgeSidesChange(null);
  }, [activity.id, onArchPositionsChange, onEdgeSidesChange]);

  const drawEdge = (from, to) => {
    const f = pos[from], t = pos[to];
    if (!f || !t) return null;
    const isBidi = edges[to]?.has(from);
    if (isBidi && from > to) return null;

    const key = `${from}→${to}`;
    const revKey = `${to}→${from}`;
    const edgeConfig = edgeSides[key] || {};

    const edgeData = edgeFormats[key];
    const fmts = edgeData && edgeData.formats ? [...edgeData.formats].join(', ') : '';
    const revEdgeData = isBidi ? edgeFormats[revKey] : null;
    const revFmts = revEdgeData && revEdgeData.formats ? [...revEdgeData.formats].join(', ') : '';

    const isPlanned = edgeData && edgeData.statuses ? edgeData.statuses.has('plan') : false;
    const isPlugin = edgeData && edgeData.types ? edgeData.types.has('plugin') : false;
    const isHov = hoveredTool === from || hoveredTool === to || selectedEdge === key;
    const color = isHov ? '#2563eb' : isPlanned ? '#d97706' : '#64748b';

    const port = edgePorts[key] || {};
    const lx1 = port.lx1 !== undefined ? port.lx1 : f.x + ARCH_BOX_W;
    const ly1 = port.ly1 !== undefined ? port.ly1 : f.y + 63;
    const lx2 = port.lx2 !== undefined ? port.lx2 : t.x;
    const ly2 = port.ly2 !== undefined ? port.ly2 : t.y + 27;
    const fromSide = port.fromSide || 'right';
    const toSide = port.toSide || 'left';

    const dist = Math.max(40, Math.min(Math.abs(lx2 - lx1) * 0.45, 140));
    const cx1 = lx1 + (fromSide === 'right' ? dist : fromSide === 'left' ? -dist : 0);
    const cy1 = ly1 + (fromSide === 'bottom' ? dist : fromSide === 'top' ? -dist : 0);
    const cx2 = lx2 + (toSide === 'right' ? dist : toSide === 'left' ? -dist : 0);
    const cy2 = ly2 + (toSide === 'bottom' ? dist : toSide === 'top' ? -dist : 0);

    const style = edgeConfig.style || 'curve';
    const dx = edgeConfig.dx || 0;
    const dy = edgeConfig.dy || 0;

    let pathD = '';
    if (style === 'straight') {
      pathD = `M ${lx1} ${ly1} Q ${(lx1 + lx2)/2 + dx} ${(ly1 + ly2)/2 + dy} ${lx2} ${ly2}`;
    } else if (style === 'elbow') {
      const midElbowX = (lx1 + lx2) / 2 + dx;
      pathD = `M ${lx1} ${ly1} H ${midElbowX} V ${ly2 + dy} H ${lx2}`;
    } else {
      pathD = `M ${lx1} ${ly1} C ${cx1 + dx} ${cy1 + dy}, ${cx2 + dx} ${cy2 + dy}, ${lx2} ${ly2}`;
    }

    const midX = 0.125 * lx1 + 0.375 * cx1 + 0.375 * cx2 + 0.125 * lx2 + dx;
    const midY = 0.125 * ly1 + 0.375 * cy1 + 0.375 * cy2 + 0.125 * ly2 + dy;

    // Receive-side label placement (t = 0.78 for from->to, t = 0.22 for to->from)
    const tFwd = 0.78;
    const fwdX = Math.pow(1-tFwd, 3)*lx1 + 3*Math.pow(1-tFwd, 2)*tFwd*(cx1+dx) + 3*(1-tFwd)*tFwd*tFwd*(cx2+dx) + tFwd*tFwd*tFwd*lx2;
    const fwdY = Math.pow(1-tFwd, 3)*ly1 + 3*Math.pow(1-tFwd, 2)*tFwd*(cy1+dy) + 3*(1-tFwd)*tFwd*tFwd*(cy2+dy) + tFwd*tFwd*tFwd*ly2;

    const tRev = 0.22;
    const revX = Math.pow(1-tRev, 3)*lx1 + 3*Math.pow(1-tRev, 2)*tRev*(cx1+dx) + 3*(1-tRev)*tRev*tRev*(cx2+dx) + tRev*tRev*tRev*lx2;
    const revY = Math.pow(1-tRev, 3)*ly1 + 3*Math.pow(1-tRev, 2)*tRev*(cy1+dy) + 3*(1-tRev)*tRev*tRev*(cy2+dy) + tRev*tRev*tRev*ly2;

    const markerId = isHov ? 'arch-arr-blue' : isPlanned ? 'arch-arr-orange' : 'arch-arr-gray';

    let labelTxt = fmts;
    if (!labelTxt && isPlugin) labelTxt = 'Plug-in';
    const badgeW = labelTxt ? labelTxt.length * 6.5 + 12 : 0;
    const revBadgeW = revFmts ? revFmts.length * 6.5 + 12 : 0;

    const badgeFill = isPlugin ? '#faf5ff' : isPlanned ? '#fffbeb' : isHov ? '#eff6ff' : '#f1f5f9';
    const badgeStroke = isPlugin ? '#9333ea' : isPlanned ? '#d97706' : color;
    const badgeTextFill = isPlugin ? '#6b21a8' : isPlanned ? '#b45309' : isHov ? '#1d4ed8' : '#475569';
    const lineOpacity = hoveredTool ? (isHov ? 1 : 0.12) : 0.55;

    return (
      <g key={key} onClick={(e) => { e.stopPropagation(); setSelectedEdge(selectedEdge === key ? null : key); }}>
        <path d={pathD}
          fill="none" stroke={color} strokeWidth={isHov ? 2.5 : 1.5}
          strokeDasharray={isPlanned ? '6,4' : undefined}
          strokeOpacity={lineOpacity}
          markerEnd={`url(#${markerId})`}
          markerStart={isBidi ? `url(#${markerId})` : undefined}
          style={{ transition: 'stroke 0.2s ease, stroke-opacity 0.2s ease, stroke-width 0.2s ease', cursor: 'pointer' }} />

        <circle cx={lx1} cy={ly1} r={isHov ? 5 : 3.5} fill={color} stroke="#ffffff" strokeWidth={1}
          style={{ cursor: 'pointer', opacity: lineOpacity }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); togglePortSide(key, 'from', fromSide); }}
          title={`Click to switch source port (${fromSide})`} />

        <circle cx={lx2} cy={ly2} r={isHov ? 5 : 3.5} fill={color} stroke="#ffffff" strokeWidth={1}
          style={{ cursor: 'pointer', opacity: lineOpacity }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); togglePortSide(key, 'to', toSide); }}
          title={`Click to switch target port (${toSide})`} />

        {labelTxt && (
          <g transform={`translate(${fwdX}, ${fwdY})`}
            style={{ cursor: 'pointer', opacity: lineOpacity }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setSelectedEdge(key); }}>
            <rect x={-badgeW / 2} y={-9} width={badgeW} height={18} rx={5}
              fill={badgeFill} stroke={badgeStroke} strokeWidth={1} />
            <text textAnchor="middle" y={4} fontSize="9.5px" fontWeight="700" fill={badgeTextFill}
              style={{ pointerEvents: 'none', userSelect: 'none' }}>{labelTxt}</text>
          </g>
        )}

        {isBidi && revFmts && (
          <g transform={`translate(${revX}, ${revY})`}
            style={{ cursor: 'pointer', opacity: lineOpacity }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setSelectedEdge(key); }}>
            <rect x={-revBadgeW / 2} y={-9} width={revBadgeW} height={18} rx={5}
              fill={badgeFill} stroke={badgeStroke} strokeWidth={1} />
            <text textAnchor="middle" y={4} fontSize="9.5px" fontWeight="700" fill={badgeTextFill}
              style={{ pointerEvents: 'none', userSelect: 'none' }}>{revFmts}</text>
          </g>
        )}

        {selectedEdge === key && (
          <g>
            <circle cx={midX} cy={midY} r={6} fill="#2563eb" stroke="#ffffff" strokeWidth={2}
              style={{ cursor: 'move' }}
              onMouseDown={(e) => {
                e.stopPropagation();
                setDraggingHandle({ key, startX: e.clientX, startY: e.clientY, startDx: dx, startDy: dy });
              }}
              title="Drag to adjust arrow curve" />

            <foreignObject x={midX - 110} y={midY - 45} width={220} height={32} style={{ overflow: 'visible' }}>
              <div style={{ display: 'flex', gap: '4px', background: '#1e293b', padding: '4px 6px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' }}
                onMouseDown={(e) => e.stopPropagation()}>
                {['curve', 'straight', 'elbow'].map((st) => (
                  <button key={st} type="button"
                    style={{ background: style === st ? '#2563eb' : 'transparent', color: '#fff', border: 'none', borderRadius: '4px', padding: '2px 6px', fontSize: '10px', fontWeight: '600', cursor: 'pointer', textTransform: 'capitalize' }}
                    onClick={() => updateEdgeConfig(key, { style: st })}>
                    {st}
                  </button>
                ))}
                <div style={{ width: '1px', height: '14px', background: '#475569', margin: '0 2px' }} />
                <button type="button"
                  style={{ background: '#334155', color: '#cbd5e1', border: 'none', borderRadius: '4px', padding: '2px 5px', fontSize: '10px', cursor: 'pointer' }}
                  onClick={() => updateEdgeConfig(key, { dx: 0, dy: 0 })}
                  title="Reset curve offset">
                  Reset
                </button>
              </div>
            </foreignObject>
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
      <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 100, padding: '6px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 20, fontSize: 11, fontWeight: 600, color: '#1e40af', pointerEvents: 'none', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
        💡 Tip: Click line endpoints or labels to switch between Left & Right side
      </div>

      <ZoomControls zoom={zoom} onZoom={handleStepZoom} onFit={handleFit} />

      <svg ref={svgRef} width={maxX} height={maxY}
        style={{ display: 'block', userSelect: 'none', cursor: draggingTool ? 'grabbing' : isPanning ? 'grabbing' : 'grab', width: '100%', height: '100%' }}
        viewBox={`${-pan.x / (zoom && !isNaN(zoom) && zoom > 0 ? zoom : 1)} ${-pan.y / (zoom && !isNaN(zoom) && zoom > 0 ? zoom : 1)} ${maxX / (zoom && !isNaN(zoom) && zoom > 0 ? zoom : 1)} ${maxY / (zoom && !isNaN(zoom) && zoom > 0 ? zoom : 1)}`}
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
const WorkflowCanvas = ({ activity, filters, toolNotes, onToolNoteChange, onFilterChange, docPositions: persistedDocPositions, onDocPositionsChange, archPositions: persistedArchPositions, onArchPositionsChange, allArchPositions, edgeSides: persistedEdgeSides, onEdgeSidesChange, allEdgeSides, workflowData, activeActivityIndex, searchQuery }) => {
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

  // handleResetDocPositions is defined later, after visibleTasks/visibleTools/visibleCanvasWidth are available

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

  // Two-stage filter so chapter filtering is always recomputed when either
  // filters.chapters or activity.chapters changes (avoids stale-closure issues
  // with a single merged useMemo).
  const visibleTasksByFilter = useMemo(() => tasks.filter((t) => {
    const byResp = (filters.responsibles || []).length === 0 || (filters.responsibles || []).includes(t.responsible);
    const byTool = (filters.tools || []).length === 0 || (filters.tools || []).includes(t.tool);
    return byResp && byTool;
  }), [tasks, filters.responsibles, filters.tools]);

  const visibleTasks = useMemo(() => {
    const activeChapters = filters.chapters || [];
    if (activeChapters.length === 0) return visibleTasksByFilter;
    const chapters = activity.chapters || [];
    const selectedChapters = chapters.filter((c) => activeChapters.includes(c.id));
    if (selectedChapters.length === 0) return [];
    return visibleTasksByFilter.filter((t) =>
      selectedChapters.some((c) => (c.tasks || []).includes(t.id))
    );
  }, [visibleTasksByFilter, filters.chapters, activity.chapters]);

  const visibleTools = useMemo(() => { const s = new Set(visibleTasks.map((t) => t.tool)); return tools.filter((tool) => s.has(tool)); }, [tools, visibleTasks]);
  const visibleDocIds = useMemo(() => { const s = new Set(); visibleTasks.forEach((t) => { (t.inputs || []).forEach((id) => s.add(id)); (t.outputs || []).forEach((id) => s.add(id)); }); return s; }, [visibleTasks]);
  const visibleDocuments = useMemo(() => documents.filter((d) => visibleDocIds.has(d.id)), [documents, visibleDocIds]);

  // visibleCanvasWidth: horizontal extent of only the visible (filtered) tasks.
  // This makes lane length shrink proportionally when a chapter filter is active.
  const visibleCanvasWidth = useMemo(
    () => visibleTasks.length > 0
      ? Math.max(...visibleTasks.map((t) => t.startTime + t.duration), 600) + 20
      : 620,
    [visibleTasks]
  );

  // Now that visible* vars are available, define handleResetDocPositions so it
  // can use visibleDocuments / visibleTasks / visibleTools / visibleCanvasWidth.
  const handleResetDocPositions = useCallback(() => {
    const defaults = buildDefaultPositions(visibleDocuments, visibleTasks, visibleTools, collapsedTools, visibleCanvasWidth);
    setDocPositions(defaults);
    if (onDocPositionsChange) onDocPositionsChange(null);
  }, [visibleDocuments, visibleTasks, visibleTools, collapsedTools, visibleCanvasWidth, onDocPositionsChange]);

  const canvasHeight = visibleTools.reduce((sum, tool) => sum + getToolHeight(tool, collapsedTools, visibleTasks) + LANE_GAP, 0);
  const svgWidth = visibleCanvasWidth + MARGIN.left + MARGIN.right;
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

  const handleToolClick = useCallback((tool) => { onFilterChange((prev) => ({ ...(typeof prev === 'object' ? prev : {}), responsibles: [], tools: [tool] })); setView('timeline'); }, [onFilterChange]);

  if (view === 'arch') {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <button onClick={() => setView('timeline')}
          style={{ position: 'absolute', top: 12, left: 12, zIndex: 101, padding: '8px 14px', background: '#1e40af', color: '#ffffff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
          ← Timeline view
        </button>
        <ArchitectureView
          activity={activity}
          filters={filters}
          toolNotes={toolNotes}
          onToolNoteChange={onToolNoteChange}
          onToolClick={handleToolClick}
          onFilterChange={onFilterChange}
          searchMatchTools={searchMatchTools}
          archPositions={persistedArchPositions}
          onArchPositionsChange={onArchPositionsChange}
          edgeSides={persistedEdgeSides}
          onEdgeSidesChange={onEdgeSidesChange}
        />
      </div>
    );
  }

  return (
    <div className="canvas-wrapper" ref={wrapperRef} style={{ position: 'relative', overflow: 'hidden', width: '100%', height: '100%' }}>
      <button onClick={() => { onFilterChange((prev) => ({ ...(typeof prev === 'object' ? prev : {}), responsibles: [], tools: [] })); setView('arch'); }}
        style={{ position: 'absolute', top: 12, left: 12, zIndex: 100, padding: '8px 14px', background: '#1e40af', color: '#ffffff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
        ⬡ Architecture view
      </button>
      <button onClick={() => setShowExportModal(true)}
        title="Download a read-only, self-contained HTML file of this diagram — nothing is uploaded or stored remotely"
        style={{ position: 'absolute', top: 12, left: 168, zIndex: 100, padding: '8px 14px', background: '#ffffff', color: '#1e40af', border: '1.5px solid #1e40af', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        ⬇ Export viewer
      </button>
      <button onClick={handleResetDocPositions}
        title="Reset document cards back to their default auto-arranged vertical positions"
        style={{ position: 'absolute', top: 12, right: 12, zIndex: 100, padding: '8px 12px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500, color: '#64748b', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        ↺ Auto-arrange docs
      </button>

      <ZoomControls zoom={zoom} onZoom={handleStepZoom} onFit={handleFit} />

      <svg ref={svgRef} width={svgWidth} height={svgHeight}
        style={{ background: '#f8f9fb', display: 'block', userSelect: 'none', cursor: isPanning ? 'grabbing' : 'grab', width: '100%', height: '100%' }}
        viewBox={`${-pan.x / (zoom && !isNaN(zoom) && zoom > 0 ? zoom : 1)} ${-pan.y / (zoom && !isNaN(zoom) && zoom > 0 ? zoom : 1)} ${svgWidth / (zoom && !isNaN(zoom) && zoom > 0 ? zoom : 1)} ${svgHeight / (zoom && !isNaN(zoom) && zoom > 0 ? zoom : 1)}`}
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

          <text x={visibleCanvasWidth / 2} y={-30} textAnchor="middle" fontSize="18px" fontWeight="700" fill="#1e293b">{name}</text>

          {visibleTools.map((tool, i) => {
            let toolY = 0;
            for (let j = 0; j < i; j++) toolY += getToolHeight(visibleTools[j], collapsedTools, visibleTasks) + LANE_GAP;
            const isCollapsed = collapsedTools.has(tool);
            const toolDisplayHeight = getToolHeight(tool, collapsedTools, visibleTasks);
            const hasNote = !!(toolNotes && toolNotes[tool]?.trim());
            return (
              <g key={tool}>
                <rect x={0} y={toolY} width={visibleCanvasWidth} height={toolDisplayHeight} rx={6} fill="#ffffff" stroke="#2563eb" strokeWidth={2} />
                <text x={12} y={toolY + 24} fontSize="12px" fontWeight="700" fill="#1d4ed8" style={{ pointerEvents: 'none' }}>{tool}</text>
                <g style={{ cursor: 'pointer' }} onClick={() => toggleToolCollapse(tool)}>
                  <circle cx={150} cy={toolY + 17} r={12} fill="#ffffff" fillOpacity="0.01" stroke="#94a3b8" strokeWidth={1.5} />
                  <text x={150} y={toolY + 22} textAnchor="middle" fontSize="12px" fontWeight="700" fill="#94a3b8"
                    transform={isCollapsed ? `rotate(-90, 150, ${toolY + 22})` : undefined}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}>▼</text>
                </g>
                {!isCollapsed && <line x1={0} y1={toolY + 34} x2={visibleCanvasWidth} y2={toolY + 34} stroke="#2563eb" strokeWidth={1} strokeOpacity={0.15} />}
                {!isCollapsed && (
                  <text x={visibleCanvasWidth - 14} y={toolY + toolDisplayHeight - 10} textAnchor="end" fontSize="24px" fontWeight="800" fill="#2563eb" fillOpacity="0.15" style={{ pointerEvents: 'none', userSelect: 'none' }}>{tool}</text>
                )}
                <g style={{ cursor: 'pointer' }} onClick={() => setOpenNoteTool(openNoteTool === tool ? null : tool)}>
                  <circle cx={visibleCanvasWidth - 18} cy={toolY + 17} r={10} fill={hasNote ? '#2563eb' : '#eff6ff'} stroke="#2563eb" strokeWidth={1.5} />
                  <text x={visibleCanvasWidth - 18} y={toolY + 22} textAnchor="middle" fontSize="13px" fontWeight="700" fill={hasNote ? '#ffffff' : '#2563eb'} style={{ pointerEvents: 'none', userSelect: 'none' }}>{hasNote ? '✎' : '+'}</text>
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
            edgeSides: (() => {
              const m = {};
              (workflowData?.activities || [activity]).forEach((act) => {
                const s = allEdgeSides?.[act.id] || loadEdgeSides(act.id);
                if (s) m[act.id] = s;
              });
              return m;
            })(),
            toolPositions: (() => {
              const m = {};
              (workflowData?.activities || [activity]).forEach((act) => {
                const p = allArchPositions?.[act.id] || loadPositions(act.id);
                if (p) m[act.id] = p;
              });
              return m;
            })(),
            scope,
            activeActivityIndex: activeActivityIndex || 0,
          })}
        />
      )}
    </div>
  );
};

export default WorkflowCanvas;