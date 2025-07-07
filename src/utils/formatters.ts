export const formatRank = (rank: number): string => {
  return rank === 1 ? '初段' : `${rank}段`;
};