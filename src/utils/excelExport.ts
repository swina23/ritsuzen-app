// 型だけを静的に取り込む。import type はビルド時に消えるので、
// ExcelJS本体は exportToExcelWithBorders の中で動的に読み込む（下のコメント参照）
import type { Workbook } from 'exceljs';
import { Competition, Participant, ParticipantRecord } from '../types';
import { formatRank } from './formatters';
import { calculateRankings } from './calculations';
import { CareerStat, RECENT_PERIODS, RANKING_MIN_COMPETITIONS } from './careerStats';

export interface ExcelExportData {
  competition: Competition;
  participants: Participant[];
  records: ParticipantRecord[];
  /** 全大会を横断した通算成績。渡すと2枚目のシートとして出力される */
  careerStats?: CareerStat[];
}

/**
 * 出力ファイル名を作る。
 *
 * 以前は自団体名（立禅の会）を決め打ちしていたが、ログイン不要で誰でも使える
 * ようになったため、大会名から作る。他団体が出力したファイルに無関係の
 * 団体名が付くのを避けるため。
 *
 * ファイル名に使えない文字（Windows / macOS の両方を考慮）と制御文字は
 * 落とす。大会名が空だったり記号だけだった場合に無名のファイルにならないよう、
 * 既定の名前を用意しておく。
 */
const buildExportFileName = (competition: Competition, extension: string): string => {
  const date = competition.date.replace(/-/g, '');
  // eslint-disable-next-line no-control-regex
  const sanitized = competition.name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '').trim();
  const base = sanitized.length > 0 ? sanitized : '射会記録';
  return `${base}${date}.${extension}`;
};

/**
 * ワークブックに「通算成績」シートを追加する。
 * 当該大会の結果だけでなく、その時点での通算成績も一緒に配れるようにするため。
 *
 * 順位は通算的中率で付け、直近期間は右側に参考列として並べる（画面と同じ構成）。
 * 画面では「75.0% (6回)」と1つのセルに詰めているが、Excelでは的中率と出場数を
 * 別の列に分ける。文字列にすると Excel 側で並べ替えも平均も取れなくなるため。
 */
const addCareerStatsSheet = (
  workbook: Workbook,
  careerStats: CareerStat[]
): void => {
  const sheet = workbook.addWorksheet('通算成績');

  // 直近期間ごとに「的中率」「出場数」の2列が増える
  const columnCount = 7 + RECENT_PERIODS.length * 2;
  const lastColumn = sheet.getColumn(columnCount).letter;

  sheet.mergeCells(`A1:${lastColumn}1`);
  sheet.getCell('A1').value = '通算成績';
  sheet.getCell('A1').font = { bold: true, size: 14 };
  sheet.getCell('A1').alignment = { horizontal: 'center' };
  sheet.getCell('A2').value = '的中率 = 総的中 ÷ 総射数（各大会の的中率の平均ではありません）';
  sheet.getCell('A3').value = `※出場${RANKING_MIN_COMPETITIONS}回未満の方は順位を付けず、末尾にまとめています`;
  sheet.getCell('A4').value = '※直近期間の列は順位に関係しない参考値です（出場数が少ないほど的中率は振れます）';

  sheet.addRow([]);

  const headerRow = sheet.addRow([
    '順位', '参加者', '段位', '出場数', '総射数', '総的中', '的中率',
    ...RECENT_PERIODS.flatMap((period) => [`${period.label} 的中率`, `${period.label} 出場数`])
  ]);
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E6E6' } };
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  });

  careerStats.forEach((stat) => {
    const row = sheet.addRow([
      stat.ranked ? stat.order : '―',
      stat.name,
      formatRank(stat.rank),
      stat.competitionsCount,
      stat.totalShots,
      stat.totalHits,
      // 数値として入れ、表示だけパーセント書式にする（Excel側で並べ替え・集計できるように）
      stat.hitRate,
      // その期間に一度も引いていない人は空欄ではなく「―」にする。
      // 空欄だと「0射だった」のか「列の作り漏れ」なのか読み手が判断できないため
      ...RECENT_PERIODS.flatMap((period): (string | number)[] => {
        const recent = stat.recent[period.key];
        return recent ? [recent.hitRate, recent.competitionsCount] : ['―', '―'];
      })
    ]);
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
    row.getCell(7).numFmt = '0.0%';
    RECENT_PERIODS.forEach((_period, index) => {
      // 的中率の列だけ書式を付ける（8, 10, ... と2列おき）。
      // 「―」が入っている行に付いても表示は変わらない
      row.getCell(8 + index * 2).numFmt = '0.0%';
    });
  });

  // 行を追加した後に sheet.columns へ代入すると既存行が壊れることがあるため、
  // 既存シートと同じく getColumn で個別に設定する
  [
    6, 16, 8, 8, 10, 10, 12,
    ...RECENT_PERIODS.flatMap(() => [14, 12])
  ].forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
};

