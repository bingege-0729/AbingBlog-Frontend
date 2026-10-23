export const siteConfig = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
  // 只有显式设置 VITE_USE_MOCK=true 才走假数据。
  // 反过来写（!== 'false'）会让「没传这个变量的构建」默认吃 mock，
  // 结果手动 npm run build 出来的产物里是示例文章——线上就出现占位内容。
  useMockData: import.meta.env.VITE_USE_MOCK === 'true',
  // 工信部 ICP 备案号：把这里换成你的真实备案号，链接固定指向 beian.miit.gov.cn
  icp: '粤ICP备2026143477号',
  // 公安机关备案号：审核通过后替换为真实号，链接固定指向 beian.mps.gov.cn
  gongan: '粤公网安备44030002017917号',
  // 个人主页外链：留空则不在首屏显示，避免放出无效链接
  github: 'https://github.com/bingege-0729',
  juejin: 'https://juejin.cn/user/3446339018697659/posts',
  csdn: 'https://blog.csdn.net/anonymous_zb',
  email: '2509094405@qq.com',
  // 简历 PDF 的兜底地址（正常走后台上传的 /api/v1/resume/file）：
  // 想把一份静态文件直接放进 public/ 时，把这里改成 '/resume.pdf' 即可。
  // 两处都没有文件时，页头和首屏的下载按钮都不渲染——宁可没有入口，
  // 也不给 HR 一个点了 404 的按钮。
  resumeUrl: '',
  name: 'Nomad',
 }
