// Korean typing without a Korean keyboard installed: the standard 2-beolsik (두벌식) layout on physical key codes,
// and a composer that turns typed jamo into syllable blocks the way Windows' Korean IME does.
//
// Needs from earlier scripts: INIT, VOW, FIN (the jamo lists) and compose from data.js.
// Provides: KEY_JAMO, SHIFT_JAMO, KEY_ROWS, JAMO_KEY (the layout), composeJamo (jamo -> text)
// and keysFor (text -> jamo). Tested by tools/check.js.

// key code -> jamo it types
const KEY_JAMO = {
  KeyQ: 'ㅂ', KeyW: 'ㅈ', KeyE: 'ㄷ', KeyR: 'ㄱ', KeyT: 'ㅅ', KeyY: 'ㅛ', KeyU: 'ㅕ', KeyI: 'ㅑ', KeyO: 'ㅐ', KeyP: 'ㅔ',
  KeyA: 'ㅁ', KeyS: 'ㄴ', KeyD: 'ㅇ', KeyF: 'ㄹ', KeyG: 'ㅎ', KeyH: 'ㅗ', KeyJ: 'ㅓ', KeyK: 'ㅏ', KeyL: 'ㅣ',
  KeyZ: 'ㅋ', KeyX: 'ㅌ', KeyC: 'ㅊ', KeyV: 'ㅍ', KeyB: 'ㅠ', KeyN: 'ㅜ', KeyM: 'ㅡ',
};
// key code -> jamo it types with Shift (only these keys have a shifted jamo)
const SHIFT_JAMO = {KeyQ: 'ㅃ', KeyW: 'ㅉ', KeyE: 'ㄸ', KeyR: 'ㄲ', KeyT: 'ㅆ', KeyO: 'ㅒ', KeyP: 'ㅖ'};
// the letter keys row by row, for drawing the on-screen keyboard
const KEY_ROWS = [
  ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'],
  ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL'],
  ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM'],
];
// jamo -> {code, shift} for the on-screen keyboard hints
const JAMO_KEY = Object.fromEntries([
  ...Object.entries(KEY_JAMO).map(([code, jamo]) => [jamo, {code, shift: false}]),
  ...Object.entries(SHIFT_JAMO).map(([code, jamo]) => [jamo, {code, shift: true}]),
]);
// Two vowels typed one after the other that make one compound vowel
const VJOIN = {'ㅗㅏ': 'ㅘ', 'ㅗㅐ': 'ㅙ', 'ㅗㅣ': 'ㅚ', 'ㅜㅓ': 'ㅝ', 'ㅜㅔ': 'ㅞ', 'ㅜㅣ': 'ㅟ', 'ㅡㅣ': 'ㅢ'};
// Two consonants typed one after the other that make one double 받침
const FJOIN = {
  'ㄱㅅ': 'ㄳ', 'ㄴㅈ': 'ㄵ', 'ㄴㅎ': 'ㄶ', 'ㄹㄱ': 'ㄺ', 'ㄹㅁ': 'ㄻ', 'ㄹㅂ': 'ㄼ',
  'ㄹㅅ': 'ㄽ', 'ㄹㅌ': 'ㄾ', 'ㄹㅍ': 'ㄿ', 'ㄹㅎ': 'ㅀ', 'ㅂㅅ': 'ㅄ',
};
// the reverse: compound vowel / double 받침 -> its two parts
const VSPLIT = Object.fromEntries(Object.entries(VJOIN).map(([parts, joined]) => [joined, [...parts]]));
const FSPLIT = Object.fromEntries(Object.entries(FJOIN).map(([parts, joined]) => [joined, [...parts]]));
const isVowelJamo = jamo => VOW.includes(jamo);
const isConsJamo = jamo => INIT.includes(jamo) || FIN.includes(jamo);

// Typed jamo (one per key press) -> text. Anything that is not jamo (space, punctuation) passes through.
function composeJamo(keys) {
  let text = '';
  let syllable = null; // the syllable being built: {initial, vowel, final}

  // Write out the syllable being built: a full block, or the lone jamo when it has no vowel or no initial
  const finishSyllable = () => {
    if (syllable) {
      if (syllable.initial && syllable.vowel) {
        const finalIndex = syllable.final ? FIN.indexOf(syllable.final) : 0;
        text += compose(INIT.indexOf(syllable.initial), VOW.indexOf(syllable.vowel), finalIndex);
      } else {
        text += syllable.initial || syllable.vowel;
      }
    }
    syllable = null;
  };

  for (const jamo of keys) {
    if (isConsJamo(jamo)) {
      if (syllable && syllable.vowel && !syllable.final && syllable.initial && FIN.includes(jamo)) {
        syllable.final = jamo; // 받침
      } else if (syllable && syllable.final && FJOIN[syllable.final + jamo]) {
        syllable.final = FJOIN[syllable.final + jamo]; // double 받침 (ㄳ, ㄺ …)
      } else {
        finishSyllable();
        syllable = {initial: jamo};
      }
    } else if (isVowelJamo(jamo)) {
      if (syllable && syllable.final) {
        // The 받침 moves to the new syllable: 각+ㅏ = 가가. Of a double 받침 only the second part moves.
        const [keptFinal, movingConsonant] = FSPLIT[syllable.final] || ['', syllable.final];
        syllable.final = keptFinal;
        finishSyllable();
        syllable = {initial: movingConsonant, vowel: jamo};
      } else if (syllable && syllable.vowel && VJOIN[syllable.vowel + jamo]) {
        syllable.vowel = VJOIN[syllable.vowel + jamo]; // ㅗ+ㅏ = ㅘ
      } else if (syllable && syllable.initial && !syllable.vowel) {
        syllable.vowel = jamo;
      } else {
        finishSyllable();
        syllable = {vowel: jamo};
      }
    } else {
      finishSyllable();
      text += jamo;
    }
  }
  finishSyllable();
  return text;
}

// Text -> the jamo you type for it, in order (compound vowels and double 받침 are two keys)
function keysFor(text) {
  const keys = [];
  for (const char of text) {
    // A syllable block is 0xAC00 + (initial * 21 + vowel) * 28 + final: 11172 blocks, 588 per initial.
    const blockIndex = char.charCodeAt(0) - 0xAC00;
    if (blockIndex < 0 || blockIndex > 11171) {
      keys.push(char);
      continue;
    }
    const initial = INIT[Math.floor(blockIndex / 588)];
    const vowel = VOW[Math.floor(blockIndex % 588 / 28)];
    const finalConsonant = FIN[blockIndex % 28];
    keys.push(initial, ...(VSPLIT[vowel] || [vowel]));
    if (finalConsonant) keys.push(...(FSPLIT[finalConsonant] || [finalConsonant]));
  }
  return keys;
}

if (typeof module !== 'undefined') module.exports = {KEY_JAMO, SHIFT_JAMO, KEY_ROWS, JAMO_KEY, composeJamo, keysFor};
