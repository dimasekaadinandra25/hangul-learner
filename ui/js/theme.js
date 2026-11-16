// ---- Theme: Auto (follows Windows) / Light / Dark. Per device, so Reset progress keeps it. ----
const THEMES=['auto','light','dark'],THEME_NAME={auto:'Auto',light:'Light',dark:'Dark'};
const getTheme=()=>{try{return localStorage.getItem('theme')||'auto'}catch(e){return'auto'}};
function setTheme(t){
  try{t==='auto'?localStorage.removeItem('theme'):localStorage.setItem('theme',t)}catch(e){}
  if(t==='auto')delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=t;
  renderTheme();
}
function renderTheme(){
  const t=getTheme(),next=THEMES[(THEMES.indexOf(t)+1)%3];
  document.querySelectorAll('[data-theme-btn]').forEach(b=>{b.innerHTML=icon(t==='auto'?'monitor':t==='light'?'sun':'moon');
    b.title=`Theme: ${THEME_NAME[t]} · click for ${THEME_NAME[next]}`;b.setAttribute('aria-label',`Theme: ${THEME_NAME[t]}. Switch to ${THEME_NAME[next]}`)});
  document.querySelectorAll('[data-set-theme]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.setTheme===t));
}
document.querySelectorAll('[data-theme-btn]').forEach(b=>b.onclick=()=>setTheme(THEMES[(THEMES.indexOf(getTheme())+1)%3]));
document.querySelectorAll('[data-set-theme]').forEach(b=>b.onclick=()=>setTheme(b.dataset.setTheme));
