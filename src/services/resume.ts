import { siteConfig } from '../config/site'

export interface ResumeMeta {
  available: boolean
  filename: string
  size: number
  updated_at: string
}

const EMPTY: ResumeMeta = { available: false, filename: '', size: 0, updated_at: '' }

interface ApiEnvelope<T> {
  code: number
  message: string
  data: T | null
}

// 公开接口：只读元信息。任何异常都当成「没有简历」，前台只是不显示下载按钮，
// 不该因为文件服务挂了把整页搞出错误提示。
export async function fetchResumeMeta(): Promise<ResumeMeta> {
  if (siteConfig.useMockData) return EMPTY
  try {
    const response = await fetch(`${siteConfig.apiBaseUrl}/resume`)
    if (!response.ok) return EMPTY
    const payload = await response.json() as ApiEnvelope<ResumeMeta>
    if (payload.code !== 0 || !payload.data) return EMPTY
    return payload.data
  } catch {
    return EMPTY
  }
}

// 下载地址固定：后端只保留一份简历，上传即覆盖，所以链接不需要带版本号
export const resumeFileUrl = `${siteConfig.apiBaseUrl}/resume/file`
