// Records every letter/word clip with Microsoft's neural Korean voice (needs: python -m pip install edge-tts, ffmpeg, internet).
// Skips clips that already exist; delete audio/ to re-record. 8 clips at a time; retries flaky network calls and keeps going on failure.
const {execFile}=require('child_process');
const fs=require('fs'),path=require('path');
const {RECORDED,audioName}=require('../ui/data.js');
const {DIALOGUES}=require('../ui/practice-data.js'); // adds numbers, verb forms, sound-change words and story lines to RECORDED
const {polish}=require('./clear-audio.js'); // even loudness, saved as Opus

const dir=path.join(__dirname,'..','ui','audio');
fs.mkdirSync(dir,{recursive:true});
const SUNHI='ko-KR-SunHiNeural',INJOON='ko-KR-InJoonNeural',RATE='-10%'; // 90% speed: clear but still natural (the app's Slowly button plays 0.7x)
// Everything in SunHi's voice; in conversations the second speaker (B) also gets InJoon's voice (m-<name>.ogg)
const jobs=[...RECORDED.map(t=>[t,SUNHI,audioName(t)]),...[...new Set(DIALOGUES.flatMap(d=>d.lines.filter(l=>l[0]==='B').map(l=>l[1])))].map(t=>[t,INJOON,'m-'+audioName(t)])]
  .filter(([,,name])=>{const f=path.join(dir,name);return!(fs.existsSync(f)&&fs.statSync(f).size>500)});
const run=(cmd,args)=>new Promise((res,rej)=>execFile(cmd,args,e=>e?rej(e):res()));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const failed=[];let done=0;
async function record([text,voice,name]){
  const out=path.join(dir,name),mp3=out+'.rec.mp3';
  for(let attempt=1;attempt<=3;attempt++){
    try{
      await run('python',['-m','edge_tts','--voice',voice,`--rate=${RATE}`,'--text',text,'--write-media',mp3]);
      if(fs.statSync(mp3).size>1000){await polish(mp3,out);return}
    }catch(e){}
    await sleep(3000); // brief back-off before retrying
  }
  failed.push(text);fs.rmSync(mp3,{force:true});
}
(async()=>{
  const queue=[...jobs];
  await Promise.all(Array.from({length:8},async()=>{for(let j;(j=queue.shift());){await record(j);if(++done%250===0)console.log(`${done}/${jobs.length} clips`)}}));
  console.log(`${jobs.length-failed.length}/${jobs.length} new clips ready in audio/`);
  if(failed.length){console.log('FAILED (run again later):',failed.join(', '));process.exitCode=1}
})();
