// Makes voice clips clearer: even loudness (EBU R128, -16 LUFS), a little presence around 3 kHz, no low rumble.
// node tools/clear-audio.js        -> processes every clip in ui/audio once (a list of done files is kept)
// require('./clear-audio').polish(file) -> used by gen-audio.js for new clips. Needs ffmpeg on PATH.
const {execFile}=require('child_process');
const fs=require('fs'),path=require('path');
const FILTER='highpass=f=70,equalizer=f=3200:t=q:w=1.2:g=3,loudnorm=I=-16:TP=-1.5:LRA=11';
const dir=path.join(__dirname,'..','ui','audio'),doneFile=path.join(__dirname,'clear-audio-done.txt'); // kept out of ui/ so it is not bundled

const polish=file=>new Promise((res,rej)=>{
  const tmp=file+'.tmp.mp3';
  execFile('ffmpeg',['-v','error','-y','-i',file,'-af',FILTER,'-ar','24000','-ac','1','-b:a','64k',tmp],e=>{
    if(e){fs.rmSync(tmp,{force:true});return rej(e)}
    fs.renameSync(tmp,file);res();
  });
});
module.exports={FILTER,polish,markDone:name=>fs.appendFileSync(doneFile,name+'\n')};

if(require.main===module)(async()=>{
  const done=new Set(fs.existsSync(doneFile)?fs.readFileSync(doneFile,'utf8').split('\n'):[]);
  const todo=fs.readdirSync(dir).filter(f=>f.endsWith('.mp3')&&!done.has(f));
  let n=0,failed=[];
  const worker=async()=>{for(let f;(f=todo.pop());){try{await polish(path.join(dir,f));module.exports.markDone(f)}catch(e){failed.push(f)}if(++n%250===0)console.log(`${n} clips done`)}};
  await Promise.all(Array.from({length:8},worker));
  console.log(`${n-failed.length} clips made clearer${failed.length?`, ${failed.length} failed: ${failed.slice(0,5).join(', ')}`:''}`);
  process.exitCode=failed.length?1:0;
})();
