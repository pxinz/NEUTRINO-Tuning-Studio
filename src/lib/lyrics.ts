export const KANA_RE = /^[\u3040-\u309F\u30A0-\u30FF\u3005ー’'・\s]+$/u;

const SMALL_KANA = new Set([
  'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'ゃ', 'ゅ', 'ょ', 'ゎ', 'っ', 'ゕ', 'ゖ',
  'ァ', 'ィ', 'ゥ', 'ェ', 'ォ', 'ャ', 'ュ', 'ョ', 'ヮ', 'ッ', 'ヵ', 'ヶ',
]);

export interface LyricCheck {
  ok: boolean;
  empty: boolean;
  hasKana: boolean;
  hasNonKana: boolean;
  warnings: string[];
}

export function checkLyric(lyric: string): LyricCheck {
  const text = (lyric || '').trim();
  const warnings: string[] = [];
  if (!text) return { ok: false, empty: true, hasKana: false, hasNonKana: false, warnings: ['Empty lyric'] };
  const hasKana = /[\u3040-\u309F\u30A0-\u30FF]/u.test(text);
  const hasNonKana = /[^\u3040-\u309F\u30A0-\u30FFー’'・\s]/u.test(text);
  if (!hasKana) warnings.push('NEUTRINO lyrics must be hiragana or katakana.');
  if (hasNonKana) warnings.push('Only kana, ー and ’ are supported.');
  if (text.includes('っ') && text.length === 1) warnings.push('A standalone っ is sung as the previous vowel + っ.');
  return { ok: hasKana && !hasNonKana, empty: false, hasKana, hasNonKana, warnings };
}

export function isSmallKana(ch: string): boolean {
  return SMALL_KANA.has(ch);
}

// A practical Hepburn-style romaji -> hiragana converter. It intentionally
// favours predictable output for lyric entry over linguistic completeness.
const ROMAJI: Record<string, string> = {
  a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
  ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ',
  kya: 'きゃ', kyu: 'きゅ', kyo: 'きょ', kye: 'きぇ',
  ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
  gya: 'ぎゃ', gyu: 'ぎゅ', gyo: 'ぎょ', gye: 'ぎぇ',
  sa: 'さ', shi: 'し', si: 'し', su: 'す', se: 'せ', so: 'そ',
  sha: 'しゃ', shu: 'しゅ', sho: 'しょ', she: 'しぇ', sya: 'しゃ', syu: 'しゅ', syo: 'しょ',
  za: 'ざ', ji: 'じ', zi: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ',
  ja: 'じゃ', ju: 'じゅ', jo: 'じょ', je: 'じぇ', zya: 'じゃ', zyu: 'じゅ', zyo: 'じょ',
  ta: 'た', chi: 'ち', ti: 'ち', tsu: 'つ', tu: 'つ', te: 'て', to: 'と',
  cha: 'ちゃ', chu: 'ちゅ', cho: 'ちょ', che: 'ちぇ', tya: 'ちゃ', tyu: 'ちゅ', tyo: 'ちょ',
  da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど',
  dya: 'ぢゃ', dyu: 'ぢゅ', dyo: 'ぢょ',
  na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の',
  nya: 'にゃ', nyu: 'にゅ', nyo: 'にょ', nye: 'にぇ',
  ha: 'は', hi: 'ひ', fu: 'ふ', hu: 'ふ', he: 'へ', ho: 'ほ',
  hya: 'ひゃ', hyu: 'ひゅ', hyo: 'ひょ', hye: 'ひぇ',
  ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ',
  bya: 'びゃ', byu: 'びゅ', byo: 'びょ', bye: 'びぇ',
  pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
  pya: 'ぴゃ', pyu: 'ぴゅ', pyo: 'ぴょ', pye: 'ぴぇ',
  ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も',
  mya: 'みゃ', myu: 'みゅ', myo: 'みょ', mye: 'みぇ',
  ya: 'や', yu: 'ゆ', yo: 'よ', ye: 'いぇ',
  ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ',
  rya: 'りゃ', ryu: 'りゅ', ryo: 'りょ', rye: 'りぇ',
  wa: 'わ', wi: 'うぃ', we: 'うぇ', wo: 'を', wu: 'う',
  va: 'ゔぁ', vi: 'ゔぃ', vu: 'ゔ', ve: 'ゔぇ', vo: 'ゔぉ',
  fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ',
  xa: 'ぁ', xi: 'ぃ', xu: 'ぅ', xe: 'ぇ', xo: 'ぉ',
  xya: 'ゃ', xyu: 'ゅ', xyo: 'ょ', xtu: 'っ', xtsu: 'っ',
  la: 'ぁ', li: 'ぃ', lu: 'ぅ', le: 'ぇ', lo: 'ぉ',
  lya: 'ゃ', lyu: 'ゅ', lyo: 'ょ', ltu: 'っ', ltsu: 'っ',
  n: 'ん', nn: 'ん', 'n\'': 'ん',
};

const KEYS = Object.keys(ROMAJI).sort((a, b) => b.length - a.length);

export function romajiToKana(input: string): string {
  let s = (input || '').toLowerCase().replace(/[^a-z']/g, '');
  let out = '';
  let i = 0;
  while (i < s.length) {
    // Double consonant => small っ
    if (i + 1 < s.length && s[i] === s[i + 1] && !'aiueon'.includes(s[i])) {
      out += 'っ';
      i++;
      continue;
    }
    if (s.startsWith('tch', i)) {
      out += 'っ';
      i += 2;
      continue;
    }
    if (s[i] === 'n' && s[i + 1] && !'aiueoy'.includes(s[i + 1]) && s[i + 1] !== "'") {
      out += 'ん';
      i++;
      continue;
    }
    let matched = false;
    for (const key of KEYS) {
      if (s.startsWith(key, i)) {
        out += ROMAJI[key];
        i += key.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      i++;
    }
  }
  return out;
}

export const KANA_ROWS: string[][] = [
  ['あ', 'か', 'さ', 'た', 'な', 'は', 'ま', 'や', 'ら', 'わ', 'ん', 'ー', 'っ', '’'],
  ['い', 'き', 'し', 'ち', 'に', 'ひ', 'み', 'ゆ', 'り', 'を'],
  ['う', 'く', 'す', 'つ', 'ぬ', 'ふ', 'む', 'よ', 'る'],
  ['え', 'け', 'せ', 'て', 'ね', 'へ', 'め', 'れ'],
  ['お', 'こ', 'そ', 'と', 'の', 'ほ', 'も', 'ろ'],
  ['ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'ゃ', 'ゅ', 'ょ', 'ゎ'],
];

export function lyricHint(lyric: string): string {
  const check = checkLyric(lyric);
  if (check.empty) return '';
  if (check.ok) return '';
  return check.warnings[0] || '';
}

export function countVowels(lyric: string): number {
  return (lyric.match(/[あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんぁぃぅぇぉゃゅょゎアイウエオ]/g) || []).length;
}
