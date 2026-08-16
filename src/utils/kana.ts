/**
 * 参加者マスターの読み仮名（よみ）の扱い
 *
 * 氏名は漢字で登録されるため、そのままでは五十音順に並べられない。
 * 別に「よみ」を持たせて、並べ替えと行見出し（あ行/か行…）に使う。
 */

/** 五十音の行。並べる順そのものなので、この配列の順序に意味がある */
const KANA_ROWS: { label: string; from: string; to: string }[] = [
  { label: 'あ行', from: 'あ', to: 'お' },
  { label: 'か行', from: 'か', to: 'ご' },
  { label: 'さ行', from: 'さ', to: 'ぞ' },
  { label: 'た行', from: 'た', to: 'ど' },
  { label: 'な行', from: 'な', to: 'の' },
  { label: 'は行', from: 'は', to: 'ぽ' },
  { label: 'ま行', from: 'ま', to: 'も' },
  { label: 'や行', from: 'や', to: 'よ' },
  { label: 'ら行', from: 'ら', to: 'ろ' },
  { label: 'わ行', from: 'わ', to: 'ん' },
];

/** よみが未設定の人をまとめる見出し。並びの最後に置く */
export const UNKNOWN_READING_LABEL = 'よみ未設定';

/**
 * よみを保存する形に整える。カタカナはひらがなに直し、空白を落とす。
 *
 * 「オカダ」と「おかだ」が別の位置に並ぶと五十音順の意味がなくなるため、
 * どちらで入力されてもひらがなに寄せる。長音符(ー)はそのまま残す。
 */
export const normalizeReading = (reading: string): string =>
  reading
    .trim()
    .replace(/\s/g, '')
    // カタカナ(ァ-ヶ)をひらがなに。コードポイントの差はちょうど0x60
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** かなだけで構成されているか。IMEから拾った文字が使えるかの判定に使う */
// \s は全角スペース(U+3000)も含むので、全角スペースを直接書く必要はない
export const isKanaOnly = (text: string): boolean =>
  text.length > 0 && /^[ぁ-ゖァ-ヶー\s]+$/.test(text);

/**
 * よみが属する五十音の行の見出しを返す。
 * よみが無い、または五十音に収まらない場合は「よみ未設定」にまとめる。
 */
export const kanaRowLabel = (reading: string | undefined): string => {
  const head = normalizeReading(reading ?? '').charAt(0);
  if (!head) return UNKNOWN_READING_LABEL;
  const row = KANA_ROWS.find((r) => head >= r.from && head <= r.to);
  return row?.label ?? UNKNOWN_READING_LABEL;
};

/**
 * 五十音順の比較。よみが無い人は末尾にまとめ、その中では引数の並び順を保つ
 * （呼び出し側が登録順で渡すので、登録順のまま末尾に並ぶ）。
 *
 * よみが同じ人（同姓など）は氏名で決める。並びが実行のたびに変わらないようにするため。
 */
export const compareByReading = (
  a: { name: string; reading?: string },
  b: { name: string; reading?: string }
): number => {
  const readingA = normalizeReading(a.reading ?? '');
  const readingB = normalizeReading(b.reading ?? '');
  if (!readingA && !readingB) return 0;
  // よみ未設定は末尾へ。ここで並びを崩さないよう、設定済み同士だけを比較する
  if (!readingA) return 1;
  if (!readingB) return -1;
  if (readingA !== readingB) return readingA.localeCompare(readingB, 'ja');
  return a.name.localeCompare(b.name, 'ja');
};
