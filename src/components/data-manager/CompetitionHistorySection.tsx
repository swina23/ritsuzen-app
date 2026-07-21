/**
 * 大会履歴セクションコンポーネント
 */

import React, { useState } from 'react';
import { useAllCompetitions, useAllParticipantMasters, useCompetitionHistory } from '../../hooks/useStorage';
import { exportToExcelWithBorders, exportToCSV } from '../../utils/excelExport';
import { calculateCareerStats } from '../../utils/careerStats';
import { storageManager } from '../../utils/StorageManager';
import { useCompetition } from '../../contexts/CompetitionContext';
import ConfirmModal from '../ConfirmModal';
import { Competition } from '../../types';

interface CompetitionHistorySectionProps {
  onStatusUpdate: (message: string) => void;
}

const CompetitionHistorySection: React.FC<CompetitionHistorySectionProps> = ({
  onStatusUpdate
}) => {
  const competitionHistory = useCompetitionHistory();
  // CompetitionContextはアプリ起動時に一度だけ「現在の大会」を読み込み、以降は
  // Firestoreの変更を監視し直さない。削除した大会が読み込み済みの現在の大会だった場合、
  // リロードしないとヘッダーや結果画面に消したはずの大会が残り続けてしまう。
  const { state } = useCompetition();
  const [deleteTarget, setDeleteTarget] = useState<Competition | null>(null);
  // Excelの2枚目シート用。過去の大会を出力するときも通算成績は「現時点の値」を載せる
  const allCompetitions = useAllCompetitions();
  const masters = useAllParticipantMasters();

  const handleExportHistoryExcel = async (competition: Competition) => {
    try {
      await exportToExcelWithBorders({
        competition,
        participants: competition.participants,
        records: competition.records,
        careerStats: calculateCareerStats(allCompetitions, masters)
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

  const handleDelete = () => {
    if (!deleteTarget) return;
    // CompetitionContext側のstate.competitionが古いまま残る不具合を避けるため、
    // 削除対象が「現在の大会」だったかをFirestore側の削除より前に確認しておく
    const wasCurrentCompetition = state.competition?.id === deleteTarget.id;
    storageManager.deleteCompetition(deleteTarget.id);
    onStatusUpdate(`✅ ${deleteTarget.name}を削除しました`);
    setDeleteTarget(null);
    if (wasCurrentCompetition) {
      // ページリロードしてCompetitionContextの状態を作り直す
      setTimeout(() => {
        window.location.reload();
      }, 1000);
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
                  {/* 入力途中のデータを誤って消さないよう、削除できるのは完了した大会だけ */}
                  {competition.status === 'finished' && (
                    <button
                      onClick={() => setDeleteTarget(competition)}
                      className="history-export-btn delete-btn"
                      title="この大会を削除"
                    >
                      🗑️ 削除
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {competitionHistory.length > 10 && (
            <p className="more-text">他 {competitionHistory.length - 10}件...</p>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={deleteTarget !== null}
        title={`${deleteTarget?.name ?? ''}を削除しますか？`}
        message={"・この大会の記録が削除されます\n・この大会の的中数は通算成績から外れます\n・クラウド上のデータなので、メンバー全員の端末から消えます\n・この操作は取り消せません\n\n※参加者マスターと他の大会は残ります\n※出力済みのファイルは削除されません"}
        confirmLabel="削除する"
        danger={true}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default CompetitionHistorySection;