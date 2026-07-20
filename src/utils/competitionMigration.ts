/**
 * 保存済み大会データのマイグレーション
 *
 * スキーマに後から追加したフィールドは、古い保存データには存在しない。
 * 読み込み経路が「現在の大会」と「履歴・通算集計」の2つあるため、
 * どちらも同じ補完を通るようここに集約している。
 */

import { Competition } from '../types';
import { DEFAULT_ROUNDS_COUNT } from './constants';

/**
 * 欠けているフィールドにデフォルト値を補う。
 * Firestoreから読んだ生データはこの関数を通してから利用すること。
 */
export const normalizeCompetition = (competition: Competition): Competition => ({
  ...competition,
  roundsCount: competition.roundsCount !== undefined ? competition.roundsCount : DEFAULT_ROUNDS_COUNT,
  enableRotation: competition.enableRotation !== undefined ? competition.enableRotation : true,
  participants: competition.participants.map((participant, index) => ({
    ...participant,
    order: participant.order !== undefined ? participant.order : index + 1,
  })),
});
