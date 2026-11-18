import { createHash, randomUUID } from 'node:crypto'

export type Ownership = 'frontend' | 'backend' | 'both' | 'unknown'
export interface Region { x: number; y: number; width: number; height: number }
export interface ImageEvidence { id: string; filename: string; mime: string; width: number; height: number; note: string; regions: Region[]; at: string }
export interface Trace { kind: 'click' | 'navigation' | 'console' | 'pageerror' | 'request'; at: string; text?: string; url?: string; method?: string; status?: number; requestBody?: string; responseBody?: string }
export interface PageEvidence { url: string; title: string; breadcrumbs: string[]; headings: string[]; controls: string[]; capturedAt: string; viewport?: { width: number; height: number; dpr: number }; traces: Trace[]; recordingStartedAt?: string }
export interface Question { id: string; field: string; prompt: string; options: string[] }
export interface Analysis {
  title: string; uiPath: string; steps: string[]; actual: string; expected: string;
  ownership: Ownership; confidence: 'low' | 'medium' | 'high'; reasons: string[];
  frontendActions: string[]; backendActions: string[]; unknowns: string[]; questions: Question[];
  expectedSource: 'user' | 'inferred' | 'unknown'; severity: number; priority: number;
}
export interface Assignment { account: string; at: string; bugId: number; product: number; source: 'zentao' | 'plugin'; actor: string }
export interface Member { account: string; name: string; role?: 'frontend' | 'backend' | 'fullstack' | 'qa' | 'other'; products?: number[]; active?: boolean }
export interface UploadState { key: string; filename: string; fileId?: number; url?: string; status: 'pending' | 'uploading' | 'done' | 'uncertain' | 'failed'; error?: string }
export interface Submission { marker: string; status: 'creating' | 'uncertain' | 'uploading' | 'partial' | 'done'; bugId?: number; url?: string; uploads: UploadState[]; bodyVerified?: boolean; attachmentsVerified?: boolean; assignedAt?: string; error?: string; snapshotRevision: number }
export interface Draft {
  id: string; revision: number; createdAt: string; updatedAt: string; description: string;
  page?: PageEvidence; images: ImageEvidence[]; analysis?: Analysis; answers: Record<string, string>;
  product: number; project: number; openedBuild: string[]; assignedTo: string; collaborators: string[];
  identity?: string; submission?: Submission;
}
export interface Config {
  dataDir: string; port: number;
  ai?: { baseUrl: string; model: string; apiKeyEnv: string };
  zentao: { profile?: string; siteUrl?: string; account?: string; tokenEnv?: string; passwordEnv?: string };
  defaults: { product: number; project: number; openedBuild: string[] };
  team: Member[]; historyDays: number; historyScanLimit: number;
}
export const uid = (): string => randomUUID()
export const now = (): string => new Date().toISOString()
export const hash = (s: string): string => createHash('sha256').update(s).digest('hex')
export class InputError extends Error {}
export function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('需要 JSON 对象')
  return value as Record<string, any>
}
export function str(value: unknown, name: string, max = 10000): string {
  if (typeof value !== 'string' || value.length > max) throw new InputError(`${name} 必须是长度不超过 ${max} 的文本`)
  return value
}
export function positive(value: unknown, name: string, allowZero = false): number {
  if (!Number.isSafeInteger(value) || Number(value) < (allowZero ? 0 : 1)) throw new InputError(`${name} 必须是${allowZero ? '非负' : '正'}整数`)
  return Number(value)
}
export function strings(v: unknown, max = 100): string[] {
  if (!Array.isArray(v) || v.length > max) throw new InputError('文本列表无效')
  return v.map(x => str(x, '文本', 10000))
}
export function redact(s: string): string {
  return s
    .replace(/(^|\n)((?:authorization|cookie|set-cookie)\s*:\s*)[^\r\n]*/gi, '$1$2[REDACTED]')
    .replace(/((?:authorization|cookie|set-cookie|password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|token)["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|(?:Bearer\s+)?[^\s,"';&}]+)/gi, '$1"[REDACTED]"')
}
export function safeUrl(value: string): string {
  const u = new URL(value)
  if (!['http:', 'https:'].includes(u.protocol)) throw new InputError('仅支持 http/https 页面')
  u.username = ''; u.password = ''
  for (const key of [...u.searchParams.keys()]) if (/token|secret|key|password|auth|session/i.test(key)) u.searchParams.set(key, '[REDACTED]')
  u.hash = redact(u.hash)
  return u.toString()
}
export function validatePage(value: unknown): PageEvidence {
  const p = object(value)
  return {
    url: safeUrl(str(p.url, '页面地址', 8000)), title: redact(str(p.title ?? '', '页面标题', 1000)),
    breadcrumbs: strings(p.breadcrumbs ?? [], 50).map(redact), headings: strings(p.headings ?? [], 50).map(redact),
    controls: strings(p.controls ?? [], 100).map(redact), capturedAt: str(p.capturedAt ?? now(), '截图时间', 80),
    ...(p.viewport ? { viewport: { width: positive(p.viewport.width, '视口宽度'), height: positive(p.viewport.height, '视口高度'), dpr: Number(p.viewport.dpr) || 1 } } : {}),
    recordingStartedAt: p.recordingStartedAt ? str(p.recordingStartedAt, '取证开始时间', 80) : undefined,
    traces: (Array.isArray(p.traces) ? p.traces.slice(-300) : []).map((v: unknown) => {
      const t = object(v)
      if (!['click', 'navigation', 'console', 'pageerror', 'request'].includes(t.kind)) throw new InputError('无效取证类型')
      return { kind: t.kind, at: str(t.at ?? now(), '时间', 80), ...(t.text ? { text: redact(str(t.text, '内容', 4000)) } : {}), ...(t.url ? { url: safeUrl(t.url) } : {}), ...(t.method ? { method: str(t.method, '方法', 20) } : {}), ...(Number.isInteger(t.status) ? { status: t.status } : {}), ...(t.requestBody ? { requestBody: redact(str(t.requestBody, '入参', 8000)) } : {}), ...(t.responseBody ? { responseBody: redact(str(t.responseBody, '响应', 8000)) } : {}) }
    }),
  }
}
export function normalizeAnalysis(value: unknown): Analysis {
  const a = object(value)
  const list = (v: unknown) => strings(v ?? [], 40).map(redact)
  const text = (v: unknown) => redact(str(v ?? '', '分析内容'))
  return { title: text(a.title).slice(0, 180), uiPath: text(a.uiPath), steps: list(a.steps), actual: text(a.actual), expected: text(a.expected), ownership: ['frontend','backend','both','unknown'].includes(a.ownership) ? a.ownership : 'unknown', confidence: ['low','medium','high'].includes(a.confidence) ? a.confidence : 'low', reasons: list(a.reasons), frontendActions: list(a.frontendActions), backendActions: list(a.backendActions), unknowns: list(a.unknowns), expectedSource: a.expectedSource === 'user' ? 'user' : a.expectedSource === 'inferred' ? 'inferred' : 'unknown', severity: [1,2,3,4].includes(a.severity) ? a.severity : 3, priority: [1,2,3,4].includes(a.priority) ? a.priority : 3,
    questions: (Array.isArray(a.questions) ? a.questions.slice(0, 5) : []).map((q: any, i: number) => ({ id: `q${i+1}`, field: ['expected','actual','steps','uiPath','ownership'].includes(q.field) ? q.field : 'expected', prompt: text(q.prompt), options: list(q.options).slice(0, 4) })) }
}
export const ownershipLabel: Record<Ownership, string> = { frontend: '前端', backend: '后端', both: '前后端共同', unknown: '待定位' }
