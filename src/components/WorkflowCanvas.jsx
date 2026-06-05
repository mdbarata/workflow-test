import React, { useState, useMemo } from 'react';
import TaskNode, { TASK_HEIGHT } from './TaskNode';
import DocumentNode, { DOC_WIDTH, DOC_HEIGHT } from './DocumentNode';

// ── Layout constants ──────────────────────────────────────────────────────────
const MARGIN = { top: 110, right: 220, bottom: 60, left: 200 };
const TOOL_HEIGHT = 160;
const TASK_GAP = 18;
const DOC_LEFT_X = 20;           // x inside the left margin area
const DOC_RIGHT_OFFSET = 30;     // gap between canvas edge and output docs

// ── Helpers ───────────────────────────────────────────────────────────────────
const getTaskY = (task, tasks, tools) => {
  const toolIndex = tools.indexOf(task.tool);
  const tasksInToolBefore = tasks
    .filter((t) => t.tool === task.tool && t.startTime < task.startTime)
    .length;
  const base = toolIndex * TOOL_HEIGHT + 50;
  const offset = tasksInToolBefore * (TASK_HEIGHT + TASK_GAP);
  const max = toolIndex * TOOL_HEIGHT + TOOL_HEIGHT - TASK_HEIGHT - 10;
  return Math.min(base + offset, max);
};

const curvedPath = (x1, y1, x2, y2) => {
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
};

const dottedPath = (x1, y1, x2, y2) => {
  return `M ${x1} ${y1} L ${x2} ${y2}`;
};

