import React, { useRef, useEffect, useState } from 'react';

const DOC_WIDTH = 130;
const DOC_MIN_HEIGHT = 48;
const DOC_RADIUS = 6;

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
  onHeightChange,
}) => {
  const textRef = useRef(null);
  const [boxHeight, setBoxHeight] = useState(DOC_MIN_HEIGHT);

  useEffect(() => {
    if (textRef.current) {
      const textElement = textRef.current;
      const textHeight = textElement.getBBox().height;
      const newHeight = Math.max(DOC_MIN_HEIGHT, textHeight + 24);
      setBoxHeight(newHeight);
      if (onHeightChange) {
        onHeightChange(newHeight);
      }
    }
  }, [doc.name, onHeightChange]);

  const isInput = doc.type === 'input';
  const baseFill = isInput ? '#6b7280' : '#374151';
  const highlightFill = isInput ? '#2563eb' : '#059669';
  const fill = isHighlighted ? highlightFill : baseFill;
  const opacity = isDimmed ? 0.15 : 1;
  const strokeWidth = isHighlighted || isDragging ? 2.5 : 1.5;
  const strokeColor = isHighlighted || isDragging ? 'white' : 'rgba(0,0,0,0.3)';
  const scale = isDragging ? 1.04 : 1;
  const cx = x + DOC_WIDTH / 2;
  const cy = y + boxHeight / 2;

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
        height={boxHeight}
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
      <DocIcon x={x + 8} y={y + (boxHeight - 16) / 2 - 6} color="rgba(255,255,255,0.6)" />
      <text
        ref={textRef}
        x={x + DOC_WIDTH / 2 + 6}
        y={y + boxHeight / 2}
        textAnchor="middle"
        fontSize="10px"
        fontWeight="600"
        fill="white"
        pointerEvents="none"
        style={{ userSelect: 'none' }}
      >
        {doc.name.split(' ').reduce((lines, word, i, words) => {
          if (i === 0) return [[word]];
          const lastLine = lines[lines.length - 1];
          const testLine = [...lastLine, word].join(' ');
          if (testLine.length > 15) {
            return [...lines, [word]];
          }
          lastLine.push(word);
          return lines;
        }, []).map((line, i, arr) => (
          <tspan
            key={i}
            x={x + DOC_WIDTH / 2 + 6}
            dy={i === 0 ? `-${(arr.length - 1) * 6}px` : '12px'}
          >
            {line.join(' ')}
          </tspan>
        ))}
      </text>
    </g>
  );
};

export { DOC_WIDTH, DOC_MIN_HEIGHT as DOC_HEIGHT };
export default DocumentNode;