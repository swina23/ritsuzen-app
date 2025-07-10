/**
 * データ出力セクションコンポーネント
 */

import React, { useCallback, useMemo } from 'react';
import { useCompetition } from '../../contexts/CompetitionContext';
import { exportAllData, exportCompetition } from '../../utils/dataExport';
import { exportToExcelWithBorders, exportToCSV } from '../../utils/excelExport';
import { storageManager } from '../../utils/StorageManager';

interface DataExportSectionProps {
  hasCurrentCompetition: boolean;
  onStatusUpdate: (message: string) => void;
}

const DataExportSection: React.FC<DataExportSectionProps> = React.memo(({ 
  hasCurrentCompetition, 
  onStatusUpdate 
}) => {
  const { state } = useCompetition();

  const exportData = useMemo(() => {
    if (!state.competition) return null;
    return {
      competition: state.competition,
      participants: state.competition.participants,
      records: state.competition.records
    };
  }, [state.competition]);

  const handleExportAll = useCallback(() => {
    try {
      exportAllData();
      onStatusUpdate('✅ 全データを出力しました');
    } catch (error) {
      console.error('Export failed:', error);
      onStatusUpdate('❌ 出力に失敗しました');
    }
  }, [onStatusUpdate]);

  const handleExportCurrent = useCallback(() => {
    try {
      if (!state.competition) {
        onStatusUpdate('❌ 現在の大会がありません');
        return;
      }
      exportCompetition(state.competition);
      onStatusUpdate('✅ 現在の大会データを出力しました');
    } catch (error) {
      console.error('Export failed:', error);
      onStatusUpdate('❌ 出力に失敗しました');
    }
  }, [state.competition, onStatusUpdate]);

  const handleExportMasters = useCallback(() => {
    try {
      storageManager.exportParticipantMasters();
      onStatusUpdate('✅ 参加者マスターを出力しました');
    } catch (error) {
      console.error('Export failed:', error);
      onStatusUpdate('❌ 出力に失敗しました');
    }
  }, [onStatusUpdate]);

  const handleExcelExport = useCallback(() => {
    try {
      if (!exportData) {
        onStatusUpdate('❌ 現在の大会がありません');
        return;
      }
      
      exportToExcelWithBorders(exportData);
      onStatusUpdate('✅ Excelファイルを出力しました');
    } catch (error) {
      console.error('Excel export failed:', error);
      onStatusUpdate('❌ Excel出力に失敗しました');
    }
  }, [exportData, onStatusUpdate]);

  const handleCSVExport = useCallback(() => {
    try {
      if (!exportData) {
        onStatusUpdate('❌ 現在の大会がありません');
        return;
      }
      
      exportToCSV(exportData);
      onStatusUpdate('✅ CSVファイルを出力しました');
    } catch (error) {
      console.error('CSV export failed:', error);
      onStatusUpdate('❌ CSV出力に失敗しました');
    }
  }, [exportData, onStatusUpdate]);

  return (
    <div className="data-export-section">
      <h3>📤 データ出力</h3>
      
      <div className="export-buttons">
        <button onClick={handleExportAll} className="export-btn">
          📋 全データ出力
        </button>
        
        <button 
          onClick={handleExportCurrent} 
          className="export-btn"
          disabled={!hasCurrentCompetition}
          title={!hasCurrentCompetition ? '現在の大会がありません' : ''}
        >
          🏹 現在の大会
        </button>
        
        <button onClick={handleExportMasters} className="export-btn">
          👥 参加者マスター
        </button>
      </div>

      {hasCurrentCompetition && (
        <div className="current-competition-export">
          <h4>現在の大会: {state.competition?.name}</h4>
          <div className="competition-export-buttons">
            <button onClick={handleExcelExport} className="export-btn excel">
              📊 Excel
            </button>
            <button onClick={handleCSVExport} className="export-btn csv">
              📄 CSV
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

DataExportSection.displayName = 'DataExportSection';

export default DataExportSection;