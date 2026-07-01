import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';

// ── Layout constants ──
const CARD_W = 420;
const CARD_GAP_Y = 140;
const CHIP_H = 22;
const CHIP_PAD_X = 14; // horizontal padding inside each chip
const CHIP_DOT = 16;   // space reserved for the colour dot in responsible chips
const FONT_SIZE_RESP = 10;
const FONT_SIZE_TOOL = 9;
const CHAR_W_RESP = FONT_SIZE_RESP * 0.62; // rough avg char width
const CHAR_W_TOOL = FONT_SIZE_TOOL * 0.62;
const CHIP_GAP = 6;
const CHIP_ROW_H = CHIP_H + CHIP_GAP;
const STORAGE_KEY = 'activity_links_positions';
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.5;

const loadPositions = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; } };
const savePositions = (pos) => localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));

const computeLinks = (activities) => {
  const pairMap = new Map();
  for (let i = 0; i < activities.length; i++) {
    for (let j = 0; j < activities.length; j++) {
      if (i === j) continue;
      const a = activities[i], b = activities[j];
      const aOutputs = (a.documents || []).filter((d) => d.type === 'output');
      const bInputs = (b.documents || []).filter((d) => d.type === 'input');
      aOutputs.forEach((od) => {
        bInputs.forEach((id) => {
          if (od.id === id.id || od.name.trim().toLowerCase() === id.name.trim().toLowerCase()) {
            const key = `${a.id}->${b.id}`;
            if (!pairMap.has(key)) pairMap.set(key, { from: a.id, to: b.id, docNames: [], key });
            const entry = pairMap.get(key);
            if (!entry.docNames.includes(od.name)) entry.docNames.push(od.name);
          }
        });
      });
    }
  }
  return [...pairMap.values()];
};

// ── Chip sizing helpers ───────────────────────────────────────────────────────
const respChipWidth = (name) => Math.max(80, CHIP_DOT + name.length * CHAR_W_RESP + CHIP_PAD_X);
const toolChipWidth = (name) => Math.max(60, name.length * CHAR_W_TOOL + CHIP_PAD_X * 2);

// Layout responsible chips: flow left-to-right, wrap when row exceeds CARD_W - 32
const layoutRespChips = (responsibles, startY) => {
  const PAD = 16;
  const MAX_ROW_W = CARD_W - PAD * 2;
  const chips = [];
  let cx = PAD, cy = startY, rowMaxH = 0;
  responsibles.forEach((r) => {
    const w = respChipWidth(r.name);
    if (chips.length > 0 && cx + w > PAD + MAX_ROW_W) {
      cx = PAD;
      cy += CHIP_ROW_H;
    }
    chips.push({ r, x: cx, y: cy, w });
    cx += w + CHIP_GAP;
    rowMaxH = Math.max(rowMaxH, cy);
  });
  const endY = responsibles.length ? (chips[chips.length - 1].y + CHIP_H) : startY;
  return { chips, endY };
};

// Layout tool chips: same flow-wrap approach
const layoutToolChips = (tools, startY) => {
  const PAD = 16;
  const MAX_ROW_W = CARD_W - PAD * 2;
  const chips = [];
  let cx = PAD, cy = startY;
  tools.forEach((tool) => {
    const w = toolChipWidth(tool);
    if (chips.length > 0 && cx + w > PAD + MAX_ROW_W) {
      cx = PAD;
      cy += CHIP_ROW_H;
    }
    chips.push({ tool, x: cx, y: cy, w });
    cx += w + CHIP_GAP;
  });
  const endY = tools.length ? (chips[chips.length - 1].y + CHIP_H) : startY;
  return { chips, endY };
};

// Dynamic card height based on actual chip layout
const cardHeight = (activity) => {
  const TITLE_H = 44;
  const BOTTOM_PAD = 16;
  const { endY: afterResp } = layoutRespChips(activity.responsibles || [], TITLE_H);
  const toolStartY = (activity.responsibles?.length ? afterResp + CHIP_GAP : TITLE_H);
  const { endY: afterTools } = layoutToolChips(activity.tools || [], toolStartY);
  const contentEnd = (activity.tools?.length ? afterTools : toolStartY);
  return contentEnd + BOTTOM_PAD;
};

