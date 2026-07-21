/**
 * 日時表示ユーティリティ
 * アプリ内のすべての時間は日本時間（JST）で表示
 */

/**
 * ISO日時文字列を日本時間の文字列に変換
 */
export const formatJapaneseDateTime = (isoString: string): string => {
  try {
    const date = new Date(isoString);
    return date.toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch (error) {
    console.error('Failed to format date:', error);
    return isoString;
  }
};

/**
 * 現在の日本時間のISO文字列を取得
 */
export const getCurrentJapaneseTime = (): string => {
  return new Date().toISOString();
};

/**
 * 日本時間での今日の日付文字列を取得（YYYY-MM-DD形式）
 *
 * `new Date().toISOString()` はUTCに変換するため、JSTの0:00〜8:59に呼ぶと
 * 前日の日付になってしまう。日付だけを扱う場面では必ずこちらを使うこと。
 *
 * 区切り文字の置換ではなくformatToPartsで組み立てているのは、
 * ロケールの出力形式（"2026/07/21"なのか"2026年07月21日"なのか）に
 * 依存させないため。<input type="date">のvalueは形式が崩れると空になる。
 */
export const getTodayJapaneseDate = (): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${get('year')}-${get('month')}-${get('day')}`;
};