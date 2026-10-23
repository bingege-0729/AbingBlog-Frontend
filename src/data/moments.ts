// 个人生活动态（静态数据，无后端）。仿朋友圈的短内容流，低调入口。
// 新增一条动态：
//   1. 配图（可选）压成 WebP 丢进 public/media/moments/
//   2. 在 MOMENTS 数组头部加一条记录 → git push 自动上线
// 文本支持换行（\n 会按原样展示）。
export interface Moment {
  date: string      // 展示日期，如 '2026-10-22'
  text: string      // 动态正文
  images?: string[] // 配图地址列表（可省略），如 ['/media/moments/a.webp']
}

export const moments: Moment[] = [
  // 示例（去掉注释、改成自己的即可）：
  // {
  //   date: '2026-10-22',
  //   text: '第一次把博客的"生活"板块跑通，记录一下。',
  //   images: ['/media/moments/first-commit.webp'],
  // },
]