const buildDefaultPositions = (activities) => {
  const pos = {};
  let currentY = 40;
  activities.forEach((act) => {
    pos[act.id] = { x: 140, y: currentY };
    currentY += cardHeight(act) + 150;
  });
  return pos;
};

// ── ActivityCard ──────────────────────────────────────────────────────────────
const ActivityCard = ({ activity, pos, height, isHovered, onMouseEnter, onMouseLeave, onMouseDown }) => {
  const taskCount = activity.tasks?.length || 0;
  const TITLE_H = 44;

  const { chips: respChips, endY: afterResp } = layoutRespChips(activity.responsibles || [], TITLE_H);
  const toolStartY = (activity.responsibles?.length ? afterResp + CHIP_GAP : TITLE_H);
  const { chips: toolChips } = layoutToolChips(activity.tools || [], toolStartY);

  return (
    <g style={{ cursor: 'grab' }} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onMouseDown={onMouseDown}>
      <rect x={pos.x} y={pos.y} width={CARD_W} height={height} rx={10}
        fill="#ffffff" stroke={isHovered ? '#2563eb' : '#cbd5e1'} strokeWidth={isHovered ? 2.5 : 1.5}
        style={{ filter: isHovered ? 'drop-shadow(0 6px 16px rgba(0,0,0,0.18))' : 'none', transition: 'stroke 0.15s' }} />
      <text x={pos.x + 16} y={pos.y + 26} fontSize="14px" fontWeight="700" fill="#1e293b">{activity.name}</text>
      <text x={pos.x + CARD_W - 16} y={pos.y + 26} fontSize="11px" fill="#94a3b8" textAnchor="end">
        {taskCount} task{taskCount !== 1 ? 's' : ''}
      </text>

      {/* Responsible chips — auto-sized */}
      {respChips.map(({ r, x, y, w }) => (
        <g key={r.key}>
          <rect x={pos.x + x} y={pos.y + y} width={w} height={CHIP_H} rx={11}
            fill={r.color} stroke={r.borderColor} strokeWidth={1.2} />
          <circle cx={pos.x + x + 10} cy={pos.y + y + CHIP_H / 2} r={4} fill={r.taskColor} />
          <text x={pos.x + x + CHIP_DOT} y={pos.y + y + CHIP_H / 2 + 4}
            fontSize={`${FONT_SIZE_RESP}px`} fontWeight="600" fill={r.borderColor}
            style={{ pointerEvents: 'none', userSelect: 'none' }}>{r.name}</text>
        </g>
      ))}

      {/* Tool chips — auto-sized */}
      {toolChips.map(({ tool, x, y, w }) => (
        <g key={tool}>
          <rect x={pos.x + x} y={pos.y + y} width={w} height={CHIP_H} rx={11}
            fill="#eff6ff" stroke="#2563eb" strokeWidth={1} />
          <text x={pos.x + x + w / 2} y={pos.y + y + CHIP_H / 2 + 4}
            fontSize={`${FONT_SIZE_TOOL}px`} fontWeight="600" fill="#1d4ed8" textAnchor="middle"
            style={{ pointerEvents: 'none', userSelect: 'none' }}>{tool}</text>
        </g>
      ))}
    </g>
  );
};

