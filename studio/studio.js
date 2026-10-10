const $ = id => document.getElementById(id);
const editor = $('source');
let token, current, baseline = '', rendered, conflict, selectedText = '', recovery;
let rendering = 0, renderTimer, busy = false, selectedTable = 0, tableModel, readingTheme = document.documentElement.dataset.reading || 'warm';
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dirty = () => current && editor.value !== baseline;
const draftKey = () => `blog-studio:${current?.id}`;
function notice(message = '') { $('notice').textContent = message; $('notice').hidden = !message; }
function report(e) {
  const message=e.message || String(e);notice(message);
  const open=document.querySelector('dialog[open]');
  if(open){let box=open.querySelector('.dialog-error');if(!box){box=document.createElement('p');box.className='dialog-error';box.setAttribute('role','alert');open.append(box);}box.textContent=message;}
}
function status(message) { $('status').textContent = message; }
async function api(path, body) {
  const res = await fetch(`/api/${path}`,{method:body === undefined ? 'GET':'POST',headers:{'X-Studio-Token':token,...(body === undefined ? {}:{'Content-Type':'application/json'})},body:body === undefined ? undefined:JSON.stringify(body)});
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || '请求失败'),{status:res.status,data});
  return data;
}
function cacheDraft() {
  try {
    if (dirty()) localStorage.setItem(draftKey(),JSON.stringify({source:editor.value,version:current.version}));
    else if (!recovery) localStorage.removeItem(draftKey());
  } catch { notice('浏览器草稿备份不可用，请及时保存到文件。'); }
}
function updateCounts() {
  const line = editor.value.slice(0,editor.selectionStart).split('\n').length;
  $('position').textContent = `第 ${line} 行`;
  $('word-count').textContent = `${editor.value.replace(/\s/g,'').length.toLocaleString()} 字`;
}
function changed() {
  cacheDraft(); updateCounts();
  status(conflict ? '需要合并' : dirty() ? '有未保存修改' : '已保存到文件');
  clearTimeout(renderTimer); renderTimer = setTimeout(()=>render().catch(report),230);
}
function showConflict(data) { conflict = data; $('conflict').hidden = false; status('需要合并'); }
function clearConflict() { conflict = undefined; $('conflict').hidden = true; }
function positionAt(line) {
  const start = editor.value.split('\n').slice(0,line).join('\n').length + (line ? 1 : 0);
  if (document.querySelector('.panes').dataset.mode === 'preview') setMode('split');
  editor.focus(); editor.setSelectionRange(start,start);
  const mirror=document.createElement('div'),css=getComputedStyle(editor);
  for(const key of ['font','lineHeight','padding','boxSizing','letterSpacing','tabSize'])mirror.style[key]=css[key];
  Object.assign(mirror.style,{position:'fixed',visibility:'hidden',whiteSpace:'pre-wrap',overflowWrap:'break-word',width:`${editor.clientWidth}px`,left:'-10000px'});
  mirror.textContent=editor.value.slice(0,start);const marker=document.createElement('span');marker.textContent='|';mirror.append(marker);document.body.append(mirror);
  editor.scrollTop=Math.max(0,marker.offsetTop-60);mirror.remove();
  updateCounts();
}
function setMode(mode) { document.querySelector('.panes').dataset.mode = mode; document.querySelectorAll('[data-mode]').forEach(b=>{if(b.tagName==='BUTTON')b.setAttribute('aria-pressed',String(b.dataset.mode===mode));}); }
async function render() {
  if (!current) return;
  const ticket = ++rendering, source = editor.value;
  let result;
  try { result = await api('render',{source}); }
  catch(e) { if(ticket===rendering) {status('预览需要修正');notice(e.message);} return; }
  if (ticket !== rendering || source !== editor.value) return;
  rendered = result;
  $('document-title').textContent = result.meta.title;
  notice(result.errors ? `${result.errors} 个公式未能解析，预览中已标红。修正后再生成网页。` : '');
  const frame = $('preview'), scroll = frame.contentWindow?.scrollY || 0;
  frame.onload = () => {
    if (ticket !== rendering) return;
    const doc = frame.contentDocument;
    frame.contentWindow.scrollTo(0,scroll);
    doc.addEventListener('mouseup',()=>{const text=frame.contentWindow.getSelection()?.toString();if(text)selectedText=text;});
    doc.addEventListener('dblclick',e=>{const block=e.target.closest('[data-line]');if(block)positionAt(Number(block.dataset.line));});
    doc.addEventListener('click',e=>{const link=e.target.closest('a');if(link){e.preventDefault();if(link.hash)doc.getElementById(decodeURIComponent(link.hash.slice(1)))?.scrollIntoView();}});
  };
  frame.srcdoc = `<!doctype html><html lang="${result.meta.language}" data-reading="${readingTheme}" data-theme="${readingTheme==='dark'?'dark':'light'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="/"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/assets/vendor/katex/katex.min.css"><link rel="stylesheet" href="/studio/appearance.css"><style>.blog-post-page{width:calc(100% - 56px);max-width:680px;padding-top:34px;padding-bottom:70px}.post-header{margin-top:26px}.post-body [data-line]{cursor:text}</style></head><body><main class="page blog-post-page">${result.article}</main><script src="/blog-notes.js"></script></body></html>`;
  $('outline').replaceChildren();
  result.headings.forEach(h=>{
    const button=document.createElement('button');button.textContent=h.title;button.className=h.level>2?'sub':'';
    button.onclick=()=>{positionAt(h.line);frame.contentDocument.getElementById(h.id)?.scrollIntoView({block:'start',behavior:'smooth'});};$('outline').append(button);
  });
}
async function listPosts() {
  const posts = await api('posts'); $('posts').replaceChildren();
  posts.forEach(p=>{
    const button=document.createElement('button');button.className=p.id===current?.id?'active':'';
    const title=document.createElement('span');title.textContent=p.title;
    const meta=document.createElement('small');meta.textContent=`${p.status==='published'?'已纳入博客':p.status==='invalid'?'信息需修正':'草稿'} · ${p.id}.md`;
    button.append(title,meta);button.onclick=()=>load(p.id).catch(report);$('posts').append(button);
  }); return posts;
}
async function load(id, { skipPrompt=false }={}) {
  if (busy) return;
  if (!skipPrompt && dirty() && !confirm('当前内容尚未保存。保留浏览器草稿并切换文章？')) return;
  if (current) cacheDraft();
  const data=await api(`post?id=${encodeURIComponent(id)}`);
  ++rendering;current=data;baseline=data.source;editor.value=data.source;editor.disabled=false;editor.setSelectionRange(0,0);editor.scrollTop=0;
  $('save').disabled=false;$('build').disabled=false;$('file-path').textContent=`content/posts/${id}.md`;
  clearConflict();recovery=undefined;$('recovery').hidden=true;selectedText='';
  try { const stored=JSON.parse(localStorage.getItem(draftKey()) || 'null'); if(stored && stored.source!==baseline){recovery=stored;$('recovery').hidden=false;} } catch {}
  status('已保存到文件');updateCounts();await listPosts();await render();
}
async function save() {
  if (!current || busy) return false;
  if(conflict){$('compare').click();return false;}
  if(recovery){notice('请先恢复浏览器草稿，或选择保留磁盘版本。');return false;}
  busy=true;status('保存中…');$('save').disabled=true;
  const source=editor.value, id=current.id;
  try {
    const saved=await api('save',{id,version:current.version,source});
    current=saved;baseline=source;cacheDraft();status(dirty()?'还有未保存修改':'已保存到文件');await listPosts();return !dirty();
  } catch(e) {if(e.status===409)showConflict(e.data.current);else report(e);return false;}
  finally {busy=false;$('save').disabled=false;}
}
async function poll() {
  if (!current || busy) return;
  const id=current.id;
  try {
    const remote=await api(`post?id=${encodeURIComponent(id)}`);
    if(current.id!==id || busy || remote.version===current.version)return;
    if(dirty() || recovery || conflict || document.querySelector('dialog[open]')){showConflict(remote);return;}
    current=remote;baseline=remote.source;editor.value=remote.source;status('已同步外部修改');updateCounts();await listPosts();await render();
  } catch {status('连接中断 · 内容保留在浏览器');}
}
function insert(text) {editor.setRangeText(text,editor.selectionStart,editor.selectionEnd,'end');changed();editor.focus();}
function dialog(id) {$(id).querySelector('.dialog-error')?.remove();$(id).showModal();}
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
document.querySelectorAll('button[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
editor.addEventListener('input',changed);editor.addEventListener('click',updateCounts);editor.addEventListener('keyup',updateCounts);
editor.addEventListener('select',()=>{const s=editor.value.slice(editor.selectionStart,editor.selectionEnd);if(s)selectedText=s;});
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='s'){e.preventDefault();save().catch(report);}});
window.addEventListener('beforeunload',e=>{if(dirty()){cacheDraft();e.preventDefault();e.returnValue='';}});
$('save').onclick=()=>save().catch(report);
$('build').onclick=async()=>{if(!await save())return;try{status('正在生成…');const result=await api('build',{});status('本地网页已生成');notice(result.message+' 尚未提交或推送。');}catch(e){report(e);status('生成失败');}};
$('insert-math').onclick=()=>insert('\n\n$$\ny = \\sum_{i \\in S} g_i E_i(x)\n$$\n');
$('reading-theme').value = readingTheme;
$('reading-theme').onchange = () => {
  readingTheme = $('reading-theme').value;
  document.documentElement.dataset.reading = readingTheme;
  const previewRoot = $('preview').contentDocument?.documentElement;
  if (previewRoot) {
    previewRoot.dataset.reading = readingTheme;
    previewRoot.dataset.theme = readingTheme === 'dark' ? 'dark' : 'light';
  }
  try { localStorage.setItem('blog-studio-reading', readingTheme); } catch {}
};
$('preview-mobile').onclick=()=>{const state=document.querySelector('.preview-stage').classList.toggle('mobile');$('preview-mobile').setAttribute('aria-pressed',String(state));};
$('recover-draft').onclick=()=>{const old=recovery;editor.value=old.source;recovery=undefined;$('recovery').hidden=true;if(old.version!==current.version)showConflict(current);changed();};
$('discard-draft').onclick=()=>{recovery=undefined;$('recovery').hidden=true;cacheDraft();};
$('compare').onclick=()=>{if(!conflict)return;$('disk-version').value=conflict.source;$('merge-version').value=editor.value;$('compare-dialog').dataset.version=conflict.version;dialog('compare-dialog');};
function resolveConflict(useDisk) {
  if(!conflict || $('compare-dialog').dataset.version!==conflict.version){$('compare').click();notice('比较期间磁盘再次发生变化，请查看最新版本。');return;}
  current=conflict;baseline=conflict.source;editor.value=useDisk?conflict.source:$('merge-version').value;
  clearConflict();recovery=undefined;$('recovery').hidden=true;$('compare-dialog').close();changed();
}
$('use-disk').onclick=()=>resolveConflict(true);$('use-merge').onclick=()=>resolveConflict(false);

