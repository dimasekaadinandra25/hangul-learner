// Korean typing without a Korean keyboard installed: the standard 2-beolsik (두벌식) layout on physical key codes,
// and a composer that turns typed jamo into syllable blocks the way Windows' Korean IME does.
// Needs INIT, VOW, FIN, compose, decompose from data.js. Tested by tools/check.js.
const KEY_JAMO={KeyQ:'ㅂ',KeyW:'ㅈ',KeyE:'ㄷ',KeyR:'ㄱ',KeyT:'ㅅ',KeyY:'ㅛ',KeyU:'ㅕ',KeyI:'ㅑ',KeyO:'ㅐ',KeyP:'ㅔ',
  KeyA:'ㅁ',KeyS:'ㄴ',KeyD:'ㅇ',KeyF:'ㄹ',KeyG:'ㅎ',KeyH:'ㅗ',KeyJ:'ㅓ',KeyK:'ㅏ',KeyL:'ㅣ',
  KeyZ:'ㅋ',KeyX:'ㅌ',KeyC:'ㅊ',KeyV:'ㅍ',KeyB:'ㅠ',KeyN:'ㅜ',KeyM:'ㅡ'};
const SHIFT_JAMO={KeyQ:'ㅃ',KeyW:'ㅉ',KeyE:'ㄸ',KeyR:'ㄲ',KeyT:'ㅆ',KeyO:'ㅒ',KeyP:'ㅖ'};
const KEY_ROWS=[['KeyQ','KeyW','KeyE','KeyR','KeyT','KeyY','KeyU','KeyI','KeyO','KeyP'],['KeyA','KeyS','KeyD','KeyF','KeyG','KeyH','KeyJ','KeyK','KeyL'],['KeyZ','KeyX','KeyC','KeyV','KeyB','KeyN','KeyM']];
// jamo -> {code, shift} for the on-screen keyboard hints
const JAMO_KEY=Object.fromEntries([...Object.entries(KEY_JAMO).map(([c,j])=>[j,{code:c,shift:false}]),...Object.entries(SHIFT_JAMO).map(([c,j])=>[j,{code:c,shift:true}])]);
const VJOIN={'ㅗㅏ':'ㅘ','ㅗㅐ':'ㅙ','ㅗㅣ':'ㅚ','ㅜㅓ':'ㅝ','ㅜㅔ':'ㅞ','ㅜㅣ':'ㅟ','ㅡㅣ':'ㅢ'};
const FJOIN={'ㄱㅅ':'ㄳ','ㄴㅈ':'ㄵ','ㄴㅎ':'ㄶ','ㄹㄱ':'ㄺ','ㄹㅁ':'ㄻ','ㄹㅂ':'ㄼ','ㄹㅅ':'ㄽ','ㄹㅌ':'ㄾ','ㄹㅍ':'ㄿ','ㄹㅎ':'ㅀ','ㅂㅅ':'ㅄ'};
const VSPLIT=Object.fromEntries(Object.entries(VJOIN).map(([k,v])=>[v,[...k]]));
const FSPLIT=Object.fromEntries(Object.entries(FJOIN).map(([k,v])=>[v,[...k]]));
const isVowelJamo=j=>VOW.includes(j);
const isConsJamo=j=>INIT.includes(j)||FIN.includes(j);

// Typed jamo (one per key press) -> text. Anything that is not jamo (space, punctuation) passes through.
function composeJamo(keys){
  let out='',c=null; // c = syllable being built {i, v, f}
  const flush=()=>{if(c)out+=c.i&&c.v?compose(INIT.indexOf(c.i),VOW.indexOf(c.v),c.f?FIN.indexOf(c.f):0):(c.i||c.v);c=null};
  for(const j of keys){
    if(isConsJamo(j)){
      if(c&&c.v&&!c.f&&c.i&&FIN.includes(j))c.f=j;                       // 받침
      else if(c&&c.f&&FJOIN[c.f+j])c.f=FJOIN[c.f+j];                      // double 받침 (ㄳ, ㄺ …)
      else{flush();c={i:j}}
    }else if(isVowelJamo(j)){
      if(c&&c.f){                                                          // the 받침 moves to the new syllable: 각+ㅏ = 가가
        const sp=FSPLIT[c.f],next=sp?sp[1]:c.f;c.f=sp?sp[0]:'';flush();c={i:next,v:j};
      }else if(c&&c.v&&VJOIN[c.v+j])c.v=VJOIN[c.v+j];                    // ㅗ+ㅏ = ㅘ
      else if(c&&c.i&&!c.v)c.v=j;
      else{flush();c={v:j}}
    }else{flush();out+=j}
  }
  flush();
  return out;
}
// Text -> the jamo you type for it, in order (compound vowels and double 받침 are two keys)
function keysFor(text){
  const out=[];
  for(const ch of text){
    const code=ch.charCodeAt(0)-0xAC00;
    if(code<0||code>11171){out.push(ch);continue}
    const[i,v,f]=[INIT[Math.floor(code/588)],VOW[Math.floor(code%588/28)],FIN[code%28]];
    out.push(i,...(VSPLIT[v]||[v]),...(f?FSPLIT[f]||[f]:[]));
  }
  return out;
}
if(typeof module!=='undefined')module.exports={KEY_JAMO,SHIFT_JAMO,KEY_ROWS,JAMO_KEY,composeJamo,keysFor};
