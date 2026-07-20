export interface Participant {
  id: string;
  name: string;
  rank: number; // 段位
  order: number; // 表示順序
  group?: number; // グループ番号 (1, 2, 3...)
  // 参加者マスターとの紐付け。通算成績の名寄せに使う。
  // 手入力のみでマスターに保存しなかった場合は undefined のまま。
  masterId?: string;
}

export interface Shot {
  hit: boolean | null; // true=的中, false=外れ, null=未実施
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
  enableRotation: boolean; // 射順ローテーション有効化
  roundsCount: number; // 立数 (5, 10, 15, 20, 25)
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
  /** Firestoreからの初回読み込みが完了するまでtrue */
  loading: boolean;
}