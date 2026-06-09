import React, { useState, useMemo, useCallback, useEffect } from 'react';
import TaskNode, { TASK_HEIGHT } from './TaskNode';
import DocumentNode, { DOC_WIDTH, DOC_HEIGHT } from './DocumentNode';

const MARGIN = { top: 110, right: 220, bottom: 60, left: 200 };
const TOOL_HEIGHT = 160;
const TASK_GAP = 18;
const LANE_GAP = 12;
const DOC_LEFT_X = 20;
const DOC_RIGHT_OFFSET = 30;
const ELBOW_STUB = 28;

const getTaskY = (task, tasks, tools) => {
  const toolIndex = tools.indexOf(task.tool);
  if (toolIndex === -1) return 0;
  const tasksInToolBefore = tasks.filter(
    (t) => t.tool === task.tool && t.startTime < task.startTime
  ).length;
  const base = toolIndex * (TOOL_HEIGHT + LANE_GAP) + 50;
  const offset = tasksInToolBefore * (TASK_HEIGHT + TASK_GAP);
  const max = toolIndex * (TOOL_HEIGHT + LANE_GAP) + TOOL_HEIGHT - TASK_HEIGHT - 10;
  return Math.min(base + offset, max);
};

const getTaskX = (task) => task.startTime;

const curvedPath = (x1, y1, x2, y2) => {
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
};

const elbowPath = (x1, y1, x2, y2, isInput) => {
  if (isInput) {
    const elbowX = x1 + ELBOW_STUB;
    return `M ${x1} ${y1} H ${elbowX} V ${y2} H ${x2}`;
  } else {
    const elbowX = x2 - ELBOW_STUB;
    return `M ${x1} ${y1} H ${elbowX} V ${y2} H ${x2}`;
  }
};

