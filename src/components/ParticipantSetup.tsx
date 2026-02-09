import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useCompetition } from '../contexts/CompetitionContext';
import { formatRank } from '../utils/formatters';
import { storageManager } from '../utils/StorageManager';
import { ParticipantMaster } from '../types';
import { sortMastersByUsage, sortParticipantsByOrder, filterByRank } from '../utils/arrayUtils';
import { getGroupInfo, groupParticipants } from '../utils/grouping';
import SortableParticipantItem from './SortableParticipantItem';

const ParticipantSetup: React.FC = () => {
  const { state, addParticipant, removeParticipant, reorderParticipants, applyAutoGrouping, clearGrouping } = useCompetition();
  const [name, setName] = useState('');
  const [rank, setRank] = useState(1);
  const [saveToMaster, setSaveToMaster] = useState(false);
  const [masters, setMasters] = useState<ParticipantMaster[]>([]);
  const [selectedMasters, setSelectedMasters] = useState<Set<string>>(new Set());
  const [showMasters, setShowMasters] = useState(true);
  const [filterRank, setFilterRank] = useState<number | null>(null);
  const [groupSize, setGroupSize] = useState<number>(5);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const loadMasters = useCallback(() => {
    const masterList = storageManager.getParticipantMasters();
    setMasters(sortMastersByUsage(masterList));
  }, []);

  useEffect(() => {
    loadMasters();
  }, [loadMasters]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (state.competition?.status === 'finished') {
      return;
    }
    if (name.trim()) {
      addParticipant({ name: name.trim(), rank });

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

    for (const masterId of selectedMasters) {
      const master = masters.find(m => m.id === masterId);
      if (master) {
        addParticipant({ name: master.name, rank: master.rank });
        storageManager.incrementMasterUsage(masterId);
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }

    setSelectedMasters(new Set());
    loadMasters();
  }, [selectedMasters, addParticipant, state.competition?.status, loadMasters, masters]);

  const filteredMasters = useMemo(() => {
    return filterByRank(masters, filterRank);
  }, [masters, filterRank]);

  const isFinished = useMemo(() => state.competition?.status === 'finished', [state.competition?.status]);

  const sortedParticipants = useMemo(() => {
    if (!state.competition) return [];
    return sortParticipantsByOrder(state.competition.participants);
  }, [state.competition?.participants]);

  const groupInfo = useMemo(() => {
    if (!state.competition) return { totalGroups: 0, groupSizes: [], hasGroups: false };
    return getGroupInfo(state.competition.participants);
  }, [state.competition?.participants]);

  const participantGroups = useMemo(() => {
    if (!state.competition) return [];
    return groupParticipants(sortedParticipants);
  }, [sortedParticipants]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = sortedParticipants.findIndex(p => p.id === active.id);
    const newIndex = sortedParticipants.findIndex(p => p.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      let reordered = arrayMove(sortedParticipants, oldIndex, newIndex);

      // グループ分けされている場合、移動先のグループに合わせる
      if (groupInfo.hasGroups) {
        const movedParticipant = reordered[newIndex];
        const overParticipant = sortedParticipants.find(p => p.id === over.id);

        // 移動先の人のグループを採用
        if (overParticipant && overParticipant.group !== undefined) {
          reordered[newIndex] = { ...movedParticipant, group: overParticipant.group };
        }
      }

      reorderParticipants(reordered);
    }
  }, [sortedParticipants, reorderParticipants, groupInfo.hasGroups]);

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

      {/* グループ分け設定 */}
      {sortedParticipants.length > 0 && (
        <div className="grouping-section">
          <h3>グループ分け</h3>
          <div className="grouping-controls">
            <div className="grouping-input">
              <label htmlFor="group-size">基本グループ人数:</label>
              <select
                id="group-size"
                value={groupSize}
                onChange={(e) => setGroupSize(Number(e.target.value))}
                disabled={isFinished}
              >
                <option value={3}>3人</option>
                <option value={4}>4人</option>
                <option value={5}>5人</option>
                <option value={6}>6人</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => applyAutoGrouping(groupSize)}
              className="grouping-btn"
              disabled={isFinished}
            >
              自動グループ分け
            </button>
            <button
              type="button"
              onClick={clearGrouping}
              className="clear-grouping-btn"
              disabled={!groupInfo.hasGroups || isFinished}
            >
              グループ解除
            </button>
          </div>
          {groupInfo.hasGroups && (
            <div className="grouping-info">
              {groupInfo.totalGroups}グループ ({groupInfo.groupSizes.map(s => `${s}人`).join(', ')})
            </div>
          )}
        </div>
      )}

      <div className="participants-list">
        <h3>参加者一覧 ({sortedParticipants.length}名)</h3>
        {sortedParticipants.length === 0 ? (
          <p>参加者がいません</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortedParticipants.map(p => p.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul>
                {groupInfo.hasGroups ? (
                  participantGroups.map((groupParticipants, groupIndex) => (
                    <React.Fragment key={`group-${groupIndex}`}>
                      <li className={`group-header group-${groupParticipants[0]?.group || groupIndex + 1}`}>
                        グループ{groupParticipants[0]?.group || groupIndex + 1} ({groupParticipants.length}人)
                      </li>
                      {groupParticipants.map((participant) => {
                        const globalIndex = sortedParticipants.findIndex(p => p.id === participant.id);
                        return (
                          <SortableParticipantItem
                            key={participant.id}
                            participant={participant}
                            index={globalIndex}
                            handicapEnabled={state.competition?.handicapEnabled || false}
                            isFinished={isFinished}
                            onRemove={() => removeParticipant(participant.id)}
                            groupNum={participant.group}
                          />
                        );
                      })}
                    </React.Fragment>
                  ))
                ) : (
                  sortedParticipants.map((participant, index) => (
                    <SortableParticipantItem
                      key={participant.id}
                      participant={participant}
                      index={index}
                      handicapEnabled={state.competition?.handicapEnabled || false}
                      isFinished={isFinished}
                      onRemove={() => removeParticipant(participant.id)}
                    />
                  ))
                )}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
};

export default ParticipantSetup;
