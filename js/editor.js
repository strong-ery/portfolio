let manifest=[], activeIdx=null, dragSrc=null;
let markup=null;
import('./markup.js').then(m=>{markup=m;if(activeIdx!==null){renderPreview();updateArticle()}});
import('./audio-player.js').then(m=>m.initAudioPlayers());
let _fileHandle=null, _saveTimer=null, _saving=false;

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')}

async function openFile(){
  try{
    const [handle]=await window.showOpenFilePicker({
      types:[{description:'JSON',accept:{'application/json':['.json']}}],
      multiple:false
    });
    _fileHandle=handle;
    const file=await handle.getFile();
    const text=await file.text();
    manifest=JSON.parse(text);
    if(!Array.isArray(manifest))throw new Error('Must be an array');
    setFileStatus(handle.name,'saved');
    startEditor();
  }catch(e){
    if(e.name==='AbortError')return;
    document.getElementById('import-error').textContent='Error: '+e.message;
  }
}

async function scheduleAutoSave() {
  if (!_fileHandle) return;
  setFileStatus(null, 'unsaved');
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(performAutosave, 3000);
}

async function performAutosave() {
  try {
    localStorage.setItem('manifest_backup', JSON.stringify(manifest));
    setFileStatus(null, 'saved');
  } catch (e) {
    console.error("Autosave failed:", e);
  }
}

async function saveFile() {
  if (!_fileHandle || _saving) return;
  _saving = true;
  try {
    const writable = await _fileHandle.createWritable();
    await writable.write(JSON.stringify(manifest, null, 2));
    await writable.close();
    setFileStatus(_fileHandle.name, 'saved');
    showToast('Saved to file');
  } catch (e) {
    console.error('Manual save failed:', e);
  } finally {
    _saving = false;
  }
}

// Copy JSON button: uses live in-memory manifest if available, else falls back to localStorage autosave
function copyAutosaveJSON(){
  let json;
  if(manifest && manifest.length > 0){
    json = JSON.stringify(manifest, null, 2);
  } else {
    const backup = localStorage.getItem('manifest_backup');
    if(!backup){ showToast('No data to copy'); return; }
    json = backup;
  }
  navigator.clipboard.writeText(json).then(()=>{
    showToast('JSON copied!');
  }).catch(()=>{
    showToast('Copy failed');
  });
}

function showToast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),1800);
}

function setFileStatus(name,state){
  const el=document.getElementById('file-status');
  const filename=name||(el.dataset.name||'');
  el.dataset.name=filename||'';
  const dot=state==='saved'?'●':state==='unsaved'?'○':'✕';
  const col=state==='saved'?'var(--dim)':state==='unsaved'?'var(--accent)':'#b44';
  el.innerHTML=`<span style="color:${col};margin-right:4px">${dot}</span>${esc(filename)}`;
}

function showImport(){
  document.getElementById('import-panel').style.display='flex';
  document.getElementById('sidebar').style.display='none';
  document.getElementById('editor-area').style.display='none';
}

function loadEmpty(){manifest=[];_fileHandle=null;document.getElementById('file-status').textContent='';startEditor()}

function startEditor(){
  document.getElementById('import-panel').style.display='none';
  document.getElementById('sidebar').style.display='flex';
  document.getElementById('editor-area').style.display='flex';
  renderSidebar();
  if(manifest.length>0)selectEntry(0);
}

function renderSidebar(){
  const list=document.getElementById('entry-list');
  list.innerHTML='';
  manifest.forEach((p,i)=>{
    const el=document.createElement('div');
    el.className='entry-item'+(i===activeIdx?' active':'')+(!articleStarted(p)?' wip':'');
    el.onclick=()=>selectEntry(i);
    const thumb=p.thumb
      ?`<img class="entry-thumb-s" src="${esc(p.thumb)}" onerror="this.style.display='none'">`
      :`<div class="entry-ph">${esc((p.title||'?').slice(0,3))}</div>`;
    el.innerHTML=`${thumb}<div class="entry-info"><div class="entry-name">${esc(p.title||'(untitled)')}</div><div class="entry-year">${esc(p.year||'')}</div></div>${!articleStarted(p)?'<div class="wip-dot"></div>':''}`;
    list.appendChild(el);
  });
  document.getElementById('entry-count').textContent=manifest.length+' entries';
}

function selectEntry(i){activeIdx=i;renderSidebar();renderForm();renderPreview()}

function addEntry(){
  manifest.push({id:'new-entry',title:'New Entry',date:'',year:'',category:'',tags:[],thumb:'',body:'',links:[]});
  selectEntry(manifest.length-1);
}

