// ── exportStaticHtml.js ──────────────────────────────────────────────────────
// Generates a single self-contained .html file that renders a read-only,
// interactive (hover/zoom/pan) view of one activity's workflow diagram.
// No React, no build step, no network calls, no data leaves the browser.
// All layout math here mirrors WorkflowCanvas.jsx so the exported view
// matches what's shown in the app.

const MARGIN = { top: 110, right: 180, bottom: 60, left: 200 };
const TOOL_HEIGHT = 160;
const TASK_GAP = 18;
const LANE_GAP = 12;
const DOC_LEFT_X = 20;
const DOC_RIGHT_OFFSET = 30;
const ELBOW_STUB = 28;

// TaskNode text-wrap constants (mirrors TaskNode.jsx)
const FONT_SIZE = 11;
const LINE_HEIGHT = 14;
const PAD_X = 8;
const PAD_Y = 8;
const TASK_RADIUS = 6;

// DocumentNode constants (mirrors DocumentNode.jsx)
const DOC_WIDTH = 130;
const DOC_MIN_HEIGHT = 48;
const DOC_RADIUS = 6;

const depId = (d) => (typeof d === 'object' ? d.id : d);

function wrapText(text, maxWidth, fontSize) {
  const avgCharW = fontSize * 0.58;
  const charsPerLine = Math.max(1, Math.floor(maxWidth / avgCharW));
  const words = String(text).split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= charsPerLine) current = candidate;
    else { if (current) lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines;
}

function getTaskHeight(taskName, taskWidth) {
  const textAreaWidth = Math.max(20, taskWidth - PAD_X * 2);
  const lines = wrapText(taskName, textAreaWidth, FONT_SIZE);
  return PAD_Y + lines.length * LINE_HEIGHT + PAD_Y;
}

function getToolHeight(tool, tasks) {
  const toolTasks = tasks.filter((t) => t.tool === tool);
  if (toolTasks.length === 0) return TOOL_HEIGHT;
  const maxTaskH = Math.max(...toolTasks.map((t) => getTaskHeight(t.name, t.duration)));
  const count = toolTasks.length;
  const needed = 50 + count * (maxTaskH + TASK_GAP) + 10;
  return Math.max(TOOL_HEIGHT, needed);
}

function getTaskY(task, tasks, tools) {
  const toolIndex = tools.indexOf(task.tool);
  if (toolIndex === -1) return -9999;
  const tasksInToolBefore = tasks.filter((t) => t.tool === task.tool && t.startTime < task.startTime).length;
  let baseY = 50;
  for (let i = 0; i < toolIndex; i++) baseY += getToolHeight(tools[i], tasks) + LANE_GAP;
  const maxTaskH = Math.max(...tasks.filter((t) => t.tool === task.tool).map((t) => getTaskHeight(t.name, t.duration)), getTaskHeight(task.name, task.duration));
  const offset = tasksInToolBefore * (maxTaskH + TASK_GAP);
  return baseY + offset;
}

const getTaskX = (task) => task.startTime;
const curvedPath = (x1, y1, x2, y2) => { const m = (x1 + x2) / 2; return `M ${x1} ${y1} C ${m} ${y1}, ${m} ${y2}, ${x2} ${y2}`; };
const elbowPath = (x1, y1, x2, y2, isInput) => isInput
  ? `M ${x1} ${y1} H ${x1 + ELBOW_STUB} V ${y2} H ${x2}`
  : `M ${x1} ${y1} H ${x2 - ELBOW_STUB} V ${y2} H ${x2}`;

