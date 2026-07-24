/**
 * 大会履歴セクションコンポーネント
 */

import React, { useState } from 'react';
import { storageManager } from '../../utils/StorageManager';
import { exportToExcelWithBorders, exportToCSV } from '../../utils/excelExport';
import { useCompetition } from '../../contexts/CompetitionContext';
import ConfirmModal from '../ConfirmModal';
import { Competition } from '../../types';

interface CompetitionHistorySectionProps {
  onStatusUpdate: (message: string) => void;
}

/** 初期表示する大会数。古い大会まで一覧に出すと目的の大会を探しにくいので畳んでおく */
const INITIAL_VISIBLE_COUNT = 10;

const CompetitionHistorySection: React.FC<CompetitionHistorySectionProps> = ({
  onStatusUpdate
}) => {
  const competitionHistory = storageManager.getCompetitionHistory();
  // 削除対象が「現在の大会」だった場合、CompetitionContext側のstateが古いまま残る。
  // その判定に使う。
  const { state } = useCompetition();
  const [deleteTarget, setDeleteTarget] = useState<Competition | null>(null);
  const [showAll, setShowAll] = useState(false);

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

  const handleDelete = () => {
    if (!deleteTarget) return;
    // 削除前に「現在の大会」かどうかを確認しておく。deleteCompetitionでポインタは
    // 外れるが、CompetitionContextのReact stateは古いまま残るためリロードで作り直す。
    const wasCurrentCompetition = state.competition?.id === deleteTarget.id;
    storageManager.deleteCompetition(deleteTarget.id);
    onStatusUpdate(`✅ ${deleteTarget.name}を削除しました`);
    setDeleteTarget(null);
    if (wasCurrentCompetition) {
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  };

  const visibleHistory = showAll
    ? competitionHistory
    : competitionHistory.slice(0, INITIAL_VISIBLE_COUNT);

  return (
    <div className="history-section">
      <h3>📚 大会履歴</h3>
      {competitionHistory.length === 0 ? (
        <p>保存された大会がありません</p>
      ) : (
        <div className="history-list">
          {visibleHistory.map((competition) => (
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
          {competitionHistory.length > INITIAL_VISIBLE_COUNT && (
            <button
              type="button"
              className="history-toggle-btn"
              aria-expanded={showAll}
              onClick={() => setShowAll(!showAll)}
            >
              {showAll
                ? '折りたたむ'
                : `他 ${competitionHistory.length - INITIAL_VISIBLE_COUNT}件を表示`}
            </button>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={deleteTarget !== null}
        title={`${deleteTarget?.name ?? ''}を削除しますか？`}
        message={"・この大会の記録が削除されます\n・この操作は取り消せません\n\n※参加者マスターと他の大会は残ります\n※出力済みのファイルは削除されません"}
        confirmLabel="削除する"
        danger={true}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default CompetitionHistorySection;
