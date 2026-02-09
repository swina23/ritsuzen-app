import React, { useState } from 'react';
import { useCompetition } from '../contexts/CompetitionContext';
import { ROUNDS_OPTIONS } from '../utils/constants';

const CompetitionSetup: React.FC = () => {
  const { state, createCompetition } = useCompetition();
  const [name, setName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [handicapEnabled, setHandicapEnabled] = useState(true);
  const [enableRotation, setEnableRotation] = useState(true);
  const [roundsCount, setRoundsCount] = useState(5);

  const hasActiveCompetition = state.competition !== null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasActiveCompetition) {
      createCompetition(name, date, handicapEnabled, enableRotation, roundsCount);
    }
  };

  return (
    <div className="competition-setup">
      <h2>大会作成</h2>
      
      {hasActiveCompetition && (
        <div className="active-competition-warning">
          <p>⚠️ 現在大会が進行中です。</p>
          <p>「{state.competition?.name}」</p>
          <p>新しい大会を作成するには、現在の大会をリセットしてください。</p>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="setup-form">
        <div className="form-group">
          <label htmlFor="name">大会名:</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="大会名を入力してください"
            required
            disabled={hasActiveCompetition}
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
            disabled={hasActiveCompetition}
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="rounds">立数:</label>
          <select
            id="rounds"
            value={roundsCount}
            onChange={(e) => setRoundsCount(Number(e.target.value))}
            disabled={hasActiveCompetition}
          >
            {ROUNDS_OPTIONS.map(rounds => (
              <option key={rounds} value={rounds}>
                {rounds}立 ({rounds * 4}射)
              </option>
            ))}
          </select>
        </div>
        
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={handicapEnabled}
              onChange={(e) => setHandicapEnabled(e.target.checked)}
              disabled={hasActiveCompetition}
            />
            ハンデ機能を有効にする
          </label>
        </div>

        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={enableRotation}
              onChange={(e) => setEnableRotation(e.target.checked)}
              disabled={hasActiveCompetition}
            />
            射順ローテーションを有効にする
          </label>
        </div>

        <button
          type="submit"
          className="create-btn"
          disabled={hasActiveCompetition}
          title={hasActiveCompetition ? '現在の大会をリセットしてから新規作成してください' : ''}
        >
          大会を作成
        </button>
      </form>
    </div>
  );
};

export default CompetitionSetup;