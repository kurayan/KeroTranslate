import {createNotice} from './notice.js';
import {Composer} from '../core/composer.js';
import {style} from './style.js';
import {RELEASE_LABEL} from '../core/version.js';
const frogIconUrl=new URL('../assets/kero-frog.png',import.meta.url).href;
export function mountComposer(host,{translate,translateBatch,insert,settings,openSettings=()=>{},captureAction,timingAction,themeAction,captionsOnly=false}){
  const root=host.attachShadow({mode:'closed'});
  root.innerHTML=`<style>${style}</style><section class="panel" aria-label="KeroTranslate composer"><header class="head"><span class="frog" aria-hidden="true"><img src="${frogIconUrl}" alt="" width="29" height="29"></span><span class="brand">KeroTranslate</span><span class="tag">${RELEASE_LABEL}</span><select class="theme" aria-label="Panel theme" title="Panel theme"><option value="dark">Dark</option><option value="light">Light</option></select><button class="minimize" aria-label="Minimize panel" aria-expanded="true" title="Minimize panel">−</button><button class="gear" aria-label="Open settings">⚙</button></header><div class="progress-track"><div class="comment-progress" role="progressbar" aria-label="Translating comment" hidden><span></span></div></div><div class="body"><div class="bar"><select class="direction" aria-label="Translation direction"><option value="en">EN → JA</option><option value="ja">JA → EN</option></select><span class="micro provider"></span><span class="phase" role="status"></span></div><label class="label" for="original">Original <span>Your words</span></label><textarea id="original" maxlength="2000" placeholder="Say something to the stream…"></textarea><div class="row-actions"><span class="micro count">0 / 2000</span><button class="original-insert">INSERT ↗</button></div><label class="label" for="mtl">MTL <span>Translation · editable when current</span></label><textarea id="mtl" maxlength="2000" placeholder="Your translation will appear here"></textarea><div class="row-actions"><span class="micro timing">Waiting for your words</span><button class="mtl-insert insert">INSERT ↗</button></div><div class="back-label">re-MTL <span class="micro">/ meaning check</span></div><div class="back" aria-live="polite">—</div><div class="notice" role="status"></div><div class="conflict hidden">YouTube already has a draft. Replace it?<div><button class="replace">Replace draft</button><button class="keep">Keep draft</button></div></div><div class="tools"><button class="retry" title="Restart original translation and meaning check">Retry all</button></div></div><footer class="foot">INSERT fills the chat input. It never sends.<br>re-MTL helps you check meaning; it cannot guarantee accuracy.</footer></section>`;
  const q=s=>root.querySelector(s);let pending=null,busy=false,mtlComposing=false,disconnected=false;
  if(captionsOnly){q('.body').innerHTML='<div class="notice" role="status"></div>';q('.progress-track').remove();q('.panel').setAttribute('aria-label','KeroTranslate caption controls');q('.foot').textContent='Archive captions · After seeking, press Start captions again. First use on a tab may require Start captions in the toolbar popup.';}
  const notice=createNotice(q('.notice'));
  let themeBusy=false;
  function refreshTheme(value){
    const panelTheme=value==='light'?'light':'dark';settings={...settings,panelTheme};
    q('.panel').dataset.theme=panelTheme;q('.theme').value=panelTheme;
  }
  q('.theme').hidden=!themeAction;
  q('.theme').onchange=async()=>{
    if(themeBusy||!themeAction)return;
    themeBusy=true;q('.theme').disabled=true;
    try{const r=await themeAction(q('.theme').value);if(!r?.ok)throw new Error(r?.error||'Could not save panel theme.');refreshTheme(r.panelTheme);}
    catch(e){refreshTheme(settings.panelTheme);notice.set(e.message,true);}
    finally{themeBusy=false;q('.theme').disabled=disconnected;}
  };
  let minimized=false;
  q('.minimize').onclick=()=>{minimized=!minimized;q('.body').hidden=minimized;q('.foot').hidden=minimized;q('.minimize').textContent=minimized?'+':'−';q('.minimize').setAttribute('aria-expanded',String(!minimized));q('.minimize').setAttribute('aria-label',minimized?'Expand panel':'Minimize panel');q('.minimize').title=minimized?'Expand panel':'Minimize panel';};
  let captureBusy=false,captureValue='STOPPED';
  const controls=document.createElement('div');controls.className='capture-controls';
  controls.innerHTML='<div class="bar capture-bar"><div class="capture-actions"><button class="capture-start insert">Start captions</button><button class="capture-stop">Stop</button><span class="capture-state micro" role="status">STOPPED</span></div><div class="quick-timing"><label>Request gap<select class="request-gap" aria-label="Minimum interval between translation requests"><option value="500">0.5 s</option><option value="1000">1 s</option><option value="2000">2 s</option><option value="4000">4 s</option><option value="6000">6 s</option><option value="12000">12 s</option></select></label><label>Caption hold<select class="caption-hold" aria-label="Keep captions after translation"><option value="5">5 s</option><option value="7">7 s</option><option value="10">10 s</option><option value="15">15 s</option><option value="20">20 s</option></select></label></div></div><div class="timing-message micro" role="status" aria-live="polite"></div><div class="capture-message notice" role="status"></div>';
  if(captureAction)q('.body').prepend(controls);
  const gap=controls.querySelector('.request-gap'),hold=controls.querySelector('.caption-hold'),timingMessage=controls.querySelector('.timing-message');
  const timingNotice=createNotice(timingMessage),captureNotice=createNotice(controls.querySelector('.capture-message'));
  let timingBusy=false;
  controls.querySelector('.quick-timing').hidden=!timingAction;
  function refreshTiming(input){
    settings={...settings,...input};gap.value=String(settings.translationInterval);hold.value=String(settings.captionDuration);
  }
  async function saveTiming(field,node){
    if(timingBusy||!timingAction)return;
    timingBusy=true;gap.disabled=hold.disabled=true;timingNotice.set('Saving…');
    try{
      const r=await timingAction({[field]:Number(node.value)});
      if(!r?.ok)throw new Error(r?.error||'Could not save timing settings.');
      refreshTiming(r.timings);timingNotice.set('Saved');
    }catch(e){refreshTiming(settings);timingNotice.set(e.message||'Could not save timing settings.',true);}
    finally{timingBusy=false;gap.disabled=hold.disabled=disconnected;}
  }
  gap.onchange=()=>saveTiming('translationInterval',gap);hold.onchange=()=>saveTiming('captionDuration',hold);
  function captureStatus({status='STOPPED',error=''}){
    captureValue=status;if(!captureAction||disconnected)return;
    controls.querySelector('.capture-state').textContent=status;
    captureNotice.set(error,!!error);
    controls.querySelector('.capture-start').disabled=captureBusy||!['STOPPED','ERROR'].includes(status);
    controls.querySelector('.capture-stop').disabled=captureBusy||status==='STOPPED';
  }
  async function controlCapture(action){
    if(captureBusy)return;captureBusy=true;captureStatus({status:captureValue});
    try{const r=await captureAction(action);captureStatus({status:r.ok?r.status:captureValue,error:r.ok?r.error:r.error||'Capture unavailable.'});}
    catch{captureStatus({status:captureValue,error:'Extension unavailable. Reload this YouTube page.'});}
    finally{captureBusy=false;if(disconnected)return;controls.querySelector('.capture-start').disabled=!['STOPPED','ERROR'].includes(captureValue);controls.querySelector('.capture-stop').disabled=captureValue==='STOPPED';}
  }
  controls.querySelector('.capture-start').onclick=()=>controlCapture('start');controls.querySelector('.capture-stop').onclick=()=>controlCapture('stop');captureStatus({});
  if(captionsOnly){
    const refresh=config=>{settings=config;refreshTheme(config.panelTheme);refreshTiming(config);};
    refresh(settings);q('.gear').onclick=openSettings;
    return {refresh,refreshTheme,refreshTiming,captureStatus,
      connectionLost(message){disconnected=true;notice.set(message,true);for(const selector of ['.theme','.gear'])q(selector).disabled=true;for(const selector of ['.capture-start','.capture-stop','.request-gap','.caption-hold'])controls.querySelector(selector).disabled=true;},
      dispose(){notice.dispose();timingNotice.dispose();captureNotice.dispose();host.remove();}};
  }
  const state=new Composer({translate,translateBatch,onChange:s=>{
    const working=['TRANSLATING','BACK_TRANSLATING'].includes(s.phase);
    q('.comment-progress').hidden=!working;q('.comment-progress').setAttribute('aria-label',s.phase==='BACK_TRANSLATING'?'Back-translating comment':'Translating comment');
    q('.phase').textContent=s.phase;q('.phase').dataset.state=s.phase;
    if(q('#original').value!==s.original)q('#original').value=s.original;
    if(q('#mtl').value!==s.mtl)q('#mtl').value=s.mtl;
    q('#mtl').disabled=!['READY','BACK_TRANSLATING','EDITING_MTL'].includes(s.phase);
    q('#mtl').classList.toggle('muted',['STALE','TRANSLATING'].includes(s.phase));
    q('.back').textContent=s.back||'—';notice.set(s.error,!!s.error);
    q('.original-insert').disabled=!state.canInsert('original')||busy;
    q('.mtl-insert').disabled=!state.canInsert('mtl')||busy;
    q('.count').textContent=`${s.original.length} / 2000`;
    q('.timing').textContent=s.phase==='READY'?`${(s.elapsed/1000).toFixed(1)}s · translated + checked`:'Latest text only';
    q('.retry').disabled=!s.original.trim()||state.composing||mtlComposing;
    pending=null;q('.conflict').classList.add('hidden');
  }});
  const refresh=config=>{settings=config;refreshTheme(config.panelTheme);refreshTiming(config);q('.direction').value=config.source;q('.provider').textContent=({gemini:'Gemini',openai:'OpenAI',deepl:'DeepL',deepseek:'DeepSeek'})[config.translationProvider]||'Unknown';state.configure(config);};
  refresh(settings);
  q('#original').addEventListener('compositionstart',()=>state.compositionStart());
  q('#original').addEventListener('compositionend',e=>state.compositionEnd(e.target.value));
  q('#original').addEventListener('input',e=>state.input(e.target.value));
  q('#mtl').addEventListener('compositionstart',()=>{mtlComposing=true;state.invalidate();state.state.phase='EDITING_MTL';state.state.back='';state.emit();});
  q('#mtl').addEventListener('compositionend',e=>{mtlComposing=false;state.editMtl(e.target.value);});
  q('#mtl').addEventListener('input',e=>{if(!mtlComposing)state.editMtl(e.target.value);});
  q('.direction').addEventListener('change',e=>state.configure({source:e.target.value}));
  q('.gear').onclick=openSettings;q('.retry').onclick=()=>state.retry();
  async function insertText(kind,replace=false){
    if(busy||!state.canInsert(kind))return;
    const text=kind==='original'?state.state.original:state.state.mtl;
    const expected=pending?.expected;
    busy=true;state.emit();
    try{
      const result=await insert(text,{replace,expected});
      if(result.conflict){pending={kind,expected:result.expected};q('.conflict').classList.remove('hidden');}
      else notice.set(result.message||'Inserted. Review and send in YouTube.');
    }catch(error){notice.set(error.message,true);}finally{busy=false;q('.original-insert').disabled=!state.canInsert('original');q('.mtl-insert').disabled=!state.canInsert('mtl');}
  }
  q('.original-insert').onclick=()=>insertText('original');q('.mtl-insert').onclick=()=>insertText('mtl');
  q('.replace').onclick=()=>{if(pending)insertText(pending.kind,true);};
  q('.keep').onclick=()=>{pending=null;q('.conflict').classList.add('hidden');};
  function connectionLost(message){
    disconnected=true;state.dispose();state.state.phase='ERROR';state.state.error=message;state.emit();
    q('#original').readOnly=true;q('#mtl').readOnly=true;
    for(const selector of ['.theme','.direction','.gear','.retry','.original-insert','.mtl-insert','.replace','.keep'])q(selector).disabled=true;
    for(const selector of ['.capture-start','.capture-stop','.request-gap','.caption-hold'])controls.querySelector(selector).disabled=true;
  }
  return {state,refresh,refreshTheme,refreshTiming,captureStatus,connectionLost,dispose:()=>{state.dispose();notice.dispose();timingNotice.dispose();captureNotice.dispose();host.remove();}};
}
