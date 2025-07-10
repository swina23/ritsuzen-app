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
  
  // ヘッダー行: 列タイトル
  const headers = [
    '参加者', '段位',
    '1立目', '', '', '', '1計',
    '2立目', '', '', '', '2計',
    '3立目', '', '', '', '3計',
    '4立目', '', '', '', '4計',
    '5立目', '', '', '', '5計',
    '的中', '矢数', '的中率', '調整前順位'
  ];
  
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
  
  // 立目ヘッダーのセル結合と左寄せ設定
  const headerRowNumber = headerRow.number;
  
  // 1立目 (C3:F3)
  worksheet.mergeCells(`C${headerRowNumber}:F${headerRowNumber}`);
  worksheet.getCell(`C${headerRowNumber}`).alignment = { horizontal: 'left', vertical: 'middle' };
  
  // 2立目 (H3:K3)
  worksheet.mergeCells(`H${headerRowNumber}:K${headerRowNumber}`);
  worksheet.getCell(`H${headerRowNumber}`).alignment = { horizontal: 'left', vertical: 'middle' };
  
  // 3立目 (M3:P3)
  worksheet.mergeCells(`M${headerRowNumber}:P${headerRowNumber}`);
  worksheet.getCell(`M${headerRowNumber}`).alignment = { horizontal: 'left', vertical: 'middle' };
  
  // 4立目 (R3:U3)
  worksheet.mergeCells(`R${headerRowNumber}:U${headerRowNumber}`);
  worksheet.getCell(`R${headerRowNumber}`).alignment = { horizontal: 'left', vertical: 'middle' };
  
  // 5立目 (W3:Z3)
  worksheet.mergeCells(`W${headerRowNumber}:Z${headerRowNumber}`);
  worksheet.getCell(`W${headerRowNumber}`).alignment = { horizontal: 'left', vertical: 'middle' };
  
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
        row.push(shot.hit ? '○' : '×');
      });
      row.push(round.hits);
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
  
  // 列幅の設定
  const colWidths = [12, 6, 4, 4, 4, 4, 6, 4, 4, 4, 4, 6, 4, 4, 4, 4, 6, 4, 4, 4, 4, 6, 4, 4, 4, 4, 6, 8, 6, 8, 10];
  
  if (competition.handicapEnabled) {
    colWidths.push(8, 12, 16);  // ハンデ: 8, 調整後的中: 12, ハンデ調整後順位: 16
  }
  
  // 個別に列幅を設定
  colWidths.forEach((width, index) => {
    worksheet.getColumn(index + 1).width = width;
  });

  // 罫線の強化設定
  const lastRow = worksheet.lastRow?.number || 0;
  const lastCol = colWidths.length;
  
  // 1. 表全体の外枠を太線にする
  if (lastRow > 0) {
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
  
  // 2. タイトル行の外枠を太線にする
  for (let col = 1; col <= lastCol; col++) {
    const cell = worksheet.getCell(headerRowNumber, col);
    cell.border = {
      ...cell.border,
      top: { style: 'thick' },
      bottom: { style: 'thick' }
    };
  }
  
  // 3. 各立目のグループを太線で囲む
  const groups = [
    { start: 1, end: 2 },   // 参加者+段位 (A-B)
    { start: 3, end: 7 },   // 1立目+1計 (C-G)
    { start: 8, end: 12 },  // 2立目+2計 (H-L)
    { start: 13, end: 17 }, // 3立目+3計 (M-Q)
    { start: 18, end: 22 }, // 4立目+4計 (R-V)
    { start: 23, end: 27 }, // 5立目+5計 (W-AA)
    { start: 28, end: lastCol } // 総合成績 (AB以降)
  ];
  
  groups.forEach(group => {
    // 各グループの縦線を太線にする
    for (let row = headerRowNumber; row <= lastRow; row++) {
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
  
  // ヘッダー行2: 列タイトル
  const headers = [
    '参加者', '段位',
    '1立目', '', '', '', '1計',
    '2立目', '', '', '', '2計',
    '3立目', '', '', '', '3計',
    '4立目', '', '', '', '4計',
    '5立目', '', '', '', '5計',
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