(async()=>{
  const [{mountComposer},{mountCaptions},{insertDraft,watchPlayer}]=await Promise.all([
    import(chrome.runtime.getURL('ui/composer-view.js')),import(chrome.runtime.getURL('ui/captions.js')),import(chrome.runtime.getURL('youtube.js'))
  ]);
  let config,composer,captions,captionHost,chatHost,lastUrl=location.href,queued=false,generation=0,mounting;
  let contextValid=true,observer,watchedVideo,playbackReset=false;
  const resetPlayback=()=>{playbackReset=true;generation++;captions?.clear();if(contextValid)send({type:"PLAYBACK_RESET"}).catch(()=>{});};
  function unwatchVideo(){if(!watchedVideo)return;for(const event of ["seeking","ended"])watchedVideo.removeEventListener(event,resetPlayback);watchedVideo=null;}
  const reconnectMessage='KeroTranslate was reloaded or disconnected. Reload this YouTube page to reconnect. Your comment is still shown below.';
  function disconnect(){
    if(!contextValid)return;contextValid=false;generation++;observer?.disconnect();
    unwatchVideo();composer?.connectionLost(reconnectMessage);captions?.dispose();captions=null;captionHost=null;
  }
  // Chrome may throw synchronously after an extension update, including on CANCEL.
  // Always return a promise so every caller can handle that failure.
  const send=async message=>{
    if(!contextValid)throw new Error(reconnectMessage);
    try{return await chrome.runtime.sendMessage(message);}
    catch(error){if(/Extension context invalidated/i.test(error?.message||'')){disconnect();throw new Error(reconnectMessage);}throw error;}
  };
  const progress=new Map();
  async function translateBatch({signal,onProgress,...request}){
    const id=crypto.randomUUID();let timer;
    const abort=()=>send({type:'CANCEL',id}).catch(()=>{});
    if(signal.aborted)throw new DOMException('Aborted','AbortError');
    progress.set(id,onProgress);
    let rejectWait;
    const cancelled=new Promise((_resolve,reject)=>{rejectWait=reject;});
    const onAbort=()=>{abort();rejectWait(new DOMException('Aborted','AbortError'));};
    signal.addEventListener('abort',onAbort,{once:true});
    const timeout=new Promise((_resolve,reject)=>{timer=setTimeout(()=>{abort();reject(new Error('Comment translation timed out. Use Retry all to restart.'));},120000);});
    try{
      const result=await Promise.race([send({type:'TRANSLATE_COMMENT',id,request}),cancelled,timeout]);
      if(signal.aborted)throw new DOMException('Aborted','AbortError');
      if(!result?.ok)throw new Error(result?.error||'Extension unavailable. Reload this page.');
      return {mtl:result.mtl,back:result.back};
    }finally{clearTimeout(timer);progress.delete(id);signal.removeEventListener('abort',onAbort);}
  }
  function cleanup(){unwatchVideo();generation++;composer?.dispose();composer=null;captions?.dispose();captions=null;chatHost?.remove();captionHost?.remove();chatHost=null;captionHost=null;if(contextValid)send({type:'NAVIGATED'}).catch(()=>{});}
  async function initialize(){
    if(!contextValid)return;
    if(lastUrl!==location.href){cleanup();lastUrl=location.href;}
    if(!/^\/(watch|live_chat|live_chat_replay)\/?$/.test(location.pathname))return;
    const url=location.href,version=generation;
    if(!config){const result=await send({type:'CONFIG'});if(!contextValid||version!==generation||url!==location.href)return;if(!result?.ok||!result.settings)throw new Error('Settings unavailable. Reload this YouTube page.');config=result.settings;}
    if(/^\/live_chat(?:_replay)?\/?$/.test(location.pathname)){
      const replay=location.pathname.replace(/\/$/,'')==='/live_chat_replay';
      const renderer=document.querySelector(replay?'yt-live-chat-renderer':'yt-live-chat-message-input-renderer');
      if(renderer&&(!chatHost?.isConnected)){
        composer?.dispose();const host=document.createElement('div');host.style.cssText='flex:none;max-height:55vh;overflow:auto;margin:0 8px 8px;';
        const view=mountComposer(host,{settings:config,captionsOnly:replay,...(replay?{}:{translateBatch,insert:insertDraft}),openSettings:()=>send({type:'OPEN_SETTINGS'}),captureAction:action=>send({type:action==='start'?'PANEL_START':'PANEL_STOP'}),timingAction:timings=>send({type:'PANEL_TIMING',timings}),themeAction:panelTheme=>send({type:'PANEL_THEME',panelTheme})});
        if(replay)renderer.append(host);else renderer.before(host);chatHost=host;composer=view;
        send({type:'PANEL_STATUS'}).then(r=>{if(composer===view&&r.ok)view.captureStatus(r);}).catch(()=>{});
      }
    }else if(window===window.top){
      const player=watchPlayer();
      const video=player?.querySelector?.("video");
      if(video!==watchedVideo){unwatchVideo();if(video){watchedVideo=video;for(const event of ["seeking","ended"])video.addEventListener(event,resetPlayback);}}
      if(player&&(!captions||!captionHost?.isConnected||captionHost?.parentElement!==player)){captions?.dispose();captions=null;captionHost=null;const host=document.createElement('div');host.id='kero-caption-overlay';const view=mountCaptions(host,config);player.append(host);captionHost=host;captions=view;}
    }
  }
  function mount(){if(!mounting)mounting=initialize().finally(()=>{mounting=null;});return mounting;}
  async function prepareOverlay(test){
    const url=location.href;let failed=false;
    // Retry a mount invalidated by navigation/STOPPED; also allow the player to attach.
    for(let attempt=0;attempt<4;attempt++){
      try{await mount();failed=false;}catch{failed=true;}
      if(url!==location.href)return {ok:false,live:false,overlayReady:false};
      const live=!!watchPlayer(),overlayReady=live&&!!captions&&!!captionHost?.isConnected;
      if(overlayReady){if(test)captions.show({original:'字幕の表示テストです',translation:'Caption overlay is working.'});return {ok:true,live,overlayReady};}
      if(attempt<3)await new Promise(resolve=>setTimeout(resolve,150));
    }
    return {ok:false,live:!!watchPlayer(),overlayReady:false,error:failed?'Caption overlay could not initialize. If the extension was just updated, reload YouTube once, then use Start captions in the toolbar popup.':'Caption overlay is not ready yet. Wait for the video to load and try Start captions again.'};
  }
  chrome.runtime.onMessage.addListener((message,_sender,respond)=>{
    if(message.type==='COMPOSER_PROGRESS')progress.get(message.id)?.({mtl:message.mtl});
    if(message.type==='CHECK_LIVE'||message.type==='TEST_OVERLAY'){
      prepareOverlay(message.type==='TEST_OVERLAY').then(respond);return true;
    }
    if(message.type==='CAPTURE_STATUS'&&message.status==='STARTING')playbackReset=false;
    if(message.type==='CAPTION'&&!playbackReset){const version=generation;mount().then(()=>{if(version===generation)captions?.show(message.cue);}).catch(()=>{});}
    if(message.type==='CAPTURE_STATUS'&&['STOPPED','ERROR','STARTING'].includes(message.status)){generation++;captions?.clear();}
    if(message.type==='CAPTURE_STATUS')composer?.captureStatus(message);
    if(message.type==='THEME_CHANGED'){config={...config,panelTheme:message.panelTheme};composer?.refreshTheme(message.panelTheme);}
    if(message.type==='TIMING_CHANGED'){config={...config,...message.timings};composer?.refreshTiming(message.timings);captions?.configure(config);}
    if(message.type==='CONFIG_CHANGED'){config=message.settings;composer?.refresh(config);captions?.configure(config);}
  });
  observer=new MutationObserver(()=>{if(!queued){queued=true;setTimeout(()=>{queued=false;mount().catch(()=>{});},400);}});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('yt-navigate-start',cleanup);
  window.addEventListener('pagehide',()=>{cleanup();observer.disconnect();},{once:true});
  await mount();
})().catch(()=>{});
