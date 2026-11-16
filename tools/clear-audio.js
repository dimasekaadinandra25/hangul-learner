// Finishes a voice clip: same loudness for every clip (EBU R128, -16 LUFS), saved once as Opus (.ogg): about a third
// of the size of an MP3 at the same quality. Used by gen-audio.js. Needs ffmpeg on PATH.
const {execFile}=require('child_process');
const fs=require('fs');
// trim the silence the voice service puts before speech (keeps 40 ms), then even loudness
const FILTER='silenceremove=start_periods=1:start_silence=0.04:start_threshold=-50dB,loudnorm=I=-16:TP=-1.5:LRA=11';

// src: the recorded MP3 (deleted afterwards); out: the .ogg the app plays
// trim=false for clips with word timings (the times must match the clip)
const polish=(src,out,trim=true)=>new Promise((res,rej)=>{
  const tmp=out+'.tmp.ogg';
  execFile('ffmpeg',['-v','error','-y','-i',src,'-af',trim?FILTER:FILTER.split(',').pop(),'-ar','24000','-ac','1','-c:a','libopus','-b:a','32k',tmp],e=>{
    if(e){fs.rmSync(tmp,{force:true});return rej(e)}
    fs.renameSync(tmp,out);fs.rmSync(src,{force:true});res();
  });
});
module.exports={FILTER,polish};
