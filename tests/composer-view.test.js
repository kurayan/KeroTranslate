import test from 'node:test';import assert from 'node:assert/strict';
import {mountComposer} from '../extension/ui/composer-view.js';
import {DEFAULTS} from '../extension/core/settings.js';
test('theme changes preserve drafts, active translation and capture; failed saves roll back',async t=>{
  const node=()=>({style:{},dataset:{},value:'',textContent:'',classList:{add(){},remove(){},toggle(){}},addEventListener(){},prepend(){},setAttribute(k,v){this[k]=v;}});
  const nodes=new Map(),query=k=>{if(!nodes.has(k))nodes.set(k,node());return nodes.get(k);};
  globalThis.document={createElement:()=>({...node(),querySelector:query})};t.after(()=>delete globalThis.document);
  let result={ok:true,panelTheme:'light'};const calls=[];
  const view=mountComposer({attachShadow:()=>({querySelector:query}),remove(){}},{settings:DEFAULTS,translateBatch:()=>new Promise(()=>{}),insert:async()=>({}),themeAction:async theme=>{calls.push(theme);return result;}});
  view.state.state.original='keep my words';view.state.run();const controller=view.state.controller,revision=view.state.revision;
  assert.equal(query('.panel').dataset.theme,'dark');query('.theme').value='light';await query('.theme').onchange();
  assert.deepEqual(calls,['light']);assert.equal(query('.panel').dataset.theme,'light');assert.equal(view.state.state.original,'keep my words');assert.equal(view.state.revision,revision);assert.equal(controller.signal.aborted,false);
  result={ok:false,error:'Save failed'};query('.theme').value='dark';await query('.theme').onchange();assert.equal(query('.theme').value,'light');assert.equal(query('.panel').dataset.theme,'light');assert.equal(query('.theme').disabled,false);
  view.refreshTheme('dark');assert.equal(query('.panel').dataset.theme,'dark');assert.equal(view.state.revision,revision);view.dispose();
});
test('main panel starts and stops captions, reflects broadcast status and displays capture errors',async t=>{
  const node=()=>({style:{},dataset:{},value:'',textContent:'',classList:{add(){},remove(){},toggle(){}},addEventListener(){},prepend(){},setAttribute(key,value){this[key]=value;}});
  const rootNodes=new Map(),controlNodes=new Map();
  const query=(map,key)=>{if(!map.has(key))map.set(key,node());return map.get(key);};
  const controls={...node(),querySelector:key=>query(controlNodes,key)};
  globalThis.document={createElement:()=>controls};t.after(()=>{delete globalThis.document;});
  const root={querySelector:key=>query(rootNodes,key)},host={attachShadow:()=>root,remove(){}};
  const actions=[];let response={ok:true,status:'LISTENING'};
  const view=mountComposer(host,{settings:DEFAULTS,translate:async()=>'',insert:async()=>({}),captureAction:async action=>{actions.push(action);return response;}});
  assert.equal(controlNodes.get('.capture-stop').disabled,true);
  await controlNodes.get('.capture-start').onclick();assert.deepEqual(actions,['start']);assert.equal(controlNodes.get('.capture-start').disabled,true);assert.equal(controlNodes.get('.capture-state').textContent,'LISTENING');
  response={ok:true,status:'STOPPED'};await controlNodes.get('.capture-stop').onclick();assert.deepEqual(actions,['start','stop']);assert.equal(controlNodes.get('.capture-start').disabled,false);
  response={ok:false,error:'Open the toolbar icon once.'};await controlNodes.get('.capture-start').onclick();assert.match(controlNodes.get('.capture-message').textContent,/toolbar/);assert.equal(controlNodes.get('.capture-start').disabled,false);
  view.captureStatus({status:'NO_SPEECH'});assert.equal(controlNodes.get('.capture-state').textContent,'NO_SPEECH');view.dispose();
});

test('quick timing controls save one field, keep drafts and recover from failed saves',async t=>{
  const node=()=>({style:{},dataset:{},value:'',textContent:'',classList:{add(){},remove(){},toggle(){}},addEventListener(){},prepend(){},setAttribute(key,value){this[key]=value;}});
  const rootNodes=new Map(),controlNodes=new Map();
  const query=(map,key)=>{if(!map.has(key))map.set(key,node());return map.get(key);};
  const controls={...node(),querySelector:key=>query(controlNodes,key)};
  t.mock.method(globalThis,'setTimeout',()=>0);t.mock.method(globalThis,'clearTimeout',()=>{});
  globalThis.document={createElement:()=>controls};t.after(()=>{delete globalThis.document;});
  const root={querySelector:key=>query(rootNodes,key)},host={attachShadow:()=>root,remove(){}};
  const patches=[];let finish;
  const view=mountComposer(host,{settings:DEFAULTS,translate:async()=>'',insert:async()=>({}),captureAction:async()=>({ok:true}),timingAction:patch=>{patches.push(patch);return new Promise(resolve=>finish=resolve);}});
  const gap=controlNodes.get('.request-gap'),hold=controlNodes.get('.caption-hold');
  assert.equal(gap.value,'1000');assert.equal(hold.value,'5');assert.equal(rootNodes.get('.direction').value,'en');
  view.state.state={...view.state.state,original:'my draft',mtl:'edited translation',back:'checked',phase:'READY',source:'ja',target:'en'};
  const revision=view.state.revision,snapshot={...view.state.state};
  gap.value='4000';const saving=gap.onchange();assert.equal(gap.disabled,true);assert.equal(hold.disabled,true);
  assert.deepEqual(patches,[{translationInterval:4000}]);
  finish({ok:true,timings:{translationInterval:4000,captionDuration:5}});await saving;
  assert.equal(gap.disabled,false);assert.deepEqual(view.state.state,snapshot);assert.equal(view.state.revision,revision);
  view.refreshTiming({captionDuration:15});assert.equal(hold.value,'15');assert.deepEqual(view.state.state,snapshot);
  hold.value='20';const failed=hold.onchange();finish({ok:false,error:'Save failed'});await failed;
  assert.equal(hold.value,'15');assert.match(controlNodes.get('.timing-message').textContent,/Save failed/);assert.equal(gap.value,'4000');
  view.refresh({...DEFAULTS,translationInterval:2000,captionDuration:7});assert.equal(gap.value,'2000');assert.equal(hold.value,'7');view.dispose();
});

