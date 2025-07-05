import React, { useState } from 'react';
import { useCompetition } from '../contexts/CompetitionContext';

const ScoreInput: React.FC = () => {
  const { state, updateShot } = useCompetition();
  const [selectedRound, setSelectedRound] = useState(1);

  if (!state.competition || state.competition.participants.length === 0) {
    return <div>参加者を登録してください</div>;
  }

  const handleShotClick = (participantId: string, roundNumber: number, shotIndex: number) => {
    const record = state.competition?.records.find(r => r.participantId === participantId);
    if (record) {
      const currentHit = record.rounds[roundNumber - 1].shots[shotIndex].hit;
      updateShot(participantId, roundNumber, shotIndex, !currentHit);
    }
  };

  const getShotDisplay = (hit: boolean) => hit ? '○' : '×';

  return (
    <div className="score-input">
      <h2>記録入力</h2>
      
      <div className="round-selector">
        <label>立選択:</label>
        {[1, 2, 3, 4, 5].map(round => (
          <button
            key={round}
            onClick={() => setSelectedRound(round)}
            className={selectedRound === round ? 'active' : ''}
          >
            第{round}立
          </button>
        ))}
      </div>

      <div className="score-table">
        <table>
          <thead>
            <tr>
              <th>参加者</th>
              <th>段位</th>
              <th>1射</th>
              <th>2射</th>
              <th>3射</th>
              <th>4射</th>
              <th>立計</th>
              <th>総計</th>
            </tr>
          </thead>
          <tbody>
            {state.competition.participants.map((participant) => {
              const record = state.competition?.records.find(r => r.participantId === participant.id);
              const round = record?.rounds.find(r => r.roundNumber === selectedRound);
              
              return (
                <tr key={participant.id}>
                  <td>{participant.name}</td>
                  <td>{participant.rank}段</td>
                  {[0, 1, 2, 3].map(shotIndex => (
                    <td key={shotIndex}>
                      <button
                        className={`shot-btn ${round?.shots[shotIndex].hit ? 'hit' : 'miss'}`}
                        onClick={() => handleShotClick(participant.id, selectedRound, shotIndex)}
                      >
                        {getShotDisplay(round?.shots[shotIndex].hit || false)}
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