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
  .filter-bar { background: #ffffff; border-bottom: 1px solid #e2e8f0; flex-shrink: 0; }
  .filter-label { font-size: 9px; font-weight: 700; letter-spacing: .08em; color: #94a3b8; margin-right: 4px; }
  .filter-divider { width: 1px; height: 20px; background: #e2e8f0; margin: 0 4px; }
  .chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; font-size: 11px; font-weight: 600; border-radius: 14px; border: 1.5px solid #cbd5e1; cursor: pointer; background: #fff; color: #475569; transition: all .15s; user-select: none; }
  .chip:hover { background: #f1f5f9; }
  .chip.chip-active { color: #fff; }
  .chip-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .chip-tool { border-color: #93c5fd; color: #1d4ed8; }
  .chip-tool.chip-active { background: #2563eb; color: #fff; border-color: #2563eb; }
  .chip-clear { border-color: #fca5a5; color: #dc2626; }
  .chip-chapter { border-color: #a78bfa; color: #7c3aed; }
  .chip-chapter.chip-active { background: #7c3aed; color: #fff; border-color: #6d28d9; }

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

  /* Feedback Drawer */
  .feedback-drawer { position: fixed; top: 0; right: -360px; width: 340px; height: 100vh; background: #ffffff; box-shadow: -4px 0 24px rgba(0,0,0,0.15); z-index: 2000; display: flex; flex-direction: column; transition: right 0.25s cubic-bezier(0.16, 1, 0.3, 1); border-left: 1px solid #e2e8f0; }
  .feedback-drawer.open { right: 0; }
  .feedback-header { padding: 16px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; font-weight: 700; font-size: 14px; color: #1e293b; }
  .feedback-close { background: none; border: none; font-size: 18px; cursor: pointer; color: #64748b; padding: 4px; }
  .feedback-body { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 16px; }
  .feedback-form { display: flex; flex-direction: column; gap: 10px; background: #f1f5f9; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; }
  .feedback-form label { font-size: 11px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; }
  .feedback-form input, .feedback-form textarea, .feedback-form select { width: 100%; padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12px; font-family: inherit; background: #fff; box-sizing: border-box; }
  .feedback-form textarea { resize: vertical; min-height: 60px; }
  .feedback-btn-primary { padding: 8px 14px; background: #2563eb; color: #fff; font-size: 12px; font-weight: 600; border: none; border-radius: 6px; cursor: pointer; transition: background .15s; }
  .feedback-btn-primary:hover { background: #1d4ed8; }
  .feedback-list { display: flex; flex-direction: column; gap: 10px; }
  .feedback-item { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; font-size: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); position: relative; }
  .feedback-item-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; font-size: 11px; color: #64748b; }
  .feedback-badge { display: inline-block; padding: 2px 6px; border-radius: 4px; background: #eff6ff; color: #1e40af; font-weight: 600; font-size: 10px; margin-bottom: 6px; border: 1px solid #bfdbfe; word-break: break-all; }
  .feedback-item-text { color: #1e293b; line-height: 1.4; white-space: pre-wrap; }
  .feedback-del { background: none; border: none; color: #ef4444; cursor: pointer; font-size: 13px; font-weight: 700; padding: 0 4px; }
  .feedback-footer { padding: 12px 16px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; gap: 8px; }
  .feedback-btn-sec { flex: 1; padding: 8px 10px; background: #fff; border: 1px solid #cbd5e1; color: #334155; font-size: 11px; font-weight: 600; border-radius: 6px; cursor: pointer; text-align: center; transition: all .15s; }
  .feedback-btn-sec:hover { background: #f1f5f9; border-color: #94a3b8; }
  .feedback-topbtn { padding: 6px 12px; background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all .15s; }
  .feedback-topbtn:hover { background: #dbeafe; }
  .feedback-count-badge { background: #2563eb; color: #fff; padding: 1px 6px; border-radius: 10px; font-size: 10px; font-weight: 700; }

  .link-line { transition: stroke-opacity .15s; }

  /* Font size & compact controls */
  .font-controls { display: flex; align-items: center; gap: 6px; background: #f1f5f9; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 3px 10px; margin-left: 8px; }
  .fc-label { font-size: 13px; font-weight: 700; color: #64748b; flex-shrink: 0; }
  .fc-value { font-size: 10px; color: #64748b; min-width: 28px; text-align: center; font-variant-numeric: tabular-nums; }
  .font-controls input[type=range] { -webkit-appearance: none; appearance: none; width: 80px; height: 4px; background: #cbd5e1; border-radius: 2px; outline: none; cursor: pointer; }
  .font-controls input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 14px; height: 14px; border-radius: 50%; background: #2563eb; cursor: pointer; border: 2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.2); }
  .fc-reset { background: none; border: none; cursor: pointer; font-size: 14px; color: #94a3b8; padding: 0 2px; transition: color .15s; }
  .fc-reset:hover { color: #2563eb; }
  .compact-toggle { display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; color: #64748b; cursor: pointer; margin-left: 8px; background: #f1f5f9; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 4px 10px; user-select: none; transition: all .15s; }
  .compact-toggle:hover { border-color: #94a3b8; }
  .compact-toggle input { accent-color: #2563eb; cursor: pointer; margin: 0; }
  .compact-toggle.active { background: #eff6ff; border-color: #2563eb; color: #1e40af; }

  /* Associated Tasks Bar */
  .assoc-toggle-btn { display: flex; align-items: center; gap: 6px; background: none; border: none; cursor: pointer; color: #0369a1; font-size: 13px; font-weight: 600; padding: 0; user-select: none; }
  .assoc-toggle-btn:hover { color: #0c4a6e; }
  .assoc-chevron { display: inline-block; transition: transform 0.2s ease; font-style: normal; line-height: 1; font-size: 11px; }
  .assoc-chevron.open { transform: rotate(90deg); }
  .assoc-panel { overflow: hidden; transition: max-height 0.25s ease, opacity 0.25s ease; max-height: 0; opacity: 0; }
  .assoc-panel.open { max-height: 200px; opacity: 1; overflow-y: auto; }

  /* Quick tips banner */
  .tips-banner { display: flex; align-items: center; gap: 12px; padding: 7px 16px; background: #fffbeb; border-bottom: 1px solid #fde68a; font-size: 11px; color: #78350f; flex-shrink: 0; flex-wrap: wrap; }
  .tips-banner .tip-item { display: flex; align-items: center; gap: 6px; }
  .tips-banner .tip-sep { width: 1px; height: 16px; background: #fcd34d; }
  .tips-banner-close { margin-left: auto; background: none; border: none; cursor: pointer; color: #92400e; font-size: 14px; padding: 2px 4px; border-radius: 4px; flex-shrink: 0; }
  .tips-banner-close:hover { background: #fef3c7; }
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
  var options = { edgeSides: D.edgeSides || {}, toolPositions: D.toolPositions || {} };
  var sequences = D.workflowData.sequences || [];
  var hiddenTasks = D.workflowData.hiddenTasks || [];
  // Shared state for sequence view — set up in BOOTSTRAP but referenced from timeline interaction handlers
  var isSequenceView = false;
  var enterSequenceView = function() {}; // will be replaced in BOOTSTRAP
  var activeVariant = 'option_1';

  function getSequenceActivity(idx) {
    var seq = sequences[idx];
    if (!seq) return null;
    var allTasks = [];
    activities.forEach(function(act) { allTasks = allTasks.concat(act.tasks || []); });
    allTasks = allTasks.concat(hiddenTasks);
    
    var seqTasks = [];
    var parentTasks = [];
    allTasks.forEach(function(t) {
      var sList = Array.isArray(t.sequences) ? t.sequences : (t.sequences ? String(t.sequences).split(',') : []);
      sList = sList.map(function(s){return s.trim();}).filter(Boolean);
      if (sList.indexOf(seq.name) >= 0 || sList.indexOf(seq.id) >= 0) {
        if (t.isSequenceParent || t.isParent) {
          var actName = 'Hidden Tasks';
          activities.forEach(function(a) {
             if ((a.tasks || []).find(function(x) { return x.id === t.id; })) actName = a.name;
          });
          var pt = JSON.parse(JSON.stringify(t));
          pt.activityName = actName;
          parentTasks.push(pt);
        } else {
          seqTasks.push(JSON.parse(JSON.stringify(t)));
        }
      }
    });
    
    var toolsSet = {}, respsSet = {}, docsSet = {};
    seqTasks.concat(parentTasks).forEach(function(t) {
      if (t.tool) toolsSet[t.tool] = true;
      if (t.responsible) respsSet[t.responsible] = true;
      (t.inputs || []).forEach(function(d) { docsSet[d] = true; });
      (t.outputs || []).forEach(function(d) { docsSet[d] = true; });
    });
    
    var globalDocs = [];
    activities.forEach(function(act) {
      (act.documents || []).forEach(function(d) {
        if (docsSet[d.id] && !globalDocs.find(function(gd) { return gd.id === d.id; })) {
          globalDocs.push(d);
        }
      });
    });
    
    return {
      id: 'seq_' + seq.id,
      name: 'Sequence: ' + seq.name,
      tasks: seqTasks,
      parentTasks: parentTasks,
      tools: Object.keys(toolsSet),
      responsibles: activities[0] ? activities[0].responsibles.filter(function(r) { return respsSet[r.key]; }) : [],
      documents: globalDocs
    };
  }

  // ── Constants (mirror the app) ──
  var MARGIN = { top: 110, right: 180, bottom: 60, left: 200 };
  var TOOL_HEIGHT = 160, COLLAPSED_HEIGHT = 34, TASK_GAP = 18, LANE_GAP = 12;
  var DOC_LEFT_X = 20, DOC_RIGHT_OFFSET = 30, ELBOW_STUB = 28;
  var FONT_SIZE = 11, LINE_HEIGHT = 14, PAD_X = 8, PAD_Y = 8, TASK_RADIUS = 6;
  var DOC_WIDTH = 130, DOC_MIN_HEIGHT = 48, DOC_RADIUS = 6;
  var ARCH_BOX_W = 180, ARCH_BOX_H = 90, ARCH_COL_GAP = 100, ARCH_ROW_GAP = 80, ARCH_MAX_COLS = 4;

  // ── Display preference defaults ──
  var DEFAULT_FONT_SIZE = 11, DEFAULT_LINE_HEIGHT = 14;
  var DEFAULT_PAD_X = 8, DEFAULT_PAD_Y = 8, DEFAULT_TASK_GAP = 18, DEFAULT_LANE_GAP = 12;
  var COMPACT_PAD_X = 4, COMPACT_PAD_Y = 4, COMPACT_TASK_GAP = 8, COMPACT_LANE_GAP = 6;
  var isCompact = false;
  var stretchFactor = 1.0;

  // Load saved stretch factor
  try {
    var savedStretch = parseFloat(localStorage.getItem('viewer_stretch_factor'));
    if (savedStretch && savedStretch >= 0.5 && savedStretch <= 4.0) stretchFactor = savedStretch;
  } catch(e) {}

  // Load saved display preferences
  try {
    var savedPrefs = JSON.parse(localStorage.getItem('viewer_display_prefs') || 'null');
    if (savedPrefs) {
      if (savedPrefs.fontSize >= 8 && savedPrefs.fontSize <= 24) {
        FONT_SIZE = savedPrefs.fontSize;
        LINE_HEIGHT = Math.ceil(FONT_SIZE * 1.27);
      }
      if (savedPrefs.compact) {
        isCompact = true;
        PAD_X = COMPACT_PAD_X; PAD_Y = COMPACT_PAD_Y;
        TASK_GAP = COMPACT_TASK_GAP; LANE_GAP = COMPACT_LANE_GAP;
      }
    }
  } catch(e) {}

  function saveDisplayPrefs() {
    try {
      localStorage.setItem('viewer_display_prefs', JSON.stringify({ fontSize: FONT_SIZE, compact: isCompact }));
      localStorage.setItem('viewer_stretch_factor', String(stretchFactor));
    } catch(e) {}
  }

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

  var currTimeScale = 1;
  var currTimeOffset = 0; // pixel offset to subtract from all task X coords when chapter/filter is active
  function getTaskW(task) { return Math.max(40, (task.duration || 0) * currTimeScale); }

  function getTaskHeight(taskName, taskWidth) {
    var textAreaWidth = Math.max(20, taskWidth - PAD_X * 2);
    var lines = wrapText(taskName, textAreaWidth, FONT_SIZE);
    return PAD_Y + lines.length * LINE_HEIGHT + PAD_Y;
  }

  function getToolHeight(tool, tasks, collapsedSet) {
    if (collapsedSet.has(tool)) return COLLAPSED_HEIGHT;
    var toolTasks = tasks.filter(function(t) { return t.tool === tool; });
    if (toolTasks.length === 0) return TOOL_HEIGHT;
    var maxTaskH = Math.max.apply(null, toolTasks.map(function(t) { return getTaskHeight(t.name, getTaskW(t)); }));
    var count = toolTasks.length;
    var needed = 50 + count * (maxTaskH + TASK_GAP) + 10;
    return Math.max(TOOL_HEIGHT, needed);
  }

  function getTaskY(task, tasks, tools, collapsedSet) {
    var toolIndex = tools.indexOf(task.tool);
    if (toolIndex === -1 || collapsedSet.has(task.tool)) return -9999;
    var toolTasks = tasks.filter(function(t) { return t.tool === task.tool; });
    toolTasks.sort(function(a, b) {
      if (a.startTime !== b.startTime) return a.startTime - b.startTime;
      return a.id.localeCompare(b.id);
    });
    var slotIndex = toolTasks.indexOf(task);
    var baseY = 50;
    for (var i = 0; i < toolIndex; i++) baseY += getToolHeight(tools[i], tasks, collapsedSet) + LANE_GAP;
    var maxTaskH = Math.max.apply(null, toolTasks.map(function(t) { return getTaskHeight(t.name, getTaskW(t)); }).concat([getTaskHeight(task.name, getTaskW(task))]));
    var offset = slotIndex * (maxTaskH + TASK_GAP);
    return baseY + offset;
  }

  function getTaskX(task) { return (task.startTime || 0) * currTimeScale - currTimeOffset; }

  function curvedPath(x1, y1, x2, y2) { var m = (x1 + x2) / 2; return 'M ' + x1 + ' ' + y1 + ' C ' + m + ' ' + y1 + ', ' + m + ' ' + y2 + ', ' + x2 + ' ' + y2; }
  function elbowPath(x1, y1, x2, y2, isInput) {
    return isInput
      ? 'M ' + x1 + ' ' + y1 + ' H ' + (x1 + ELBOW_STUB) + ' V ' + y2 + ' H ' + x2
      : 'M ' + x1 + ' ' + y1 + ' H ' + (x2 - ELBOW_STUB) + ' V ' + y2 + ' H ' + x2;
  }

  // ── Doc default positions ──
  function buildDocPositions(documents, tasks, tools, collapsedSet, canvasWidth, canvasHeight, docHeights) {
    var positions = {};
    documents.forEach(function(doc) {
      var isInput = doc.type === 'input';
      var connected = tasks.filter(function(t) { return isInput ? (t.inputs || []).indexOf(doc.id) >= 0 : (t.outputs || []).indexOf(doc.id) >= 0; });
      var x = isInput ? -MARGIN.left + DOC_LEFT_X : canvasWidth + DOC_RIGHT_OFFSET;
      var y;
      if (connected.length > 0) {
        var ys = connected.map(function(t) { return getTaskY(t, tasks, tools, collapsedSet) + getTaskHeight(t.name, getTaskW(t)) / 2; });
        y = ys.reduce(function(a, b) { return a + b; }, 0) / ys.length;
      } else {
        y = canvasHeight / 2;
      }
      positions[doc.id] = { x: x, y: y };
    });

    // Enforce non-overlapping document positions
    ['input', 'output'].forEach(function(type) {
      var typeDocs = documents.filter(function(d) { return d.type === type && positions[d.id]; });
      typeDocs.sort(function(a, b) {
        var diff = positions[a.id].y - positions[b.id].y;
        return diff !== 0 ? diff : a.id.localeCompare(b.id);
      });
      for (var i = 1; i < typeDocs.length; i++) {
        var prevDoc = typeDocs[i - 1];
        var currDoc = typeDocs[i];
        var minSpacing = ((docHeights && docHeights[prevDoc.id]) || DOC_MIN_HEIGHT) + 16;
        if (positions[currDoc.id].y < positions[prevDoc.id].y + minSpacing) {
          positions[currDoc.id].y = positions[prevDoc.id].y + minSpacing;
        }
      }
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
    var tools = activity.tools, responsibles = activity.responsibles, documents = activity.documents || [];
    var getTaskProps = function(task, variant) {
      if (variant === 'option_1' || !task.overrides || !task.overrides[variant]) return task;
      return Object.assign({}, task, task.overrides[variant]);
    };
    var tasks = (activity.tasks || []).map(function(t) { return getTaskProps(t, activeVariant); });

    var activeResponsibles = [];
    var usedRespKeys = {};
    tasks.forEach(function(t) { usedRespKeys[t.responsible] = true; });
    var seenResp = {};
    activities.forEach(function(act) {
      (act.responsibles || []).forEach(function(r) {
        if (usedRespKeys[r.key] && !seenResp[r.key]) {
          seenResp[r.key] = true;
          activeResponsibles.push(r);
        }
      });
    });
    (activity.responsibles || []).forEach(function(r) {
      if (usedRespKeys[r.key] && !seenResp[r.key]) {
        seenResp[r.key] = true;
        activeResponsibles.push(r);
      }
    });

    var respMap = {};
    activeResponsibles.forEach(function(r) { respMap[r.key] = r; });

    var bannerEl = panelEl.querySelector('.variant-banner');
    var hasOptional = tasks.some(function(t) { return t.optional; });
    if (hasOptional) {
      if (!bannerEl) {
        bannerEl = document.createElement('div');
        bannerEl.className = 'variant-banner';
        bannerEl.style = 'position:absolute; top:16px; left:50%; transform:translateX(-50%); z-index:100; padding:8px 16px; background:#fffbeb; border:1px solid #f59e0b; border-radius:6px; color:#b45309; font-size:13px; font-weight:600; box-shadow:0 4px 12px rgba(245,158,11,0.15); display:flex; align-items:center; gap:8px; pointer-events:none;';
        bannerEl.innerHTML = '<span>⚠️</span> The faded tasks are not mandatory in this variant.';
        panelEl.querySelector('.canvas-host').parentElement.appendChild(bannerEl);
      }
      bannerEl.style.display = 'flex';
    } else if (bannerEl) {
      bannerEl.style.display = 'none';
    }

    // Apply filters
    var visibleTasks = tasks.filter(function(t) {
      var byResp = filterState.responsibles.length === 0 || filterState.responsibles.indexOf(t.responsible) >= 0;
      var byTool = filterState.tools.length === 0 || filterState.tools.indexOf(t.tool) >= 0;
      var activeChapters = filterState.chapters || [];
      var byChapter = activeChapters.length === 0 || (activity.chapters || []).filter(function(c) {
        return activeChapters.indexOf(c.id) >= 0;
      }).some(function(c) {
        return (c.tasks || []).indexOf(t.id) >= 0;
      });
      return byResp && byTool && byChapter;
    });
    var visibleToolSet = new Set(visibleTasks.map(function(t) { return t.tool; }));
    var visibleTools = tools.filter(function(t) { return visibleToolSet.has(t); });
    var visibleDocIds = new Set();
    visibleTasks.forEach(function(t) { (t.inputs || []).forEach(function(id) { visibleDocIds.add(id); }); (t.outputs || []).forEach(function(id) { visibleDocIds.add(id); }); });
    var visibleDocuments = documents.filter(function(d) { return visibleDocIds.has(d.id); });

    var hostEl = panelEl ? panelEl.querySelector('.canvas-host') : null;
    var hostW = (hostEl && hostEl.clientWidth > 100) ? hostEl.clientWidth : (window.innerWidth || 1400);
    var availW = Math.max(800, hostW - MARGIN.left - MARGIN.right);
    var maxEnd = Math.max.apply(null, tasks.map(function(t) { return (t.startTime || 0) + (t.duration || 0); }).concat([100]));
    currTimeScale = Math.max(1.15, (availW * stretchFactor) / maxEnd);

    var canvasWidth = Math.max(maxEnd * currTimeScale, availW);
    // visibleCanvasWidth: width from visible (filtered) tasks only — mirrors editor visibleCanvasWidth
    var visibleMaxEnd = visibleTasks.length > 0
      ? Math.max.apply(null, visibleTasks.map(function(t) { return (t.startTime || 0) + (t.duration || 0); }))
      : maxEnd;
    // visibleMinStart: shift filtered view so the first visible task starts at x=0
    // Only apply offset when filtering is active (visibleTasks is a strict subset of tasks)
    var visibleMinStart = (visibleTasks.length > 0 && visibleTasks.length < tasks.length)
      ? Math.min.apply(null, visibleTasks.map(function(t) { return t.startTime || 0; }))
      : 0;
    currTimeOffset = visibleMinStart * currTimeScale;
    var visibleCanvasWidth = Math.max((visibleMaxEnd - visibleMinStart) * currTimeScale, 200) + 20;
    var canvasHeight = visibleTools.reduce(function(sum, tool) { return sum + getToolHeight(tool, visibleTasks, collapsedSet) + LANE_GAP; }, 0);
    var svgWidth = visibleCanvasWidth + MARGIN.left + MARGIN.right;
    var svgHeight = canvasHeight + MARGIN.top + MARGIN.bottom;

    var docHeights = {};
    visibleDocuments.forEach(function(doc) {
      var lines = wrapDocName(doc.name);
      docHeights[doc.id] = Math.max(DOC_MIN_HEIGHT, lines.length * 12 + 24);
    });
    var docPositions = buildDocPositions(visibleDocuments, visibleTasks, visibleTools, collapsedSet, visibleCanvasWidth, canvasHeight, docHeights);

    // Build SVG string
    var svg = '';
    svg += '<svg xmlns="http://www.w3.org/2000/svg" width="' + svgWidth + '" height="' + svgHeight + '" viewBox="0 0 ' + svgWidth + ' ' + svgHeight + '" style="background:#f8f9fb;display:block;user-select:none;">';
    svg += '<defs>';
    svg += '<marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#64748b"/></marker>';
    svg += '<marker id="arrow-gold" markerWidth="10" markerHeight="10" refX="8" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#FFD700"/></marker>';
    svg += '<marker id="arrow-orange" markerWidth="10" markerHeight="10" refX="8" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#d97706"/></marker>';
    svg += '<marker id="arrow-doc" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto"><polygon points="0 0, 8 3.5, 0 7" fill="#94a3b8"/></marker>';
    svg += '<marker id="arrow-doc-blue" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto"><polygon points="0 0, 8 3.5, 0 7" fill="#2563eb"/></marker>';
    svg += '<marker id="arrow-doc-green" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto"><polygon points="0 0, 8 3.5, 0 7" fill="#059669"/></marker>';
    svg += '</defs>';

    svg += '<g transform="translate(' + MARGIN.left + ',' + MARGIN.top + ')">';

    // Legend
    svg += '<g transform="translate(0,-' + (MARGIN.top - 16) + ')">';
    activeResponsibles.forEach(function(r, i) {
      svg += '<g transform="translate(' + (i * 280) + ',0)">';
      svg += '<rect width="36" height="26" rx="4" fill="' + r.color + '" stroke="' + r.borderColor + '" stroke-width="2"/>';
      svg += '<rect x="6" y="6" width="24" height="14" rx="3" fill="' + r.taskColor + '"/>';
      svg += '<text x="46" y="18" font-size="12px" font-weight="600" fill="#374151">' + escapeHtml(r.name) + '</text>';
      svg += '</g>';
    });
    svg += '</g>';

    svg += '<text x="' + (visibleCanvasWidth / 2) + '" y="-30" text-anchor="middle" font-size="18px" font-weight="700" fill="#1e293b">' + escapeHtml(activity.name) + '</text>';

    // Tool lanes
    var toolY = 0;
    var toolNameFontSize = FONT_SIZE + 1;
    visibleTools.forEach(function(tool) {
      var isCollapsed = collapsedSet.has(tool);
      var h = getToolHeight(tool, visibleTasks, collapsedSet);
      var hasNote = !!(toolNotes[tool] && toolNotes[tool].trim());
      svg += '<g class="tool-lane" data-tool="' + escapeHtml(tool) + '">';
      svg += '<rect x="0" y="' + toolY + '" width="' + visibleCanvasWidth + '" height="' + h + '" rx="6" fill="#ffffff" stroke="#2563eb" stroke-width="2"/>';
      svg += '<text x="12" y="' + (toolY + 24) + '" font-size="' + toolNameFontSize + 'px" font-weight="700" fill="#1d4ed8" style="pointer-events:none">' + escapeHtml(tool) + '</text>';
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
      var fillCol = hasNote ? '#2563eb' : '#eff6ff';
      var textCol = hasNote ? '#ffffff' : '#2563eb';
      svg += '<g class="note-icon" data-tool="' + escapeHtml(tool) + '" style="cursor:pointer" title="Click to view tool notes">';
      svg += '<circle cx="' + (visibleCanvasWidth - 18) + '" cy="' + (toolY + 17) + '" r="10" fill="' + fillCol + '" stroke="#2563eb" stroke-width="1.5"/>';
      svg += '<text x="' + (visibleCanvasWidth - 18) + '" y="' + (toolY + 22) + '" text-anchor="middle" font-size="13px" font-weight="700" fill="' + textCol + '" style="pointer-events:none;user-select:none">✎</text>';
      svg += '</g>';
      if (!isCollapsed) {
        svg += '<line x1="0" y1="' + (toolY + 34) + '" x2="' + visibleCanvasWidth + '" y2="' + (toolY + 34) + '" stroke="#2563eb" stroke-width="1" stroke-opacity="0.15"/>';
        // Background watermark label at bottom-right
        var bgFontSize = Math.max(18, FONT_SIZE * 2.2);
        svg += '<text x="' + (visibleCanvasWidth - 14) + '" y="' + (toolY + h - 10) + '" text-anchor="end" font-size="' + bgFontSize + 'px" font-weight="800" fill="#2563eb" fill-opacity="0.15" style="pointer-events:none;user-select:none">' + escapeHtml(tool) + '</text>';
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
        var tH = getTaskHeight(ct.name, getTaskW(ct));
        var x1 = isInput ? pos.x + DOC_WIDTH : pos.x;
        var x2 = isInput ? getTaskX(ct) : getTaskX(ct) + getTaskW(ct);
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
        var y1 = getTaskY(depTask, visibleTasks, visibleTools, collapsedSet) + getTaskHeight(depTask.name, getTaskW(depTask)) / 2;
        var y2 = getTaskY(task, visibleTasks, visibleTools, collapsedSet) + getTaskHeight(task.name, getTaskW(task)) / 2;
        if (y1 < -1000 || y2 < -1000) return;
        var x1 = getTaskX(depTask) + getTaskW(depTask);
        var x2 = getTaskX(task);
        svg += '<g class="dep-arrow" data-from="' + escapeHtml(dId) + '" data-to="' + escapeHtml(task.id) + '" data-source-tool="' + escapeHtml(depTask.tool || '') + '" data-target-tool="' + escapeHtml(task.tool || '') + '" style="cursor:pointer;">';
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
      var w = getTaskW(task);
      var h = getTaskHeight(task.name, w);
      var lines = wrapText(task.name, Math.max(20, w - PAD_X * 2), FONT_SIZE);
      var cx = getTaskX(task) + w / 2;
      var firstBaselineY = taskYVal + PAD_Y + LINE_HEIGHT - 2;

      svg += '<g class="task-node' + (task.optional ? ' dimmed' : '') + '" data-id="' + escapeHtml(task.id) + '" data-task-id="' + escapeHtml(task.id) + '" data-tool="' + escapeHtml(task.tool || '') + '" style="cursor:pointer;">';
      svg += '<rect x="' + getTaskX(task) + '" y="' + taskYVal + '" width="' + w + '" height="' + h + '" rx="' + TASK_RADIUS + '" fill="' + fill + '" stroke="rgba(0,0,0,0.25)" stroke-width="1.5" class="task-rect"/>';
      lines.forEach(function(line, i) {
        svg += '<text x="' + cx + '" y="' + (firstBaselineY + i * LINE_HEIGHT) + '" text-anchor="middle" font-size="' + FONT_SIZE + 'px" font-weight="bold" fill="white" pointer-events="none">' + escapeHtml(line) + '</text>';
      });
      
      var taskSeqs = Array.isArray(task.sequences) ? task.sequences : (task.sequences ? String(task.sequences).split(',') : []);
      taskSeqs = taskSeqs.map(function(s) { return s.trim(); }).filter(Boolean);
      if (taskSeqs.length > 0 && (task.isSequenceParent || task.isParent)) {
        var seqIconX = getTaskX(task) + w - 24;
        var seqIconY = taskYVal + h - 24;
        svg += '<g class="seq-nav-icon" data-seq-name="' + escapeHtml(taskSeqs[0]) + '" transform="translate(' + seqIconX + ', ' + seqIconY + ')" style="cursor:pointer;pointer-events:all;" title="Open Sequence View">';
        svg += '<rect x="-4" y="-4" width="24" height="24" fill="transparent" />';
        svg += '<path d="M6,1 L1,3.5 L6,6 L11,3.5 Z M1,6 L6,8.5 L11,6 M1,8.5 L6,11 L11,8.5" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="1.2" stroke-linejoin="round" pointer-events="none" />';
        svg += '</g>';
      }

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
      // DocIcon — mirrors DocumentNode.jsx lines 9-22
      var iconX = pos.x + 8;
      var iconY = y + (dH - 16) / 2 - 6;
      svg += '<path d="M' + iconX + ',' + (iconY+4) + ' L' + iconX + ',' + (iconY+16) + ' L' + (iconX+12) + ',' + (iconY+16) + ' L' + (iconX+12) + ',' + (iconY+8) + ' L' + (iconX+8) + ',' + (iconY+4) + ' Z" fill="white" fill-opacity="0.85" stroke="rgba(255,255,255,0.6)" stroke-width="1"/>';
      svg += '<path d="M' + (iconX+8) + ',' + (iconY+4) + ' L' + (iconX+8) + ',' + (iconY+8) + ' L' + (iconX+12) + ',' + (iconY+8) + '" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="1"/>';
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
    function doFit() {
      var hostRect = hostEl.getBoundingClientRect();
      var svgW = parseInt(svgEl.getAttribute('width'), 10);
      var svgH = parseInt(svgEl.getAttribute('height'), 10);
      if (!svgW || !svgH) return;
      zoom = Math.max(MIN_Z, Math.min(hostRect.width / svgW, hostRect.height / svgH, 1));
      applyZoom(); hostEl.scrollTo(0, 0);
    }
    panelEl.querySelector('.zoom-in').onclick = function() { zoom = Math.min(MAX_Z, zoom + STEP); applyZoom(); };
    panelEl.querySelector('.zoom-out').onclick = function() { zoom = Math.max(MIN_Z, zoom - STEP); applyZoom(); };
    panelEl.querySelector('.zoom-fit').onclick = doFit;
    // Auto-fit on first render — mirrors the editor's useEffect(() => handleFit(), [canvasWidth])
    setTimeout(doFit, 0);
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

    // Sequence navigation (clicking 📚 icon on task node)
    svgEl.querySelectorAll('.seq-nav-icon').forEach(function(el) {
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        var seqName = el.getAttribute('data-seq-name');
        var seqIdx = sequences.findIndex(function(s) { return s.name === seqName || s.id === seqName; });
        if (seqIdx >= 0) {
          if (!isSequenceView) enterSequenceView();
          activateTab('tab-seq-' + seqIdx);
        }
      });
    });

    // Note icon hover & click
    svgEl.querySelectorAll('.note-icon').forEach(function(el) {
      el.addEventListener('mouseenter', function(e) {
        var tool = el.getAttribute('data-tool');
        var note = toolNotes[tool];
        if (!note || !note.trim()) return;
        var html = '<div class="tooltip-header">' + escapeHtml(tool) + '</div>';
        html += '<div class="tooltip-content"><p>' + escapeHtml(note).replace(/\\n/g, '<br>') + '</p></div>';
        showTooltip(html, e.clientX, e.clientY);
      });
      el.addEventListener('mouseleave', function() { hideTooltip(); });
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        hideTooltip();
        var tool = el.getAttribute('data-tool');
        if (typeof showToolNoteModal === 'function') showToolNoteModal(tool);
      });
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
        var taskSeqs = Array.isArray(task.sequences) ? task.sequences : (task.sequences ? String(task.sequences).split(',') : []);
        taskSeqs = taskSeqs.map(function(s) { return s.trim(); }).filter(Boolean);
        if (taskSeqs.length) html += '<p><strong>Sequences:</strong> ' + escapeHtml(taskSeqs.join(', ')) + '</p>';
        if (task.inputs && task.inputs.length) {
          html += '<p><strong>Inputs:</strong> ' + task.inputs.map(function(did) {
            var doc = visibleDocuments.find(function(d) { return d.id === did; }) || { name: did };
            return escapeHtml(doc.name);
          }).join(', ') + '</p>';
        }
        if (task.outputs && task.outputs.length) {
          html += '<p><strong>Outputs:</strong> ' + task.outputs.map(function(did) {
            var doc = visibleDocuments.find(function(d) { return d.id === did; }) || { name: did };
            return escapeHtml(doc.name);
          }).join(', ') + '</p>';
        }
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
          if (!map[key]) map[key] = { formats: new Set(), types: new Set(), statuses: new Set() };
          var fmt = typeof dep === 'object' ? dep.format : '';
          var type = typeof dep === 'object' ? dep.type || 'file' : 'file';
          var status = typeof dep === 'object' ? dep.status || 'impl' : 'impl';
          if (fmt) map[key].formats.add(fmt);
          map[key].types.add(type);
          map[key].statuses.add(status);
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
    var pos = Object.assign({}, layout.pos);
    if (options && options.toolPositions) {
      if (options.toolPositions[activity.id]) {
        Object.assign(pos, options.toolPositions[activity.id]);
      } else if (Object.keys(options.toolPositions).length > 0 && !options.toolPositions[activities[0]?.id]) {
        var firstVal = Object.values(options.toolPositions)[0];
        if (firstVal && typeof firstVal.x === 'number' && typeof firstVal.y === 'number') {
          Object.assign(pos, options.toolPositions);
        }
      }
    }
    try {
      var localSaved = JSON.parse(localStorage.getItem('viewer_arch_pos_' + activity.id) || 'null');
      if (localSaved) Object.assign(pos, localSaved);
    } catch(e) {}
    var savedEdgeSides = {};
    if (options && options.edgeSides && options.edgeSides[activity.id]) {
      Object.assign(savedEdgeSides, options.edgeSides[activity.id]);
    }
    var edges = layout.edges;
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
    svg += '<marker id="arch-arr-orange" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><polygon points="0 0, 6 3, 0 6" fill="#d97706"/></marker>';
    svg += '</defs>';

    // Edges
    var allEdges = [];
    tools.forEach(function(from) {
      (edges[from] || new Set()).forEach(function(to) {
        if (pos[from] && pos[to]) allEdges.push({ from: from, to: to });
      });
    });
    var edgeSides = (options && options.edgeSides && options.edgeSides[activity.id]) ? options.edgeSides[activity.id] : {};
    var getSide = function(e, end) {
      var key = e.from + '→' + e.to;
      if (edgeSides[key] && edgeSides[key][end]) return edgeSides[key][end];
      var pf = pos[e.from], pt = pos[e.to];
      if (!pf || !pt) return end === 'from' ? 'right' : 'left';
      if (end === 'from') return pf.x > pt.x ? 'left' : 'right';
      else return pf.x > pt.x ? 'right' : 'left';
    };

    var edgePorts = {};
    function getSide(e, end) {
      var k = e.from + '→' + e.to;
      if (savedEdgeSides[k] && savedEdgeSides[k][end]) return savedEdgeSides[k][end];
      var pf = pos[e.from], pt = pos[e.to];
      if (!pf || !pt) return end === 'from' ? 'right' : 'left';
      return end === 'from' ? (pf.x > pt.x ? 'left' : 'right') : (pf.x > pt.x ? 'right' : 'left');
    }

    tools.forEach(function(tool) {
      var p = pos[tool];
      if (!p) return;
      var sides = { left: { in: [], out: [] }, right: { in: [], out: [] }, top: { in: [], out: [] }, bottom: { in: [], out: [] } };
      allEdges.forEach(function(e) {
        if (e.from === tool) {
          var s = getSide(e, 'from');
          if (sides[s]) sides[s].out.push(e);
        }
        if (e.to === tool) {
          var s = getSide(e, 'to');
          if (sides[s]) sides[s].in.push(e);
        }
      });
      ['left', 'right', 'top', 'bottom'].forEach(function(sName) {
        var inList = sides[sName].in;
        inList.sort(function(a, b) {
          var ta = pos[a.from], tb = pos[b.from];
          return (ta ? ta.y : 0) - (tb ? tb.y : 0) || (ta ? ta.x : 0) - (tb ? tb.x : 0);
        });
        inList.forEach(function(e, idx) {
          var key = e.from + '→' + e.to;
          if (!edgePorts[key]) edgePorts[key] = {};
          edgePorts[key].toSide = sName;
          if (sName === 'left' || sName === 'right') {
            edgePorts[key].lx2 = sName === 'left' ? p.x : p.x + ARCH_BOX_W;
            edgePorts[key].ly2 = inList.length === 1 ? p.y + 27 : p.y + 14 + idx * (26 / (inList.length - 1));
          } else {
            edgePorts[key].ly2 = sName === 'top' ? p.y : p.y + ARCH_BOX_H;
            edgePorts[key].lx2 = inList.length === 1 ? p.x + ARCH_BOX_W / 2 : p.x + 24 + idx * ((ARCH_BOX_W - 48) / (inList.length - 1));
          }
        });
        var outList = sides[sName].out;
        outList.sort(function(a, b) {
          var tb = pos[b.to], ta = pos[a.to];
          return (ta ? ta.y : 0) - (tb ? tb.y : 0) || (ta ? ta.x : 0) - (tb ? tb.x : 0);
        });
        outList.forEach(function(e, idx) {
          var key = e.from + '→' + e.to;
          if (!edgePorts[key]) edgePorts[key] = {};
          edgePorts[key].fromSide = sName;
          if (sName === 'left' || sName === 'right') {
            edgePorts[key].lx1 = sName === 'left' ? p.x : p.x + ARCH_BOX_W;
            edgePorts[key].ly1 = outList.length === 1 ? p.y + 63 : p.y + 50 + idx * (26 / (outList.length - 1));
          } else {
            edgePorts[key].ly1 = sName === 'top' ? p.y : p.y + ARCH_BOX_H;
            edgePorts[key].lx1 = outList.length === 1 ? p.x + ARCH_BOX_W / 2 : p.x + 24 + idx * ((ARCH_BOX_W - 48) / (outList.length - 1));
          }
        });
      });
    });

    tools.forEach(function(from) {
      (edges[from] || new Set()).forEach(function(to) {
        var f = pos[from], t = pos[to];
        if (!f || !t) return;
        var isBidi = edges[to] && edges[to].has(from);
        if (isBidi && from > to) return;

        var key = from + '→' + to;
        var revKey = to + '→' + from;
        var edgeConfig = savedEdgeSides[key] || {};

        var edgeData = edgeFormats[key];
        var fmts = edgeData && edgeData.formats ? Array.from(edgeData.formats).join(', ') : '';
        var revEdgeData = isBidi ? edgeFormats[revKey] : null;
        var revFmts = revEdgeData && revEdgeData.formats ? Array.from(revEdgeData.formats).join(', ') : '';

        var isPlanned = edgeData && edgeData.statuses ? edgeData.statuses.has('plan') : false;
        var isPlugin = edgeData && edgeData.types ? edgeData.types.has('plugin') : false;
        var strokeColor = isPlanned ? '#d97706' : '#64748b';
        var markerId = isPlanned ? 'arch-arr-orange' : 'arch-arr-gray';
        var dashAttr = isPlanned ? ' stroke-dasharray="6,4"' : '';

        var labelTxt = fmts;
        if (!labelTxt && isPlugin) labelTxt = 'Plug-in';
        var badgeW = labelTxt ? labelTxt.length * 6.5 + 12 : 0;
        var revBadgeW = revFmts ? revFmts.length * 6.5 + 12 : 0;

        var badgeFill = isPlugin ? '#faf5ff' : isPlanned ? '#fffbeb' : '#f1f5f9';
        var badgeStroke = isPlugin ? '#9333ea' : isPlanned ? '#d97706' : '#64748b';
        var badgeTextFill = isPlugin ? '#6b21a8' : isPlanned ? '#b45309' : '#475569';

        var port = edgePorts[key] || {};
        var lx1 = port.lx1 !== undefined ? port.lx1 : f.x + ARCH_BOX_W;
        var ly1 = port.ly1 !== undefined ? port.ly1 : f.y + 63;
        var lx2 = port.lx2 !== undefined ? port.lx2 : t.x;
        var ly2 = port.ly2 !== undefined ? port.ly2 : t.y + 27;
        var fromSide = port.fromSide || 'right', toSide = port.toSide || 'left';

        var dist = Math.max(40, Math.min(Math.abs(lx2 - lx1) * 0.45, 140));
        var cx1 = lx1 + (fromSide === 'right' ? dist : fromSide === 'left' ? -dist : 0);
        var cy1 = ly1 + (fromSide === 'bottom' ? dist : fromSide === 'top' ? -dist : 0);
        var cx2 = lx2 + (toSide === 'right' ? dist : toSide === 'left' ? -dist : 0);
        var cy2 = ly2 + (toSide === 'bottom' ? dist : toSide === 'top' ? -dist : 0);

        var style = edgeConfig.style || 'curve';
        var dx = edgeConfig.dx || 0;
        var dy = edgeConfig.dy || 0;

        var pathD = '';
        if (style === 'straight') {
          pathD = 'M ' + lx1 + ' ' + ly1 + ' Q ' + ((lx1 + lx2)/2 + dx) + ' ' + ((ly1 + ly2)/2 + dy) + ' ' + lx2 + ' ' + ly2;
        } else if (style === 'elbow') {
          var midElbowX = (lx1 + lx2) / 2 + dx;
          pathD = 'M ' + lx1 + ' ' + ly1 + ' H ' + midElbowX + ' V ' + (ly2 + dy) + ' H ' + lx2;
        } else {
          pathD = 'M ' + lx1 + ' ' + ly1 + ' C ' + (cx1 + dx) + ' ' + (cy1 + dy) + ', ' + (cx2 + dx) + ' ' + (cy2 + dy) + ', ' + lx2 + ' ' + ly2;
        }

        var tFwd = 0.78;
        var fwdX = Math.pow(1-tFwd, 3)*lx1 + 3*Math.pow(1-tFwd, 2)*tFwd*(cx1+dx) + 3*(1-tFwd)*tFwd*tFwd*(cx2+dx) + tFwd*tFwd*tFwd*lx2;
        var fwdY = Math.pow(1-tFwd, 3)*ly1 + 3*Math.pow(1-tFwd, 2)*tFwd*(cy1+dy) + 3*(1-tFwd)*tFwd*tFwd*(cy2+dy) + tFwd*tFwd*tFwd*ly2;

        var tRev = 0.22;
        var revX = Math.pow(1-tRev, 3)*lx1 + 3*Math.pow(1-tRev, 2)*tRev*(cx1+dx) + 3*(1-tRev)*tRev*tRev*(cx2+dx) + tRev*tRev*tRev*lx2;
        var revY = Math.pow(1-tRev, 3)*ly1 + 3*Math.pow(1-tRev, 2)*tRev*(cy1+dy) + 3*(1-tRev)*tRev*tRev*(cy2+dy) + tRev*tRev*tRev*ly2;

        svg += '<g class="arch-edge" data-from="' + escapeHtml(from) + '" data-to="' + escapeHtml(to) + '">';
        svg += '<path d="' + pathD + '" fill="none" stroke="' + strokeColor + '" stroke-width="1.5"' + dashAttr + ' stroke-opacity="0.55" marker-end="url(#' + markerId + ')"' + (isBidi ? ' marker-start="url(#' + markerId + ')"' : '') + ' style="transition:all 0.2s ease"/>';
        svg += '<circle cx="' + lx1 + '" cy="' + ly1 + '" r="2.5" fill="' + strokeColor + '" stroke="#ffffff" stroke-width="0.5" stroke-opacity="0.55"/>';
        svg += '<circle cx="' + lx2 + '" cy="' + ly2 + '" r="2.5" fill="' + strokeColor + '" stroke="#ffffff" stroke-width="0.5" stroke-opacity="0.55"/>';
        if (labelTxt) {
          svg += '<g transform="translate(' + fwdX + ', ' + fwdY + ')" style="opacity:0.85;transition:opacity 0.2s ease">';
          svg += '<rect x="' + (-badgeW / 2) + '" y="-8" width="' + badgeW + '" height="16" rx="4" fill="' + badgeFill + '" stroke="' + badgeStroke + '" stroke-width="1"/>';
          svg += '<text x="0" y="4" text-anchor="middle" font-size="9px" font-weight="600" fill="' + badgeTextFill + '">' + escapeHtml(labelTxt) + '</text>';
          svg += '</g>';
        }
        if (isBidi && revFmts) {
          svg += '<g transform="translate(' + revX + ', ' + revY + ')" style="opacity:0.85;transition:opacity 0.2s ease">';
          svg += '<rect x="' + (-revBadgeW / 2) + '" y="-8" width="' + revBadgeW + '" height="16" rx="4" fill="' + badgeFill + '" stroke="' + badgeStroke + '" stroke-width="1"/>';
          svg += '<text x="0" y="4" text-anchor="middle" font-size="9px" font-weight="600" fill="' + badgeTextFill + '">' + escapeHtml(revFmts) + '</text>';
          svg += '</g>';
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

      svg += '<g class="arch-box arch-box-g" data-tool="' + escapeHtml(tool) + '" style="cursor:default">';
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
      var fillCol = hasNote ? '#2563eb' : '#eff6ff';
      var textCol = hasNote ? '#ffffff' : '#2563eb';
      svg += '<g class="arch-note-icon" data-tool="' + escapeHtml(tool) + '" style="cursor:pointer" title="Click to view tool notes">';
      svg += '<circle cx="' + (p.x + ARCH_BOX_W - 14) + '" cy="' + (p.y + 68) + '" r="9" fill="' + fillCol + '" stroke="#2563eb" stroke-width="1.5"/>';
      svg += '<text x="' + (p.x + ARCH_BOX_W - 14) + '" y="' + (p.y + 72) + '" text-anchor="middle" font-size="11px" font-weight="700" fill="' + textCol + '" style="pointer-events:none;user-select:none">✎</text>';
      svg += '</g>';
      svg += '</g>';
    });

    svg += '</svg>';

    var hostEl = panelEl.querySelector('.canvas-host');
    hostEl.innerHTML = svg;
    attachArchInteraction(hostEl, panelEl, tools, edges, activity, pos);
  }

  function attachArchInteraction(hostEl, panelEl, tools, edges, activity, pos) {
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

    // Note icon hover & click
    svgEl.querySelectorAll('.arch-note-icon').forEach(function(el) {
      el.addEventListener('mouseenter', function(e) {
        var tool = el.getAttribute('data-tool');
        var note = toolNotes[tool];
        if (!note || !note.trim()) return;
        showTooltip('<div class="tooltip-header">' + escapeHtml(tool) + '</div><div class="tooltip-content"><p>' + escapeHtml(note).replace(/\\n/g, '<br>') + '</p></div>', e.clientX, e.clientY);
      });
      el.addEventListener('mouseleave', function() { hideTooltip(); });
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        hideTooltip();
        var tool = el.getAttribute('data-tool');
        if (typeof showToolNoteModal === 'function') showToolNoteModal(tool);
      });
    });

    // Drag tool boxes in viewer
    var dragTool = null, dragStartMouse = {x:0, y:0}, dragStartPos = {x:0, y:0};
    svgEl.querySelectorAll('.arch-box').forEach(function(box) {
      box.style.cursor = 'grab';
      box.addEventListener('mousedown', function(e) {
        if (e.button !== 0 || e.target.closest('.arch-note-icon')) return;
        e.stopPropagation();
        var tool = box.getAttribute('data-tool');
        if (!pos[tool]) return;
        dragTool = tool;
        box.style.cursor = 'grabbing';
        dragStartMouse = { x: e.clientX, y: e.clientY };
        dragStartPos = { x: pos[tool].x, y: pos[tool].y };
      });
    });
    window.addEventListener('mousemove', function(e) {
      if (!dragTool || !pos[dragTool]) return;
      var dx = (e.clientX - dragStartMouse.x) / (zoom || 1);
      var dy = (e.clientY - dragStartMouse.y) / (zoom || 1);
      pos[dragTool].x = Math.max(0, dragStartPos.x + dx);
      pos[dragTool].y = Math.max(0, dragStartPos.y + dy);
      renderArchitecture(panelEl, activity);
    });
    window.addEventListener('mouseup', function() {
      if (dragTool) {
        try {
          localStorage.setItem('viewer_arch_pos_' + activity.id, JSON.stringify(pos));
          if (!options.toolPositions) options.toolPositions = {};
          options.toolPositions[activity.id] = pos;
        } catch(e) {}
        dragTool = null;
      }
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

    // Dynamic smart spacing: stack cards based on actual height + 150px gap
    var positions = {};
    var currentY = 40;
    activities.forEach(function(act) {
      positions[act.id] = { x: 140, y: currentY };
      currentY += (heights[act.id] || 100) + 150;
    });

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

      var sourceAct = (activities || []).find(function(a) { return a.id === link.from; });
      var targetAct = (activities || []).find(function(a) { return a.id === link.to; });
      var sourceTool = sourceAct && sourceAct.tools && sourceAct.tools[0] ? sourceAct.tools[0] : '';
      var targetTool = targetAct && targetAct.tools && targetAct.tools[0] ? targetAct.tools[0] : '';

      svg += '<g class="link-group" data-from="' + escapeHtml(link.from) + '" data-to="' + escapeHtml(link.to) + '" data-source-tool="' + escapeHtml(sourceTool) + '" data-target-tool="' + escapeHtml(targetTool) + '" style="cursor:pointer;">';
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
  // ASSOCIATED TASKS BUILDER
  // ══════════════════════════════════════════════════════════════════════════
  function renderAssocBar(panelEl, activity) {
    var container = panelEl.querySelector('.assoc-container');
    if (!container) return;
    var parentTasks = activity.parentTasks || [];
    if (parentTasks.length === 0) {
      container.innerHTML = '';
      return;
    }
    var assocOpen = panelEl.__assocOpen || false;
    var html = '<div style="background: #e0f2fe; border-bottom: ' + (assocOpen ? '1px solid #bae6fd' : 'none') + '">';
    html += '<div style="padding: 6px 16px; display: flex; align-items: center; gap: 8px; border-bottom: ' + (assocOpen ? '1px solid #bae6fd' : 'none') + '">';
    html += '<button class="assoc-toggle-btn">';
    html += '<i class="assoc-chevron' + (assocOpen ? ' open' : '') + '">▶</i>';
    html += ' Associated to ';
    html += '<span style="background: #7dd3fc; color: #0c4a6e; border-radius: 10px; padding: 1px 7px; font-size: 11px; font-weight: 700; margin-left: 2px;">' + parentTasks.length + '</span>';
    html += '</button></div>';
    
    html += '<div class="assoc-panel' + (assocOpen ? ' open' : '') + '">';
    html += '<div style="padding: 8px 16px 10px; display: flex; gap: 8px; flex-wrap: wrap;">';
    parentTasks.forEach(function(pt) {
      html += '<span style="background: #fff; padding: 4px 12px; border-radius: 16px; border: 1px solid #7dd3fc; font-size: 13px; color: #0c4a6e; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">';
      html += '<strong>' + escapeHtml(pt.name) + '</strong> <span style="opacity: 0.7; font-weight: normal;">(in ' + escapeHtml(pt.activityName) + ')</span>';
      html += '</span>';
    });
    html += '</div></div></div>';
    
    container.innerHTML = html;
    container.querySelector('.assoc-toggle-btn').addEventListener('click', function() {
      panelEl.__assocOpen = !panelEl.__assocOpen;
      renderAssocBar(panelEl, activity);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FILTER BAR BUILDER
  // ══════════════════════════════════════════════════════════════════════════
  function buildFilterBar(panelEl, activity, filterState, collapsedSet) {
    var barEl = panelEl.querySelector('.filter-bar');
    if (!barEl) return;
    var filterOpen = panelEl.__filterOpen || false;
    var activeCount = filterState.responsibles.length + filterState.tools.length + (filterState.chapters || []).length;
    
    var html = '<div style="padding: 6px 16px; display: flex; align-items: center; gap: 8px; border-bottom: ' + (filterOpen ? '1px solid #e2e8f0' : 'none') + '">';
    html += '<button class="assoc-toggle-btn" style="color: #475569;">';
    html += '<i class="assoc-chevron' + (filterOpen ? ' open' : '') + '">▶</i>';
    html += ' Filters ';
    if (activeCount > 0) {
      html += '<span style="background: #2563eb; color: #ffffff; border-radius: 10px; padding: 1px 7px; font-size: 11px; font-weight: 700; margin-left: 2px;">' + activeCount + '</span>';
    }
    html += '</button></div>';
    
    html += '<div class="assoc-panel' + (filterOpen ? ' open' : '') + '">';
    html += '<div style="padding: 8px 16px 10px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">';

    // Chapter chips — only render when chapters exist
    if ((activity.chapters || []).length > 0) {
      html += '<span class="filter-label">CHAPTER</span>';
      (activity.chapters || []).forEach(function(ch) {
        var active = (filterState.chapters || []).indexOf(ch.id) >= 0;
        html += '<button class="chip chip-chapter' + (active ? ' chip-active' : '') + '" data-type="chapters" data-key="' + escapeHtml(ch.id) + '" title="' + escapeHtml(ch.notes || ch.name) + '"><span class="chip-dot" style="background-color:' + (active ? '#7c3aed' : '#a78bfa') + '"></span>' + escapeHtml(ch.name) + '</button>';
      });
      html += '<div class="filter-divider"></div>';
    }
    html += '<span class="filter-label">RESPONSIBLE</span>';
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
    if (activeCount > 0) {
      html += '<div class="filter-divider"></div><button class="chip chip-clear" data-action="clear">✕ Clear filters</button>';
    }
    html += '</div></div>';
    barEl.innerHTML = html;

    // Attach toggle handler
    barEl.querySelector('.assoc-toggle-btn').addEventListener('click', function() {
      panelEl.__filterOpen = !panelEl.__filterOpen;
      buildFilterBar(panelEl, activity, filterState, collapsedSet);
    });

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
        filterState.chapters = [];
        buildFilterBar(panelEl, activity, filterState, collapsedSet);
        renderTimeline(panelEl, activity, collapsedSet, filterState);
      });
    });
  }

  // ── Re-render active panel after display settings change ──
  function reRenderActive() {
    var activePanel = document.querySelector('.tab-panel.active');
    if (!activePanel) return;
    var tabId = activePanel.id;
    var type = activePanel.getAttribute('data-type');
    var idx = parseInt(activePanel.getAttribute('data-index') || '0', 10);
    if (type === 'timeline') {
      var act = activities[idx];
      var cs = activePanel.__collapsedSet || new Set(initialCollapsed);
      var fs = activePanel.__filterState || { responsibles: [], tools: [], chapters: [] };
      buildFilterBar(activePanel, act, fs, cs);
      renderTimeline(activePanel, act, cs, fs);
    } else if (type === 'sequence') {
      var seqAct = getSequenceActivity(idx);
      var cs = activePanel.__collapsedSet || new Set(initialCollapsed);
      var fs = activePanel.__filterState || { responsibles: [], tools: [], chapters: [] };
      buildFilterBar(activePanel, seqAct, fs, cs);
      renderAssocBar(activePanel, seqAct);
      renderTimeline(activePanel, seqAct, cs, fs);
    } else if (type === 'arch') {
      renderArchitecture(activePanel, activities[idx]);
    } else if (type === 'links') {
      renderLinks(activePanel);
    }
    // Invalidate other rendered panels so they re-render with new settings on next visit
    Object.keys(rendered).forEach(function(k) { if (k !== tabId) rendered[k] = false; });
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
        var cs = panel.__collapsedSet || new Set(initialCollapsed);
        var fs = panel.__filterState || { responsibles: [], tools: [], chapters: [] };
        panel.__collapsedSet = cs;
        panel.__filterState = fs;
        buildFilterBar(panel, act, fs, cs);
        renderTimeline(panel, act, cs, fs);
      } else if (type === 'sequence') {
        var seqAct = getSequenceActivity(idx);
        var cs = panel.__collapsedSet || new Set(initialCollapsed);
        var fs = panel.__filterState || { responsibles: [], tools: [], chapters: [] };
        panel.__collapsedSet = cs;
        panel.__filterState = fs;
        buildFilterBar(panel, seqAct, fs, cs);
        renderAssocBar(panel, seqAct);
        renderTimeline(panel, seqAct, cs, fs);
      } else if (type === 'arch') {
        renderArchitecture(panel, activities[idx]);
      } else if (type === 'links') {
        renderLinks(panel);
      }
    }
  }

  tabBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var searchEl = document.getElementById('global-search');
      if (searchEl) {
        searchEl.value = '';
        if (typeof applySearch === 'function') applySearch('');
      }
      activateTab(btn.getAttribute('data-tab'));
    });
  });

  // View toggles (timeline ↔ arch)
  document.querySelectorAll('.view-toggle button').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var target = btn.getAttribute('data-show');
      activateTab(target);
    });
  });

  // Variant toggles
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.variant-btn');
    if (!btn) return;
    var variant = btn.getAttribute('data-variant');
    if (variant === activeVariant) return;
    activeVariant = variant;
    document.querySelectorAll('.variant-btn').forEach(function(b) {
      if (b.getAttribute('data-variant') === variant) {
        b.style.background = '#1e40af';
        b.style.color = '#fff';
      } else {
        b.style.background = '#fff';
        b.style.color = '#475569';
      }
    });
    var activePanel = document.querySelector('.tab-panel.active');
    if (activePanel) {
       var tabId = activePanel.id;
       rendered[tabId] = false;
       activateTab(tabId);
    }
  });

  // ── Floating Buttons (bottom-left) — matches App.js layout exactly ──
  var seqViewBtn = document.getElementById('seq-view-btn');
  var altToolsBtn = document.getElementById('alt-tools-btn');
  var altToolsModal = document.getElementById('alt-tools-modal');
  var altToolsClose = document.getElementById('alt-tools-close');
  var altToolsFooterClose = document.getElementById('alt-tools-footer-close');
  var altToolsBackdrop = document.getElementById('alt-tools-backdrop');
  var altToolsContent = document.getElementById('alt-tools-content');
  var backToStagesBtn = document.getElementById('back-to-stages-btn');

  function enterSequenceViewImpl() {
    isSequenceView = true;
    if (seqViewBtn) {
      seqViewBtn.innerHTML = '<span style="font-size:16px;">📚</span> Exit Sequences';
      seqViewBtn.style.background = '#2563eb';
      seqViewBtn.style.color = '#ffffff';
      seqViewBtn.style.borderColor = '#2563eb';
    }
    document.querySelectorAll('.tab-activity').forEach(function(b) { b.style.display = 'none'; });
    document.querySelectorAll('.tab-sequence').forEach(function(b) { b.style.display = ''; });
    if (backToStagesBtn) backToStagesBtn.style.display = '';
    var firstSeqTab = document.querySelector('.tab-sequence');
    if (firstSeqTab) activateTab(firstSeqTab.getAttribute('data-tab'));
  }
  // Override the stub so seq-nav-icon handlers work
  enterSequenceView = enterSequenceViewImpl;

  function exitSequenceView() {
    isSequenceView = false;
    if (seqViewBtn) {
      seqViewBtn.innerHTML = '<span style="font-size:16px;">📚</span> Sequences View';
      seqViewBtn.style.background = '#ffffff';
      seqViewBtn.style.color = '#1e293b';
      seqViewBtn.style.borderColor = '#cbd5e1';
    }
    document.querySelectorAll('.tab-activity').forEach(function(b) { b.style.display = ''; });
    document.querySelectorAll('.tab-sequence').forEach(function(b) { b.style.display = 'none'; });
    if (backToStagesBtn) backToStagesBtn.style.display = 'none';
    var firstActTab = document.querySelector('.tab-activity');
    if (firstActTab) activateTab(firstActTab.getAttribute('data-tab'));
  }

  if (seqViewBtn) {
    seqViewBtn.addEventListener('click', function() {
      if (isSequenceView) exitSequenceView(); else enterSequenceView();
    });
  }
  if (backToStagesBtn) {
    backToStagesBtn.addEventListener('click', exitSequenceView);
  }

  // Alternative Tools Modal — matches AltToolsModal in App.js (grouped by tool)
  if (altToolsBtn) {
    altToolsBtn.addEventListener('click', function() {
      var allTasksFlat = [];
      activities.forEach(function(act) {
        (act.tasks || []).forEach(function(t) {
          if (t.alternativeTools && t.alternativeTools.length > 0) {
            allTasksFlat.push({ task: t, stageName: act.name });
          }
        });
      });
      (hiddenTasks || []).forEach(function(t) {
        if (t.alternativeTools && t.alternativeTools.length > 0) {
          allTasksFlat.push({ task: t, stageName: 'Hidden Tasks' });
        }
      });

      // Group by tool
      var byTool = {};
      allTasksFlat.forEach(function(item) {
        var tool = item.task.tool || 'Unassigned Tool';
        if (!byTool[tool]) byTool[tool] = [];
        byTool[tool].push(item);
      });
      var toolKeys = Object.keys(byTool).sort();

      var html = '';
      if (toolKeys.length === 0) {
        html = '<p style="font-size:13px;color:#64748b;text-align:center;margin:40px 0;">No alternative tools proposed in any task.</p>';
      } else {
        html = '<div style="display:flex;flex-direction:column;gap:24px;">';
        toolKeys.forEach(function(tool) {
          html += '<div>';
          html += '<h3 style="margin:0 0 12px 0;font-size:15px;color:#0f172a;display:flex;align-items:center;gap:8px;">';
          html += '<span style="padding:4px 8px;background:#eff6ff;color:#1d4ed8;border-radius:6px;font-size:13px;border:1px solid #bfdbfe;">' + escapeHtml(tool) + '</span>';
          html += '</h3>';
          html += '<div style="display:flex;flex-direction:column;gap:8px;">';
          byTool[tool].forEach(function(item) {
            html += '<div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;background:#f8fafc;">';
            html += '<div style="display:flex;justify-content:space-between;margin-bottom:8px;">';
            html += '<strong style="font-size:14px;color:#334155;">' + escapeHtml(item.task.name) + '</strong>';
            html += '<span style="font-size:11px;color:#94a3b8;">' + escapeHtml(item.stageName) + '</span>';
            html += '</div>';
            html += '<div style="font-size:13px;color:#475569;display:flex;align-items:flex-start;gap:8px;">';
            html += '<span style="font-weight:600;color:#059669;flex-shrink:0;">Alternatives:</span>';
            html += '<span style="line-height:1.4;">' + escapeHtml(item.task.alternativeTools.join(', ')) + '</span>';
            html += '</div></div>';
          });
          html += '</div></div>';
        });
        html += '</div>';
      }
      altToolsContent.innerHTML = html;
      altToolsModal.style.display = 'flex';
      altToolsBackdrop.style.display = 'block';
    });
    var closeAltModal = function() {
      altToolsModal.style.display = 'none';
      altToolsBackdrop.style.display = 'none';
    };
    if (altToolsClose) altToolsClose.addEventListener('click', closeAltModal);
    if (altToolsFooterClose) altToolsFooterClose.addEventListener('click', closeAltModal);
    if (altToolsBackdrop) altToolsBackdrop.addEventListener('click', closeAltModal);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FEEDBACK ENGINE
  // ══════════════════════════════════════════════════════════════════════════
  var fbStorageKey = 'viewer_fb_' + (activities[0] ? activities[0].id : 'all');
  var fbState = { author: '', comments: [] };
  try {
    var savedFb = JSON.parse(localStorage.getItem(fbStorageKey) || 'null');
    if (savedFb && Array.isArray(savedFb.comments)) fbState = savedFb;
  } catch(e) {}

  var currentTarget = { type: 'general', key: 'General Workflow', activityId: null, activityName: null };
  var drawerEl = document.getElementById('feedback-drawer');
  var toggleBtn = document.getElementById('feedback-toggle-btn');
  var closeBtn = document.getElementById('feedback-close-btn');
  var countEl = document.getElementById('feedback-count');
  var authorInput = document.getElementById('fb-author');
  var targetBadge = document.getElementById('fb-target-badge');
  var clearTargetBtn = document.getElementById('fb-clear-target');
  var textInput = document.getElementById('fb-text');
  var refNoteContainer = document.getElementById('fb-ref-note-container');
  var refNoteInput = document.getElementById('fb-ref-note');
  var submitBtn = document.getElementById('fb-submit-btn');
  var listEl = document.getElementById('fb-list');
  var copyMdBtn = document.getElementById('fb-copy-md');
  var downloadJsonBtn = document.getElementById('fb-download-json');

  if (authorInput) authorInput.value = fbState.author || '';

  function saveFbState() {
    try {
      if (authorInput) fbState.author = authorInput.value.trim();
      localStorage.setItem(fbStorageKey, JSON.stringify(fbState));
    } catch(e) {}
    updateFbCount();
  }

  function updateFbCount() {
    if (!countEl) return;
    var c = fbState.comments.length;
    countEl.textContent = c;
    countEl.style.display = c > 0 ? 'inline-block' : 'none';
  }

  function setFbTarget(type, key, actId, actName, tools) {
    currentTarget = { type: type, key: key, activityId: actId || null, activityName: actName || null, tools: tools || [] };
    if (targetBadge) {
      var label = '';
      if (type === 'general') label = 'General Workflow';
      else if (type === 'tool') label = 'Tool: ' + key + (actName ? ' (' + actName + ')' : '');
      else if (type === 'activity') label = 'Activity: ' + key;
      else if (type === 'task') label = 'Task: ' + key;
      else if (type === 'link') label = 'Link: ' + key;
      else label = key;
      targetBadge.textContent = label;
    }
    if (refNoteContainer) {
      if (type === 'task' || type === 'link') {
        refNoteContainer.style.display = 'block';
        if (refNoteInput) refNoteInput.value = '';
      } else {
        refNoteContainer.style.display = 'none';
        if (refNoteInput) refNoteInput.value = '';
      }
    }
  }

  function renderFbList() {
    if (!listEl) return;
    if (fbState.comments.length === 0) {
      listEl.innerHTML = '<div style="text-align:center;color:#94a3b8;font-size:12px;padding:20px 0;">No comments yet. Click any tool lane, architecture box, or link in the diagram to attach a note!</div>';
      return;
    }
    var html = '';
    fbState.comments.forEach(function(item) {
      var label = '';
      if (item.targetType === 'general') label = 'General Workflow';
      else if (item.targetType === 'tool') label = 'Tool: ' + item.targetKey + (item.activityName ? ' (' + item.activityName + ')' : '');
      else if (item.targetType === 'activity') label = 'Activity: ' + item.targetKey;
      else if (item.targetType === 'link') label = 'Link: ' + item.targetKey;
      else label = item.targetKey || 'General';

      html += '<div class="feedback-item">';
      html += '<div class="feedback-item-header">';
      html += '<span><strong>' + escapeHtml(item.author || 'Anonymous') + '</strong></span>';
      html += '<span>' + new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</span>';
      html += '</div>';
      html += '<span class="feedback-badge">' + escapeHtml(label) + '</span>';
      html += '<div class="feedback-item-text">' + escapeHtml(item.text) + '</div>';
      html += '<div style="text-align:right;margin-top:6px;"><button class="feedback-del" data-id="' + item.id + '" title="Delete comment">Delete</button></div>';
      html += '</div>';
    });
    listEl.innerHTML = html;

    listEl.querySelectorAll('.feedback-del').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.getAttribute('data-id');
        fbState.comments = fbState.comments.filter(function(c) { return c.id !== id; });
        saveFbState();
        renderFbList();
      });
    });
  }

  if (toggleBtn) toggleBtn.addEventListener('click', function() { if (drawerEl) drawerEl.classList.toggle('open'); });
  if (closeBtn) closeBtn.addEventListener('click', function() { if (drawerEl) drawerEl.classList.remove('open'); });
  if (clearTargetBtn) clearTargetBtn.addEventListener('click', function() { setFbTarget('general', 'General Workflow'); });
  if (authorInput) authorInput.addEventListener('input', saveFbState);

  if (submitBtn) {
    submitBtn.addEventListener('click', function() {
      var txt = textInput ? textInput.value.trim() : '';
      if (!txt) { alert('Please enter a comment.'); return; }
      var author = authorInput ? authorInput.value.trim() : '';
      if (!author) { author = 'Anonymous Reviewer'; if (authorInput) authorInput.value = author; }
      var comment = {
        id: 'fb-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
        author: author,
        text: txt,
        targetType: currentTarget.type,
        targetKey: currentTarget.key,
        activityId: currentTarget.activityId,
        activityName: currentTarget.activityName,
        associatedTools: currentTarget.tools || [],
        referenceNote: refNoteInput ? refNoteInput.value.trim() : '',
        timestamp: new Date().toISOString()
      };
      fbState.comments.push(comment);
      if (textInput) textInput.value = '';
      saveFbState();
      renderFbList();
    });
  }

  if (copyMdBtn) {
    copyMdBtn.addEventListener('click', function() {
      if (fbState.comments.length === 0) { alert('No comments to copy!'); return; }
      var lines = ['# Model Review Feedback', 'Author: **' + (fbState.author || 'Anonymous') + '**', 'Exported: ' + new Date().toLocaleString(), ''];
      fbState.comments.forEach(function(c, i) {
        var label = c.targetType === 'tool' ? 'Tool: ' + c.targetKey + (c.activityName ? ' (' + c.activityName + ')' : '') : c.targetKey;
        lines.push('### ' + (i+1) + '. ' + label);
        lines.push('> ' + c.text);
        lines.push('*By ' + (c.author || 'Anonymous') + ' at ' + new Date(c.timestamp).toLocaleTimeString() + '*\\n');
      });
      var md = lines.join('\\n');
      if (navigator.clipboard) {
        navigator.clipboard.writeText(md).then(function() { alert('Feedback markdown copied to clipboard!'); });
      } else {
        alert(md);
      }
    });
  }

  if (downloadJsonBtn) {
    downloadJsonBtn.addEventListener('click', function() {
      if (fbState.comments.length === 0) { alert('No comments to export!'); return; }
      var payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        author: fbState.author || 'Anonymous',
        scope: scope,
        comments: fbState.comments
      };
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'model-feedback-' + (fbState.author || 'reviewer').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // Event delegation to select targets when clicking diagram elements
  document.addEventListener('click', function(e) {
    var targetEl = e.target.closest('[data-key], [data-tool], .link-group, .chip-tool');
    if (!targetEl) return;
    // We handle task nodes and links separately in dblclick now
    if (targetEl.classList.contains('task-node') || targetEl.classList.contains('link-group') || targetEl.classList.contains('dep-arrow')) return;
    
    if (e.target.closest('#feedback-drawer, #tool-note-modal, .view-toggle, .filter-bar, .topbar, .tab-bar, .zoom-controls, .note-icon, .arch-note-icon')) return;

    if (!drawerEl || !drawerEl.classList.contains('open')) return;

    var type = 'general', key = 'General Workflow', actId = null, actName = null;
    var panelEl = targetEl.closest('.tab-panel');
    if (panelEl) {
      var idx = parseInt(panelEl.getAttribute('data-index') || '0', 10);
      if (activities[idx]) { actId = activities[idx].id; actName = activities[idx].name; }
    }

    if (targetEl.getAttribute('data-tool')) {
      type = 'tool'; key = targetEl.getAttribute('data-tool');
    } else if (targetEl.classList.contains('chip') && targetEl.getAttribute('data-type') === 'tools') {
      type = 'tool'; key = targetEl.getAttribute('data-key');
    } else if (targetEl.classList.contains('chip-tool')) {
      type = 'tool'; key = targetEl.textContent.trim();
    }

    if (type !== 'general') {
      setFbTarget(type, key, actId, actName, [key]);
    }
  });

  document.addEventListener('dblclick', function(e) {
    var targetEl = e.target.closest('.task-node, .link-group, .dep-arrow');
    if (!targetEl) return;
    if (e.target.closest('#feedback-drawer, #tool-note-modal, .view-toggle, .filter-bar, .topbar, .tab-bar, .zoom-controls, .note-icon, .arch-note-icon')) return;

    if (!drawerEl || !drawerEl.classList.contains('open')) return;

    var type = 'general', key = 'General Workflow', actId = null, actName = null;
    var panelEl = targetEl.closest('.tab-panel');
    if (panelEl) {
      var idx = parseInt(panelEl.getAttribute('data-index') || '0', 10);
      if (activities[idx]) { actId = activities[idx].id; actName = activities[idx].name; }
    }

    var tools = [];
    if (targetEl.classList.contains('task-node')) {
      type = 'task'; key = targetEl.getAttribute('data-id');
      if (targetEl.getAttribute('data-tool')) tools.push(targetEl.getAttribute('data-tool'));
    } else if (targetEl.classList.contains('link-group') || targetEl.classList.contains('dep-arrow')) {
      type = 'link'; key = targetEl.getAttribute('data-from') + ' -> ' + targetEl.getAttribute('data-to');
      if (targetEl.getAttribute('data-source-tool')) tools.push(targetEl.getAttribute('data-source-tool'));
      if (targetEl.getAttribute('data-target-tool')) tools.push(targetEl.getAttribute('data-target-tool'));
    }

    if (type !== 'general') {
      setFbTarget(type, key, actId, actName, tools);
      if (window.getSelection) window.getSelection().removeAllRanges();
    }
  });

  // Tool note modal logic
  var tnmEl = document.getElementById('tool-note-modal');
  var tnmTitle = document.getElementById('tnm-title');
  var tnmBody = document.getElementById('tnm-body');
  if (tnmEl) {
    var closeTnm = function() { tnmEl.style.display = 'none'; };
    var closeBtn1 = document.getElementById('tnm-close');
    var closeBtn2 = document.getElementById('tnm-btn-close');
    if (closeBtn1) closeBtn1.addEventListener('click', closeTnm);
    if (closeBtn2) closeBtn2.addEventListener('click', closeTnm);
    tnmEl.addEventListener('click', function(e) { if (e.target === tnmEl) closeTnm(); });
  }

  window.showToolNoteModal = function(tool) {
    if (!tnmEl) return;
    var note = toolNotes[tool];
    tnmTitle.textContent = 'Notes for ' + tool;
    tnmBody.textContent = (note && note.trim()) ? note : '(No notes have been added for this tool in the model.)';
    tnmEl.style.display = 'flex';
  };

  // ── Global search ─────────────────────────────────────────────────────────
  var searchInput = document.getElementById('global-search');
  var searchClear = document.getElementById('global-search-clear');

  function applySearch(q) {
    q = (q || '').trim().toLowerCase();
    if (searchClear) searchClear.style.display = q ? 'block' : 'none';

    // Gather all task nodes in the current active panel
    var activePanel = document.querySelector('.tab-panel.active');
    if (!activePanel) return;

    var idx = parseInt(activePanel.getAttribute('data-index') || '0', 10);
    var act = activities[idx];
    if (!act) return;

    var taskNodes = activePanel.querySelectorAll('.task-node');
    if (!q) {
      // No search: restore all
      taskNodes.forEach(function(el) { el.classList.remove('dimmed'); });
      activePanel.querySelectorAll('.doc-node').forEach(function(el) { el.classList.remove('dimmed'); });
      activePanel.querySelectorAll('.arch-box-g').forEach(function(el) { el.style.opacity = ''; });
      return;
    }

    // Build matching set for current activity
    var matchTaskIds = new Set();
    var matchTools = new Set();
    var docMap = {};
    (act.documents || []).forEach(function(d) { docMap[d.id] = d.name || ''; });

    (act.tasks || []).forEach(function(t) {
      var respName = '';
      (act.responsibles || []).forEach(function(r) { if (r.key === t.responsible) respName = r.name || ''; });
      var docNames = [];
      (t.inputs || []).forEach(function(id) { if (docMap[id]) docNames.push(docMap[id]); });
      (t.outputs || []).forEach(function(id) { if (docMap[id]) docNames.push(docMap[id]); });
      var tNote = toolNotes[t.tool] || '';
      var hay = [
        JSON.stringify(t),
        respName,
        act.name || '',
        docNames.join(' '),
        tNote,
      ].join(' ').toLowerCase();
      if (hay.indexOf(q) !== -1) {
        matchTaskIds.add(t.id);
        matchTools.add(t.tool);
      }
    });

    (act.tools || []).forEach(function(tool) {
      var tNote = toolNotes[tool] || '';
      if (tool.toLowerCase().indexOf(q) !== -1 || tNote.toLowerCase().indexOf(q) !== -1) {
        matchTools.add(tool);
      }
    });

    if (matchTaskIds.size > 0) {
      (act.tasks || []).forEach(function(t) {
        if (matchTaskIds.has(t.id)) matchTools.add(t.tool);
      });
    }

    // Dim timeline tasks
    taskNodes.forEach(function(el) {
      var taskId = el.getAttribute('data-id');
      if (matchTaskIds.has(taskId)) {
        el.classList.remove('dimmed');
      } else {
        el.classList.add('dimmed');
      }
    });

    // Dim document nodes
    activePanel.querySelectorAll('.doc-node').forEach(function(el) {
      var docId = el.getAttribute('data-doc-id');
      var docName = docMap[docId] || '';
      var isMatch = (docId && docId.toLowerCase().indexOf(q) !== -1) || (docName && docName.toLowerCase().indexOf(q) !== -1);
      if (!isMatch) {
        (act.tasks || []).forEach(function(t) {
          if (matchTaskIds.has(t.id) && ((t.inputs || []).indexOf(docId) !== -1 || (t.outputs || []).indexOf(docId) !== -1)) {
            isMatch = true;
          }
        });
      }
      if (isMatch) {
        el.classList.remove('dimmed');
      } else {
        el.classList.add('dimmed');
      }
    });

    // Dim arch boxes
    activePanel.querySelectorAll('.arch-box-g').forEach(function(el) {
      var tool = el.getAttribute('data-tool');
      el.style.opacity = matchTools.has(tool) ? '1' : '0.15';
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', function() { applySearch(searchInput.value); });
    if (searchClear) {
      searchClear.addEventListener('click', function() {
        searchInput.value = '';
        applySearch('');
      });
    }
  }

  updateFbCount();
  renderFbList();

  // Activate initial tab
  var initialTab = tabBtns[0] ? tabBtns[0].getAttribute('data-tab') : null;
  if (initialTab) activateTab(initialTab);

  // ── Font size & compact mode controls ──
  var fontSlider = document.getElementById('font-slider');
  var fontSizeLabel = document.getElementById('font-size-label');
  var fontResetBtn = document.getElementById('font-reset');
  var compactCheckbox = document.getElementById('compact-mode');
  var compactLabel = document.querySelector('.compact-toggle');

  if (fontSlider) {
    fontSlider.value = FONT_SIZE;
    if (fontSizeLabel) fontSizeLabel.textContent = FONT_SIZE + 'px';
    fontSlider.addEventListener('input', function() {
      FONT_SIZE = parseInt(fontSlider.value, 10);
      LINE_HEIGHT = Math.ceil(FONT_SIZE * 1.27);
      if (fontSizeLabel) fontSizeLabel.textContent = FONT_SIZE + 'px';
      saveDisplayPrefs();
      reRenderActive();
    });
  }
  if (fontResetBtn) {
    fontResetBtn.addEventListener('click', function() {
      FONT_SIZE = DEFAULT_FONT_SIZE;
      LINE_HEIGHT = DEFAULT_LINE_HEIGHT;
      if (fontSlider) fontSlider.value = FONT_SIZE;
      if (fontSizeLabel) fontSizeLabel.textContent = FONT_SIZE + 'px';
      saveDisplayPrefs();
      reRenderActive();
    });
  }
  var stretchSlider = document.getElementById('stretch-slider');
  var stretchLabel = document.getElementById('stretch-label');
  var stretchResetBtn = document.getElementById('stretch-reset');

  if (stretchSlider) {
    stretchSlider.value = Math.round(stretchFactor * 100);
    if (stretchLabel) stretchLabel.textContent = Math.round(stretchFactor * 100) + '%';
    stretchSlider.addEventListener('input', function() {
      stretchFactor = parseInt(stretchSlider.value, 10) / 100;
      if (stretchLabel) stretchLabel.textContent = Math.round(stretchFactor * 100) + '%';
      saveDisplayPrefs();
      reRenderActive();
    });
  }
  if (stretchResetBtn) {
    stretchResetBtn.addEventListener('click', function() {
      stretchFactor = 1.0;
      if (stretchSlider) stretchSlider.value = 100;
      if (stretchLabel) stretchLabel.textContent = '100%';
      saveDisplayPrefs();
      reRenderActive();
    });
  }

  // Tips banner dismiss
  var tipsBanner = document.getElementById('tips-banner');
  var tipsDismiss = document.getElementById('tips-dismiss');
  if (tipsBanner) {
    try {
      if (sessionStorage.getItem('viewer_tips_dismissed') === '1') tipsBanner.style.display = 'none';
    } catch(e) {}
    if (tipsDismiss) {
      tipsDismiss.addEventListener('click', function() {
        tipsBanner.style.display = 'none';
        try { sessionStorage.setItem('viewer_tips_dismissed', '1'); } catch(e) {}
      });
    }
  }
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
    workflowData: { 
      activities: visibleActivities,
      sequences: workflowData.sequences || [],
      hiddenTasks: workflowData.hiddenTasks || []
    },
    toolNotes: tNotes,
    collapsedTools: collapsedTools,
    edgeSides: options.edgeSides || {},
    toolPositions: options.toolPositions || {},
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
    tabBarHtml += `<button class="tab-btn tab-activity" data-tab="${tlId}">${esc(act.name)}</button>`;
    panelsHtml += `<div class="tab-panel" id="${tlId}" data-type="timeline" data-index="${i}">
      <div class="filter-bar"></div>
      <div style="position:relative;flex:1;overflow:hidden;display:flex;flex-direction:column;">
        <div class="view-toggle">
          <button class="active-view" data-show="${tlId}">← Timeline</button>
          <button class="inactive-view" data-show="${archId}">⬡ Architecture</button>
        </div>
        <div class="variant-toggle" style="position:absolute; top:12px; left:310px; z-index:100; display:flex; background:#ffffff; border:1px solid #cbd5e1; border-radius:6px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <button class="variant-btn" data-variant="option_1" style="padding:8px 14px; border:none; font-size:12px; font-weight:600; cursor:pointer; transition:all 0.15s; background:#1e40af; color:#fff;">Option 1</button>
          <button class="variant-btn" data-variant="option_2" style="padding:8px 14px; border:none; font-size:12px; font-weight:600; cursor:pointer; transition:all 0.15s; background:#fff; color:#475569; border-left:1px solid #cbd5e1;">Option 2</button>
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

  // Sequences tabs
  const sequences = workflowData.sequences || [];
  if (scope === 'all' && sequences.length > 0) {
    sequences.forEach((seq, i) => {
      const tlId = 'tab-seq-' + i;
      tabBarHtml += `<button class="tab-btn tab-sequence" style="display:none;" data-tab="${tlId}">${esc(seq.name)}</button>`;
      panelsHtml += `<div class="tab-panel" id="${tlId}" data-type="sequence" data-index="${i}">
        <div class="filter-bar"></div>
        <div class="assoc-container"></div>
        <div style="position:relative;flex:1;overflow:hidden;display:flex;flex-direction:column;">
          <div class="variant-toggle" style="position:absolute; top:12px; left:12px; z-index:100; display:flex; background:#ffffff; border:1px solid #cbd5e1; border-radius:6px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
            <button class="variant-btn" data-variant="option_1" style="padding:8px 14px; border:none; font-size:12px; font-weight:600; cursor:pointer; transition:all 0.15s; background:#1e40af; color:#fff;">Option 1</button>
            <button class="variant-btn" data-variant="option_2" style="padding:8px 14px; border:none; font-size:12px; font-weight:600; cursor:pointer; transition:all 0.15s; background:#fff; color:#475569; border-left:1px solid #cbd5e1;">Option 2</button>
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
  }

  // Activity Links tab
  if (showLinks) {
    tabBarHtml += `<div class="tab-sep tab-activity"></div>`;
    tabBarHtml += `<button class="tab-btn tab-activity" data-tab="tab-links">Activity links</button>`;
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

  const hasSequences = scope === 'all' && (workflowData.sequences || []).length > 0;
  const showTabBar = visibleActivities.length > 1 || showLinks || hasSequences;

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
    <div style="display:flex;align-items:center;gap:6px;background:#f1f5f9;border:1.5px solid #cbd5e1;border-radius:8px;padding:3px 10px;min-width:200px;max-width:280px;margin-left:16px;">
      <span style="font-size:13px;color:#94a3b8;flex-shrink:0;">🔍</span>
      <input id="global-search" type="text" placeholder="Search tasks, tools…" style="border:none;background:none;outline:none;font-size:11px;color:#1e293b;width:100%;font-family:inherit;" />
      <button id="global-search-clear" style="display:none;background:none;border:none;cursor:pointer;color:#94a3b8;font-size:12px;padding:0;line-height:1;">✕</button>
    </div>
    <div class="font-controls">
      <span class="fc-label" title="Text size">Aa</span>
      <input id="font-slider" type="range" min="8" max="24" value="11" title="Adjust task text size" />
      <span id="font-size-label" class="fc-value">11px</span>
      <button id="font-reset" type="button" class="fc-reset" title="Reset font size">↺</button>
    </div>
    <div class="font-controls" title="Adjust timeline width stretch">
      <span class="fc-label" title="Timeline Width">Width</span>
      <input id="stretch-slider" type="range" min="50" max="350" step="10" value="100" title="Adjust timeline width stretch" />
      <span id="stretch-label" class="fc-value">100%</span>
      <button id="stretch-reset" type="button" class="fc-reset" title="Reset timeline stretch">↺</button>
    </div>
    <button id="feedback-toggle-btn" class="feedback-topbtn" style="margin-left:auto;">
      💬 Leave Feedback <span id="feedback-count" class="feedback-count-badge" style="display:none;">0</span>
    </button>
  </div>
  ${showTabBar ? `<div class="tab-bar">${tabBarHtml}${hasSequences ? `<button id="back-to-stages-btn" class="tab-btn" style="display:none;margin-left:auto;color:#64748b;">← Back to Stages</button>` : ''}</div>` : `<div class="tab-bar" style="display:none">${tabBarHtml}</div>`}
  <div id="tips-banner" class="tips-banner">
    <span class="tip-item">🖱️ <strong>Hover</strong> over any task to see its details, dependencies, and linked documents.</span>
    ${hasSequences ? `<span class="tip-sep"></span><span class="tip-item"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="flex-shrink:0"><path d="M7,1 L1,4 L7,7 L13,4 Z M1,7 L7,10 L13,7 M1,10 L7,13 L13,10" stroke="#92400e" stroke-width="1.4" stroke-linejoin="round"/></svg> Tasks with a <strong>layers icon</strong> at the bottom-right corner belong to a Sequence — click the icon to jump directly to that sequence view.</span>` : ''}
    <button id="tips-dismiss" class="tips-banner-close" title="Dismiss">✕</button>
  </div>
  ${panelsHtml}
  <!-- Floating bottom-left buttons — mirrors App.js position:fixed bottom:24 left:24 group -->
  <div style="position:fixed;bottom:24px;left:24px;z-index:3000;display:flex;gap:12px;">
    ${hasSequences ? `<button id="seq-view-btn" style="padding:10px 16px;background:#ffffff;color:#1e293b;border:1.5px solid #cbd5e1;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);cursor:pointer;font-weight:600;display:flex;align-items:center;gap:8px;transition:all 0.2s;font-size:13px;"><span style="font-size:16px;">📚</span> Sequences View</button>` : ''}
    <button id="alt-tools-btn" style="padding:10px 16px;background:#ffffff;color:#1e293b;border:1.5px solid #cbd5e1;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);cursor:pointer;font-weight:600;display:flex;align-items:center;gap:8px;transition:all 0.2s;font-size:13px;"><span style="font-size:16px;">💡</span> Alternative Tools</button>
  </div>
  <!-- Alt Tools Modal -->
  <div id="alt-tools-modal" style="display:none;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:600px;max-height:80vh;background:#fff;z-index:4000;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.3);overflow:hidden;flex-direction:column;">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:0.5px solid #e2e8f0;background:#f8fafc;">
      <span style="font-size:16px;font-weight:600;color:#1e293b;">Alternative Tools Compilation</span>
      <button id="alt-tools-close" style="background:none;border:none;font-size:18px;color:#64748b;cursor:pointer;">✕</button>
    </div>
    <div id="alt-tools-content" style="padding:20px;overflow-y:auto;flex:1;"></div>
    <div style="display:flex;justify-content:flex-end;padding:12px 20px;border-top:0.5px solid #e2e8f0;background:#f8fafc;">
      <button id="alt-tools-footer-close" style="padding:6px 16px;font-size:12px;background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;border-radius:6px;font-weight:600;cursor:pointer;">Close</button>
    </div>
  </div>
  <div id="alt-tools-backdrop" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:3999;backdrop-filter:blur(3px);"></div>

  <div id="tooltip" class="d3-tooltip"></div>
  <div id="feedback-drawer" class="feedback-drawer">
    <div class="feedback-header">
      <span>💬 Reviewer Feedback</span>
      <button id="feedback-close-btn" class="feedback-close" title="Close">✕</button>
    </div>
    <div class="feedback-body">
      <div class="feedback-form">
        <label>Your Name / Role</label>
        <input id="fb-author" type="text" placeholder="e.g. Alice (Systems Eng)" />
        <label>Target Area</label>
        <div style="display:flex;gap:4px;align-items:center;">
          <span id="fb-target-badge" class="feedback-badge" style="margin:0;flex:1;">General Workflow</span>
          <button id="fb-clear-target" type="button" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:11px;text-decoration:underline;">Reset</button>
        </div>
        <div style="font-size:11px;color:#1e40af;background:#eff6ff;padding:6px 8px;border-radius:6px;border:1px solid #bfdbfe;line-height:1.3;margin:2px 0;">
          💡 <strong>Tip:</strong> Click any <strong>Tool lane</strong> or <strong>Architecture box</strong>, or double-click any <strong>Task</strong> or <strong>Link</strong> in the diagram to attach your comment directly to that item!
        </div>
        <div id="fb-ref-note-container" style="display:none;margin-top:8px;">
          <label>Reference Note (Optional)</label>
          <input id="fb-ref-note" type="text" placeholder="Explain exactly what this comment refers to..." />
        </div>
        <label id="fb-note-label">Comment</label>
        <textarea id="fb-text" placeholder="Write your observation, question, or suggestion..."></textarea>
        <button id="fb-submit-btn" type="button" class="feedback-btn-primary">Add Comment</button>
      </div>
      <div id="fb-list" class="feedback-list">
        <div style="text-align:center;color:#94a3b8;font-size:12px;padding:20px 0;">No comments yet. Click any tool lane, architecture box, or link in the diagram to attach a note!</div>
      </div>
    </div>
    <div class="feedback-footer">
      <button id="fb-copy-md" type="button" class="feedback-btn-sec" title="Copy formatted markdown report to clipboard">📋 Copy Markdown</button>
      <button id="fb-download-json" type="button" class="feedback-btn-sec" style="background:#1e40af;color:#fff;border-color:#1e40af;" title="Download JSON file to import into live React editor">📥 Export JSON</button>
    </div>
  </div>
  <div id="tool-note-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:3000;align-items:center;justify-content:center;backdrop-filter:blur(2px);">
    <div style="background:#fff;border-radius:12px;width:520px;max-width:90vw;box-shadow:0 20px 60px rgba(0,0,0,0.3);overflow:hidden;display:flex;flex-direction:column;border:1px solid #e2e8f0;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid #e2e8f0;background:#f8fafc;">
        <span id="tnm-title" style="font-size:16px;font-weight:700;color:#1e293b;"></span>
        <button id="tnm-close" type="button" style="background:none;border:none;font-size:18px;color:#64748b;cursor:pointer;">✕</button>
      </div>
      <div id="tnm-body" style="padding:20px;font-size:13px;color:#334155;line-height:1.6;max-height:60vh;overflow-y:auto;white-space:pre-wrap;font-family:system-ui,sans-serif;"></div>
      <div style="padding:12px 20px;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;background:#f8fafc;">
        <button id="tnm-btn-close" type="button" style="padding:6px 16px;font-size:12px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer;">Close</button>
      </div>
    </div>
  </div>
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