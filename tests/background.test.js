import test from 'node:test';import assert from 'node:assert/strict';
const data={local:{},session:{keys:{gemini:'secret-g',deepgram:'secret-d'}}};let listener;const access=[];const sent=[];
const area=name=>({async setAccessLevel(v){access.push([name,v.accessLevel]);},async get(key){return {[key]:data[name][key]};},async set(v){Object.assign(data[name],v);},async remove(key){delete data[name][key];}});
globalThis.chrome={storage:{local:area('local'),session:area('session')},runtime:{id:'test',getURL:path=>`chrome-extension://test/${path}`,onMessage:{addListener(fn){listener=fn;}},async sendMessage(m){sent.push(m);return {ok:true};},async openOptionsPage(){}},tabs:{async sendMessage(tabId,m){sent.push({tabId,...m});},async query(){return [];},onRemoved:{addListener(){}},onUpdated:{addListener(){}}},action:{async setBadgeText(){},async setBadgeBackgroundColor(){}}};
await import('../extension/background.js');
const content={id:'test',url:'https://www.youtube.com/live_chat?v=demo',tab:{id:42},frameId:2};
const options={id:'test',url:'chrome-extension://test/options.html'};
const audio={id:'test',url:'chrome-extension://test/offscreen.html'};
const message=(m,s=content)=>new Promise(resolve=>listener(m,s,resolve));
test('storage is restricted to trusted extension contexts',()=>{assert.deepEqual(access,[['local','TRUSTED_CONTEXTS'],['session','TRUSTED_CONTEXTS']]);});
test('content scripts cannot read keys or mutate private settings',async()=>{for(const type of ['PRIVATE_CONFIG','CLEAR_KEYS','SAVE_SETTINGS','START_CAPTURE']){const r=await message({type});assert.equal(r.ok,false);assert.ok(!JSON.stringify(r).includes('secret-g'));}assert.equal(data.local.keys.gemini,'secret-g');});
test('public config contains no credentials',async()=>{const r=await message({type:'CONFIG'});assert.equal(r.ok,true);assert.ok(!JSON.stringify(r).includes('secret'));assert.equal(r.keys,undefined);});
test('unrelated page is rejected',async()=>{assert.equal((await message({type:'CONFIG'},{...content,url:'https://example.com/'})).ok,false);});
test('trusted options can retrieve persistent keys',async()=>{const r=await message({type:'PRIVATE_CONFIG'},options);assert.equal(r.keys.gemini,'secret-g');});
test('late audio events after Stop cannot revive session or publish captions',async()=>{data.session.capture={id:'old',tabId:42};await message({type:'STOP_CAPTURE'},options);const count=sent.length;await message({type:'AUDIO_STATUS',id:'old',status:'LISTENING'},audio);await message({type:'AUDIO_CUE',id:'old',cue:{original:'late'}},audio);assert.equal(data.session.capture,undefined);assert.equal(sent.length,count);});
test('key deletion clears persistent and legacy credentials',async()=>{data.session.keys={gemini:'legacy'};await message({type:'CLEAR_KEYS'},options);assert.equal(data.local.keys,undefined);assert.equal(data.session.keys,undefined);});
test('capture refuses a live player whose overlay failed initialization',async()=>{
  const send=chrome.tabs.sendMessage;
  chrome.tabs.get=async()=>({url:'https://www.youtube.com/watch?v=test'});
  chrome.tabs.sendMessage=async(_tab,m)=>m.type==='CHECK_LIVE'?{live:true,overlayReady:false}:undefined;
  try{const r=await message({type:'START_CAPTURE',tabId:42},options);assert.equal(r.ok,false);assert.match(r.error,/overlay/);assert.equal(data.session.capture,undefined);}
  finally{chrome.tabs.sendMessage=send;}
});
test('panel controls use the sender tab and cannot stop another tab or read private state',async()=>{
  data.session.capture={id:'other',tabId:99,status:'LISTENING',error:'private'};
  const r=await message({type:'PANEL_STOP',tabId:99});assert.equal(data.session.capture.tabId,99);assert.equal(r.status,'STOPPED');assert.equal(r.error,'');assert.equal(r.capture,undefined);
  data.session.capture={id:'own',tabId:42,status:'LISTENING'};assert.equal((await message({type:'PANEL_STATUS'})).status,'LISTENING');
  await message({type:'PANEL_STOP'});assert.equal(data.session.capture,undefined);
  assert.equal((await message({type:'PANEL_START'}, {...content,url:'https://example.com/'})).ok,false);
});
test('panel start ignores a supplied tab ID and targets its own live watch tab',async()=>{
  const get=chrome.tabs.get,send=chrome.tabs.sendMessage;let selected;
  chrome.tabs.get=async id=>{selected=id;return {url:'https://www.youtube.com/watch?v=test'};};chrome.tabs.sendMessage=async()=>({live:true,overlayReady:false});
  try{assert.equal((await message({type:'PANEL_START',tabId:99})).ok,false);assert.equal(selected,42);}finally{chrome.tabs.get=get;chrome.tabs.sendMessage=send;}
});
test('all provider keys remain private after saving and all are deleted together',async()=>{
  const keys={gemini:'g',deepgram:'d',openai:'private-openai',deepl:'private-deepl',deepseek:'private-deepseek',unknown:'drop'};
  assert.equal((await message({type:'SAVE_SETTINGS',settings:{translationProvider:'deepseek',sttProvider:'openai'},keys},options)).ok,true);
  assert.equal(data.local.keys.openai,keys.openai);assert.equal(data.local.keys.unknown,undefined);
  const config=await message({type:'CONFIG'});assert.equal(config.settings.sttProvider,'openai');assert.equal(config.settings.translationProvider,'deepseek');assert.ok(!JSON.stringify(config).includes('private-'));
  await message({type:'CLEAR_KEYS'},options);assert.equal(data.local.keys,undefined);assert.equal(data.session.keys,undefined);
});
test('new real STT providers require their own key and capture the selected tab',async()=>{
  const send=chrome.tabs.sendMessage;let captures=0;
  chrome.tabs.get=async()=>({url:'https://www.youtube.com/watch?v=test'});chrome.tabs.sendMessage=async()=>({live:true,overlayReady:true});
  chrome.runtime.getContexts=async()=>[{}];chrome.tabCapture={async getMediaStreamId({targetTabId}){assert.equal(targetTabId,42);captures++;return 'stream';}};
  try{for(const provider of ['openai','deepl']){
    data.local.settings={sttProvider:provider,captionMode:'original'};data.local.keys={};
    assert.match((await message({type:'START_CAPTURE',tabId:42},options)).error,/key/);
    data.local.keys={[provider]:'fake'};assert.equal((await message({type:'START_CAPTURE',tabId:42},options)).ok,true);
    assert.equal(sent.findLast(m=>m.target==='offscreen'&&m.type==='START').streamId,'stream');await message({type:'STOP_CAPTURE'},options);
  }assert.equal(captures,2);}finally{chrome.tabs.sendMessage=send;data.local.settings={};}
});
test('popup stop is scoped to its tab and cannot stop a different active tab',async()=>{
  data.session.capture={id:'other',tabId:99,status:'LISTENING'};await message({type:'STOP_CAPTURE',tabId:42},options);assert.equal(data.session.capture.tabId,99);
  await message({type:'STOP_CAPTURE',tabId:99},options);assert.equal(data.session.capture,undefined);
});
test('caption translation RPC rejects content scripts, non-audio pages and ended sessions',async()=>{
  const request={type:'CAPTION_TRANSLATE',id:'gone',requestId:'r',request:{text:'x'}};
  for(const sender of [content,options,audio])assert.equal((await message(request,sender)).ok,false);
});
test('worker serializes real caption, comment and back-translation HTTP together',async()=>{
  data.local.settings={translationProvider:'gemini',translationInterval:500,captionTarget:'en'};data.local.keys={gemini:'fake'};data.session.capture={id:'queue-session',tabId:42};
  const oldFetch=globalThis.fetch,order=[];let finish,active=0,maximum=0;
  const response=()=>({ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:'translated'}]}}]})});
  globalThis.fetch=async(_url,o)=>{active++;maximum=Math.max(maximum,active);const text=JSON.parse(o.body).contents[0].parts[0].text;order.push(text);if(text==='caption one')await new Promise(r=>finish=r);active--;return response();};
  try{
    const caption=n=>message({type:'CAPTION_TRANSLATE',id:'queue-session',requestId:n,request:{text:n}},audio);
    const first=caption('caption one');for(let i=0;i<30;i++)await Promise.resolve();assert.deepEqual(order,['caption one']);
    const second=caption('caption two');const comment=message({type:'TRANSLATE',id:'comment',request:{text:'comment',source:'ja',target:'en'}});
    for(let i=0;i<20;i++)await Promise.resolve();assert.equal(order.length,1);finish();assert.equal((await first).ok,true);assert.equal((await comment).ok,true);
    assert.equal((await message({type:'TRANSLATE',id:'back',request:{text:'back',source:'en',target:'ja'}})).ok,true);assert.equal((await second).ok,true);
    assert.equal(maximum,1);assert.deepEqual(order,['caption one','comment','back','caption two']);
  }finally{globalThis.fetch=oldFetch;data.local.settings={};delete data.session.capture;}
});

