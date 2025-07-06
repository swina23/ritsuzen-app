import * as XLSX from 'xlsx';
import { Competition, Participant, ParticipantRecord } from '../types';
import { formatRank } from './formatters';

export interface ExcelExportData {
  competition: Competition;
  participants: Participant[];
  records: ParticipantRecord[];
}

export const exportToExcel = (data: ExcelExportData): void => {
  const { competition, participants, records } = data;
  
  // 新しいワークブックを作成
  const workbook = XLSX.utils.book_new();
  
  // メインデータシートを作成
  const mainSheetData = createMainSheetData(competition, participants, records);
  const mainSheet = XLSX.utils.aoa_to_sheet(mainSheetData);
  
  // 列幅の設定
  const colWidths = [
    { wch: 12 }, // 参加者名
    { wch: 6 },  // 段位
    { wch: 4 },  // 1射
    { wch: 4 },  // 2射
    { wch: 4 },  // 3射
    { wch: 4 },  // 4射
    { wch: 6 },  // 1計
    { wch: 4 },  // 5射
    { wch: 4 },  // 6射
    { wch: 4 },  // 7射
    { wch: 4 },  // 8射
    { wch: 6 },  // 2計
    { wch: 4 },  // 9射
    { wch: 4 },  // 10射
    { wch: 4 },  // 11射
    { wch: 4 },  // 12射
    { wch: 6 },  // 3計
    { wch: 4 },  // 13射
    { wch: 4 },  // 14射
    { wch: 4 },  // 15射
    { wch: 4 },  // 16射
    { wch: 6 },  // 4計
    { wch: 4 },  // 17射
    { wch: 4 },  // 18射
    { wch: 4 },  // 19射
    { wch: 4 },  // 20射
    { wch: 6 },  // 5計
    { wch: 8 },  // 的中計
    { wch: 6 },  // 矢数
    { wch: 8 },  // 的中率
    { wch: 6 },  // 順位
  ];
  
  if (competition.handicapEnabled) {
    colWidths.push(
      { wch: 8 },  // ハンデ
      { wch: 8 },  // 換算後
      { wch: 8 }   // ハンデ順位
    );
  }
  
  mainSheet['!cols'] = colWidths;
  
  // シートを追加
  const sheetName = competition.date.replace(/-/g, '');
  XLSX.utils.book_append_sheet(workbook, mainSheet, sheetName);
  
  // ファイル名を生成
  const fileName = `立禅の会${competition.date.replace(/-/g, '')}.xlsx`;
  
  // ファイルをダウンロード
  XLSX.writeFile(workbook, fileName);
};

const createMainSheetData = (
  competition: Competition,
  participants: Participant[],
  records: ParticipantRecord[]
): any[][] => {
  const data: any[][] = [];
  
  // ヘッダー行1: 大会情報
  data.push([
    competition.name,
    `開催日: ${competition.date}`,
    `参加者数: ${participants.length}名`,
    competition.handicapEnabled ? 'ハンデ有効' : 'ハンデ無効'
  ]);
  
  // 空行
  data.push([]);
  
  // ヘッダー行2: 列タイトル
  const headers = [
    '参加者', '段位',
    '1射', '2射', '3射', '4射', '1計',
    '5射', '6射', '7射', '8射', '2計',
    '9射', '10射', '11射', '12射', '3計',
    '13射', '14射', '15射', '16射', '4計',
    '17射', '18射', '19射', '20射', '5計',
    '的中', '矢数', '的中率', '調整前順位'
  ];
  
  if (competition.handicapEnabled) {
    headers.push('ハンデ', '調整後的中', 'ハンデ調整後順位');
  }
  
  data.push(headers);
  
  // 参加者データを順位順にソート
  const sortedRecords = [...records].sort((a, b) => {
    if (competition.handicapEnabled) {
      return b.adjustedScore - a.adjustedScore;
    }
    return b.totalHits - a.totalHits;
  });
  
  // 各参加者のデータ行
  sortedRecords.forEach((record, index) => {
    const participant = participants.find(p => p.id === record.participantId);
    if (!participant) return;
    
    const row: any[] = [
      participant.name,
      formatRank(participant.rank)
    ];
    
    // 各射の結果を追加
    record.rounds.forEach((round, roundIndex) => {
      round.shots.forEach(shot => {
        row.push(shot.hit ? '○' : '×');
      });
      row.push(round.hits); // 立計
    });
    
    // 総合成績
    row.push(
      record.totalHits,
      20,
      `${(record.hitRate * 100).toFixed(1)}%`,
      record.rank
    );
    
    if (competition.handicapEnabled) {
      row.push(
        record.handicap,
        record.adjustedScore,
        record.rankWithHandicap
      );
    }
    
    data.push(row);
  });
  
  return data;
};

// 簡易版のCSV出力（Excel出力の代替）
export const exportToCSV = (data: ExcelExportData): void => {
  const { competition, participants, records } = data;
  
  const csvData = createMainSheetData(competition, participants, records);
  const csvContent = csvData.map(row => 
    row.map(cell => `"${cell}"`).join(',')
  ).join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `立禅の会${competition.date.replace(/-/g, '')}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};