/**
 * 参加者マスター管理セクションコンポーネント
 */

import React, { useState, useMemo } from 'react';
import { storageManager } from '../../utils/StorageManager';
import { useAllParticipantMasters } from '../../hooks/useStorage';
import { formatRank } from '../../utils/formatters';
import { sortMastersByUsage } from '../../utils/arrayUtils';
import { formatJapaneseDate } from '../../utils/dateUtils';

interface ParticipantMasterSectionProps {
  onStatusUpdate: (message: string) => void;
}

const ParticipantMasterSection: React.FC<ParticipantMasterSectionProps> = ({ 
  onStatusUpdate 
}) => {
  const allMasters = useAllParticipantMasters();
  const masters = useMemo(() => sortMastersByUsage(allMasters), [allMasters]);
  const [showMasters, setShowMasters] = useState(false);

  // 一覧はFirestoreの購読経由で自動更新されるため、手動での再読み込みは不要
  const handleToggleMasterActive = (masterId: string, currentActive: boolean) => {
    storageManager.updateParticipantMaster(masterId, { isActive: !currentActive });
    onStatusUpdate(`✅ 参加者を${currentActive ? '無効化' : '有効化'}しました`);
  };

  // 外部からマスター一覧を更新するためのメソッドを公開（未使用のため削除）
  // React.useImperativeHandle を削除

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
                        onClick={() => handleToggleMasterActive(master.id, master.isActive)}
                        className={`toggle-active-btn ${master.isActive ? 'deactivate' : 'activate'}`}
                        title={master.isActive ? '無効化' : '有効化'}
                      >
                        {master.isActive ? '無効化' : '有効化'}
                      </button>
                    </div>
                  </div>
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