test('fresh and legacy demo configurations require keys before capturing audio',async()=>{
  const send=chrome.tabs.sendMessage,capture=chrome.tabCapture;
  chrome.tabs.get=async()=>({url:'https://www.youtube.com/watch?v=test'});
  chrome.tabs.sendMessage=async()=>({live:true,overlayReady:true});
  chrome.tabCapture={getMediaStreamId(){assert.fail('must not capture without configured keys');}};
  try{for(const settings of [{},{sttProvider:'demo',translationProvider:'demo'}]){
    data.local.settings=settings;data.local.keys={};
    const result=await message({type:'START_CAPTURE',tabId:42},options);
    assert.equal(result.ok,false);assert.match(result.error,/Deepgram API key/);
    assert.equal(data.session.capture,undefined);
    data.local.keys={deepgram:'fake'};
    assert.match((await message({type:'START_CAPTURE',tabId:42},options)).error,/Gemini API key/);
  }}finally{chrome.tabs.sendMessage=send;chrome.tabCapture=capture;data.local.settings={};data.local.keys={};}
});

test('saved credentials survive worker and browser-session restart without exposing keys',async()=>{
  const keys={gemini:'persistent-g',deepgram:'persistent-d',openai:'persistent-o',deepl:'persistent-l',deepseek:'persistent-s'};
  assert.equal((await message({type:'SAVE_SETTINGS',settings:{source:'en'},keys},options)).ok,true);
  assert.equal(data.session.keys,undefined);
  data.session={};
  await import('../extension/background.js?browser-restart');
  const config=await message({type:'PRIVATE_CONFIG'},options);
  assert.deepEqual(config.keys,keys);assert.equal(config.settings.source,'en');
  const status=await message({type:'STATUS'},options);
  assert.equal(status.capture,undefined);assert.ok(!JSON.stringify(status).includes('persistent-'));
  assert.equal((await message({type:'PRIVATE_CONFIG'})).ok,false);
  assert.ok(!JSON.stringify(await message({type:'CONFIG'})).includes('persistent-'));
  await message({type:'SAVE_SETTINGS',settings:{source:'ja'}},options);
  assert.deepEqual((await message({type:'PRIVATE_CONFIG'},options)).keys,keys);
  await message({type:'CLEAR_KEYS'},options);
  data.session={};
  await import('../extension/background.js?after-key-deletion');
  assert.deepEqual((await message({type:'PRIVATE_CONFIG'},options)).keys,{});
});

