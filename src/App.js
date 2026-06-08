import React, { useState } from 'react';
import './App.css';
import defaultData from './data/workflow.json';
import WorkflowCanvas from './components/WorkflowCanvas';
import FilterBar from './components/FilterBar';
import TaskEditor from './components/TaskEditor';

const App = () => {
  const [workflowData, setWorkflowData] = useState(defaultData);
  const [activeActivityIndex, setActiveActivityIndex] = useState(0);
  const [filters, setFilters] = useState({ responsibles: [], tools: [] });
  const [showEditor, setShowEditor] = useState(false);

  const activities = workflowData.activities || [];
  const activity = activities[activeActivityIndex];

  const handleSave = (newData) => {
    setWorkflowData(newData);
    setActiveActivityIndex(0);
    setFilters({ responsibles: [], tools: [] });
  };

  if (!activity) {
    return (
      <div className="workflow-d3-container">
        <p style={{ color: '#ef4444', padding: '20px' }}>
          No activity found. Use "Edit tasks" to add one.
        </p>
      </div>
    );
  }

  return (
    <div className="workflow-d3-container">
      {/* Activity tabs — shown only when multiple activities exist */}
      {activities.length > 1 && (
        <div className="activity-tabs">
          {activities.map((act, i) => (
            <button
              key={act.id}
              className={`activity-tab ${i === activeActivityIndex ? 'active' : ''}`}
              onClick={() => {
                setActiveActivityIndex(i);
                setFilters({ responsibles: [], tools: [] });
              }}
            >
              {act.name}
            </button>
          ))}
        </div>
      )}

      <FilterBar
        activity={activity}
        filters={filters}
        onChange={setFilters}
        onImport={() => setShowEditor(true)}
      />

      <div className="svg-container">
        <WorkflowCanvas activity={activity} filters={filters} />
      </div>

      {showEditor && (
        <TaskEditor
          workflowData={workflowData}
          onSave={handleSave}
          onClose={() => setShowEditor(false)}
        />
      )}
    </div>
  );
};

export default App;
