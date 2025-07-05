import { Participant, ParticipantRecord, Round } from '../types';

export const calculateHandicap = (rank: number): number => {
  return rank * -2;
};

export const calculateTotalHits = (rounds: Round[]): number => {
  return rounds.reduce((total, round) => total + round.hits, 0);
};

export const calculateHitRate = (totalHits: number, totalShots: number): number => {
  return totalShots > 0 ? totalHits / totalShots : 0;
};

export const calculateRoundHits = (shots: { hit: boolean }[]): number => {
  return shots.filter(shot => shot.hit).length;
};

export const calculateAdjustedScore = (totalHits: number, handicap: number): number => {
  return totalHits + handicap;
};

export const calculateRankings = (records: ParticipantRecord[]): ParticipantRecord[] => {
  // 基本順位（的中数順）
  const sortedByHits = [...records].sort((a, b) => b.totalHits - a.totalHits);
  sortedByHits.forEach((record, index) => {
    record.rank = index + 1;
  });

  // ハンデ順位（調整後スコア順）
  const sortedByAdjusted = [...records].sort((a, b) => b.adjustedScore - a.adjustedScore);
  sortedByAdjusted.forEach((record, index) => {
    record.rankWithHandicap = index + 1;
  });

  return records;
};

export const initializeParticipantRecord = (participant: Participant): ParticipantRecord => {
  const rounds: Round[] = [];
  for (let i = 1; i <= 5; i++) {
    rounds.push({
      roundNumber: i,
      shots: [
        { hit: false },
        { hit: false },
        { hit: false },
        { hit: false }
      ],
      hits: 0
    });
  }

  const handicap = calculateHandicap(participant.rank);
  return {
    participantId: participant.id,
    rounds,
    totalHits: 0,
    hitRate: 0,
    rank: 0,
    handicap,
    adjustedScore: handicap,
    rankWithHandicap: 0
  };
};

export const updateParticipantRecord = (record: ParticipantRecord): ParticipantRecord => {
  // 各立の的中数を再計算
  const updatedRounds = record.rounds.map(round => ({
    ...round,
    hits: calculateRoundHits(round.shots)
  }));

  const totalHits = calculateTotalHits(updatedRounds);
  const hitRate = calculateHitRate(totalHits, 20); // 20射制
  const adjustedScore = calculateAdjustedScore(totalHits, record.handicap);

  return {
    ...record,
    rounds: updatedRounds,
    totalHits,
    hitRate,
    adjustedScore
  };
};