const $=s=>document.querySelector(s)
const params=new URLSearchParams(location.hash.slice(1)),token=params.get('token')||sessionStorage.getItem('buglens-token')||''
sessionStorage.setItem('buglens-token',token)
let draft,selectedImage,imageElement,regions=[],dragStart,people={team:[],recent:[]},busy=false
const urls=new Map()
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const notice=(s,error=false)=>{$('#notice').textContent=s;$('#notice').classList.toggle('error',error)}
async function api(path,method='GET',data){const r=await fetch('/api/'+path,{method,headers:{Authorization:'Bearer '+token,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});const v=await r.json();if(!r.ok)throw Error(v.error||'请求失败');return v}
const frozenFields='#description,#page-url,#files,#title,#ui-path,#steps,#actual,#expected,#ownership,#severity,#priority,#reasons,#frontend-actions,#backend-actions,#unknowns,#product,#project,#builds,#assignee,#collaborators,#image-note'
function interactionState(){document.querySelectorAll('button,input,select,textarea').forEach(e=>e.disabled=busy);if(draft?.submission)document.querySelectorAll(frozenFields).forEach(e=>e.disabled=true)}
async function run(fn){if(busy)return;busy=true;interactionState();try{await fn()}catch(e){notice(e.message,true)}finally{busy=false;interactionState()}}
const path=suffix=>`drafts/${draft.id}${suffix?'/'+suffix:''}`
async function list(){const items=await api('drafts');$('#draft-list').innerHTML=items.map(d=>`<button data-draft="${esc(d.id)}" class="${d.id===draft?.id?'selected':''}">${esc(d.description||'未命名材料')}</button>`).join('')}
async function load(id){draft=await api('drafts/'+id);selectedImage=undefined;people={team:[],recent:[]};await render();await loadPeople(false);await list()}
async function create(){draft=await api('drafts','POST',{});selectedImage=undefined;people={team:[],recent:[]};await render();await loadPeople(false);await list();notice('草稿已创建。粘贴截图，或拖入图片开始。')}
async function imageUrl(im){if(!urls.has(im.id)){const r=await fetch('/api/'+path('image/'+im.id),{headers:{Authorization:'Bearer '+token}});if(!r.ok)throw Error('读取截图失败');urls.set(im.id,URL.createObjectURL(await r.blob()))}return urls.get(im.id)}
async function render(){
 $('#workspace').hidden=false;$('#draft-number').textContent=draft.id.slice(0,8)
 $('#description').value=draft.description;$('#page-url').value=draft.page?.url||''
 $('#page-info').textContent=draft.page?`${draft.page.title} · ${draft.page.breadcrumbs?.join(' → ')||'未采集面包屑'} · ${draft.page.traces?.length||0} 条取证记录`:'未连接业务页面，可只用截图与描述生成材料。'
 const a=draft.analysis;$('#analysis-empty').hidden=!!a;$('#analysis-fields').hidden=!a;$('#analysis-badge').textContent=a?'可编辑 · AI 建议':'等待分析'
 if(a){for(const [key,id] of Object.entries({title:'title',uiPath:'ui-path',steps:'steps',actual:'actual',expected:'expected',reasons:'reasons',frontendActions:'frontend-actions',backendActions:'backend-actions',unknowns:'unknowns'}))$('#'+id).value=Array.isArray(a[key])?a[key].join('\n'):a[key]||'';$('#ownership').value=a.ownership;$('#severity').value=a.severity;$('#priority').value=a.priority;$('#expected-source').textContent=a.expectedSource==='user'?'预期来源：测试同事填写或确认':a.expectedSource==='inferred'?'预期来源：AI 推测，请确认':'预期来源：待确认';$('#questions-open').hidden=!a.questions?.length}
 $('#builds').value=draft.openedBuild.join(', ')
 $('#product').value=String(draft.product);$('#project').value=String(draft.project)
 $('#thumbnails').innerHTML=(await Promise.all(draft.images.map(async(im,i)=>`<button data-image="${im.id}" class="${im.id===selectedImage?'selected':''}" aria-label="选择第 ${i+1} 张截图"><img src="${esc(await imageUrl(im))}" alt="图 ${i+1}"></button>`))).join('')
 if(!selectedImage&&draft.images[0])selectedImage=draft.images[0].id
 if(selectedImage)await selectImage(selectedImage);else $('#image-editor').hidden=true
 renderSubmission()
 interactionState()
}
async function selectImage(id){
 const im=draft.images.find(x=>x.id===id);if(!im)return
 selectedImage=id;regions=structuredClone(im.regions);$('#image-editor').hidden=false;$('#image-note').value=im.note
 imageElement=new Image();imageElement.src=await imageUrl(im);await imageElement.decode()
 const canvas=$('#canvas');canvas.width=im.width;canvas.height=im.height;paint()
 document.querySelectorAll('[data-image]').forEach(b=>b.classList.toggle('selected',b.dataset.image===id))
}
function paint(preview){const c=$('#canvas'),ctx=c.getContext('2d');if(!imageElement)return;ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(imageElement,0,0);ctx.strokeStyle='#ed263b';ctx.lineWidth=Math.max(3,c.width/400);for(const r of [...regions,...(preview?[preview]:[])])ctx.strokeRect(r.x,r.y,r.width,r.height)}
function point(e){const c=$('#canvas'),r=c.getBoundingClientRect();return {x:Math.max(0,Math.min(c.width,Math.round((e.clientX-r.left)*c.width/r.width))),y:Math.max(0,Math.min(c.height,Math.round((e.clientY-r.top)*c.height/r.height)))}}
function rect(p){return{x:Math.min(dragStart.x,p.x),y:Math.min(dragStart.y,p.y),width:Math.abs(p.x-dragStart.x),height:Math.abs(p.y-dragStart.y)}}
$('#canvas').addEventListener('pointerdown',e=>{if(draft.submission)return;dragStart=point(e);e.target.setPointerCapture(e.pointerId)})
$('#canvas').addEventListener('pointermove',e=>{if(dragStart)paint(rect(point(e)))})
$('#canvas').addEventListener('pointerup',e=>{if(!dragStart)return;const r=rect(point(e));if(r.width>3&&r.height>3&&regions.length<8)regions.push(r);dragStart=undefined;paint()})
$('#canvas').addEventListener('pointercancel',()=>{dragStart=undefined;paint()})
function readAnalysis(){if(!draft.analysis)return;const a=structuredClone(draft.analysis);for(const [key,id] of Object.entries({title:'title',uiPath:'ui-path',steps:'steps',actual:'actual',expected:'expected',reasons:'reasons',frontendActions:'frontend-actions',backendActions:'backend-actions',unknowns:'unknowns'})){const value=$('#'+id).value;a[key]=Array.isArray(a[key])?value.split('\n').filter(Boolean):value}if(a.expected!==draft.analysis.expected)a.expectedSource='user';a.ownership=$('#ownership').value;a.severity=Number($('#severity').value);a.priority=Number($('#priority').value);return a}
async function save(){
 if(draft.submission)return
 const data={description:$('#description').value,project:Number($('#project').value)||0,openedBuild:$('#builds').value.split(',').map(s=>s.trim()).filter(Boolean),assignedTo:$('#assignee').value,collaborators:[...$('#collaborators').selectedOptions].map(o=>o.value)}
 const product=Number($('#product').value);if(product)data.product=product
 const a=readAnalysis();if(a)data.analysis=a
 if(selectedImage)data.image={id:selectedImage,regions,note:$('#image-note').value}
 if($('#page-url').value&&$('#page-url').value!==draft.page?.url)data.page={url:$('#page-url').value,title:'用户补充页面地址',breadcrumbs:[],headings:[],controls:[],traces:[]}
 draft=await api(path(),'PATCH',data)
}
async function addFiles(files){if(!draft)await create();await save();for(const file of files){if(!/^image\/(png|jpeg|webp)$/.test(file.type))continue;const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)});draft=await api(path('images'),'POST',{dataUrl,note:''})}selectedImage=draft.images.at(-1)?.id;await render();notice('截图已保存。可在图上拖动圈选，再补一句问题描述。')}
document.addEventListener('paste',e=>{const files=[...e.clipboardData.items].filter(i=>i.kind==='file').map(i=>i.getAsFile()).filter(Boolean);if(files.length){e.preventDefault();void run(()=>addFiles(files))}})
$('#files').onchange=e=>void run(()=>addFiles([...e.target.files]))
$('#drop-zone').ondragover=e=>{e.preventDefault();e.currentTarget.classList.add('dragover')}
$('#drop-zone').ondragleave=e=>e.currentTarget.classList.remove('dragover')
$('#drop-zone').ondrop=e=>{e.preventDefault();e.currentTarget.classList.remove('dragover');void run(()=>addFiles([...e.dataTransfer.files]))}
$('#new-draft').onclick=()=>void run(async()=>{if(draft)await save();await create()})
$('#draft-list').onclick=e=>{const b=e.target.closest('[data-draft]');if(b)void run(async()=>{if(draft)await save();await load(b.dataset.draft)})}
$('#thumbnails').onclick=e=>{const b=e.target.closest('[data-image]');if(b)void run(async()=>{await save();await selectImage(b.dataset.image)})}
$('#clear-regions').onclick=()=>{regions=[];paint()}
$('#save-image').onclick=()=>void run(async()=>{await save();draft=await api(path(),'PATCH',{image:{id:selectedImage,regions,note:$('#image-note').value}});notice('圈选和说明已保存。')})
$('#remove-image').onclick=()=>void run(async()=>{await save();draft=await api(path('images/'+selectedImage),'DELETE');selectedImage=undefined;await render()})
$('#move-image').onclick=()=>void run(async()=>{await save();const ids=draft.images.map(x=>x.id),i=ids.indexOf(selectedImage);if(i>0){[ids[i-1],ids[i]]=[ids[i],ids[i-1]];draft=await api(path(),'PATCH',{imageOrder:ids});await render()}})
$('#save-draft').onclick=()=>void run(async()=>{await save();await list();notice('草稿已保存。')})
$('#analyze').onclick=()=>void run(async()=>{await save();if(selectedImage&&!draft.submission)draft=await api(path(),'PATCH',{image:{id:selectedImage,regions,note:$('#image-note').value}});notice('正在结合截图和页面分析，请稍候…');draft=await api(path('analyze'),'POST',{});await render();await list();notice('故障材料已生成，请确认预期结果、职责与负责人。');if(draft.analysis.questions.length)showQuestions()})
function showQuestions(){const a=draft.analysis;if(!a)return;$('#question-items').innerHTML=a.questions.map(q=>`<div class="question"><h3>${esc(q.prompt)}</h3><div class="choices">${q.options.map(o=>`<button type="button" data-answer-id="${esc(q.id)}" data-answer="${esc(o)}">${esc(o)}</button>`).join('')}<button type="button" data-answer-id="${q.id}" data-answer="待确认">不确定</button></div><textarea data-question="${q.id}" placeholder="也可以直接填写答案">${esc(draft.answers[q.id]||'')}</textarea></div>`).join('');$('#questions').showModal()}
$('#questions-open').onclick=showQuestions
$('#question-items').onclick=e=>{const b=e.target.closest('[data-answer]');if(b)document.querySelector(`[data-question="${b.dataset.answerId}"]`).value=b.dataset.answer}
$('#save-answers').onclick=()=>void run(async()=>{await save();const answers={};document.querySelectorAll('[data-question]').forEach(e=>{if(e.value.trim())answers[e.dataset.question]=e.value.trim()});draft=await api(path(),'PATCH',{answers});$('#questions').close();await render();notice('选择已写入材料，你仍可继续修改。')})
async function catalog(){try{const products=await api('catalog?kind=products'),projects=await api('catalog?kind=projects');$('#product').innerHTML='<option value="0">请选择产品</option>'+products.map(p=>`<option value="${Number(p.id)}">${esc(p.name)}</option>`).join('');$('#project').innerHTML='<option value="0">不关联项目</option>'+projects.map(p=>`<option value="${Number(p.id)}">${esc(p.name)}</option>`).join('');if(draft){$('#product').value=String(draft.product);$('#project').value=String(draft.project)}}catch(e){notice('草稿可正常使用；禅道目录暂不可用：'+e.message,true)}}
async function loadPeople(sync){try{people=await api(path('candidates')+(sync?'?sync=1':''));renderPeople();if(people.coverage?.error)notice('历史同步未完成：'+people.coverage.error,true)}catch(e){$('#history-coverage').textContent=e.message}}
function renderPeople(){const selected=draft.assignedTo;$('#recent-people').innerHTML=people.recent.map(m=>`<button data-person="${esc(m.account)}" class="${m.account===selected?'selected':''}">${esc(m.name)}<small>${esc(new Date(m.lastAssignedAt).toLocaleString())} · ${m.source==='zentao'?'禅道历史':'本工具记录'}</small></button>`).join('');$('#assignee').innerHTML='<option value="">请选择负责人</option>'+people.team.map(m=>`<option value="${esc(m.account)}">${esc(m.name)} (${esc(m.account)})${m.role?' · '+esc(m.role):''}</option>`).join('');$('#assignee').value=selected;$('#collaborators').innerHTML=people.team.map(m=>`<option value="${esc(m.account)}" ${draft.collaborators.includes(m.account)?'selected':''}>${esc(m.name)} (${esc(m.account)})</option>`).join('');const c=people.coverage;$('#history-coverage').textContent=`${people.identity} · ${c?.scope||''} · ${c?.synced?'已扫描 '+c.scanned+' 条 Bug；'+(c.complete?'当前产品可访问列表扫描完成':'范围有限，非全量历史'):'尚未同步禅道历史'}${c?.message?'。'+c.message:''}`}
$('#sync-people').onclick=()=>void run(async()=>{await save();notice('正在读取本人指派历史…');await loadPeople(true)})
$('#member-search').oninput=e=>{const q=e.target.value.trim().toLowerCase();for(const o of $('#assignee').options)o.hidden=!!o.value&&!o.selected&&!o.textContent.toLowerCase().includes(q)}
$('#product').onchange=()=>void run(async()=>{await save();await loadPeople(false)})
$('#project').onchange=()=>void run(async()=>{await save();await loadPeople(false);const project=Number($('#project').value);if(project)try{const builds=await api('catalog?kind=builds&project='+project);$('#build-options').innerHTML=builds.map(b=>`<option value="${Number(b.id)}">${esc(b.name||b.title)}</option>`).join('')}catch(e){notice(e.message,true)}})
$('#recent-people').onclick=e=>{const b=e.target.closest('[data-person]');if(b){$('#assignee').value=b.dataset.person;document.querySelectorAll('[data-person]').forEach(p=>p.classList.toggle('selected',p===b))}}
function download(content,name,type){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$('#export').onclick=()=>void run(async()=>{await save();const result=await api(path('export'));download(result.html,'buglens-'+draft.id+'.html','text/html');notice('已下载包含全部截图和红框的离线 HTML 材料；Markdown 已同步保存在本机 exports 目录。')})
$('#submit').onclick=()=>void run(async()=>{await save();notice('正在创建或续传禅道 Bug…');draft=await api(path('submit'),'POST',{});await render();await list();notice(draft.submission?.status==='done'?'Bug 已创建、指派并完成材料上传。':'提单进度已保存，请查看下方结果。',draft.submission?.status!=='done')})
function renderSubmission(){const s=draft.submission,e=$('#submission-result');e.replaceChildren();$('#submit').textContent=s?.status==='done'?'已完成提单':s?'继续核实／补传':'创建禅道 Bug →';if(!s)return;const p=document.createElement('p');p.textContent=`状态：${{creating:'创建中',uncertain:'创建结果待核实',uploading:'正在上传',partial:'部分完成',done:'已完成'}[s.status]}${s.bugId?' · Bug #'+s.bugId:''}`;e.append(p);if(s.url){const a=document.createElement('a');a.href=s.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='打开禅道 Bug ↗';e.append(a)}for(const u of s.uploads){const p=document.createElement('p');p.textContent=`${u.filename}：${u.status==='done'?'附件接口已确认':u.status}${u.error?' · '+u.error:''}`;e.append(p)}if(s.error){const p=document.createElement('p');p.textContent=s.error;e.append(p)}}
async function connection(){const s=await api('status');$('#onboarding').hidden=s.aiConfigured&&s.zentao.connected;notice(`AI 识图：${s.aiConfigured?'已配置':'待配置团队模型'} · 禅道：${s.zentao.connected?'已连接 '+s.zentao.identity:s.zentao.error||'待配置'}`,!s.aiConfigured||!s.zentao.connected);await catalog()}
$('#connection').onclick=()=>void run(connection)
await run(async()=>{if(!token)throw Error('缺少本机访问令牌。请运行 dsh-zentao-buglens open 并打开完整地址。');await connection();const items=await api('drafts');const id=params.get('draft')||items[0]?.id;if(id)await load(id);else await create()})
