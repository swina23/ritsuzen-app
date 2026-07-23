/**
 * 通算成績タブ
 *
 * 保存済みの全大会を横断して、参加者ごとの通算的中率を表示する。
 * 開催中の大会も逐次保存されているため、集計対象に含まれる。
 *
 * この端末に保存するモード(未ログイン)では、集計対象を直近の数大会に絞る。
 * 画面自体は隠さない。何が見られるようになるのかが分からないと、
 * クラウド保存に切り替える理由も伝わらないため。
 */

import React, { useMemo } from 'react';
import { useAllCompetitions, useAllParticipantMasters, useStorageKind } from '../hooks/useStorage';
import { calculateCareerStats, formatHitRate, RANKING_MIN_COMPETITIONS } from '../utils/careerStats';
import { formatRank } from '../utils/formatters';

/** 端末保存モードで集計対象にする大会数 */
const LOCAL_COMPETITION_LIMIT = 3;

const CareerStats: React.FC = () => {
  const allCompetitions = useAllCompetitions();
  const masters = useAllParticipantMasters();
  const storageKind = useStorageKind();
  const isLimited = storageKind === 'local';

  const competitions = useMemo(() => {
    if (!isLimited) return allCompetitions;
    // 日付の降順で直近から。同じ日付が並んでも順序が入れ替わらないよう
    // localeCompare の結果だけで比べる (sort は安定ソート)
    return [...allCompetitions]
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, LOCAL_COMPETITION_LIMIT);
  }, [allCompetitions, isLimited]);

  const hiddenCount = allCompetitions.length - competitions.length;

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
          {isLimited
            ? `集計対象: 直近${competitions.length}大会 ／ 通算的中率は「総的中 ÷ 総射数」で計算しています`
            : `集計対象: ${competitions.length}大会 ／ 通算的中率は「総的中 ÷ 総射数」で計算しています`}
        </p>
        {stats.some((stat) => !stat.ranked) && (
          <p className="career-stats-note">
            出場{RANKING_MIN_COMPETITIONS}回未満の方は的中率が振れやすいため、順位を付けずに下にまとめています。
          </p>
        )}
        {hiddenCount > 0 && (
          <p className="career-stats-locked">
            🔒 保存済みの{allCompetitions.length}大会のうち、直近{LOCAL_COMPETITION_LIMIT}大会だけを集計しています。
            クラウド保存に切り替えると全期間が集計対象になります。
          </p>
        )}
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
              <tr key={stat.key} className={stat.ranked ? undefined : 'career-stats-unranked'}>
                <td className="rank">{stat.ranked ? stat.order : '―'}</td>
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
