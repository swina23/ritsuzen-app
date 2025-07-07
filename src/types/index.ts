export interface Participant {
  id: string;
  name: string;
  rank: number; // 段位
  order: number; // 表示順序
  groupId?: string;
}

export interface Shot {
  hit: boolean; // true=的中, false=外れ
}

export interface Round {
  roundNumber: number; // 立番号 (1-5)
  shots: Shot[]; // 4射分の記録
  hits: number; // この立での的中数
}

export interface ParticipantRecord {
  participantId: string;
  rounds: Round[];
  totalHits: number;
  hitRate: number;
  rank: number;
  handicap: number;
  adjustedScore: number;
  rankWithHandicap: number;
}

export interface Competition {
  id: string;
  name: string;
  date: string;
  type: '20' | '50';
  status: 'created' | 'inProgress' | 'finished';
  handicapEnabled: boolean;
  participants: Participant[];
  records: ParticipantRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface ParticipantMaster {
  id: string;
  name: string;
  rank: number;
  isActive: boolean;
  lastUsed: string;
  usageCount: number;
  createdAt: string;
}

export interface CompetitionState {
  competition: Competition | null;
  currentRound: number;
  currentParticipant: number;
}