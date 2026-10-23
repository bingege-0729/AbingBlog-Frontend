import type { PostSummary, ProjectSummary } from '../types/content'

// 开发/联调用的假数据。刻意不给 url：给了外链，点击「最新」会跳到 example.com 这种
// 假地址，看起来就像线上放着占位内容；留空则走站内正文（mockPostContents）。
export const mockPosts: PostSummary[] = [
  { slug: 'readable-blog-system', date: '2026.09.06', title: '把个人博客做成一个可阅读的系统', tag: 'DESIGN', summary: '关于克制的交互、内容优先，以及为什么入口不该抢走文章的注意力。' },
  { slug: 'async-systems-from-queues', date: '2026.08.21', title: '从消息队列开始理解异步系统', tag: 'ENGINEERING', summary: '用生产者和消费者的视角，拆解消息队列为什么是异步系统的起点。' },
  { slug: 'vue-component-boundaries', date: '2026.08.03', title: '我的 Vue 组件边界准则', tag: 'FRONTEND', summary: '组件该在什么时候拆、什么时候合，几条能落地的判断标准。' },
  { slug: 'docker-compose-foundation', date: '2026.07.16', title: 'Docker Compose: 本地开发的基础设施', tag: 'DEVOPS', summary: '把本地依赖收进一个文件，让开发环境第一次就能被复现。' },
]

// mock 模式下的文章正文，与摘要刻意不同，用来验证「未展开显示摘要、展开显示正文」。
export const mockPostContents: Record<string, string> = {
  'readable-blog-system': `# 把个人博客做成一个可阅读的系统

一个好的博客入口不该抢走文章的注意力。这篇文章记录我在设计这个站点时做的几个取舍。

## 内容优先

> 首页只放索引，不放整段正文。

列表里每条只有标题和一句话摘要，点开才看到全文。这样读者能快速扫完目录，决定读哪一篇。

## 克制的交互

- 展开用左侧点击，跳转用右侧箭头
- 不做悬浮动效，只保留一个 hover 颜色
- 命令行入口只是彩蛋，不挡正常浏览

\`\`\`ts
// 展开时按需拉正文，避免首屏把所有文章都下载下来
async function togglePost(slug: string) {
  if (!postDetails.value[slug]) {
    postDetails.value[slug] = await contentService.getPost(slug)
  }
}
\`\`\`

希望它读起来像一份干净的文档，而不是一个玩具。`,
  'async-systems-from-queues': `# 从消息队列开始理解异步系统

异步不是「加个队列」，而是把「立刻做完」拆成「可靠地稍后做完」。

## 生产者和消费者

生产者只负责把消息写进去，消费者按自己的节奏消费。两者解耦后，任何一个挂掉都不影响另一个继续工作。

1. 生产者写入消息并拿到确认
2. 队列持久化，等待消费
3. 消费者逐条处理并确认

## 为什么不是银弹

队列引入延迟和顺序问题，适合能容忍最终一致的场景，不适合强一致的需求。`,
  'vue-component-boundaries': `# 我的 Vue 组件边界准则

拆组件不是为了文件短，而是为了每个组件只有一种变化的原因。

## 几条判断

- 重复出现两次以上再抽公共组件
- 模板超过 200 行先考虑拆分
- props 超过 5 个检查是否该用插槽或组合

**边界清晰比复用更重要。**`,
  'docker-compose-foundation': `# Docker Compose: 本地开发的基础设施

新成员 clone 下来能一键起环境，这件事值得提前做。

\`\`\`yaml
services:
  mysql:
    image: mysql:8
    environment:
      MYSQL_ROOT_PASSWORD: root
  app:
    build: .
    depends_on:
      - mysql
\`\`\`

依赖收进一个文件，开发环境第一次就能被复现。`,
}

export const mockProjects: ProjectSummary[] = [
  { slug: 'abingblog', name: 'ABINGBLOG', detail: 'A full-stack blog system with a terminal-first interface.', stack: 'GO · VUE · MYSQL' },
  { slug: 'queue-lab', name: 'QUEUE LAB', detail: 'Visual notes and experiments around message-driven services.', stack: 'GO · REDIS · RABBITMQ' },
  { slug: 'tiny-state', name: 'TINY STATE', detail: 'A minimal state machine for deliberate UI transitions.', stack: 'TYPESCRIPT' },
]
