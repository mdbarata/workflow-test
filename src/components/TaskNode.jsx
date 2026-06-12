import React, { useMemo } from 'react';

const TASK_RADIUS = 6;
const FONT_SIZE = 11;         // px — slightly smaller so short names still look crisp
const LINE_HEIGHT = 14;       // px between baselines
const PAD_X = 8;              // horizontal padding inside rect
const PAD_Y = 8;              // vertical padding top & bottom

/**
 * Split `text` into lines that fit within `maxWidth` pixels.
 * Rough heuristic: average character width ≈ fontSize * 0.58.
 */
function wrapText(text, maxWidth, fontSize) {
  const avgCharW = fontSize * 0.58;
  const charsPerLine = Math.max(1, Math.floor(maxWidth / avgCharW));
  const words = text.split(' ');
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= charsPerLine) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      // If the single word itself is too long, keep it on its own line
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

const TaskNode = ({
  task,
  x,
  y,
  width,
  responsible,
  isHovered,
  isDimmed,
  isDepHighlighted,
  onMouseEnter,
  onMouseLeave,
}) => {
  const fillColor = responsible?.taskColor || '#888';
  const strokeWidth = isHovered || isDepHighlighted ? 3 : 1.5;
  const strokeColor = isHovered
    ? '#fff'
    : isDepHighlighted
    ? '#FFD700'
    : 'rgba(0,0,0,0.25)';
  const shadow = isHovered
    ? 'drop-shadow(0 4px 14px rgba(0,0,0,0.45))'
    : isDepHighlighted
    ? 'drop-shadow(0 2px 8px rgba(255,215,0,0.6))'
    : 'none';

  // Available width for text (rect width minus horizontal padding on both sides)
  const textAreaWidth = Math.max(20, width - PAD_X * 2);

  const lines = useMemo(
    () => wrapText(task.name, textAreaWidth, FONT_SIZE),
    [task.name, textAreaWidth]
  );

  // Dynamic height: top pad + all lines + bottom pad
  const rectHeight = PAD_Y + lines.length * LINE_HEIGHT + PAD_Y;

  // First baseline: top of rect + top padding + one line-height (baseline offset)
  const firstBaselineY = y + PAD_Y + LINE_HEIGHT - 2;

  const cx = x + width / 2;
  const cy = y + rectHeight / 2;

  return (
    <g
      style={{
        opacity: isDimmed ? 0.2 : 1,
        filter: shadow,
        transition: 'all 0.2s ease',
        cursor: 'pointer',
        // Scale from centre when hovered, just like DocumentNode
        transform: isHovered
          ? `translate(${cx}px,${cy}px) scale(1.03) translate(${-cx}px,${-cy}px)`
          : undefined,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={rectHeight}
        rx={TASK_RADIUS}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
      />
      {lines.map((line, i) => (
        <text
          key={i}
          x={cx}
          y={firstBaselineY + i * LINE_HEIGHT}
          textAnchor="middle"
          fontSize={`${FONT_SIZE}px`}
          fontWeight="bold"
          fill="white"
          pointerEvents="none"
          style={{ userSelect: 'none' }}
        >
          {line}
        </text>
      ))}
    </g>
  );
};

// Export a helper so WorkflowCanvas can calculate the dynamic height
// for connector midpoints without rendering the node.
export const getTaskHeight = (taskName, taskWidth) => {
  const textAreaWidth = Math.max(20, taskWidth - PAD_X * 2);
  const lines = wrapText(taskName, textAreaWidth, FONT_SIZE);
  return PAD_Y + lines.length * LINE_HEIGHT + PAD_Y;
};

// TASK_HEIGHT is kept as a sensible single-line default so existing
// imports that only use it for spacing don't break.
export const TASK_HEIGHT = PAD_Y + LINE_HEIGHT + PAD_Y;

export default TaskNode;