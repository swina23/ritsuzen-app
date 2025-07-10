import React, { useState } from 'react';
import { useCompetition } from '../contexts/CompetitionContext';
import StatusMessage from './data-manager/StatusMessage';
import StorageInfo from './data-manager/StorageInfo';
import DataExportSection from './data-manager/DataExportSection';
import DataImportSection from './data-manager/DataImportSection';
import ParticipantMasterSection from './data-manager/ParticipantMasterSection';
import CompetitionHistorySection from './data-manager/CompetitionHistorySection';
import DangerSection from './data-manager/DangerSection';

const DataManager: React.FC = () => {
  const { state } = useCompetition();
  const [importStatus, setImportStatus] = useState<string>('');
  
  const hasCurrentCompetition = !!state.competition;
  
  const handleStatusUpdate = (message: string) => {
    setImportStatus(message);
    setTimeout(() => setImportStatus(''), 3000);
  };
  
  const handleMastersUpdated = () => {
    // マスター更新時の処理（必要に応じて）
  };


  return (
    <div className="data-manager">
      <h2>データ管理</h2>
      
      <StorageInfo />
      
      <DataExportSection 
        hasCurrentCompetition={hasCurrentCompetition}
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
      
      <DangerSection 
        onStatusUpdate={handleStatusUpdate}
      />
    </div>
  );
};

export default DataManager;