function deleteEntry(){
  if(activeIdx===null||!confirm('Delete "'+manifest[activeIdx].title+'"?'))return;
  manifest.splice(activeIdx,1);
  activeIdx=Math.min(activeIdx,manifest.length-1);
  if(manifest.length===0){activeIdx=null;document.getElementById('editor-form').innerHTML='';document.getElementById('preview-col').innerHTML=''}
  renderSidebar();
  if(activeIdx!==null){renderForm();renderPreview()}
}

function renderForm(){
  if(activeIdx===null)return;
  const p=manifest[activeIdx];
  document.getElementById('editor-form').innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
      <span style="font-family:var(--font-display);font-size:0.95rem">${esc(p.title||'(untitled)')}</span>
      <button class="btn danger" style="font-size:10px;padding:3px 8px" onclick="deleteEntry()">Delete</button>
    </div>
    <div class="sec">Identity</div>
    <div class="field"><label class="field-label">ID</label><input id="f-id" value="${esc(p.id||'')}"></div>
    <div class="field"><label class="field-label">Title</label><input id="f-title" value="${esc(p.title||'')}"></div>
    <div class="field-row">
      <div class="field"><label class="field-label">Date</label><input id="f-date" value="${esc(p.date||'')}" placeholder="2025-04-06"></div>
      <div class="field"><label class="field-label">Year (display)</label><input id="f-year" value="${esc(p.year||'')}"></div>
    </div>
    <div class="field"><label class="field-label">Category</label><input id="f-category" value="${esc(p.category||'')}"></div>
    <div class="field"><label class="field-label">Margin note (handwritten on the home page, optional)</label><input id="f-note" value="${esc(p.note||'')}" placeholder="e.g. scope creep sucks lol"></div>
    <div class="sec">Thumbnail</div>
    <div class="field"><label class="field-label">Path</label><input id="f-thumb" value="${esc(p.thumb||'')}" placeholder="resources/project/thumb.jpg"></div>
    <button class="btn" style="font-size:10px;margin-bottom:1rem" onclick="pickThumb()">Browse…</button>
    <div class="sec">Tags</div>
    <div class="tags-wrap" id="tags-wrap"></div>
    <div class="tag-add"><input id="tag-input" placeholder="add tag…" onkeydown="if(event.key==='Enter'){addTag();event.preventDefault()}"><button class="btn" onclick="addTag()">+</button></div>
    <div class="sec">Article</div>
    <button class="btn primary" onclick="openArticle()">Write article…</button>
    <div class="article-meta" id="article-meta">${wordCount(plain(p.body))} words</div>
    ${p.gallery?`<div class="sec">Gallery media</div>
    <div class="media-list" id="media-list"></div>
    <div class="media-add-row">
      <button class="btn" onclick="addMedia('image')">+ Image</button>
      <button class="btn" onclick="addMedia('audio')">+ Audio</button>
      <button class="btn" onclick="addMedia('youtube')">+ YouTube</button>
      <button class="btn" onclick="addMedia('vimeo')">+ Vimeo</button>
      <button class="btn" onclick="addMedia('break')">+ Break</button>
      <button class="btn" onclick="pickMediaBatch()">Browse files…</button>
    </div>`:''}
    <div class="sec">Links</div>
    <div class="links-list" id="links-list"></div>
    <button class="btn" style="font-size:10px;margin-top:5px" onclick="addLink()">+ Add link</button>
  `;
  renderTags();renderMediaList();renderLinks();bindFields();
}

function bindFields(){
  ['id','title','date','year','category','note','thumb'].forEach(k=>{
    const el=document.getElementById('f-'+k);if(!el)return;
    el.addEventListener('input',()=>{
      manifest[activeIdx][k]=el.value;
      if(['title','thumb','desc'].includes(k))renderSidebar();
      renderPreview();
    });
  });
}

function renderTags(){
  const p=manifest[activeIdx],w=document.getElementById('tags-wrap');if(!w)return;
  w.innerHTML=(p.tags||[]).map((t,i)=>`<div class="tag-chip">${esc(t)}<button onclick="removeTag(${i})">×</button></div>`).join('');
}
function addTag(){const inp=document.getElementById('tag-input');const v=inp.value.trim().toLowerCase();if(!v)return;(manifest[activeIdx].tags=manifest[activeIdx].tags||[]).push(v);inp.value='';renderTags();renderPreview()}
function removeTag(i){manifest[activeIdx].tags.splice(i,1);renderTags();renderPreview()}

function renderMediaList(){
  const p=manifest[activeIdx],el=document.getElementById('media-list');if(!el)return;
  el.innerHTML='';
  (p.media||[]).forEach((m,i)=>{
    const item=document.createElement('div');
    item.className='media-item';item.draggable=true;item.dataset.idx=i;
    let body=`<div class="media-type-label">${m.type}</div>`;
    if(m.type==='image'||m.type==='audio'){
      body+=`<div style="display:flex;gap:4px;margin-bottom:3px"><input value="${esc(m.src||'')}" placeholder="path/to/file" oninput="manifest[activeIdx].media[${i}].src=this.value;renderPreview()"><button class="btn" style="font-size:9px;padding:1px 6px" onclick="pickMediaFor(${i})">…</button></div>`;
      body+=`<input value="${esc(m.caption||'')}" placeholder="caption" oninput="manifest[activeIdx].media[${i}].caption=this.value;renderPreview()">`;
    }else if(m.type==='youtube'||m.type==='vimeo'){
      body+=`<input value="${esc(m.id||'')}" placeholder="${m.type==='youtube'?'YouTube video ID':'Vimeo video ID'}" oninput="manifest[activeIdx].media[${i}].id=this.value;renderPreview()" style="margin-bottom:3px">`;
      body+=`<input value="${esc(m.caption||'')}" placeholder="caption" oninput="manifest[activeIdx].media[${i}].caption=this.value;renderPreview()">`;
    }else{body+=`<span style="font-size:10px;color:var(--dim)">spacer</span>`}
    item.innerHTML=`<span class="drag-handle">⠿</span><div class="media-body">${body}</div><button class="media-del" onclick="manifest[activeIdx].media.splice(${i},1);renderMediaList();renderPreview()">×</button>`;
    item.addEventListener('dragstart',e=>{dragSrc=i;item.classList.add('dragging');e.dataTransfer.effectAllowed='move'});
    item.addEventListener('dragend',()=>item.classList.remove('dragging'));
    item.addEventListener('dragover',e=>e.preventDefault());
    item.addEventListener('drop',e=>{
      e.preventDefault();if(dragSrc===null||dragSrc===i)return;
      const arr=manifest[activeIdx].media;const[mv]=arr.splice(dragSrc,1);arr.splice(i,0,mv);dragSrc=null;renderMediaList();renderPreview();
    });
    el.appendChild(item);
  });
}
function addMedia(type){
  const defaults={image:{type:'image',src:'',caption:''},audio:{type:'audio',src:'',caption:''},youtube:{type:'youtube',id:'',caption:''},vimeo:{type:'vimeo',id:'',caption:''},break:{type:'break'}};
  (manifest[activeIdx].media=manifest[activeIdx].media||[]).push(defaults[type]||{type,src:'',caption:''});
  renderMediaList();renderPreview();
}

function renderLinks(){
  const p=manifest[activeIdx],el=document.getElementById('links-list');if(!el)return;
  el.innerHTML=(p.links||[]).map((l,i)=>`<div class="link-row"><input value="${esc(l.label||'')}" placeholder="label" style="width:70px;flex:none" oninput="manifest[activeIdx].links[${i}].label=this.value;renderPreview()"><input value="${esc(l.href||'')}" placeholder="https://…" oninput="manifest[activeIdx].links[${i}].href=this.value"><label><input type="checkbox" ${l.primary?'checked':''} onchange="manifest[activeIdx].links[${i}].primary=this.checked;renderPreview()"> primary</label><button onclick="manifest[activeIdx].links.splice(${i},1);renderLinks();renderPreview()">×</button></div>`).join('');
}
function addLink(){(manifest[activeIdx].links=manifest[activeIdx].links||[]).push({label:'',href:'',primary:false});renderLinks()}

function plain(t){return markup?markup.plainText(t):(t||'')}
function articleStarted(p){return plain(p.body).trim().length>0||/^(!\[|::)/m.test(p.body||'')}
function bodyHtml(t){return markup?markup.renderBody(t):''}

function renderPreview(){
  scheduleAutoSave();
  if(activeIdx===null)return;
  const p=manifest[activeIdx];
  const isWip=!articleStarted(p);
  const ratioClass='r43';

  let thumbHtml='';
  if(p.thumb){
    thumbHtml=`<img class="p-card-thumb-preview ${ratioClass}" src="${esc(p.thumb)}" onerror="this.style.display='none';this.nextSibling.style.display='flex'"><div class="p-card-ph ${ratioClass}" style="display:none">${esc((p.title||'').slice(0,4))}</div>`;
  }else{
    thumbHtml=`<div class="p-card-ph ${ratioClass}">${esc((p.title||'').slice(0,4))}</div>`;
  }
  const tags=(p.tags||[]).map(t=>`<span class="p-card-tag-p">${esc(t)}</span>`).join('');
  const html=bodyHtml(p.body);

  document.getElementById('preview-col').innerHTML=`
    <div class="preview-section-label">Card</div>
    <div class="p-card-preview${isWip?' wip':''}">
      ${thumbHtml}
      <div class="p-card-body-p">
        <div class="p-card-title-p">${esc(p.title||'(untitled)')}</div>
        <div class="p-card-meta-p">
          <span class="p-card-year-p">${esc(p.year||'')}</span>
          ${tags}
        </div>
      </div>
    </div>
    <div class="preview-section-label" style="margin-top:1.25rem">Article</div>
    <div class="drawer-preview-wrap" id="drawer-preview-wrap">
      <div class="drawer-preview-scale" id="drawer-preview-scale">
        <div class="article-flow">${html||'<p class="article-empty">Nothing to see here yet! :P</p>'}</div>
      </div>
    </div>`;
  requestAnimationFrame(scaleDrawerPreview);
}

function scaleDrawerPreview(){
  const wrap=document.getElementById('drawer-preview-wrap');
  const inner=document.getElementById('drawer-preview-scale');
  if(!wrap||!inner)return;
  const REAL_WIDTH=860;
  const available=wrap.clientWidth;
  if(!available)return;
  inner.style.zoom=available/REAL_WIDTH;
  inner.style.width=REAL_WIDTH+'px';
}

function wordCount(text){
  const t=(text||'').trim();
  return t?t.split(/\s+/).length:0;
}

function openArticle(){
  if(activeIdx===null)return;
  const p=manifest[activeIdx];
  const input=document.getElementById('article-input');
  document.getElementById('article-title').textContent=p.title||'(untitled)';
  input.value=p.body||'';
  document.getElementById('article-view').hidden=false;
  updateArticle();
  input.focus();
}

function closeArticle(){
  document.getElementById('article-view').hidden=true;
  renderSidebar();
  renderForm();
  renderPreview();
}

function updateArticle(){
  const input=document.getElementById('article-input');
  if(activeIdx!==null)manifest[activeIdx].body=input.value;
  const html=bodyHtml(input.value);
  document.getElementById('article-preview').innerHTML=html||'<p class="article-empty">Nothing yet.</p>';
  document.getElementById('article-count').textContent=wordCount(plain(input.value))+' words';
  scheduleAutoSave();
}

// ---- writing toolbar ----
function ta(){return document.getElementById('article-input')}
function edit(fn){
  const t=ta();const s=t.selectionStart,e=t.selectionEnd;
  const r=fn(t.value,s,e);
  t.value=r.text;t.setSelectionRange(r.start,r.end);t.focus();updateArticle();
}
function wrapSel(before,after,ph){
  edit((v,s,e)=>{
    const mid=v.slice(s,e)||ph||'';
    return{text:v.slice(0,s)+before+mid+after+v.slice(e),start:s+before.length,end:s+before.length+mid.length};
  });
}
function linePrefix(prefix){
  edit((v,s,e)=>{
    const ls=v.lastIndexOf('\n',s-1)+1;
    const rest=v.slice(ls);
    const had=['## ','# ','- ','> '].find(x=>rest.startsWith(x));
    const cut=had?had.length:0;
    const add=had===prefix?'':prefix;
    return{text:v.slice(0,ls)+add+v.slice(ls+cut),start:s+add.length-cut,end:e+add.length-cut};
  });
}
function insertBlock(text){
  edit((v,s,e)=>{
    const before=v.slice(0,e),after=v.slice(e);
    const lead=before===''?'':before.endsWith('\n\n')?'':before.endsWith('\n')?'\n':'\n\n';
    const trail=after.startsWith('\n\n')?'':after.startsWith('\n')?'\n':'\n\n';
    const out=before+lead+text+trail+after;
    const pos=(before+lead+text).length;
    return{text:out,start:pos,end:pos};
  });
}
function insertHeading(){linePrefix('# ')}
function applyColour(sel){
  const v=sel.value;sel.value='';
  if(!v)return;
  wrapSel('{'+v+'|','}','text');
}
function addLinkSyntax(){
  const url=prompt('Link to (URL):','https://');
  if(!url)return;
  wrapSel('[','](' +url+ ')','link text');
}
function setImageFlag(flag){
  edit((v,s,e)=>{
    const ls=v.lastIndexOf('\n',s-1)+1;let le=v.indexOf('\n',s);if(le<0)le=v.length;
    const line=v.slice(ls,le);
    const m=line.match(/^(!\[.*?\]\(.+?\))(\{\w+\})?\s*$/);
    if(!m){showToast('Put the cursor on an image line');return{text:v,start:s,end:e}}
    const nl=m[1]+(flag?'{'+flag+'}':'');
    return{text:v.slice(0,ls)+nl+v.slice(le),start:ls+nl.length,end:ls+nl.length};
  });
}
function mediaDir(){const p=manifest[activeIdx];return((p&&p.thumb)||'').replace(/[^\/]*$/,'')}
function pickInline(kind){
  const fp=document.getElementById('fp-inline');
  fp.accept=kind==='audio'?'audio/*':'image/*';
  fp.multiple=kind!=='audio';
  fp.onchange=e=>{
    const files=Array.from(e.target.files);fp.value='';
    insertFiles(files);
  };fp.click();
}
function insertFiles(files){
  const dir=mediaDir();
  const lines=files.map(f=>f.type.startsWith('audio')?`::audio ${dir}${f.name} | `:`![](${dir}${f.name})`);
  if(lines.length)insertBlock(lines.join('\n'));
}
function addVideo(){
  const v=prompt('YouTube or Vimeo link (or YouTube ID):');
  if(!v)return;
  let m;
  if((m=v.match(/vimeo\.com\/(\d+)/)))return insertBlock('::vimeo '+m[1]+' | ');
  m=v.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{6,})/);
  insertBlock('::youtube '+(m?m[1]:v.trim())+' | ');
}
function insertDivider(){insertBlock('---')}

document.getElementById('article-input').addEventListener('input',updateArticle);
document.getElementById('article-input').addEventListener('dragover',e=>e.preventDefault());
document.getElementById('article-input').addEventListener('drop',e=>{
  if(!e.dataTransfer.files.length)return;
  e.preventDefault();insertFiles(Array.from(e.dataTransfer.files));
});
document.addEventListener('keydown',e=>{
  if(document.getElementById('article-view').hidden)return;
  if(e.key==='Escape')closeArticle();
  if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();saveFile()}
  if((e.ctrlKey||e.metaKey)&&e.key==='b'){e.preventDefault();wrapSel('**','**','bold')}
  if((e.ctrlKey||e.metaKey)&&e.key==='i'){e.preventDefault();wrapSel('*','*','italic')}
});

function pickThumb(){
  const fp=document.getElementById('fp-thumb');
  fp.onchange=e=>{
    const f=e.target.files[0];if(!f)return;
    const name=f.name;
    manifest[activeIdx].thumb=name;
    document.getElementById('f-thumb').value=name;
    renderSidebar();renderPreview();fp.value='';
  };fp.click();
}

function pickMediaBatch(){
  const fp=document.getElementById('fp-media');
  fp.onchange=e=>{
    Array.from(e.target.files).forEach(f=>{
      const type=f.type.startsWith('audio')?'audio':'image';
      (manifest[activeIdx].media=manifest[activeIdx].media||[]).push({type,src:f.name,caption:''});
    });
    renderMediaList();renderPreview();fp.value='';
  };fp.click();
}

let _pendingMediaIdx=null;
function pickMediaFor(i){
  _pendingMediaIdx=i;
  const fp=document.getElementById('fp-media-single');
  fp.onchange=e=>{
    const f=e.target.files[0];if(!f)return;
    manifest[activeIdx].media[_pendingMediaIdx].src=f.name;
    renderMediaList();renderPreview();fp.value='';
  };fp.click();
}

document.addEventListener('click',e=>{
  const card=e.target.closest('.audio-card-p');
  if(!card)return;
  const audio=card.querySelector('audio');
  if(!audio)return;
  audio.addEventListener('timeupdate',()=>{
    const pct=(audio.currentTime/audio.duration)*100||0;
    const bar=card.querySelector('.audio-progress-bar-p');
    const time=card.querySelector('.audio-time-p');
    if(bar)bar.style.width=pct+'%';
    if(time){const m=Math.floor(audio.currentTime/60);const s=Math.floor(audio.currentTime%60).toString().padStart(2,'0');time.textContent=`${m}:${s}`}
  },{once:false});
  audio.addEventListener('ended',()=>{const btn=card.querySelector('.audio-btn-p');if(btn)btn.textContent='▶';},{once:true});
});

window.addEventListener('resize', scaleDrawerPreview);

showImport();
