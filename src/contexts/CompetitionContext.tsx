import React, { createContext, useContext, useReducer, ReactNode, useEffect } from 'react';
import { Competition, CompetitionState, Participant } from '../types';
import { initializeParticipantRecord, updateParticipantRecord, calculateRankings } from '../utils/calculations';
import { storageManager } from '../utils/StorageManager';
import { generateCompetitionId, generateParticipantId } from '../utils/idGeneration';
import { DEFAULT_ROUNDS_COUNT } from '../utils/constants';
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
  resetCompetition: () => void;
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
          roundsCount: action.payload.roundsCount !== undefined ? action.payload.roundsCount : DEFAULT_ROUNDS_COUNT,
          enableRotation: action.payload.enableRotation !== undefined ? action.payload.enableRotation : true
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
    const savedCompetition = storageManager.loadCurrentCompetition();
    if (savedCompetition) {
      dispatch({ type: 'LOAD_COMPETITION', payload: savedCompetition });
    }
  }, []);

  // 大会データが変更されるたびにLocalStorageに保存
  useEffect(() => {
    if (state.competition) {
      storageManager.saveCurrentCompetition(state.competition);
    }
  }, [state.competition]);

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

  const finishCompetition = () => {
    if (state.competition) {
      // 大会終了時に履歴に保存
      const finishedCompetition = {
        ...state.competition,
        status: 'finished' as const,
        updatedAt: new Date().toISOString()
      };
      storageManager.saveCompetitionToHistory(finishedCompetition);
    }
    dispatch({ type: 'FINISH_COMPETITION' });
  };

  const resetCompetition = () => {
    // リセット時にLocalStorageもクリア
    storageManager.saveCurrentCompetition(null);
    dispatch({ type: 'RESET_COMPETITION' });
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