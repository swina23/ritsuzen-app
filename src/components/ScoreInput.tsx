import React, { useState } from 'react';
import { useCompetition } from '../contexts/CompetitionContext';
import { formatRank } from '../utils/formatters';
import { getShotDisplay, getShotClass } from '../utils/shotHelpers';

const ScoreInput: React.FC = () => {
  const { state, updateShot } = useCompetition();
  const [selectedRound, setSelectedRound] = useState(1);

  if (!state.competition || state.competition.participants.length === 0) {
    return <div>参加者を登録してください</div>;
  }

  const handleShotClick = (participantId: string, roundNumber: number, shotIndex: number) => {
    // 大会終了後は記録編集を無効化
    if (state.competition?.status === 'finished') {
      return;
    }
    
    const record = state.competition?.records.find(r => r.participantId === participantId);
    if (record) {
      const currentHit = record.rounds[roundNumber - 1].shots[shotIndex].hit;
      // null → false → true → null のサイクル
      let newHit: boolean | null;
      if (currentHit === null) {
        newHit = false; // 未実施 → 外れ
      } else if (currentHit === false) {
        newHit = true;  // 外れ → 的中
      } else {
        newHit = null;  // 的中 → 未実施
      }
      updateShot(participantId, roundNumber, shotIndex, newHit);
    }
  };


  const isFinished = state.competition?.status === 'finished';

  return (
    <div className="score-input">
      <h2>記録入力</h2>
      
      {isFinished && (
        <div className="finished-notice">
          <p>⚠️ 大会は終了しています。記録の編集はできません。</p>
        </div>
      )}
      
      <div className="round-selector">
        <label>立選択:</label>
        {Array.from({ length: state.competition.roundsCount }, (_, i) => i + 1).map(round => (
          <button
            key={round}
            onClick={() => setSelectedRound(round)}
            className={selectedRound === round ? 'active' : ''}
          >
{round}立目
          </button>
        ))}
      </div>

      <div className="score-table">
        <table>
          <thead>
            <tr>
              <th>参加者</th>
              <th>段位</th>
              <th>1射目</th>
              <th>2射目</th>
              <th>3射目</th>
              <th>4射目</th>
              <th>的中計</th>
              <th>総計</th>
            </tr>
          </thead>
          <tbody>
            {state.competition.participants
              .sort((a, b) => (a.order || 0) - (b.order || 0))
              .map((participant) => {
              const record = state.competition?.records.find(r => r.participantId === participant.id);
              const round = record?.rounds.find(r => r.roundNumber === selectedRound);
              
              return (
                <tr key={participant.id}>
                  <td>{participant.name}</td>
                  <td>{formatRank(participant.rank)}</td>
                  {[0, 1, 2, 3].map(shotIndex => (
                    <td key={shotIndex}>
                      <button
                        className={`shot-btn ${getShotClass(round?.shots[shotIndex]?.hit)} ${isFinished ? 'disabled' : ''}`}
                        onClick={() => handleShotClick(participant.id, selectedRound, shotIndex)}
                        disabled={isFinished}
                      >
                        {getShotDisplay(round?.shots[shotIndex]?.hit)}
                      </button>
                    </td>
                  ))}
                  <td className="round-total">{round?.hits || 0}</td>
                  <td className="total-score">{record?.totalHits || 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ScoreInput;