// Records every letter/word clip with Microsoft's neural Korean voice (needs: python -m pip install edge-tts, internet).
// Skips clips that already exist; delete audio/ to re-record. Retries flaky network calls and keeps going on failure.
const {execFileSync}=require('child_process');
const fs=require('fs'),path=require('path');
const {RECORDED,audioName}=require('../ui/data.js');
require('../ui/practice-data.js'); // adds numbers, verb forms, sound-change words and story lines to RECORDED

const dir=path.join(__dirname,'..','ui','audio');
fs.mkdirSync(dir,{recursive:true});
const {polish,markDone}=require('./clear-audio.js'); // new clips get the same clear, even loudness
const failed=[];
for(const text of RECORDED){
  const out=path.join(dir,audioName(text));
  if(fs.existsSync(out)&&fs.statSync(out).size>1000)continue;
  let ok=false;
  for(let attempt=1;attempt<=3&&!ok;attempt++){
    try{
      execFileSync('python',['-m','edge_tts','--voice','ko-KR-SunHiNeural','--rate=-20%','--text',text,'--write-media',out],{stdio:'pipe'});
      ok=fs.statSync(out).size>1000;
    }catch(e){
      if(attempt<3)execFileSync('python',['-c','import time; time.sleep(3)']); // brief back-off before retrying
    }
  }
  if(ok){try{execFileSync('ffmpeg',['-v','error','-y','-i',out,'-af',require('./clear-audio.js').FILTER,'-ar','24000','-ac','1','-b:a','64k',out+'.tmp.mp3']);fs.renameSync(out+'.tmp.mp3',out);markDone(path.basename(out))}catch(e){console.log('(not made clearer: ffmpeg missing)')}console.log(text,'->',path.basename(out))}
  else{failed.push(text);fs.rmSync(out,{force:true})}
}
console.log(`${RECORDED.length-failed.length}/${RECORDED.length} clips ready in audio/`);
if(failed.length){console.log('FAILED (run again later):',failed.join(', '));process.exitCode=1}