function tableText(model) {
  const cell = value => value.replace(/\r?\n/g,' ').replace(/(?<!\\)\|/g,'\\|');
  const rows=model.rows.map(row=>`| ${row.map(cell).join(' | ')} |`);
  rows.splice(1,0,`| ${model.rows[0].map((_,i)=>model.align[i]==='center'?':---:':model.align[i]==='right'?'---:':model.align[i]==='left'?':---':'---').join(' | ')} |`);
  return rows.join('\n');
}
function writeTable() {
  const lines=editor.value.split('\n'), replacement=tableText(tableModel).split('\n');
  lines.splice(tableModel.start,tableModel.end-tableModel.start,...replacement);
  tableModel.end=tableModel.start+replacement.length;editor.value=lines.join('\n');changed();
}
function tableGrid() {
  $('table-grid').replaceChildren();
  const controls=['add-row','add-column','remove-row','remove-column'];controls.forEach(id=>$(id).disabled=!tableModel);
  if(!tableModel){$('table-grid').textContent='当前还没有表格。点击“插入表格”开始。';return;}
  const table=document.createElement('table');
  tableModel.rows.forEach((row,r)=>{const tr=document.createElement('tr');row.forEach((value,c)=>{
    const td=document.createElement('td'),input=document.createElement('textarea'),preview=document.createElement('div');
    preview.className='cell-preview';input.value=value;input.setAttribute('aria-label',`第 ${r+1} 行，第 ${c+1} 列`);
    let timer,sequence=0;
    const refresh=async()=>{const seq=++sequence;try{const result=await api('cell',{source:input.value});if(seq===sequence)preview.innerHTML=result.html;}catch(e){preview.textContent=e.message;}};
    input.oninput=()=>{tableModel.rows[r][c]=input.value;writeTable();clearTimeout(timer);timer=setTimeout(refresh,200);};
    td.append(input,preview);tr.append(td);refresh();
  });table.append(tr);});$('table-grid').append(table);
}
async function openTable(index=0) {
  await render();selectedTable=index;$('table-select').replaceChildren();
  (rendered?.tables||[]).forEach((t,i)=>{const option=document.createElement('option');option.value=i;option.textContent=`表格 ${i+1} · 第 ${t.start+1} 行`;$('table-select').append(option);});
  tableModel=rendered?.tables[index]?structuredClone(rendered.tables[index]):null;$('table-select').value=String(index);tableGrid();
}
$('tables').onclick=async()=>{await openTable();dialog('table-dialog');};
$('table-select').onchange=()=>openTable(Number($('table-select').value)).catch(report);
$('new-table').onclick=async()=>{editor.setSelectionRange(editor.value.length,editor.value.length);insert('\n\n| 项目 | 公式 |\n| --- | --- |\n| 示例 | $g_i = a_i$ |\n');await render();await openTable(rendered.tables.length-1);};
$('add-row').onclick=()=>{tableModel.rows.push(tableModel.rows[0].map(()=>''));writeTable();tableGrid();};
$('add-column').onclick=()=>{tableModel.rows.forEach((r,i)=>r.push(i===0?'新列':''));tableModel.align.push('');writeTable();tableGrid();};
$('remove-row').onclick=()=>{if(tableModel.rows.length>2){tableModel.rows.pop();writeTable();tableGrid();}};
$('remove-column').onclick=()=>{if(tableModel.rows[0].length>1){tableModel.rows.forEach(r=>r.pop());tableModel.align.pop();writeTable();tableGrid();}};

