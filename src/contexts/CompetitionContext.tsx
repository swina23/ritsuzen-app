import React, { createContext, useContext, useReducer, ReactNode, useEffect } from 'react';
import { Competition, CompetitionState, Participant } from '../types';
import { initializeParticipantRecord, updateParticipantRecord, calculateRankings } from '../utils/calculations';
import { storageManager } from '../utils/StorageManager';
import { useAuth } from './AuthContext';
import { LocalStorageBackend } from '../lib/storage/LocalStorageBackend';
import type { StorageBackend } from '../lib/storage/StorageBackend';
import { generateCompetitionId, generateParticipantId } from '../utils/idGeneration';
import { DEFAULT_ROUNDS_COUNT } from '../utils/constants';
import { normalizeCompetition } from '../utils/competitionMigration';
import { moveParticipantUp as moveUp, moveParticipantDown as moveDown } from '../utils/arrayUtils';
import { applyAutoGrouping as autoGroup, moveParticipantToGroup as moveToGroup, clearGrouping as clearGroup } from '../utils/grouping';

interface CompetitionContextType {
  state: CompetitionState;
  createCompetition: (name: string, date: string, handicapEnabled: boolean, enableRotation: boolean, roundsCount?: number) => void;
  addParticipant: (participant: Omit<Participant, 'id' | 'order'>) => void;
  removeParticipant: (participantId: string) => void;
  moveParticipantUp: (participantId: string) => void;
  moveParticipantDown: (participantId: string) => void;
  reorderParticipants: (participants: Participant[]) => void;
  applyAutoGrouping: (groupSize: number) => void;
  moveParticipantToGroup: (participantId: string, direction: 'up' | 'down') => void;
  clearGrouping: () => void;
  updateShot: (participantId: string, roundNumber: number, shotIndex: number, hit: boolean | null) => void;
  finishCompetition: () => void;
}

type CompetitionAction =
  | { type: 'CREATE_COMPETITION'; payload: { name: string; date: string; handicapEnabled: boolean; enableRotation: boolean; roundsCount?: number } }
  | { type: 'ADD_PARTICIPANT'; payload: Omit<Participant, 'id' | 'order'> }
  | { type: 'REMOVE_PARTICIPANT'; payload: string }
  | { type: 'MOVE_PARTICIPANT_UP'; payload: string }
  | { type: 'MOVE_PARTICIPANT_DOWN'; payload: string }
  | { type: 'REORDER_PARTICIPANTS'; payload: Participant[] }
  | { type: 'APPLY_AUTO_GROUPING'; payload: number }
  | { type: 'MOVE_PARTICIPANT_TO_GROUP'; payload: { participantId: string; direction: 'up' | 'down' } }
  | { type: 'CLEAR_GROUPING' }
  | { type: 'UPDATE_SHOT'; payload: { participantId: string; roundNumber: number; shotIndex: number; hit: boolean | null } }
  | { type: 'CLEAR_CURRENT_COMPETITION' }
  | { type: 'RESET_FOR_BACKEND_SWITCH' }
  | { type: 'LOAD_COMPETITION'; payload: Competition | null };

const initialState: CompetitionState = {
  competition: null,
  currentRound: 1,
  currentParticipant: 0,
  // Firestoreからの初回読み込みが終わるまでは、まだ「大会なし」と断定できない
  loading: true
};

const CompetitionContext = createContext<CompetitionContextType | undefined>(undefined);

