import React, { useEffect, useRef, useState } from 'react';
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

/**
 * 大会終了の書き込みがこの時間で終わらなければ「まだ送信できていない」と知らせる (ミリ秒)。
 *
 * 圏外だとFirestoreは書き込みを端末内のキューに溜めるだけなので、画面上は
 * 終了していてもサーバーには反映されない。道場は電波が弱く、その場を離れる直前の
 * 操作でもあるため、同期バーの警告(15秒)より短くして早めに気づけるようにしている。
 */
const FINISH_SEND_TIMEOUT_MS = 5000;

/** 保存できたことを知らせるトーストを消すまでの時間 (ミリ秒) */
const FINISH_SAVED_NOTICE_MS = 4000;

/** 大会終了の送信結果。null は「知らせることが無い」 */
type FinishNotice = 'saved' | 'unsent';

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
  const [finishNotice, setFinishNotice] = useState<FinishNotice | null>(null);

  /*
   * 大会終了の送信を待っている「今の」操作を表す番号。
   *
   * 圏外だと送信のPromiseは数分〜帰宅後まで解決しない。その間に利用者が
   * 知らせを閉じたり、ログアウトして別の保存先に切り替えたりすると、
   * 後から解決したPromiseが無関係な画面にモーダルを割り込ませてしまう。
   * 番号が変わっていたら、その結果はもう用済みとして捨てる。
   */
  const finishRequestRef = useRef(0);

  const dismissFinishNotice = () => {
    finishRequestRef.current += 1;
    setFinishNotice(null);
  };

  // ログインが成立したらログイン画面を閉じる
  useEffect(() => {
    if (status === 'signedIn') setShowLogin(false);
  }, [status]);

  // 保存先が変わると、前の保存先への送信結果は今の画面と無関係になる
  useEffect(() => {
    dismissFinishNotice();
  }, [storageKind]);

  // 成功の知らせは自動で消す。未送信の警告は気づかれないと困るので消さない
  useEffect(() => {
    if (finishNotice !== 'saved') return;
    const timer = window.setTimeout(() => setFinishNotice(null), FINISH_SAVED_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [finishNotice]);

  const showConfirm = (config: ModalConfig) => setModalConfig(config);
  const closeModal = () => setModalConfig(null);

  const handleFinishCompetition = () => {
    showConfirm({
      title: '大会を終了しますか？',
      message: '・記録が大会履歴に保存されます\n・通算成績に反映されます\n・以降この大会の記録は編集できません\n・大会作成画面に戻り、次の大会を作成できます\n\n※記録は削除されません。消したい場合はデータ管理から削除してください',
      confirmLabel: '終了する',
      onConfirm: () => {
        const sent = finishCompetition();
        setCurrentView('setup');
        closeModal();

        // この端末に保存するモードでは送信という段階が無い。
        // 書き込みは同期的に終わるので、知らせる必要も無い
        if (storageKind !== 'cloud') return;

        // 届くのを待ちつつ、待たされるようなら先に知らせる。
        // 待ち切ってから知らせるのでは、圏外のときに何分も無言になってしまう
        const requestId = ++finishRequestRef.current;
        const timer = window.setTimeout(() => {
          if (finishRequestRef.current !== requestId) return;
          setFinishNotice('unsent');
        }, FINISH_SEND_TIMEOUT_MS);
        void sent.then((ok) => {
          window.clearTimeout(timer);
          if (finishRequestRef.current !== requestId) return;
          // 遅れて届いた場合はここで警告が成功の知らせに置き換わる
          setFinishNotice(ok ? 'saved' : 'unsent');
        });
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
        <h1>射会記録アプリ</h1>
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

      {/* 未送信はモーダルで出す。トーストでは見落とされるうえ、
          そのまま道場を離れると他の端末には終了していないままに見える */}
      {finishNotice === 'unsent' && (
        <ConfirmModal
          isOpen={true}
          title="⚠️ まだ送信できていません"
          message={'大会は終了し、記録はこの端末に保存されました。\nただし通信が届いていないため、まだサーバーに送信できていません。\n\n帰宅後など電波の届く場所でこのページを開けば、自動で送信されます。\nそれまでは他の端末から見ると、終了していないままに見えます。\n\n送信が終わるまで、この端末のブラウザのデータを消さないでください。'}
          confirmLabel="わかりました"
          hideCancel
          onConfirm={dismissFinishNotice}
          onCancel={dismissFinishNotice}
        />
      )}

      {finishNotice === 'saved' && (
        <div className="finish-notice" role="status">
          ✅ 大会を終了し、保存しました
        </div>
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
