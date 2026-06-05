import React, { useEffect, useRef, useState } from 'react';
import './App.css';

const WorkflowD3 = () => {
  const svgRef = useRef();
  const [tooltipData, setTooltipData] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const tasks = [
    { id: 't1', name: 'Task 1', tool: 'TOOL 1', x: 100, y: 100, w: 150, h: 40, color: '#4CAF50', deps: [], details: 'Task 1 details' },
    { id: 't2', name: 'Task 2', tool: 'TOOL 2', x: 300, y: 200, w: 150, h: 40, color: '#4CAF50', deps: [], details: 'Task 2 details' },
    { id: 't3', name: 'Task 3', tool: 'TOOL 3', x: 500, y: 100, w: 120, h: 40, color: '#1a3a99', deps: ['t2'], details: 'Task 3 details' },
    { id: 't4', name: 'Task 4', tool: 'TOOL 1', x: 300, y: 300, w: 200, h: 40, color: '#1a3a99', deps: ['t1'], details: 'Task 4 details' },
    { id: 't5', name: 'Task 5', tool: 'TOOL 2', x: 500, y: 300, w: 180, h: 40, color: '#d946ef', deps: ['t2'], details: 'Task 5 details' },
    { id: 't6', name: 'Task 6', tool: 'TOOL 4', x: 700, y: 200, w: 150, h: 40, color: '#4CAF50', deps: ['t4', 't5'], details: 'Task 6 details' }
  ];

  useEffect(() => {
    if (!svgRef.current) return;

    svgRef.current.innerHTML = '';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', 1000);
    svg.setAttribute('height', 500);
    svg.setAttribute('style', 'background-color: #f5f5f5; border: 2px solid #333;');
    svgRef.current.appendChild(svg);

    // Add arrow marker
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'arrowhead');
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '10');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '3');
    marker.setAttribute('orient', 'auto');
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', '0 0, 10 3, 0 6');
    poly.setAttribute('fill', '#FF6B6B');
    marker.appendChild(poly);
    defs.appendChild(marker);
    svg.appendChild(defs);

    // Draw arrows for dependencies
    tasks.forEach(task => {
      task.deps.forEach(depId => {
        const depTask = tasks.find(t => t.id === depId);
        if (depTask) {
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          const x1 = depTask.x + depTask.w;
          const y1 = depTask.y + depTask.h / 2;
          const x2 = task.x;
          const y2 = task.y + task.h / 2;
          
          const d = `M ${x1} ${y1} L ${x1 + 30} ${y1} L ${x2 - 30} ${y2} L ${x2} ${y2}`;
          
          path.setAttribute('d', d);
          path.setAttribute('stroke', '#FF6B6B');
          path.setAttribute('stroke-width', '3');
          path.setAttribute('fill', 'none');
          path.setAttribute('marker-end', 'url(#arrowhead)');
          
          path.addEventListener('mouseenter', function() {
            this.setAttribute('stroke', '#4CAF50');
            this.setAttribute('stroke-width', '4');
          });
          
          path.addEventListener('mouseleave', function() {
            this.setAttribute('stroke', '#FF6B6B');
            this.setAttribute('stroke-width', '3');
          });
          
          svg.appendChild(path);
        }
      });
    });

    // Draw tasks
    tasks.forEach(task => {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', task.x);
      rect.setAttribute('y', task.y);
      rect.setAttribute('width', task.w);
      rect.setAttribute('height', task.h);
      rect.setAttribute('fill', task.color);
      rect.setAttribute('rx', '4');
      rect.style.cursor = 'pointer';
      
      rect.addEventListener('mouseenter', (e) => {
        setTooltipData(task);
        setTooltipPos({ x: e.clientX, y: e.clientY });
        rect.style.filter = 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))';
      });
      
      rect.addEventListener('mouseleave', () => {
        setTooltipData(null);
        rect.style.filter = 'none';
      });
      
      svg.appendChild(rect);

      // Task label
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', task.x + task.w / 2);
      text.setAttribute('y', task.y + task.h / 2 + 5);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', '12px');
      text.setAttribute('font-weight', 'bold');
      text.setAttribute('fill', 'white');
      text.setAttribute('pointer-events', 'none');
      text.textContent = task.name;
      svg.appendChild(text);
    });

  }, []);

  return (
    <div className="workflow-d3-container">
      <div ref={svgRef} className="svg-container"></div>
      
      {tooltipData && (
        <div 
          className="d3-tooltip" 
          style={{
            position: 'fixed',
            left: `${tooltipPos.x + 20}px`,
            top: `${tooltipPos.y - 100}px`,
          }}
        >
          <div className="tooltip-header">
            <strong>{tooltipData.name}</strong>
          </div>
          <div className="tooltip-content">
            <p><strong>Tool:</strong> {tooltipData.tool}</p>
            <p><strong>Details:</strong> {tooltipData.details}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkflowD3;