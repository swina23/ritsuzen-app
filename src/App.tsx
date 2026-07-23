import React, { useEffect, useState } from 'react';
import { CompetitionProvider, useCompetition } from './contexts/CompetitionContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginScreen from './components/LoginScreen';
import CompetitionSetup from './components/CompetitionSetup';
import ParticipantSetup from './components/ParticipantSetup';
import ScoreInput from './components/ScoreInput';
import Results from './components/Results';
import CareerStats from './components/CareerStats';
import DataManager from './components/DataManager';
import ErrorBoundary from './components/ErrorBoundary';
import CompetitionErrorBoundary from './components/error-boundaries/CompetitionErrorBoundary';
import DataErrorBoundary from './components/error-boundaries/DataErrorBoundary';
import ConfirmModal from './components/ConfirmModal';
import SyncStatusBar from './components/SyncStatusBar';
import { useStorageKind } from './hooks/useStorage';
import { createErrorReport, saveErrorReport } from './utils/errorUtils';
import './App.css';

declare const __APP_VERSION__: string;
const VERSION = __APP_VERSION__;

// クラウド版(ritsuzen-app2)でのみバッジを表示し、旧版と見分けられるようにする
const IS_CLOUD = import.meta.env.VITE_APP_VARIANT === 'cloud';

type AppView = 'setup' | 'participants' | 'scoring' | 'results' | 'career' | 'data';

/** 進行中の大会が無くても開けるタブ（過去の記録を見るため） */
const VIEWS_WITHOUT_COMPETITION: AppView[] = ['career', 'data'];

/**
 * 「大会終了」ボタンを出さないタブ。
 * 現在の大会に対する操作なので、大会と関係ない画面に置くと
 * 何に対する終了なのか分からず紛らわしい。
 * 参加者設定タブは画面内に専用の操作があるため除外している。
 */
const VIEWS_WITHOUT_COMPETITION_ACTIONS: AppView[] = ['participants', 'career', 'data'];

type ModalConfig = {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
};

const AppContent: React.FC = () => {
  const { state, finishCompetition } = useCompetition();
  const { status, user, logOut } = useAuth();
  const storageKind = useStorageKind();
  const [currentView, setCurrentView] = useState<AppView>('setup');
  const [modalConfig, setModalConfig] = useState<ModalConfig | null>(null);
  const [showLogin, setShowLogin] = useState(false);

  // ログインが成立したらログイン画面を閉じる
  useEffect(() => {
    if (status === 'signedIn') setShowLogin(false);
  }, [status]);

  const showConfirm = (config: ModalConfig) => setModalConfig(config);
  const closeModal = () => setModalConfig(null);

  const handleFinishCompetition = () => {
    showConfirm({
      title: '大会を終了しますか？',
      message: '・記録が大会履歴に保存されます\n・通算成績に反映されます\n・以降この大会の記録は編集できません\n・大会作成画面に戻り、次の大会を作成できます\n\n※記録は削除されません。消したい場合はデータ管理から削除してください',
      confirmLabel: '終了する',
      onConfirm: () => {
        finishCompetition();
        setCurrentView('setup');
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
    // Firestoreの初回読み込み中に「大会なし」と決めつけると、
    // 進行中の大会があるのに一瞬だけ新規作成画面が出てしまう
    if (state.loading) {
      return <div className="auth-loading">データを読み込み中…</div>;
    }

    if (!state.competition && !VIEWS_WITHOUT_COMPETITION.includes(currentView)) {
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
      case 'career':
        return (
          <CompetitionErrorBoundary section="results" onError={handleError}>
            <CareerStats />
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
        <h1>
          射会記録アプリ
          {IS_CLOUD && <span className="app-variant">クラウド版</span>}
        </h1>
        <span className="app-version">v{VERSION}</span>
        <div className="app-account">
          {storageKind && (
            <span className={`storage-mode storage-mode--${storageKind}`}>
              {storageKind === 'cloud' ? '☁️ クラウド保存' : '📱 この端末に保存'}
            </span>
          )}
          {status === 'signedIn' ? (
            <>
              <span className="app-account-email">{user?.email}</span>
              <button className="logout-btn" onClick={logOut}>ログアウト</button>
            </>
          ) : (
            <button className="logout-btn" onClick={() => setShowLogin(true)}>
              {status === 'unauthorized' ? '⚠️ 未登録のアカウント' : 'クラウド保存を使う'}
            </button>
          )}
        </div>
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

      <SyncStatusBar />

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
          onClick={() => setCurrentView('career')}
          className={currentView === 'career' ? 'active' : ''}
        >
          通算成績
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

      {state.competition && state.competition.status !== 'finished'
        && !VIEWS_WITHOUT_COMPETITION_ACTIONS.includes(currentView) && (
        <div className="app-actions">
          <button
            onClick={handleFinishCompetition}
            className="finish-btn"
            disabled={!canProceedToScoring}
          >
            大会終了
          </button>
        </div>
      )}

      {showLogin && <LoginScreen onClose={() => setShowLogin(false)} />}

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
      showDetails={import.meta.env.DEV}
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
      {/*
        ログインは必須ではない。未ログインならこの端末に保存する無料モードで
        全機能が使え、ログインするとクラウド保存に切り替わる。
        保存先の選択は CompetitionProvider が認証状態から決めるため、
        AuthProvider の内側に置く必要がある。
      */}
      <AuthProvider>
        <CompetitionProvider>
          <AppContent />
        </CompetitionProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
