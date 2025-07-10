/**
 * 配列操作のユーティリティ関数集
 * 再利用可能な配列処理ロジックを提供
 */

import { Participant, ParticipantMaster, ParticipantRecord } from '../types';

// === 参加者並び替えユーティリティ ===

/**
 * 参加者リストをorder順でソート
 */
export const sortParticipantsByOrder = <T extends { order?: number }>(participants: T[]): T[] => {
  return [...participants].sort((a, b) => (a.order || 0) - (b.order || 0));
};

/**
 * 配列内の要素を上に移動（インデックスを-1）
 */
export const moveItemUp = <T>(array: T[], index: number): T[] => {
  if (index <= 0 || index >= array.length) return array;
  
  const newArray = [...array];
  [newArray[index], newArray[index - 1]] = [newArray[index - 1], newArray[index]];
  return newArray;
};

/**
 * 配列内の要素を下に移動（インデックスを+1）
 */
export const moveItemDown = <T>(array: T[], index: number): T[] => {
  if (index < 0 || index >= array.length - 1) return array;
  
  const newArray = [...array];
  [newArray[index], newArray[index + 1]] = [newArray[index + 1], newArray[index]];
  return newArray;
};

/**
 * 参加者を上に移動し、order値を再割り当て
 */
export const moveParticipantUp = (participants: Participant[], participantId: string): Participant[] => {
  const sortedParticipants = sortParticipantsByOrder(participants);
  const currentIndex = sortedParticipants.findIndex(p => p.id === participantId);
  
  if (currentIndex <= 0) return participants; // 既に最上位
  
  const reorderedParticipants = moveItemUp(sortedParticipants, currentIndex);
  
  // order値を連番で再割り当て
  return reorderedParticipants.map((participant, index) => ({
    ...participant,
    order: index + 1
  }));
};

/**
 * 参加者を下に移動し、order値を再割り当て
 */
export const moveParticipantDown = (participants: Participant[], participantId: string): Participant[] => {
  const sortedParticipants = sortParticipantsByOrder(participants);
  const currentIndex = sortedParticipants.findIndex(p => p.id === participantId);
  
  if (currentIndex >= sortedParticipants.length - 1) return participants; // 既に最下位
  
  const reorderedParticipants = moveItemDown(sortedParticipants, currentIndex);
  
  // order値を連番で再割り当て
  return reorderedParticipants.map((participant, index) => ({
    ...participant,
    order: index + 1
  }));
};

// === ソートユーティリティ ===

/**
 * 参加者マスターを使用頻度順でソート
 * 使用回数が多い順、同じ場合は最終使用日時が新しい順
 */
export const sortMastersByUsage = (masters: ParticipantMaster[]): ParticipantMaster[] => {
  return [...masters].sort((a, b) => {
    if (a.usageCount !== b.usageCount) {
      return b.usageCount - a.usageCount;
    }
    return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
  });
};

/**
 * 記録をスコア順でソート（総合順位用）
 */
export const sortRecordsByScore = (records: ParticipantRecord[], handicapEnabled: boolean = false): ParticipantRecord[] => {
  return [...records].sort((a, b) => {
    if (handicapEnabled) {
      return b.adjustedScore - a.adjustedScore;
    }
    return b.totalHits - a.totalHits;
  });
};

/**
 * 日付文字列でソート（新しい順）
 */
export const sortByDateDesc = <T extends { date?: string; lastUsed?: string; updatedAt?: string }>(
  items: T[], 
  dateField: keyof T = 'date' as keyof T
): T[] => {
  return [...items].sort((a, b) => {
    const dateA = a[dateField] as string;
    const dateB = b[dateField] as string;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });
};

// === フィルタリングユーティリティ ===

/**
 * 段位でフィルタリング
 */
export const filterByRank = <T extends { rank: number }>(items: T[], targetRank: number | null): T[] => {
  if (targetRank === null) return items;
  return items.filter(item => item.rank === targetRank);
};

/**
 * アクティブ状態でフィルタリング
 */
export const filterByActive = <T extends { isActive?: boolean }>(items: T[], activeOnly: boolean = true): T[] => {
  if (!activeOnly) return items;
  return items.filter(item => item.isActive !== false);
};

/**
 * IDでアイテムを検索
 */
export const findById = <T extends { id: string }>(items: T[], id: string): T | undefined => {
  return items.find(item => item.id === id);
};

/**
 * 名前でアイテムを検索（完全一致）
 */
export const findByName = <T extends { name: string }>(items: T[], name: string): T | undefined => {
  return items.find(item => item.name === name);
};

// === 重複除去ユーティリティ ===

/**
 * IDで重複除去
 */
export const uniqueById = <T extends { id: string }>(items: T[]): T[] => {
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
};

/**
 * 名前で重複除去（最初に見つかったものを保持）
 */
export const uniqueByName = <T extends { name: string }>(items: T[]): T[] => {
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  });
};

// === 配列分割・結合ユーティリティ ===

/**
 * 配列を指定サイズのチャンクに分割
 */
export const chunk = <T>(array: T[], size: number): T[][] => {
  if (size <= 0) return [];
  
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

/**
 * 配列を安全に最大件数まで制限
 */
export const limitArray = <T>(array: T[], maxCount: number): T[] => {
  if (maxCount <= 0) return [];
  return array.slice(0, maxCount);
};

// === 統計・集計ユーティリティ ===

/**
 * 配列内の数値の合計を計算
 */
export const sum = (numbers: number[]): number => {
  return numbers.reduce((acc, num) => acc + num, 0);
};

/**
 * 配列内の数値の平均を計算
 */
export const average = (numbers: number[]): number => {
  if (numbers.length === 0) return 0;
  return sum(numbers) / numbers.length;
};

/**
 * 配列をグループ化
 */
export const groupBy = <T, K extends string | number>(
  array: T[], 
  keyFn: (item: T) => K
): Record<K, T[]> => {
  return array.reduce((groups, item) => {
    const key = keyFn(item);
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
    return groups;
  }, {} as Record<K, T[]>);
};