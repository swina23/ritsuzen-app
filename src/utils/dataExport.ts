import { Competition } from '../types';
import { storageManager } from './StorageManager';
import { formatRank } from './formatters';
import { getTodayJapaneseDate } from './dateUtils';

export interface ExportData {
  version: string;
  exportDate: string;
  currentCompetition?: Competition | null;
  competitions?: Competition[];
  competition?: Competition; // 個別大会データ用
  metadata: {
    totalCompetitions?: number;
    appVersion?: string;
    competitionName?: string;
    competitionDate?: string;
    participantCount?: number;
  };
}

// 全データをJSONファイルとしてエクスポート
export const exportAllData = (): void => {
  try {
    const competitions = storageManager.getCompetitionHistory();
    const currentCompetition = competitions.find(c => c.status !== 'finished') || null;
    
    const exportData: ExportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      currentCompetition,
      competitions,
      metadata: {
        totalCompetitions: competitions.length,
        appVersion: '1.0.3'
      }
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `ritsuzen-all-data-${getTodayJapaneseDate()}.json`;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to export data:', error);
    throw new Error('データの出力に失敗しました');
  }
};

// 特定の大会データをエクスポート
export const exportCompetition = (competition: Competition): void => {
  try {
    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      competition,
      metadata: {
        competitionName: competition.name,
        competitionDate: competition.date,
        participantCount: competition.participants.length
      }
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${competition.name}-${competition.date}.json`;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to export competition:', error);
    throw new Error('大会データの出力に失敗しました');
  }
};

// インポート結果の型定義
export interface ImportResult {
  success: boolean;
  error?: string;
  data?: ExportData;
}

// ファイルからデータをインポート
export const importData = (file: File): Promise<ImportResult> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const jsonString = event.target?.result as string;
        const data = JSON.parse(jsonString) as ExportData;
        
        // データ形式の検証
        if (!validateImportData(data)) {
          resolve({ success: false, error: '無効なデータ形式です' });
          return;
        }
        
        resolve({ success: true, data });
      } catch (error) {
        resolve({ success: false, error: 'ファイルの読み込みに失敗しました' });
      }
    };
    
    reader.onerror = () => {
      resolve({ success: false, error: 'ファイルの読み込みに失敗しました' });
    };
    
    reader.readAsText(file);
  });
};

// インポートデータの検証
const validateImportData = (data: any): data is ExportData => {
  if (!data || typeof data !== 'object') return false;
  if (!data.version || !data.exportDate) return false;
  
  // 全データ形式の場合
  if (Array.isArray(data.competitions)) {
    for (const competition of data.competitions) {
      if (!competition.id || !competition.name || !competition.date) return false;
      if (!['20', '50'].includes(competition.type)) return false;
      if (!['created', 'inProgress', 'finished'].includes(competition.status)) return false;
    }
    return true;
  }
  
  // 個別大会データ形式の場合
  if (data.competition) {
    const competition = data.competition;
    if (!competition.id || !competition.name || !competition.date) return false;
    if (!['20', '50'].includes(competition.type)) return false;
    if (!['created', 'inProgress', 'finished'].includes(competition.status)) return false;
    return true;
  }
  
  return false;
};

// CSVフォーマットでの大会結果エクスポート
export const exportCompetitionAsCSV = (competition: Competition): void => {
  try {
    const headers = ['順位', '参加者名', '段位'];
    
    // 立数に応じて動的にヘッダーを追加
    for (let i = 1; i <= competition.roundsCount; i++) {
      headers.push(`${i}立`);
    }
    
    headers.push('的中', '的中率');
    
    if (competition.handicapEnabled) {
      headers.push('調整前順位', 'ハンデ', '調整後的中', 'ハンデ調整後順位');
    }
    
    const csvData = [headers];
    
    // 参加者の順番（order）でソート
    const sortedRecords = [...competition.records].sort((a, b) => {
      const participantA = competition.participants.find(p => p.id === a.participantId);
      const participantB = competition.participants.find(p => p.id === b.participantId);
      
      if (!participantA || !participantB) return 0;
      
      const orderA = participantA.order || 0;
      const orderB = participantB.order || 0;
      
      return orderA - orderB;
    });
    
    sortedRecords.forEach((record, _index) => {
      const participant = competition.participants.find(p => p.id === record.participantId);
      if (!participant) return;
      
      const displayRank = competition.handicapEnabled ? record.rankWithHandicap : record.rank;
      
      const row = [
        displayRank.toString(),
        participant.name,
        formatRank(participant.rank),
        ...record.rounds.map(round => round.hits.toString()),
        record.totalHits.toString(),
        `${(record.hitRate * 100).toFixed(1)}%`
      ];
      
      if (competition.handicapEnabled) {
        row.push(
          record.rank.toString(),
          record.handicap.toString(),
          record.adjustedScore.toString(),
          record.rankWithHandicap.toString()
        );
      }
      
      csvData.push(row);
    });
    
    const csvContent = csvData.map(row => 
      row.map(cell => `"${cell}"`).join(',')
    ).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${competition.name}-${competition.date}-results.csv`;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to export CSV:', error);
    throw new Error('CSV出力に失敗しました');
  }
};