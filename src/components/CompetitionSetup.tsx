import React, { useState } from 'react';
import { useCompetition } from '../contexts/CompetitionContext';

const CompetitionSetup: React.FC = () => {
  const { createCompetition } = useCompetition();
  const [name, setName] = useState('立禅の会');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [handicapEnabled, setHandicapEnabled] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createCompetition(name, date, handicapEnabled);
  };

  return (
    <div className="competition-setup">
      <h2>大会作成</h2>
      <form onSubmit={handleSubmit} className="setup-form">
        <div className="form-group">
          <label htmlFor="name">大会名:</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="date">開催日:</label>
          <input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={handicapEnabled}
              onChange={(e) => setHandicapEnabled(e.target.checked)}
            />
            ハンデ機能を有効にする
          </label>
        </div>
        
        <button type="submit" className="create-btn">
          大会を作成
        </button>
      </form>
    </div>
  );
};

export default CompetitionSetup;