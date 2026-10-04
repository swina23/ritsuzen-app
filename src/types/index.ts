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

/** 1つの組（グループ）が1立を引き終えるまでの計時記録。時刻はエポックミリ秒 */
export interface GroupTiming {
  roundNumber: number;
  group: number;
  startedAt: number;
  endedAt: number;
}

/**
 * 計時の進行状態。
 *
 * 経過時間そのものではなく開始時刻を保存するので、再読み込みや画面の切り替えを
 * はさんでも経過時間がずれない。roundNumber が立数を超えたら全組の計測が終わった状態。
 */
export interface TimerState {
  /** 次に計る（または計測中の）立目 */
  roundNumber: number;
  /** 次に計る（または計測中の）グループ番号 */
  group: number;
  /** 計測中なら開始時刻。待機中は null */
  startedAt: number | null;
  /** 前の組のストップで自動的に始まった計測か。取り消しボタンを出すかの判定に使う */
  autoStarted: boolean;
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
  /**
   * 本鈴までの秒数。予鈴はこの30秒前で固定。
   * 計時機能より前の大会には無いため任意（normalizeCompetitionで補う）
   */
  finalBellSeconds?: number;
  /** 組ごとの所要時間の記録 */
  groupTimings?: GroupTiming[];
  /** 計時の進行状態 */
  timer?: TimerState;
  createdAt: string;
  updatedAt: string;
}

export interface ParticipantMaster {
  id: string;
  name: string;
  /**
   * 五十音順に並べるための読み仮名（ひらがな）。
   * 既存データには無いため任意。未設定の人は一覧の末尾にまとまる
   */
  reading?: string;
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