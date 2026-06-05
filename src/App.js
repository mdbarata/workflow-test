import React, { useEffect, useRef, useState } from 'react';
import './App.css';

const WorkflowD3 = () => {
  const svgRef = useRef();
  const [hoveredTask, setHoveredTask] = useState(null);
  const [tooltipData, setTooltipData] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const data = {
    tasks: [
      {
        id: 'task1',
        name: 'Task 1',
        tool: 'TOOL 1',
        responsible: 'RESPONSIBLE_A',
        startTime: 100,
        duration: 150,
        color: '#4CAF50',
        details: 'Initial processing of Document Input 1 and 2',
        dependencies: [],
      },
      {
        id: 'task2',
        name: 'Task 2',
        tool: 'TOOL 2',
        responsible: 'RESPONSIBLE_A',
        startTime: 200,
        duration: 150,
        color: '#4CAF50',
        details: 'Processing Document Input 3',
        dependencies: [],
      },
      {
        id: 'task3',
        name: 'Task 3',
        tool: 'TOOL 3',
        responsible: 'RESPONSIBLE_B',
        startTime: 400,
        duration: 120,
        color: '#1a3a99',
        details: 'Data validation and verification',
        dependencies: ['task2'],
      },
      {
        id: 'task4',
        name: 'Task 4',
        tool: 'TOOL 1',
        responsible: 'RESPONSIBLE_B',
        startTime: 300,
        duration: 200,
        color: '#1a3a99',
        details: 'Advanced processing following Task 1',
        dependencies: ['task1'],
        verticalOffset: true,
      },
      {
        id: 'task5',
        name: 'Task 5',
        tool: 'TOOL 2',
        responsible: 'RESPONSIBLE_C',
        startTime: 400,
        duration: 180,
        color: '#d946ef',
        details: 'Quality assurance checkpoint',
        dependencies: ['task2'],
        verticalOffset: true,
      },
      {
        id: 'task6',
        name: 'Task 6',
        tool: 'TOOL 4',
        responsible: 'RESPONSIBLE_A',
        startTime: 550,
        duration: 150,
        color: '#4CAF50',
        details: 'Final document generation',
        dependencies: ['task4', 'task5'],
      },
    ],
    tools: ['TOOL 1', 'TOOL 2', 'TOOL 3', 'TOOL 4'],
    documents: [
      { id: 'document1', name: 'Document Input 1', type: 'input' },
      { id: 'document2', name: 'Document Input 2', type: 'input' },
      { id: 'document3', name: 'Document Input 3', type: 'input' },
      { id: 'output1', name: 'Document Output 1', type: 'output' },
      { id: 'output2', name: 'Document Output 1', type: 'output' },
      { id: 'output3', name: 'Document Output 1', type: 'output' },
    ],
    responsibles: [
      {
        key: 'RESPONSIBLE_A',
        name: 'RESPONSIBLE A',
        color: '#c7e9c0',
        borderColor: '#2d6a2d',
      },
      {
        key: 'RESPONSIBLE_B',
        name: 'RESPONSIBLE B',
        color: '#b3d9ff',
        borderColor: '#003d99',
      },
      {
        key: 'RESPONSIBLE_C',
        name: 'RESPONSIBLE C',
        color: '#f0c6ff',
        borderColor: '#9900cc',
      },
    ],
  };

  useEffect(() => {
    if (!svgRef.current) return;

    const margin = { top: 100, right: 200, bottom: 40, left: 150 };
    const svgWidth = 1800;
    const svgHeight = 900;
    const width = svgWidth - margin.left - margin.right;
    const height = svgHeight - margin.top - margin.bottom;
    const toolHeight = height / data.tools.length;
    const taskHeight = 40;

    svgRef.current.innerHTML = '';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', svgWidth);
    svg.setAttribute('height', svgHeight);
    svg.setAttribute(
      'style',
      'background-color: #f5f5f5; border: 1px solid #ddd;'
    );
    svgRef.current.appendChild(svg);

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

    // Large arrow marker
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'arrowhead-large');
    marker.setAttribute('markerWidth', '13');
    marker.setAttribute('markerHeight', '13');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '6.5');
    marker.setAttribute('orient', 'auto');
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', '0 0, 13 6.5, 0 13');
    polygon.setAttribute('fill', '#2c3e50');
    marker.appendChild(polygon);
    defs.appendChild(marker);

    svg.appendChild(defs);

    const legendGroup = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'g'
    );
    legendGroup.setAttribute('transform', `translate(${margin.left}, 20)`);

    data.responsibles.forEach((resp, i) => {
      const legendItem = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'g'
      );
      legendItem.setAttribute('transform', `translate(${i * 400}, 0)`);

      const rect = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'rect'
      );
      rect.setAttribute('x', '0');
      rect.setAttribute('y', '0');
      rect.setAttribute('width', '40');
      rect.setAttribute('height', '30');
      rect.setAttribute('fill', resp.color);
      rect.setAttribute('stroke', resp.borderColor);
      rect.setAttribute('stroke-width', '2');
      legendItem.appendChild(rect);

      const text = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'text'
      );
      text.setAttribute('x', '50');
      text.setAttribute('y', '20');
      text.setAttribute('font-size', '12px');
      text.setAttribute('font-weight', 'bold');
      text.setAttribute('fill', '#333');
      text.textContent = resp.name;
      legendItem.appendChild(text);

      legendGroup.appendChild(legendItem);
    });
    svg.appendChild(legendGroup);

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${margin.left}, ${margin.top})`);
    svg.appendChild(g);

    const title = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'text'
    );
    title.setAttribute('x', width / 2);
    title.setAttribute('y', '-30');
    title.setAttribute('text-anchor', 'middle');
    title.setAttribute('font-size', '20px');
    title.setAttribute('font-weight', 'bold');
    title.setAttribute('fill', '#333');
    title.textContent = 'ACTIVITY 1';
    g.appendChild(title);

    const getTaskVerticalPosition = (task) => {
      const toolIndex = data.tools.indexOf(task.tool);
      const toolTasksBeforeThis = data.tasks.filter(
        (t) => t.tool === task.tool && t.startTime < task.startTime
      ).length;

      const baseY = toolIndex * toolHeight + 45;
      const verticalOffset = toolTasksBeforeThis * (taskHeight + 20);

      return Math.min(
        baseY + verticalOffset,
        toolIndex * toolHeight + toolHeight - 60
      );
    };

    // Draw dependencies first (so they appear behind tasks)
data.tasks.forEach(task => {
  task.dependencies.forEach(depId => {
    const depTask = data.tasks.find(t => t.id === depId);
    if (depTask) {
      const sourceY = getTaskVerticalPosition(depTask) + taskHeight / 2;
      const sourceX = depTask.startTime + depTask.duration;
      const targetY = getTaskVerticalPosition(task) + taskHeight / 2;
      const targetX = task.startTime;

      // Create curved path with better arrows
      const midX = (sourceX + targetX) / 2;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      
      // Use quadratic bezier curve for better visualization
      const d = `M ${sourceX} ${sourceY} Q ${midX} ${sourceY}, ${midX} ${(sourceY + targetY) / 2} T ${targetX} ${targetY}`;
      
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', '#2c3e50');
      path.setAttribute('stroke-width', '2.5');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('marker-end', 'url(#arrowhead-large)');
      path.setAttribute('opacity', '0.7');
      path.setAttribute('class', 'dependency-arrow');
      
      // Add hover effect
      path.addEventListener('mouseenter', () => {
        path.setAttribute('stroke-width', '3.5');
        path.setAttribute('opacity', '1');
        path.setAttribute('stroke', '#4CAF50');
      });

      path.addEventListener('mouseleave', () => {
        path.setAttribute('stroke-width', '2.5');
        path.setAttribute('opacity', '0.7');
        path.setAttribute('stroke', '#2c3e50');
      });

      g.appendChild(path);
    }
  });
});

    data.tools.forEach((tool, toolIndex) => {
      const toolY = toolIndex * toolHeight;

      const toolRect = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'rect'
      );
      toolRect.setAttribute('x', '0');
      toolRect.setAttribute('y', toolY);
      toolRect.setAttribute('width', width);
      toolRect.setAttribute('height', toolHeight);
      toolRect.setAttribute('fill', '#fafafa');
      toolRect.setAttribute('stroke', '#2563eb');
      toolRect.setAttribute('stroke-width', '2');
      toolRect.setAttribute('rx', '4');
      g.appendChild(toolRect);

      const toolLabel = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'text'
      );
      toolLabel.setAttribute('x', '10');
      toolLabel.setAttribute('y', toolY + 25);
      toolLabel.setAttribute('font-size', '13px');
      toolLabel.setAttribute('font-weight', 'bold');
      toolLabel.setAttribute('fill', '#1565c0');
      toolLabel.textContent = tool;
      g.appendChild(toolLabel);

      const line = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'line'
      );
      line.setAttribute('x1', '0');
      line.setAttribute('y1', toolY + 35);
      line.setAttribute('x2', width);
      line.setAttribute('y2', toolY + 35);
      line.setAttribute('stroke', '#2563eb');
      line.setAttribute('stroke-width', '1');
      line.setAttribute('opacity', '0.3');
      g.appendChild(line);
    });

    data.tasks.forEach((task) => {
      const taskGroup = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'g'
      );
      taskGroup.setAttribute('class', 'task-group');
      taskGroup.setAttribute('data-task-id', task.id);

      const taskY = getTaskVerticalPosition(task);

      const taskRect = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'rect'
      );
      taskRect.setAttribute('x', task.startTime);
      taskRect.setAttribute('y', taskY);
      taskRect.setAttribute('width', task.duration);
      taskRect.setAttribute('height', taskHeight);
      taskRect.setAttribute('rx', '4');
      taskRect.setAttribute('fill', task.color);
      taskRect.setAttribute('stroke', task.color);
      taskRect.setAttribute('stroke-width', '2');
      taskRect.setAttribute('class', 'task-rect');
      taskRect.style.cursor = 'pointer';
      taskRect.style.transition = 'all 0.3s ease';

      taskRect.addEventListener('mouseenter', (e) => {
        setHoveredTask(task.id);
        setTooltipData(task);
        setTooltipPos({ x: e.clientX, y: e.clientY });

        taskRect.style.filter = 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))';
        taskRect.style.opacity = '1';

        svg.querySelectorAll('.task-rect').forEach((el) => {
          if (el !== taskRect) {
            el.style.opacity = '0.3';
          }
        });
      });

      taskRect.addEventListener('mouseleave', () => {
        setHoveredTask(null);
        setTooltipData(null);
      
        taskRect.style.filter = 'none';
      
        svg.querySelectorAll('.task-rect').forEach(el => {
          el.style.opacity = '1';
        });
      });

      taskGroup.appendChild(taskRect);

      const taskLabel = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'text'
      );
      taskLabel.setAttribute('x', task.startTime + task.duration / 2);
      taskLabel.setAttribute('y', taskY + taskHeight / 2 + 5);
      taskLabel.setAttribute('text-anchor', 'middle');
      taskLabel.setAttribute('font-size', '12px');
      taskLabel.setAttribute('font-weight', 'bold');
      taskLabel.setAttribute('fill', 'white');
      taskLabel.setAttribute('pointer-events', 'none');
      taskLabel.textContent = task.name;
      taskGroup.appendChild(taskLabel);

      g.appendChild(taskGroup);
    });

    const inputDocs = data.documents.filter((d) => d.type === 'input');
    inputDocs.forEach((doc, i) => {
      const docGroup = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'g'
      );
      docGroup.setAttribute('transform', `translate(-140, ${i * 100 + 30})`);

      const docRect = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'rect'
      );
      docRect.setAttribute('x', '0');
      docRect.setAttribute('y', '0');
      docRect.setAttribute('width', '130');
      docRect.setAttribute('height', '50');
      docRect.setAttribute('rx', '6');
      docRect.setAttribute('fill', '#999');
      docRect.setAttribute('stroke', '#666');
      docRect.setAttribute('stroke-width', '2');
      docGroup.appendChild(docRect);

      const docText = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'text'
      );
      docText.setAttribute('x', '65');
      docText.setAttribute('y', '30');
      docText.setAttribute('text-anchor', 'middle');
      docText.setAttribute('font-size', '11px');
      docText.setAttribute('font-weight', 'bold');
      docText.setAttribute('fill', 'white');
      docText.textContent = doc.name;
      docGroup.appendChild(docText);

      g.appendChild(docGroup);
    });

    const outputDocs = data.documents.filter((d) => d.type === 'output');
    outputDocs.forEach((doc, i) => {
      const docGroup = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'g'
      );
      docGroup.setAttribute(
        'transform',
        `translate(${width + 20}, ${i * 100 + 30})`
      );

      const docRect = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'rect'
      );
      docRect.setAttribute('x', '0');
      docRect.setAttribute('y', '0');
      docRect.setAttribute('width', '130');
      docRect.setAttribute('height', '50');
      docRect.setAttribute('rx', '6');
      docRect.setAttribute('fill', '#999');
      docRect.setAttribute('stroke', '#666');
      docRect.setAttribute('stroke-width', '2');
      docGroup.appendChild(docRect);

      const docText = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'text'
      );
      docText.setAttribute('x', '65');
      docText.setAttribute('y', '30');
      docText.setAttribute('text-anchor', 'middle');
      docText.setAttribute('font-size', '11px');
      docText.setAttribute('font-weight', 'bold');
      docText.setAttribute('fill', 'white');
      docText.textContent = doc.name;
      docGroup.appendChild(docText);

      g.appendChild(docGroup);
    });
  }, [data]);

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
            zIndex: 1000,
          }}
        >
          <div className="tooltip-header">
            <strong>{tooltipData.name}</strong>
          </div>
          <div className="tooltip-content">
            <p>
              <strong>Tool:</strong> {tooltipData.tool}
            </p>
            <p>
              <strong>Responsible:</strong> {tooltipData.responsible}
            </p>
            <p>
              <strong>Duration:</strong> {tooltipData.duration}px
            </p>
            <p>
              <strong>Description:</strong> {tooltipData.details}
            </p>
            <p>
              <strong>Dependencies:</strong>{' '}
              {tooltipData.dependencies.length > 0
                ? tooltipData.dependencies.join(', ')
                : 'None'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkflowD3;
