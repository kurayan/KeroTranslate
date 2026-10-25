import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../extension/content.js',import.meta.url),'utf8')).replace(/import\(chrome.runtime.getURL\('([^']+)'\)\)/g,(_,path)=>`Promise.resolve(modules['${path}'])`);
async function harness({path='/watch',config,failView=false,failures=0}={}){
  const videoEvents=new Map();const video={addEventListener:(name,fn)=>videoEvents.set(name,fn),removeEventListener:name=>videoEvents.delete(name)};
  let listener,attempts=0;const sent=[],shown=[],children=[],configured=[];
  const player={querySelector:()=>video,append(host){children.push(host);host.isConnected=true;host.parentElement=player;}};
  const location={pathname:path,href:`https://www.youtube.com${path}?v=test`};
  const context={Promise,location,DOMException,setTimeout:fn=>{fn();return 0;},clearTimeout(){},window:{addEventListener(){}},document:{documentElement:{},addEventListener(){},createElement(){return {style:{},remove(){this.isConnected=false;const i=children.indexOf(this);if(i>=0)children.splice(i,1);}};}},MutationObserver:class{observe(){}disconnect(){}},chrome:{runtime:{getURL:p=>p,onMessage:{addListener(fn){listener=fn;}},async sendMessage(m){sent.push(m);return m.type==='CONFIG'?(config?await config():{ok:true,settings:{}}):{ok:true};}}},modules:{'ui/composer-view.js':{},'youtube.js':{watchPlayer:()=>location.pathname==='/watch'?player:null},'ui/captions.js':{mountCaptions(host){attempts++;if((failView&&attempts===1)||attempts<=failures)throw new Error('view failed');return {configure:value=>configured.push(value),show:cue=>shown.push(cue),clear(){},dispose(){host.remove();}};}}}};
  context.window.top=context.window;await vm.runInNewContext(source,context);
  return {videoEvents,sent,shown,children,configured,location,notify:m=>listener(m,{},()=>{}),message:m=>new Promise(resolve=>listener(m,{},resolve))};
}
test('rejected config leaves no orphan and a later request recovers',async()=>{
  let n=0;const h=await harness({config:()=>++n===1?{ok:false}:{ok:true,settings:{}}});
  assert.equal(h.children.length,0);assert.equal((await h.message({type:'CHECK_LIVE'})).overlayReady,true);assert.equal(h.children.length,1);
});
test('failed caption view is retried; test overlay uses no audio API',async()=>{
  const h=await harness({failView:true});assert.equal(h.children.length,0);
  assert.equal((await h.message({type:'TEST_OVERLAY'})).ok,true);assert.equal(h.children.length,1);assert.equal(h.shown.length,1);assert.ok(h.sent.every(m=>m.type==='CONFIG'));
});
test('home page defers config and supports navigation to a live page',async()=>{
  const h=await harness({path:'/'});assert.equal(h.sent.length,0);
  h.location.pathname='/watch';h.location.href='https://www.youtube.com/watch?v=test';
  assert.equal((await h.message({type:'CHECK_LIVE'})).overlayReady,true);
});
test('one start request retries a transient overlay failure without a page reload',async()=>{
  const h=await harness({failures:2});assert.equal(h.children.length,0);assert.equal((await h.message({type:'CHECK_LIVE'})).overlayReady,true);assert.equal(h.children.length,1);
});
test('persistent overlay failures return after a bounded retry window',async()=>{
  const h=await harness({failures:99});const r=await h.message({type:'CHECK_LIVE'});assert.equal(r.ok,false);assert.match(r.error,/toolbar popup/);assert.equal(h.children.length,0);
});
test('a detached overlay is remounted even if its parent identity is unchanged',async()=>{
  const h=await harness();const old=h.children[0];old.isConnected=false;assert.equal((await h.message({type:'CHECK_LIVE'})).overlayReady,true);assert.equal(h.children.length,1);assert.notEqual(h.children[0],old);
});

test('timing broadcasts update the existing overlay without rebuilding or clearing it',async()=>{
  const h=await harness({config:()=>({ok:true,settings:{captionPosition:'TR',captionMode:'both',translationInterval:1000,captionDuration:5}})});
  const host=h.children[0];await h.message({type:'TEST_OVERLAY'});const shown=h.shown.length;
  h.notify({type:'TIMING_CHANGED',timings:{translationInterval:2000,captionDuration:15}});
  assert.equal(h.children[0],host);assert.equal(h.shown.length,shown);
  assert.equal(h.configured.at(-1).captionDuration,15);assert.equal(h.configured.at(-1).captionPosition,'TR');
});


