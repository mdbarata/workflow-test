// ── exportStaticHtml.js ──────────────────────────────────────────────────────
// Generates a single self-contained .html file with an interactive read-only
// workflow viewer. Supports:
//   • Multiple activities with tab navigation
//   • Timeline view (with collapse/expand & filter) and Architecture view
//   • Activity Links view
//   • Tool notes on hover
//   • Zoom / pan / tooltips
// No React, no build step, no network calls, no data leaves the browser.

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── CSS ──────────────────────────────────────────────────────────────────────
const STATIC_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #e8edf3; overflow: hidden; height: 100vh; }
  #app { display: flex; flex-direction: column; height: 100vh; }

  /* Top bar */
  .topbar { padding: 10px 16px; background: #ffffffcc; backdrop-filter: blur(4px); border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #475569; display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
  .topbar .badge { font-size: 10px; font-weight: 700; letter-spacing: .04em; color: #94a3b8; border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 6px; }

  /* Tab bar */
  .tab-bar { display: flex; flex-wrap: wrap; gap: 0; background: #ffffff; border-bottom: 1.5px solid #e2e8f0; flex-shrink: 0; padding: 0 8px; }
  .tab-btn { padding: 10px 18px; font-size: 12px; font-weight: 600; color: #64748b; background: none; border: none; border-bottom: 2.5px solid transparent; cursor: pointer; transition: all .15s; white-space: nowrap; }
  .tab-btn:hover { color: #1e40af; background: #f8fafc; }
  .tab-btn.active { color: #1e40af; border-bottom-color: #2563eb; }
  .tab-sep { width: 1px; background: #e2e8f0; margin: 6px 2px; align-self: stretch; }

  /* View toggle (timeline/arch) */
  .view-toggle { position: absolute; top: 12px; left: 12px; z-index: 100; }
  .view-toggle button { padding: 8px 14px; font-size: 12px; font-weight: 600; border: none; border-radius: 6px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
  .view-toggle .active-view { background: #1e40af; color: #fff; }
  .view-toggle .inactive-view { background: #fff; color: #1e40af; border: 1.5px solid #1e40af; margin-left: 6px; }

  /* Filter bar */
  .filter-bar { display: flex; align-items: center; gap: 6px; padding: 8px 12px; background: #ffffff; border-bottom: 1px solid #e2e8f0; flex-shrink: 0; flex-wrap: wrap; }
  .filter-label { font-size: 9px; font-weight: 700; letter-spacing: .08em; color: #94a3b8; margin-right: 4px; }
  .filter-divider { width: 1px; height: 20px; background: #e2e8f0; margin: 0 4px; }
  .chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; font-size: 11px; font-weight: 600; border-radius: 14px; border: 1.5px solid #cbd5e1; cursor: pointer; background: #fff; color: #475569; transition: all .15s; user-select: none; }
  .chip:hover { background: #f1f5f9; }
  .chip.chip-active { color: #fff; }
  .chip-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .chip-tool { border-color: #93c5fd; color: #1d4ed8; }
  .chip-tool.chip-active { background: #2563eb; color: #fff; border-color: #2563eb; }
  .chip-clear { border-color: #fca5a5; color: #dc2626; }

  /* Canvas area */
  .tab-panel { display: none; flex: 1; position: relative; overflow: hidden; background: #f8f9fb; }
  .tab-panel.active { display: flex; flex-direction: column; }
  .canvas-host { flex: 1; overflow: hidden; cursor: grab; position: relative; }
  .canvas-host.panning { cursor: grabbing; }

  /* Zoom controls */
  .zoom-controls { position: absolute; bottom: 16px; right: 16px; z-index: 60; display: flex; align-items: center; gap: 4px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 4px 8px; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
  .zoom-controls button { background: none; border: none; cursor: pointer; font-size: 16px; font-weight: 600; color: #64748b; width: 24px; height: 24px; }
  .zoom-controls span { font-size: 11px; color: #64748b; min-width: 38px; text-align: center; }

  /* Tooltip */
  .d3-tooltip { position: fixed; background: #1e293b; color: #fff; padding: 14px 16px; border-radius: 10px; font-size: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.35); min-width: 260px; max-width: 380px; pointer-events: none; z-index: 1000; border: 1px solid rgba(255,255,255,.08); display: none; }
  .tooltip-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; padding-bottom: 9px; border-bottom: 1px solid rgba(255,255,255,.12); font-size: 14px; font-weight: 700; }
  .tooltip-badge { width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0; }
  .tooltip-content p { margin: 6px 0; line-height: 1.5; font-size: 11px; color: #cbd5e1; }
  .tooltip-content strong { color: #7dd3fc; margin-right: 5px; }

  /* SVG interaction classes */
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

  /* Arch view */
  .arch-box { transition: stroke .15s; }
  .arch-edge { transition: stroke-opacity .15s; }

  /* Links view */
  .link-card { transition: stroke .15s; }
  .link-line { transition: stroke-opacity .15s; }
`;

// ── Embedded JS ──────────────────────────────────────────────────────────────
// This is the self-contained viewer logic that runs in the exported HTML.
// It reads window.__EXPORT_DATA__ and renders everything dynamically.
const VIEWER_JS = `
(function() {
  'use strict';
  var D = window.__EXPORT_DATA__;
  var activities = D.workflowData.activities;
  var toolNotes = D.toolNotes || {};
  var initialCollapsed = new Set(D.collapsedTools || []);
  var scope = D.scope;
  var activeIdx = D.activeActivityIndex || 0;

  // ── Constants (mirror the app) ──
  var MARGIN = { top: 110, right: 180, bottom: 60, left: 200 };
  var TOOL_HEIGHT = 160, COLLAPSED_HEIGHT = 34, TASK_GAP = 18, LANE_GAP = 12;
  var DOC_LEFT_X = 20, DOC_RIGHT_OFFSET = 30, ELBOW_STUB = 28;
  var FONT_SIZE = 11, LINE_HEIGHT = 14, PAD_X = 8, PAD_Y = 8, TASK_RADIUS = 6;
  var DOC_WIDTH = 130, DOC_MIN_HEIGHT = 48, DOC_RADIUS = 6;
  var ARCH_BOX_W = 180, ARCH_BOX_H = 90, ARCH_COL_GAP = 100, ARCH_ROW_GAP = 80, ARCH_MAX_COLS = 4;

  // Activity links constants
  var CARD_W = 420, CARD_GAP_Y = 140;
  var CHIP_H = 22, CHIP_PAD_X = 14, CHIP_DOT = 16;
  var FONT_SIZE_RESP = 10, FONT_SIZE_TOOL = 9;
  var CHAR_W_RESP = FONT_SIZE_RESP * 0.62, CHAR_W_TOOL = FONT_SIZE_TOOL * 0.62;
  var CHIP_GAP = 6, CHIP_ROW_H = CHIP_H + CHIP_GAP;
  var LABEL_H = 28, LABEL_GAP = 6, LABEL_FONT = 11, LABEL_CHAR_W = LABEL_FONT * 0.62, LABEL_PAD_X = 20;

  var tooltip = document.getElementById('tooltip');

  function escapeHtml(s) { var d = document.createElement('div'); d.innerText = s || ''; return d.innerHTML; }
  function depId(d) { return typeof d === 'object' ? d.id : d; }

  // ── Text wrapping ──
  function wrapText(text, maxWidth, fontSize) {
    var avgCharW = fontSize * 0.58;
    var charsPerLine = Math.max(1, Math.floor(maxWidth / avgCharW));
    var words = String(text).split(' ');
    var lines = [], current = '';
    for (var i = 0; i < words.length; i++) {
      var candidate = current ? current + ' ' + words[i] : words[i];
      if (candidate.length <= charsPerLine) current = candidate;
      else { if (current) lines.push(current); current = words[i]; }
    }
    if (current) lines.push(current);
    return lines;
  }

  function getTaskHeight(taskName, taskWidth) {
    var textAreaWidth = Math.max(20, taskWidth - PAD_X * 2);
    var lines = wrapText(taskName, textAreaWidth, FONT_SIZE);
    return PAD_Y + lines.length * LINE_HEIGHT + PAD_Y;
  }

  function getToolHeight(tool, tasks, collapsedSet) {
    if (collapsedSet.has(tool)) return COLLAPSED_HEIGHT;
    var toolTasks = tasks.filter(function(t) { return t.tool === tool; });
    if (toolTasks.length === 0) return TOOL_HEIGHT;
    var maxTaskH = Math.max.apply(null, toolTasks.map(function(t) { return getTaskHeight(t.name, t.duration); }));
    var count = toolTasks.length;
    var needed = 50 + count * (maxTaskH + TASK_GAP) + 10;
    return Math.max(TOOL_HEIGHT, needed);
  }

  function getTaskY(task, tasks, tools, collapsedSet) {
    var toolIndex = tools.indexOf(task.tool);
    if (toolIndex === -1 || collapsedSet.has(task.tool)) return -9999;
    var tasksInToolBefore = tasks.filter(function(t) { return t.tool === task.tool && t.startTime < task.startTime; }).length;
    var baseY = 50;
    for (var i = 0; i < toolIndex; i++) baseY += getToolHeight(tools[i], tasks, collapsedSet) + LANE_GAP;
    var maxTaskH = Math.max.apply(null, tasks.filter(function(t) { return t.tool === task.tool; }).map(function(t) { return getTaskHeight(t.name, t.duration); }).concat([getTaskHeight(task.name, task.duration)]));
    var offset = tasksInToolBefore * (maxTaskH + TASK_GAP);
    return baseY + offset;
  }

  function getTaskX(task) { return task.startTime; }

  function curvedPath(x1, y1, x2, y2) { var m = (x1 + x2) / 2; return 'M ' + x1 + ' ' + y1 + ' C ' + m + ' ' + y1 + ', ' + m + ' ' + y2 + ', ' + x2 + ' ' + y2; }
  function elbowPath(x1, y1, x2, y2, isInput) {
    return isInput
      ? 'M ' + x1 + ' ' + y1 + ' H ' + (x1 + ELBOW_STUB) + ' V ' + y2 + ' H ' + x2
      : 'M ' + x1 + ' ' + y1 + ' H ' + (x2 - ELBOW_STUB) + ' V ' + y2 + ' H ' + x2;
  }

  // ── Doc default positions ──
  function buildDocPositions(documents, tasks, tools, collapsedSet, canvasWidth, canvasHeight) {
    var positions = {};
    documents.forEach(function(doc) {
      var isInput = doc.type === 'input';
      var connected = tasks.filter(function(t) { return isInput ? (t.inputs || []).indexOf(doc.id) >= 0 : (t.outputs || []).indexOf(doc.id) >= 0; });
      var x = isInput ? -MARGIN.left + DOC_LEFT_X : canvasWidth + DOC_RIGHT_OFFSET;
      var y;
      if (connected.length > 0) {
        var ys = connected.map(function(t) { return getTaskY(t, tasks, tools, collapsedSet) + getTaskHeight(t.name, t.duration) / 2; });
        y = ys.reduce(function(a, b) { return a + b; }, 0) / ys.length;
      } else {
        y = canvasHeight / 2;
      }
      positions[doc.id] = { x: x, y: y };
    });
    return positions;
  }

  // ── Show/hide tooltip ──
  function showTooltip(html, cx, cy) {
    tooltip.innerHTML = html;
    tooltip.style.display = 'block';
    tooltip.style.left = (cx + 18) + 'px';
    tooltip.style.top = (cy - 120) + 'px';
  }
  function hideTooltip() { tooltip.style.display = 'none'; }

  // ── Dependency chain helper ──
  function depChainOf(taskId, tasks) {
    var chain = {};
    function walk(id) {
      var t = tasks.find(function(x) { return x.id === id; });
      if (!t) return;
      (t.dependencies || []).forEach(function(d) { var did = depId(d); if (!chain[did]) { chain[did] = true; walk(did); } });
    }
    walk(taskId);
    return chain;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TIMELINE RENDERER
  // ══════════════════════════════════════════════════════════════════════════
  function renderTimeline(panelEl, activity, collapsedSet, filterState) {
    var tasks = activity.tasks, tools = activity.tools, responsibles = activity.responsibles, documents = activity.documents || [];
    var respMap = {};
    responsibles.forEach(function(r) { respMap[r.key] = r; });

    // Apply filters
    var visibleTasks = tasks.filter(function(t) {
      var byResp = filterState.responsibles.length === 0 || filterState.responsibles.indexOf(t.responsible) >= 0;
      var byTool = filterState.tools.length === 0 || filterState.tools.indexOf(t.tool) >= 0;
      return byResp && byTool;
    });
    var visibleToolSet = new Set(visibleTasks.map(function(t) { return t.tool; }));
    var visibleTools = tools.filter(function(t) { return visibleToolSet.has(t); });
    var visibleDocIds = new Set();
    visibleTasks.forEach(function(t) { (t.inputs || []).forEach(function(id) { visibleDocIds.add(id); }); (t.outputs || []).forEach(function(id) { visibleDocIds.add(id); }); });
    var visibleDocuments = documents.filter(function(d) { return visibleDocIds.has(d.id); });

    var canvasWidth = Math.max.apply(null, tasks.map(function(t) { return t.startTime + t.duration; }).concat([600])) + 20;
    var canvasHeight = visibleTools.reduce(function(sum, tool) { return sum + getToolHeight(tool, visibleTasks, collapsedSet) + LANE_GAP; }, 0);
    var svgWidth = canvasWidth + MARGIN.left + MARGIN.right;
    var svgHeight = canvasHeight + MARGIN.top + MARGIN.bottom;

    var docPositions = buildDocPositions(visibleDocuments, visibleTasks, visibleTools, collapsedSet, canvasWidth, canvasHeight);
    var docHeights = {};
    visibleDocuments.forEach(function(doc) {
      var lines = wrapDocName(doc.name);
      docHeights[doc.id] = Math.max(DOC_MIN_HEIGHT, lines.length * 12 + 24);
    });

    // Build SVG string
    var svg = '';
    svg += '<svg xmlns="http://www.w3.org/2000/svg" width="' + svgWidth + '" height="' + svgHeight + '" viewBox="0 0 ' + svgWidth + ' ' + svgHeight + '" style="background:#f8f9fb;display:block;user-select:none;">';
    svg += '<defs>';
    svg += '<marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#64748b"/></marker>';
    svg += '<marker id="arrow-gold" markerWidth="10" markerHeight="10" refX="8" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#FFD700"/></marker>';
    svg += '<marker id="arrow-doc" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto"><polygon points="0 0, 8 3.5, 0 7" fill="#94a3b8"/></marker>';
    svg += '<marker id="arrow-doc-blue" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto"><polygon points="0 0, 8 3.5, 0 7" fill="#2563eb"/></marker>';
    svg += '<marker id="arrow-doc-green" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto"><polygon points="0 0, 8 3.5, 0 7" fill="#059669"/></marker>';
    svg += '</defs>';

    svg += '<g transform="translate(' + MARGIN.left + ',' + MARGIN.top + ')">';

    // Legend
    svg += '<g transform="translate(0,-' + (MARGIN.top - 16) + ')">';
    responsibles.forEach(function(r, i) {
      svg += '<g transform="translate(' + (i * 280) + ',0)">';
      svg += '<rect width="36" height="26" rx="4" fill="' + r.color + '" stroke="' + r.borderColor + '" stroke-width="2"/>';
      svg += '<rect x="6" y="6" width="24" height="14" rx="3" fill="' + r.taskColor + '"/>';
      svg += '<text x="46" y="18" font-size="12px" font-weight="600" fill="#374151">' + escapeHtml(r.name) + '</text>';
      svg += '</g>';
    });
    svg += '</g>';

    svg += '<text x="' + (canvasWidth / 2) + '" y="-30" text-anchor="middle" font-size="18px" font-weight="700" fill="#1e293b">' + escapeHtml(activity.name) + '</text>';

    // Tool lanes
    var toolY = 0;
    visibleTools.forEach(function(tool) {
      var isCollapsed = collapsedSet.has(tool);
      var h = getToolHeight(tool, visibleTasks, collapsedSet);
      var hasNote = !!(toolNotes[tool] && toolNotes[tool].trim());
      svg += '<g class="tool-lane" data-tool="' + escapeHtml(tool) + '">';
      svg += '<rect x="0" y="' + toolY + '" width="' + canvasWidth + '" height="' + h + '" rx="6" fill="#ffffff" stroke="#2563eb" stroke-width="2"/>';
      svg += '<text x="12" y="' + (toolY + 24) + '" font-size="12px" font-weight="700" fill="#1d4ed8" style="pointer-events:none">' + escapeHtml(tool) + '</text>';
      // Collapse toggle
      svg += '<g class="collapse-toggle" data-tool="' + escapeHtml(tool) + '" style="cursor:pointer">';
      svg += '<circle cx="150" cy="' + (toolY + 17) + '" r="12" fill="#ffffff" fill-opacity="0.01" stroke="#94a3b8" stroke-width="1.5"/>';
      if (isCollapsed) {
        svg += '<text x="150" y="' + (toolY + 22) + '" text-anchor="middle" font-size="12px" font-weight="700" fill="#94a3b8" transform="rotate(-90, 150, ' + (toolY + 22) + ')" style="pointer-events:none;user-select:none">▼</text>';
      } else {
        svg += '<text x="150" y="' + (toolY + 22) + '" text-anchor="middle" font-size="12px" font-weight="700" fill="#94a3b8" style="pointer-events:none;user-select:none">▼</text>';
      }
      svg += '</g>';
      // Note icon
      if (hasNote) {
        svg += '<g class="note-icon" data-tool="' + escapeHtml(tool) + '" style="cursor:pointer">';
        svg += '<circle cx="' + (canvasWidth - 18) + '" cy="' + (toolY + 17) + '" r="10" fill="#2563eb" stroke="#2563eb" stroke-width="1.5"/>';
        svg += '<text x="' + (canvasWidth - 18) + '" y="' + (toolY + 22) + '" text-anchor="middle" font-size="13px" font-weight="700" fill="#ffffff" style="pointer-events:none;user-select:none">✎</text>';
        svg += '</g>';
      }
      if (!isCollapsed) {
        svg += '<line x1="0" y1="' + (toolY + 34) + '" x2="' + canvasWidth + '" y2="' + (toolY + 34) + '" stroke="#2563eb" stroke-width="1" stroke-opacity="0.15"/>';
      }
      svg += '</g>';
      toolY += h + LANE_GAP;
    });

    // Document connector lines
    visibleDocuments.forEach(function(doc) {
      var pos = docPositions[doc.id];
      if (!pos) return;
      var isInput = doc.type === 'input';
      var connected = visibleTasks.filter(function(t) { return isInput ? (t.inputs || []).indexOf(doc.id) >= 0 : (t.outputs || []).indexOf(doc.id) >= 0; });
      if (connected.length === 0) return;
      var dH = docHeights[doc.id] || DOC_MIN_HEIGHT;
      var docCenterY = pos.y;
      connected.forEach(function(ct) {
        var ty = getTaskY(ct, visibleTasks, visibleTools, collapsedSet);
        if (ty < -1000) return;
        var tH = getTaskHeight(ct.name, ct.duration);
        var x1 = isInput ? pos.x + DOC_WIDTH : pos.x;
        var x2 = isInput ? getTaskX(ct) : getTaskX(ct) + ct.duration;
        var d = elbowPath(x1, docCenterY, x2, ty + tH / 2, isInput);
        svg += '<path class="doc-line" data-doc="' + escapeHtml(doc.id) + '" data-task="' + escapeHtml(ct.id) + '" d="' + d + '" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="5,4" stroke-opacity="0.35" stroke-linecap="round" marker-end="url(#arrow-doc)"/>';
      });
    });

    // Task dependency arrows
    visibleTasks.forEach(function(task) {
      (task.dependencies || []).forEach(function(dep) {
        var dId = depId(dep);
        var fmt = typeof dep === 'object' ? dep.format || '' : '';
        var depTask = visibleTasks.find(function(t) { return t.id === dId; });
        if (!depTask) return;
        var y1 = getTaskY(depTask, visibleTasks, visibleTools, collapsedSet) + getTaskHeight(depTask.name, depTask.duration) / 2;
        var y2 = getTaskY(task, visibleTasks, visibleTools, collapsedSet) + getTaskHeight(task.name, task.duration) / 2;
        if (y1 < -1000 || y2 < -1000) return;
        var x1 = getTaskX(depTask) + depTask.duration;
        var x2 = getTaskX(task);
        svg += '<g class="dep-arrow" data-from="' + escapeHtml(dId) + '" data-to="' + escapeHtml(task.id) + '">';
        svg += '<path d="' + curvedPath(x1, y1, x2, y2) + '" fill="none" stroke="#64748b" stroke-width="1.8" stroke-opacity="0.6" marker-end="url(#arrow)"/>';
        if (depTask.tool !== task.tool && fmt) {
          var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
          var w = fmt.length * 6.4 + 8;
          svg += '<rect x="' + (mx - w / 2) + '" y="' + (my - 9) + '" rx="4" width="' + w + '" height="17" fill="#f1f5f9" stroke="#94a3b8" stroke-width="1"/>';
          svg += '<text x="' + mx + '" y="' + (my + 4) + '" text-anchor="middle" font-size="9px" font-weight="600" fill="#475569">' + escapeHtml(fmt) + '</text>';
        }
        svg += '</g>';
      });
    });

    // Task nodes
    visibleTasks.forEach(function(task) {
      var taskYVal = getTaskY(task, visibleTasks, visibleTools, collapsedSet);
      if (taskYVal < -1000) return;
      var resp = respMap[task.responsible];
      var fill = resp ? resp.taskColor : '#888';
      var w = task.duration;
      var h = getTaskHeight(task.name, w);
      var lines = wrapText(task.name, Math.max(20, w - PAD_X * 2), FONT_SIZE);
      var cx = getTaskX(task) + w / 2;
      var firstBaselineY = taskYVal + PAD_Y + LINE_HEIGHT - 2;

      svg += '<g class="task-node" data-task-id="' + escapeHtml(task.id) + '" style="cursor:pointer;">';
      svg += '<rect x="' + getTaskX(task) + '" y="' + taskYVal + '" width="' + w + '" height="' + h + '" rx="' + TASK_RADIUS + '" fill="' + fill + '" stroke="rgba(0,0,0,0.25)" stroke-width="1.5" class="task-rect"/>';
      lines.forEach(function(line, i) {
        svg += '<text x="' + cx + '" y="' + (firstBaselineY + i * LINE_HEIGHT) + '" text-anchor="middle" font-size="' + FONT_SIZE + 'px" font-weight="bold" fill="white" pointer-events="none">' + escapeHtml(line) + '</text>';
      });
      svg += '</g>';
    });

    // Document nodes
    visibleDocuments.forEach(function(doc) {
      var pos = docPositions[doc.id];
      if (!pos) return;
      var isInput = doc.type === 'input';
      var connected = visibleTasks.filter(function(t) { return isInput ? (t.inputs || []).indexOf(doc.id) >= 0 : (t.outputs || []).indexOf(doc.id) >= 0; });
      if (connected.length === 0) return;
      var fill = isInput ? '#6b7280' : '#374151';
      var dH = docHeights[doc.id] || DOC_MIN_HEIGHT;
      var y = pos.y - dH / 2;
      var lines = wrapDocName(doc.name);
      svg += '<g class="doc-node" data-doc-id="' + escapeHtml(doc.id) + '" style="cursor:pointer;">';
      svg += '<rect x="' + pos.x + '" y="' + y + '" width="' + DOC_WIDTH + '" height="' + dH + '" rx="' + DOC_RADIUS + '" fill="' + fill + '" stroke="rgba(0,0,0,0.3)" stroke-width="1.5" class="doc-rect"/>';
      var startY = y + dH / 2 - ((lines.length - 1) * 6);
      lines.forEach(function(line, i) {
        svg += '<text x="' + (pos.x + DOC_WIDTH / 2 + 6) + '" y="' + (startY + i * 12) + '" text-anchor="middle" font-size="10px" font-weight="600" fill="white" pointer-events="none">' + escapeHtml(typeof line === 'string' ? line : line.join(' ')) + '</text>';
      });
      svg += '</g>';
    });

    svg += '</g></svg>';

    // Insert SVG into host
    var hostEl = panelEl.querySelector('.canvas-host');
    hostEl.innerHTML = svg;

    // Attach interactivity
    attachTimelineInteraction(hostEl, visibleTasks, visibleDocuments, respMap, activity, collapsedSet, filterState, panelEl);
  }

  function wrapDocName(name) {
    return name.split(' ').reduce(function(ls, word, i) {
      if (i === 0) return [[word]];
      var last = ls[ls.length - 1];
      var test = last.concat([word]).join(' ');
      if (test.length > 15) return ls.concat([[word]]);
      last.push(word);
      return ls;
    }, []);
  }

  // ── Timeline interaction (hover highlight, tooltips, collapse toggle) ──
  function attachTimelineInteraction(hostEl, visibleTasks, visibleDocuments, respMap, activity, collapsedSet, filterState, panelEl) {
    var svgEl = hostEl.querySelector('svg');
    if (!svgEl) return;

    // Zoom/pan state
    var zoom = 1, MIN_Z = 0.2, MAX_Z = 3, STEP = 0.15;
    var zoomLabel = panelEl.querySelector('.zoom-label');
    function applyZoom() { svgEl.style.transform = 'scale(' + zoom + ')'; svgEl.style.transformOrigin = '0 0'; if (zoomLabel) zoomLabel.textContent = Math.round(zoom * 100) + '%'; }
    panelEl.querySelector('.zoom-in').onclick = function() { zoom = Math.min(MAX_Z, zoom + STEP); applyZoom(); };
    panelEl.querySelector('.zoom-out').onclick = function() { zoom = Math.max(MIN_Z, zoom - STEP); applyZoom(); };
    panelEl.querySelector('.zoom-fit').onclick = function() {
      var hostRect = hostEl.getBoundingClientRect();
      var svgW = parseInt(svgEl.getAttribute('width'), 10);
      var svgH = parseInt(svgEl.getAttribute('height'), 10);
      zoom = Math.max(MIN_Z, Math.min(hostRect.width / svgW, hostRect.height / svgH, 1));
      applyZoom(); hostEl.scrollTo(0, 0);
    };
    hostEl.addEventListener('wheel', function(e) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoom = Math.min(MAX_Z, Math.max(MIN_Z, zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
      applyZoom();
    }, { passive: false });

    // Pan via drag
    var isPanning = false, panStartX = 0, panStartY = 0, scrollStartX = 0, scrollStartY = 0;
    hostEl.addEventListener('mousedown', function(e) {
      if (e.target.closest('.task-node') || e.target.closest('.doc-node') || e.target.closest('.collapse-toggle') || e.target.closest('.note-icon')) return;
      isPanning = true; hostEl.classList.add('panning');
      panStartX = e.clientX; panStartY = e.clientY;
      scrollStartX = hostEl.scrollLeft; scrollStartY = hostEl.scrollTop;
    });
    window.addEventListener('mousemove', function(e) {
      if (!isPanning) return;
      hostEl.scrollLeft = scrollStartX - (e.clientX - panStartX);
      hostEl.scrollTop = scrollStartY - (e.clientY - panStartY);
    });
    window.addEventListener('mouseup', function() { isPanning = false; hostEl.classList.remove('panning'); });

    // Collapse toggle
    svgEl.querySelectorAll('.collapse-toggle').forEach(function(el) {
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        var tool = el.getAttribute('data-tool');
        if (collapsedSet.has(tool)) collapsedSet.delete(tool); else collapsedSet.add(tool);
        renderTimeline(panelEl, activity, collapsedSet, filterState);
      });
    });

    // Note icon hover
    svgEl.querySelectorAll('.note-icon').forEach(function(el) {
      el.addEventListener('mouseenter', function(e) {
        var tool = el.getAttribute('data-tool');
        var note = toolNotes[tool];
        if (!note) return;
        var html = '<div class="tooltip-header">' + escapeHtml(tool) + '</div>';
        html += '<div class="tooltip-content"><p>' + escapeHtml(note).replace(/\\n/g, '<br>') + '</p></div>';
        showTooltip(html, e.clientX, e.clientY);
      });
      el.addEventListener('mouseleave', function() { hideTooltip(); });
    });

    // Highlight helpers
    function clearHighlights() {
      svgEl.querySelectorAll('.task-node').forEach(function(n) { n.classList.remove('dimmed'); n.querySelector('.task-rect').classList.remove('hovered'); });
      svgEl.querySelectorAll('.doc-node').forEach(function(n) { n.classList.remove('doc-dimmed'); n.querySelector('.doc-rect').classList.remove('hovered'); });
      svgEl.querySelectorAll('.dep-arrow').forEach(function(n) { n.classList.remove('gold', 'faded'); });
      svgEl.querySelectorAll('.doc-line').forEach(function(n) { n.classList.remove('active', 'faded'); });
    }

    function highlightTask(taskId) {
      clearHighlights();
      var task = visibleTasks.find(function(t) { return t.id === taskId; });
      if (!task) return;
      var chain = depChainOf(taskId, visibleTasks);
      chain[taskId] = true;
      var relatedDocs = {};
      (task.inputs || []).forEach(function(id) { relatedDocs[id] = true; });
      (task.outputs || []).forEach(function(id) { relatedDocs[id] = true; });

      svgEl.querySelectorAll('.task-node').forEach(function(n) {
        var id = n.getAttribute('data-task-id');
        if (id === taskId) n.querySelector('.task-rect').classList.add('hovered');
        else if (!chain[id]) n.classList.add('dimmed');
      });
      svgEl.querySelectorAll('.doc-node').forEach(function(n) {
        var id = n.getAttribute('data-doc-id');
        if (!relatedDocs[id]) n.classList.add('doc-dimmed');
      });
      svgEl.querySelectorAll('.dep-arrow').forEach(function(n) {
        var from = n.getAttribute('data-from'), to = n.getAttribute('data-to');
        if ((to === taskId || chain[to]) && chain[from]) n.classList.add('gold');
        else n.classList.add('faded');
      });
      svgEl.querySelectorAll('.doc-line').forEach(function(n) {
        var docIdAttr = n.getAttribute('data-doc');
        if (relatedDocs[docIdAttr]) n.classList.add('active');
        else n.classList.add('faded');
      });
    }

    function highlightDoc(docId) {
      clearHighlights();
      var relatedTasks = {};
      svgEl.querySelectorAll('.doc-line[data-doc="' + docId + '"]').forEach(function(line) {
        relatedTasks[line.getAttribute('data-task')] = true;
        line.classList.add('active');
      });
      svgEl.querySelectorAll('.doc-line').forEach(function(n) {
        if (n.getAttribute('data-doc') !== docId) n.classList.add('faded');
      });
      svgEl.querySelectorAll('.task-node').forEach(function(n) {
        var id = n.getAttribute('data-task-id');
        if (relatedTasks[id]) n.querySelector('.task-rect').classList.add('hovered');
        else n.classList.add('dimmed');
      });
      svgEl.querySelectorAll('.doc-node').forEach(function(n) {
        if (n.getAttribute('data-doc-id') === docId) n.querySelector('.doc-rect').classList.add('hovered');
        else n.classList.add('doc-dimmed');
      });
    }

    // Task hover
    svgEl.querySelectorAll('.task-node').forEach(function(node) {
      node.addEventListener('mouseenter', function(e) {
        var id = node.getAttribute('data-task-id');
        highlightTask(id);
        var task = visibleTasks.find(function(t) { return t.id === id; });
        if (!task) return;
        var resp = respMap[task.responsible];
        var html = '<div class="tooltip-header"><span class="tooltip-badge" style="background:' + (resp ? resp.taskColor : '#888') + '"></span>' + escapeHtml(task.name) + '</div>';
        html += '<div class="tooltip-content">';
        html += '<p><strong>Tool:</strong> ' + escapeHtml(task.tool) + '</p>';
        html += '<p><strong>Responsible:</strong> ' + escapeHtml(resp ? resp.name : task.responsible) + '</p>';
        html += '<p><strong>Duration:</strong> ' + task.duration + ' units</p>';
        if (task.details) html += '<p><strong>Details:</strong> ' + escapeHtml(task.details) + '</p>';
        if (task.alternativeTools && task.alternativeTools.length) html += '<p><strong>Alt. tools:</strong> ' + task.alternativeTools.map(escapeHtml).join(', ') + '</p>';
        if (task.dependencies && task.dependencies.length) {
          html += '<p><strong>Depends on:</strong> ' + task.dependencies.map(function(d) {
            var did = depId(d);
            var dt = visibleTasks.find(function(t) { return t.id === did; });
            return escapeHtml(dt ? dt.name : did);
          }).join(', ') + '</p>';
        }
        var inputDocs = (activity.documents || []).filter(function(d) { return (task.inputs || []).indexOf(d.id) >= 0; });
        var outputDocs = (activity.documents || []).filter(function(d) { return (task.outputs || []).indexOf(d.id) >= 0; });
        if (inputDocs.length) html += '<p><strong>Inputs:</strong> ' + inputDocs.map(function(d) { return escapeHtml(d.name); }).join(', ') + '</p>';
        if (outputDocs.length) html += '<p><strong>Outputs:</strong> ' + outputDocs.map(function(d) { return escapeHtml(d.name); }).join(', ') + '</p>';
        html += '</div>';
        showTooltip(html, e.clientX, e.clientY);
      });
      node.addEventListener('mousemove', function(e) {
        tooltip.style.left = (e.clientX + 18) + 'px';
        tooltip.style.top = (e.clientY - 120) + 'px';
      });
      node.addEventListener('mouseleave', function() { clearHighlights(); hideTooltip(); });
    });

    // Doc hover
    svgEl.querySelectorAll('.doc-node').forEach(function(node) {
      node.addEventListener('mouseenter', function() { highlightDoc(node.getAttribute('data-doc-id')); });
      node.addEventListener('mouseleave', function() { clearHighlights(); });
    });

    // Initial fit
    setTimeout(function() { panelEl.querySelector('.zoom-fit').click(); }, 50);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ARCHITECTURE VIEW RENDERER
  // ══════════════════════════════════════════════════════════════════════════
  function computeToolLayout(tools, tasks) {
    var toolSet = new Set(tools);
    var edges = {};
    tools.forEach(function(t) { edges[t] = new Set(); });
    tasks.forEach(function(task) {
      (task.dependencies || []).forEach(function(dep) {
        var fromTask = tasks.find(function(t) { return t.id === depId(dep); });
        var fromTool = fromTask ? fromTask.tool : null;
        if (fromTool && fromTool !== task.tool && toolSet.has(fromTool) && toolSet.has(task.tool)) edges[fromTool].add(task.tool);
      });
    });
    var depth = {};
    tools.forEach(function(t) { depth[t] = 0; });
    for (var pass = 0; pass < tools.length; pass++)
      tools.forEach(function(from) { edges[from].forEach(function(to) { if (depth[to] <= depth[from]) depth[to] = depth[from] + 1; }); });
    var maxDepth = tools.reduce(function(m, t) { return Math.max(m, depth[t]); }, 0);
    var ordered = [];
    for (var d = 0; d <= maxDepth; d++) tools.filter(function(t) { return depth[t] === d; }).forEach(function(t) { ordered.push(t); });
    var pos = {};
    ordered.forEach(function(tool, idx) {
      pos[tool] = { x: (idx % ARCH_MAX_COLS) * (ARCH_BOX_W + ARCH_COL_GAP) + 60, y: Math.floor(idx / ARCH_MAX_COLS) * (ARCH_BOX_H + ARCH_ROW_GAP) + 60 };
    });
    return { pos: pos, edges: edges };
  }

  function computeToolEdgeFormats(tasks) {
    var map = {};
    tasks.forEach(function(task) {
      (task.dependencies || []).forEach(function(dep) {
        var fromTask = tasks.find(function(t) { return t.id === depId(dep); });
        var fromTool = fromTask ? fromTask.tool : null;
        if (fromTool && fromTool !== task.tool) {
          var key = fromTool + '→' + task.tool;
          if (!map[key]) map[key] = new Set();
          var fmt = typeof dep === 'object' ? dep.format : '';
          if (fmt) map[key].add(fmt);
        }
      });
    });
    return map;
  }

  function renderArchitecture(panelEl, activity) {
    var tasks = activity.tasks, tools = activity.tools, responsibles = activity.responsibles;
    var respMap = {};
    responsibles.forEach(function(r) { respMap[r.key] = r; });

    var layout = computeToolLayout(tools, tasks);
    var pos = layout.pos, edges = layout.edges;
    var edgeFormats = computeToolEdgeFormats(tasks);
    var toolResps = {};
    tools.forEach(function(tool) {
      var resps = [];
      var seen = {};
      tasks.filter(function(t) { return t.tool === tool; }).forEach(function(t) {
        if (!seen[t.responsible]) { seen[t.responsible] = true; if (respMap[t.responsible]) resps.push(respMap[t.responsible]); }
      });
      toolResps[tool] = resps;
    });

    var vals = Object.values(pos);
    var maxX = (vals.length ? vals.reduce(function(m, p) { return Math.max(m, p.x); }, 0) : 0) + ARCH_BOX_W + 120;
    var maxY = (vals.length ? vals.reduce(function(m, p) { return Math.max(m, p.y); }, 0) : 0) + ARCH_BOX_H + 120;

    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + maxX + '" height="' + maxY + '" viewBox="0 0 ' + maxX + ' ' + maxY + '" style="background:#f8f9fb;display:block;user-select:none;">';
    svg += '<defs>';
    svg += '<marker id="arch-arr-gray" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><polygon points="0 0, 6 3, 0 6" fill="#64748b"/></marker>';
    svg += '<marker id="arch-arr-blue" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><polygon points="0 0, 6 3, 0 6" fill="#2563eb"/></marker>';
    svg += '</defs>';

    // Edges
    tools.forEach(function(from) {
      (edges[from] || new Set()).forEach(function(to) {
        var f = pos[from], t = pos[to];
        if (!f || !t) return;
        var key = from + '→' + to;
        var fmts = edgeFormats[key] ? Array.from(edgeFormats[key]).join(', ') : '';
        var fromRight = f.x + ARCH_BOX_W / 2 < t.x + ARCH_BOX_W / 2;
        var lx1 = fromRight ? f.x + ARCH_BOX_W : f.x;
        var ly1 = f.y + ARCH_BOX_H / 2;
        var lx2 = fromRight ? t.x : t.x + ARCH_BOX_W;
        var ly2 = t.y + ARCH_BOX_H / 2;
        var GAP = 20;
        var ax2 = fromRight ? lx1 + GAP : lx1 - GAP;
        var mx = (lx1 + lx2) / 2;
        var midX = mx, midY = (ly1 + ly2) / 2;

        svg += '<g class="arch-edge" data-from="' + escapeHtml(from) + '" data-to="' + escapeHtml(to) + '">';
        svg += '<line x1="' + lx1 + '" y1="' + ly1 + '" x2="' + ax2 + '" y2="' + ly1 + '" stroke="#64748b" stroke-width="1.5" stroke-opacity="0.8" marker-end="url(#arch-arr-gray)"/>';
        svg += '<path d="M ' + ax2 + ' ' + ly1 + ' C ' + mx + ' ' + ly1 + ', ' + mx + ' ' + ly2 + ', ' + lx2 + ' ' + ly2 + '" fill="none" stroke="#64748b" stroke-width="1.5" stroke-opacity="0.8"/>';
        if (fmts) {
          svg += '<rect x="' + (midX - fmts.length * 3 - 4) + '" y="' + (midY - 20) + '" width="' + (fmts.length * 6 + 8) + '" height="16" rx="4" fill="#f1f5f9" stroke="#64748b" stroke-width="1"/>';
          svg += '<text x="' + midX + '" y="' + (midY - 8) + '" text-anchor="middle" font-size="9px" font-weight="600" fill="#475569">' + escapeHtml(fmts) + '</text>';
        }
        svg += '</g>';
      });
    });

    // Tool boxes
    tools.forEach(function(tool) {
      var p = pos[tool];
      if (!p) return;
      var resps = toolResps[tool] || [];
      var count = tasks.filter(function(t) { return t.tool === tool; }).length;
      var hasNote = !!(toolNotes[tool] && toolNotes[tool].trim());

      svg += '<g class="arch-box" data-tool="' + escapeHtml(tool) + '" style="cursor:default">';
      svg += '<rect x="' + (p.x + 3) + '" y="' + (p.y + 3) + '" width="' + ARCH_BOX_W + '" height="' + ARCH_BOX_H + '" rx="10" fill="rgba(0,0,0,0.07)"/>';
      svg += '<rect x="' + p.x + '" y="' + p.y + '" width="' + ARCH_BOX_W + '" height="' + ARCH_BOX_H + '" rx="10" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>';
      if (resps[0]) {
        svg += '<rect x="' + p.x + '" y="' + p.y + '" width="' + ARCH_BOX_W + '" height="8" rx="10" fill="' + resps[0].taskColor + '"/>';
        svg += '<rect x="' + p.x + '" y="' + (p.y + 4) + '" width="' + ARCH_BOX_W + '" height="4" fill="' + resps[0].taskColor + '"/>';
      }
      svg += '<text x="' + (p.x + ARCH_BOX_W / 2) + '" y="' + (p.y + 30) + '" text-anchor="middle" font-size="12px" font-weight="700" fill="#1e293b" style="pointer-events:none;user-select:none">' + escapeHtml(tool) + '</text>';
      svg += '<text x="' + (p.x + ARCH_BOX_W / 2) + '" y="' + (p.y + 48) + '" text-anchor="middle" font-size="10px" fill="#64748b" style="pointer-events:none;user-select:none">' + count + ' task' + (count !== 1 ? 's' : '') + '</text>';
      resps.slice(0, 4).forEach(function(r, ri) {
        svg += '<circle cx="' + (p.x + 14 + ri * 16) + '" cy="' + (p.y + 68) + '" r="6" fill="' + r.taskColor + '" stroke="#ffffff" stroke-width="1.5"/>';
      });
      if (hasNote) {
        svg += '<g class="arch-note-icon" data-tool="' + escapeHtml(tool) + '" style="cursor:pointer">';
        svg += '<circle cx="' + (p.x + ARCH_BOX_W - 14) + '" cy="' + (p.y + 68) + '" r="9" fill="#2563eb" stroke="#2563eb" stroke-width="1.5"/>';
        svg += '<text x="' + (p.x + ARCH_BOX_W - 14) + '" y="' + (p.y + 72) + '" text-anchor="middle" font-size="11px" font-weight="700" fill="#fff" style="pointer-events:none;user-select:none">✎</text>';
        svg += '</g>';
      }
      svg += '</g>';
    });

    svg += '</svg>';

    var hostEl = panelEl.querySelector('.canvas-host');
    hostEl.innerHTML = svg;
    attachArchInteraction(hostEl, panelEl, tools, edges);
  }

  function attachArchInteraction(hostEl, panelEl, tools, edges) {
    var svgEl = hostEl.querySelector('svg');
    if (!svgEl) return;

    // Zoom/pan
    var zoom = 1, MIN_Z = 0.2, MAX_Z = 3, STEP = 0.15;
    var zoomLabel = panelEl.querySelector('.zoom-label');
    function applyZoom() { svgEl.style.transform = 'scale(' + zoom + ')'; svgEl.style.transformOrigin = '0 0'; if (zoomLabel) zoomLabel.textContent = Math.round(zoom * 100) + '%'; }
    panelEl.querySelector('.zoom-in').onclick = function() { zoom = Math.min(MAX_Z, zoom + STEP); applyZoom(); };
    panelEl.querySelector('.zoom-out').onclick = function() { zoom = Math.max(MIN_Z, zoom - STEP); applyZoom(); };
    panelEl.querySelector('.zoom-fit').onclick = function() {
      var hostRect = hostEl.getBoundingClientRect();
      var svgW = parseInt(svgEl.getAttribute('width'), 10);
      var svgH = parseInt(svgEl.getAttribute('height'), 10);
      zoom = Math.max(MIN_Z, Math.min(hostRect.width / svgW, hostRect.height / svgH, 1));
      applyZoom(); hostEl.scrollTo(0, 0);
    };
    hostEl.addEventListener('wheel', function(e) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoom = Math.min(MAX_Z, Math.max(MIN_Z, zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
      applyZoom();
    }, { passive: false });

    // Hover highlight
    svgEl.querySelectorAll('.arch-box').forEach(function(box) {
      var tool = box.getAttribute('data-tool');
      box.addEventListener('mouseenter', function() {
        var connected = new Set();
        connected.add(tool);
        (edges[tool] || new Set()).forEach(function(t) { connected.add(t); });
        tools.forEach(function(t) { if ((edges[t] || new Set()).has(tool)) connected.add(t); });
        svgEl.querySelectorAll('.arch-box').forEach(function(b) {
          var t = b.getAttribute('data-tool');
          b.querySelector('rect:nth-child(2)').setAttribute('stroke', connected.has(t) ? '#2563eb' : '#cbd5e1');
          b.querySelector('rect:nth-child(2)').setAttribute('stroke-width', connected.has(t) ? '2.5' : '1.5');
        });
        svgEl.querySelectorAll('.arch-edge').forEach(function(e) {
          var from = e.getAttribute('data-from'), to = e.getAttribute('data-to');
          var isConn = (from === tool || to === tool);
          e.querySelectorAll('line, path').forEach(function(el) {
            el.setAttribute('stroke', isConn ? '#2563eb' : '#64748b');
            el.setAttribute('stroke-opacity', isConn ? '1' : '0.12');
          });
        });
      });
      box.addEventListener('mouseleave', function() {
        svgEl.querySelectorAll('.arch-box').forEach(function(b) {
          b.querySelector('rect:nth-child(2)').setAttribute('stroke', '#cbd5e1');
          b.querySelector('rect:nth-child(2)').setAttribute('stroke-width', '1.5');
        });
        svgEl.querySelectorAll('.arch-edge').forEach(function(e) {
          e.querySelectorAll('line, path').forEach(function(el) {
            el.setAttribute('stroke', '#64748b');
            el.setAttribute('stroke-opacity', '0.8');
          });
        });
      });
    });

    // Note icon hover
    svgEl.querySelectorAll('.arch-note-icon').forEach(function(el) {
      el.addEventListener('mouseenter', function(e) {
        var tool = el.getAttribute('data-tool');
        var note = toolNotes[tool];
        if (!note) return;
        showTooltip('<div class="tooltip-header">' + escapeHtml(tool) + '</div><div class="tooltip-content"><p>' + escapeHtml(note).replace(/\\n/g, '<br>') + '</p></div>', e.clientX, e.clientY);
      });
      el.addEventListener('mouseleave', function() { hideTooltip(); });
    });

    setTimeout(function() { panelEl.querySelector('.zoom-fit').click(); }, 50);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ACTIVITY LINKS VIEW RENDERER
  // ══════════════════════════════════════════════════════════════════════════
  function computeLinks(activities) {
    var pairMap = {};
    for (var i = 0; i < activities.length; i++) {
      for (var j = 0; j < activities.length; j++) {
        if (i === j) continue;
        var a = activities[i], b = activities[j];
        var aOutputs = (a.documents || []).filter(function(d) { return d.type === 'output'; });
        var bInputs = (b.documents || []).filter(function(d) { return d.type === 'input'; });
        aOutputs.forEach(function(od) {
          bInputs.forEach(function(id) {
            if (od.id === id.id || od.name.trim().toLowerCase() === id.name.trim().toLowerCase()) {
              var key = a.id + '->' + b.id;
              if (!pairMap[key]) pairMap[key] = { from: a.id, to: b.id, docNames: [], key: key };
              if (pairMap[key].docNames.indexOf(od.name) < 0) pairMap[key].docNames.push(od.name);
            }
          });
        });
      }
    }
    return Object.values(pairMap);
  }

  function respChipWidth(name) { return Math.max(80, CHIP_DOT + name.length * CHAR_W_RESP + CHIP_PAD_X); }
  function toolChipWidth(name) { return Math.max(60, name.length * CHAR_W_TOOL + CHIP_PAD_X * 2); }

  function layoutRespChips(responsibles, startY) {
    var PAD = 16, MAX_ROW_W = CARD_W - PAD * 2;
    var chips = [], cx = PAD, cy = startY;
    responsibles.forEach(function(r) {
      var w = respChipWidth(r.name);
      if (chips.length > 0 && cx + w > PAD + MAX_ROW_W) { cx = PAD; cy += CHIP_ROW_H; }
      chips.push({ r: r, x: cx, y: cy, w: w });
      cx += w + CHIP_GAP;
    });
    var endY = responsibles.length ? (chips[chips.length - 1].y + CHIP_H) : startY;
    return { chips: chips, endY: endY };
  }

  function layoutToolChips(tools, startY) {
    var PAD = 16, MAX_ROW_W = CARD_W - PAD * 2;
    var chips = [], cx = PAD, cy = startY;
    tools.forEach(function(tool) {
      var w = toolChipWidth(tool);
      if (chips.length > 0 && cx + w > PAD + MAX_ROW_W) { cx = PAD; cy += CHIP_ROW_H; }
      chips.push({ tool: tool, x: cx, y: cy, w: w });
      cx += w + CHIP_GAP;
    });
    var endY = tools.length ? (chips[chips.length - 1].y + CHIP_H) : startY;
    return { chips: chips, endY: endY };
  }

  function cardHeight(activity) {
    var TITLE_H = 44, BOTTOM_PAD = 16;
    var lr = layoutRespChips(activity.responsibles || [], TITLE_H);
    var toolStartY = (activity.responsibles && activity.responsibles.length) ? lr.endY + CHIP_GAP : TITLE_H;
    var lt = layoutToolChips(activity.tools || [], toolStartY);
    var contentEnd = (activity.tools && activity.tools.length) ? lt.endY : toolStartY;
    return contentEnd + BOTTOM_PAD;
  }

  function renderLinks(panelEl) {
    var links = computeLinks(activities);
    var heights = {};
    activities.forEach(function(a) { heights[a.id] = cardHeight(a); });

    // Default positions
    var positions = {};
    activities.forEach(function(act, i) { positions[act.id] = { x: 140, y: 40 + i * CARD_GAP_Y }; });

    var maxX = Math.max.apply(null, Object.values(positions).map(function(p) { return p.x; }).concat([0])) + CARD_W + 200;
    var maxYArr = Object.keys(positions).map(function(id) { return positions[id].y + (heights[id] || 100); });
    var maxY = Math.max.apply(null, maxYArr.concat([0])) + 80;

    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + maxX + '" height="' + maxY + '" viewBox="0 0 ' + maxX + ' ' + maxY + '" style="background:#f8f9fb;display:block;user-select:none;">';
    svg += '<defs>';
    svg += '<marker id="link-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto"><polygon points="0 0, 8 3.5, 0 7" fill="#94a3b8"/></marker>';
    svg += '<marker id="link-arrow-active" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto"><polygon points="0 0, 8 3.5, 0 7" fill="#059669"/></marker>';
    svg += '</defs>';

    // Draw links
    links.forEach(function(link) {
      var from = positions[link.from], to = positions[link.to];
      if (!from || !to) return;
      var fromH = heights[link.from] || 100;
      var fromBelow = from.y < to.y;
      var x1 = from.x + CARD_W / 2;
      var y1 = fromBelow ? from.y + fromH : from.y;
      var x2 = to.x + CARD_W / 2;
      var y2 = fromBelow ? to.y : to.y + (heights[link.to] || 100);
      var n = link.docNames.length;
      var stackH = n * LABEL_H + (n - 1) * LABEL_GAP;
      var gapStart = (y1 + y2) / 2 - stackH / 2;
      var midX = (x1 + x2) / 2;

      svg += '<g class="link-group" data-from="' + escapeHtml(link.from) + '" data-to="' + escapeHtml(link.to) + '">';
      svg += '<path d="M ' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + ((y1 + y2) / 2) + ', ' + x2 + ' ' + ((y1 + y2) / 2) + ', ' + x2 + ' ' + y2 + '" fill="none" stroke="#94a3b8" stroke-width="1.4" stroke-dasharray="5,4" stroke-opacity="0.75" marker-end="url(#link-arrow)"/>';
      link.docNames.forEach(function(docName, i) {
        var labelW = docName.length * LABEL_CHAR_W + LABEL_PAD_X * 2;
        var labelY = gapStart + i * (LABEL_H + LABEL_GAP) + LABEL_H / 2;
        svg += '<g transform="translate(' + midX + ', ' + labelY + ')">';
        svg += '<rect x="' + (-labelW / 2) + '" y="' + (-LABEL_H / 2) + '" width="' + labelW + '" height="' + LABEL_H + '" rx="13" fill="#ffffff" stroke="#94a3b8" stroke-width="1.2"/>';
        svg += '<text text-anchor="middle" y="4" font-size="' + LABEL_FONT + 'px" font-weight="600" fill="#475569">' + escapeHtml(docName) + '</text>';
        svg += '</g>';
      });
      svg += '</g>';
    });

    // Draw cards
    activities.forEach(function(act) {
      var pos = positions[act.id];
      var h = heights[act.id];
      var taskCount = act.tasks ? act.tasks.length : 0;
      var TITLE_H = 44;

      svg += '<g class="link-card" data-card-id="' + escapeHtml(act.id) + '">';
      svg += '<rect x="' + pos.x + '" y="' + pos.y + '" width="' + CARD_W + '" height="' + h + '" rx="10" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>';
      svg += '<text x="' + (pos.x + 16) + '" y="' + (pos.y + 26) + '" font-size="14px" font-weight="700" fill="#1e293b">' + escapeHtml(act.name) + '</text>';
      svg += '<text x="' + (pos.x + CARD_W - 16) + '" y="' + (pos.y + 26) + '" font-size="11px" fill="#94a3b8" text-anchor="end">' + taskCount + ' task' + (taskCount !== 1 ? 's' : '') + '</text>';

      // Responsible chips
      var lr = layoutRespChips(act.responsibles || [], TITLE_H);
      lr.chips.forEach(function(c) {
        svg += '<rect x="' + (pos.x + c.x) + '" y="' + (pos.y + c.y) + '" width="' + c.w + '" height="' + CHIP_H + '" rx="11" fill="' + c.r.color + '" stroke="' + c.r.borderColor + '" stroke-width="1.2"/>';
        svg += '<circle cx="' + (pos.x + c.x + 10) + '" cy="' + (pos.y + c.y + CHIP_H / 2) + '" r="4" fill="' + c.r.taskColor + '"/>';
        svg += '<text x="' + (pos.x + c.x + CHIP_DOT) + '" y="' + (pos.y + c.y + CHIP_H / 2 + 4) + '" font-size="' + FONT_SIZE_RESP + 'px" font-weight="600" fill="' + c.r.borderColor + '" style="pointer-events:none;user-select:none">' + escapeHtml(c.r.name) + '</text>';
      });

      // Tool chips
      var toolStartY = (act.responsibles && act.responsibles.length) ? lr.endY + CHIP_GAP : TITLE_H;
      var lt = layoutToolChips(act.tools || [], toolStartY);
      lt.chips.forEach(function(c) {
        svg += '<rect x="' + (pos.x + c.x) + '" y="' + (pos.y + c.y) + '" width="' + c.w + '" height="' + CHIP_H + '" rx="11" fill="#eff6ff" stroke="#2563eb" stroke-width="1"/>';
        svg += '<text x="' + (pos.x + c.x + c.w / 2) + '" y="' + (pos.y + c.y + CHIP_H / 2 + 4) + '" font-size="' + FONT_SIZE_TOOL + 'px" font-weight="600" fill="#1d4ed8" text-anchor="middle" style="pointer-events:none;user-select:none">' + escapeHtml(c.tool) + '</text>';
      });

      svg += '</g>';
    });

    svg += '</svg>';

    var hostEl = panelEl.querySelector('.canvas-host');
    hostEl.innerHTML = svg;
    attachLinksInteraction(hostEl, panelEl, activities, links);
  }

  function attachLinksInteraction(hostEl, panelEl, activities, links) {
    var svgEl = hostEl.querySelector('svg');
    if (!svgEl) return;

    // Zoom/pan
    var zoom = 1, MIN_Z = 0.3, MAX_Z = 2.5, STEP = 0.15;
    var zoomLabel = panelEl.querySelector('.zoom-label');
    function applyZoom() { svgEl.style.transform = 'scale(' + zoom + ')'; svgEl.style.transformOrigin = '0 0'; if (zoomLabel) zoomLabel.textContent = Math.round(zoom * 100) + '%'; }
    panelEl.querySelector('.zoom-in').onclick = function() { zoom = Math.min(MAX_Z, zoom + STEP); applyZoom(); };
    panelEl.querySelector('.zoom-out').onclick = function() { zoom = Math.max(MIN_Z, zoom - STEP); applyZoom(); };
    panelEl.querySelector('.zoom-fit').onclick = function() {
      var hostRect = hostEl.getBoundingClientRect();
      var svgW = parseInt(svgEl.getAttribute('width'), 10);
      var svgH = parseInt(svgEl.getAttribute('height'), 10);
      zoom = Math.max(MIN_Z, Math.min(hostRect.width / svgW, hostRect.height / svgH, 1));
      applyZoom(); hostEl.scrollTo(0, 0);
    };
    hostEl.addEventListener('wheel', function(e) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoom = Math.min(MAX_Z, Math.max(MIN_Z, zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
      applyZoom();
    }, { passive: false });

    // Card hover highlight
    svgEl.querySelectorAll('.link-card').forEach(function(card) {
      var cardId = card.getAttribute('data-card-id');
      card.addEventListener('mouseenter', function() {
        svgEl.querySelectorAll('.link-card').forEach(function(c) {
          var id = c.getAttribute('data-card-id');
          var isConn = id === cardId || links.some(function(l) { return (l.from === cardId && l.to === id) || (l.to === cardId && l.from === id); });
          c.querySelector('rect').setAttribute('stroke', isConn ? '#2563eb' : '#cbd5e1');
          c.querySelector('rect').setAttribute('stroke-width', isConn ? '2.5' : '1.5');
        });
        svgEl.querySelectorAll('.link-group').forEach(function(g) {
          var from = g.getAttribute('data-from'), to = g.getAttribute('data-to');
          var isConn = from === cardId || to === cardId;
          g.querySelectorAll('path').forEach(function(p) { p.setAttribute('stroke', isConn ? '#059669' : '#94a3b8'); p.setAttribute('stroke-opacity', isConn ? '1' : '0.15'); });
          g.querySelectorAll('rect').forEach(function(r) { r.setAttribute('fill', isConn ? '#ecfdf5' : '#ffffff'); r.setAttribute('stroke', isConn ? '#059669' : '#94a3b8'); r.setAttribute('opacity', isConn ? '1' : '0.2'); });
          g.querySelectorAll('text').forEach(function(t) { t.setAttribute('fill', isConn ? '#047857' : '#475569'); t.setAttribute('opacity', isConn ? '1' : '0.2'); });
        });
      });
      card.addEventListener('mouseleave', function() {
        svgEl.querySelectorAll('.link-card').forEach(function(c) {
          c.querySelector('rect').setAttribute('stroke', '#cbd5e1');
          c.querySelector('rect').setAttribute('stroke-width', '1.5');
        });
        svgEl.querySelectorAll('.link-group').forEach(function(g) {
          g.querySelectorAll('path').forEach(function(p) { p.setAttribute('stroke', '#94a3b8'); p.setAttribute('stroke-opacity', '0.75'); });
          g.querySelectorAll('rect').forEach(function(r) { r.setAttribute('fill', '#ffffff'); r.setAttribute('stroke', '#94a3b8'); r.setAttribute('opacity', '1'); });
          g.querySelectorAll('text').forEach(function(t) { t.setAttribute('fill', '#475569'); t.setAttribute('opacity', '1'); });
        });
      });
    });

    setTimeout(function() { panelEl.querySelector('.zoom-fit').click(); }, 50);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FILTER BAR BUILDER
  // ══════════════════════════════════════════════════════════════════════════
  function buildFilterBar(panelEl, activity, filterState, collapsedSet) {
    var barEl = panelEl.querySelector('.filter-bar');
    if (!barEl) return;
    var html = '<span class="filter-label">RESPONSIBLE</span>';
    (activity.responsibles || []).forEach(function(r) {
      var active = filterState.responsibles.indexOf(r.key) >= 0;
      var style = active
        ? 'background-color:' + r.taskColor + ';border-color:' + r.borderColor + ';color:white'
        : 'border-color:' + r.borderColor + ';color:' + r.borderColor;
      html += '<button class="chip' + (active ? ' chip-active' : '') + '" data-type="responsibles" data-key="' + escapeHtml(r.key) + '" style="' + style + '"><span class="chip-dot" style="background-color:' + r.taskColor + '"></span>' + escapeHtml(r.name) + '</button>';
    });
    html += '<div class="filter-divider"></div><span class="filter-label">TOOL</span>';
    (activity.tools || []).forEach(function(tool) {
      var active = filterState.tools.indexOf(tool) >= 0;
      html += '<button class="chip chip-tool' + (active ? ' chip-active' : '') + '" data-type="tools" data-key="' + escapeHtml(tool) + '">' + escapeHtml(tool) + '</button>';
    });
    if (filterState.responsibles.length > 0 || filterState.tools.length > 0) {
      html += '<div class="filter-divider"></div><button class="chip chip-clear" data-action="clear">✕ Clear filters</button>';
    }
    barEl.innerHTML = html;

    // Attach filter handlers
    barEl.querySelectorAll('.chip[data-type]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var type = btn.getAttribute('data-type');
        var key = btn.getAttribute('data-key');
        var idx = filterState[type].indexOf(key);
        if (idx >= 0) filterState[type].splice(idx, 1);
        else filterState[type].push(key);
        buildFilterBar(panelEl, activity, filterState, collapsedSet);
        renderTimeline(panelEl, activity, collapsedSet, filterState);
      });
    });
    barEl.querySelectorAll('[data-action="clear"]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        filterState.responsibles = [];
        filterState.tools = [];
        buildFilterBar(panelEl, activity, filterState, collapsedSet);
        renderTimeline(panelEl, activity, collapsedSet, filterState);
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BOOTSTRAP — wire up tabs and initial render
  // ══════════════════════════════════════════════════════════════════════════
  var tabBtns = document.querySelectorAll('.tab-btn');
  var tabPanels = document.querySelectorAll('.tab-panel');
  var rendered = {}; // track which panels have been rendered

  function activateTab(tabId) {
    tabBtns.forEach(function(b) { b.classList.toggle('active', b.getAttribute('data-tab') === tabId); });
    tabPanels.forEach(function(p) { p.classList.toggle('active', p.id === tabId); });
    if (!rendered[tabId]) {
      rendered[tabId] = true;
      var panel = document.getElementById(tabId);
      if (!panel) return;
      var type = panel.getAttribute('data-type');
      var idx = parseInt(panel.getAttribute('data-index') || '0', 10);
      if (type === 'timeline') {
        var act = activities[idx];
        var cs = new Set(initialCollapsed);
        var fs = { responsibles: [], tools: [] };
        panel.__collapsedSet = cs;
        panel.__filterState = fs;
        buildFilterBar(panel, act, fs, cs);
        renderTimeline(panel, act, cs, fs);
      } else if (type === 'arch') {
        renderArchitecture(panel, activities[idx]);
      } else if (type === 'links') {
        renderLinks(panel);
      }
    }
  }

  tabBtns.forEach(function(btn) {
    btn.addEventListener('click', function() { activateTab(btn.getAttribute('data-tab')); });
  });

  // View toggles (timeline ↔ arch)
  document.querySelectorAll('.view-toggle button').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var target = btn.getAttribute('data-show');
      activateTab(target);
    });
  });

  // Activate initial tab
  var initialTab = tabBtns[0] ? tabBtns[0].getAttribute('data-tab') : null;
  if (initialTab) activateTab(initialTab);
})();
`;

// ── HTML Builder ─────────────────────────────────────────────────────────────
function buildHtml(workflowData, options) {
  const activities = workflowData.activities || [];
  const scope = options.scope || 'current';
  const activeIdx = options.activeActivityIndex || 0;
  const collapsedTools = options.collapsedTools || [];
  const tNotes = options.toolNotes || {};
  const generatedAt = new Date().toISOString();

  const visibleActivities = scope === 'all' ? activities : [activities[activeIdx]];
  const showLinks = scope === 'all' && activities.length > 1;

  // Build data blob
  const exportData = {
    workflowData: { activities: visibleActivities },
    toolNotes: tNotes,
    collapsedTools: collapsedTools,
    scope: scope,
    activeActivityIndex: 0,
  };

  // Build tab bar HTML
  let tabBarHtml = '';
  let panelsHtml = '';

  visibleActivities.forEach((act, i) => {
    const tlId = 'tab-timeline-' + i;
    const archId = 'tab-arch-' + i;

    // Timeline tab
    tabBarHtml += `<button class="tab-btn" data-tab="${tlId}">${esc(act.name)}</button>`;
    panelsHtml += `<div class="tab-panel" id="${tlId}" data-type="timeline" data-index="${i}">
      <div class="filter-bar"></div>
      <div style="position:relative;flex:1;overflow:hidden;display:flex;flex-direction:column;">
        <div class="view-toggle">
          <button class="active-view" data-show="${tlId}">← Timeline</button>
          <button class="inactive-view" data-show="${archId}">⬡ Architecture</button>
        </div>
        <div class="canvas-host" style="flex:1;overflow:auto;"></div>
        <div class="zoom-controls">
          <button class="zoom-out" title="Zoom out">−</button>
          <span class="zoom-label">100%</span>
          <button class="zoom-in" title="Zoom in">+</button>
          <div style="width:1px;height:16px;background:#e2e8f0;margin:0 2px;"></div>
          <button class="zoom-fit" title="Fit to screen">⊡</button>
        </div>
      </div>
    </div>`;

    // Architecture tab (hidden, no tab button — toggled via view-toggle)
    panelsHtml += `<div class="tab-panel" id="${archId}" data-type="arch" data-index="${i}">
      <div style="position:relative;flex:1;overflow:hidden;display:flex;flex-direction:column;">
        <div class="view-toggle">
          <button class="inactive-view" data-show="${tlId}">← Timeline</button>
          <button class="active-view" data-show="${archId}">⬡ Architecture</button>
        </div>
        <div class="canvas-host" style="flex:1;overflow:auto;"></div>
        <div class="zoom-controls">
          <button class="zoom-out" title="Zoom out">−</button>
          <span class="zoom-label">100%</span>
          <button class="zoom-in" title="Zoom in">+</button>
          <div style="width:1px;height:16px;background:#e2e8f0;margin:0 2px;"></div>
          <button class="zoom-fit" title="Fit to screen">⊡</button>
        </div>
      </div>
    </div>`;
  });

  // Activity Links tab
  if (showLinks) {
    tabBarHtml += `<div class="tab-sep"></div>`;
    tabBarHtml += `<button class="tab-btn" data-tab="tab-links">Activity links</button>`;
    panelsHtml += `<div class="tab-panel" id="tab-links" data-type="links">
      <div style="position:relative;flex:1;overflow:hidden;display:flex;flex-direction:column;">
        <div class="canvas-host" style="flex:1;overflow:auto;"></div>
        <div class="zoom-controls">
          <button class="zoom-out" title="Zoom out">−</button>
          <span class="zoom-label">100%</span>
          <button class="zoom-in" title="Zoom in">+</button>
          <div style="width:1px;height:16px;background:#e2e8f0;margin:0 2px;"></div>
          <button class="zoom-fit" title="Fit to screen">⊡</button>
        </div>
      </div>
    </div>`;
  }

  const title = scope === 'all'
    ? 'Workflow — All Activities (read-only)'
    : `${esc(visibleActivities[0]?.name || 'Workflow')} — Workflow (read-only)`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>${STATIC_CSS}</style>
</head>
<body>
<div id="app">
  <div class="topbar">
    <span class="badge">READ-ONLY</span>
    <span>${scope === 'all' ? 'All Activities' : esc(visibleActivities[0]?.name || 'Workflow')}</span>
    <span style="margin-left:auto;color:#94a3b8;font-size:11px;">Exported ${esc(generatedAt.slice(0, 10))} · this file runs entirely in your browser, nothing is uploaded or stored remotely</span>
  </div>
  ${visibleActivities.length > 1 || showLinks ? `<div class="tab-bar">${tabBarHtml}</div>` : `<div class="tab-bar" style="display:none">${tabBarHtml}</div>`}
  ${panelsHtml}
  <div id="tooltip" class="d3-tooltip"></div>
</div>
<script>window.__EXPORT_DATA__ = ${JSON.stringify(exportData)};</script>
<script>${VIEWER_JS}</script>
</body>
</html>`;
}

export function buildStaticHtml(workflowData, options) {
  return buildHtml(workflowData, options || {});
}

export function downloadStaticHtml(workflowData, options) {
  const opts = options || {};
  const html = buildHtml(workflowData, opts);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const scope = opts.scope || 'current';
  const activities = workflowData.activities || [];
  const name = scope === 'all'
    ? 'workflow-all'
    : (activities[opts.activeActivityIndex || 0]?.name || 'workflow').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  a.download = `${name}-readonly.html`;
  a.click();
  URL.revokeObjectURL(url);
}