// The only module that knows YouTube's private DOM. Fail closed if it changes.
export function chatInput(doc=document){
  if(!/^\/live_chat\/?$/.test(doc.location.pathname))return null;
  const nodes=[...doc.querySelectorAll('yt-live-chat-message-input-renderer #input[contenteditable]')].filter(n=>['','true','plaintext-only'].includes(n.getAttribute('contenteditable'))&&n.getClientRects().length&&n.getAttribute('aria-disabled')!=='true');
  return nodes.length===1?nodes[0]:null;
}
export function insertDraft(text,{replace=false,expected}={},doc=document){
  const input=chatInput(doc);
  if(!input)throw new Error('YouTube chat input unavailable. Sign in and open live chat.');
  if(!text.trim()||text.length>200)throw new Error('Keep the inserted comment to 200 characters or fewer.');
  const current=input.innerHTML;
  if(input.textContent===text)return {message:'This text is already in the input. Nothing was added.'};
  const hasDraft=!!input.textContent.trim()||!!input.querySelector('img,yt-formatted-string');
  if(hasDraft&&(!replace||expected!==current))return {conflict:true,expected:current};
  input.focus();
  const selection=doc.getSelection(),range=doc.createRange();range.selectNodeContents(input);selection.removeAllRanges();selection.addRange(range);
  // Insert text only. Never click send, submit a form, or dispatch an Enter key.
  if(!doc.execCommand('insertText',false,text))throw new Error('YouTube did not accept insertion. Your draft has been left in place.');
  input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));
  if(input.textContent!==text)throw new Error('Check the YouTube input: insertion could not be verified.');
  return {message:'Inserted. Review and send in YouTube.'};
}
export function watchPlayer(doc=document){
  if(doc.location.pathname!=='/watch')return null;
  const player=doc.querySelector('#movie_player'),video=player?.querySelector('video');
  const badge=player?.querySelector('.ytp-live-badge');
  return player&&video&&(video.duration===Infinity||badge?.getClientRects().length||(Number.isFinite(video.duration)&&video.duration>0))?player:null;
}
