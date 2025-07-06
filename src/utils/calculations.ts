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

// 将来的なタイブレーカー用の比較関数（現在は使用せず）
const compareTieBreaker = (_a: ParticipantRecord, _b: ParticipantRecord): number => {
  // 将来的に以下のようなルールを実装可能：
  // 1. 後半立（4立目、5立目）の成績で比較
  // 2. より多くの連続的中がある方を上位
  // 3. 参加者登録順で比較
  
  // 現在は同順位として扱う
  return 0;
};

export const calculateRankings = (records: ParticipantRecord[]): ParticipantRecord[] => {
  // 基本順位（的中数順）の同順位対応
  const sortedByHits = [...records].sort((a, b) => {
    const hitsDiff = b.totalHits - a.totalHits;
    if (hitsDiff !== 0) return hitsDiff;
    return compareTieBreaker(a, b);
  });
  
  let currentRank = 1;
  for (let i = 0; i < sortedByHits.length; i++) {
    if (i > 0 && sortedByHits[i].totalHits !== sortedByHits[i - 1].totalHits) {
      currentRank = i + 1;
    }
    sortedByHits[i].rank = currentRank;
  }

  // ハンデ順位（調整後スコア順）の同順位対応
  const sortedByAdjusted = [...records].sort((a, b) => {
    const adjustedDiff = b.adjustedScore - a.adjustedScore;
    if (adjustedDiff !== 0) return adjustedDiff;
    return compareTieBreaker(a, b);
  });
  
  currentRank = 1;
  for (let i = 0; i < sortedByAdjusted.length; i++) {
    if (i > 0 && sortedByAdjusted[i].adjustedScore !== sortedByAdjusted[i - 1].adjustedScore) {
      currentRank = i + 1;
    }
    sortedByAdjusted[i].rankWithHandicap = currentRank;
  }

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