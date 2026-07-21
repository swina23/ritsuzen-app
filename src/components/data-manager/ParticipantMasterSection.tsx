/**
 * 参加者マスター管理セクションコンポーネント
 */

import React, { useState, useMemo } from 'react';
import { storageManager } from '../../utils/StorageManager';
import { useAllParticipantMasters } from '../../hooks/useStorage';
import { formatRank } from '../../utils/formatters';
import { sortMastersByUsage } from '../../utils/arrayUtils';
import { formatJapaneseDate } from '../../utils/dateUtils';
import { RANK_OPTIONS } from '../../utils/constants';

interface ParticipantMasterSectionProps {
  onStatusUpdate: (message: string) => void;
}

const ParticipantMasterSection: React.FC<ParticipantMasterSectionProps> = ({ 
  onStatusUpdate 
}) => {
  const allMasters = useAllParticipantMasters();
  const masters = useMemo(() => sortMastersByUsage(allMasters), [allMasters]);
  const [showMasters, setShowMasters] = useState(false);
  const [editTarget, setEditTarget] = useState<{ id: string; name: string; rank: number } | null>(null);

  // 一覧はFirestoreの購読経由で自動更新されるため、手動での再読み込みは不要。
  // 「無効」バッジがその場で付くので完了メッセージは出さない
  const handleToggleMasterActive = (masterId: string, currentActive: boolean) => {
    storageManager.updateParticipantMaster(masterId, { isActive: !currentActive });
  };

  const handleSaveEdit = () => {
    if (!editTarget) return;
    const name = editTarget.name.trim();

    if (!name) {
      onStatusUpdate('❌ 氏名を入力してください');
      return;
    }

    // 同名のマスターが2件あると通算成績の名寄せが効かなくなるため、改名で作らせない。
    // 既存側もtrimして比べる（空白付きで保存された古いデータをすり抜けさせないため）
    const duplicate = masters.find(
      (master) => master.id !== editTarget.id && master.name.trim() === name
    );
    if (duplicate) {
      onStatusUpdate(`❌ 「${name}」は既に登録されています`);
      return;
    }

    storageManager.updateParticipantMaster(editTarget.id, { name, rank: editTarget.rank });
    onStatusUpdate(`✅ 「${name}」を更新しました`);
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
                        <span className="master-rank">({formatRank(master.rank)})</span>
                        <span className="master-usage">使用回数: {master.usageCount}</span>
                        <span className="master-last-used">
                          最終使用: {formatJapaneseDate(master.lastUsed)}
                        </span>
                        {!master.isActive && <span className="inactive-badge">無効</span>}
                      </div>
                      <div className="master-actions">
                        <button
                          onClick={() => setEditTarget({ id: master.id, name: master.name, rank: master.rank })}
                          className="master-edit-btn"
                          title="氏名・段位を編集"
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