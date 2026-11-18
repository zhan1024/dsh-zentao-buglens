import { readFile } from 'node:fs/promises'
import { ownershipLabel, type Draft } from './model.js'
import type { Store } from './store.js'
export const escapeHtml=(s:string):string=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
export function markdown(d:Draft):string {
  const a=d.analysis
  const list=(items:string[]|undefined)=>items?.length ? items.map((v,i)=>`${i+1}. ${v}`).join('\n') : '待补充'
  return `# ${a?.title || d.description || '故障材料'}\n\n## 环境与页面\n\n- 页面：${d.page?.url || '未采集'}\n- 标题：${d.page?.title || '未采集'}\n- 业务路径：${a?.uiPath || '待补充'}\n- 取证时间：${d.page?.capturedAt || d.createdAt}\n- 产品 / 项目：${d.product} / ${d.project || '未选择'}\n- 影响版本：${d.openedBuild.join(', ')}\n\n## 问题描述\n\n${d.description}\n\n## 复现步骤\n\n${list(a?.steps)}\n\n## 实际结果\n\n${a?.actual || '待补充'}\n\n## 预期结果\n\n${a?.expected || '待补充'}\n\n依据：${a?.expectedSource==='user'?'测试同事填写或确认':a?.expectedSource==='inferred'?'AI 推测，尚未确认':'待确认'}\n\n## 职责建议\n\n- 归属：${ownershipLabel[a?.ownership || 'unknown']}（建议，非最终根因）\n- 主负责人：${d.assignedTo || '待选择'}\n- 协作人：${d.collaborators.join('、') || '无'}\n\n判断依据：\n${list(a?.reasons)}\n\n前端事项：\n${list(a?.frontendActions)}\n\n后端事项：\n${list(a?.backendActions)}\n\n## 待补充信息\n\n${list(a?.unknowns)}\n\n## 页面截图\n\n${d.images.map((im,i)=>`### 图 ${i+1} ${im.note}\n\n![图 ${i+1}](../images/${im.id}.png)\n\n${im.regions.length ? '圈选区域：'+im.regions.map(r=>`(${r.x}, ${r.y}, ${r.width}, ${r.height})`).join('；') : '未保存精确选区；外部图片标注由 AI 辅助识别。'}`).join('\n\n')}\n\n## 浏览器取证\n\n${d.page?.recordingStartedAt?'采集开始于 '+d.page.recordingStartedAt:'未开启操作取证；不包含此前发生的请求与日志。'}\n\n\`\`\`json\n${JSON.stringify(d.page?.traces || [],null,2)}\n\`\`\`\n\n材料编号：${d.id}\n`
}
export async function html(d:Draft,store:Store,remoteImages?:Record<string,string>):Promise<string> {
  const md=markdown(d)
  const images=await Promise.all(d.images.map(async(im,i)=>{
    const src=remoteImages ? remoteImages[im.id] : `data:image/png;base64,${(await readFile(store.image(im.id))).toString('base64')}`
    return `<figure><figcaption>图 ${i+1} ${escapeHtml(im.note)}</figcaption>${src?`<div class="evidence"><img alt="图 ${i+1}" src="${escapeHtml(src)}" style="max-width:100%">${!remoteImages?im.regions.map(r=>`<span style="left:${r.x/im.width*100}%;top:${r.y/im.height*100}%;width:${r.width/im.width*100}%;height:${r.height/im.height*100}%"></span>`).join(''):''}</div>`:'<p>图片尚未上传，请查看附件状态。</p>'}</figure>`
  }))
  const body=`<h1>${escapeHtml(d.analysis?.title || '故障材料')}</h1><pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(md)}</pre>${images.join('')}`
  if(remoteImages)return body+`<p>BugLens-ID: ${d.id}</p>`
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(d.analysis?.title||'故障材料')}</title><style>body{max-width:960px;margin:40px auto;padding:0 24px;font:16px/1.8 sans-serif;color:#1a292b}pre{white-space:pre-wrap;overflow-wrap:anywhere}.evidence{position:relative;display:inline-block}.evidence img{display:block}.evidence span{position:absolute;box-sizing:border-box;border:3px solid #e63946;pointer-events:none}figure{margin:24px 0}</style>${body}</html>`
}