$('collaborate').onclick=()=>{$('selection').value=selectedText;$('task-result').hidden=true;dialog('collab-dialog');};
$('make-task').onclick=async()=>{
  if(!$('instruction').value.trim()){report(new Error('请先写下修改要求。'));$('instruction').focus();return;}
  if(!await save())return;
  try{const result=await api('task',{id:current.id,version:current.version,selection:$('selection').value,instruction:$('instruction').value});$('task-prompt').value=result.prompt;$('task-result').hidden=false;}
  catch(e){if(e.status===409)showConflict(e.data.current);report(e);}
};
$('copy-task').onclick=async()=>{try{await navigator.clipboard.writeText($('task-prompt').value);$('copy-task').textContent='已复制';}catch{$('task-prompt').select();$('copy-task').textContent='请按 ⌘C 复制';}};
$('history').onclick=async()=>{
  if(!current)return;
  try{const revisions=await api(`history?id=${current.id}`);$('history-list').replaceChildren();
  if(!revisions.length)$('history-list').textContent='还没有旧版本。首次修改并保存后，历史会出现在这里。';
  revisions.forEach(r=>{const button=document.createElement('button');button.textContent=`${new Date(r.time).toLocaleString('zh-CN')} · 放回编辑区`;button.onclick=async()=>{if(dirty()&&!confirm('用这个历史版本替换编辑区？当前未保存内容将被替换。'))return;try{const revision=await api(`revision?id=${current.id}&name=${r.name}`);editor.value=revision.source;$('history-dialog').close();changed();}catch(e){report(e);}};$('history-list').append(button);});dialog('history-dialog');}catch(e){report(e);}
};
$('new-post').onclick=()=>dialog('new-dialog');
$('new-form').onsubmit=async e=>{
  e.preventDefault();if(dirty()&&!confirm('保留当前浏览器草稿，并创建新文章？'))return;
  const now=new Date(),date=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const source=`---\ntitle: ${JSON.stringify($('new-title').value)}\ndate: "${date}"\ndescription: ""\nstatus: draft\n---\n\n## 从一个问题开始\n\n在这里写下你的想法。\n`;
  try{const created=await api('create',{id:$('new-id').value,source});$('new-dialog').close();await load(created.id,{skipPrompt:true});}catch(e){report(e);}
};

try {token=(await api('session')).token;const posts=await listPosts();if(posts.length)await load(posts[0].id);else status('创建第一篇文章');setInterval(()=>poll(),1800);}catch(e){report(e);status('无法连接本地写作服务');}
