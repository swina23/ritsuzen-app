/**
 * 通算成績タブ
 *
 * 保存済みの全大会を横断して、参加者ごとの通算的中率を表示する。
 * 開催中の大会もFirestoreに逐次保存されているため、集計対象に含まれる。
 */

import React, { useMemo } from 'react';
import { useAllCompetitions, useAllParticipantMasters } from '../hooks/useStorage';
import { calculateCareerStats, formatHitRate } from '../utils/careerStats';
import { formatRank } from '../utils/formatters';

const CareerStats: React.FC = () => {
  const competitions = useAllCompetitions();
  const masters = useAllParticipantMasters();

  const stats = useMemo(
    () => calculateCareerStats(competitions, masters),
    [competitions, masters]
  );

  if (stats.length === 0) {
    return (
      <div className="career-stats">
        <h2>通算成績</h2>
        <p className="career-stats-empty">
          記録のある大会がまだありません。大会の記録を入力すると、ここに通算の的中率が出ます。
        </p>
      </div>
    );
  }

  return (
    <div className="career-stats">
      <div className="career-stats-header">
        <h2>通算成績</h2>
        <p className="career-stats-note">
          集計対象: {competitions.length}大会 ／ 通算的中率は「総的中 ÷ 総射数」で計算しています
        </p>
      </div>

      <div className="results-table">
        <table>
          <thead>
            <tr>
              <th>順位</th>
              <th>参加者</th>
              <th>段位</th>
              <th>出場数</th>
              <th>総射数</th>
              <th>総的中</th>
              <th>通算的中率</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((stat) => (
              <tr key={stat.key}>
                <td className="rank">{stat.order}</td>
                <td>{stat.name}</td>
                <td>{formatRank(stat.rank)}</td>
                <td>{stat.competitionsCount}</td>
                <td>{stat.totalShots}</td>
                <td className="total-hits">{stat.totalHits}</td>
                <td className="hit-rate">{formatHitRate(stat.hitRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CareerStats;
