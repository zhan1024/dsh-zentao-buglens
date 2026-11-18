const recordings=new Map()
const scrub=s=>String(s)
 .replace(/(^|\n)((?:authorization|cookie|set-cookie)\s*:\s*)[^\r\n]*/gi,'$1$2[REDACTED]')
 .replace(/((?:authorization|cookie|set-cookie|password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|token)["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|(?:Bearer\s+)?[^\s,"';&}]+)/gi,'$1"[REDACTED]"')
const cleanUrl=value=>{try{const u=new URL(value);u.username='';u.password='';for(const k of [...u.searchParams.keys()])if(/token|secret|key|password|auth|session/i.test(k))u.searchParams.set(k,'[REDACTED]');u.hash=scrub(u.hash);return u.toString()}catch{return ''}}
const at=()=>new Date().toISOString()
function add(tabId,t){const state=recordings.get(tabId);if(!state)return;state.traces.push(t);if(state.traces.length>300){const routine=state.traces.findIndex(x=>x.kind==='click'||x.kind==='request'&&(!x.status||x.status<400));state.traces.splice(routine<0?0:routine,1)}}
async function activeTab(){const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id||!/^https?:/.test(tab.url||''))throw Error('请在普通 http/https 业务页面使用扩展；浏览器设置页与商店页面不支持取证');return tab}
async function configuration(){const {connection}=await chrome.storage.local.get('connection');if(!connection)throw Error('请先粘贴完整工作台地址并保存配对');const url=new URL(connection);if(url.hostname!=='127.0.0.1'||url.protocol!=='http:')throw Error('工作台必须是本机 127.0.0.1 地址');const token=new URLSearchParams(url.hash.slice(1)).get('token');if(!token)throw Error('配对地址缺少 #token=');return {url,token}}
async function api(path,method='GET',body){const {url,token}=await configuration();let response;try{response=await fetch(url.origin+'/api/'+path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined})}catch{throw Error('无法连接本机工作台，请先运行 dsh-zentao-buglens open')}const value=await response.json();if(!response.ok)throw Error(value.error||'工作台请求失败');return value}
async function context(tabId){
 const values=await chrome.scripting.executeScript({target:{tabId},func:()=>{
   const texts=(selector,max)=>[...document.querySelectorAll(selector)].filter(el=>el.getClientRects().length).slice(0,max).map(el=>(el.innerText||el.getAttribute('aria-label')||el.getAttribute('title')||'').trim().slice(0,160)).filter(Boolean)
   return {url:location.href,title:document.title,breadcrumbs:texts('[aria-label*="breadcrumb" i] a,[aria-label*="breadcrumb" i] span,.breadcrumb-item,.el-breadcrumb__inner,.ant-breadcrumb-link,.t-breadcrumb__item',30),headings:texts('h1,h2,[role="heading"]',30),controls:texts('button,[role="button"],nav a,[role="tab"][aria-selected="true"],[role="menuitem"][aria-current]',80),capturedAt:new Date().toISOString(),viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},traces:[]}
 }})
 if(!values[0]?.result)throw Error('无法读取页面上下文，请刷新业务页面后重试')
 return values[0].result
}
async function record(tab,includeBodies){
 if(recordings.get(tab.id)?.active)throw Error('当前页面已在取证中')
 await chrome.debugger.attach({tabId:tab.id},'1.3')
 recordings.set(tab.id,{active:true,startedAt:at(),traces:[],includeBodies,pending:new Map()})
 try{
   for(const domain of ['Network','Runtime','Page'])await chrome.debugger.sendCommand({tabId:tab.id},domain+'.enable')
   await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{
     if(globalThis.__buglensClickRecorder)return
     globalThis.__buglensClickRecorder=true
     document.addEventListener('click',e=>{if(!e.isTrusted)return;const el=e.target.closest('button,a,[role="button"],[role="menuitem"],[role="tab"]');if(el)chrome.runtime.sendMessage({type:'trace-click',text:(el.innerText||el.getAttribute('aria-label')||el.tagName).trim().slice(0,160)})},true)
   }})
 }catch(e){await chrome.debugger.detach({tabId:tab.id}).catch(()=>{});recordings.delete(tab.id);throw e}
}
chrome.debugger.onDetach.addListener(source=>{const state=recordings.get(source.tabId);if(state)state.active=false})
chrome.tabs.onRemoved.addListener(id=>recordings.delete(id))
chrome.debugger.onEvent.addListener((source,method,p)=>{void(async()=>{
 const id=source.tabId,state=recordings.get(id);if(!state?.active)return
 if(method==='Runtime.exceptionThrown')add(id,{kind:'pageerror',at:at(),text:scrub(p.exceptionDetails?.exception?.description||p.exceptionDetails?.text||'页面异常').slice(0,4000)})
 if(method==='Runtime.consoleAPICalled'&&['error','warning','warn'].includes(p.type))add(id,{kind:'console',at:at(),text:scrub(p.args.map(a=>a.value??a.description??'').join(' ')).slice(0,4000)})
 if(method==='Page.frameNavigated'&&!p.frame.parentId)add(id,{kind:'navigation',at:at(),url:cleanUrl(p.frame.url)})
 if(method==='Network.requestWillBeSent'&&/^https?:/.test(p.request.url)){
   state.pending.set(p.requestId,{kind:'request',at:at(),url:cleanUrl(p.request.url),method:p.request.method,...(state.includeBodies&&p.request.postData&&/json/i.test(p.request.headers?.['Content-Type']||p.request.headers?.['content-type']||'')?{requestBody:scrub(p.request.postData).slice(0,8000)}:{})})
   if(state.pending.size>300)state.pending.delete(state.pending.keys().next().value)
 }
 if(method==='Network.responseReceived'){
   const t=state.pending.get(p.requestId);if(t){t.status=p.response.status;t.mime=p.response.mimeType;add(id,{...t,mime:undefined})}
 }
 if(method==='Network.loadingFailed'){
   const t=state.pending.get(p.requestId);if(t)add(id,{...t,text:scrub(p.errorText),mime:undefined});state.pending.delete(p.requestId)
 }
 if(method==='Network.loadingFinished'){
   const t=state.pending.get(p.requestId)
   if(t&&state.includeBodies&&/json/i.test(t.mime||'')&&p.encodedDataLength<65536){
     try{const body=await chrome.debugger.sendCommand({tabId:id},'Network.getResponseBody',{requestId:p.requestId});if(!body.base64Encoded&&body.body.length<8000){const existing=state.traces.findLast(x=>x.at===t.at&&x.url===t.url);if(existing)existing.responseBody=scrub(body.body)}}catch{}
   }
   state.pending.delete(p.requestId)
 }
 })().catch(()=>{})})
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
 void(async()=>{
 if(message.type==='trace-click'){if(sender.tab?.id&&recordings.get(sender.tab.id)?.active)add(sender.tab.id,{kind:'click',at:at(),text:scrub(message.text)});return}
 if(sender.id!==chrome.runtime.id)throw Error('请求来源无效')
 if(message.type==='pair'){
   const u=new URL(message.url),token=new URLSearchParams(u.hash.slice(1)).get('token')
   if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!token||!/^[a-f0-9]{64}$/.test(token))throw Error('请使用包含 #token= 的完整本机工作台地址')
   await chrome.storage.local.set({connection:message.url});await api('drafts');return {paired:true}
 }
 const tab=await activeTab()
 if(message.type==='record'){await record(tab,message.includeBodies===true);return {recording:true}}
 if(message.type==='stop'){if(recordings.get(tab.id)?.active)await chrome.debugger.detach({tabId:tab.id});return {stopped:true}}
 if(message.type==='capture'){
   const page=await context(tab.id),state=recordings.get(tab.id)
   const screenshot=await chrome.tabs.captureVisibleTab(tab.windowId,{format:'png'})
   const current=await activeTab();if(current.id!==tab.id||current.url!==tab.url)throw Error('截图期间页面或页签发生变化，请稳定页面后重试')
   if(state){page.traces=state.traces;page.recordingStartedAt=state.startedAt}
   const draft=await api('drafts','POST',{description:message.description||'',page})
   await api('drafts/'+draft.id+'/images','POST',{dataUrl:screenshot,note:'浏览器当前可视区域；可在工作台圈选问题'})
   const {url,token}=await configuration();await chrome.tabs.create({url:url.origin+'/#'+new URLSearchParams({token,draft:draft.id})})
   return {draftId:draft.id}
 }
 throw Error('未知操作')
 })().then(value=>reply({ok:true,value})).catch(e=>reply({ok:false,error:scrub(e.message||'操作失败')}))
 return true
})