// ── Tooltip ───────────────────────────────────────────────────────────────────
const Tooltip = ({ task, responsible, documents, pos }) => {
  if (!task) return null;
  const inputDocs = documents.filter((d) => task.inputs?.includes(d.id));
  const outputDocs = documents.filter((d) => task.outputs?.includes(d.id));

  return (
    <div
      className="d3-tooltip"
      style={{ position: 'fixed', left: pos.x + 18, top: pos.y - 120, zIndex: 1000 }}
    >
      <div className="tooltip-header">
        <span
          className="tooltip-badge"
          style={{ backgroundColor: responsible?.taskColor || '#888' }}
        />
        {task.name}
      </div>
      <div className="tooltip-content">
        <p><strong>Tool:</strong> {task.tool}</p>
        <p><strong>Responsible:</strong> {responsible?.name || task.responsible}</p>
        <p><strong>Duration:</strong> {task.duration} units</p>
        <p><strong>Details:</strong> {task.details}</p>
        {task.dependencies.length > 0 && (
          <p><strong>Depends on:</strong> {task.dependencies.join(', ')}</p>
        )}
        {inputDocs.length > 0 && (
          <p><strong>Inputs:</strong> {inputDocs.map((d) => d.name).join(', ')}</p>
        )}
        {outputDocs.length > 0 && (
          <p><strong>Outputs:</strong> {outputDocs.map((d) => d.name).join(', ')}</p>
        )}
      </div>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
const WorkflowCanvas = ({ activity, filters }) => {
  const [hoveredTaskId, setHoveredTaskId] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const { tasks, tools, responsibles, documents, name } = activity;

  // Filter-aware task list
  const visibleTasks = useMemo(() => {
    return tasks.filter((t) => {
      const byResp =
        filters.responsibles.length === 0 ||
        filters.responsibles.includes(t.responsible);
      const byTool =
        filters.tools.length === 0 || filters.tools.includes(t.tool);
      return byResp && byTool;
    });
  }, [tasks, filters]);

  const visibleIds = useMemo(
    () => new Set(visibleTasks.map((t) => t.id)),
    [visibleTasks]
  );

  // Hovered task and its dependency chain (ids highlighted in gold)
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

  // Highlighted documents (those connected to hovered task)
  const highlightedDocs = useMemo(() => {
    if (!hoveredTask) return new Set();
    return new Set([...(hoveredTask.inputs || []), ...(hoveredTask.outputs || [])]);
  }, [hoveredTask]);

  // Canvas dimensions
  const canvasWidth =
    Math.max(...tasks.map((t) => t.startTime + t.duration), 600) + 80;
  const canvasHeight = tools.length * TOOL_HEIGHT;
  const svgWidth = canvasWidth + MARGIN.left + MARGIN.right;
  const svgHeight = canvasHeight + MARGIN.top + MARGIN.bottom;

  // Document vertical placement
  const inputDocs = documents.filter((d) => d.type === 'input');
  const outputDocs = documents.filter((d) => d.type === 'output');

  const getDocY = (i, total) => {
    const spacing = Math.min(canvasHeight / total, 90);
    const totalH = total * spacing;
    const startY = (canvasHeight - totalH) / 2 + 10;
    return startY + i * spacing;
  };

  // Responsible lookup
  const respMap = useMemo(() => {
    const m = {};
    responsibles.forEach((r) => { m[r.key] = r; });
    return m;
  }, [responsibles]);

  const getTaskX = (task) => task.startTime;

  return (
    <div className="canvas-wrapper">
      <svg
        width={svgWidth}
        height={svgHeight}
        style={{ background: '#f8f9fb', display: 'block' }}
      >
        <defs>
          <marker
            id="arrow"
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
          </marker>
          <marker
            id="arrow-gold"
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#FFD700" />
          </marker>
          <marker
            id="arrow-doc"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 8 3.5, 0 7" fill="#94a3b8" />
          </marker>
        </defs>

        {/* ── Legend ── */}
        <g transform={`translate(${MARGIN.left}, 16)`}>
          {responsibles.map((r, i) => (
            <g key={r.key} transform={`translate(${i * 280}, 0)`}>
              <rect
                width={36}
                height={26}
                rx={4}
                fill={r.color}
                stroke={r.borderColor}
                strokeWidth={2}
              />
              <rect
                x={6}
                y={6}
                width={24}
                height={14}
                rx={3}
                fill={r.taskColor}
              />
              <text
                x={46}
                y={18}
                fontSize="12px"
                fontWeight="600"
                fill="#374151"
              >
                {r.name}
              </text>
            </g>
          ))}
        </g>

        {/* ── Main group ── */}
        <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>

          {/* Activity title */}
          <text
            x={canvasWidth / 2}
            y={-52}
            textAnchor="middle"
            fontSize="18px"
            fontWeight="700"
            fill="#1e293b"
          >
            {name}
          </text>

          {/* ── Tool rows ── */}
          {tools.map((tool, i) => {
            const toolY = i * TOOL_HEIGHT;
            const isActive =
              filters.tools.length === 0 || filters.tools.includes(tool);
            return (
              <g key={tool}>
                <rect
                  x={0}
                  y={toolY}
                  width={canvasWidth}
                  height={TOOL_HEIGHT}
                  rx={6}
                  fill={isActive ? '#ffffff' : '#f1f5f9'}
                  stroke="#2563eb"
                  strokeWidth={isActive ? 2 : 1}
                  strokeOpacity={isActive ? 1 : 0.4}
                />
                <text
                  x={12}
                  y={toolY + 24}
                  fontSize="12px"
                  fontWeight="700"
                  fill={isActive ? '#1d4ed8' : '#94a3b8'}
                >
                  {tool}
                </text>
                <line
                  x1={0}
                  y1={toolY + 34}
                  x2={canvasWidth}
                  y2={toolY + 34}
                  stroke="#2563eb"
                  strokeWidth={1}
                  strokeOpacity={0.15}
                />
              </g>
            );
          })}

          {/* ── Dependency arrows ── */}
          {tasks.map((task) =>
            task.dependencies.map((depId) => {
              const dep = tasks.find((t) => t.id === depId);
              if (!dep) return null;
              const isGold =
                hoveredTask &&
                (hoveredTask.id === task.id || depChain.has(task.id)) &&
                depChain.has(depId);
              const isVisible = visibleIds.has(task.id) && visibleIds.has(depId);
              const opacity = !isVisible ? 0.08 : isGold ? 1 : hoveredTask ? 0.15 : 0.6;

              const x1 = getTaskX(dep) + dep.duration;
              const y1 = getTaskY(dep, tasks, tools) + TASK_HEIGHT / 2;
              const x2 = getTaskX(task);
              const y2 = getTaskY(task, tasks, tools) + TASK_HEIGHT / 2;

              return (
                <path
                  key={`${depId}->${task.id}`}
                  d={curvedPath(x1, y1, x2, y2)}
                  fill="none"
                  stroke={isGold ? '#FFD700' : '#64748b'}
                  strokeWidth={isGold ? 2.5 : 1.8}
                  strokeOpacity={opacity}
                  markerEnd={`url(#${isGold ? 'arrow-gold' : 'arrow'})`}
                  style={{ transition: 'all 0.2s ease' }}
                />
              );
            })
          )}

          {/* ── Tasks ── */}
          {tasks.map((task) => {
            const resp = respMap[task.responsible];
            const isVisible = visibleIds.has(task.id);
            const isHovered = task.id === hoveredTaskId;
            const isDimmed =
              !!hoveredTask &&
              !isHovered &&
              !depChain.has(task.id) &&
              !hoveredTask.dependencies.includes(task.id);
            const isDepHighlighted = depChain.has(task.id);

            return (
              <TaskNode
                key={task.id}
                task={task}
                x={getTaskX(task)}
                y={getTaskY(task, tasks, tools)}
                width={task.duration}
                responsible={resp}
                isHovered={isHovered}
                isDimmed={!isVisible || isDimmed}
                isDepHighlighted={isDepHighlighted}
                onMouseEnter={(e) => {
                  setHoveredTaskId(task.id);
                  setTooltipPos({ x: e.clientX, y: e.clientY });
                }}
                onMouseLeave={() => setHoveredTaskId(null)}
              />
            );
          })}

          {/* ── Input documents (left, in negative x space) ── */}
          {inputDocs.map((doc, i) => {
            const docY = getDocY(i, inputDocs.length);
            const docX = -MARGIN.left + DOC_LEFT_X;
            const docCenterY = docY + DOC_HEIGHT / 2;
            const isHighlighted = highlightedDocs.has(doc.id);
            const isDimmed = !!hoveredTask && !isHighlighted;

            // Connect to tasks that use this doc as input
            const connectedTasks = tasks.filter((t) => t.inputs?.includes(doc.id));

            return (
              <g key={doc.id}>
                <DocumentNode
                  doc={doc}
                  x={docX}
                  y={docY}
                  isHighlighted={isHighlighted}
                  isDimmed={isDimmed}
                />
                {connectedTasks.map((ct) => {
                  const tx = getTaskX(ct);
                  const ty = getTaskY(ct, tasks, tools) + TASK_HEIGHT / 2;
                  const lineOpacity = isDimmed ? 0.05 : isHighlighted ? 0.9 : 0.3;
                  return (
                    <path
                      key={`${doc.id}->${ct.id}`}
                      d={dottedPath(docX + DOC_WIDTH, docCenterY, tx, ty)}
                      fill="none"
                      stroke={isHighlighted ? '#2563eb' : '#94a3b8'}
                      strokeWidth={isHighlighted ? 2 : 1.5}
                      strokeDasharray="5,4"
                      strokeOpacity={lineOpacity}
                      markerEnd="url(#arrow-doc)"
                      style={{ transition: 'all 0.2s ease' }}
                    />
                  );
                })}
              </g>
            );
          })}

          {/* ── Output documents (right) ── */}
          {outputDocs.map((doc, i) => {
            const docY = getDocY(i, outputDocs.length);
            const docX = canvasWidth + DOC_RIGHT_OFFSET;
            const docCenterY = docY + DOC_HEIGHT / 2;
            const isHighlighted = highlightedDocs.has(doc.id);
            const isDimmed = !!hoveredTask && !isHighlighted;

            const connectedTasks = tasks.filter((t) => t.outputs?.includes(doc.id));

            return (
              <g key={doc.id}>
                <DocumentNode
                  doc={doc}
                  x={docX}
                  y={docY}
                  isHighlighted={isHighlighted}
                  isDimmed={isDimmed}
                />
                {connectedTasks.map((ct) => {
                  const tx = getTaskX(ct) + ct.duration;
                  const ty = getTaskY(ct, tasks, tools) + TASK_HEIGHT / 2;
                  const lineOpacity = isDimmed ? 0.05 : isHighlighted ? 0.9 : 0.3;
                  return (
                    <path
                      key={`${ct.id}->${doc.id}`}
                      d={dottedPath(tx, ty, docX, docCenterY)}
                      fill="none"
                      stroke={isHighlighted ? '#059669' : '#94a3b8'}
                      strokeWidth={isHighlighted ? 2 : 1.5}
                      strokeDasharray="5,4"
                      strokeOpacity={lineOpacity}
                      markerEnd="url(#arrow-doc)"
                      style={{ transition: 'all 0.2s ease' }}
                    />
                  );
                })}
              </g>
            );
          })}
        </g>
      </svg>

      {/* ── Tooltip (outside SVG, in DOM) ── */}
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
