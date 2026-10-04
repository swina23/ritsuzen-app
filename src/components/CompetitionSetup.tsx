import React, { useState } from 'react';
import { useCompetition } from '../contexts/CompetitionContext';
import { DEFAULT_FINAL_BELL_SECONDS, ROUNDS_OPTIONS, WARNING_BELL_OFFSET_SECONDS } from '../utils/constants';
import { getTodayJapaneseDate } from '../utils/dateUtils';

const CompetitionSetup: React.FC = () => {
  const { state, createCompetition } = useCompetition();
  const [name, setName] = useState('');
  // toISOString()はUTCになるため、朝9時前に大会を作ると前日の日付になってしまう
  const [date, setDate] = useState(getTodayJapaneseDate());
  const [handicapEnabled, setHandicapEnabled] = useState(true);
  const [enableRotation, setEnableRotation] = useState(true);
  const [roundsCount, setRoundsCount] = useState(5);
  const [finalBellMinutes, setFinalBellMinutes] = useState(Math.floor(DEFAULT_FINAL_BELL_SECONDS / 60));
  const [finalBellSecondsPart, setFinalBellSecondsPart] = useState(DEFAULT_FINAL_BELL_SECONDS % 60);

  const finalBellSeconds = finalBellMinutes * 60 + finalBellSecondsPart;
  // 予鈴が0秒以下になる設定は計時の意味をなさない
  const isFinalBellValid = finalBellSeconds > WARNING_BELL_OFFSET_SECONDS;

  const hasActiveCompetition = state.competition !== null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasActiveCompetition && isFinalBellValid) {
      createCompetition(name, date, handicapEnabled, enableRotation, roundsCount, finalBellSeconds);
    }
  };

  return (
    <div className="competition-setup">
      <h2>大会作成</h2>
      
      {hasActiveCompetition && (
        <div className="active-competition-warning">
          <p>⚠️ 現在大会が進行中です。</p>
          <p>「{state.competition?.name}」</p>
          <p>新しい大会を作成するには、現在の大会を終了してください。</p>
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
          <label htmlFor="final-bell-minutes">本鈴:</label>
          <div className="bell-time-inputs">
            <input
              id="final-bell-minutes"
              type="number"
              inputMode="numeric"
              min={0}
              max={59}
              value={finalBellMinutes}
              onChange={(e) => setFinalBellMinutes(Math.min(59, Math.max(0, Math.floor(Number(e.target.value) || 0))))}
              disabled={hasActiveCompetition}
            />
            <span>分</span>
            <input
              id="final-bell-seconds"
              type="number"
              inputMode="numeric"
              min={0}
              max={59}
              aria-label="本鈴の秒"
              value={finalBellSecondsPart}
              onChange={(e) => setFinalBellSecondsPart(Math.min(59, Math.max(0, Math.floor(Number(e.target.value) || 0))))}
              disabled={hasActiveCompetition}
            />
            <span>秒</span>
          </div>
          {isFinalBellValid ? (
            <small className="bell-time-note">
              予鈴は本鈴の{WARNING_BELL_OFFSET_SECONDS}秒前
            </small>
          ) : (
            <small className="bell-time-note error">
              本鈴は{WARNING_BELL_OFFSET_SECONDS}秒より長くしてください
            </small>
          )}
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
            立順ローテーションを有効にする
          </label>
        </div>

        <button
          type="submit"
          className="create-btn"
          disabled={hasActiveCompetition || !isFinalBellValid}
          title={hasActiveCompetition ? '現在の大会を終了してから新規作成してください' : ''}
        >
          大会を作成
        </button>
      </form>
    </div>
  );
};

export default CompetitionSetup;