/**
 * 出力直前に順位を最新ロジックで計算し直す。
 * 履歴データには古いバージョンで計算された順位が保存されている場合があるため、
 * エクスポート時に必ず再計算して正しい同順位（例: 1位・1位・3位）を反映する。
 * calculateRankings は引数を破壊的に変更するので、保存データを汚さないようクローンを渡す。
 */
const withFreshRankings = (records: ParticipantRecord[]): ParticipantRecord[] =>
  calculateRankings(records.map(record => ({ ...record })));

/**
 * Excel出力のどの段階で失敗したかを持たせたエラー。
 * iPadのSafariだけで失敗するなど、PCで再現しない失敗を画面のスクショから追えるようにする。
 * Safariのエラー文は「Importing a module script failed.」のように短く場所が分からないため
 */
export class ExcelExportError extends Error {
  readonly stage: string;
  readonly original: unknown;

  constructor(stage: string, original: unknown) {
    super(original instanceof Error ? original.message : String(original));
    this.name = 'ExcelExportError';
    this.stage = stage;
    this.original = original;
  }
}

/**
 * 失敗時に画面へ出す説明。段階・エラーの種類と内容・スタックの先頭行を並べる。
 * スタックの先頭行（Safariなら「関数名@URL:行:列」）で、exceljsとアプリ本体の
 * どちらのファイルで落ちたかが分かる
 */
export const describeExportError = (error: unknown): string => {
  const stage = error instanceof ExcelExportError ? error.stage : undefined;
  const original = error instanceof ExcelExportError ? error.original : error;

  let detail: string;
  if (original instanceof Error) {
    // Chromeのスタックは1行目が「名前: メッセージ」の繰り返しなので、それを飛ばした最初の行を使う
    const firstStackLine = original.stack
      ?.split('\n')
      .map((line) => line.trim())
      .find((line) => line !== '' && !line.includes(original.message));
    detail = `${original.name}: ${original.message}`;
    if (firstStackLine) {
      detail += ` / ${firstStackLine}`;
    }
  } else {
    // Error以外で reject された場合、String() だと [object Object] になって中身が見えない
    try {
      detail = JSON.stringify(original) ?? String(original);
    } catch {
      detail = String(original);
    }
  }

  return stage ? `${stage}で失敗: ${detail}` : detail;
};

const LOAD_STAGE = 'ExcelJSの読み込み';

let excelJSPromise: Promise<typeof import('exceljs')> | null = null;

/**
 * ExcelJSを読み込む。先読みとボタン押下で同じ読み込みを共有する。
 *
 * 失敗したら覚えておかずに捨て、次の呼び出しで読み込み直す。ただしSafariは
 * 失敗したモジュールをページ単位で覚えていて、再読み込みするまで即失敗を返す
 * （電波の悪い会場で一度失敗すると、何度押しても失敗し続けた）。そのため
 * 失敗時は画面で再読み込みを案内する（isExcelJSLoadFailure 参照）
 */
const loadExcelJS = (): Promise<typeof import('exceljs')> => {
  if (!excelJSPromise) {
    excelJSPromise = import('exceljs').catch((error: unknown) => {
      excelJSPromise = null;
      throw error;
    });
  }
  return excelJSPromise;
};