// ── ZoomControls ──────────────────────────────────────────────────────────────
const ZoomControls = ({ zoom, onZoom, onFit }) => (
  <div style={{ position: 'absolute', bottom: 16, right: 16, zIndex: 100, display: 'flex', alignItems: 'center', gap: 4, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
    <button onClick={() => onZoom(-1)} style={zBtn} title="Zoom out">−</button>
    <span style={{ fontSize: 11, color: '#64748b', minWidth: 38, textAlign: 'center' }}>{(zoom * 100).toFixed(0)}%</span>
    <button onClick={() => onZoom(1)} style={zBtn} title="Zoom in">+</button>
    <div style={{ width: 1, height: 16, background: '#e2e8f0', margin: '0 2px' }} />
    <button onClick={onFit} style={{ ...zBtn, fontSize: 13 }} title="Fit">⊡</button>
  </div>
);
const zBtn = { background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, fontWeight: 600, color: '#64748b', width: 24, height: 24 };

// ── ActivityLinksView ─────────────────────────────────────────────────────────
const ActivityLinksView = ({ activities, onEditTasks }) => {
  const [positions, setPositions] = useState(() => loadPositions() || buildDefaultPositions(activities));
  const [hoveredId, setHoveredId] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const svgRef = useRef(null);
  const wrapperRef = useRef(null);

  const links = useMemo(() => computeLinks(activities), [activities]);
  const heights = useMemo(() => {
    const m = {};
    activities.forEach((a) => { m[a.id] = cardHeight(a); });
    return m;
  }, [activities]);

  useEffect(() => {
    setPositions((prev) => {
      const next = { ...prev };
      let changed = false;
      let maxBottom = 40;
      activities.forEach((a) => {
        if (next[a.id]) {
          const bottom = next[a.id].y + cardHeight(a) + 150;
          if (bottom > maxBottom) maxBottom = bottom;
        }
      });
      activities.forEach((a) => {
        if (!next[a.id]) {
          next[a.id] = { x: 140, y: maxBottom };
          maxBottom += cardHeight(a) + 150;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [activities]);

  const maxX = Math.max(...Object.values(positions).map((p) => p.x), 0) + CARD_W + 200;
  const maxY = Math.max(...Object.values(positions).map((p, idx) => {
    const id = Object.keys(positions)[idx];
    return p.y + (heights[id] || 100);
  }), 0) + 80;

  const handleFit = useCallback(() => {
    if (!wrapperRef.current) return;
    const wr = wrapperRef.current.getBoundingClientRect();
    setZoom(Math.min(wr.width / maxX, wr.height / maxY, 1));
    setPan({ x: 0, y: 0 });
  }, [maxX, maxY]);

  useEffect(() => { handleFit(); }, [activities.length]); // eslint-disable-line

  const handleStepZoom = useCallback((dir) => {
    setZoom((prev) => Math.min(Math.max(prev + dir * 0.15, MIN_ZOOM), MAX_ZOOM));
  }, []);

  const handleCardMouseDown = useCallback((e, id) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const p = positions[id];
    setDragging({ id, offsetX: (e.clientX - rect.left - pan.x) / zoom - p.x, offsetY: (e.clientY - rect.top - pan.y) / zoom - p.y });
  }, [positions, pan, zoom]);

  const handleSvgMouseMove = useCallback((e) => {
    if (dragging) {
      const rect = svgRef.current.getBoundingClientRect();
      const newX = (e.clientX - rect.left - pan.x) / zoom - dragging.offsetX;
      const newY = (e.clientY - rect.top - pan.y) / zoom - dragging.offsetY;
      setPositions((prev) => ({ ...prev, [dragging.id]: { x: newX, y: newY } }));
      return;
    }
    if (isPanning) {
      setPan((prev) => ({ x: prev.x + e.clientX - panStart.x, y: prev.y + e.clientY - panStart.y }));
      setPanStart({ x: e.clientX, y: e.clientY });
    }
  }, [dragging, isPanning, panStart, pan, zoom]);

  const handleSvgMouseUp = useCallback(() => {
    if (dragging) { setPositions((prev) => { savePositions(prev); return prev; }); setDragging(null); }
    setIsPanning(false);
  }, [dragging]);

  const handleSvgMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX, y: e.clientY });
  }, []);

  const LABEL_H = 28;
  const LABEL_GAP = 6;
  const LABEL_FONT = 11;
  const LABEL_CHAR_W = LABEL_FONT * 0.62;
  const LABEL_PAD_X = 20;

  const drawLink = (link) => {
    const from = positions[link.from], to = positions[link.to];
    if (!from || !to) return null;
    const fromH = heights[link.from] || 100;
    const fromBelow = from.y < to.y;
    const x1 = from.x + CARD_W / 2;
    const y1 = fromBelow ? from.y + fromH : from.y;
    const x2 = to.x + CARD_W / 2;
    const y2 = fromBelow ? to.y : to.y + (heights[link.to] || 100);
    const isHov = hoveredId === link.from || hoveredId === link.to;
    const color = isHov ? '#059669' : '#94a3b8';
    const opacity = hoveredId && !isHov ? 0.15 : 0.75;

    const n = link.docNames.length;
    const stackH = n * LABEL_H + (n - 1) * LABEL_GAP;
    const gapStart = (y1 + y2) / 2 - stackH / 2;
    const midX = (x1 + x2) / 2;

    return (
      <g key={link.key}>
        <path d={`M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`}
          fill="none" stroke={color} strokeWidth={isHov ? 2 : 1.4} strokeDasharray="5,4"
          strokeOpacity={opacity} markerEnd={`url(#${isHov ? 'link-arrow-active' : 'link-arrow'})`} />
        {link.docNames.map((docName, i) => {
          const labelW = docName.length * LABEL_CHAR_W + LABEL_PAD_X * 2;
          const labelY = gapStart + i * (LABEL_H + LABEL_GAP) + LABEL_H / 2;
          return (
            <g key={docName} transform={`translate(${midX}, ${labelY})`}>
              <rect x={-labelW / 2} y={-LABEL_H / 2} width={labelW} height={LABEL_H} rx={13}
                fill={isHov ? '#ecfdf5' : '#ffffff'} stroke={color} strokeWidth={1.2}
                opacity={hoveredId && !isHov ? 0.2 : 1} />
              <text textAnchor="middle" y={4} fontSize={`${LABEL_FONT}px`} fontWeight="600"
                fill={isHov ? '#047857' : '#475569'}
                opacity={hoveredId && !isHov ? 0.2 : 1}>{docName}</text>
            </g>
          );
        })}
      </g>
    );
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative', overflow: 'hidden', width: '100%', height: '100%', background: '#f8f9fb' }}>
      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 100, display: 'flex', gap: 8 }}>
        {onEditTasks && <button onClick={onEditTasks} style={topBtn}>✎ Edit tasks</button>}
      </div>

      <ZoomControls zoom={zoom} onZoom={handleStepZoom} onFit={handleFit} />

      <svg ref={svgRef} width="100%" height="100%"
        viewBox={`${-pan.x / zoom} ${-pan.y / zoom} ${maxX / zoom} ${maxY / zoom}`}
        style={{ cursor: isPanning ? 'grabbing' : dragging ? 'grabbing' : 'grab', display: 'block' }}
        onMouseMove={handleSvgMouseMove} onMouseUp={handleSvgMouseUp}
        onMouseLeave={handleSvgMouseUp} onMouseDown={handleSvgMouseDown}>
        <defs>
          <marker id="link-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto">
            <polygon points="0 0, 8 3.5, 0 7" fill="#94a3b8" />
          </marker>
          <marker id="link-arrow-active" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto">
            <polygon points="0 0, 8 3.5, 0 7" fill="#059669" />
          </marker>
        </defs>

        {links.map(drawLink)}

        {activities.map((act) => (
          <ActivityCard key={act.id} activity={act}
            pos={positions[act.id] || { x: 0, y: 0 }} height={heights[act.id]}
            isHovered={hoveredId === act.id}
            onMouseEnter={() => setHoveredId(act.id)}
            onMouseLeave={() => setHoveredId(null)}
            onMouseDown={(e) => handleCardMouseDown(e, act.id)} />
        ))}
      </svg>

      {links.length === 0 && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', color: '#94a3b8', fontSize: 13, textAlign: 'center' }}>
          No shared documents found between activities.
        </div>
      )}
    </div>
  );
};

const topBtn = { padding: '8px 14px', background: '#1e40af', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' };

export default ActivityLinksView;