import React, { useCallback, useMemo } from 'react';
import { useCompetition } from '../contexts/CompetitionContext';
import { exportToExcelWithBorders, exportToCSV } from '../utils/excelExport';
import { formatRank } from '../utils/formatters';
import { getShotDisplay, getShotClass } from '../utils/shotHelpers';
import { sortRecordsByScore } from '../utils/arrayUtils';
import { calculateRankings } from '../utils/calculations';

const Results: React.FC = () => {
  const { state } = useCompetition();

  const sortedRecords = useMemo(() => {
    if (!state.competition) return [];
    // 表示直前に最新ロジックで順位を再計算（保存済みの古い順位を上書き）
    const rankedRecords = calculateRankings(
      state.competition.records.map(record => ({ ...record }))
    );
    return sortRecordsByScore(rankedRecords, state.competition.handicapEnabled);
  }, [state.competition?.records, state.competition?.handicapEnabled]);

  const getDisplayRank = useCallback((record: any): number => {
    if (state.competition?.handicapEnabled) {
      return record.rankWithHandicap;
    }
    return record.rank;
  }, [state.competition?.handicapEnabled]);

  const exportData = useMemo(() => {
    if (!state.competition) return null;
    return {
      competition: state.competition,
      participants: state.competition.participants,
      records: state.competition.records
    };
  }, [state.competition]);

  const handleExcelExport = useCallback(async () => {
    if (exportData) {
      await exportToExcelWithBorders(exportData);
    }
  }, [exportData]);

  const handleCSVExport = useCallback(() => {
    if (exportData) {
      exportToCSV(exportData);
    }
  }, [exportData]);

  if (!state.competition || state.competition.participants.length === 0) {
    return <div>データがありません</div>;
  }

  return (
    <div className="results">
      <div className="results-header">
        <h2>結果表示</h2>
        <div className="export-buttons">
          <button onClick={handleExcelExport} className="export-btn excel-btn">
            📊 Excel出力
          </button>
          <button onClick={handleCSVExport} className="export-btn csv-btn">
            📋 CSV出力
          </button>
        </div>
      </div>
      
      <div className="competition-info">
        <h3>{state.competition.name}</h3>
        <p>開催日: {state.competition.date}</p>
        <p>参加者数: {state.competition.participants.length}名</p>
        <p>ハンデ機能: {state.competition.handicapEnabled ? '有効' : '無効'}</p>
        <p className="sort-notice">※ 結果は成績順にソートしています</p>
      </div>

      <div className="results-table">
        <table>
          <thead>
            <tr>
              <th>順位</th>
              <th>参加者</th>
              <th>段位</th>
              {Array.from({ length: state.competition.roundsCount }, (_, i) => (
                <th key={i}>{i + 1}立</th>
              ))}
              <th>的中</th>
              <th>的中率</th>
              {state.competition.handicapEnabled && (
                <>
                  <th>調整前順位</th>
                  <th>ハンデ</th>
                  <th>調整後的中</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {sortedRecords.map((record, _index) => {
              const participant = state.competition?.participants.find(p => p.id === record.participantId);
              if (!participant) return null;

              return (
                <tr key={record.participantId}>
                  <td className="rank">{getDisplayRank(record)}</td>
                  <td>{participant.name}</td>
                  <td>{formatRank(participant.rank)}</td>
                  {record.rounds.map((round, roundIndex) => (
                    <td key={roundIndex} className="round-score">
                      {round.hits}
                    </td>
                  ))}
                  <td className="total-hits">{record.totalHits}</td>
                  <td className="hit-rate">{(record.hitRate * 100).toFixed(1)}%</td>
                  {state.competition?.handicapEnabled && (
                    <>
                      <td className="rank">{record.rank}</td>
                      <td className="handicap">{record.handicap}</td>
                      <td className="adjusted-score">{record.adjustedScore}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="detailed-results">
        <h3>詳細記録</h3>
        {sortedRecords.map((record, _index) => {
          const participant = state.competition?.participants.find(p => p.id === record.participantId);
          if (!participant) return null;

          return (
            <div key={record.participantId} className="participant-detail">
              <h4>
                {getDisplayRank(record)}位: {participant.name} ({formatRank(participant.rank)})
                - {record.totalHits}中 ({(record.hitRate * 100).toFixed(1)}%)
              </h4>
              <div className="shots-grid">
                {record.rounds.map((round, roundIndex) => (
                  <div key={roundIndex} className="round-detail">
                    <div className="round-header">第{round.roundNumber}立</div>
                    <div className="shots">
                      {round.shots.map((shot, shotIndex) => (
                        <span key={shotIndex} className={`shot ${getShotClass(shot.hit)}`}>
                          {getShotDisplay(shot.hit)}
                        </span>
                      ))}
                    </div>
                    <div className="round-total">計: {round.hits}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Results;