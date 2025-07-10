import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';
import { Competition, Participant, ParticipantRecord } from '../types';
import { formatRank } from './formatters';

export interface ExcelExportData {
  competition: Competition;
  participants: Participant[];
  records: ParticipantRecord[];
}

export const exportToExcelWithBorders = async (data: ExcelExportData): Promise<void> => {
  const { competition, participants, records } = data;
  
  // ExcelJSワークブックを作成
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(competition.date.replace(/-/g, ''));
  
  // ヘッダー行1: 大会情報
  worksheet.mergeCells('A1:D1');
  worksheet.getCell('A1').value = competition.name;
  worksheet.getCell('A1').font = { bold: true, size: 14 };
  worksheet.getCell('A1').alignment = { horizontal: 'center' };
  
  // ヘッダー行2-4: 詳細情報（縦に配置）
  worksheet.getCell('A2').value = `開催日: ${competition.date}`;
  worksheet.getCell('A3').value = `参加者数: ${participants.length}名`;
  worksheet.getCell('A4').value = competition.handicapEnabled ? 'ハンデ有効' : 'ハンデ無効';
  
  // 空行
  worksheet.addRow([]);
  worksheet.addRow([]);
  
  // ヘッダー行: 列タイトル（動的生成）
  const headers = ['参加者', '段位'];
  
  // 立数に応じて動的にヘッダーを追加
  for (let i = 1; i <= competition.roundsCount; i++) {
    headers.push(`${i}立目`, '', '', '', `${i}計`);
  }
  
  headers.push('的中', '矢数', '的中率', '調整前順位');
  
  if (competition.handicapEnabled) {
    headers.push('ハンデ', '調整後的中', 'ハンデ調整後順位');
  }
  
  const headerRow = worksheet.addRow(headers);
  
  // ヘッダー行のスタイル
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6E6E6' }
    };
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  });
  
  // 立目ヘッダーのセル結合と左寄せ設定（動的生成）
  const headerRowNumber = headerRow.number;
  
  // ExcelJSの列番号を列アドレスに変換するヘルパー関数
  const getColumnLetter = (colNum: number): string => {
    let result = '';
    while (colNum > 0) {
      colNum--;
      result = String.fromCharCode(65 + (colNum % 26)) + result;
      colNum = Math.floor(colNum / 26);
    }
    return result;
  };

  // 動的にセル結合を行う
  for (let i = 0; i < competition.roundsCount; i++) {
    const startCol = 3 + (i * 5); // C列(3)から5列ずつ
    const endCol = startCol + 3;   // 4列分をマージ（立目名の部分）
    const startColLetter = getColumnLetter(startCol);
    const endColLetter = getColumnLetter(endCol);
    
    try {
      worksheet.mergeCells(`${startColLetter}${headerRowNumber}:${endColLetter}${headerRowNumber}`);
      worksheet.getCell(`${startColLetter}${headerRowNumber}`).alignment = { horizontal: 'left', vertical: 'middle' };
    } catch (error) {
      console.warn(`Failed to merge cells ${startColLetter}${headerRowNumber}:${endColLetter}${headerRowNumber}`, error);
    }
  }
  
  // 参加者データを参加者の順番（order）でソート
  const sortedRecords = [...records].sort((a, b) => {
    const participantA = participants.find(p => p.id === a.participantId);
    const participantB = participants.find(p => p.id === b.participantId);
    
    if (!participantA || !participantB) return 0;
    
    const orderA = participantA.order || 0;
    const orderB = participantB.order || 0;
    
    return orderA - orderB;
  });
  
  // 各参加者のデータ行
  sortedRecords.forEach((record) => {
    const participant = participants.find(p => p.id === record.participantId);
    if (!participant) return;
    
    const row: (string | number)[] = [
      participant.name,
      formatRank(participant.rank)
    ];
    
    // 各射の結果を追加
    record.rounds.forEach((round) => {
      round.shots.forEach(shot => {
        if (shot.hit === null) {
          row.push('-');
        } else {
          row.push(shot.hit ? '○' : '×');
        }
      });
      row.push(round.hits);
    });
    
    // 実際に射た矢数を計算
    const actualShotsCount = record.rounds.reduce((sum, round) => {
      return sum + round.shots.filter(shot => shot.hit !== null).length;
    }, 0);
    
    // 総合成績
    row.push(
      record.totalHits,
      actualShotsCount,
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
    
    const dataRow = worksheet.addRow(row);
    
    // データ行のスタイル
    dataRow.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
  });
  
  // 列幅の設定（動的生成）
  const colWidths = [12, 6]; // 参加者: 12, 段位: 6
  
  // 立数に応じて列幅を追加
  for (let i = 0; i < competition.roundsCount; i++) {
    colWidths.push(4, 4, 4, 4, 6); // 各射: 4, 立計: 6
  }
  
  colWidths.push(8, 6, 8, 10); // 的中: 8, 矢数: 6, 的中率: 8, 調整前順位: 10
  
  if (competition.handicapEnabled) {
    colWidths.push(8, 12, 16);  // ハンデ: 8, 調整後的中: 12, ハンデ調整後順位: 16
  }
  
  // 個別に列幅を設定
  colWidths.forEach((width, index) => {
    worksheet.getColumn(index + 1).width = width;
  });

  // 罫線の強化設定
  const lastRow = worksheet.lastRow?.number || headerRowNumber;
  const lastCol = colWidths.length;
  
  // 1. 表全体の外枠を太線にする
  try {
    if (lastRow >= headerRowNumber) {
      // 上辺
      for (let col = 1; col <= lastCol; col++) {
        const cell = worksheet.getCell(headerRowNumber, col);
        cell.border = {
          ...cell.border,
          top: { style: 'thick' }
        };
      }
      
      // 下辺
      for (let col = 1; col <= lastCol; col++) {
        const cell = worksheet.getCell(lastRow, col);
        cell.border = {
          ...cell.border,
          bottom: { style: 'thick' }
        };
      }
      
      // 左辺
      for (let row = headerRowNumber; row <= lastRow; row++) {
        const cell = worksheet.getCell(row, 1);
        cell.border = {
          ...cell.border,
          left: { style: 'thick' }
        };
      }
      
      // 右辺
      for (let row = headerRowNumber; row <= lastRow; row++) {
        const cell = worksheet.getCell(row, lastCol);
        cell.border = {
          ...cell.border,
          right: { style: 'thick' }
        };
      }
    }
  } catch (error) {
    console.warn('Failed to set outer borders', error);
  }
  
  // 2. タイトル行の外枠を太線にする
  try {
    for (let col = 1; col <= lastCol; col++) {
      const cell = worksheet.getCell(headerRowNumber, col);
      cell.border = {
        ...cell.border,
        top: { style: 'thick' },
        bottom: { style: 'thick' }
      };
    }
  } catch (error) {
    console.warn('Failed to set header borders', error);
  }
  
  // 3. 各立目のグループを太線で囲む（動的生成）
  const groups = [
    { start: 1, end: 2 } // 参加者+段位 (A-B)
  ];
  
  // 立数に応じてグループを追加
  for (let i = 0; i < competition.roundsCount; i++) {
    const start = 3 + (i * 5);
    const end = start + 4; // 5列分（4射+1計）
    groups.push({ start, end });
  }
  
  // 総合成績グループ
  const summaryStart = 3 + (competition.roundsCount * 5);
  groups.push({ start: summaryStart, end: lastCol });
  
  groups.forEach(group => {
    // 各グループの縦線を太線にする
    for (let row = headerRowNumber; row <= lastRow; row++) {
      try {
        // 左辺
        const leftCell = worksheet.getCell(row, group.start);
        leftCell.border = {
          ...leftCell.border,
          left: { style: 'thick' }
        };
        
        // 右辺
        const rightCell = worksheet.getCell(row, group.end);
        rightCell.border = {
          ...rightCell.border,
          right: { style: 'thick' }
        };
      } catch (error) {
        console.warn(`Failed to set border for row ${row}, group ${group.start}-${group.end}`, error);
      }
    }
  });
  
  // ファイルを書き込み
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `立禅の会${competition.date.replace(/-/g, '')}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
};

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
  
  // 罫線を追加
  addBordersToSheet(mainSheet, mainSheetData.length, colWidths.length);
  
  // シートを追加
  const sheetName = competition.date.replace(/-/g, '');
  XLSX.utils.book_append_sheet(workbook, mainSheet, sheetName);
  
  // ファイル名を生成
  const fileName = `立禅の会${competition.date.replace(/-/g, '')}.xlsx`;
  
  // ファイルをダウンロード（スタイル情報を含める）
  XLSX.writeFile(workbook, fileName, {
    bookSST: false,
    bookType: 'xlsx',
    cellStyles: true
  });
};

const createMainSheetData = (
  competition: Competition,
  participants: Participant[],
  records: ParticipantRecord[]
): (string | number)[][] => {
  const data: (string | number)[][] = [];
  
  // ヘッダー行1: 大会情報
  data.push([
    competition.name,
    `開催日: ${competition.date}`,
    `参加者数: ${participants.length}名`,
    competition.handicapEnabled ? 'ハンデ有効' : 'ハンデ無効'
  ]);
  
  // 空行
  data.push([]);
  
  // ヘッダー行2: 列タイトル（動的生成）
  const headers = ['参加者', '段位'];
  
  // 立数に応じて動的にヘッダーを追加
  for (let i = 1; i <= competition.roundsCount; i++) {
    headers.push(`${i}立目`, '', '', '', `${i}計`);
  }
  
  headers.push('的中', '矢数', '的中率', '調整前順位');
  
  
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
  sortedRecords.forEach((record) => {
    const participant = participants.find(p => p.id === record.participantId);
    if (!participant) return;
    
    const row: (string | number)[] = [
      participant.name,
      formatRank(participant.rank)
    ];
    
    // 各射の結果を追加
    record.rounds.forEach((round) => {
      round.shots.forEach(shot => {
        if (shot.hit === null) {
          row.push('-');
        } else {
          row.push(shot.hit ? '○' : '×');
        }
      });
      row.push(round.hits); // 立計
    });
    
    // 実際に射た矢数を計算
    const actualShotsCount = record.rounds.reduce((sum, round) => {
      return sum + round.shots.filter(shot => shot.hit !== null).length;
    }, 0);
    
    // 総合成績
    row.push(
      record.totalHits,
      actualShotsCount,
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

// 罫線を追加する関数
const addBordersToSheet = (sheet: XLSX.WorkSheet, numRows: number, numCols: number): void => {
  const borderStyle = {
    style: 'thin',
    color: { rgb: '000000' }
  };
  
  const border = {
    top: borderStyle,
    bottom: borderStyle,
    left: borderStyle,
    right: borderStyle
  };
  
  // 範囲を設定
  const range = { s: { c: 0, r: 0 }, e: { c: numCols - 1, r: numRows - 1 } };
  sheet['!ref'] = XLSX.utils.encode_range(range);
  
  // 全てのセルに罫線を適用
  for (let row = 0; row < numRows; row++) {
    for (let col = 0; col < numCols; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      
      // セルが存在しない場合は作成
      if (!sheet[cellAddress]) {
        sheet[cellAddress] = { t: 's', v: '' };
      }
      
      // セルスタイルを設定
      if (!sheet[cellAddress].s) {
        sheet[cellAddress].s = {};
      }
      
      // 罫線を追加
      sheet[cellAddress].s.border = border;
      
      // ヘッダー行（3行目）に背景色を追加
      if (row === 2) {
        sheet[cellAddress].s.fill = {
          fgColor: { rgb: 'E6E6E6' }
        };
        sheet[cellAddress].s.font = {
          bold: true
        };
        // 中央揃え
        sheet[cellAddress].s.alignment = {
          horizontal: 'center',
          vertical: 'center'
        };
      }
    }
  }
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