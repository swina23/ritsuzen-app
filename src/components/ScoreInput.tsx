import React, { useState, useCallback, useMemo } from 'react';
import { useCompetition } from '../contexts/CompetitionContext';
import { Participant } from '../types';
import { formatRank } from '../utils/formatters';
import { getShotDisplay, getShotClass } from '../utils/shotHelpers';
import { sortParticipantsByOrder } from '../utils/arrayUtils';
import { getGroupShootingOrders, findNextShot, getShootingOrderForRound } from '../utils/shootingOrder';
import { getGroupInfo, groupParticipants } from '../utils/grouping';

const ScoreInput: React.FC = () => {
  const { state, updateShot } = useCompetition();
  const [selectedRound, setSelectedRound] = useState(1);

  const handleShotClick = useCallback((participantId: string, roundNumber: number, shotIndex: number) => {
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
  }, [state.competition, updateShot]);

  const isFinished = useMemo(() => state.competition?.status === 'finished', [state.competition?.status]);
  
  const sortedParticipants = useMemo(() => {
    if (!state.competition) return [];
    return sortParticipantsByOrder(state.competition.participants);
  }, [state.competition?.participants]);

  const roundOptions = useMemo(() => {
    if (!state.competition) return [];
    return Array.from({ length: state.competition.roundsCount }, (_, i) => i + 1);
  }, [state.competition?.roundsCount]);

  const groupInfo = useMemo(() => {
    if (!state.competition) return { totalGroups: 0, groupSizes: [], hasGroups: false };
    return getGroupInfo(state.competition.participants);
  }, [state.competition?.participants]);

  const participantGroups = useMemo(() => {
    if (!state.competition) return [];
    return groupParticipants(sortedParticipants);
  }, [sortedParticipants]);

  const sortedParticipantsByShootingOrder = useMemo(() => {
    if (!state.competition) return [];
    const shootingOrder = getShootingOrderForRound(
      state.competition.participants,
      selectedRound,
      state.competition.enableRotation
    );
    return shootingOrder;
  }, [state.competition?.participants, state.competition?.enableRotation, selectedRound]);

  const shootingOrders = useMemo(() => {
    if (!state.competition) return [];
    return getGroupShootingOrders(
      state.competition.participants,
      selectedRound,
      state.competition.enableRotation
    );
  }, [state.competition?.participants, state.competition?.enableRotation, selectedRound]);

  const nextShot = useMemo(() => {
    if (!state.competition) return null;
    return findNextShot(
      state.competition.participants,
      state.competition.records,
      selectedRound,
      state.competition.enableRotation
    );
  }, [state.competition?.participants, state.competition?.records, state.competition?.enableRotation, selectedRound]);

  if (!state.competition || state.competition.participants.length === 0) {
    return <div>参加者を登録してください</div>;
  }


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
        {roundOptions.map(round => (
          <button
            key={round}
            onClick={() => setSelectedRound(round)}
            className={selectedRound === round ? 'active' : ''}
          >
{round}立目
          </button>
        ))}
      </div>

      {/* 射順情報 */}
      {groupInfo.hasGroups && shootingOrders.length > 0 && (
        <div className="shooting-info">
          <div className="shooting-order">
            <div className="info-label">射順:</div>
            {shootingOrders.map(({ groupNumber, order }) => (
              <div key={groupNumber} className="group-order">
                グループ{groupNumber}: {order.map(p => p.name.substring(0, 2)).join(' → ')}
              </div>
            ))}
          </div>
          {nextShot && (
            <div className="current-shooter">
              <div className="info-label">次の射手:</div>
              <div className="next-shooter-info">
                {nextShot.group && <span className={`group-badge group-${nextShot.group}`}>グループ{nextShot.group}</span>}
                <span className="shooter-name">
                  {sortedParticipants.find(p => p.id === nextShot.participantId)?.name}
                </span>
                <span className="shot-number">({nextShot.shotIndex + 1}射目)</span>
              </div>
            </div>
          )}
        </div>
      )}

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
            {groupInfo.hasGroups ? (
              // グループ分けされている場合（射順に並び替えて表示）
              (() => {
                // 射順でグループ分け
                const groupsByShootingOrder: { [key: number]: Participant[] } = {};
                sortedParticipantsByShootingOrder.forEach(p => {
                  const groupNum = p.group || 1;
                  if (!groupsByShootingOrder[groupNum]) {
                    groupsByShootingOrder[groupNum] = [];
                  }
                  groupsByShootingOrder[groupNum].push(p);
                });

                return Object.keys(groupsByShootingOrder)
                  .map(Number)
                  .sort((a, b) => a - b)
                  .map(groupNum => {
                    const groupParticipants = groupsByShootingOrder[groupNum];
                    return (
                      <React.Fragment key={`group-${groupNum}`}>
                        <tr className={`group-header-row group-${groupNum}`}>
                          <td colSpan={8}>
                            グループ{groupNum} ({groupParticipants.length}人)
                          </td>
                        </tr>
                        {groupParticipants.map((participant) => {
                          const record = state.competition?.records.find(r => r.participantId === participant.id);
                          const round = record?.rounds.find(r => r.roundNumber === selectedRound);
                          const isNextShooter = nextShot?.participantId === participant.id;

                          return (
                            <tr
                              key={participant.id}
                              className={`${isNextShooter ? 'next-shooter' : ''} group-${groupNum}-row`}
                            >
                              <td>{participant.name}</td>
                              <td>{formatRank(participant.rank)}</td>
                              {[0, 1, 2, 3].map(shotIndex => {
                                const isNextShot = nextShot?.participantId === participant.id && nextShot?.shotIndex === shotIndex;
                                return (
                                  <td key={shotIndex}>
                                    <button
                                      className={`shot-btn ${getShotClass(round?.shots[shotIndex]?.hit)} ${isNextShot ? 'next-shot' : ''} ${isFinished ? 'disabled' : ''}`}
                                      onClick={() => handleShotClick(participant.id, selectedRound, shotIndex)}
                                      disabled={isFinished}
                                    >
                                      {getShotDisplay(round?.shots[shotIndex]?.hit)}
                                    </button>
                                  </td>
                                );
                              })}
                              <td className="round-total">{round?.hits || 0}</td>
                              <td className="total-score">{record?.totalHits || 0}</td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  });
              })()
            ) : (
              // グループ分けされていない場合（射順に並び替えて表示）
              sortedParticipantsByShootingOrder.map((participant) => {
                const record = state.competition?.records.find(r => r.participantId === participant.id);
                const round = record?.rounds.find(r => r.roundNumber === selectedRound);
                const isNextShooter = nextShot?.participantId === participant.id;

                return (
                  <tr
                    key={participant.id}
                    className={isNextShooter ? 'next-shooter' : ''}
                  >
                    <td>{participant.name}</td>
                    <td>{formatRank(participant.rank)}</td>
                    {[0, 1, 2, 3].map(shotIndex => {
                      const isNextShot = nextShot?.participantId === participant.id && nextShot?.shotIndex === shotIndex;
                      return (
                        <td key={shotIndex}>
                          <button
                            className={`shot-btn ${getShotClass(round?.shots[shotIndex]?.hit)} ${isNextShot ? 'next-shot' : ''} ${isFinished ? 'disabled' : ''}`}
                            onClick={() => handleShotClick(participant.id, selectedRound, shotIndex)}
                            disabled={isFinished}
                          >
                            {getShotDisplay(round?.shots[shotIndex]?.hit)}
                          </button>
                        </td>
                      );
                    })}
                    <td className="round-total">{round?.hits || 0}</td>
                    <td className="total-score">{record?.totalHits || 0}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ScoreInput;