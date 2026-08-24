import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
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
import { RANK_OPTIONS } from '../utils/constants';
import { storageManager } from '../utils/StorageManager';
import { normalizeParticipantName } from '../utils/participantName';
import { isKanaOnly, kanaRowLabel } from '../utils/kana';
import { useParticipantMasters } from '../hooks/useStorage';
import { sortMastersByReading, sortParticipantsByOrder, filterByRank } from '../utils/arrayUtils';
import { getGroupInfo, groupParticipants } from '../utils/grouping';
import SortableParticipantItem from './SortableParticipantItem';

const ParticipantSetup: React.FC = () => {
  const { state, addParticipant, removeParticipant, reorderParticipants, applyAutoGrouping, clearGrouping } = useCompetition();
  const [name, setName] = useState('');
  const [reading, setReading] = useState('');
  const [rank, setRank] = useState(1);
  // 変換前のかなを保持する。変換が確定すると入力欄からは消えてしまうため、
  // compositionupdate の時点で拾っておかないと後から取り出せない
  const composingKanaRef = useRef('');
  // よみ欄を人が触ったら自動補完はやめる。手で直したものを上書きしないため
  const readingEditedRef = useRef(false);
  const [saveToMaster, setSaveToMaster] = useState(false);
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

  // マスター一覧はFirestoreの購読から供給されるため、手動での再読み込みは不要
  const activeMasters = useParticipantMasters();
  const masters = useMemo(() => sortMastersByReading(activeMasters), [activeMasters]);

  // 氏名をIMEで変換する前のかなを、よみ欄に自動で移す。
  // 「たなか」を「田中」に変換した時点で入力欄からかなは消えてしまうため、
  // 変換中(compositionupdate)に見えているかなを覚えておき、確定時に足す
  const handleNameCompositionUpdate = useCallback((e: React.CompositionEvent<HTMLInputElement>) => {
    if (isKanaOnly(e.data)) {
      composingKanaRef.current = e.data;
    }
  }, []);

  const handleNameCompositionEnd = useCallback(() => {
    const kana = composingKanaRef.current;
    composingKanaRef.current = '';
    // 姓と名を続けて変換したときは足していく（「たなか」＋「たろう」）
    if (kana && !readingEditedRef.current) {
      setReading(prev => prev + kana);
    }
  }, []);

  const handleNameChange = useCallback((value: string) => {
    setName(value);
    // 氏名を消したらよみも白紙に戻す。入れ直したときに前の人のよみが残っていると、
    // 気付かないまま別人のよみで登録されてしまうため
    if (!value) {
      setReading('');
      readingEditedRef.current = false;
      composingKanaRef.current = '';
    }
  }, []);

  const handleReadingChange = useCallback((value: string) => {
    setReading(value);
    readingEditedRef.current = true;
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (state.competition?.status === 'finished') {
      return;
    }
    // 全角括弧は半角に揃えてから登録する。「今村（梨）」と「今村(梨)」が
    // 別マスターとして2件できると、その人の通算成績が2行に割れるため
    const entryName = normalizeParticipantName(name);

    if (entryName) {
      // マスターへの保存を先に済ませ、得られたIDを参加者に紐付ける。
      // これがないと通算成績の名寄せが氏名の文字列一致頼みになり、
      // 改名や同姓同名で破綻する。
      let masterId: string | undefined;
      // 既存のマスターに当たったときは、そのマスターの氏名で登録する。
      // 空白や括弧の違いを無視して引き当てるため、入力した表記のまま登録すると
      // 同じ人なのに大会ごとに表記が違う状態になるため
      let participantName = entryName;

      if (saveToMaster) {
        const existingMaster = storageManager.findMasterByName(entryName);
        if (existingMaster) {
          masterId = existingMaster.id;
          participantName = existingMaster.name;
          // 既存マスターのよみはここでは埋めない。よみを書き込むと一覧が並び替わり、
          // 参加者を選んでいる最中に行が動いて押し間違いを招くため。
          // 未設定のよみはデータ管理画面の「よみをまとめて入力」で埋める
          // 無効化済みの人を手入力で登録し直したときは、マスターも有効に戻す。
          // 戻さないと「マスターに保存」したのに一覧に出てこない状態になる。
          if (!existingMaster.isActive) {
            storageManager.updateParticipantMaster(existingMaster.id, { isActive: true });
          }
          // 手入力でも大会に出す以上は「使用」なので、一覧から選んだときと同じく数える
          storageManager.incrementMasterUsage(existingMaster.id);
        } else {
          try {
            // IDはクライアント側で採番されるため戻り値は同期的に得られる
            masterId = storageManager.saveParticipantMaster({
              name: entryName,
              reading,
              rank,
              isActive: true,
              lastUsed: new Date().toISOString(),
              usageCount: 1
            }).id;
          } catch (error) {
            console.error('Failed to save to master:', error);
          }
        }
      }

      addParticipant({ name: participantName, rank, masterId });

      setName('');
      setReading('');
      readingEditedRef.current = false;
      composingKanaRef.current = '';
      setRank(1);
      setSaveToMaster(false);
    }
  }, [addParticipant, saveToMaster, name, reading, rank, state.competition?.status]);

  /**
   * 既にこの大会に登録済みのマスター。一覧で選べないようにするために使う。
   *
   * 同じ人を2回登録しても入力は普通に進んでしまい、結果表とExcel/CSVに
   * 同じ人が2行出て、それぞれに順位が付く。当日の慌ただしい登録では
   * 起きやすいうえ、参加者リストを目で追わないと気づけない。
   *
   * 氏名ではなくmasterIdで見る。同姓同名の別人を誤って弾かないため
   */
  const addedMasterIds = useMemo(
    () =>
      new Set(
        (state.competition?.participants ?? [])
          .map((participant) => participant.masterId)
          .filter((masterId): masterId is string => Boolean(masterId))
      ),
    [state.competition?.participants]
  );

  // 今この一覧に出ている人。選択中に誰かが無効化・削除すると、選んだIDだけが
  // 手元に残って追加できなくなるため、選択の掃除と人数の計算で参照する
  const selectableMasterIds = useMemo(() => new Set(masters.map((master) => master.id)), [masters]);

  /**
   * 選べなくなった人を選択から外す。
   *
   * 外さないと、選択したまま手入力で同じ人を登録し、その参加者を後から削除したとき、
   * チェックが入ったままの状態で復活する。「消したはずの人」が次の「追加」で
   * 黙って戻ってくることになり、この画面で防ぎたかった二重登録そのものを招く。
   *
   * 中身が変わらないときは元のSetを返す。毎回作り直すとこのeffectが自分を
   * 呼び続けて止まらなくなるため
   */
  useEffect(() => {
    setSelectedMasters((prev) => {
      const kept = Array.from(prev).filter(
        (masterId) => !addedMasterIds.has(masterId) && selectableMasterIds.has(masterId)
      );
      return kept.length === prev.size ? prev : new Set(kept);
    });
  }, [addedMasterIds, selectableMasterIds]);

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
      // 一覧では選べないようにしてあり、選択も掃除しているが、
      // 二重登録だけは通したくないので追加の直前にもう一度見る
      if (addedMasterIds.has(masterId)) continue;
      const master = masters.find(m => m.id === masterId);
      if (master) {
        addParticipant({ name: master.name, rank: master.rank, masterId: master.id });
        storageManager.incrementMasterUsage(masterId);
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }

    setSelectedMasters(new Set());
  }, [selectedMasters, addParticipant, state.competition?.status, masters, addedMasterIds]);

  // 実際に追加される人数。掃除のeffectが走るまでの1描画だけ選択が古いままなので、
  // ボタンの人数は選択数ではなくここで数え直す
  const pendingSelectedCount = useMemo(
    () =>
      Array.from(selectedMasters).filter(
        (masterId) => !addedMasterIds.has(masterId) && selectableMasterIds.has(masterId)
      ).length,
    [selectedMasters, addedMasterIds, selectableMasterIds]
  );

  const filteredMasters = useMemo(() => {
    return filterByRank(masters, filterRank);
  }, [masters, filterRank]);

  // 「あ行」「か行」…の見出しで区切る。目当ての人を目で探すときの手がかりになる。
  // 一覧は既によみ順に並んでいるので、隣が同じ行かどうかを見るだけで区切れる
  const masterRows = useMemo(() => {
    const rows: { label: string; masters: typeof filteredMasters }[] = [];
    filteredMasters.forEach((master) => {
      const label = kanaRowLabel(master.reading);
      const lastRow = rows[rows.length - 1];
      if (lastRow && lastRow.label === label) {
        lastRow.masters.push(master);
      } else {
        rows.push({ label, masters: [master] });
      }
    });
    return rows;
  }, [filteredMasters]);

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
                    {RANK_OPTIONS.map(r => (
                      <option key={r} value={r}>{formatRank(r)}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleAddSelectedMasters}
                  className="add-selected-btn"
                  disabled={pendingSelectedCount === 0 || isFinished}
                >
                  選択した参加者を追加 ({pendingSelectedCount}名)
                </button>
              </div>

              <div className="master-list">
                {masterRows.map(row => (
                  <React.Fragment key={row.label}>
                    <div className="master-row-header">{row.label}</div>
                    {row.masters.map(master => {
                      // 追加済みの人はチェックを入れたまま押せなくする。
                      // 一覧から消すと「さっきまで居た人が消えた」と見えてしまうため、
                      // 居場所は変えずに選べないことだけを示す
                      const isAdded = addedMasterIds.has(master.id);
                      return (
                        <div key={master.id} className={`master-item ${isAdded ? 'added' : ''}`}>
                          <label className="master-checkbox">
                            <input
                              type="checkbox"
                              checked={isAdded || selectedMasters.has(master.id)}
                              onChange={() => handleMasterSelection(master.id)}
                              disabled={isFinished || isAdded}
                            />
                            <span className="master-info">
                              <span className="master-name">{master.name}</span>
                              <span className="master-rank">({formatRank(master.rank)})</span>
                            </span>
                            {isAdded && <span className="master-added">追加済み</span>}
                          </label>
                        </div>
                      );
                    })}
                  </React.Fragment>
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
              onChange={(e) => handleNameChange(e.target.value)}
              onCompositionUpdate={handleNameCompositionUpdate}
              onCompositionEnd={handleNameCompositionEnd}
              placeholder="参加者名を入力"
              required
              disabled={isFinished}
            />
          </div>

          <div className="form-group">
            <label htmlFor="participant-reading">よみ:</label>
            <input
              id="participant-reading"
              type="text"
              value={reading}
              onChange={(e) => handleReadingChange(e.target.value)}
              placeholder="ひらがな"
              disabled={isFinished}
            />
            {/* 変換前のかなを拾えるかは端末のIME次第（スマホのキーボードでは
                かなの段階が取れないことがある）。自動で入る前提の書き方にしない */}
            <p className="form-hint">
              マスター一覧をあいうえお順に並べるために使います。
              氏名を変換したときに自動で入ります（入らなければ手入力してください）
            </p>
          </div>

          <div className="form-group">
            <label htmlFor="participant-rank">段位:</label>
            <select
              id="participant-rank"
              value={rank}
              onChange={(e) => setRank(Number(e.target.value))}
              disabled={isFinished}
            >
              {RANK_OPTIONS.map(r => (
                <option key={r} value={r}>{formatRank(r)}</option>
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
