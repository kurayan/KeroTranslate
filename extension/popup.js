import {createNotice} from './ui/notice.js';
const q=id=>document.getElementById(id);
const message=createNotice(q('message'));
window.addEventListener('pagehide',()=>message.dispose(),{once:true});
const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
const tabId=tab?.id,validTab=Number.isInteger(tabId)&&/^https:\/\/www\.youtube\.com\/watch\?/.test(tab?.url||'');
let busy=false,loaded=false,current=null,lastCaptureError=false;
function render(){
  const own=current?.tabId===tabId?current:null;
  q('status').textContent=own?.status||'Stopped on this tab';
  q('start').disabled=busy||!loaded||!validTab||!!(own&&!['STOPPED','ERROR'].includes(own.status));
  q('stop').disabled=busy||!loaded||!own;
  q('test').disabled=busy||!validTab;
}
async function refresh(){
  const r=await chrome.runtime.sendMessage({type:'STATUS'});
  if(!r?.ok)throw new Error(r?.error||'Extension unavailable.');
  current=r.capture;loaded=true;render();
  q('providers').textContent=`STT: ${r.settings.sttProvider} · MTL: ${r.settings.translationProvider}`;
  q('languages').textContent=`Speech: ${r.settings.speechLanguage} → Captions: ${r.settings.captionTarget}`;
  if(current?.tabId===tabId&&current.error){message.set(current.error,true);lastCaptureError=true;}
  else if(lastCaptureError){message.set(current?.tabId===tabId?'Captions running.':'Stopped on this tab.');lastCaptureError=false;}
}
async function control(type){
  if(busy)return;busy=true;render();message.set(type==='START_CAPTURE'?'Starting captions…':'Stopping captions…');
  try{
    const r=await chrome.runtime.sendMessage({type,tabId});
    message.set(r?.ok?(type==='START_CAPTURE'?'Starting on this tab. You can close this popup.':'Stopped on this tab.'):r?.error||'Capture unavailable.',!r?.ok);
    await refresh();
  }catch{message.set('Extension unavailable. Reopen this popup and try again.',true);}
  finally{busy=false;render();}
}
q('start').onclick=()=>control('START_CAPTURE');q('stop').onclick=()=>control('STOP_CAPTURE');
q('test').onclick=async()=>{try{const r=await chrome.runtime.sendMessage({type:'TEST_OVERLAY',tabId});message.set(r.ok?'Test caption shown. No audio or API request.':r.error,!r.ok);}catch{message.set('Reload this YouTube page and try again.',true);}};
q('settings').onclick=()=>chrome.runtime.openOptionsPage();render();
if(!validTab)message.set('Open a YouTube watch tab, then open this toolbar icon there.');
await refresh().catch(()=>{message.set('Could not load status. Reopen this popup.',true);});
setInterval(()=>{if(!busy)refresh().catch(()=>{});},1500);
