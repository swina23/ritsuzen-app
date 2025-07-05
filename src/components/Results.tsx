import React from 'react';
import { useCompetition } from '../contexts/CompetitionContext';

const Results: React.FC = () => {
  const { state } = useCompetition();

  if (!state.competition || state.competition.participants.length === 0) {
    return <div>データがありません</div>;
  }

  const sortedRecords = [...state.competition.records].sort((a, b) => {
    if (state.competition?.handicapEnabled) {
      return b.adjustedScore - a.adjustedScore;
    }
    return b.totalHits - a.totalHits;
  });

  return (
    <div className="results">
      <h2>結果表示</h2>
      
      <div className="competition-info">
        <h3>{state.competition.name}</h3>
        <p>開催日: {state.competition.date}</p>
        <p>参加者数: {state.competition.participants.length}名</p>
        <p>ハンデ機能: {state.competition.handicapEnabled ? '有効' : '無効'}</p>
      </div>

      <div className="results-table">
        <table>
          <thead>
            <tr>
              <th>順位</th>
              <th>参加者</th>
              <th>段位</th>
              <th>1立</th>
              <th>2立</th>
              <th>3立</th>
              <th>4立</th>
              <th>5立</th>
              <th>的中</th>
              <th>的中率</th>
              {state.competition.handicapEnabled && (
                <>
                  <th>ハンデ</th>
                  <th>調整後</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {sortedRecords.map((record, index) => {
              const participant = state.competition?.participants.find(p => p.id === record.participantId);
              if (!participant) return null;

              return (
                <tr key={record.participantId}>
                  <td className="rank">{index + 1}</td>
                  <td>{participant.name}</td>
                  <td>{participant.rank}段</td>
                  {record.rounds.map((round, roundIndex) => (
                    <td key={roundIndex} className="round-score">
                      {round.hits}
                    </td>
                  ))}
                  <td className="total-hits">{record.totalHits}</td>
                  <td className="hit-rate">{(record.hitRate * 100).toFixed(1)}%</td>
                  {state.competition.handicapEnabled && (
                    <>
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
        {sortedRecords.map((record, index) => {
          const participant = state.competition?.participants.find(p => p.id === record.participantId);
          if (!participant) return null;

          return (
            <div key={record.participantId} className="participant-detail">
              <h4>
                {index + 1}位: {participant.name} ({participant.rank}段)
                - {record.totalHits}中 ({(record.hitRate * 100).toFixed(1)}%)
              </h4>
              <div className="shots-grid">
                {record.rounds.map((round, roundIndex) => (
                  <div key={roundIndex} className="round-detail">
                    <div className="round-header">第{round.roundNumber}立</div>
                    <div className="shots">
                      {round.shots.map((shot, shotIndex) => (
                        <span key={shotIndex} className={`shot ${shot.hit ? 'hit' : 'miss'}`}>
                          {shot.hit ? '○' : '×'}
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