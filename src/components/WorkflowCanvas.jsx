import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import TaskNode, { TASK_HEIGHT } from './TaskNode';
import DocumentNode, { DOC_WIDTH, DOC_HEIGHT } from './DocumentNode';

const MARGIN = { top: 110, right: 180, bottom: 60, left: 200 };
const TOOL_HEIGHT = 160;
const COLLAPSED_HEIGHT = 34;
const TASK_GAP = 18;
const LANE_GAP = 12;
const DOC_LEFT_X = 20;
const DOC_RIGHT_OFFSET = 30;
const ELBOW_STUB = 28;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;
const STORAGE_KEY = 'workflow_collapsed_tools';

const getCollapsedTools = () => {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); }
  catch { return new Set(); }
};
const saveCollapsedTools = (set) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
};
const getToolHeight = (tool, collapsedTools) =>
  collapsedTools.has(tool) ? COLLAPSED_HEIGHT : TOOL_HEIGHT;

const getTaskY = (task, tasks, tools, collapsedTools) => {
  const toolIndex = tools.indexOf(task.tool);
  if (toolIndex === -1 || collapsedTools.has(task.tool)) return -9999;
  const tasksInToolBefore = tasks.filter(
    (t) => t.tool === task.tool && t.startTime < task.startTime
  ).length;
  let baseY = 50;
  for (let i = 0; i < toolIndex; i++)
    baseY += getToolHeight(tools[i], collapsedTools) + LANE_GAP;
  const offset = tasksInToolBefore * (TASK_HEIGHT + TASK_GAP);
  const maxY = baseY + TOOL_HEIGHT - TASK_HEIGHT - 10;
  return Math.min(baseY + offset, maxY);
};

const getTaskX = (task) => task.startTime;
const depId = (d) => (typeof d === 'object' ? d.id : d);

const curvedPath = (x1, y1, x2, y2) => {
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
};
const elbowPath = (x1, y1, x2, y2, isInput) => isInput
  ? `M ${x1} ${y1} H ${x1 + ELBOW_STUB} V ${y2} H ${x2}`
  : `M ${x1} ${y1} H ${x2 - ELBOW_STUB} V ${y2} H ${x2}`;

const buildDefaultPositions = (documents, canvasHeight, canvasWidth) => {
  const inputDocs = documents.filter((d) => d.type === 'input');
  const outputDocs = documents.filter((d) => d.type === 'output');
  const getY = (i, total) => {
    const spacing = Math.min(canvasHeight / total, 90);
    const startY = (canvasHeight - total * spacing) / 2 + 10;
    return startY + i * spacing;
  };
  const positions = {};
  inputDocs.forEach((doc, i) => { positions[doc.id] = { x: -MARGIN.left + DOC_LEFT_X, y: getY(i, inputDocs.length) }; });
  outputDocs.forEach((doc, i) => { positions[doc.id] = { x: canvasWidth + DOC_RIGHT_OFFSET, y: getY(i, outputDocs.length) }; });
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
        {task.dependencies.length > 0 && <p><strong>Depends on:</strong> {task.dependencies.map((d) => depId(d)).join(', ')}</p>}
        {inputDocs.length > 0 && <p><strong>Inputs:</strong> {inputDocs.map((d) => d.name).join(', ')}</p>}
        {outputDocs.length > 0 && <p><strong>Outputs:</strong> {outputDocs.map((d) => d.name).join(', ')}</p>}
      </div>
    </div>
  );
};

