const $=s=>document.querySelector(s)
const saved=await chrome.storage.local.get('connection')
$('#connection').value=saved.connection||''
async function send(type,data={}){const response=await chrome.runtime.sendMessage({type,...data});if(!response?.ok)throw Error(response?.error||'扩展请求失败');return response.value}
async function run(fn){document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn()}catch(e){$('#status').textContent=e.message}finally{document.querySelectorAll('button').forEach(b=>b.disabled=false)}}
$('#pair').onclick=()=>void run(async()=>{await send('pair',{url:$('#connection').value});$('#status').textContent='已保存本机配对。工作台重启后请使用新地址重新配对。'})
$('#capture').onclick=()=>void run(async()=>{const value=await send('capture',{description:$('#description').value});$('#status').textContent='截图已加入草稿，工作台已打开。';})
$('#record').onclick=()=>void run(async()=>{await send('record',{includeBodies:$('#include-bodies').checked});$('#status').textContent='已开始取证，请回到当前业务页面复现故障，再截图。'})
$('#stop').onclick=()=>void run(async()=>{await send('stop');$('#status').textContent='取证已停止，已收集记录会在下次截图时一并带入。'})
