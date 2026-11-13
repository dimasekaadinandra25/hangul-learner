// Build and publish a version that installed apps update to by themselves.
//   npm run build                    -> signed installer in src-tauri/target/release/bundle/nsis (no upload)
//   npm run release -- "What's new"  -> build, then publish it on GitHub Releases of this (public) repository
// Version: bump "version" in src-tauri/tauri.conf.json and src-tauri/Cargo.toml first.
// Signing key: %USERPROFILE%\.tauri\hangul-learner.key (never commit it; without it installed apps can't be updated).
const {execFileSync}=require('child_process');
const fs=require('fs'),path=require('path'),os=require('os');

const ROOT=path.join(__dirname,'..');
const RELEASES='dimasekaadinandra25/hangul-learner'; // must stay public: installed apps download latest.json + installer from it
const KEY=path.join(os.homedir(),'.tauri','hangul-learner.key');
const version=JSON.parse(fs.readFileSync(path.join(ROOT,'src-tauri','tauri.conf.json'),'utf8')).version;
const publish=process.argv[2]==='--publish';
const notes=process.argv.slice(publish?3:2).join(' ')||`Hangul Learner ${version}`;

if(!fs.existsSync(KEY))throw new Error('Signing key missing: '+KEY);
const run=(cmd,args)=>execFileSync(cmd,args,{cwd:ROOT,stdio:'inherit',shell:process.platform==='win32',
  env:{...process.env,TAURI_SIGNING_PRIVATE_KEY:fs.readFileSync(KEY,'utf8'),TAURI_SIGNING_PRIVATE_KEY_PASSWORD:''}});

run('npx',['tauri','build']);
if(!publish)return;

const nsis=path.join(ROOT,'src-tauri','target','release','bundle','nsis');
const exe=path.join(nsis,`Hangul Learner_${version}_x64-setup.exe`),sig=exe+'.sig';
if(!fs.existsSync(exe)||!fs.existsSync(sig))throw new Error('Signed installer not found: '+exe);
// GitHub turns spaces in file names into dots, so upload under a name without spaces
const out=fs.mkdtempSync(path.join(os.tmpdir(),'hangul-release-')),name=`HangulLearner_${version}_x64-setup.exe`;
fs.copyFileSync(exe,path.join(out,name));
fs.writeFileSync(path.join(out,'latest.json'),JSON.stringify({version,notes,pub_date:new Date().toISOString(),
  platforms:{'windows-x86_64':{signature:fs.readFileSync(sig,'utf8').trim(),url:`https://github.com/${RELEASES}/releases/download/v${version}/${name}`}}},null,2));
execFileSync('gh',['release','create',`v${version}`,'--repo',RELEASES,'--title',`Hangul Learner ${version}`,'--notes',notes,
  path.join(out,name),path.join(out,'latest.json')],{stdio:'inherit'});
fs.rmSync(out,{recursive:true,force:true});
console.log(`Published ${version}. Installed apps will offer it within a day (Settings › Updates › Check for updates for now).`);
