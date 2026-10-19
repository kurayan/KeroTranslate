import test from 'node:test';import assert from 'node:assert/strict';
let listener;const sent=[];const worker={id:'test'};
// Test doubles are confined to tests; the shipped extension has no fake provider.
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{async getUserMedia(){return {getTracks:()=>[{stop(){}}]};}}}});
globalThis.AudioContext=class {state='running';destination={};createMediaStreamSource(){return {connect(){}};}async resume(){}async close(){}};
globalThis.MediaRecorder=class {state='inactive';start(){this.state='recording';}stop(){this.state='inactive';}};
globalThis.WebSocket=class {readyState=1;bufferedAmount=0;constructor(){queueMicrotask(()=>{this.onopen?.();this.onmessage?.({data:JSON.stringify({type:'Results',start:0,is_final:true,channel:{alternatives:[{transcript:'test speech'}]}})});});}send(){}close(){}};
globalThis.chrome={runtime:{id:'test',getURL:p=>`chrome-extension://test/${p}`,onMessage:{addListener(f){listener=f;}},async sendMessage(m){sent.push(m);if(m.type==='PRIVATE_CONFIG')return {ok:true,keys:{deepgram:'fake'}};if(m.type==='CAPTION_TRANSLATE'){await new Promise(r=>setTimeout(r,350));return {ok:true,text:'translated'};}return {ok:true};}}};
await import('../extension/offscreen.js');
const turn=()=>new Promise(r=>setTimeout(r,0));
const config={sttProvider:'deepgram',translationProvider:'gemini',captionTarget:'en',captionMode:'both'};
const message=(m,sender=worker)=>{let reply;listener({target:'offscreen',...m},sender,r=>reply=r);return reply;};
test('mocked audio session stops without allowing its pending translation to publish',async()=>{
  assert.equal(message({type:'START',id:'test-session',streamId:'fake',settings:config}).ok,true);await turn();assert.ok(sent.some(m=>m.type==='AUDIO_CUE'));
  message({type:'STOP'});const count=sent.length;await new Promise(r=>setTimeout(r,400));assert.equal(sent.length,count);
});
test('late getUserMedia resolution after Stop immediately stops every track',async()=>{
  let resolveMedia;let stopped=0;
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:()=>new Promise(r=>resolveMedia=r)}}});
  message({type:'START',id:'late-media',streamId:'fake',settings:{...config,sttProvider:'deepgram'}});await turn();message({type:'STOP'});
  resolveMedia({getTracks:()=>[{stop(){stopped++;}},{stop(){stopped++;}}]});await turn();assert.equal(stopped,2);
});
test('content frames and other extension pages cannot start offscreen capture',()=>{
  assert.equal(message({type:'START',id:'bad',settings:config},{id:'test',tab:{id:1}}),undefined);
  assert.equal(message({type:'START',id:'bad',settings:config},{id:'test',url:'chrome-extension://test/options.html'}),undefined);
});


test('caption failures shed new work during cooldown then recover with new speech',async()=>{
  const originalNow=Date.now,originalSocket=globalThis.WebSocket,send=chrome.runtime.sendMessage;let now=100000,socket,requests=0;
  Date.now=()=>now;
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{async getUserMedia(){return {getTracks:()=>[{stop(){}}]};}}}});
  globalThis.WebSocket=class{readyState=1;bufferedAmount=0;constructor(){socket=this;queueMicrotask(()=>this.onopen?.());}send(){}close(){}};
  chrome.runtime.sendMessage=async m=>{sent.push(m);if(m.type==='PRIVATE_CONFIG')return {ok:true,keys:{deepgram:'fake'}};if(m.type==='CAPTION_TRANSLATE'){requests++;if(requests===1)return {ok:false,code:'RATE_OR_QUOTA',retryAfterMs:3000,error:'limited'};if(requests===3)return {ok:false,code:'NETWORK',error:'temporary failure'};return {ok:true,text:'recovered'};}return {ok:true};};
  const speech=async id=>{socket.onmessage({data:JSON.stringify({type:'Results',start:id,is_final:true,channel:{alternatives:[{transcript:`speech ${id}`}]}})});await turn();};
  try{
    message({type:'START',id:'recovery',streamId:'fake',settings:config});await turn();
    await speech(1);assert.equal(requests,1);await speech(2);assert.equal(requests,1);assert.ok(sent.some(m=>m.type==='AUDIO_CUE'&&m.cue.id==='2'&&m.cue.phase==='error'&&!m.cue.pendingNext));
    now+=3000;await speech(3);assert.equal(requests,2);assert.ok(sent.some(m=>m.type==='AUDIO_CUE'&&m.cue.id==='3'&&m.cue.translation==='recovered'));
    await speech(4);assert.equal(requests,3);await speech(5);assert.equal(requests,3);
    now+=1000;await speech(6);assert.equal(requests,4);assert.ok(sent.some(m=>m.type==='AUDIO_CUE'&&m.cue.id==='6'&&m.cue.translation==='recovered'));
    message({type:'STOP'});await speech(7);assert.equal(requests,4);
  }finally{message({type:'STOP'});Date.now=originalNow;globalThis.WebSocket=originalSocket;chrome.runtime.sendMessage=send;}
});

test('transcription-only captions publish partial and final speech without translation requests',async()=>{
  const originalSocket=globalThis.WebSocket;let socket;
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{async getUserMedia(){return {getTracks:()=>[{stop(){}}]};}}}});
  globalThis.WebSocket=class{readyState=1;bufferedAmount=0;constructor(){socket=this;queueMicrotask(()=>this.onopen?.());}send(){}close(){}};
  const start=sent.length;
  try{
    message({type:'START',id:'transcription-only',streamId:'fake',settings:{...config,captionMode:'original'}});await turn();
    for(const final of [false,true]){
      socket.onmessage({data:JSON.stringify({type:'Results',start:0,is_final:final,channel:{alternatives:[{transcript:final?'Hello world':'Hello'}]}})});await turn();
    }
    const events=sent.slice(start),cues=events.filter(m=>m.type==='AUDIO_CUE').map(m=>m.cue);
    assert.ok(cues.some(c=>c.phase==='partial'&&c.original==='Hello'));
    assert.ok(cues.some(c=>c.phase==='final'&&c.original==='Hello world'));
    assert.ok(cues.every(c=>c.translation===''&&c.pending===false));
    assert.equal(events.filter(m=>m.type==='CAPTION_TRANSLATE').length,0);
  }finally{message({type:'STOP'});globalThis.WebSocket=originalSocket;}
});
