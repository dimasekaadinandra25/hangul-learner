// Records every clip with Microsoft's neural Korean voices (needs: python -m pip install edge-tts, ffmpeg, internet).
// Skips clips that already exist; delete audio/ to re-record. 8 clips at a time; retries flaky network calls and keeps going on failure.
//   <name>.ogg    SunHi at 90%: every letter, syllable (all 11,172), word, sentence, number, verb form
//   s-<name>.ogg  SunHi slowly: letters, syllables and words, for the Slowly buttons and Shift+R
//   m-<name>.ogg  InJoon (male): letters, syllables and words (Settings › Sound › Voice), and the second speaker in conversations
//   words.json    when each word is said in story and conversation lines, for word highlighting (those lines are not trimmed,
//                 so the times match the clip exactly)
const {execFile}=require('child_process');
const fs=require('fs'),path=require('path');
const {RECORDED,SLOW_CLIPS,MALE_CLIPS,audioName}=require('../ui/data.js');
const {DIALOGUES,STORIES}=require('../ui/practice-data.js'); // adds numbers, verb forms, sound-change words and story lines to RECORDED
const {polish}=require('./clear-audio.js'); // even loudness, saved as Opus

const dir=path.join(__dirname,'..','ui','audio');
fs.mkdirSync(dir,{recursive:true});
const SUNHI='ko-KR-SunHiNeural',INJOON='ko-KR-InJoonNeural',RATE='-10%',SLOW_RATE='-40%'; // 90% speed: clear but still natural
// audio/voice.json notes the settings the clips were made with: changing them must not leave old and new clips mixed
const VOICE={voice:SUNHI,second:INJOON,rate:RATE,slow:SLOW_RATE},note=path.join(dir,'voice.json');
if(fs.existsSync(note)&&JSON.stringify(JSON.parse(fs.readFileSync(note,'utf8')))!==JSON.stringify(VOICE)){
  console.error('The clips in ui/audio were made with other voice settings ('+fs.readFileSync(note,'utf8').trim()+'). Delete ui/audio to record them all again.');process.exit(1)}
fs.writeFileSync(note,JSON.stringify(VOICE)+'\n');

const wordsFile=path.join(dir,'words.json'),WORDS=fs.existsSync(wordsFile)?JSON.parse(fs.readFileSync(wordsFile,'utf8')):{};
const timedText=new Set([...STORIES.flatMap(s=>s.lines.map(l=>l[0])),...DIALOGUES.flatMap(d=>d.lines.map(l=>l[1]))]);
const bLines=[...new Set(DIALOGUES.flatMap(d=>d.lines.filter(l=>l[0]==='B').map(l=>l[1])))];
// [text, voice, file name, rate, timed]
const jobs=[...RECORDED.map(t=>[t,SUNHI,audioName(t),RATE,timedText.has(t)]),
  ...[...SLOW_CLIPS].map(t=>[t,SUNHI,'s-'+audioName(t),SLOW_RATE,false]),
  ...[...new Set([...MALE_CLIPS,...bLines])].map(t=>[t,INJOON,'m-'+audioName(t),RATE,timedText.has(t)])]
  .filter(([,,name,,timed])=>{const f=path.join(dir,name);return!(fs.existsSync(f)&&fs.statSync(f).size>500&&(!timed||WORDS[name]))});
const run=(cmd,args)=>new Promise((res,rej)=>execFile(cmd,args,e=>e?rej(e):res()));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const failed=[];let done=0;
async function record([text,voice,name,rate,timed]){
  const out=path.join(dir,name),mp3=out+'.rec.mp3',js=out+'.words.json';
  for(let attempt=1;attempt<=3;attempt++){
    try{
      if(timed)await run('python',[path.join(__dirname,'tts_words.py'),text,voice,rate,mp3,js]);
      else await run('python',['-m','edge_tts','--voice',voice,`--rate=${rate}`,'--text',text,'--write-media',mp3]);
      if(fs.statSync(mp3).size>1000){
        await polish(mp3,out,!timed);
        if(timed){WORDS[name]=JSON.parse(fs.readFileSync(js,'utf8'));fs.rmSync(js,{force:true})}
        return;
      }
    }catch(e){}
    await sleep(3000); // brief back-off before retrying
  }
  failed.push(text);fs.rmSync(mp3,{force:true});fs.rmSync(js,{force:true});
}
(async()=>{
  const queue=[...jobs];
  await Promise.all(Array.from({length:8},async()=>{for(let j;(j=queue.shift());){await record(j);if(++done%250===0){console.log(`${done}/${jobs.length} clips`);fs.writeFileSync(wordsFile,JSON.stringify(WORDS))}}}));
  fs.writeFileSync(wordsFile,JSON.stringify(WORDS));
  console.log(`${jobs.length-failed.length}/${jobs.length} new clips ready in audio/`);
  if(failed.length){console.log('FAILED (run again later):',failed.join(', '));process.exitCode=1}
})();
