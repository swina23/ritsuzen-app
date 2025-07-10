/**
 * データ出力セクションコンポーネント
 */

import React, { useCallback } from 'react';
import { exportAllData } from '../../utils/dataExport';
import { storageManager } from '../../utils/StorageManager';

interface DataExportSectionProps {
  onStatusUpdate: (message: string) => void;
}

const DataExportSection: React.FC<DataExportSectionProps> = React.memo(({ 
  onStatusUpdate 
}) => {
  const handleExportAll = useCallback(() => {
    try {
      exportAllData();
      onStatusUpdate('✅ 全データを出力しました');
    } catch (error) {
      console.error('Export failed:', error);
      onStatusUpdate('❌ 出力に失敗しました');
    }
  }, [onStatusUpdate]);

  const handleExportMasters = useCallback(() => {
    try {
      storageManager.exportParticipantMasters();
      onStatusUpdate('✅ 参加者マスターを出力しました');
    } catch (error) {
      console.error('Export failed:', error);
      onStatusUpdate('❌ 出力に失敗しました');
    }
  }, [onStatusUpdate]);

  return (
    <div className="data-export-section">
      <h3>📤 データ出力</h3>
      
      <div className="export-buttons">
        <button onClick={handleExportAll} className="export-btn">
          📋 全データ出力
        </button>
        
        <button onClick={handleExportMasters} className="export-btn">
          👥 参加者マスター
        </button>
      </div>
    </div>
  );
});

DataExportSection.displayName = 'DataExportSection';

export default DataExportSection;