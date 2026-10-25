import test from 'node:test';import assert from 'node:assert/strict';
import {insertDraft,chatInput,watchPlayer} from '../extension/youtube.js';
function fixture(text='',html=text){let inserted=0;const input={innerHTML:html,textContent:text,getClientRects:()=>[{}],getAttribute:name=>name==='contenteditable'?'true':null,querySelector:()=>html.includes('<img')?{}:null,focus(){},dispatchEvent(){}};const doc={location:{pathname:'/live_chat'},querySelectorAll:()=>[input],getSelection:()=>({removeAllRanges(){},addRange(){}}),createRange:()=>({selectNodeContents(){}}),execCommand(command,_unused,value){assert.equal(command,'insertText');inserted++;input.textContent=value;return true;}};return {input,doc,count:()=>inserted};}
globalThis.InputEvent=class{constructor(type,options){assert.equal(type,'input');assert.equal(options.inputType,'insertText');}};
test('empty draft receives text, without sending',()=>{const f=fixture();assert.match(insertDraft('hello',{},f.doc).message,/Inserted/);assert.equal(f.count(),1);assert.equal(f.input.textContent,'hello');});
test('existing draft needs replacement decision',()=>{const f=fixture('draft');const r=insertDraft('hello',{},f.doc);assert.equal(r.conflict,true);assert.equal(f.count(),0);insertDraft('hello',{replace:true,expected:r.expected},f.doc);assert.equal(f.count(),1);});
test('draft changed while replacement prompt open needs a new decision',()=>{const f=fixture('draft');const r=insertDraft('hello',{},f.doc);f.input.innerHTML='changed';assert.equal(insertDraft('hello',{replace:true,expected:r.expected},f.doc).conflict,true);assert.equal(f.count(),0);});
test('emote-only draft is preserved',()=>{const f=fixture('','<img alt="emote">');assert.equal(insertDraft('hello',{},f.doc).conflict,true);assert.equal(f.count(),0);});
test('repeat insertion does not duplicate text',()=>{const f=fixture('hello');assert.match(insertDraft('hello',{},f.doc).message,/already/);assert.equal(f.count(),0);});
test('unsupported route or ambiguous inputs fail closed',()=>{const f=fixture();f.doc.location.pathname='/live_chat_replay';assert.equal(chatInput(f.doc),null);assert.throws(()=>insertDraft('hello',{},f.doc),/unavailable/);f.doc.location.pathname='/live_chat';f.doc.querySelectorAll=()=>[f.input,f.input];assert.equal(chatInput(f.doc),null);});
test('too-long text never changes native input',()=>{const f=fixture();assert.throws(()=>insertDraft('a'.repeat(201),{},f.doc),/200/);assert.equal(f.count(),0);});
test('YouTube empty contenteditable attribute accepts insertion',()=>{const f=fixture();f.input.getAttribute=name=>name==='contenteditable'?'':null;f.doc.querySelectorAll=selector=>{assert.equal(selector,'yt-live-chat-message-input-renderer #input[contenteditable]');return [f.input];};assert.match(insertDraft('hello',{},f.doc).message,/Inserted/);});
test('disabled, hidden and explicitly noneditable chat fields are rejected',()=>{for(const editable of ['false',null]){const f=fixture();f.input.getAttribute=()=>editable;assert.equal(chatInput(f.doc),null);}const f=fixture();f.input.getClientRects=()=>[];assert.equal(chatInput(f.doc),null);f.input.getClientRects=()=>[{}];f.input.getAttribute=name=>name==='aria-disabled'?'true':'true';assert.equal(chatInput(f.doc),null);});

test('captions accept finite-duration archives without live badges, but reject missing media and other pages',()=>{
 const video={duration:3600},player={querySelector:s=>s==='video'?video:null};
 const doc={location:{pathname:'/watch'},querySelector:()=>player};
 assert.equal(watchPlayer(doc),player);
 video.duration=Infinity;assert.equal(watchPlayer(doc),player);
 for(const duration of [NaN,0,-1]){video.duration=duration;assert.equal(watchPlayer(doc),null);}
 video.duration=3600;doc.location.pathname='/shorts/example';assert.equal(watchPlayer(doc),null);
 doc.location.pathname='/live_chat_replay';assert.equal(watchPlayer(doc),null);
 doc.location.pathname='/watch';doc.querySelector=()=>null;assert.equal(watchPlayer(doc),null);
});
