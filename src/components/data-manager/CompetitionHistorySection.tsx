/**
 * 大会履歴セクションコンポーネント
 */

import React from 'react';
import { storageManager } from '../../utils/StorageManager';
import { exportToExcelWithBorders, exportToCSV } from '../../utils/excelExport';
import { Competition } from '../../types';

interface CompetitionHistorySectionProps {
  onStatusUpdate: (message: string) => void;
}

const CompetitionHistorySection: React.FC<CompetitionHistorySectionProps> = ({ 
  onStatusUpdate 
}) => {
  const competitionHistory = storageManager.getCompetitionHistory();

  const handleExportHistoryExcel = async (competition: Competition) => {
    try {
      await exportToExcelWithBorders({
        competition,
        participants: competition.participants,
        records: competition.records
      });
      onStatusUpdate(`✅ ${competition.name}をExcel出力しました`);
    } catch (error) {
      console.error('Excel export failed:', error);
      onStatusUpdate('❌ Excel出力に失敗しました');
    }
  };

  const handleExportHistoryCSV = (competition: Competition) => {
    try {
      exportToCSV({
        competition,
        participants: competition.participants,
        records: competition.records
      });
      onStatusUpdate(`✅ ${competition.name}をCSV出力しました`);
    } catch (error) {
      console.error('CSV export failed:', error);
      onStatusUpdate('❌ CSV出力に失敗しました');
    }
  };

  return (
    <div className="history-section">
      <h3>📚 大会履歴</h3>
      {competitionHistory.length === 0 ? (
        <p>保存された大会がありません</p>
      ) : (
        <div className="history-list">
          {competitionHistory.slice(0, 10).map((competition) => (
            <div key={competition.id} className="history-item">
              <div className="competition-info">
                <div className="competition-details">
                  <strong>{competition.name}</strong>
                  <span className="date">{competition.date}</span>
                  <span className="participants">{competition.participants.length}名参加</span>
                  <span className={`status ${competition.status}`}>
                    {competition.status === 'finished' && '完了'}
                    {competition.status === 'inProgress' && '進行中'}
                    {competition.status === 'created' && '作成済み'}
                  </span>
                </div>
                <div className="history-actions">
                  <button 
                    onClick={() => handleExportHistoryExcel(competition)}
                    className="history-export-btn excel-btn"
                    title="Excel出力"
                  >
                    📊 Excel
                  </button>
                  <button 
                    onClick={() => handleExportHistoryCSV(competition)}
                    className="history-export-btn csv-btn"
                    title="CSV出力"
                  >
                    📋 CSV
                  </button>
                </div>
              </div>
            </div>
          ))}
          {competitionHistory.length > 10 && (
            <p className="more-text">他 {competitionHistory.length - 10}件...</p>
          )}
        </div>
      )}
    </div>
  );
};

export default CompetitionHistorySection;