import React, { useState } from 'react';
import { CompetitionProvider, useCompetition } from './contexts/CompetitionContext';
import CompetitionSetup from './components/CompetitionSetup';
import ParticipantSetup from './components/ParticipantSetup';
import ScoreInput from './components/ScoreInput';
import Results from './components/Results';
import DataManager from './components/DataManager';
import ErrorBoundary from './components/ErrorBoundary';
import CompetitionErrorBoundary from './components/error-boundaries/CompetitionErrorBoundary';
import DataErrorBoundary from './components/error-boundaries/DataErrorBoundary';
import { createErrorReport, saveErrorReport } from './utils/errorUtils';
import './App.css';

// package.jsonからバージョンを取得
const VERSION = '1.1.0';

type AppView = 'setup' | 'participants' | 'scoring' | 'results' | 'data';

const AppContent: React.FC = () => {
  const { state, finishCompetition, resetCompetition } = useCompetition();
  const [currentView, setCurrentView] = useState<AppView>('setup');

  // エラーハンドラー
  const handleError = (error: Error, errorInfo: any) => {
    const errorReport = createErrorReport(
      error,
      'boundary',
      `app-${currentView}`,
      errorInfo,
      {
        competitionId: state.competition?.id,
        participantCount: state.competition?.participants.length,
        currentAction: `viewing-${currentView}`
      }
    );
    saveErrorReport(errorReport);
  };

  const renderView = () => {
    if (!state.competition && currentView !== 'data') {
      return (
        <CompetitionErrorBoundary section="general" onError={handleError}>
          <CompetitionSetup />
        </CompetitionErrorBoundary>
      );
    }

    switch (currentView) {
      case 'setup':
        return (
          <CompetitionErrorBoundary section="general" onError={handleError}>
            <CompetitionSetup />
          </CompetitionErrorBoundary>
        );
      case 'participants':
        return (
          <CompetitionErrorBoundary section="participant-setup" onError={handleError}>
            <ParticipantSetup />
          </CompetitionErrorBoundary>
        );
      case 'scoring':
        return (
          <CompetitionErrorBoundary section="score-input" onError={handleError}>
            <ScoreInput />
          </CompetitionErrorBoundary>
        );
      case 'results':
        return (
          <CompetitionErrorBoundary section="results" onError={handleError}>
            <Results />
          </CompetitionErrorBoundary>
        );
      case 'data':
        return (
          <DataErrorBoundary operationType="general" onError={handleError}>
            <DataManager />
          </DataErrorBoundary>
        );
      default:
        return (
          <CompetitionErrorBoundary section="general" onError={handleError}>
            <CompetitionSetup />
          </CompetitionErrorBoundary>
        );
    }
  };

  const canProceedToScoring = state.competition && state.competition.participants.length > 0;

  return (
    <div className="app">
      <header className="app-header">
        <h1>立禅の会記録アプリ</h1>
        {state.competition && (
          <div className="competition-status">
            <span>{state.competition.name}</span>
            <span>({state.competition.date})</span>
            <span className={`status ${state.competition.status}`}>
              {state.competition.status === 'created' && '作成済み'}
              {state.competition.status === 'inProgress' && '進行中'}
              {state.competition.status === 'finished' && '終了'}
            </span>
          </div>
        )}
      </header>

      <nav className="app-nav">
        <button 
          onClick={() => setCurrentView('setup')}
          className={currentView === 'setup' ? 'active' : ''}
        >
          大会設定
        </button>
        <button 
          onClick={() => setCurrentView('participants')}
          className={currentView === 'participants' ? 'active' : ''}
          disabled={!state.competition}
        >
          参加者登録
        </button>
        <button 
          onClick={() => setCurrentView('scoring')}
          className={currentView === 'scoring' ? 'active' : ''}
          disabled={!canProceedToScoring}
        >
          記録入力
        </button>
        <button 
          onClick={() => setCurrentView('results')}
          className={currentView === 'results' ? 'active' : ''}
          disabled={!canProceedToScoring}
        >
          結果表示
        </button>
        <button 
          onClick={() => setCurrentView('data')}
          className={currentView === 'data' ? 'active' : ''}
        >
          データ管理
        </button>
      </nav>

      <main className="app-main">
        {renderView()}
      </main>

      {state.competition && currentView !== 'participants' && (
        <div className="app-actions">
          {state.competition.status !== 'finished' && (
            <button 
              onClick={finishCompetition}
              className="finish-btn"
              disabled={!canProceedToScoring}
            >
              大会終了
            </button>
          )}
          <button 
            onClick={resetCompetition}
            className="reset-btn"
          >
            リセット
          </button>
        </div>
      )}

      <footer className="app-footer">
        <p>© 2025 hirosetomohiko All rights reserved.</p>
        <p className="version">v{VERSION}</p>
      </footer>
    </div>
  );
};

function App() {
  return (
    <ErrorBoundary 
      showDetails={process.env.NODE_ENV === 'development'}
      onError={(error, errorInfo) => {
        const errorReport = createErrorReport(
          error,
          'boundary',
          'app-root',
          errorInfo
        );
        saveErrorReport(errorReport);
      }}
    >
      <CompetitionProvider>
        <AppContent />
      </CompetitionProvider>
    </ErrorBoundary>
  );
}

export default App;