test('panel timing patches persist and broadcast without stopping capture or touching private settings',async()=>{
  const query=chrome.tabs.query;chrome.tabs.query=async()=>[{id:42},{id:99}];
  const keys={gemini:'private-key'};data.local.keys=keys;data.local.settings={translationProvider:'openai',source:'ja',captionSize:150,translationInterval:1000,captionDuration:5};
  const active={id:'keep-running',tabId:42,status:'LISTENING'};data.session.capture=active;const before=sent.length;
  try{
    const results=await Promise.all([message({type:'PANEL_TIMING',timings:{translationInterval:4000}}),message({type:'PANEL_TIMING',timings:{captionDuration:15}})]);
    assert.ok(results.every(r=>r.ok));assert.equal(data.local.settings.translationInterval,4000);assert.equal(data.local.settings.captionDuration,15);
    assert.equal(data.local.settings.translationProvider,'openai');assert.equal(data.local.settings.source,'ja');assert.equal(data.local.settings.captionSize,150);
    assert.deepEqual(data.local.keys,keys);assert.deepEqual(data.session.capture,active);
    const notifications=sent.slice(before);assert.equal(notifications.length,4);assert.ok(notifications.every(m=>m.type==='TIMING_CHANGED'));
    assert.deepEqual(notifications.at(-1).timings,{translationInterval:4000,captionDuration:15});
    assert.ok(!JSON.stringify([results,notifications]).includes('private-key'));
  }finally{chrome.tabs.query=query;delete data.session.capture;data.local.settings={};}
});
test('panel timing RPC rejects other senders, unsupported fields and invalid values',async()=>{
  const before=JSON.stringify(data.local);
  for(const sender of [options,audio,{...content,url:'https://www.youtube.com/watch?v=test'},{...content,id:'foreign'},{...content,url:'https://example.com/'}]){
    assert.equal((await message({type:'PANEL_TIMING',timings:{captionDuration:5}},sender)).ok,false);
  }
  for(const timings of [undefined,null,[],{}, {captionDuration:6},{captionDuration:'5'},{translationInterval:0},{translationProvider:'openai'},{keys:{gemini:'bad'}},{captionDuration:5,source:'ja'}]){
    assert.equal((await message({type:'PANEL_TIMING',timings})).ok,false);
  }
  assert.equal(JSON.stringify(data.local),before);
});