// Doc default position: vertically centred on the average Y of connected tasks
function buildDocPositions(documents, tasks, tools, canvasWidth, canvasHeight) {
  const positions = {};
  documents.forEach((doc) => {
    const isInput = doc.type === 'input';
    const connected = tasks.filter((t) => isInput ? t.inputs?.includes(doc.id) : t.outputs?.includes(doc.id));
    const x = isInput ? -MARGIN.left + DOC_LEFT_X : canvasWidth + DOC_RIGHT_OFFSET;
    let y;
    if (connected.length > 0) {
      const ys = connected.map((t) => getTaskY(t, tasks, tools) + getTaskHeight(t.name, t.duration) / 2);
      y = ys.reduce((a, b) => a + b, 0) / ys.length;
    } else {
      y = canvasHeight / 2;
    }
    positions[doc.id] = { x, y };
  });
  return positions;
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Build the static SVG markup (string) for one activity.
function buildSvg(activity) {
  const { tasks, tools, responsibles, documents, name } = activity;
  const respMap = {};
  responsibles.forEach((r) => { respMap[r.key] = r; });

  const canvasWidth = Math.max(...tasks.map((t) => t.startTime + t.duration), 600) + 20;
  const canvasHeight = tools.reduce((sum, tool) => sum + getToolHeight(tool, tasks) + LANE_GAP, 0);
  const svgWidth = canvasWidth + MARGIN.left + MARGIN.right;
  const svgHeight = canvasHeight + MARGIN.top + MARGIN.bottom;

  const docPositions = buildDocPositions(documents, tasks, tools, canvasWidth, canvasHeight);
  const docHeights = {};
  documents.forEach((doc) => {
    const lines = doc.name.split(' ').reduce((ls, word, i) => {
      if (i === 0) return [[word]];
      const last = ls[ls.length - 1];
      const test = [...last, word].join(' ');
      if (test.length > 15) return [...ls, [word]];
      last.push(word);
      return ls;
    }, []);
    docHeights[doc.id] = Math.max(DOC_MIN_HEIGHT, lines.length * 12 + 24);
  });

  let svg = '';
  svg += `<svg id="diagram-svg" xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" style="background:#f8f9fb;display:block;user-select:none;">`;
  svg += `<defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#64748b"/></marker>
    <marker id="arrow-gold" markerWidth="10" markerHeight="10" refX="8" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#FFD700"/></marker>
    <marker id="arrow-doc" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto"><polygon points="0 0, 8 3.5, 0 7" fill="#94a3b8"/></marker>
    <marker id="arrow-doc-blue" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto"><polygon points="0 0, 8 3.5, 0 7" fill="#2563eb"/></marker>
    <marker id="arrow-doc-green" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto"><polygon points="0 0, 8 3.5, 0 7" fill="#059669"/></marker>
  </defs>`;

  svg += `<g transform="translate(${MARGIN.left},${MARGIN.top})">`;

  // Legend
  svg += `<g transform="translate(0,-${MARGIN.top - 16})">`;
  responsibles.forEach((r, i) => {
    svg += `<g transform="translate(${i * 280},0)">
      <rect width="36" height="26" rx="4" fill="${r.color}" stroke="${r.borderColor}" stroke-width="2"/>
      <rect x="6" y="6" width="24" height="14" rx="3" fill="${r.taskColor}"/>
      <text x="46" y="18" font-size="12px" font-weight="600" fill="#374151">${esc(r.name)}</text>
    </g>`;
  });
  svg += `</g>`;

  svg += `<text x="${canvasWidth / 2}" y="-30" text-anchor="middle" font-size="18px" font-weight="700" fill="#1e293b">${esc(name)}</text>`;

  // Tool lanes
  let toolY = 0;
  const toolYMap = {};
  tools.forEach((tool) => {
    toolYMap[tool] = toolY;
    const h = getToolHeight(tool, tasks);
    svg += `<g>
      <rect x="0" y="${toolY}" width="${canvasWidth}" height="${h}" rx="6" fill="#ffffff" stroke="#2563eb" stroke-width="2"/>
      <text x="12" y="${toolY + 24}" font-size="12px" font-weight="700" fill="#1d4ed8">${esc(tool)}</text>
      <line x1="0" y1="${toolY + 34}" x2="${canvasWidth}" y2="${toolY + 34}" stroke="#2563eb" stroke-width="1" stroke-opacity="0.15"/>
    </g>`;
    toolY += h + LANE_GAP;
  });

  // Document connector lines (behind nodes)
  documents.forEach((doc) => {
    const pos = docPositions[doc.id];
    if (!pos) return;
    const isInput = doc.type === 'input';
    const connected = tasks.filter((t) => isInput ? t.inputs?.includes(doc.id) : t.outputs?.includes(doc.id));
    if (connected.length === 0) return;
    const docCenterY = pos.y;
    connected.forEach((ct) => {
      const ty = getTaskY(ct, tasks, tools);
      if (ty < -1000) return;
      const tH = getTaskHeight(ct.name, ct.duration);
      const x1 = isInput ? pos.x + DOC_WIDTH : pos.x;
      const x2 = isInput ? getTaskX(ct) : getTaskX(ct) + ct.duration;
      const d = elbowPath(x1, docCenterY, x2, ty + tH / 2, isInput);
      svg += `<path class="doc-line" data-doc="${esc(doc.id)}" data-task="${esc(ct.id)}" d="${d}" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="5,4" stroke-opacity="0.35" stroke-linecap="round" marker-end="url(#arrow-doc)"/>`;
    });
  });

  // Task dependency arrows
  tasks.forEach((task) => {
    (task.dependencies || []).forEach((dep) => {
      const dId = depId(dep);
      const fmt = typeof dep === 'object' ? dep.format || '' : '';
      const depTask = tasks.find((t) => t.id === dId);
      if (!depTask) return;
      const y1 = getTaskY(depTask, tasks, tools) + getTaskHeight(depTask.name, depTask.duration) / 2;
      const y2 = getTaskY(task, tasks, tools) + getTaskHeight(task.name, task.duration) / 2;
      if (y1 < -1000 || y2 < -1000) return;
      const x1 = getTaskX(depTask) + depTask.duration;
      const x2 = getTaskX(task);
      svg += `<g class="dep-arrow" data-from="${esc(dId)}" data-to="${esc(task.id)}">
        <path d="${curvedPath(x1, y1, x2, y2)}" fill="none" stroke="#64748b" stroke-width="1.8" stroke-opacity="0.6" marker-end="url(#arrow)"/>`;
      if (depTask.tool !== task.tool && fmt) {
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        const w = fmt.length * 6.4 + 8;
        svg += `<rect x="${mx - w / 2}" y="${my - 9}" rx="4" width="${w}" height="17" fill="#f1f5f9" stroke="#94a3b8" stroke-width="1"/>
          <text x="${mx}" y="${my + 4}" text-anchor="middle" font-size="9px" font-weight="600" fill="#475569">${esc(fmt)}</text>`;
      }
      svg += `</g>`;
    });
  });

  // Task nodes
  tasks.forEach((task) => {
    const taskY = getTaskY(task, tasks, tools);
    if (taskY < -1000) return;
    const resp = respMap[task.responsible];
    const fill = resp?.taskColor || '#888';
    const w = task.duration;
    const h = getTaskHeight(task.name, w);
    const lines = wrapText(task.name, Math.max(20, w - PAD_X * 2), FONT_SIZE);
    const cx = getTaskX(task) + w / 2;
    const firstBaselineY = taskY + PAD_Y + LINE_HEIGHT - 2;

    svg += `<g class="task-node" data-task-id="${esc(task.id)}" style="cursor:pointer;">
      <rect x="${getTaskX(task)}" y="${taskY}" width="${w}" height="${h}" rx="${TASK_RADIUS}" fill="${fill}" stroke="rgba(0,0,0,0.25)" stroke-width="1.5" class="task-rect"/>`;
    lines.forEach((line, i) => {
      svg += `<text x="${cx}" y="${firstBaselineY + i * LINE_HEIGHT}" text-anchor="middle" font-size="${FONT_SIZE}px" font-weight="bold" fill="white" pointer-events="none">${esc(line)}</text>`;
    });
    svg += `</g>`;
  });

  // Document nodes
  documents.forEach((doc) => {
    const pos = docPositions[doc.id];
    if (!pos) return;
    const isInput = doc.type === 'input';
    const connected = tasks.filter((t) => isInput ? t.inputs?.includes(doc.id) : t.outputs?.includes(doc.id));
    if (connected.length === 0) return;
    const fill = isInput ? '#6b7280' : '#374151';
    const dH = docHeights[doc.id];
    const y = pos.y - dH / 2;
    const lines = doc.name.split(' ').reduce((ls, word, i) => {
      if (i === 0) return [[word]];
      const last = ls[ls.length - 1];
      const test = [...last, word].join(' ');
      if (test.length > 15) return [...ls, [word]];
      last.push(word);
      return ls;
    }, []);
    svg += `<g class="doc-node" data-doc-id="${esc(doc.id)}" style="cursor:pointer;">
      <rect x="${pos.x}" y="${y}" width="${DOC_WIDTH}" height="${dH}" rx="${DOC_RADIUS}" fill="${fill}" stroke="rgba(0,0,0,0.3)" stroke-width="1.5" class="doc-rect"/>`;
    const startY = y + dH / 2 - ((lines.length - 1) * 6);
    lines.forEach((line, i) => {
      svg += `<text x="${pos.x + DOC_WIDTH / 2 + 6}" y="${startY + i * 12}" text-anchor="middle" font-size="10px" font-weight="600" fill="white" pointer-events="none">${esc(line.join ? line.join(' ') : line)}</text>`;
    });
    svg += `</g>`;
  });

  svg += `</g></svg>`;
  return svg;
}

// Build the JSON data blob the static viewer's JS will query for tooltips.
function buildDataBlob(activity) {
  const { tasks, documents, responsibles } = activity;
  const respMap = {};
  responsibles.forEach((r) => { respMap[r.key] = r; });
  const taskData = {};
  tasks.forEach((t) => {
    const inputDocs = documents.filter((d) => t.inputs?.includes(d.id)).map((d) => d.name);
    const outputDocs = documents.filter((d) => t.outputs?.includes(d.id)).map((d) => d.name);
    taskData[t.id] = {
      name: t.name,
      tool: t.tool,
      responsible: respMap[t.responsible]?.name || t.responsible,
      color: respMap[t.responsible]?.taskColor || '#888',
      duration: t.duration,
      details: t.details || '',
      dependencies: (t.dependencies || []).map(depId),
      alternativeTools: t.alternativeTools || [],
      inputDocs, outputDocs,
      inputs: t.inputs || [],
      outputs: t.outputs || [],
    };
  });
  const docData = {};
  documents.forEach((d) => { docData[d.id] = { name: d.name, type: d.type }; });
  return { tasks: taskData, docs: docData };
}

const STATIC_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #e8edf3; }
  #viewer { position: relative; width: 100vw; height: 100vh; overflow: hidden; }
  #canvas-host { width: 100%; height: 100%; overflow: auto; background: #fff; cursor: grab; }
  #canvas-host.panning { cursor: grabbing; }
  .topbar { position: absolute; top: 0; left: 0; right: 0; padding: 10px 16px; background: #ffffffcc; backdrop-filter: blur(4px); border-bottom: 1px solid #e2e8f0; z-index: 50; font-size: 13px; color: #475569; display:flex; align-items:center; gap:10px; }
  .topbar .badge { font-size: 10px; font-weight: 700; letter-spacing: .04em; color: #94a3b8; border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 6px; }
  .zoom-controls { position: absolute; bottom: 16px; right: 16px; z-index: 60; display: flex; align-items: center; gap: 4px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 4px 8px; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
  .zoom-controls button { background: none; border: none; cursor: pointer; font-size: 16px; font-weight: 600; color: #64748b; width: 24px; height: 24px; }
  .zoom-controls span { font-size: 11px; color: #64748b; min-width: 38px; text-align: center; }
  .d3-tooltip { position: fixed; background: #1e293b; color: #fff; padding: 14px 16px; border-radius: 10px; font-size: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.35); min-width: 260px; max-width: 380px; pointer-events: none; z-index: 1000; border: 1px solid rgba(255,255,255,.08); }
  .tooltip-header { display:flex; align-items:center; gap:10px; margin-bottom:10px; padding-bottom:9px; border-bottom:1px solid rgba(255,255,255,.12); font-size:14px; font-weight:700; }
  .tooltip-badge { width:12px; height:12px; border-radius:3px; flex-shrink:0; }
  .tooltip-content p { margin:6px 0; line-height:1.5; font-size:11px; color:#cbd5e1; }
  .tooltip-content strong { color:#7dd3fc; margin-right:5px; }
  .task-node, .doc-node { transition: opacity .15s ease; }
  .dimmed { opacity: .2; }
  .doc-dimmed { opacity: .15; }
  .task-rect.hovered, .doc-rect.hovered { stroke: #fff !important; stroke-width: 3 !important; filter: drop-shadow(0 4px 14px rgba(0,0,0,.45)); }
  .dep-arrow path { transition: stroke .15s ease, stroke-opacity .15s ease, stroke-width .15s ease; }
  .dep-arrow.gold path { stroke: #FFD700 !important; stroke-width: 2.5 !important; stroke-opacity: 1 !important; }
  .dep-arrow.faded path { stroke-opacity: .13 !important; }
  .doc-line { transition: stroke .15s ease, stroke-opacity .15s ease, stroke-width .15s ease; }
  .doc-line.active { stroke-opacity: .95 !important; stroke-width: 2.2 !important; }
  .doc-line.faded { stroke-opacity: .06 !important; }
`;

const STATIC_JS = `
(function() {
  var DATA = window.__WORKFLOW_DATA__;
  var svg = document.getElementById('diagram-svg');
  var host = document.getElementById('canvas-host');
  var tooltip = document.getElementById('tooltip');
  var zoomLabel = document.getElementById('zoom-label');
  var zoom = 1;
  var MIN_ZOOM = 0.3, MAX_ZOOM = 3, STEP = 0.15;

  function applyZoom() {
    svg.style.transform = 'scale(' + zoom + ')';
    svg.style.transformOrigin = '0 0';
    zoomLabel.textContent = Math.round(zoom * 100) + '%';
  }
  document.getElementById('zoom-in').onclick = function() { zoom = Math.min(MAX_ZOOM, zoom + STEP); applyZoom(); };
  document.getElementById('zoom-out').onclick = function() { zoom = Math.max(MIN_ZOOM, zoom - STEP); applyZoom(); };
  document.getElementById('zoom-fit').onclick = function() {
    var hostRect = host.getBoundingClientRect();
    var svgW = parseInt(svg.getAttribute('width'), 10);
    var svgH = parseInt(svg.getAttribute('height'), 10);
    zoom = Math.max(MIN_ZOOM, Math.min(hostRect.width / svgW, hostRect.height / svgH, 1));
    applyZoom();
    host.scrollTo(0, 0);
  };
  host.addEventListener('wheel', function(e) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
    applyZoom();
  }, { passive: false });

  // Pan via drag on empty space
  var isPanning = false, panStartX = 0, panStartY = 0, scrollStartX = 0, scrollStartY = 0;
  host.addEventListener('mousedown', function(e) {
    if (e.target.closest('.task-node') || e.target.closest('.doc-node')) return;
    isPanning = true; host.classList.add('panning');
    panStartX = e.clientX; panStartY = e.clientY;
    scrollStartX = host.scrollLeft; scrollStartY = host.scrollTop;
  });
  window.addEventListener('mousemove', function(e) {
    if (!isPanning) return;
    host.scrollLeft = scrollStartX - (e.clientX - panStartX);
    host.scrollTop = scrollStartY - (e.clientY - panStartY);
  });
  window.addEventListener('mouseup', function() { isPanning = false; host.classList.remove('panning'); });

  function depChainOf(taskId) {
    var chain = {};
    function walk(id) {
      var t = DATA.tasks[id];
      if (!t) return;
      (t.dependencies || []).forEach(function(d) { if (!chain[d]) { chain[d] = true; walk(d); } });
    }
    walk(taskId);
    return chain;
  }

  function showTooltip(taskId, clientX, clientY) {
    var t = DATA.tasks[taskId];
    if (!t) return;
    var html = '<div class="tooltip-header"><span class="tooltip-badge" style="background:' + t.color + '"></span>' + escapeHtml(t.name) + '</div>';
    html += '<div class="tooltip-content">';
    html += '<p><strong>Tool:</strong> ' + escapeHtml(t.tool) + '</p>';
    html += '<p><strong>Responsible:</strong> ' + escapeHtml(t.responsible) + '</p>';
    html += '<p><strong>Duration:</strong> ' + t.duration + ' units</p>';
    if (t.details) html += '<p><strong>Details:</strong> ' + escapeHtml(t.details) + '</p>';
    if (t.alternativeTools && t.alternativeTools.length) html += '<p><strong>Alt. tools:</strong> ' + t.alternativeTools.map(escapeHtml).join(', ') + '</p>';
    if (t.dependencies && t.dependencies.length) html += '<p><strong>Depends on:</strong> ' + t.dependencies.map(function(id) { return escapeHtml((DATA.tasks[id] || {}).name || id); }).join(', ') + '</p>';
    if (t.inputDocs && t.inputDocs.length) html += '<p><strong>Inputs:</strong> ' + t.inputDocs.map(escapeHtml).join(', ') + '</p>';
    if (t.outputDocs && t.outputDocs.length) html += '<p><strong>Outputs:</strong> ' + t.outputDocs.map(escapeHtml).join(', ') + '</p>';
    html += '</div>';
    tooltip.innerHTML = html;
    tooltip.style.left = (clientX + 18) + 'px';
    tooltip.style.top = (clientY - 120) + 'px';
    tooltip.style.display = 'block';
  }
  function hideTooltip() { tooltip.style.display = 'none'; }
  function escapeHtml(s) { var d = document.createElement('div'); d.innerText = s; return d.innerHTML; }

  function clearHighlights() {
    document.querySelectorAll('.task-node').forEach(function(n) { n.classList.remove('dimmed'); n.querySelector('.task-rect').classList.remove('hovered'); });
    document.querySelectorAll('.doc-node').forEach(function(n) { n.classList.remove('doc-dimmed'); n.querySelector('.doc-rect').classList.remove('hovered'); });
    document.querySelectorAll('.dep-arrow').forEach(function(n) { n.classList.remove('gold', 'faded'); });
    document.querySelectorAll('.doc-line').forEach(function(n) { n.classList.remove('active', 'faded'); });
  }

  function highlightTask(taskId) {
    clearHighlights();
    var t = DATA.tasks[taskId];
    if (!t) return;
    var chain = depChainOf(taskId);
    chain[taskId] = true;
    var relatedDocs = {};
    (t.inputs || []).forEach(function(id) { relatedDocs[id] = true; });
    (t.outputs || []).forEach(function(id) { relatedDocs[id] = true; });

    document.querySelectorAll('.task-node').forEach(function(n) {
      var id = n.getAttribute('data-task-id');
      if (id === taskId) { n.querySelector('.task-rect').classList.add('hovered'); }
      else if (!chain[id]) { n.classList.add('dimmed'); }
    });
    document.querySelectorAll('.doc-node').forEach(function(n) {
      var id = n.getAttribute('data-doc-id');
      if (!relatedDocs[id]) n.classList.add('doc-dimmed');
    });
    document.querySelectorAll('.dep-arrow').forEach(function(n) {
      var from = n.getAttribute('data-from'), to = n.getAttribute('data-to');
      if ((to === taskId || chain[to]) && chain[from]) n.classList.add('gold');
      else n.classList.add('faded');
    });
    document.querySelectorAll('.doc-line').forEach(function(n) {
      var docIdAttr = n.getAttribute('data-doc');
      if (relatedDocs[docIdAttr]) n.classList.add('active');
      else n.classList.add('faded');
    });
  }

  function highlightDoc(docId) {
    clearHighlights();
    var relatedTasks = {};
    document.querySelectorAll('.doc-line[data-doc="' + docId + '"]').forEach(function(line) {
      relatedTasks[line.getAttribute('data-task')] = true;
      line.classList.add('active');
    });
    document.querySelectorAll('.doc-line').forEach(function(n) {
      if (n.getAttribute('data-doc') !== docId) n.classList.add('faded');
    });
    document.querySelectorAll('.task-node').forEach(function(n) {
      var id = n.getAttribute('data-task-id');
      if (relatedTasks[id]) n.querySelector('.task-rect').classList.add('hovered');
      else n.classList.add('dimmed');
    });
    document.querySelectorAll('.doc-node').forEach(function(n) {
      if (n.getAttribute('data-doc-id') === docId) n.querySelector('.doc-rect').classList.add('hovered');
      else n.classList.add('doc-dimmed');
    });
  }

  document.querySelectorAll('.task-node').forEach(function(node) {
    node.addEventListener('mouseenter', function(e) {
      var id = node.getAttribute('data-task-id');
      highlightTask(id);
      showTooltip(id, e.clientX, e.clientY);
    });
    node.addEventListener('mousemove', function(e) {
      var id = node.getAttribute('data-task-id');
      tooltip.style.left = (e.clientX + 18) + 'px';
      tooltip.style.top = (e.clientY - 120) + 'px';
    });
    node.addEventListener('mouseleave', function() { clearHighlights(); hideTooltip(); });
  });

  document.querySelectorAll('.doc-node').forEach(function(node) {
    node.addEventListener('mouseenter', function() { highlightDoc(node.getAttribute('data-doc-id')); });
    node.addEventListener('mouseleave', function() { clearHighlights(); });
  });

  // Initial fit
  document.getElementById('zoom-fit').click();
})();
`;

export function buildStaticHtml(activity) {
  const svgMarkup = buildSvg(activity);
  const data = buildDataBlob(activity);
  const generatedAt = new Date().toISOString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(activity.name)} — Workflow (read-only)</title>
<style>${STATIC_CSS}</style>
</head>
<body>
<div id="viewer">
  <div class="topbar">
    <span class="badge">READ-ONLY</span>
    <span>${esc(activity.name)}</span>
    <span style="margin-left:auto;color:#94a3b8;font-size:11px;">Exported ${esc(generatedAt.slice(0, 10))} · this file runs entirely in your browser, nothing is uploaded or stored remotely</span>
  </div>
  <div id="canvas-host">${svgMarkup}</div>
  <div class="zoom-controls">
    <button id="zoom-out" title="Zoom out">−</button>
    <span id="zoom-label">100%</span>
    <button id="zoom-in" title="Zoom in">+</button>
    <div style="width:1px;height:16px;background:#e2e8f0;margin:0 2px;"></div>
    <button id="zoom-fit" title="Fit to screen">⊡</button>
  </div>
  <div id="tooltip" class="d3-tooltip" style="display:none;"></div>
</div>
<script>window.__WORKFLOW_DATA__ = ${JSON.stringify(data)};</script>
<script>${STATIC_JS}</script>
</body>
</html>`;
}

export function downloadStaticHtml(activity) {
  const html = buildStaticHtml(activity);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(activity.name || 'workflow').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-readonly.html`;
  a.click();
  URL.revokeObjectURL(url);
}