const ToolNotePanel = ({ tool, note, toolY, onClose, onSave }) => {
  const [text, setText] = useState(note || '');
  return (
    <div style={{ position: 'absolute', top: MARGIN.top + toolY + 36, left: MARGIN.left + 40, width: 320, background: '#ffffff', border: '1.5px solid #2563eb', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', zIndex: 500, padding: 14 }}
      onMouseDown={(e) => e.stopPropagation()}>
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


// ── Architecture View ─────────────────────────────────────────────────────────
const ARCH_BOX_W = 160;
const ARCH_BOX_H = 80;
const ARCH_COL_GAP = 120;
const ARCH_ROW_GAP = 60;

// Topological sort → assign column (depth) per tool
const computeToolLayout = (tools, tasks) => {
  const toolSet = new Set(tools);
  const edges = {};
  tools.forEach((t) => { edges[t] = new Set(); });

  tasks.forEach((task) => {
    task.dependencies.forEach((dep) => {
      const fromTool = tasks.find((t) => t.id === depId(dep))?.tool;
      // Only add edge if both tools are visible
      if (fromTool && fromTool !== task.tool && toolSet.has(fromTool) && toolSet.has(task.tool)) {
        edges[fromTool].add(task.tool);
      }
    });
  });

  // Assign depth via longest path — cap iterations to tools.length to prevent infinite loop on cycles
  const depth = {};
  tools.forEach((t) => { depth[t] = 0; });
  for (let pass = 0; pass < tools.length; pass++) {
    tools.forEach((from) => {
      edges[from].forEach((to) => {
        if (depth[to] <= depth[from]) depth[to] = depth[from] + 1;
      });
    });
  }

  // Group by column
  const cols = {};
  tools.forEach((t) => {
    const c = depth[t];
    if (!cols[c]) cols[c] = [];
    cols[c].push(t);
  });

  // Assign x,y positions
  const pos = {};
  Object.entries(cols).forEach(([col, colTools]) => {
    const x = parseInt(col) * (ARCH_BOX_W + ARCH_COL_GAP) + 60;
    colTools.forEach((tool, row) => {
      pos[tool] = { x, y: row * (ARCH_BOX_H + ARCH_ROW_GAP) + 60 };
    });
  });

  return { pos, edges };
};

// Collect all formats per tool-pair
const computeToolEdgeFormats = (tasks) => {
  const map = {}; // "from->to" → Set(format)
  tasks.forEach((task) => {
    task.dependencies.forEach((dep) => {
      const fromTool = tasks.find((t) => t.id === depId(dep))?.tool;
      if (fromTool && fromTool !== task.tool) {
        const key = `${fromTool}→${task.tool}`;
        if (!map[key]) map[key] = new Set();
        const fmt = typeof dep === 'object' ? dep.format : '';
        if (fmt) map[key].add(fmt);
      }
    });
  });
  return map;
};

const ArchitectureView = ({ activity, filters, toolNotes, onToolNoteChange, onToolClick }) => {
  const { tasks, tools, responsibles } = activity;
  const [openNoteTool, setOpenNoteTool] = useState(null);
  const [hoveredTool, setHoveredTool] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const svgRef = useRef(null);
  const wrapperRef = useRef(null);

  // Apply same filters as timeline
  const visibleTasks = useMemo(() => tasks.filter((t) => {
    const byResp = filters.responsibles.length === 0 || filters.responsibles.includes(t.responsible);
    const byTool = filters.tools.length === 0 || filters.tools.includes(t.tool);
    return byResp && byTool;
  }), [tasks, filters]);

  const visibleTools = useMemo(() => {
    const set = new Set(visibleTasks.map((t) => t.tool));
    return tools.filter((t) => set.has(t));
  }, [tools, visibleTasks]);

  const { pos, edges } = useMemo(() => computeToolLayout(visibleTools, visibleTasks), [visibleTools, visibleTasks]);
  const edgeFormats = useMemo(() => computeToolEdgeFormats(visibleTasks), [visibleTasks]);

  // Responsible colours per tool
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
  const maxX = (vals.length ? vals.reduce((m, p) => Math.max(m, p.x), 0) : 0) + ARCH_BOX_W + 80;
  const maxY = (vals.length ? vals.reduce((m, p) => Math.max(m, p.y), 0) : 0) + ARCH_BOX_H + 80;

  const handleWheel = useCallback((e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom((prev) => {
      const nz = Math.min(Math.max(prev * (e.deltaY > 0 ? 0.9 : 1.1), 0.3), 3);
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

  const handleMouseDown = useCallback((e) => { if (e.button !== 0) return; setIsPanning(true); setPanStart({ x: e.clientX, y: e.clientY }); }, []);
  const handleMouseMove = useCallback((e) => {
    if (!isPanning) return;
    setPan((prev) => ({ x: prev.x + e.clientX - panStart.x, y: prev.y + e.clientY - panStart.y }));
    setPanStart({ x: e.clientX, y: e.clientY });
  }, [isPanning, panStart]);
  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  const handleFit = useCallback(() => {
    if (!svgRef.current || !wrapperRef.current) return;
    const wr = wrapperRef.current.getBoundingClientRect();
    setZoom(Math.min(wr.width / maxX, wr.height / maxY, 1));
    setPan({ x: 0, y: 0 });
  }, [maxX, maxY]);

  useEffect(() => { handleFit(); }, [visibleTools.length]); // eslint-disable-line

  // Draw edge: centre-right of from box → centre-left of to box
  const drawEdge = (from, to) => {
    const f = pos[from], t = pos[to];
    if (!f || !t) return null;
    const x1 = f.x + ARCH_BOX_W, y1 = f.y + ARCH_BOX_H / 2;
    const x2 = t.x, y2 = t.y + ARCH_BOX_H / 2;
    const mx = (x1 + x2) / 2;
    const key = `${from}→${to}`;
    const fmts = edgeFormats[key] ? [...edgeFormats[key]].join(', ') : '';
    const isHov = hoveredTool === from || hoveredTool === to;
    const color = isHov ? '#2563eb' : '#94a3b8';
    const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
    return (
      <g key={key}>
        <path d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
          fill="none" stroke={color} strokeWidth={isHov ? 2.5 : 1.8}
          strokeOpacity={hoveredTool && !isHov ? 0.15 : 0.8}
          markerEnd="url(#arch-arrow)" />
        {fmts && (
          <g transform={`translate(${midX}, ${midY - 10})`}>
            <rect x={-fmts.length * 3 - 4} y={-8} width={fmts.length * 6 + 8} height={16} rx={4}
              fill="#f1f5f9" stroke={color} strokeWidth={1} />
            <text textAnchor="middle" y={4} fontSize="9px" fontWeight="600" fill="#475569"
              style={{ pointerEvents: 'none', userSelect: 'none' }}>{fmts}</text>
          </g>
        )}
      </g>
    );
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative', overflow: 'hidden', width: '100%', height: '100%', background: '#f8f9fb' }}>
      <button onClick={handleFit} style={{ position: 'absolute', top: 12, right: 12, zIndex: 100, padding: '8px 12px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500, color: '#64748b', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        🔄 Fit to screen
      </button>
      <div style={{ position: 'absolute', bottom: 12, right: 12, zIndex: 100, padding: '6px 10px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 11, color: '#64748b' }}>
        {(zoom * 100).toFixed(0)}%
      </div>

      <svg ref={svgRef} width={maxX} height={maxY}
        style={{ display: 'block', userSelect: 'none', cursor: isPanning ? 'grabbing' : 'grab', width: '100%', height: '100%' }}
        viewBox={`0 0 ${maxX} ${maxY}`}
        onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>

        <defs>
          <marker id="arch-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
          </marker>
        </defs>

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>

          {/* Edges first (behind boxes) */}
          {visibleTools.map((from) =>
            [...(edges[from] || [])].map((to) => drawEdge(from, to))
          )}

          {/* Tool boxes */}
          {visibleTools.map((tool) => {
            const p = pos[tool];
            if (!p) return null;
            const resps = toolResps[tool] || [];
            const count = taskCount(tool);
            const hasNote = !!(toolNotes && toolNotes[tool]?.trim());
            const isHov = hoveredTool === tool;
            return (
              <g key={tool} style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoveredTool(tool)}
                onMouseLeave={() => setHoveredTool(null)}
                onClick={() => onToolClick(tool)}>
                {/* Shadow */}
                <rect x={p.x + 3} y={p.y + 3} width={ARCH_BOX_W} height={ARCH_BOX_H} rx={10}
                  fill="rgba(0,0,0,0.08)" />
                {/* Box */}
                <rect x={p.x} y={p.y} width={ARCH_BOX_W} height={ARCH_BOX_H} rx={10}
                  fill="#ffffff" stroke={isHov ? '#2563eb' : '#cbd5e1'} strokeWidth={isHov ? 2.5 : 1.5} />
                {/* Colour bar from first responsible */}
                {resps[0] && <rect x={p.x} y={p.y} width={ARCH_BOX_W} height={8} rx={10} fill={resps[0].taskColor} />}
                {resps[0] && <rect x={p.x} y={p.y + 4} width={ARCH_BOX_W} height={4} fill={resps[0].taskColor} />}
                {/* Tool name */}
                <text x={p.x + ARCH_BOX_W / 2} y={p.y + 30} textAnchor="middle"
                  fontSize="12px" fontWeight="700" fill="#1e293b"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}>{tool}</text>
                {/* Task count */}
                <text x={p.x + ARCH_BOX_W / 2} y={p.y + 48} textAnchor="middle"
                  fontSize="10px" fill="#64748b"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}>{count} task{count !== 1 ? 's' : ''}</text>
                {/* Responsible dots */}
                {resps.slice(0, 4).map((r, ri) => (
                  <circle key={r.key} cx={p.x + 12 + ri * 14} cy={p.y + 64} r={6}
                    fill={r.taskColor} stroke="#ffffff" strokeWidth={1.5} />
                ))}
                {/* Note button */}
                <g onClick={(e) => { e.stopPropagation(); setOpenNoteTool(openNoteTool === tool ? null : tool); }}>
                  <circle cx={p.x + ARCH_BOX_W - 14} cy={p.y + 64} r={8}
                    fill={hasNote ? '#2563eb' : '#eff6ff'} stroke="#2563eb" strokeWidth={1.5} />
                  <text x={p.x + ARCH_BOX_W - 14} y={p.y + 68} textAnchor="middle"
                    fontSize="11px" fontWeight="700" fill={hasNote ? '#fff' : '#2563eb'}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}>{hasNote ? '✎' : '+'}</text>
                </g>
              </g>
            );
          })}
        </g>
      </svg>

      {openNoteTool && pos[openNoteTool] && (
        <div style={{ position: 'absolute', top: (pos[openNoteTool].y + ARCH_BOX_H + 8) * zoom + pan.y, left: pos[openNoteTool].x * zoom + pan.x, width: 300, background: '#ffffff', border: '1.5px solid #2563eb', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', zIndex: 500, padding: 14 }}
          onMouseDown={(e) => e.stopPropagation()}>
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
const WorkflowCanvas = ({ activity, filters, toolNotes, onToolNoteChange, onFilterChange }) => {
  const { tasks, tools, responsibles, documents, name } = activity;

  const [view, setView] = useState('timeline'); // 'timeline' | 'arch'

  const canvasWidth = Math.max(...tasks.map((t) => t.startTime + t.duration), 600) + 20;

  const [hoveredTaskId, setHoveredTaskId] = useState(null);
  const [hoveredDocId, setHoveredDocId] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [docPositions, setDocPositions] = useState(() =>
    buildDefaultPositions(documents, tools.length * (TOOL_HEIGHT + LANE_GAP), canvasWidth)
  );
  const [docHeights, setDocHeights] = useState({});
  const [dragging, setDragging] = useState(null);
  const [openNoteTool, setOpenNoteTool] = useState(null);
  const [collapsedTools, setCollapsedTools] = useState(() => getCollapsedTools());
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const wrapperRef = useRef(null);
  const svgRef = useRef(null);

  const handleDocHeight = useCallback((docId, h) => {
    setDocHeights((prev) => (prev[docId] === h ? prev : { ...prev, [docId]: h }));
  }, []);

  useEffect(() => {
    setDocPositions(buildDefaultPositions(documents, tools.length * (TOOL_HEIGHT + LANE_GAP), canvasWidth));
    setDocHeights({});
  }, [activity.id]); // eslint-disable-line

  const toggleToolCollapse = useCallback((tool) => {
    setCollapsedTools((prev) => {
      const next = new Set(prev);
      next.has(tool) ? next.delete(tool) : next.add(tool);
      saveCollapsedTools(next);
      return next;
    });
  }, []);

  // Wheel must be declared before the useEffect that registers it
  const handleWheel = useCallback((e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom((prevZoom) => {
      const newZoom = Math.min(Math.max(prevZoom * (e.deltaY > 0 ? 0.9 : 1.1), MIN_ZOOM), MAX_ZOOM);
      if (svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const r = newZoom / prevZoom;
        setPan((prev) => ({ x: mx - (mx - prev.x) * r, y: my - (my - prev.y) * r }));
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

  const handleResetZoomPan = useCallback(() => {
    if (!svgRef.current || !wrapperRef.current) return;
    const wr = wrapperRef.current.getBoundingClientRect();
    const sw = parseInt(svgRef.current.getAttribute('width'));
    // Fit to width only — let height scroll naturally
    const fitZoom = Math.min(wr.width / sw, 1);
    setZoom(Math.max(fitZoom, 0.65));
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => { handleResetZoomPan(); }, [canvasWidth, tools.length]); // eslint-disable-line

  const handleSvgMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX, y: e.clientY });
  }, []);

  const handleSvgMouseMove = useCallback((e) => {
    if (dragging) {
      const rect = e.currentTarget.getBoundingClientRect();
      setDocPositions((prev) => ({
        ...prev,
        [dragging.id]: {
          x: (e.clientX - rect.left - MARGIN.left - dragging.offsetX - pan.x) / zoom,
          y: (e.clientY - rect.top - MARGIN.top - dragging.offsetY - pan.y) / zoom,
        },
      }));
      return;
    }
    if (isPanning) {
      setPan((prev) => ({ x: prev.x + e.clientX - panStart.x, y: prev.y + e.clientY - panStart.y }));
      setPanStart({ x: e.clientX, y: e.clientY });
    }
  }, [dragging, isPanning, panStart, zoom, pan]);

  const handleSvgMouseUp = useCallback(() => { setDragging(null); setIsPanning(false); }, []);
  const handleSvgMouseLeave = useCallback(() => { setIsPanning(false); }, []);

  const handleDocMouseDown = useCallback((e, docId) => {
    e.preventDefault();
    e.stopPropagation();
    setIsPanning(false);
    const rect = e.currentTarget.closest('svg').getBoundingClientRect();
    const pos = docPositions[docId];
    setDragging({
      id: docId,
      offsetX: (e.clientX - rect.left - MARGIN.left - pan.x) / zoom - pos.x,
      offsetY: (e.clientY - rect.top - MARGIN.top - pan.y) / zoom - pos.y,
    });
  }, [docPositions, pan, zoom]);

  // ── Derived state ──
  const visibleTasks = useMemo(() => tasks.filter((t) => {
    const byResp = filters.responsibles.length === 0 || filters.responsibles.includes(t.responsible);
    const byTool = filters.tools.length === 0 || filters.tools.includes(t.tool);
    return byResp && byTool;
  }), [tasks, filters]);

  const visibleTools = useMemo(() => {
    const set = new Set(visibleTasks.map((t) => t.tool));
    return tools.filter((tool) => set.has(tool));
  }, [tools, visibleTasks]);

  const visibleDocIds = useMemo(() => {
    const s = new Set();
    visibleTasks.forEach((t) => {
      (t.inputs || []).forEach((id) => s.add(id));
      (t.outputs || []).forEach((id) => s.add(id));
    });
    return s;
  }, [visibleTasks]);

  const visibleDocuments = useMemo(() => documents.filter((d) => visibleDocIds.has(d.id)), [documents, visibleDocIds]);

  const canvasHeight = visibleTools.reduce((sum, tool) => sum + getToolHeight(tool, collapsedTools) + LANE_GAP, 0);
  const svgWidth = canvasWidth + MARGIN.left + MARGIN.right;
  const svgHeight = canvasHeight + MARGIN.top + MARGIN.bottom;

  const hoveredTask = tasks.find((t) => t.id === hoveredTaskId) || null;

  const depChain = useMemo(() => {
    if (!hoveredTask) return new Set();
    const chain = new Set();
    const walk = (id) => {
      const t = tasks.find((x) => x.id === id);
      if (!t) return;
      t.dependencies.forEach((d) => { chain.add(depId(d)); walk(depId(d)); });
    };
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

  const respMap = useMemo(() => {
    const m = {};
    responsibles.forEach((r) => { m[r.key] = r; });
    return m;
  }, [responsibles]);

  const getDocLineProps = (docId, isInput) => {
    const isDocHighlighted = highlightedDocs.has(docId);
    const color = isDocHighlighted ? (isInput ? '#2563eb' : '#059669') : '#94a3b8';
    const opacity = hoveredTask || hoveredDocId ? (isDocHighlighted ? 0.95 : 0.06) : 0.35;
    return { color, opacity, strokeWidth: hoveredDocId === docId || isDocHighlighted ? 2.2 : 1.5 };
  };

  const openNoteToolIndex = openNoteTool ? visibleTools.indexOf(openNoteTool) : -1;
  let openNoteToolY = 0;
  for (let i = 0; i < openNoteToolIndex; i++)
    openNoteToolY += getToolHeight(visibleTools[i], collapsedTools) + LANE_GAP;

  // ── Tool click from arch view: filter to that tool + switch to timeline ──
  const handleToolClick = useCallback((tool) => {
    onFilterChange({ responsibles: [], tools: [tool] });
    setView('timeline');
  }, [onFilterChange]);

  // ── Architecture view ──
  if (view === 'arch') {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <button onClick={() => setView('timeline')}
          style={{ position: 'absolute', top: 12, left: 12, zIndex: 100, padding: '8px 14px', background: '#1e40af', color: '#ffffff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
          ← Timeline view
        </button>
        <ArchitectureView
          activity={activity} filters={filters}
          toolNotes={toolNotes} onToolNoteChange={onToolNoteChange}
          onToolClick={handleToolClick} />
      </div>
    );
  }

  return (
    <div className="canvas-wrapper" ref={wrapperRef} style={{ position: 'relative', overflow: 'auto' }}>

      {/* View toggle */}
      <button onClick={() => setView('arch')}
        style={{ position: 'absolute', top: 12, left: 12, zIndex: 100, padding: '8px 14px', background: '#1e40af', color: '#ffffff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
        ⬡ Architecture view
      </button>

      <button onClick={handleResetZoomPan} title="Fit to screen (Ctrl+Scroll to zoom, drag to pan)"
        style={{ position: 'absolute', top: 12, right: 12, zIndex: 100, padding: '8px 12px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500, color: '#64748b', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#2563eb'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.color = '#64748b'; }}>
        🔄 Fit to screen
      </button>

      <div style={{ position: 'absolute', bottom: 12, right: 12, zIndex: 100, padding: '6px 10px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 11, fontWeight: 500, color: '#64748b', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        {(zoom * 100).toFixed(0)}%
      </div>

      <svg ref={svgRef} width={svgWidth} height={svgHeight}
        style={{ background: '#f8f9fb', display: 'block', userSelect: 'none', cursor: isPanning ? 'grabbing' : 'grab' }}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        onMouseMove={handleSvgMouseMove} onMouseUp={handleSvgMouseUp}
        onMouseLeave={handleSvgMouseLeave} onMouseDown={handleSvgMouseDown}>

        <defs>
          <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#64748b" /></marker>
          <marker id="arrow-gold" markerWidth="10" markerHeight="10" refX="8" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#FFD700" /></marker>
          <marker id="arrow-doc" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto"><polygon points="0 0, 8 3.5, 0 7" fill="#94a3b8" /></marker>
          <marker id="arrow-doc-blue" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto"><polygon points="0 0, 8 3.5, 0 7" fill="#2563eb" /></marker>
          <marker id="arrow-doc-green" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto"><polygon points="0 0, 8 3.5, 0 7" fill="#059669" /></marker>
        </defs>

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>

          {/* ── Legend ── */}
          <g transform={`translate(${MARGIN.left}, 16)`}>
            {responsibles.map((r, i) => (
              <g key={r.key} transform={`translate(${i * 280}, 0)`}>
                <rect width={36} height={26} rx={4} fill={r.color} stroke={r.borderColor} strokeWidth={2} />
                <rect x={6} y={6} width={24} height={14} rx={3} fill={r.taskColor} />
                <text x={46} y={18} fontSize="12px" fontWeight="600" fill="#374151">{r.name}</text>
              </g>
            ))}
            <text x={responsibles.length * 280 + 20} y={18} fontSize="10px" fill="#94a3b8" fontStyle="italic">
              ✥ drag documents to reposition
            </text>
          </g>

          {/* ── Main group ── */}
          <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>

            <text x={canvasWidth / 2} y={-30} textAnchor="middle" fontSize="18px" fontWeight="700" fill="#1e293b">{name}</text>

            {/* ── Tool lanes ── */}
            {visibleTools.map((tool, i) => {
              let toolY = 0;
              for (let j = 0; j < i; j++) toolY += getToolHeight(visibleTools[j], collapsedTools) + LANE_GAP;
              const isCollapsed = collapsedTools.has(tool);
              const toolDisplayHeight = getToolHeight(tool, collapsedTools);
              const hasNote = !!(toolNotes && toolNotes[tool]?.trim());
              return (
                <g key={tool}>
                  <rect x={0} y={toolY} width={canvasWidth} height={toolDisplayHeight} rx={6} fill="#ffffff" stroke="#2563eb" strokeWidth={2} />
                  <text x={12} y={toolY + 24} fontSize="12px" fontWeight="700" fill="#1d4ed8" style={{ pointerEvents: 'none' }}>{tool}</text>

                  {/* Collapse button */}
                  <g style={{ cursor: 'pointer' }} onClick={() => toggleToolCollapse(tool)}>
                    <circle cx={150} cy={toolY + 17} r={12} fill="#ffffff" fillOpacity="0.01" stroke="#94a3b8" strokeWidth={1.5} />
                    <text x={150} y={toolY + 22} textAnchor="middle" fontSize="12px" fontWeight="700" fill="#94a3b8"
                      transform={isCollapsed ? `rotate(-90, 150, ${toolY + 22})` : undefined}
                      style={{ pointerEvents: 'none', userSelect: 'none' }}>▼</text>
                  </g>

                  {!isCollapsed && <line x1={0} y1={toolY + 34} x2={canvasWidth} y2={toolY + 34} stroke="#2563eb" strokeWidth={1} strokeOpacity={0.15} />}

                  {/* Note button */}
                  <g style={{ cursor: 'pointer' }} onClick={() => setOpenNoteTool(openNoteTool === tool ? null : tool)}>
                    <circle cx={canvasWidth - 18} cy={toolY + 17} r={10} fill={hasNote ? '#2563eb' : '#eff6ff'} stroke="#2563eb" strokeWidth={1.5} />
                    <text x={canvasWidth - 18} y={toolY + 22} textAnchor="middle" fontSize="13px" fontWeight="700"
                      fill={hasNote ? '#ffffff' : '#2563eb'} style={{ pointerEvents: 'none', userSelect: 'none' }}>
                      {hasNote ? '✎' : '+'}
                    </text>
                  </g>
                </g>
              );
            })}

            {/* ── Document connector lines ── */}
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
                    fill="none" stroke={color} strokeWidth={strokeWidth}
                    strokeDasharray="5,4" strokeOpacity={opacity} strokeLinecap="round"
                    markerEnd={`url(#${arrowId})`}
                    style={{ transition: dragging ? 'none' : 'all 0.18s ease' }}
                  />
                );
              });
            })}

            {/* ── Task dependency arrows ── */}
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
                const midX = (x1 + x2) / 2;
                const midY = (y1 + y2) / 2;
                return (
                  <g key={`${dId}->${task.id}`}>
                    <path d={curvedPath(x1, y1, x2, y2)} fill="none"
                      stroke={isGold ? '#FFD700' : '#64748b'} strokeWidth={isGold ? 2.5 : 1.8}
                      strokeOpacity={isGold ? 1 : hoveredTask ? 0.13 : 0.6}
                      markerEnd={`url(#${isGold ? 'arrow-gold' : 'arrow'})`}
                      style={{ transition: 'all 0.2s ease' }} />
                    {depTask.tool !== task.tool && fmt && (
                      <g transform={`translate(${midX}, ${midY})`}>
                        <rect x={-fmt.length * 3.2 - 4} y={-9} rx={4} width={fmt.length * 6.4 + 8} height={17}
                          fill={isGold ? '#FFF8DC' : '#f1f5f9'} stroke={isGold ? '#FFD700' : '#94a3b8'} strokeWidth={1} />
                        <text textAnchor="middle" y={4} fontSize="9px" fontWeight="600"
                          fill={isGold ? '#92400e' : '#475569'} style={{ pointerEvents: 'none', userSelect: 'none' }}>{fmt}</text>
                      </g>
                    )}
                  </g>
                );
              })
            )}

            {/* ── Tasks ── */}
            {visibleTasks.map((task) => {
              const taskY = getTaskY(task, visibleTasks, visibleTools, collapsedTools);
              if (taskY < -1000) return null;
              const resp = respMap[task.responsible];
              const isHovered = task.id === hoveredTaskId;
              const isDocRelated = docHoverTaskIds.has(task.id);
              return (
                <TaskNode key={task.id} task={task} x={getTaskX(task)} y={taskY} width={task.duration}
                  responsible={resp} isHovered={isHovered || isDocRelated}
                  isDimmed={(!!hoveredTask && !isHovered && !depChain.has(task.id)) || (!!hoveredDocId && !isDocRelated)}
                  isDepHighlighted={depChain.has(task.id)}
                  onMouseEnter={(e) => { setHoveredTaskId(task.id); setTooltipPos({ x: e.clientX, y: e.clientY }); }}
                  onMouseLeave={() => setHoveredTaskId(null)} />
              );
            })}

            {/* ── Document nodes ── */}
            {visibleDocuments.map((doc) => {
              const pos = docPositions[doc.id];
              if (!pos) return null;
              const isHighlighted = highlightedDocs.has(doc.id);
              return (
                <DocumentNode key={doc.id} doc={doc} x={pos.x} y={pos.y}
                  isHighlighted={isHighlighted}
                  isDimmed={(!!hoveredTask && !isHighlighted) || (!!hoveredDocId && hoveredDocId !== doc.id && !isHighlighted)}
                  isDragging={dragging?.id === doc.id}
                  onMouseEnter={() => setHoveredDocId(doc.id)}
                  onMouseLeave={() => setHoveredDocId(null)}
                  onMouseDown={(e) => handleDocMouseDown(e, doc.id)}
                  onHeightChange={(h) => handleDocHeight(doc.id, h)} />
              );
            })}
          </g>
        </g>
      </svg>

      {openNoteTool && openNoteToolIndex >= 0 && (
        <ToolNotePanel tool={openNoteTool} note={toolNotes?.[openNoteTool] || ''}
          toolY={openNoteToolY}
          onClose={() => setOpenNoteTool(null)}
          onSave={(tool, text) => onToolNoteChange(tool, text)} />
      )}

      <Tooltip task={hoveredTask} responsible={hoveredTask ? respMap[hoveredTask.responsible] : null}
        documents={documents} pos={tooltipPos} />
    </div>
  );
};

export default WorkflowCanvas;
