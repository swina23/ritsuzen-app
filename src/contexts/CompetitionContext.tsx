import React, { createContext, useContext, useReducer, ReactNode, useEffect } from 'react';
import { Competition, CompetitionState, Participant } from '../types';
import { initializeParticipantRecord, updateParticipantRecord, calculateRankings } from '../utils/calculations';
import { saveCurrentCompetition, loadCurrentCompetition, saveCompetitionToHistory } from '../utils/localStorage';

interface CompetitionContextType {
  state: CompetitionState;
  createCompetition: (name: string, date: string, handicapEnabled: boolean, roundsCount?: number) => void;
  addParticipant: (participant: Omit<Participant, 'id' | 'order'>) => void;
  removeParticipant: (participantId: string) => void;
  moveParticipantUp: (participantId: string) => void;
  moveParticipantDown: (participantId: string) => void;
  updateShot: (participantId: string, roundNumber: number, shotIndex: number, hit: boolean | null) => void;
  finishCompetition: () => void;
  resetCompetition: () => void;
}

type CompetitionAction =
  | { type: 'CREATE_COMPETITION'; payload: { name: string; date: string; handicapEnabled: boolean; roundsCount?: number } }
  | { type: 'ADD_PARTICIPANT'; payload: Omit<Participant, 'id' | 'order'> }
  | { type: 'REMOVE_PARTICIPANT'; payload: string }
  | { type: 'MOVE_PARTICIPANT_UP'; payload: string }
  | { type: 'MOVE_PARTICIPANT_DOWN'; payload: string }
  | { type: 'UPDATE_SHOT'; payload: { participantId: string; roundNumber: number; shotIndex: number; hit: boolean | null } }
  | { type: 'FINISH_COMPETITION' }
  | { type: 'RESET_COMPETITION' }
  | { type: 'LOAD_COMPETITION'; payload: Competition | null };

const initialState: CompetitionState = {
  competition: null,
  currentRound: 1,
  currentParticipant: 0
};

const CompetitionContext = createContext<CompetitionContextType | undefined>(undefined);

const competitionReducer = (state: CompetitionState, action: CompetitionAction): CompetitionState => {
  switch (action.type) {
    case 'CREATE_COMPETITION': {
      const { name, date, handicapEnabled, roundsCount = 5 } = action.payload;
      const competition: Competition = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name,
        date,
        type: '20',
        status: 'created',
        handicapEnabled,
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
      // 一意のIDを生成
      const timestamp = Date.now();
      const random1 = Math.random().toString(36).substr(2, 9);
      const random2 = Math.random().toString(36).substr(2, 9);
      const counter = Math.floor(Math.random() * 1000000);
      const generatedId = `${timestamp}-${random1}-${random2}-${counter}`;
      
      const participant: Participant = {
        ...action.payload,
        id: generatedId,
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
      const sortedParticipants = [...state.competition.participants].sort((a, b) => (a.order || 0) - (b.order || 0));
      const currentIndex = sortedParticipants.findIndex(p => p.id === participantId);
      
      if (currentIndex <= 0) return state; // Already at top
      
      // Swap positions in array
      [sortedParticipants[currentIndex], sortedParticipants[currentIndex - 1]] = 
      [sortedParticipants[currentIndex - 1], sortedParticipants[currentIndex]];
      
      // Reassign order values sequentially
      const reorderedParticipants = sortedParticipants.map((participant, index) => ({
        ...participant,
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

    case 'MOVE_PARTICIPANT_DOWN': {
      if (!state.competition) return state;
      
      const participantId = action.payload;
      const sortedParticipants = [...state.competition.participants].sort((a, b) => (a.order || 0) - (b.order || 0));
      const currentIndex = sortedParticipants.findIndex(p => p.id === participantId);
      
      if (currentIndex >= sortedParticipants.length - 1) return state; // Already at bottom
      
      // Swap positions in array
      [sortedParticipants[currentIndex], sortedParticipants[currentIndex + 1]] = 
      [sortedParticipants[currentIndex + 1], sortedParticipants[currentIndex]];
      
      // Reassign order values sequentially
      const reorderedParticipants = sortedParticipants.map((participant, index) => ({
        ...participant,
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

    case 'FINISH_COMPETITION': {
      if (!state.competition) return state;
      
      return {
        ...state,
        competition: {
          ...state.competition,
          status: 'finished',
          updatedAt: new Date().toISOString()
        }
      };
    }

    case 'RESET_COMPETITION': {
      return initialState;
    }

    case 'LOAD_COMPETITION': {
      if (!action.payload) {
        return {
          ...state,
          competition: null
        };
      }

      // 既存データのマイグレーション: orderフィールドが欠けている場合は追加
      const migratedParticipants = action.payload.participants.map((participant, index) => ({
        ...participant,
        order: participant.order !== undefined ? participant.order : index + 1
      }));

      return {
        ...state,
        competition: {
          ...action.payload,
          participants: migratedParticipants,
          roundsCount: action.payload.roundsCount !== undefined ? action.payload.roundsCount : 5
        }
      };
    }

    default:
      return state;
  }
};

export const CompetitionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(competitionReducer, initialState);

  // アプリ起動時にLocalStorageからデータを読み込み
  useEffect(() => {
    const savedCompetition = loadCurrentCompetition();
    if (savedCompetition) {
      dispatch({ type: 'LOAD_COMPETITION', payload: savedCompetition });
    }
  }, []);

  // 大会データが変更されるたびにLocalStorageに保存
  useEffect(() => {
    if (state.competition) {
      saveCurrentCompetition(state.competition);
    }
  }, [state.competition]);

  const createCompetition = (name: string, date: string, handicapEnabled: boolean, roundsCount: number = 5) => {
    dispatch({ type: 'CREATE_COMPETITION', payload: { name, date, handicapEnabled, roundsCount } });
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

  const updateShot = (participantId: string, roundNumber: number, shotIndex: number, hit: boolean | null) => {
    dispatch({ type: 'UPDATE_SHOT', payload: { participantId, roundNumber, shotIndex, hit } });
  };

  const finishCompetition = () => {
    if (window.confirm('🏁 大会を終了しますか？\n\n・記録の編集ができなくなります\n・参加者の追加・変更ができなくなります\n・大会履歴に保存されます\n\n※終了後は変更できません')) {
      if (state.competition) {
        // 大会終了時に履歴に保存
        const finishedCompetition = {
          ...state.competition,
          status: 'finished' as const,
          updatedAt: new Date().toISOString()
        };
        saveCompetitionToHistory(finishedCompetition);
      }
      dispatch({ type: 'FINISH_COMPETITION' });
    }
  };

  const resetCompetition = () => {
    if (window.confirm('🔄 現在の大会をリセットしますか？\n\n・現在の大会データが削除されます\n・過去の大会履歴は保持されます\n・大会設定画面に戻ります')) {
      // リセット時にLocalStorageもクリア
      saveCurrentCompetition(null);
      dispatch({ type: 'RESET_COMPETITION' });
    }
  };

  return (
    <CompetitionContext.Provider value={{
      state,
      createCompetition,
      addParticipant,
      removeParticipant,
      moveParticipantUp,
      moveParticipantDown,
      updateShot,
      finishCompetition,
      resetCompetition
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