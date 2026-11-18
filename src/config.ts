import { homedir } from 'node:os'
import { resolve, join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { object, positive, strings, str, type Config } from './model.js'
export const expand = (s: string): string => s.startsWith('~/') ? join(homedir(), s.slice(2)) : resolve(s)
export async function loadConfig(path = process.env.BUGLENS_CONFIG): Promise<Config> {
  const v = path ? object(JSON.parse(await readFile(expand(path), 'utf8'))) : {}
  const a = v.ai
  if (a && (!a.baseUrl || !a.model)) throw new Error('AI 配置需要 baseUrl 和支持识图的 model')
  return {
    dataDir: expand(process.env.BUGLENS_DATA_DIR || v.dataDir || '~/.local/share/zentao-buglens'), port: positive(Number(v.port ?? 43921), '端口', true),
    ai: a ? { baseUrl: str(a.baseUrl,'模型地址'), model: str(a.model,'模型名称',200), apiKeyEnv: str(a.apiKeyEnv || 'BUGLENS_AI_KEY','环境变量名',100) } : undefined,
    zentao: { ...(v.zentao ?? {}) }, defaults: { product: positive(v.defaults?.product ?? 0,'产品',true), project: positive(v.defaults?.project ?? 0,'项目',true), openedBuild: strings(v.defaults?.openedBuild ?? ['trunk'],20) },
    team: (Array.isArray(v.team) ? v.team : []).map((m:any) => ({ account:str(m.account,'账号',100), name:str(m.name,'姓名',200), role:m.role, products:m.products?.map((x:unknown)=>positive(x,'产品')), active:m.active !== false })),
    historyDays: positive(v.historyDays ?? 30,'历史天数'), historyScanLimit: Math.min(1000,positive(v.historyScanLimit ?? 200,'扫描上限')),
  }
}
