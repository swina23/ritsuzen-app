import React, { useState, useRef } from 'react';
import { useCompetition } from '../contexts/CompetitionContext';
import { exportAllData, exportCompetition, importData, ExportData } from '../utils/dataExport';
import { exportToExcel, exportToExcelWithBorders, exportToCSV } from '../utils/excelExport';
import { 
  getCompetitionHistory, 
  clearAllData, 
  getStorageInfo, 
  saveCurrentCompetition, 
  saveCompetitionToHistory,
  getAllParticipantMasters,
  exportParticipantMasters,
  importParticipantMasters,
  deleteParticipantMaster,
  updateParticipantMaster
} from '../utils/localStorage';
import { ParticipantMaster, Competition } from '../types';
import { formatRank } from '../utils/formatters';

const DataManager: React.FC = () => {
  const { state } = useCompetition();
  const [importStatus, setImportStatus] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const masterFileInputRef = useRef<HTMLInputElement>(null);
  const [masters, setMasters] = useState<ParticipantMaster[]>([]);
  const [showMasters, setShowMasters] = useState(false);
  const storageInfo = getStorageInfo();
  const competitionHistory = getCompetitionHistory();
  
  // マスター一覧を読み込み
  const loadMasters = () => {
    const masterList = getAllParticipantMasters();
    setMasters(masterList.sort((a, b) => {
      if (a.usageCount !== b.usageCount) {
        return b.usageCount - a.usageCount;
      }
      return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
    }));
  };
  
  React.useEffect(() => {
    loadMasters();
  }, []);

  const handleExportAll = () => {
    try {
      exportAllData();
      setImportStatus('✅ 全データを出力しました');
      setTimeout(() => setImportStatus(''), 3000);
    } catch (error) {
      setImportStatus('❌ 出力に失敗しました');
      setTimeout(() => setImportStatus(''), 3000);
    }
  };

  const handleExportCurrent = () => {
    if (!state.competition) {
      setImportStatus('❌ 出力する大会データがありません');
      setTimeout(() => setImportStatus(''), 3000);
      return;
    }

    try {
      exportCompetition(state.competition);
      setImportStatus('✅ 現在の大会データを出力しました');
      setTimeout(() => setImportStatus(''), 3000);
    } catch (error) {
      setImportStatus('❌ 出力に失敗しました');
      setTimeout(() => setImportStatus(''), 3000);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportStatus('📥 データを読み込み中...');

    try {
      const importedData: ExportData = await importData(file);
      
      // 全データ形式の場合
      if (importedData.competitions) {
        // 現在の大会をセット
        if (importedData.currentCompetition) {
          saveCurrentCompetition(importedData.currentCompetition);
        }
        
        // 履歴をセット
        for (const competition of importedData.competitions) {
          saveCompetitionToHistory(competition);
        }
        
        setImportStatus(`✅ ${importedData.competitions.length}件の大会データを読み込みました`);
      }
      // 個別大会データ形式の場合
      else if (importedData.competition) {
        saveCompetitionToHistory(importedData.competition);
        
        // 進行中の大会の場合は現在の大会としてもセット
        if (importedData.competition.status !== 'finished') {
          saveCurrentCompetition(importedData.competition);
        }
        
        setImportStatus(`✅ 大会「${importedData.competition.name}」を読み込みました`);
      }
      
      // ステータスメッセージを3秒後にクリア（リロードなし）
      setTimeout(() => {
        setImportStatus('');
      }, 3000);
      
    } catch (error) {
      setImportStatus(`❌ ${(error as Error).message}`);
      setTimeout(() => setImportStatus(''), 5000);
    }

    // ファイル入力をリセット
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleExportMasters = () => {
    try {
      exportParticipantMasters();
      setImportStatus('✅ 参加者マスターを出力しました');
      setTimeout(() => setImportStatus(''), 3000);
    } catch (error) {
      setImportStatus('❌ マスター出力に失敗しました');
      setTimeout(() => setImportStatus(''), 3000);
    }
  };

  const handleImportMasters = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportStatus('📥 マスターデータを読み込み中...');

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const importedCount = importParticipantMasters(data);
      
      if (importedCount > 0) {
        setImportStatus(`✅ ${importedCount}名の参加者マスターを読み込みました`);
        loadMasters(); // リストを更新
      } else {
        setImportStatus('ℹ️ 新規参加者はありませんでした（重複を除外）');
      }
      
      setTimeout(() => setImportStatus(''), 3000);
    } catch (error) {
      setImportStatus('❌ マスターファイルの読み込みに失敗しました');
      setTimeout(() => setImportStatus(''), 3000);
    }

    if (masterFileInputRef.current) {
      masterFileInputRef.current.value = '';
    }
  };

  const handleDeleteMaster = (masterId: string, masterName: string) => {
    if (window.confirm(`「${masterName}」を削除しますか？\n\nこの操作は取り消せません。`)) {
      deleteParticipantMaster(masterId);
      loadMasters();
      setImportStatus(`✅ 「${masterName}」を削除しました`);
      setTimeout(() => setImportStatus(''), 3000);
    }
  };

  const handleToggleMasterActive = (masterId: string, currentActive: boolean) => {
    updateParticipantMaster(masterId, { isActive: !currentActive });
    loadMasters();
    setImportStatus(`✅ 参加者を${currentActive ? '無効化' : '有効化'}しました`);
    setTimeout(() => setImportStatus(''), 3000);
  };

  const handleClearAll = () => {
    if (window.confirm('🗑️ ローカルに保存された全てのデータを削除しますか？\n\n・現在の大会データが削除されます\n・全ての大会履歴が削除されます\n・参加者マスターが削除されます\n・この操作は取り消せません\n\n※出力済みのファイルは削除されません')) {
      clearAllData();
      setImportStatus('✅ 全データを削除しました');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  };

  const handleExportHistoryExcel = async (competition: Competition) => {
    try {
      await exportToExcelWithBorders({
        competition,
        participants: competition.participants,
        records: competition.records
      });
      setImportStatus(`✅ ${competition.name}をExcel出力しました`);
      setTimeout(() => setImportStatus(''), 3000);
    } catch (error) {
      setImportStatus('❌ Excel出力に失敗しました');
      setTimeout(() => setImportStatus(''), 3000);
    }
  };

  const handleExportHistoryCSV = (competition: Competition) => {
    try {
      exportToCSV({
        competition,
        participants: competition.participants,
        records: competition.records
      });
      setImportStatus(`✅ ${competition.name}をCSV出力しました`);
      setTimeout(() => setImportStatus(''), 3000);
    } catch (error) {
      setImportStatus('❌ CSV出力に失敗しました');
      setTimeout(() => setImportStatus(''), 3000);
    }
  };

  return (
    <div className="data-manager">
      <h2>データ管理</h2>
      
      <div className="storage-info">
        <h3>ストレージ情報</h3>
        <div className="info-grid">
          <div className="info-item">
            <span className="label">保存済み大会:</span>
            <span className="value">{storageInfo.itemCount}件</span>
          </div>
          <div className="info-item">
            <span className="label">使用容量:</span>
            <span className="value">{storageInfo.size}</span>
          </div>
          <div className="info-item">
            <span className="label">最終更新:</span>
            <span className="value">{new Date(storageInfo.lastUpdated).toLocaleString('ja-JP')}</span>
          </div>
        </div>
      </div>

      <div className="export-section">
        <h3>📤 データ出力</h3>
        <div className="button-group">
          <button onClick={handleExportAll} className="export-btn">
            📦 全データ出力
          </button>
          <button 
            onClick={handleExportCurrent} 
            className="export-btn"
            disabled={!state.competition}
          >
            📄 現在の大会出力
          </button>
          <button onClick={handleExportMasters} className="export-btn master-btn">
            👥 参加者マスター出力
          </button>
        </div>
        <p className="description">
          JSONファイルとしてダウンロードされます。他の端末でのデータ読み込みに使用できます。
        </p>
      </div>

      <div className="import-section">
        <h3>📥 データ読み込み</h3>
        <div className="button-group">
          <label className="import-btn">
            📁 大会データ読み込み
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImport}
              style={{ display: 'none' }}
            />
          </label>
          <label className="import-btn master-btn">
            👥 参加者マスターを読み込み
            <input
              ref={masterFileInputRef}
              type="file"
              accept=".json"
              onChange={handleImportMasters}
              style={{ display: 'none' }}
            />
          </label>
        </div>
        <p className="description">
          出力したJSONファイルからデータを読み込みます。既存のデータに追加されます。
        </p>
      </div>

      {importStatus && (
        <div className="status-message">
          {importStatus}
        </div>
      )}

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
                          最終使用: {new Date(master.lastUsed).toLocaleDateString('ja-JP')}
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
                        <button
                          onClick={() => handleDeleteMaster(master.id, master.name)}
                          className="delete-btn"
                          title="削除"
                        >
                          削除
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
    </div>
  );
};

export default DataManager;