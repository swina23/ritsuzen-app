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
import ConfirmModal from './components/ConfirmModal';
import { createErrorReport, saveErrorReport } from './utils/errorUtils';
import './App.css';

declare const __APP_VERSION__: string;
const VERSION = __APP_VERSION__;

type AppView = 'setup' | 'participants' | 'scoring' | 'results' | 'data';

type ModalConfig = {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
};

const AppContent: React.FC = () => {
  const { state, finishCompetition, resetCompetition } = useCompetition();
  const [currentView, setCurrentView] = useState<AppView>('setup');
  const [modalConfig, setModalConfig] = useState<ModalConfig | null>(null);

  const showConfirm = (config: ModalConfig) => setModalConfig(config);
  const closeModal = () => setModalConfig(null);

  const handleFinishCompetition = () => {
    showConfirm({
      title: '大会を終了しますか？',
      message: '・記録の編集ができなくなります\n・参加者の追加・変更ができなくなります\n・大会履歴に保存されます\n\n※終了後は変更できません',
      confirmLabel: '終了する',
      onConfirm: () => {
        finishCompetition();
        closeModal();
      },
    });
  };

  const handleResetCompetition = () => {
    showConfirm({
      title: '現在の大会をリセットしますか？',
      message: '・現在の大会データが削除されます\n・過去の大会履歴は保持されます\n・大会設定画面に戻ります',
      confirmLabel: 'リセット',
      danger: true,
      onConfirm: () => {
        resetCompetition();
        closeModal();
      },
    });
  };

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
        <h1>射会記録アプリ <span className="app-version">v{VERSION}</span></h1>
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
              onClick={handleFinishCompetition}
              className="finish-btn"
              disabled={!canProceedToScoring}
            >
              大会終了
            </button>
          )}
          <button
            onClick={handleResetCompetition}
            className="reset-btn"
          >
            リセット
          </button>
        </div>
      )}

      {modalConfig && (
        <ConfirmModal
          isOpen={true}
          title={modalConfig.title}
          message={modalConfig.message}
          confirmLabel={modalConfig.confirmLabel}
          danger={modalConfig.danger}
          onConfirm={modalConfig.onConfirm}
          onCancel={closeModal}
        />
      )}

      <footer className="app-footer">
        <p>© 2025 hirosetomohiko All rights reserved.</p>

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
