/**
 * 危険な操作セクションコンポーネント
 */

import React from 'react';
import { storageManager } from '../../utils/StorageManager';

interface DangerSectionProps {
  onStatusUpdate: (message: string) => void;
}

const DangerSection: React.FC<DangerSectionProps> = ({ onStatusUpdate }) => {
  const handleClearAll = () => {
    if (window.confirm('🗑️ ローカルに保存された全てのデータを削除しますか？\n\n・現在の大会データが削除されます\n・全ての大会履歴が削除されます\n・参加者マスターが削除されます\n・この操作は取り消せません\n\n※出力済みのファイルは削除されません')) {
      storageManager.clearAllData();
      onStatusUpdate('✅ 全データを削除しました');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  };

  return (
    <div className="danger-section">
      <h3>⚠️ 危険な操作</h3>
      <button onClick={handleClearAll} className="danger-btn">
        🗑️ 全データ削除
      </button>
      <p className="description">
        ローカルに保存された全てのデータを削除します。
        この操作は取り消すことができません。
        削除前に必要なデータのエクスポートを行ってください。
      </p>
    </div>
  );
};

export default DangerSection;