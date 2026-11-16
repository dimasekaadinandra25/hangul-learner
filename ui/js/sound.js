// Playing sound: the pre-recorded Korean clips, the computer's own voice as a fallback, and synthesized sound effects.
// Also the page-wide click handler for [data-go] (open a screen) and [data-say] (say a word) buttons.
// Needs: data.js (RECORDED, SLOW_CLIPS, MALE_CLIPS, audioName), lesson.js (todayStats), icons.js ($, icon),
// save.js (P, stat, save), notify.js (toast).
// Uses later files at run time: lsGet / PL / duck / unduck (listen.js), show (views.js).
// Provides: player (the <audio> for clips), speak, sfx, renderSfx.

// ---- Sound: pre-recorded neural voice (every syllable is recorded); computer's own voice only for unrecorded words ----
const player = new Audio();

// Says a Korean text: its recording when there is one; otherwise the system's Korean voice, or with no Korean voice,
// syllable by syllable from the recordings. rate < 1 plays slower (same pitch).
function speak(text, rate = 1) {
  const isKoreanVoice = voice => voice.lang.replace('_', '-').toLowerCase().startsWith('ko');

  const playRecording = () => {
    const slow = rate < 1 && SLOW_CLIPS.has(text); // a real slow recording instead of a stretched one
    const male = !slow && MALE_CLIPS.has(text) && lsGet('voice', 'female') === 'male';
    let prefix = '';
    if (slow) prefix = 's-';
    else if (male) prefix = 'm-';
    player.src = 'audio/' + prefix + audioName(text);
    const playbackRate = slow ? 1 : rate;
    player.playbackRate = playbackRate;
    player.defaultPlaybackRate = playbackRate;
    player.play().catch(() => {});
    // the podcast goes quiet while a word plays
    if (typeof PL !== 'undefined' && PL.playing()) {
      duck(15000);
      player.addEventListener('ended', unduck, {once: true});
    }
  };

  // Plays the syllables' recordings one after another; a newer speak() call stops it
  const playSyllables = syllables => {
    speak.run = (speak.run || 0) + 1;
    const run = speak.run;
    const playFrom = index => {
      if (run !== speak.run || index >= syllables.length) return;
      player.src = 'audio/' + audioName(syllables[index]);
      player.playbackRate = rate;
      player.onended = () => playFrom(index + 1);
      player.play().catch(() => {});
    };
    playFrom(0);
  };

  speak.run = (speak.run || 0) + 1; // stops a syllable-by-syllable word still playing
  player.onended = null;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (RECORDED.includes(text)) {
    playRecording();
    return;
  }
  if (!('speechSynthesis' in window)) return;
  if (!speechSynthesis.getVoices().some(isKoreanVoice)) {
    const syllables = [...text].filter(ch => ch !== ' ');
    // no Korean system voice: say it syllable by syllable from the recordings
    if (syllables.length && syllables.every(ch => /[가-힣]/.test(ch))) {
      playSyllables(syllables);
      return;
    }
    if (!speak.warned) {
      speak.warned = true;
      toast(
        'sync',
        'No Korean voice on this computer',
        'Some of your own words can’t be said. '
          + 'Add Korean in your system’s language or speech settings to hear them.',
        'volume',
      );
    }
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ko-KR';
  utterance.rate = 0.8 * rate;
  const koreanVoice = speechSynthesis.getVoices().find(isKoreanVoice);
  if (koreanVoice) utterance.voice = koreanVoice;
  speechSynthesis.speak(utterance);
}

// Sound effects, synthesized: soft bell (right), wood block (wrong), pentatonic phrase + stamp thump (lesson done)
let actx = null; // the AudioContext, made on first use
function sfx(kind) {
  if (P.sfx === false) return;
  try {
    actx ??= new AudioContext();
    const startTime = actx.currentTime + .01;
    // One note: frequency (Hz), start and length (seconds after startTime), wave type, peak volume
    const note = (frequency, offset, duration, type = 'sine', volume = .16) => {
      const oscillator = actx.createOscillator();
      const gain = actx.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      // exponential ramps can't start or end at 0, hence .0001
      gain.gain.setValueAtTime(.0001, startTime + offset);
      gain.gain.exponentialRampToValueAtTime(volume, startTime + offset + .01);
      gain.gain.exponentialRampToValueAtTime(.0001, startTime + offset + duration);
      oscillator.connect(gain).connect(actx.destination);
      oscillator.start(startTime + offset);
      oscillator.stop(startTime + offset + duration + .05);
    };
    if (kind === 'ok') {
      note(1046.5, 0, .6);
      note(1568, .07, .7, 'sine', .1);
    }
    if (kind === 'bad') {
      note(180, 0, .16, 'triangle', .22);
      note(135, .09, .2, 'triangle', .18);
    }
    if (kind === 'done') {
      const phrase = [523.3, 587.3, 659.3, 784, 880, 1046.5];
      phrase.forEach((frequency, index) => note(frequency, index * .1, .5, 'sine', .13));
      note(90, .68, .18, 'sine', .35);
    }
  } catch (error) {
    console.error(error);
  }
}

function renderSfx() {
  const on = P.sfx !== false;
  $('sfxToggle').textContent = 'Sound effects: ' + (on ? 'on' : 'off');
  $('sfxBtn').innerHTML = icon(on ? 'volume' : 'mute');
  $('sfxBtn').setAttribute('aria-pressed', on);
}

// Both buttons switch the sound effects on or off (P.sfx false = off; unset = on)
$('sfxBtn').onclick = () => {
  P.sfx = P.sfx === false;
  save();
};
$('sfxToggle').onclick = $('sfxBtn').onclick;

// Page-wide: a [data-go] button opens that screen; a [data-say] button says its text (and counts as heard)
document.addEventListener('click', event => {
  const goButton = event.target.closest('[data-go]');
  if (goButton) return show(goButton.dataset.go);
  const sayButton = event.target.closest('[data-say]');
  if (!sayButton) return;
  speak(sayButton.dataset.say);
  todayStats(P).heard++;
  if (sayButton.dataset.letter) stat(sayButton.dataset.letter).heard++;
  save();
});