test('comment transaction holds the provider lane through back-translation and reports progress',async()=>{
  data.local.settings={translationProvider:'gemini',translationInterval:500};data.local.keys={gemini:'fake'};data.session.capture={id:'atomic',tabId:42};
  const oldFetch=globalThis.fetch,send=chrome.tabs.sendMessage,order=[],progress=[];let release;
  globalThis.fetch=async(_url,o)=>{const text=JSON.parse(o.body).contents[0].parts[0].text;order.push(text);if(text==='original')await new Promise(r=>release=r);return {ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:`translated ${text}`}]}}]})};};
  chrome.tabs.sendMessage=async(tab,m,frame)=>{progress.push({tab,m,frame});};
  try{
    const comment=message({type:'TRANSLATE_COMMENT',id:'atomic-comment',request:{text:'original',source:'en',target:'ja',backOnly:false}});
    for(let i=0;i<50;i++)await Promise.resolve();assert.equal(typeof release,'function');
    const caption=message({type:'CAPTION_TRANSLATE',id:'atomic',requestId:'waiting',request:{text:'caption'}},audio);
    release();const result=await comment;assert.equal(result.ok,true);assert.equal(result.back,'translated translated original');assert.equal((await caption).ok,true);
    assert.deepEqual(order,['original','translated original','caption']);
    assert.deepEqual(progress[0],{tab:42,m:{type:'COMPOSER_PROGRESS',id:'atomic-comment',mtl:'translated original'},frame:{frameId:2}});
    const edited=await message({type:'TRANSLATE_COMMENT',id:'edited',request:{text:'original',mtl:'edited MTL',source:'en',target:'ja',backOnly:true}});
    assert.equal(edited.ok,true);assert.equal(edited.mtl,'edited MTL');assert.equal(order.at(-1),'edited MTL');assert.equal(order.length,4);
  }finally{globalThis.fetch=oldFetch;chrome.tabs.sendMessage=send;delete data.session.capture;data.local.settings={};}
});

