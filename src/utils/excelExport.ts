import * as ExcelJS from 'exceljs';
import { Competition, Participant, ParticipantRecord } from '../types';
import { formatRank } from './formatters';
import { calculateRankings } from './calculations';

export interface ExcelExportData {
  competition: Competition;
  participants: Participant[];
  records: ParticipantRecord[];
}

/**
 * 出力直前に順位を最新ロジックで計算し直す。
 * 履歴データには古いバージョンで計算された順位が保存されている場合があるため、
 * エクスポート時に必ず再計算して正しい同順位（例: 1位・1位・3位）を反映する。
 * calculateRankings は引数を破壊的に変更するので、保存データを汚さないようクローンを渡す。
 */
const withFreshRankings = (records: ParticipantRecord[]): ParticipantRecord[] =>
  calculateRankings(records.map(record => ({ ...record })));

export const exportToExcelWithBorders = async (data: ExcelExportData): Promise<void> => {
  const { competition, participants } = data;
  const records = withFreshRankings(data.records);

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
    
    // 皆中（4射全て的中）した立を記録
    const perfectRounds: number[] = [];
    
    // 各射の結果を追加
    record.rounds.forEach((round, roundIndex) => {
      round.shots.forEach(shot => {
        if (shot.hit === null) {
          row.push('-');
        } else {
          row.push(shot.hit ? '○' : '×');
        }
      });
      row.push(round.hits);
      
      // 皆中（4射全て的中）の場合は記録
      if (round.hits === 4) {
        perfectRounds.push(roundIndex);
      }
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
    
    // 皆中（4射全て的中）のセルをハイライト
    perfectRounds.forEach(roundIndex => {
      // 各立の開始列を計算（参加者名:1, 段位:1, 各立5列（4射+1計））
      const baseCol = 3 + (roundIndex * 5); // 3列目から開始
      for (let i = 0; i < 4; i++) {
        const cell = dataRow.getCell(baseCol + i);
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFFF00' } // 黄色
        };
      }
    });
    
    // 的中10中以上のハイライト
    if (record.totalHits >= 10) {
      // 的中数のセルをハイライト
      const totalHitsCol = 3 + (competition.roundsCount * 5); // 的中数の列
      const totalHitsCell = dataRow.getCell(totalHitsCol);
      totalHitsCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFF00' } // 黄色
      };
    }
    
    // 調整前順位1-3位のハイライト
    if (record.rank >= 1 && record.rank <= 3) {
      // 調整前順位のセルをハイライト
      const totalHitsCol = 3 + (competition.roundsCount * 5); // 的中数の列
      const rankCol = totalHitsCol + 3; // 的中数から3列後（矢数、的中率の次）
      const rankCell = dataRow.getCell(rankCol);
      rankCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFF00' } // 黄色
      };
    }
    
    // ハンデ調整後順位1-3位のハイライト
    if (competition.handicapEnabled && record.rankWithHandicap >= 1 && record.rankWithHandicap <= 3) {
      const baseCol = 3 + (competition.roundsCount * 5);
      const handicapRankCol = baseCol + 6; // 的中、矢数、的中率、調整前順位、ハンデ、調整後的中の次
      const handicapRankCell = dataRow.getCell(handicapRankCol);
      handicapRankCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFF00' } // 黄色
      };
    }
  });
  
  // 表の最終行を記録（罫線の範囲を制限するため）
  const tableLastRow = worksheet.lastRow?.number || headerRowNumber;
  
  // 順位情報を表の下に追加
  // 空行を2行追加
  worksheet.addRow([]);
  worksheet.addRow([]);
  
  // 同点を考慮した順位取得関数（1位、2位、3位の全員を取得）
  const getRankingWithTies = (records: ParticipantRecord[], rankField: 'rank' | 'rankWithHandicap') => {
    const rankingInfo: { rank: number; name: string }[] = [];
    
    // 1位、2位、3位の人を全て取得
    records.forEach(record => {
      const participant = participants.find(p => p.id === record.participantId);
      if (participant && record[rankField] >= 1 && record[rankField] <= 3) {
        rankingInfo.push({ rank: record[rankField], name: participant.name });
      }
    });
    
    // 順位でソート
    rankingInfo.sort((a, b) => a.rank - b.rank);
    
    return rankingInfo;
  };
  
  // 順位文字列を作成する関数（同順位の場合は2人目以降は順位記号を省略）
  const createRankingText = (rankingInfo: { rank: number; name: string }[]) => {
    const result: string[] = [];
    let lastRank: number | null = null;
    
    rankingInfo.forEach(info => {
      if (info.rank !== lastRank) {
        // 新しい順位なので順位記号を付ける
        const rankSymbol = ['①', '②', '③'][info.rank - 1] || `${info.rank}位`;
        result.push(`${rankSymbol}${info.name}さん`);
        lastRank = info.rank;
      } else {
        // 同じ順位なので順位記号を省略
        result.push(`${info.name}さん`);
      }
    });
    
    return result.join('、');
  };
  
  // 調整前順位の文字列を作成
  const beforeHandicapRanking = getRankingWithTies(sortedRecords, 'rank');
  if (beforeHandicapRanking.length > 0) {
    const rankText = `ハンディ換算前の順位は、${createRankingText(beforeHandicapRanking)}`;
    const rankRow = worksheet.addRow([rankText]);
    rankRow.getCell(1).font = { size: 11 };
    rankRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
  }
  
  // ハンデ調整後順位の文字列を作成（ハンデ有効時のみ）
  if (competition.handicapEnabled) {
    const afterHandicapRanking = getRankingWithTies(sortedRecords, 'rankWithHandicap');
    if (afterHandicapRanking.length > 0) {
      const handicapText = `ハンディ換算後の順位は、${createRankingText(afterHandicapRanking)}`;
      const handicapRow = worksheet.addRow([handicapText]);
      handicapRow.getCell(1).font = { size: 11 };
      handicapRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    }
  }
  
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

  // 罫線の強化設定（表の最終行まで）
  const lastCol = colWidths.length;
  
  // 1. 表全体の外枠を太線にする（tableLastRowまで）
  try {
    if (tableLastRow >= headerRowNumber) {
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
        const cell = worksheet.getCell(tableLastRow, col);
        cell.border = {
          ...cell.border,
          bottom: { style: 'thick' }
        };
      }
      
      // 左辺
      for (let row = headerRowNumber; row <= tableLastRow; row++) {
        const cell = worksheet.getCell(row, 1);
        cell.border = {
          ...cell.border,
          left: { style: 'thick' }
        };
      }
      
      // 右辺
      for (let row = headerRowNumber; row <= tableLastRow; row++) {
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
    // 各グループの縦線を太線にする（tableLastRowまで）
    for (let row = headerRowNumber; row <= tableLastRow; row++) {
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

// 簡易版のCSV出力（Excel出力の代替）
export const exportToCSV = (data: ExcelExportData): void => {
  const { competition, participants } = data;
  const records = withFreshRankings(data.records);

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