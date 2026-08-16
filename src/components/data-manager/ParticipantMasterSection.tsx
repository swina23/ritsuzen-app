/**
 * 参加者マスター管理セクションコンポーネント
 */

import React, { useState, useMemo } from 'react';
import { storageManager } from '../../utils/StorageManager';
import { normalizeParticipantName, participantNameKey } from '../../utils/participantName';
import { useAllParticipantMasters } from '../../hooks/useStorage';
import { formatRank } from '../../utils/formatters';
import { sortMastersByReading } from '../../utils/arrayUtils';
import { RANK_OPTIONS } from '../../utils/constants';

interface ParticipantMasterSectionProps {
  onStatusUpdate: (message: string) => void;
}

const ParticipantMasterSection: React.FC<ParticipantMasterSectionProps> = ({ 
  onStatusUpdate 
}) => {
  const allMasters = useAllParticipantMasters();
  const masters = useMemo(() => sortMastersByReading(allMasters), [allMasters]);
  const [showMasters, setShowMasters] = useState(false);
  const [editTarget, setEditTarget] = useState<{ id: string; name: string; reading: string; rank: number } | null>(null);
  // よみ一括入力。開いた時点の対象と下書きをそのまま持ち続ける。
  // 表示を購読中の一覧から作ると、別端末で誰かのよみが保存された瞬間に
  // その行が消え、入力途中の文字ごと失われるため。
  // 保存を押すまで書き込まないのも同じ理由（1件ずつ書くと一覧が並び替わる）
  const [readingBulk, setReadingBulk] = useState<{
    targets: { id: string; name: string }[];
    drafts: Record<string, string>;
  } | null>(null);

  // よみが未設定の人。一覧を五十音順に並べるにはこの人たちを埋める必要がある
  const missingReadingMasters = useMemo(
    () => masters.filter((master) => !master.reading),
    [masters]
  );

  const handleStartReadingBulk = () => {
    setReadingBulk({
      targets: missingReadingMasters.map((master) => ({ id: master.id, name: master.name })),
      drafts: {},
    });
  };

  const handleSaveReadingBulk = () => {
    if (!readingBulk) return;
    // 開いている間に別端末で入ったよみは上書きしない。
    // 相手の入力を、こちらの古い画面の値で消してしまわないため
    const alreadySet = new Set(
      allMasters.filter((master) => master.reading).map((master) => master.id)
    );
    const entries = Object.entries(readingBulk.drafts).filter(
      ([id, reading]) => reading.trim() && !alreadySet.has(id)
    );
    entries.forEach(([id, reading]) => {
      storageManager.updateParticipantMaster(id, { reading });
    });
    setReadingBulk(null);
    onStatusUpdate(
      entries.length > 0
        ? `✅ ${entries.length}名のよみを保存しました`
        : 'よみが入力されていないため、保存しませんでした'
    );
  };

  // 一覧はFirestoreの購読経由で自動更新されるため、手動での再読み込みは不要。
  // 「無効」バッジがその場で付くので完了メッセージは出さない
  const handleToggleMasterActive = (masterId: string, currentActive: boolean) => {
    storageManager.updateParticipantMaster(masterId, { isActive: !currentActive });
  };

  const handleSaveEdit = () => {
    if (!editTarget) return;
    // 登録時と同じく全角括弧は半角に揃える
    const name = normalizeParticipantName(editTarget.name);

    if (!name) {
      onStatusUpdate('❌ 氏名を入力してください');
      return;
    }

    // 同名のマスターが2件あると通算成績の名寄せが効かなくなるため、改名で作らせない。
    // 比較は空白・括弧の表記ゆれを吸収して行う（見た目が同じ別マスターを防ぐため）
    const nameKey = participantNameKey(name);
    const duplicate = masters.find(
      (master) => master.id !== editTarget.id && participantNameKey(master.name) === nameKey
    );
    if (duplicate) {
      // 表記ゆれを無視して引き当てるため、入力した氏名ではなく
      // 実際にぶつかった相手を出す（「同じに見えないのに重複」と見えないように）
      onStatusUpdate(`❌ 「${duplicate.name}」は既に登録されています`);
      return;
    }

    // 一覧の表示がその場で変わるので完了メッセージは出さない
    storageManager.updateParticipantMaster(editTarget.id, {
      name,
      reading: editTarget.reading,
      rank: editTarget.rank,
    });
    setEditTarget(null);
  };

  return (
    <div className="masters-section">
      <div className="masters-header">
        <h3>👥 参加者マスター</h3>
        <button 
          onClick={() => setShowMasters(!showMasters)}
          className="toggle-btn"
        >
          {showMasters ? '▼' : '▶'} 管理 ({masters.length}名)
        </button>
      </div>
      
      {showMasters && (
        <div className="masters-content">
          {/* よみは一覧の並び順に使うため、未設定の人はまとめて埋められるようにしている。
              1人ずつ編集を開くより手数が少ない */}
          {masters.length > 0 && missingReadingMasters.length > 0 && !readingBulk && (
            <div className="reading-bulk-notice">
              <span>よみ未設定が{missingReadingMasters.length}名います（一覧の末尾に並びます）</span>
              <button onClick={handleStartReadingBulk} className="reading-bulk-btn">
                よみをまとめて入力
              </button>
            </div>
          )}

          {readingBulk && (
            <div className="reading-bulk">
              <p className="reading-bulk-hint">
                ひらがなで入力してください。空欄のままの人は未設定のまま残ります
              </p>
              <div className="reading-bulk-list">
                {readingBulk.targets.map(target => (
                  <div key={target.id} className="reading-bulk-row">
                    <span className="reading-bulk-name">{target.name}</span>
                    <input
                      type="text"
                      value={readingBulk.drafts[target.id] ?? ''}
                      onChange={(e) =>
                        setReadingBulk({
                          ...readingBulk,
                          drafts: { ...readingBulk.drafts, [target.id]: e.target.value },
                        })
                      }
                      placeholder="よみ"
                      className="reading-bulk-input"
                    />
                  </div>
                ))}
              </div>
              <div className="reading-bulk-actions">
                <button onClick={handleSaveReadingBulk} className="master-edit-save">
                  まとめて保存
                </button>
                <button onClick={() => setReadingBulk(null)} className="master-edit-cancel">
                  キャンセル
                </button>
              </div>
            </div>
          )}

          {masters.length === 0 ? (
            <p>登録された参加者マスターがありません</p>
          ) : (
            <div className="masters-list">
              {masters.map(master => (
                <div key={master.id} className={`master-item ${!master.isActive ? 'inactive' : ''}`}>
                  {editTarget?.id === master.id ? (
                    <div className="master-edit">
                      <input
                        type="text"
                        value={editTarget.name}
                        onChange={(e) => setEditTarget({ ...editTarget, name: e.target.value })}
                        className="master-edit-name"
                        placeholder="氏名"
                        autoFocus
                      />
                      <input
                        type="text"
                        value={editTarget.reading}
                        onChange={(e) => setEditTarget({ ...editTarget, reading: e.target.value })}
                        className="master-edit-reading"
                        placeholder="よみ（ひらがな）"
                      />
                      <select
                        value={editTarget.rank}
                        onChange={(e) => setEditTarget({ ...editTarget, rank: Number(e.target.value) })}
                        className="master-edit-rank"
                      >
                        {RANK_OPTIONS.map(r => (
                          <option key={r} value={r}>{formatRank(r)}</option>
                        ))}
                      </select>
                      <div className="master-actions">
                        <button onClick={handleSaveEdit} className="master-edit-save">
                          保存
                        </button>
                        <button onClick={() => setEditTarget(null)} className="master-edit-cancel">
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="master-info">
                      <div className="master-details">
                        <strong>{master.name}</strong>
                        {/* よみは並び順を決めるので、入っているか一目で分かるようにしておく */}
                        <span className={`master-reading ${master.reading ? '' : 'unset'}`}>
                          {master.reading || 'よみ未設定'}
                        </span>
                        <span className="master-rank">({formatRank(master.rank)})</span>
                      </div>
                      <div className="master-actions">
                        <button
                          onClick={() => setEditTarget({
                            id: master.id,
                            name: master.name,
                            reading: master.reading ?? '',
                            rank: master.rank,
                          })}
                          className="master-edit-btn"
                          title="氏名・よみ・段位を編集"
                        >
                          編集
                        </button>
                        <button
                          onClick={() => handleToggleMasterActive(master.id, master.isActive)}
                          className={`toggle-active-btn ${master.isActive ? 'deactivate' : 'activate'}`}
                          title={master.isActive ? '無効化' : '有効化'}
                        >
                          {master.isActive ? '無効化' : '有効化'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ParticipantMasterSection;