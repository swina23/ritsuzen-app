/**
 * 参加者マスターのソーティングユーティリティ
 */

import { ParticipantMaster } from '../types';

/**
 * 参加者マスターを使用頻度順にソートする
 * @param masters - ソート対象のマスター配列
 * @returns ソート済みマスター配列
 */
export const sortMastersByUsage = (masters: ParticipantMaster[]): ParticipantMaster[] => {
  return [...masters]
    .filter(master => master.isActive)
    .sort((a, b) => {
      // 使用回数の多い順、同じ場合は最後に使用した日時の新しい順
      if (b.usageCount !== a.usageCount) {
        return b.usageCount - a.usageCount;
      }
      return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
    });
};

/**
 * 参加者マスターを名前順にソートする
 * @param masters - ソート対象のマスター配列
 * @returns ソート済みマスター配列
 */
export const sortMastersByName = (masters: ParticipantMaster[]): ParticipantMaster[] => {
  return [...masters]
    .filter(master => master.isActive)
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
};

/**
 * 参加者マスターを段位順にソートする
 * @param masters - ソート対象のマスター配列
 * @returns ソート済みマスター配列
 */
export const sortMastersByRank = (masters: ParticipantMaster[]): ParticipantMaster[] => {
  return [...masters]
    .filter(master => master.isActive)
    .sort((a, b) => a.rank - b.rank);
};