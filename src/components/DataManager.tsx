import React, { useRef, useState } from 'react';
import StatusMessage from './data-manager/StatusMessage';
import StorageInfo from './data-manager/StorageInfo';
import DataExportSection from './data-manager/DataExportSection';
import DataImportSection from './data-manager/DataImportSection';
import ParticipantMasterSection from './data-manager/ParticipantMasterSection';
import CompetitionHistorySection from './data-manager/CompetitionHistorySection';

const DataManager: React.FC = () => {
  const [importStatus, setImportStatus] = useState<string>('');
  
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleStatusUpdate = (message: string) => {
    setImportStatus(message);
    // 直前のメッセージのタイマーが残っていると、新しいメッセージまで3秒以内に消されてしまう
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    clearTimerRef.current = null;
    // 失敗は消さない。エラー内容をスクショで送ってもらえるよう、読み終わるまで残しておく
    if (message.startsWith('❌')) return;
    clearTimerRef.current = setTimeout(() => setImportStatus(''), 3000);
  };
  
  const handleMastersUpdated = () => {
    // マスター更新時の処理（必要に応じて）
  };


  return (
    <div className="data-manager">
      <h2>データ管理</h2>
      
      <StorageInfo />
      
      <DataExportSection 
        onStatusUpdate={handleStatusUpdate}
      />
      
      <DataImportSection 
        onStatusUpdate={handleStatusUpdate}
        onMastersUpdated={handleMastersUpdated}
      />
      
      <StatusMessage message={importStatus} />
      
      <ParticipantMasterSection 
        onStatusUpdate={handleStatusUpdate}
      />
      
      <CompetitionHistorySection
        onStatusUpdate={handleStatusUpdate}
      />
    </div>
  );
};

export default DataManager;