/**
 * アプリケーション全体で使用される定数
 */

/** 段位の選択肢 */
export const RANK_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

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

/** 本鈴の既定時間（秒）。揖をしてから8分 */
export const DEFAULT_FINAL_BELL_SECONDS = 480;

/** 予鈴は本鈴の何秒前か。どの大会でも30秒で固定なので設定項目にはしない */
export const WARNING_BELL_OFFSET_SECONDS = 30;

/** 予鈴の何秒前から「まもなく予鈴」と知らせるか */
export const WARNING_NOTICE_LEAD_SECONDS = 5;

/** ストップで次の組が自動スタートしたあと、そのスタートを取り消せる時間（秒） */
export const CANCEL_AUTO_START_WINDOW_SECONDS = 60;

/**
 * 自動スタート直後のストップを無視する時間（秒）。
 * ストップの2度押しで、始まったばかりの組が0秒で記録されるのを防ぐ
 */
export const STOP_AFTER_AUTO_START_GUARD_SECONDS = 3;

/** IDの生成用接頭辞 */
export const ID_PREFIXES = {
  COMPETITION: 'comp',
  PARTICIPANT: 'part',
  MASTER: 'mast'
} as const;