/**
 * アプリケーション全体で使用される定数
 */

/** 段位の選択肢 */
export const RANK_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/** 立数の選択肢 */
export const ROUNDS_OPTIONS = [5, 10, 15, 20, 25] as const;

/** ステータスメッセージの表示時間（ミリ秒） */
export const STATUS_MESSAGE_TIMEOUT = 3000;

/** 大会履歴の最大保存数 */
export const MAX_COMPETITION_HISTORY = 50;

/** 参加者マスターの最大保存数 */
export const MAX_PARTICIPANT_MASTERS = 30;

/** 1立あたりの射数（固定） */
export const SHOTS_PER_ROUND = 4;

/** デフォルトの立数 */
export const DEFAULT_ROUNDS_COUNT = 5;

/** IDの生成用接頭辞 */
export const ID_PREFIXES = {
  COMPETITION: 'comp',
  PARTICIPANT: 'part',
  MASTER: 'mast'
} as const;