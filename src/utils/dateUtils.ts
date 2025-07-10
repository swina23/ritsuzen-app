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
 * ISO日時文字列を日本時間の日付文字列に変換
 */
export const formatJapaneseDate = (isoString: string): string => {
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
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
 */
export const getTodayJapaneseDate = (): string => {
  const now = new Date();
  return now.toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).replace(/\//g, '-');
};