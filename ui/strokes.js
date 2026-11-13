// Stroke order for every letter: strokes in writing order, each a polyline drawn in that direction,
// in a 100x100 box. Double consonants and compound vowels are built from their parts.
// strokeScore compares what you drew with the template. Tested by tools/check.js.
const circle=(cx,cy,r)=>Array.from({length:25},(_,k)=>{const a=-Math.PI/2-k/24*2*Math.PI;return[+(cx+r*Math.cos(a)).toFixed(1),+(cy+r*Math.sin(a)).toFixed(1)]}); // from the top, anticlockwise
const BASE_STROKES={
  'ㄱ':[[[20,20],[78,20],[78,85]]],
  'ㄴ':[[[22,15],[22,80],[82,80]]],
  'ㄷ':[[[22,18],[78,18]],[[22,18],[22,80],[80,80]]],
  'ㄹ':[[[20,15],[78,15],[78,47]],[[22,47],[78,47]],[[22,47],[22,82],[82,82]]],
  'ㅁ':[[[22,18],[22,82]],[[22,18],[78,18],[78,82]],[[22,82],[78,82]]],
  'ㅂ':[[[25,15],[25,85]],[[75,15],[75,85]],[[25,48],[75,48]],[[25,85],[75,85]]],
  'ㅅ':[[[50,15],[20,85]],[[46,45],[82,85]]],
  'ㅇ':[circle(50,50,32)],
  'ㅈ':[[[22,18],[75,18],[25,85]],[[52,48],[82,85]]],
  'ㅊ':[[[45,4],[55,13]],[[22,25],[75,25],[25,88]],[[52,55],[82,88]]],
  'ㅋ':[[[20,18],[78,18],[78,85]],[[20,50],[78,50]]],
  'ㅌ':[[[22,18],[78,18]],[[22,50],[78,50]],[[22,18],[22,82],[80,82]]],
  'ㅍ':[[[18,18],[82,18]],[[38,18],[34,80]],[[62,18],[66,80]],[[15,82],[85,82]]],
  'ㅎ':[[[45,4],[55,12]],[[22,26],[78,26]],circle(50,62,22)],
  'ㅏ':[[[45,8],[45,92]],[[45,50],[72,50]]],
  'ㅑ':[[[42,8],[42,92]],[[42,38],[70,38]],[[42,62],[70,62]]],
  'ㅓ':[[[28,50],[55,50]],[[55,8],[55,92]]],
  'ㅕ':[[[28,38],[55,38]],[[28,62],[55,62]],[[55,8],[55,92]]],
  'ㅗ':[[[50,30],[50,62]],[[12,62],[88,62]]],
  'ㅛ':[[[38,32],[38,62]],[[62,32],[62,62]],[[12,62],[88,62]]],
  'ㅜ':[[[12,38],[88,38]],[[50,38],[50,75]]],
  'ㅠ':[[[12,38],[88,38]],[[38,38],[38,75]],[[62,38],[62,75]]],
  'ㅡ':[[[12,50],[88,50]]],
  'ㅣ':[[[50,8],[50,92]]],
  'ㅐ':[[[35,8],[35,92]],[[35,50],[58,50]],[[66,8],[66,92]]],
  'ㅒ':[[[33,8],[33,92]],[[33,38],[56,38]],[[33,62],[56,62]],[[66,8],[66,92]]],
  'ㅔ':[[[18,50],[42,50]],[[42,8],[42,92]],[[68,8],[68,92]]],
  'ㅖ':[[[16,38],[40,38]],[[16,62],[40,62]],[[40,8],[40,92]],[[68,8],[68,92]]],
};
// place a letter's strokes inside the rectangle x0..x1, y0..y1
const fit=(strokes,x0,y0,x1,y1)=>strokes.map(s=>s.map(([x,y])=>[+(x0+x*(x1-x0)/100).toFixed(1),+(y0+y*(y1-y0)/100).toFixed(1)]));
const pair=(a,b,split=50)=>[...fit(BASE_STROKES[a],0,0,split,100),...fit(BASE_STROKES[b],split,0,100,100)];
const STROKES={...BASE_STROKES,
  'ㄲ':pair('ㄱ','ㄱ'),'ㄸ':pair('ㄷ','ㄷ'),'ㅃ':pair('ㅂ','ㅂ'),'ㅆ':pair('ㅅ','ㅅ'),'ㅉ':pair('ㅈ','ㅈ'),
  'ㅘ':pair('ㅗ','ㅏ',62),'ㅙ':pair('ㅗ','ㅐ',55),'ㅚ':pair('ㅗ','ㅣ',65),'ㅝ':pair('ㅜ','ㅓ',58),'ㅞ':pair('ㅜ','ㅔ',52),'ㅟ':pair('ㅜ','ㅣ',65),'ㅢ':pair('ㅡ','ㅣ',65),
};

// Points every `step` units along each stroke
function samplePoints(strokes,step=3){
  const out=[];
  for(const s of strokes)for(let k=0;k<s.length;k++){
    if(k===0){out.push(s[0]);continue}
    const[a,b]=[s[k-1],s[k]],len=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.round(len/step));
    for(let t=1;t<=n;t++)out.push([a[0]+(b[0]-a[0])*t/n,a[1]+(b[1]-a[1])*t/n]);
  }
  return out;
}
// 0-100: how much of the template you covered (recall) and how much of your ink is on it (precision), within `near` units
function strokeScore(template,drawn,near=9){
  const T=samplePoints(template),D=samplePoints(drawn.filter(s=>s.length));
  if(!D.length)return 0;
  const close=(p,set)=>set.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<=near);
  const recall=T.filter(p=>close(p,D)).length/T.length,precision=D.filter(p=>close(p,T)).length/D.length;
  return recall+precision?Math.round(200*recall*precision/(recall+precision)):0;
}
if(typeof module!=='undefined')module.exports={STROKES,samplePoints,strokeScore};
