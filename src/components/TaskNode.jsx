import React from 'react';

const TASK_HEIGHT = 44;
const TASK_RADIUS = 6;

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
  const opacity = isDimmed ? 0.2 : 1;
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

  return (
    <g
      style={{ opacity, filter: shadow, transition: 'all 0.2s ease', cursor: 'pointer' }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={TASK_HEIGHT}
        rx={TASK_RADIUS}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
      />
      <text
        x={x + width / 2}
        y={y + TASK_HEIGHT / 2 + 5}
        textAnchor="middle"
        fontSize="12px"
        fontWeight="bold"
        fill="white"
        pointerEvents="none"
        style={{ userSelect: 'none' }}
      >
        {task.name}
      </text>
    </g>
  );
};

export { TASK_HEIGHT };
export default TaskNode;
