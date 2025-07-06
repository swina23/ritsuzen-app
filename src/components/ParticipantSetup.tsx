import React, { useState } from 'react';
import { useCompetition } from '../contexts/CompetitionContext';
import { formatRank } from '../utils/formatters';

const ParticipantSetup: React.FC = () => {
  const { state, addParticipant, removeParticipant, moveParticipantUp, moveParticipantDown } = useCompetition();
  const [name, setName] = useState('');
  const [rank, setRank] = useState(1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      addParticipant({ name: name.trim(), rank });
      setName('');
      setRank(1);
    }
  };

  if (!state.competition) return null;

  return (
    <div className="participant-setup">
      <h2>参加者登録</h2>
      
      <form onSubmit={handleSubmit} className="participant-form">
        <div className="form-group">
          <label htmlFor="participant-name">氏名:</label>
          <input
            id="participant-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="参加者名を入力"
            required
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="participant-rank">段位:</label>
          <select
            id="participant-rank"
            value={rank}
            onChange={(e) => setRank(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8].map(r => (
              <option key={r} value={r}>{r === 1 ? '初段' : `${r}段`}</option>
            ))}
          </select>
        </div>
        
        <button type="submit" className="add-btn">
          参加者を追加
        </button>
      </form>

      <div className="participants-list">
        <h3>参加者一覧 ({state.competition.participants.length}名)</h3>
        {state.competition.participants.length === 0 ? (
          <p>参加者がいません</p>
        ) : (
          <ul>
            {state.competition.participants
              .sort((a, b) => (a.order || 0) - (b.order || 0))
              .map((participant, index) => (
              <li key={participant.id} className="participant-item">
                <span className="participant-info">
                  <span className="participant-order">{index + 1}.</span>
                  {participant.name} ({formatRank(participant.rank)})
                  {state.competition?.handicapEnabled && (
                    <span className="handicap">
                      ハンデ: {participant.rank * -2}
                    </span>
                  )}
                </span>
                <div className="participant-actions">
                  <button
                    onClick={() => moveParticipantUp(participant.id)}
                    className="move-btn up-btn"
                    disabled={index === 0}
                    title="上に移動"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveParticipantDown(participant.id)}
                    className="move-btn down-btn"
                    disabled={index === state.competition.participants.length - 1}
                    title="下に移動"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => removeParticipant(participant.id)}
                    className="remove-btn"
                  >
                    削除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ParticipantSetup;