async function composerHarness(path='/live_chat'){
  let listener,options,id=0,transportError=null,disconnected=0;const lost=[];const sent=[],timers=new Map(),replies=new Map();
  const context={Promise,Map,DOMException,crypto:{randomUUID:()=>String(++id)},location:{pathname:path,href:`https://www.youtube.com${path}?v=test`},setTimeout(fn,ms){timers.set(ms,fn);return ms;},clearTimeout(ms){timers.delete(ms);},window:{addEventListener(){}},document:{documentElement:{},addEventListener(){},querySelector:()=>({before(){},append(){}}),createElement:()=>({style:{},remove(){}})},MutationObserver:class{observe(){}disconnect(){disconnected++;}},chrome:{runtime:{getURL:p=>p,onMessage:{addListener(fn){listener=fn;}},sendMessage(m){sent.push(m);if(transportError)throw transportError;if(m.type==='TRANSLATE_COMMENT')return new Promise(r=>replies.set(m.id,r));return Promise.resolve(m.type==='CONFIG'?{ok:true,settings:{}}:{ok:true});}}},modules:{'ui/composer-view.js':{mountComposer(_host,o){options=o;return {captureStatus(){},connectionLost:message=>lost.push(message)};}},'ui/captions.js':{},'youtube.js':{}}};
  await vm.runInNewContext(source,context);return {options,sent,timers,replies,lost,get disconnected(){return disconnected;},failTransport:error=>{transportError=error;},notify:m=>listener(m,{},()=>{})};
}
test('content routes matching batch progress and drops cancelled/finished progress',async()=>{
  const h=await composerHarness(),updates=[],controller=new AbortController();
  const first=h.options.translateBatch({text:'first',source:'en',target:'ja',backOnly:false,signal:controller.signal,onProgress:v=>updates.push(v.mtl)});
  h.notify({type:'COMPOSER_PROGRESS',id:'unknown',mtl:'ignore'});h.notify({type:'COMPOSER_PROGRESS',id:'1',mtl:'partial result'});assert.deepEqual(updates,['partial result']);
  controller.abort();await assert.rejects(first,{name:'AbortError'});assert.ok(h.sent.some(m=>m.type==='CANCEL'&&m.id==='1'));assert.equal(h.timers.size,0);
  h.notify({type:'COMPOSER_PROGRESS',id:'1',mtl:'late'});assert.equal(updates.length,1);
  const second=h.options.translateBatch({text:'second',source:'en',target:'ja',backOnly:false,signal:new AbortController().signal,onProgress:v=>updates.push(v.mtl)});
  h.replies.get('2')({ok:true,mtl:'current',back:'checked'});const result=await second;assert.equal(result.back,'checked');assert.equal(h.timers.size,0);h.notify({type:'COMPOSER_PROGRESS',id:'2',mtl:'late completed progress'});assert.deepEqual(updates,['partial result']);
});
test('content times out an unresponsive comment batch and permits a fresh request',async()=>{
  const h=await composerHarness(),args={text:'first',source:'en',target:'ja',backOnly:false,signal:new AbortController().signal,onProgress(){}};
  const stalled=h.options.translateBatch(args);h.timers.get(120000)();await assert.rejects(stalled,/Retry all/);assert.ok(h.sent.some(m=>m.type==='CANCEL'&&m.id==='1'));
  const next=h.options.translateBatch(args);h.replies.get('2')({ok:true,mtl:'ok',back:'ok'});assert.equal((await next).mtl,'ok');
});


test('invalidated Chrome context rejects safely, stops observation and never sends again',async()=>{
  const h=await composerHarness();h.failTransport(new Error('Extension context invalidated.'));
  const args={text:'keep draft',source:'en',target:'ja',backOnly:false,signal:new AbortController().signal,onProgress(){}};
  await assert.rejects(h.options.translateBatch(args),/Reload this YouTube page/);
  assert.equal(h.lost.length,1);assert.equal(h.disconnected,1);assert.equal(h.timers.size,0);
  const sent=h.sent.length;await assert.rejects(h.options.translateBatch(args),/Reload this YouTube page/);assert.equal(h.sent.length,sent);assert.equal(h.lost.length,1);
});
test('synchronous CANCEL failure cannot escape the abort listener or leave the batch pending',async()=>{
  const h=await composerHarness(),controller=new AbortController();
  const pending=h.options.translateBatch({text:'keep draft',source:'en',target:'ja',backOnly:false,signal:controller.signal,onProgress(){}});
  h.failTransport(new Error('Extension context invalidated.'));controller.abort();
  await assert.rejects(pending,{name:'AbortError'});assert.equal(h.lost.length,1);assert.equal(h.timers.size,0);
});

test('seeking stops caption processing and suppresses old cues until restart',async()=>{
 const h=await harness();h.videoEvents.get('seeking')();
 assert.ok(h.sent.some(m=>m.type==='PLAYBACK_RESET'));
 h.notify({type:'CAPTION',cue:{original:'old'}});await Promise.resolve();assert.equal(h.shown.length,0);
 h.notify({type:'CAPTURE_STATUS',status:'STARTING'});
 h.notify({type:'CAPTION',cue:{original:'new'}});await new Promise(resolve=>setImmediate(resolve));assert.equal(h.shown.at(-1).original,'new');
 h.videoEvents.get('ended')();assert.equal(h.sent.filter(m=>m.type==='PLAYBACK_RESET').length,2);
});

test('chat replay mounts caption controls with no comment or insertion callbacks',async()=>{
 const h=await composerHarness('/live_chat_replay');
 assert.equal(h.options.captionsOnly,true);assert.equal(h.options.translateBatch,undefined);assert.equal(h.options.insert,undefined);
 await h.options.captureAction('start');await h.options.captureAction('stop');await h.options.timingAction({captionDuration:10});
 assert.ok(h.sent.some(m=>m.type==='PANEL_START'));assert.ok(h.sent.some(m=>m.type==='PANEL_STOP'));assert.ok(h.sent.some(m=>m.type==='PANEL_TIMING'));
});