const competitionReducer = (state: CompetitionState, action: CompetitionAction): CompetitionState => {
  switch (action.type) {
    case 'CREATE_COMPETITION': {
      const { name, date, handicapEnabled, enableRotation, roundsCount = DEFAULT_ROUNDS_COUNT } = action.payload;
      const competition: Competition = {
        id: generateCompetitionId(),
        name,
        date,
        type: '20',
        status: 'created',
        handicapEnabled,
        enableRotation,
        roundsCount,
        participants: [],
        records: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      return {
        ...state,
        competition
      };
    }

    case 'ADD_PARTICIPANT': {
      if (!state.competition) return state;
      
      const nextOrder = Math.max(0, ...state.competition.participants.map(p => p.order || 0)) + 1;
      const participant: Participant = {
        ...action.payload,
        id: generateParticipantId(),
        order: nextOrder
      };
      
      const record = initializeParticipantRecord(participant, state.competition.roundsCount);
      
      return {
        ...state,
        competition: {
          ...state.competition,
          participants: [...state.competition.participants, participant],
          records: [...state.competition.records, record],
          updatedAt: new Date().toISOString()
        }
      };
    }

    case 'REMOVE_PARTICIPANT': {
      if (!state.competition) return state;
      
      const participantId = action.payload;
      return {
        ...state,
        competition: {
          ...state.competition,
          participants: state.competition.participants.filter(p => p.id !== participantId),
          records: state.competition.records.filter(r => r.participantId !== participantId),
          updatedAt: new Date().toISOString()
        }
      };
    }

    case 'MOVE_PARTICIPANT_UP': {
      if (!state.competition) return state;
      
      const participantId = action.payload;
      const reorderedParticipants = moveUp(state.competition.participants, participantId);
      
      return {
        ...state,
        competition: {
          ...state.competition,
          participants: reorderedParticipants,
          updatedAt: new Date().toISOString()
        }
      };
    }

    case 'MOVE_PARTICIPANT_DOWN': {
      if (!state.competition) return state;

      const participantId = action.payload;
      const reorderedParticipants = moveDown(state.competition.participants, participantId);

      return {
        ...state,
        competition: {
          ...state.competition,
          participants: reorderedParticipants,
          updatedAt: new Date().toISOString()
        }
      };
    }

    case 'REORDER_PARTICIPANTS': {
      if (!state.competition) return state;

      // 新しい順序でorderフィールドを更新
      const reorderedParticipants = action.payload.map((p, index) => ({
        ...p,
        order: index + 1
      }));

      return {
        ...state,
        competition: {
          ...state.competition,
          participants: reorderedParticipants,
          updatedAt: new Date().toISOString()
        }
      };
    }

    case 'APPLY_AUTO_GROUPING': {
      if (!state.competition) return state;

      const groupSize = action.payload;
      const groupedParticipants = autoGroup(state.competition.participants, groupSize);

      return {
        ...state,
        competition: {
          ...state.competition,
          participants: groupedParticipants,
          updatedAt: new Date().toISOString()
        }
      };
    }

    case 'MOVE_PARTICIPANT_TO_GROUP': {
      if (!state.competition) return state;

      const { participantId, direction } = action.payload;
      const regroupedParticipants = moveToGroup(state.competition.participants, participantId, direction);

      return {
        ...state,
        competition: {
          ...state.competition,
          participants: regroupedParticipants,
          updatedAt: new Date().toISOString()
        }
      };
    }

    case 'CLEAR_GROUPING': {
      if (!state.competition) return state;

      const clearedParticipants = clearGroup(state.competition.participants);

      return {
        ...state,
        competition: {
          ...state.competition,
          participants: clearedParticipants,
          updatedAt: new Date().toISOString()
        }
      };
    }

    case 'UPDATE_SHOT': {
      if (!state.competition) return state;
      
      const { participantId, roundNumber, shotIndex, hit } = action.payload;
      
      const updatedRecords = state.competition.records.map(record => {
        if (record.participantId === participantId) {
          const updatedRounds = record.rounds.map(round => {
            if (round.roundNumber === roundNumber) {
              const updatedShots = round.shots.map((shot, index) => 
                index === shotIndex ? { hit } : shot
              );
              return { ...round, shots: updatedShots };
            }
            return round;
          });
          
          const updatedRecord = updateParticipantRecord({ ...record, rounds: updatedRounds });
          return updatedRecord;
        }
        return record;
      });

      // 順位を再計算
      const rankedRecords = calculateRankings(updatedRecords);
      
      return {
        ...state,
        competition: {
          ...state.competition,
          records: rankedRecords,
          status: 'inProgress',
          updatedAt: new Date().toISOString()
        }
      };
    }

    case 'CLEAR_CURRENT_COMPETITION': {
      // initialStateをそのまま返すとloadingがtrueに戻ってしまう
      return { ...initialState, loading: false };
    }

    case 'RESET_FOR_BACKEND_SWITCH': {
      /**
       * 保存先の切り替え(ログイン・ログアウト)に伴う初期化。
       *
       * competition を落として loading に戻すのが肝。ここを残すと、
       * 切り替え後の画面に古い保存先のデータが残ったままになり、
       * 次の入力で**別の保存先へ書き込まれる**（ローカル⇄クラウドをまたぐため、
       * 単なる上書きではなく別のデータ領域への混入になる）。
       * loading:true の間は保存用effectが止まり、画面も読み込み中表示になる。
       */
      return initialState;
    }

    case 'LOAD_COMPETITION': {
      if (!action.payload) {
        return {
          ...state,
          competition: null,
          loading: false
        };
      }

      // 既存データのマイグレーション(order / roundsCount / enableRotation の補完)。
      // 履歴・通算集計の読み込み経路と同じ関数を通す。
      return {
        ...state,
        competition: normalizeCompetition(action.payload),
        loading: false
      };
    }

    default:
      return state;
  }
};

export const CompetitionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(competitionReducer, initialState);
  const { status } = useAuth();

  /**
   * 認証状態から保存先を決めて購読を開始し、初回スナップショットが揃ってから読み込む。
   *
   *   signedOut / unauthorized → ローカル保存（無料モード）
   *   signedIn                 → クラウド保存
   *
   * 保存先の生成・注入・切り替えはこのProviderが一手に引き受ける
   * （AuthContextは認証状態だけを持ち、storageManagerには触らない）。
   */
  useEffect(() => {
    // 認証状態が確定するまでは保存先を決められない。loading表示のまま待つ
    if (status === 'loading') return;

    // 保存先の切り替えは React state のリセットと**不可分**。
    // これを先に同期的に行わないと、切り替え前の大会が切り替え後の保存先へ
    // 書き込まれる経路が開く（RESET_FOR_BACKEND_SWITCH のコメント参照）。
    dispatch({ type: 'RESET_FOR_BACKEND_SWITCH' });

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    /**
     * 旧版は大会を終了しても「現在の大会」ポインタが残り、リセットするまで
     * 次の大会を作れなかった。そのデータをそのまま読み込むと、リセットボタンを
     * 撤去した現在は終了済みの大会から抜け出せなくなるため、ここで降ろす。
     */
    const loadCurrent = () => {
      const current = storageManager.loadCurrentCompetition();
      if (current?.status === 'finished') {
        storageManager.releaseCurrentCompetition();
        dispatch({ type: 'LOAD_COMPETITION', payload: null });
        return;
      }
      dispatch({ type: 'LOAD_COMPETITION', payload: current });
    };

    const begin = (backend: StorageBackend) => {
      // 動的importの解決を待つ間に認証状態が変わっていたら、使わずに捨てる
      if (cancelled) {
        backend.dispose();
        return;
      }
      storageManager.initialize(backend);

      // ローカル保存は初回スナップショットを同期的に流すため、ここで既に真になる
      if (storageManager.isReady()) {
        loadCurrent();
        return;
      }

      unsubscribe = storageManager.subscribe(() => {
        if (!storageManager.isReady()) return;
        unsubscribe?.();
        unsubscribe = undefined;
        loadCurrent();
      });
    };

    if (status === 'signedIn') {
      // Firebaseは初期バンドルとしては重く、無料モードでは一切使わない。
      // また src/lib/firebase.ts は環境変数が無いと読み込み時にthrowするため、
      // 静的importのままだとFirebase未設定の環境でアプリが起動しなくなる。
      import('../lib/storage/FirestoreBackend')
        .then(({ FirestoreBackend }) => begin(new FirestoreBackend()))
        .catch((error) => {
          console.error('[CompetitionContext] クラウド保存の初期化に失敗しました:', error);
          // 保存先が無いままでは何も表示できないので、ローカルに退避する
          if (!cancelled) begin(new LocalStorageBackend());
        });
    } else {
      begin(new LocalStorageBackend());
    }

    return () => {
      cancelled = true;
      unsubscribe?.();
      storageManager.dispose();
    };
  }, [status]);

  // 大会データが変更されるたびにFirestoreへ保存。
  // 読み込み完了前に走らせると、まだ空のstateで既存データを上書きしてしまう。
  useEffect(() => {
    if (state.loading) return;
    if (state.competition) {
      storageManager.saveCurrentCompetition(state.competition);
    }
  }, [state.competition, state.loading]);

  const createCompetition = (name: string, date: string, handicapEnabled: boolean, enableRotation: boolean, roundsCount: number = DEFAULT_ROUNDS_COUNT) => {
    dispatch({ type: 'CREATE_COMPETITION', payload: { name, date, handicapEnabled, enableRotation, roundsCount } });
  };

  const addParticipant = (participant: Omit<Participant, 'id' | 'order'>) => {
    dispatch({ type: 'ADD_PARTICIPANT', payload: participant });
  };

  const removeParticipant = (participantId: string) => {
    dispatch({ type: 'REMOVE_PARTICIPANT', payload: participantId });
  };

  const moveParticipantUp = (participantId: string) => {
    dispatch({ type: 'MOVE_PARTICIPANT_UP', payload: participantId });
  };

  const moveParticipantDown = (participantId: string) => {
    dispatch({ type: 'MOVE_PARTICIPANT_DOWN', payload: participantId });
  };

  const reorderParticipants = (participants: Participant[]) => {
    dispatch({ type: 'REORDER_PARTICIPANTS', payload: participants });
  };

  const applyAutoGrouping = (groupSize: number) => {
    dispatch({ type: 'APPLY_AUTO_GROUPING', payload: groupSize });
  };

  const moveParticipantToGroup = (participantId: string, direction: 'up' | 'down') => {
    dispatch({ type: 'MOVE_PARTICIPANT_TO_GROUP', payload: { participantId, direction } });
  };

  const clearGrouping = () => {
    dispatch({ type: 'CLEAR_GROUPING' });
  };

  const updateShot = (participantId: string, roundNumber: number, shotIndex: number, hit: boolean | null) => {
    dispatch({ type: 'UPDATE_SHOT', payload: { participantId, roundNumber, shotIndex, hit } });
  };

  /**
   * 大会を終了して「現在の大会」から降ろす。記録は履歴・通算成績に残る。
   *
   * 状態を finished にしたまま画面に残すと、次の大会を作るために別途
   * 「降ろす」操作(旧リセットボタン)が必要になり分かりにくかったため、
   * 終了と片付けを1つの操作にまとめている。
   */
  const finishCompetition = () => {
    if (!state.competition) return;

    const finished: Competition = {
      ...state.competition,
      status: 'finished',
      updatedAt: new Date().toISOString()
    };

    // state.competition が null になるので保存用effectは走らない。
    // 終了状態の書き込みとポインタ解除はここでまとめて行う。
    storageManager.finishCurrentCompetition(finished);
    dispatch({ type: 'CLEAR_CURRENT_COMPETITION' });
  };

  return (
    <CompetitionContext.Provider value={{
      state,
      createCompetition,
      addParticipant,
      removeParticipant,
      moveParticipantUp,
      moveParticipantDown,
      reorderParticipants,
      applyAutoGrouping,
      moveParticipantToGroup,
      clearGrouping,
      updateShot,
      finishCompetition
    }}>
      {children}
    </CompetitionContext.Provider>
  );
};

export const useCompetition = () => {
  const context = useContext(CompetitionContext);
  if (context === undefined) {
    throw new Error('useCompetition must be used within a CompetitionProvider');
  }
  return context;
};