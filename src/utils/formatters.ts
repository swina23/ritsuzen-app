export const formatRank = (rank: number): string => {
  if (rank === 0) return '無段';
  return rank === 1 ? '初段' : `${rank}段`;
};

/**
 * グループ番号を表示名に（1→「グループA」）。
 * 「1立目 グループ1」と数字が並ぶと紛らわしいため、表示だけ英字にする。保存は番号のまま。
 * 27組以上は英字が足りないので番号で出す
 */
export const formatGroup = (group: number): string =>
  group >= 1 && group <= 26 ? `グループ${String.fromCharCode(64 + group)}` : `グループ${group}`;