import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useCompetition } from '../contexts/CompetitionContext';
import { formatRank } from '../utils/formatters';
import { storageManager } from '../utils/StorageManager';
import { ParticipantMaster } from '../types';
import { sortMastersByUsage, sortParticipantsByOrder, filterByRank } from '../utils/arrayUtils';

const ParticipantSetup: React.FC = () => {
  const { state, addParticipant, removeParticipant, moveParticipantUp, moveParticipantDown } = useCompetition();
  const [name, setName] = useState('');
  const [rank, setRank] = useState(1);
  const [saveToMaster, setSaveToMaster] = useState(false);
  const [masters, setMasters] = useState<ParticipantMaster[]>([]);
  const [selectedMasters, setSelectedMasters] = useState<Set<string>>(new Set());
  const [showMasters, setShowMasters] = useState(true);
  const [filterRank, setFilterRank] = useState<number | null>(null);

  const loadMasters = useCallback(() => {
    const masterList = storageManager.getParticipantMasters();
    setMasters(sortMastersByUsage(masterList));
  }, []);

  useEffect(() => {
    loadMasters();
  }, [loadMasters]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    // 大会終了後は参加者追加を無効化
    if (state.competition?.status === 'finished') {
      return;
    }
    if (name.trim()) {
      addParticipant({ name: name.trim(), rank });
      
      // マスターに保存する場合
      if (saveToMaster) {
        const existingMaster = storageManager.findMasterByName(name.trim());
        if (!existingMaster) {
          try {
            storageManager.saveParticipantMaster({
              name: name.trim(),
              rank,
              isActive: true,
              lastUsed: new Date().toISOString(),
              usageCount: 1
            });
            // マスターリストを再読み込み
            loadMasters();
          } catch (error) {
            console.error('Failed to save to master:', error);
          }
        }
      }
      
      setName('');
      setRank(1);
      setSaveToMaster(false);
    }
  }, [addParticipant, saveToMaster, name, rank, state.competition?.status, loadMasters]);

  const handleMasterSelection = useCallback((masterId: string) => {
    const newSelected = new Set(selectedMasters);
    if (newSelected.has(masterId)) {
      newSelected.delete(masterId);
    } else {
      newSelected.add(masterId);
    }
    setSelectedMasters(newSelected);
  }, [selectedMasters]);

  const handleAddSelectedMasters = useCallback(async () => {
    if (state.competition?.status === 'finished') {
      return;
    }
    
    // 順次処理で確実に異なるタイムスタンプを生成
    for (const masterId of selectedMasters) {
      const master = masters.find(m => m.id === masterId);
      if (master) {
        addParticipant({ name: master.name, rank: master.rank });
        storageManager.incrementMasterUsage(masterId);
        // 少し待機してタイムスタンプの重複を防ぐ
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }
    
    setSelectedMasters(new Set());
    // マスターリストを再読み込み（使用回数更新のため）
    loadMasters();
  }, [selectedMasters, addParticipant, state.competition?.status, loadMasters]);

  const filteredMasters = useMemo(() => {
    return filterByRank(masters, filterRank);
  }, [masters, filterRank]);

  const isFinished = useMemo(() => state.competition?.status === 'finished', [state.competition?.status]);

  const sortedParticipants = useMemo(() => {
    if (!state.competition) return [];
    return sortParticipantsByOrder(state.competition.participants);
  }, [state.competition?.participants]);

  if (!state.competition) return null;


  return (
    <div className="participant-setup">
      <h2>参加者登録</h2>
      
      {isFinished && (
        <div className="finished-notice">
          <p>⚠️ 大会は終了しています。参加者の追加・変更はできません。</p>
        </div>
      )}
      
      {/* マスター選択セクション */}
      {masters.length > 0 && (
        <div className="master-selection">
          <div className="master-header">
            <h3>マスターから選択</h3>
            <button 
              type="button"
              onClick={() => setShowMasters(!showMasters)}
              className="toggle-btn"
            >
              {showMasters ? '▼' : '▶'}
            </button>
          </div>
          
          {showMasters && (
            <div className="master-content">
              <div className="master-controls">
                <div className="filter-group">
                  <label>段位フィルタ:</label>
                  <select
                    value={filterRank || ''}
                    onChange={(e) => setFilterRank(e.target.value ? Number(e.target.value) : null)}
                    disabled={isFinished}
                  >
                    <option value="">全段位</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(r => (
                      <option key={r} value={r}>{r === 1 ? '初段' : `${r}段`}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleAddSelectedMasters}
                  className="add-selected-btn"
                  disabled={selectedMasters.size === 0 || isFinished}
                >
                  選択した参加者を追加 ({selectedMasters.size}名)
                </button>
              </div>
              
              <div className="master-list">
                {filteredMasters.map(master => (
                  <div key={master.id} className="master-item">
                    <label className="master-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedMasters.has(master.id)}
                        onChange={() => handleMasterSelection(master.id)}
                        disabled={isFinished}
                      />
                      <span className="master-info">
                        <span className="master-name">{master.name}</span>
                        <span className="master-rank">({formatRank(master.rank)})</span>
                        <span className="master-usage">使用回数: {master.usageCount}</span>
                      </span>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* 新規追加フォーム */}
      <div className="new-participant-section">
        <h3>新規参加者追加</h3>
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
              disabled={isFinished}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="participant-rank">段位:</label>
            <select
              id="participant-rank"
              value={rank}
              onChange={(e) => setRank(Number(e.target.value))}
              disabled={isFinished}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map(r => (
                <option key={r} value={r}>{r === 1 ? '初段' : `${r}段`}</option>
              ))}
            </select>
          </div>
          
          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={saveToMaster}
                onChange={(e) => setSaveToMaster(e.target.checked)}
                disabled={isFinished}
              />
              マスターに保存
            </label>
          </div>
          
          <button type="submit" className="add-btn" disabled={isFinished}>
            参加者を追加
          </button>
        </form>
      </div>

      <div className="participants-list">
        <h3>参加者一覧 ({sortedParticipants.length}名)</h3>
        {sortedParticipants.length === 0 ? (
          <p>参加者がいません</p>
        ) : (
          <ul>
            {sortedParticipants
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
                    disabled={index === 0 || isFinished}
                    title="上に移動"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveParticipantDown(participant.id)}
                    className="move-btn down-btn"
                    disabled={index === state.competition!.participants.length - 1 || isFinished}
                    title="下に移動"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => removeParticipant(participant.id)}
                    className="remove-btn"
                    disabled={isFinished}
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