const buildDefaultPositions = (documents, canvasHeight, canvasWidth) => {
  const inputDocs = documents.filter((d) => d.type === 'input');
  const outputDocs = documents.filter((d) => d.type === 'output');
  const getY = (i, total) => {
    const spacing = Math.min(canvasHeight / total, 90);
    const totalH = total * spacing;
    const startY = (canvasHeight - totalH) / 2 + 10;
    return startY + i * spacing;
  };
  const positions = {};
  inputDocs.forEach((doc, i) => {
    positions[doc.id] = { x: -MARGIN.left + DOC_LEFT_X, y: getY(i, inputDocs.length) };
  });
  outputDocs.forEach((doc, i) => {
    positions[doc.id] = { x: canvasWidth + DOC_RIGHT_OFFSET, y: getY(i, outputDocs.length) };
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
        {task.dependencies.length > 0 && <p><strong>Depends on:</strong> {task.dependencies.join(', ')}</p>}
        {inputDocs.length > 0 && <p><strong>Inputs:</strong> {inputDocs.map((d) => d.name).join(', ')}</p>}
        {outputDocs.length > 0 && <p><strong>Outputs:</strong> {outputDocs.map((d) => d.name).join(', ')}</p>}
      </div>
    </div>
  );
};

const WorkflowCanvas = ({ activity, filters }) => {
  const { tasks, tools, responsibles, documents, name } = activity;

  const canvasWidth = Math.max(...tasks.map((t) => t.startTime + t.duration), 600) + 80;

  // ── State ──
  const [hoveredTaskId, setHoveredTaskId] = useState(null);
  const [hoveredDocId, setHoveredDocId] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [docPositions, setDocPositions] = useState(() =>
    buildDefaultPositions(documents, tools.length * (TOOL_HEIGHT + LANE_GAP), canvasWidth)
  );
  const [docHeights, setDocHeights] = useState({});
  const [dragging, setDragging] = useState(null);

  const handleDocHeight = useCallback((docId, h) => {
    setDocHeights((prev) => (prev[docId] === h ? prev : { ...prev, [docId]: h }));
  }, []);

  useEffect(() => {
    setDocPositions(buildDefaultPositions(documents, tools.length * (TOOL_HEIGHT + LANE_GAP), canvasWidth));
    setDocHeights({});
  }, [activity.id]); // eslint-disable-line

  const handleSvgMouseMove = useCallback((e) => {
    if (!dragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const newX = e.clientX - rect.left - MARGIN.left - dragging.offsetX;
    const newY = e.clientY - rect.top - MARGIN.top - dragging.offsetY;
    setDocPositions((prev) => ({ ...prev, [dragging.id]: { x: newX, y: newY } }));
  }, [dragging]);

  const handleSvgMouseUp = useCallback(() => setDragging(null), []);

  const handleDocMouseDown = useCallback((e, docId) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.closest('svg').getBoundingClientRect();
    const pos = docPositions[docId];
    setDragging({
      id: docId,
      offsetX: e.clientX - rect.left - MARGIN.left - pos.x,
      offsetY: e.clientY - rect.top - MARGIN.top - pos.y,
    });
  }, [docPositions]);

  // ── Derived state ──
  const visibleTasks = useMemo(() => tasks.filter((t) => {
    const byResp = filters.responsibles.length === 0 || filters.responsibles.includes(t.responsible);
    const byTool = filters.tools.length === 0 || filters.tools.includes(t.tool);
    return byResp && byTool;
  }), [tasks, filters]);

  // Only lanes that have at least one visible task
  const visibleTools = useMemo(() => {
    const set = new Set(visibleTasks.map((t) => t.tool));
    return tools.filter((tool) => set.has(tool));
  }, [tools, visibleTasks]);

  const canvasHeight = Math.max(visibleTools.length, 1) * (TOOL_HEIGHT + LANE_GAP);
  const svgWidth = canvasWidth + MARGIN.left + MARGIN.right;
  const svgHeight = canvasHeight + MARGIN.top + MARGIN.bottom;

  const hoveredTask = tasks.find((t) => t.id === hoveredTaskId) || null;

  const depChain = useMemo(() => {
    if (!hoveredTask) return new Set();
    const chain = new Set();
    const walk = (id) => {
      const t = tasks.find((x) => x.id === id);
      if (!t) return;
      t.dependencies.forEach((d) => { chain.add(d); walk(d); });
    };
    walk(hoveredTask.id);
    return chain;
  }, [hoveredTask, tasks]);

  const highlightedDocs = useMemo(() => {
    const s = new Set();
    if (hoveredTask) {
      (hoveredTask.inputs || []).forEach((id) => s.add(id));
      (hoveredTask.outputs || []).forEach((id) => s.add(id));
    }
    if (hoveredDocId) s.add(hoveredDocId);
    return s;
  }, [hoveredTask, hoveredDocId]);

  const docHoverTaskIds = useMemo(() => {
    if (!hoveredDocId) return new Set();
    return new Set(
      tasks.filter((t) => t.inputs?.includes(hoveredDocId) || t.outputs?.includes(hoveredDocId)).map((t) => t.id)
    );
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
    const strokeWidth = hoveredDocId === docId || isDocHighlighted ? 2.2 : 1.5;
    return { color, opacity, strokeWidth };
  };

  return (
    <div className="canvas-wrapper">
      <svg
        width={svgWidth} height={svgHeight}
        style={{ background: '#f8f9fb', display: 'block', userSelect: 'none' }}
        onMouseMove={handleSvgMouseMove}
        onMouseUp={handleSvgMouseUp}
        onMouseLeave={handleSvgMouseUp}
      >
        <defs>
          <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
          </marker>
          <marker id="arrow-gold" markerWidth="10" markerHeight="10" refX="8" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#FFD700" />
          </marker>
          <marker id="arrow-doc" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto">
            <polygon points="0 0, 8 3.5, 0 7" fill="#94a3b8" />
          </marker>
          <marker id="arrow-doc-blue" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto">
            <polygon points="0 0, 8 3.5, 0 7" fill="#2563eb" />
          </marker>
          <marker id="arrow-doc-green" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto">
            <polygon points="0 0, 8 3.5, 0 7" fill="#059669" />
          </marker>
        </defs>

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

          <text x={canvasWidth / 2} y={-30} textAnchor="middle" fontSize="18px" fontWeight="700" fill="#1e293b">
            {name}
          </text>

          {/* ── Tool lanes — only visible ones, re-indexed from 0 ── */}
          {visibleTools.map((tool, i) => {
            const toolY = i * (TOOL_HEIGHT + LANE_GAP);
            return (
              <g key={tool}>
                <rect x={0} y={toolY} width={canvasWidth} height={TOOL_HEIGHT}
                  rx={6} fill="#ffffff" stroke="#2563eb" strokeWidth={2} />
                <text x={12} y={toolY + 24} fontSize="12px" fontWeight="700" fill="#1d4ed8">{tool}</text>
                <line x1={0} y1={toolY + 34} x2={canvasWidth} y2={toolY + 34}
                  stroke="#2563eb" strokeWidth={1} strokeOpacity={0.15} />
              </g>
            );
          })}

          {/* ── Document connector lines ── */}
          {documents.map((doc) => {
            const pos = docPositions[doc.id];
            if (!pos) return null;
            const isInput = doc.type === 'input';
            const connectedTasks = visibleTasks.filter((t) =>
              isInput ? t.inputs?.includes(doc.id) : t.outputs?.includes(doc.id)
            );
            if (connectedTasks.length === 0) return null;
            const { color, opacity, strokeWidth } = getDocLineProps(doc.id, isInput);
            const arrowId = color === '#2563eb' ? 'arrow-doc-blue' : color === '#059669' ? 'arrow-doc-green' : 'arrow-doc';
            const docCenterY = pos.y + (docHeights[doc.id] || DOC_HEIGHT) / 2;

            return connectedTasks.map((ct) => (
              <path
                key={`${doc.id}<->${ct.id}`}
                d={elbowPath(
                  isInput ? pos.x + DOC_WIDTH : pos.x, docCenterY,
                  isInput ? getTaskX(ct) : getTaskX(ct) + ct.duration,
                  getTaskY(ct, visibleTasks, visibleTools) + TASK_HEIGHT / 2,
                  isInput
                )}
                fill="none" stroke={color} strokeWidth={strokeWidth}
                strokeDasharray="5,4" strokeOpacity={opacity} strokeLinecap="round"
                //markerEnd={`url(#${arrowId})`}
                style={{ transition: dragging ? 'none' : 'all 0.18s ease' }}
              />
            ));
          })}

          {/* ── Task dependency arrows ── */}
          {visibleTasks.map((task) =>
            task.dependencies.map((depId) => {
              const dep = visibleTasks.find((t) => t.id === depId);
              if (!dep) return null;
              const isGold = hoveredTask &&
                (hoveredTask.id === task.id || depChain.has(task.id)) &&
                depChain.has(depId);
              return (
                <path
                  key={`${depId}->${task.id}`}
                  d={curvedPath(
                    getTaskX(dep) + dep.duration,
                    getTaskY(dep, visibleTasks, visibleTools) + TASK_HEIGHT / 2,
                    getTaskX(task),
                    getTaskY(task, visibleTasks, visibleTools) + TASK_HEIGHT / 2
                  )}
                  fill="none"
                  stroke={isGold ? '#FFD700' : '#64748b'}
                  strokeWidth={isGold ? 2.5 : 1.8}
                  strokeOpacity={isGold ? 1 : hoveredTask ? 0.13 : 0.6}
                  //markerEnd={`url(#${isGold ? 'arrow-gold' : 'arrow'})`}
                  style={{ transition: 'all 0.2s ease' }}
                />
              );
            })
          )}

          {/* ── Tasks ── */}
          {visibleTasks.map((task) => {
            const resp = respMap[task.responsible];
            const isHovered = task.id === hoveredTaskId;
            const isDocRelated = docHoverTaskIds.has(task.id);
            const isDimmed =
              (!!hoveredTask && !isHovered && !depChain.has(task.id)) ||
              (!!hoveredDocId && !isDocRelated);
            return (
              <TaskNode
                key={task.id}
                task={task}
                x={getTaskX(task)}
                y={getTaskY(task, visibleTasks, visibleTools)}
                width={task.duration}
                responsible={resp}
                isHovered={isHovered || isDocRelated}
                isDimmed={isDimmed}
                isDepHighlighted={depChain.has(task.id)}
                onMouseEnter={(e) => { setHoveredTaskId(task.id); setTooltipPos({ x: e.clientX, y: e.clientY }); }}
                onMouseLeave={() => setHoveredTaskId(null)}
              />
            );
          })}

          {/* ── Document nodes ── */}
          {documents.map((doc) => {
            const pos = docPositions[doc.id];
            if (!pos) return null;
            const isHighlighted = highlightedDocs.has(doc.id);
            return (
              <DocumentNode
                key={doc.id}
                doc={doc}
                x={pos.x} y={pos.y}
                isHighlighted={isHighlighted}
                isDimmed={(!!hoveredTask && !isHighlighted) || (!!hoveredDocId && hoveredDocId !== doc.id && !isHighlighted)}
                isDragging={dragging?.id === doc.id}
                onMouseEnter={() => setHoveredDocId(doc.id)}
                onMouseLeave={() => setHoveredDocId(null)}
                onMouseDown={(e) => handleDocMouseDown(e, doc.id)}
                onHeightChange={(h) => handleDocHeight(doc.id, h)}
              />
            );
          })}
        </g>
      </svg>

      <Tooltip
        task={hoveredTask}
        responsible={hoveredTask ? respMap[hoveredTask.responsible] : null}
        documents={documents}
        pos={tooltipPos}
      />
    </div>
  );
};

export default WorkflowCanvas;
