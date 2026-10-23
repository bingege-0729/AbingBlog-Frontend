import { siteConfig } from '../config/site'
import type { Profile } from '../types/content'

// 后端不可用、接口未实现或处于 mock 模式时的兜底档案。
// 所在地先写死「广州」；等后端返回真实数据后会自动覆盖。
export const defaultProfile: Profile = {
  headline: '后端开发 · AI 应用方向',
  location: '广州',
  summary: '专注可靠的后端系统与克制的界面。这里放我写过的文章、做过的项目，以及最近在折腾的东西。',
  stacks: ['Go', 'Java', 'Vue', 'MySQL', 'Redis', 'Docker'],
  awards: [],
  doing: '天池·欧莱雅赛题',
  interests: ['音乐 · call of silence'],
  experiences: [
    '2024.09 – 2028.06 | 广东金融学院 · 计算机科学与技术 | 本科在读',
    '2026.06 – 2026.09 | 后端开发实习生 · 广州 | Golang / Kratos，支付链路与飞书数据导入',
  ],
  // 站点默认配色，管理端可在后台改；这里是接口拿不到时用的兜底
  theme: 'sand',
}

interface ApiEnvelope<T> {
  code: number
  message: string
  data: T | null
}

// 公开接口：GET /profile。任何异常都退回 defaultProfile，保证右侧档案区永远有内容。
export async function fetchProfile(): Promise<Profile> {
  if (siteConfig.useMockData) return defaultProfile
  try {
    const response = await fetch(`${siteConfig.apiBaseUrl}/profile`)
    if (!response.ok) return defaultProfile
    const text = await response.text()
    if (!text) return defaultProfile
    const payload = JSON.parse(text) as ApiEnvelope<Partial<Profile>>
    if (payload.code !== 0 || !payload.data) return defaultProfile
    const data = payload.data
    // 逐字段兜底，避免后端少字段把默认值覆盖成 undefined / null。
    return {
      headline: data.headline ?? defaultProfile.headline,
      location: data.location ?? defaultProfile.location,
      summary: data.summary ?? defaultProfile.summary,
      stacks: data.stacks ?? defaultProfile.stacks,
      awards: data.awards ?? defaultProfile.awards,
      doing: data.doing ?? defaultProfile.doing,
      interests: data.interests ?? defaultProfile.interests,
      experiences: data.experiences ?? defaultProfile.experiences,
      theme: data.theme ?? defaultProfile.theme,
    }
  } catch {
    return defaultProfile
  }
}
