/**
 * 通算成績タブ
 *
 * 保存済みの全大会を横断して、参加者ごとの通算的中率を表示する。
 * 開催中の大会も逐次保存されているため、集計対象に含まれる。
 *
 * 順位は通算的中率で付け、その右に直近期間の的中率を参考情報として並べる。
 * 狙いは順位付けよりも、本人が「通算の自分」と「最近の自分」を見比べて
 * 伸びに気づけること。通算は長く積み上げるほど実力に近づく反面、
 * 最近の調子が埋もれてしまうため（RECENT_PERIODS 参照）。
 *
 * この端末に保存するモード(未ログイン)では、集計対象を直近の数大会に絞る。
 * 画面自体は隠さない。何が見られるようになるのかが分からないと、
 * クラウド保存に切り替える理由も伝わらないため。
 */

import React, { useMemo } from 'react';
import { useAllCompetitions, useAllParticipantMasters, useStorageKind } from '../hooks/useStorage';
import {
  calculateCareerStats,
  formatHitRate,
  formatRecentStat,
  RECENT_PERIODS,
  RANKING_MIN_COMPETITIONS
} from '../utils/careerStats';
import { getTodayJapaneseDate } from '../utils/dateUtils';
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

  // 端末保存モードでは直近期間の列を出さない。
  // 集計対象が直近数大会しかないので、6ヶ月で絞っても同じ大会が残るだけで
  // 通算と同じ数字が並び、壊れているように見えるため。
  // 全大会から計算し直す手もあるが、それだと直近列が集計対象の制限を
  // 迂回してしまう（6ヶ月に6大会あれば6大会分が見えてしまう）
  const recentPeriods = isLimited ? [] : RECENT_PERIODS;

  // 名寄せの逆引き表は絞る前の全大会から作る。絞ると橋渡しの記録が
  // 落ちて同じ人が2行に割れるため (calculateCareerStats の identitySource)
  // 基準日は変数に束縛して依存配列に入れる。式の中で直接呼ぶと、
  // 日付をまたいでも再計算されないうえ lint も気づけない
  const today = getTodayJapaneseDate();
  const stats = useMemo(
    () => calculateCareerStats(competitions, masters, today, allCompetitions),
    [competitions, masters, allCompetitions, today]
  );

  if (stats.length === 0) {
    return (
      <div className="career-stats">
        <div className="career-stats-header">
          <h2>通算成績</h2>
        </div>
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
          {`集計対象: ${competitions.length}大会 ／ 的中率は「総的中 ÷ 総射数」で計算しています`}
        </p>
        {/* RECENT_PERIODS に期間を足すときは、この文言も併せて見直すこと */}
        {recentPeriods.length > 0 && (
          <p className="career-stats-note">
            直近6ヶ月は順位に関係しない参考値です。括弧内は6ヶ月間の出場回数です。
          </p>
        )}
        {stats.some((stat) => !stat.ranked) && (
          <p className="career-stats-note">
            出場{RANKING_MIN_COMPETITIONS}回未満の方は的中率が振れやすいため、順位を付けずに下にまとめています。
          </p>
        )}
        {hiddenCount > 0 && (
          <p className="career-stats-locked">
            🔒 {allCompetitions.length}大会のうち、直近{LOCAL_COMPETITION_LIMIT}大会だけを集計しています。
            クラウド保存に切り替えると全部が集計対象になり、
            {RECENT_PERIODS.map((period) => period.label).join('・')}の的中率と見比べて
            伸びを確かめられるようになります。
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
              <th>的中率</th>
              {recentPeriods.map((period) => (
                <th key={period.key}>{period.label}</th>
              ))}
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
                {recentPeriods.map((period) => (
                  <td key={period.key} className="career-stats-recent">
                    {formatRecentStat(stat.recent[period.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CareerStats;