/**
 * 起動後の空き時間にExcelJSを先に読み込んでおく。会場で電波が悪くなる前、
 * 電波のよい場所でアプリを開いた時点で取得を済ませておくため。
 * 初回表示を遅らせないよう、呼ぶ側は画面が出たあとに呼ぶこと
 */
export const preloadExcelJS = (): void => {
  // 失敗してもここでは何もしない。ボタンを押したときに改めて案内する
  loadExcelJS().catch(() => {});
};

/** ExcelJS本体の読み込み（通信）で失敗したか。データ側の不具合と案内を分けるために使う */
export const isExcelJSLoadFailure = (error: unknown): boolean =>
  error instanceof ExcelExportError && error.stage === LOAD_STAGE;

/** 読み込み失敗時に、エラー詳細の前に出す案内 */
export const EXCELJS_LOAD_FAILURE_GUIDE =
  '通信が不安定でExcel出力の機能を読み込めませんでした。電波のよい場所でページを再読み込みしてから、もう一度お試しください';

export const exportToExcelWithBorders = async (data: ExcelExportData): Promise<void> => {
  const progress = { stage: LOAD_STAGE };
  try {
    await buildAndDownloadExcel(data, progress);
  } catch (error) {
    throw new ExcelExportError(progress.stage, error);
  }
};

const buildAndDownloadExcel = async (
  data: ExcelExportData,
  progress: { stage: string }
): Promise<void> => {
  const { competition, participants } = data;

  // ExcelJSは依存のJSZipを含めて1MB以上あり、起動時に読み込むと初回表示が
  // その分だけ重くなる。起動時には読み込まず、画面が出たあとに preloadExcelJS で先読みし、
  // 間に合っていなければここで読み込む
  const ExcelJS = await loadExcelJS();

  progress.stage = 'シートの作成';
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
  
  headers.push('的中総計', '矢数', '的中率', '調整前順位');
  
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

    // 入賞者以外も讃えるため、ハンデ調整後の的中がプラスの人を並べる。
    // 順位のように見えないよう、表と同じ登録順で、数字は付けずに名前だけ出す
    const positiveNames = sortedRecords
      .filter(record => record.adjustedScore >= 1)
      .map(record => participants.find(p => p.id === record.participantId))
      .filter((participant): participant is Participant => participant !== undefined)
      .map(participant => `${participant.name}さん`);
    const positiveText = `ハンディ換算後に的中が1以上の方は、${
      positiveNames.length > 0 ? positiveNames.join('、') : '該当者なし'
    }`;
    const positiveRow = worksheet.addRow([positiveText]);
    positiveRow.getCell(1).font = { size: 11 };
    positiveRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
  }
  
  // 列幅の設定（動的生成）
  const colWidths = [12, 6]; // 参加者: 12, 段位: 6
  
  // 立数に応じて列幅を追加
  for (let i = 0; i < competition.roundsCount; i++) {
    colWidths.push(4, 4, 4, 4, 6); // 各射: 4, 立計: 6
  }
  
  colWidths.push(10, 6, 8, 10); // 的中総計: 10, 矢数: 6, 的中率: 8, 調整前順位: 10
  
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
  
  // 2枚目のシート: 通算成績（渡されたときだけ）。記録が無ければ空のシートを作らない
  if (data.careerStats && data.careerStats.length > 0) {
    progress.stage = '通算成績シートの作成';
    addCareerStatsSheet(workbook, data.careerStats);
  }

  // ファイルを書き込み
  progress.stage = 'ファイルの書き出し';
  const buffer = await workbook.xlsx.writeBuffer();
  progress.stage = 'ダウンロード';
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = buildExportFileName(competition, 'xlsx');
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
  
  headers.push('的中総計', '矢数', '的中率', '調整前順位');
  
  
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
  
  // BOM付きUTF-8で出力（WindowsのExcelで日本語が文字化けしないように）
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', buildExportFileName(competition, 'csv'));
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};