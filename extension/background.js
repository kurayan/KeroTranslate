import {initializeKeyStorage} from './core/key-storage.js';
import {sanitizeSettings} from './core/settings.js';
import {translate} from './core/providers.js';
import {TranslationQueue} from './core/translation-queue.js';
const translations=new TranslationQueue(),captionPending=new Map();
const pending=new Map();let lifecycle=Promise.resolve();
const ready=initializeKeyStorage(chrome.storage);
const trusted=sender=>sender.id===chrome.runtime.id&&sender.url?.startsWith(chrome.runtime.getURL(''));
const youtube=sender=>sender.id===chrome.runtime.id&&sender.tab&&/^https:\/\/www\.youtube\.com\/(watch|live_chat|live_chat_replay)(\?|$|\/)/.test(sender.url||'');
const ns=(sender,id)=>`${sender.tab?.id}:${sender.frameId}:${id}`;
async function settings(){await ready;return sanitizeSettings((await chrome.storage.local.get('settings')).settings);}
async function capture(){return (await chrome.storage.session.get('capture')).capture;}
async function broadcast(tabId,message){if(tabId!==undefined)await chrome.tabs.sendMessage(tabId,message).catch(()=>{});}
async function offscreen(){
  const contexts=await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']});
  if(!contexts.length)await chrome.offscreen.createDocument({url:'offscreen.html',reasons:['USER_MEDIA'],justification:'Process user-selected YouTube tab audio and preserve audible playback.'});
}
async function stop(){
  for(const controller of captionPending.values())controller.abort();captionPending.clear();
  const c=await capture();await chrome.storage.session.remove('capture');
  await chrome.runtime.sendMessage({target:'offscreen',type:'STOP'}).catch(()=>{});
  if(c)await broadcast(c.tabId,{type:'CAPTURE_STATUS',status:'STOPPED'});
  await chrome.action.setBadgeText({text:''});
}
async function start(tabId){
  await stop();const tab=await chrome.tabs.get(tabId);
  if(!/^https:\/\/www\.youtube\.com\/watch\?/.test(tab.url||''))throw new Error('Open a YouTube watch page first.');
  let check;
  for(let attempt=0;attempt<3;attempt++){
    check=await chrome.tabs.sendMessage(tabId,{type:'CHECK_LIVE'},{frameId:0}).catch(()=>null);
    if(check)break;
    if(attempt<2)await new Promise(resolve=>setTimeout(resolve,150));
  }
  if(!check)throw new Error('KeroTranslate is not connected to this page. Reload YouTube once after updating the extension, then start from the toolbar popup.');
  if(!check.live)throw new Error('The video player is not ready. Play the video, then try Start captions again.');
  if(!check.overlayReady)throw new Error(check.error||'Caption overlay is unavailable. Reload this YouTube page.');
  const config=await settings();const keys=(await chrome.storage.local.get('keys')).keys||{};
  const names={deepgram:'Deepgram',gemini:'Gemini',openai:'OpenAI',deepl:'DeepL',deepseek:'DeepSeek'};
  if(!keys[config.sttProvider])throw new Error(`Add your ${names[config.sttProvider]} API key in Settings.`);
  if(config.captionMode!=='original'&&!keys[config.translationProvider])throw new Error(`Add your ${names[config.translationProvider]} API key in Settings.`);
  await offscreen();
  const id=crypto.randomUUID();
  let streamId;
  {
    try{streamId=await chrome.tabCapture.getMediaStreamId({targetTabId:tabId});}
    catch{throw new Error('Open the KeroTranslate toolbar icon on this YouTube tab and press Start captions in that popup. If another extension is capturing this tab, stop its capture first.');}
  }
  await chrome.storage.session.set({capture:{id,tabId,url:tab.url,status:'STARTING',started:Date.now()}});
  await broadcast(tabId,{type:'CAPTURE_STATUS',status:'STARTING'});
  const reply=await chrome.runtime.sendMessage({target:'offscreen',type:'START',id,streamId,settings:config});
  if(!reply?.ok){await stop();throw new Error('Audio environment unavailable.');}
  await chrome.action.setBadgeBackgroundColor({color:'#315d30'});await chrome.action.setBadgeText({text:'ON'});
}
function serial(action){const next=lifecycle.then(action);lifecycle=next.catch(()=>{});return next;}
async function handle(m,sender){
  await ready;if(!trusted(sender)&&!youtube(sender))throw new Error('Unsupported page.');
  if(m.type==='CONFIG')return {settings:await settings()};
  if(m.type==='OPEN_SETTINGS'){await chrome.runtime.openOptionsPage();return {};}
  if(['PANEL_START','PANEL_STOP','PANEL_STATUS'].includes(m.type)){
    if(!youtube(sender)||!/^https:\/\/www\.youtube\.com\/live_chat(?:_replay)?(?:\?|$|\/)/.test(sender.url))throw new Error('Open the live chat panel.');
    const tabId=sender.tab.id;
    if(m.type==='PANEL_START')await serial(()=>start(tabId));
    if(m.type==='PANEL_STOP')await serial(async()=>{if((await capture())?.tabId===tabId)await stop();});
    const c=await capture();return {status:c?.tabId===tabId?c.status:'STOPPED',error:c?.tabId===tabId?c.error||'':''};
  }
  if(m.type==='PANEL_THEME'){
    if(!youtube(sender)||!/^https:\/\/www\.youtube\.com\/live_chat(?:_replay)?(?:\?|$|\/)/.test(sender.url))throw new Error('Open the live chat panel.');
    if(!['dark','light'].includes(m.panelTheme))throw new Error('Unsupported panel theme.');
    return serial(async()=>{
      const config={...await settings(),panelTheme:m.panelTheme};await chrome.storage.local.set({settings:config});
      for(const tab of await chrome.tabs.query({url:'https://www.youtube.com/*'}))await broadcast(tab.id,{type:'THEME_CHANGED',panelTheme:config.panelTheme});
      return {panelTheme:config.panelTheme};
    });
  }
  if(m.type==='PANEL_TIMING'){
    if(!youtube(sender)||!/^https:\/\/www\.youtube\.com\/live_chat(?:_replay)?(?:\?|$|\/)/.test(sender.url))throw new Error('Open the live chat panel.');
    const choices={translationInterval:[500,1000,2000,4000,6000,12000],captionDuration:[5,7,10,15,20]};
    if(!m.timings||typeof m.timings!=='object'||Array.isArray(m.timings)||!Object.keys(m.timings).length||Object.entries(m.timings).some(([key,value])=>!Object.hasOwn(choices,key)||!choices[key].includes(value)))throw new Error('Unsupported timing setting.');
    return serial(async()=>{
      const config={...await settings(),...m.timings};await chrome.storage.local.set({settings:config});
      if('translationInterval' in m.timings)translations.updateInterval(config.translationInterval);
      const timings={translationInterval:config.translationInterval,captionDuration:config.captionDuration};
      for(const tab of await chrome.tabs.query({url:'https://www.youtube.com/*'}))await broadcast(tab.id,{type:'TIMING_CHANGED',timings});
      return {timings};
    });
  }
  if(m.type==='NAVIGATED'||m.type==='PLAYBACK_RESET'){
    for(const [key,item]of pending)if(key.startsWith(`${sender.tab?.id}:${sender.frameId}:`)){item.abort();pending.delete(key);}
    const c=await capture();if(sender.frameId===0&&c?.tabId===sender.tab?.id)await serial(stop);return {};
  }
  if(m.type==='CANCEL'){pending.get(ns(sender,m.id))?.abort();return {};}
  if(m.type==='TRANSLATE'||m.type==='TRANSLATE_COMMENT'){
    if(!youtube(sender)||!/^https:\/\/www\.youtube\.com\/live_chat(?:\?|$|\/)/.test(sender.url))throw new Error('Composer translation is only available in live chat.');
    if(typeof m.id!=='string'||m.id.length>80)throw new Error('Invalid request.');
    const key=ns(sender,m.id),prefix=ns(sender,'');
    // One in-flight translation per frame; a new version cancels the old version.
    for(const [k,c]of pending)if(k.startsWith(prefix)){c.abort();pending.delete(k);}
    const controller=new AbortController();pending.set(key,controller);
    try{
      const config=await settings(),keys=(await chrome.storage.local.get('keys')).keys||{};
      if(m.type==='TRANSLATE_COMMENT'){
        const request=m.request||{},source=request.source,target=request.target;
        if(!['en','ja'].includes(source)||target!==(source==='en'?'ja':'en')||typeof request.text!=='string'||!request.text.trim()||request.text.length>2000||typeof request.backOnly!=='boolean'||(request.backOnly&&(typeof request.mtl!=='string'||!request.mtl.trim()||request.mtl.length>2000)))throw new Error('Invalid comment translation request.');
        let stage='queue';
        try{return await translations.schedule({provider:config.translationProvider,signal:controller.signal,priority:1,intervalMs:config.translationInterval,run:async({nextRequest})=>{
          stage=request.backOnly?'edited translation':'translation';
          const mtl=request.backOnly?request.mtl:await translate({text:request.text,source,target,signal:controller.signal},config,keys);
          if(controller.signal.aborted)throw new DOMException('Aborted','AbortError');
          // UI progress is best-effort: a busy YouTube frame must not delay re-MTL.
          try{void chrome.tabs.sendMessage(sender.tab.id,{type:'COMPOSER_PROGRESS',id:m.id,mtl},{frameId:sender.frameId}).catch(()=>{});}catch{}
          if(!request.backOnly){stage='back-translation wait';await nextRequest();}
          stage='back-translation';
          const back=await translate({text:mtl,source:target,target:source,signal:controller.signal},config,keys);
          return {mtl,back};
        }});}catch(error){
          if(/Illegal invocation/.test(error?.message||'')){
            // Log only the stage and local source locations, never text or keys.
            const locations=String(error.stack||'').split('\n').filter(line=>/^\s+at /.test(line)&&/chrome-extension:\/\//.test(line)).join('\n');
            console.error(`KeroTranslate comment failure (${stage})`,locations);
            const failure=new Error(`Comment ${stage}: Illegal invocation. Reload the extension and this YouTube page. If it recurs, report this stage.`);failure.code='RUNTIME';throw failure;
          }
          throw error;
        }
      }
      const text=await translations.schedule({provider:config.translationProvider,signal:controller.signal,priority:1,intervalMs:config.translationInterval,run:()=>translate({...m.request,signal:controller.signal},config,keys)});
      return {text};
    }finally{if(pending.get(key)===controller)pending.delete(key);}
  }
  if(!trusted(sender))throw new Error('Open extension settings for this action.');
  if(m.type==='CAPTION_TRANSLATE'||m.type==='CAPTION_CANCEL'){
    if(sender.tab||sender.url!==chrome.runtime.getURL('offscreen.html'))throw new Error('Caption translation is only available to audio capture.');
    if(typeof m.id!=='string'||m.id.length>80||typeof m.requestId!=='string'||m.requestId.length>80)throw new Error('Invalid caption request.');
    const key=`${m.id}:${m.requestId}`;
    if(m.type==='CAPTION_CANCEL'){captionPending.get(key)?.abort();return {};}
    const controller=new AbortController();captionPending.set(key,controller);
    try{
      const c=await capture();if(!c||c.id!==m.id)throw new Error('Caption session has ended.');
      const config=await settings(),keys=(await chrome.storage.local.get('keys')).keys||{};let usage={};
      const text=await translations.schedule({provider:config.translationProvider,signal:controller.signal,priority:0,intervalMs:config.translationInterval,run:()=>translate({text:m.request?.text,source:'auto',target:config.captionTarget,signal:controller.signal},config,keys,u=>{usage=u;})});
      return {text,usage};
    }finally{if(captionPending.get(key)===controller)captionPending.delete(key);}
  }
  if(m.type==='PRIVATE_CONFIG')return {settings:await settings(),keys:(await chrome.storage.local.get('keys')).keys||{}};
  if(m.type==='STATUS')return {capture:await capture(),settings:await settings(),metrics:(await chrome.storage.session.get('metrics')).metrics||{}};
  if(m.type==='TEST_OVERLAY'){
    const result=await chrome.tabs.sendMessage(m.tabId,{type:'TEST_OVERLAY'},{frameId:0}).catch(()=>null);
    if(!result?.ok)throw new Error(result?.error||'Open a YouTube Live watch page and reload it.');
    return {overlayReady:true};
  }
  if(m.type==='SAVE_SETTINGS')return serial(async()=>{
    const config=sanitizeSettings(m.settings);await stop();
    for(const c of pending.values())c.abort();pending.clear();
    await chrome.storage.local.set({settings:config});
    translations.updateInterval(config.translationInterval);
    if(m.keys)await chrome.storage.local.set({keys:Object.fromEntries(['gemini','deepgram','openai','deepl','deepseek'].map(name=>[name,String(m.keys[name]||'').trim().slice(0,500)]))});
    for(const tab of await chrome.tabs.query({url:'https://www.youtube.com/*'}))await broadcast(tab.id,{type:'CONFIG_CHANGED',settings:config});return {};
  });
  if(m.type==='CLEAR_KEYS'){await serial(stop);for(const c of pending.values())c.abort();pending.clear();await chrome.storage.local.remove('keys');await chrome.storage.session.remove('keys');return {};}
  if(m.type==='START_CAPTURE'){await serial(()=>start(m.tabId));return {};}
  if(m.type==='STOP_CAPTURE'){await serial(async()=>{if(m.tabId===undefined||(await capture())?.tabId===m.tabId)await stop();});return {};}
  if(sender.url===chrome.runtime.getURL('offscreen.html'))return serial(async()=>{
    const c=await capture();if(!c||c.id!==m.id)return {};
    if(m.type==='AUDIO_STATUS'){await chrome.storage.session.set({capture:{...c,status:m.status,error:m.error||''}});await broadcast(c.tabId,{type:'CAPTURE_STATUS',status:m.status,error:m.error||''});if(m.status==='ERROR')await chrome.action.setBadgeText({text:'ERR'});}
    if(m.type==='AUDIO_CUE')await broadcast(c.tabId,{type:'CAPTION',cue:m.cue});
    if(m.type==='METRICS')await chrome.storage.session.set({metrics:m.metrics});
    return {};
  });
  throw new Error('Unknown action.');
}
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  if(m.target==='offscreen')return;
  handle(m,sender).then(result=>reply({ok:true,...result}),error=>reply({ok:false,error:error.message||'Operation failed.',code:error.code,retryAfterMs:error.retryAfterMs}));return true;
});
chrome.tabs.onRemoved.addListener(tabId=>{serial(async()=>{if((await capture())?.tabId===tabId)await stop();});for(const [key,c]of pending)if(key.startsWith(`${tabId}:`)){c.abort();pending.delete(key);}});
chrome.tabs.onUpdated.addListener((tabId,change)=>{if(change.url||change.status==='loading')serial(async()=>{if((await capture())?.tabId===tabId)await stop();});});
