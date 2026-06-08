import React, { useState, useRef, useEffect } from 'react';

const DOC_WIDTH = 130;
const DOC_MIN_HEIGHT = 48;
const DOC_RADIUS = 6;
const TEXT_PADDING = 8;
const ICON_WIDTH = 12;
const ICON_HEIGHT = 16;

const DocIcon = ({ x, y, color }) => (
  <g>
    <path
      d={`M${x},${y + 4} L${x},${y + 16} L${x + 12},${y + 16} L${x + 12},${y + 8} L${x + 8},${y + 4} Z`}
      fill="white"
      fillOpacity="0.85"
      stroke={color}
      strokeWidth="1"
    />
    <path
      d={`M${x + 8},${y + 4} L${x + 8},${y + 8} L${x + 12},${y + 8}`}
      fill="none"
      stroke={color}
      strokeWidth="1"
    />
  </g>
);

const DocumentNode = ({
  doc,
  x,
  y,
  isHighlighted,
  isDimmed,
  isDragging,
  onMouseEnter,
  onMouseLeave,
  onMouseDown,
}) => {
  const [docHeight, setDocHeight] = useState(DOC_MIN_HEIGHT);
  const textRef = useRef(null);

  useEffect(() => {
    if (textRef.current) {
      const bbox = textRef.current.getBBox();
      // Calculate required height: icon area + text height + padding
      const requiredHeight = Math.max(
        ICON_HEIGHT + TEXT_PADDING * 2,
        bbox.height + TEXT_PADDING * 2
      );
      setDocHeight(Math.max(requiredHeight, DOC_MIN_HEIGHT));
    }
  }, [doc.name]);

  const isInput = doc.type === 'input';
  const baseFill = isInput ? '#6b7280' : '#374151';
  const highlightFill = isInput ? '#2563eb' : '#059669';
  const fill = isHighlighted ? highlightFill : baseFill;
  const opacity = isDimmed ? 0.15 : 1;
  const strokeWidth = isHighlighted || isDragging ? 2.5 : 1.5;
  const strokeColor = isHighlighted || isDragging ? 'white' : 'rgba(0,0,0,0.3)';
  const scale = isDragging ? 1.04 : 1;
  const cx = x + DOC_WIDTH / 2;
  const cy = y + docHeight / 2;

  return (
    <g
      style={{
        opacity,
        transition: isDragging ? 'none' : 'opacity 0.2s ease',
        cursor: isDragging ? 'grabbing' : 'grab',
        transform: `translate(${cx}px, ${cy}px) scale(${scale}) translate(${-cx}px, ${-cy}px)`,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseDown={onMouseDown}
    >
      <rect
        x={x}
        y={y}
        width={DOC_WIDTH}
        height={docHeight}
        rx={DOC_RADIUS}
        fill={fill}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        style={{
          filter:
            isHighlighted
              ? 'drop-shadow(0 2px 10px rgba(0,0,0,0.45))'
              : isDragging
              ? 'drop-shadow(0 6px 16px rgba(0,0,0,0.35))'
              : 'none',
        }}
      />
      <DocIcon x={x + 8} y={y + TEXT_PADDING} color="rgba(255,255,255,0.6)" />
      <text
        ref={textRef}
        x={x + DOC_WIDTH / 2}
        y={y + TEXT_PADDING}
        textAnchor="middle"
        fontSize="10px"
        fontWeight="600"
        fill="white"
        pointerEvents="none"
        style={{
          userSelect: 'none',
          dominantBaseline: 'hanging',
          whiteSpace: 'pre-wrap',
          wordWrap: 'break-word',
        }}
      >
        {doc.name}
      </text>
    </g>
  );
};

export { DOC_WIDTH, DOC_MIN_HEIGHT };
export default DocumentNode;