test('minimizing preserves the live composer and Retry all stays available while processing',async t=>{
  const node=()=>({style:{},dataset:{},value:'',textContent:'',classList:{add(){},remove(){},toggle(){}},addEventListener(){},prepend(){},setAttribute(key,value){this[key]=value;}});
  const nodes=new Map(),query=key=>{if(!nodes.has(key))nodes.set(key,node());return nodes.get(key);};
  globalThis.document={createElement:()=>({...node(),querySelector:query})};t.after(()=>{delete globalThis.document;});
  t.mock.method(globalThis,'setTimeout',()=>0);t.mock.method(globalThis,'clearTimeout',()=>{});
  const calls=[];const view=mountComposer({attachShadow:()=>({querySelector:query}),remove(){}},{settings:DEFAULTS,translateBatch:request=>new Promise(resolve=>calls.push({request,resolve})),insert:async()=>({}),captureAction:async()=>({ok:true})});
  assert.equal(query('.comment-progress').hidden,true);assert.equal(query('.retry').disabled,true);view.state.input('keep this');const first=view.state.run();assert.equal(query('.retry').disabled,false);
  assert.equal(query('.comment-progress').hidden,false);assert.equal(query('.comment-progress')['aria-label'],'Translating comment');calls[0].request.onProgress({mtl:'in progress'});assert.equal(query('.comment-progress')['aria-label'],'Back-translating comment');
  const phase=view.state.state.phase;query('.minimize').onclick();assert.equal(query('.body').hidden,true);assert.equal(query('.comment-progress').hidden,false);assert.equal(query('.foot').hidden,true);assert.equal(query('.minimize')['aria-expanded'],'false');assert.equal(calls[0].request.signal.aborted,false);assert.equal(view.state.state.phase,phase);
  query('.minimize').onclick();assert.equal(query('.body').hidden,false);assert.equal(view.state.state.original,'keep this');
  const retry=query('.retry').onclick();assert.equal(calls[0].request.signal.aborted,true);calls[0].resolve({mtl:'stale',back:'stale'});calls[1].resolve({mtl:'current',back:'checked'});await first;await retry;assert.equal(view.state.state.mtl,'current');assert.equal(query('.comment-progress').hidden,true);view.state.state.phase='ERROR';view.state.emit();assert.equal(query('.comment-progress').hidden,true);view.connectionLost('Reload this YouTube page');assert.equal(view.state.state.original,'keep this');assert.equal(query('#original').readOnly,true);assert.equal(query('.retry').disabled,true);assert.equal(query('.comment-progress').hidden,true);assert.equal(view.state.disposed,true);view.dispose();
});

test('caption-only panel omits composer and keeps capture, timing, theme and minimize controls',async t=>{
 const node=()=>({style:{},dataset:{},value:'',textContent:'',remove(){this.removed=true;},prepend(){},setAttribute(k,v){this[k]=v;}});
 const nodes=new Map(),query=k=>{if(!nodes.has(k))nodes.set(k,node());return nodes.get(k);};
 globalThis.document={createElement:()=>({...node(),querySelector:query})};t.after(()=>delete globalThis.document);
 const actions=[];const view=mountComposer({attachShadow:()=>({querySelector:query}),remove(){}},{settings:DEFAULTS,captionsOnly:true,captureAction:async a=>{actions.push(a);return {ok:true,status:a==='start'?'LISTENING':'STOPPED'};},timingAction:async timings=>({ok:true,timings}),themeAction:async panelTheme=>({ok:true,panelTheme})});
 assert.equal(view.state,undefined);assert.doesNotMatch(query('.body').innerHTML,/textarea|INSERT|re-MTL/);assert.equal(query('.progress-track').removed,true);
 await query('.capture-start').onclick();assert.equal(query('.capture-state').textContent,'LISTENING');
 await query('.capture-stop').onclick();assert.deepEqual(actions,['start','stop']);
 query('.request-gap').value='2000';await query('.request-gap').onchange();assert.equal(query('.request-gap').value,'2000');
 query('.theme').value='light';await query('.theme').onchange();assert.equal(query('.panel').dataset.theme,'light');
 query('.minimize').onclick();assert.equal(query('.body').hidden,true);query('.minimize').onclick();assert.equal(query('.body').hidden,false);
 view.connectionLost('Reload');assert.equal(query('.capture-start').disabled,true);view.dispose();
});
