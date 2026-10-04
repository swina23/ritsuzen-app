/**
 * 保存済み大会データのマイグレーション
 *
 * スキーマに後から追加したフィールドは、古い保存データには存在しない。
 * 読み込み経路が「現在の大会」と「履歴・通算集計」の2つあるため、
 * どちらも同じ補完を通るようここに集約している。
 */

import { Competition } from '../types';
import { DEFAULT_FINAL_BELL_SECONDS, DEFAULT_ROUNDS_COUNT } from './constants';
import { INITIAL_TIMER_STATE, isValidFinalBellSeconds } from './timing';

/**
 * 欠けているフィールドにデフォルト値を補う。
 * Firestoreから読んだ生データはこの関数を通してから利用すること。
 */
export const normalizeCompetition = (competition: Competition): Competition => ({
  ...competition,
  roundsCount: competition.roundsCount !== undefined ? competition.roundsCount : DEFAULT_ROUNDS_COUNT,
  enableRotation: competition.enableRotation !== undefined ? competition.enableRotation : true,
  // 計時機能より前の大会も、既定の8分で計れるようにする。壊れた値（予鈴が0秒以前になる長さ）も既定に戻す
  finalBellSeconds: isValidFinalBellSeconds(competition.finalBellSeconds)
    ? competition.finalBellSeconds
    : DEFAULT_FINAL_BELL_SECONDS,
  groupTimings: competition.groupTimings ?? [],
  timer: competition.timer ?? INITIAL_TIMER_STATE,
  participants: competition.participants.map((participant, index) => ({
    ...participant,
    order: participant.order !== undefined ? participant.order : index + 1,
  })),
});