test('cancelling between comment stages releases the lane for a complete retry',async()=>{
  data.local.settings={translationProvider:'deepseek',translationInterval:500};data.local.keys={deepseek:'fake'};
  const oldFetch=globalThis.fetch,send=chrome.tabs.sendMessage,order=[];let reached;const progress=new Promise(r=>reached=r);
  globalThis.fetch=async(_url,o)=>{const text=JSON.parse(o.body).messages.at(-1).content;order.push(text);return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:'result'}}]})};};
  chrome.tabs.sendMessage=async(_tab,m)=>{if(m.type==='COMPOSER_PROGRESS')reached();};
  try{
    const request={text:'cancel me',source:'ja',target:'en',backOnly:false};
    const first=message({type:'TRANSLATE_COMMENT',id:'cancel-batch',request});await progress;
    await message({type:'CANCEL',id:'cancel-batch'});assert.equal((await first).ok,false);assert.equal(order.length,1);
    assert.equal((await message({type:'TRANSLATE_COMMENT',id:'retry-batch',request:{...request,text:'retry me'}})).ok,true);
    assert.deepEqual(order,['cancel me','retry me','result']);
    for(const sender of [options,audio,{...content,url:'https://example.com/'}])assert.equal((await message({type:'TRANSLATE_COMMENT',id:'bad',request},sender)).ok,false);
  }finally{globalThis.fetch=oldFetch;chrome.tabs.sendMessage=send;data.local.settings={};}
});


test('delayed or failed progress delivery never blocks paced back-translation', {timeout:5000}, async()=>{
  data.local.settings={translationProvider:'gemini',translationInterval:500};data.local.keys={gemini:'fake'};
  const oldFetch=globalThis.fetch,send=chrome.tabs.sendMessage,starts=[];let failProgress=false;
  globalThis.fetch=async()=>{starts.push(Date.now());return {ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:'translated'}]}}]})};};
  chrome.tabs.sendMessage=()=>{if(failProgress)throw new Error('Frame unavailable');return new Promise(()=>{});};
  try{
    const request={text:'example',source:'en',target:'ja',backOnly:false};
    const result=await message({type:'TRANSLATE_COMMENT',id:'slow-frame',request});
    assert.equal(result.ok,true);assert.equal(result.back,'translated');assert.equal(starts.length,2);assert.ok(starts[1]-starts[0]>=480);
    failProgress=true;
    const edited=await message({type:'TRANSLATE_COMMENT',id:'missing-frame',request:{...request,backOnly:true,mtl:'edited'}});
    assert.equal(edited.ok,true);assert.equal(starts.length,3);
  }finally{globalThis.fetch=oldFetch;chrome.tabs.sendMessage=send;data.local.settings={};}
});

test('playback reset only stops capture for the originating top-level watch tab',async()=>{
 data.session.capture={id:'archive',tabId:42};
 await message({type:'PLAYBACK_RESET'},content);assert.equal(data.session.capture.id,'archive');
 await message({type:'PLAYBACK_RESET'},{...content,frameId:0,url:'https://www.youtube.com/watch?v=archive',tab:{id:99}});assert.equal(data.session.capture.id,'archive');
 await message({type:'PLAYBACK_RESET'},{...content,frameId:0,url:'https://www.youtube.com/watch?v=archive'});assert.equal(data.session.capture,undefined);
});

test('replay frames can adjust caption controls but cannot translate comments or access keys',async()=>{
 const replay={...content,url:'https://www.youtube.com/live_chat_replay?v=test'};
 assert.equal((await message({type:'PANEL_STATUS'},replay)).ok,true);
 assert.equal((await message({type:'PANEL_TIMING',timings:{captionDuration:10}},replay)).ok,true);
 assert.equal((await message({type:'PANEL_THEME',panelTheme:'light'},replay)).ok,true);
 assert.equal((await message({type:'TRANSLATE_COMMENT',id:'replay',request:{}},replay)).ok,false);
 assert.equal((await message({type:'PRIVATE_CONFIG'},replay)).ok,false);
 data.session.capture={id:'replay',tabId:42};assert.equal((await message({type:'PANEL_STOP'},replay)).ok,true);assert.equal(data.session.capture,undefined);
});
