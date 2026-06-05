import React, { useState } from 'react';
import './App.css';
import defaultData from './data/workflow.json';
import WorkflowCanvas from './components/WorkflowCanvas';
import FilterBar from './components/FilterBar';
import JsonImporter from './components/JsonImporter';

const App = () => {
  const [workflowData, setWorkflowData] = useState(defaultData);
  const [activeActivityIndex, setActiveActivityIndex] = useState(0);
  const [filters, setFilters] = useState({ responsibles: [], tools: [] });
  const [showImporter, setShowImporter] = useState(false);

  const activities = workflowData.activities || [];
  const activity = activities[activeActivityIndex];

  const handleImport = (newData) => {
    setWorkflowData(newData);
    setActiveActivityIndex(0);
    setFilters({ responsibles: [], tools: [] });
  };

  if (!activity) {
    return (
      <div className="workflow-d3-container">
        <p style={{ color: '#ef4444', padding: '20px' }}>
          No activity found in the loaded data.
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
        onImport={() => setShowImporter(true)}
      />

      <div className="svg-container">
        <WorkflowCanvas activity={activity} filters={filters} />
      </div>

      {showImporter && (
        <JsonImporter
          onImport={handleImport}
          onClose={() => setShowImporter(false)}
        />
      )}
    </div>
  );
};

export default App;
