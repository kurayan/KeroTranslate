const fields=['panelTheme','sttProvider','translationProvider','model','openaiModel','deepseekModel','deeplPlan','translationInterval','source','speechLanguage','captionTarget','captionMode','captionLines','captionPosition','captionSize','captionDuration'];
const keyNames=['gemini','deepgram','openai','deepl','deepseek'];
const q=id=>document.getElementById(id);
const result=await chrome.runtime.sendMessage({type:'PRIVATE_CONFIG'});
if(result.ok){for(const f of fields)q(f).value=result.settings[f];for(const name of keyNames)q(name).value=result.keys[name]||'';}
function providerFields(){for(const group of document.querySelectorAll('[data-provider]')){const selected=group.dataset.provider===q('translationProvider').value||(group.dataset.stt==='true'&&group.dataset.provider===q('sttProvider').value);group.hidden=!selected;for(const input of group.querySelectorAll('input,select'))input.disabled=!selected;}}
q('sttProvider').onchange=q('translationProvider').onchange=providerFields;providerFields();
const positions=document.createElement('div');positions.className='positions';q('captionPosition').after(positions);q('captionPosition').hidden=true;
const labels=['Top left','Top center','Top right','Middle left','Middle center','Middle right','Bottom left','Bottom center','Bottom right'];
[...q('captionPosition').options].forEach((o,i)=>{const b=document.createElement('button');b.type='button';b.textContent=['↖','↑','↗','←','·','→','↙','↓','↘'][i];b.setAttribute('aria-label',labels[i]);b.setAttribute('aria-pressed',String(q('captionPosition').value===o.value));b.onclick=()=>{q('captionPosition').value=o.value;for(const item of positions.children)item.setAttribute('aria-pressed',String(item===b));};positions.append(b);});
q('settings').onsubmit=async e=>{
  e.preventDefault();const settings=Object.fromEntries(fields.map(f=>[f,q(f).value]));
  const r=await chrome.runtime.sendMessage({type:'SAVE_SETTINGS',settings,keys:Object.fromEntries(keyNames.map(name=>[name,q(name).value.trim()]))});
  q('message').textContent=r.ok?'Settings and API keys saved on this device. Open the KeroTranslate toolbar popup on a YouTube Live tab and press Start captions.':r.error;
};
q('clear').onclick=async()=>{const r=await chrome.runtime.sendMessage({type:'CLEAR_KEYS'});if(r.ok){for(const name of keyNames)q(name).value='';q('message').textContent='All API keys deleted. Capture and pending requests stopped.';}else q('message').textContent=r.error;};

// Reflect quick timing changes from the main panel without overwriting other edits.
chrome.storage.onChanged.addListener((changes,area)=>{
  if(area!=='local'||!changes.settings?.newValue)return;
  const {oldValue={},newValue}=changes.settings;
  for(const field of ['translationInterval','captionDuration','panelTheme'])if(newValue[field]!==oldValue[field])q(field).value=newValue[field];
});
