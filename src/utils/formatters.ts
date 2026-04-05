export const formatRank = (rank: number): string => {
  if (rank === 0) return '無段';
  return rank === 1 ? '初段' : `${rank}段`;
};