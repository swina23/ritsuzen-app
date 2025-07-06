import React, { createContext, useContext, useReducer, ReactNode, useEffect } from 'react';
import { Competition, CompetitionState, Participant, ParticipantRecord } from '../types';
import { initializeParticipantRecord, updateParticipantRecord, calculateRankings } from '../utils/calculations';
import { saveCurrentCompetition, loadCurrentCompetition, saveCompetitionToHistory } from '../utils/localStorage';

interface CompetitionContextType {
  state: CompetitionState;
  createCompetition: (name: string, date: string, handicapEnabled: boolean) => void;
  addParticipant: (participant: Omit<Participant, 'id'>) => void;
  removeParticipant: (participantId: string) => void;
  updateShot: (participantId: string, roundNumber: number, shotIndex: number, hit: boolean) => void;
  finishCompetition: () => void;
  resetCompetition: () => void;
}

type CompetitionAction =
  | { type: 'CREATE_COMPETITION'; payload: { name: string; date: string; handicapEnabled: boolean } }
  | { type: 'ADD_PARTICIPANT'; payload: Omit<Participant, 'id'> }
  | { type: 'REMOVE_PARTICIPANT'; payload: string }
  | { type: 'UPDATE_SHOT'; payload: { participantId: string; roundNumber: number; shotIndex: number; hit: boolean } }
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
      const { name, date, handicapEnabled } = action.payload;
      const competition: Competition = {
        id: Date.now().toString(),
        name,
        date,
        type: '20',
        status: 'created',
        handicapEnabled,
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
      
      const participant: Participant = {
        ...action.payload,
        id: Date.now().toString()
      };
      
      const record = initializeParticipantRecord(participant);
      
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
      return {
        ...state,
        competition: action.payload
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

  const createCompetition = (name: string, date: string, handicapEnabled: boolean) => {
    dispatch({ type: 'CREATE_COMPETITION', payload: { name, date, handicapEnabled } });
  };

  const addParticipant = (participant: Omit<Participant, 'id'>) => {
    dispatch({ type: 'ADD_PARTICIPANT', payload: participant });
  };

  const removeParticipant = (participantId: string) => {
    dispatch({ type: 'REMOVE_PARTICIPANT', payload: participantId });
  };

  const updateShot = (participantId: string, roundNumber: number, shotIndex: number, hit: boolean) => {
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
      saveCompetitionToHistory(finishedCompetition);
    }
    dispatch({ type: 'FINISH_COMPETITION' });
  };

  const resetCompetition = () => {
    if (window.confirm('現在の大会をリセットしますか？（過去の履歴は保持されます）')) {
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