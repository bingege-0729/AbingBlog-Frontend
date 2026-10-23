// 影像作品（静态数据，无后端）。
// 新增一张照片的流程：
//   1. 原图压一版 WebP（长边 2000px、质量 82），10MB 相机原图能压到 500KB 内
//   2. 压缩版丢进 public/media/gallery/，文件名用英文+连字符
//   3. 在下面 SHOTS 数组加一条记录 → git push，CI/CD 自动上线
// src 以 .mp4/.webm/.mov 结尾的条目会自动按视频渲染。
export interface Shot {
  src: string       // 相对 public 目录的地址
  title?: string    // 作品名
  desc?: string     // 补充说明（可省略，灯箱里展示）
  location?: string // 拍摄地（可省略）
  takenAt?: string  // 拍摄时间，'YYYY-MM'（可省略）
  span?: number     // 12 栅格里占几列，默认 12（整幅）；常用 5 / 7 / 4
  aspect?: string   // 画框比例，如 '3 / 2'；留空则按图片原始比例
}

// 排版按数组顺序流动：整幅大图 → 宽幅 → 错落双拼 → 三联竖幅 → 收尾全景。
// 想让两张图并排高度齐平，记住：宽幅 7 列 配 4:3 的 5 列、竖幅三张各占 4 列。
export const shots: Shot[] = [
  {
    src: '/media/gallery/xihu-bridge.webp',
    title: '雾锁长桥',
    desc: '晨雾未散，桥亭与山影一起沉在水里',
    location: '杭州 · 西湖',
    takenAt: '2025-12',
    span: 12,
    aspect: '16 / 9',
  },
  {
    src: '/media/gallery/xihu-skyline.webp',
    title: '湖上远山',
    desc: '雾里的城市天际线，只剩一层灰度',
    location: '杭州 · 西湖',
    takenAt: '2025-12',
    span: 12,
    aspect: '2000 / 630',
  },
  {
    src: '/media/gallery/campus-court.webp',
    title: '夜的球场',
    desc: '无人机升到百米，球场像一块发光的电路板',
    location: '校园',
    span: 5,
    aspect: '4 / 3',
  },
  {
    src: '/media/gallery/snow-gold.webp',
    title: '日照金山',
    desc: '最后一缕侧光落在雪线上',
    span: 7,
    aspect: '186 / 100',
  },
  {
    src: '/media/gallery/forest-house.webp',
    title: '山间小屋',
    desc: '红瓦绿墙，安静得像童话的一页',
    span: 4,
    aspect: '2 / 3',
  },
  {
    src: '/media/gallery/park-bench.webp',
    title: '午后空椅',
    desc: '树下没人，风把草压出一道道褶皱',
    span: 4,
    aspect: '2 / 3',
  },
  {
    src: '/media/gallery/gz-night.webp',
    title: '夜行',
    desc: '立交桥上的车灯拉成一条河',
    location: '广州',
    span: 4,
    aspect: '2 / 3',
  },
  {
    src: '/media/gallery/valley.webp',
    title: '山谷里的村寨',
    desc: '群山把村子围在中间，炊烟散得很慢',
    location: '甘南',
    span: 12,
    aspect: '237 / 100',
  },
]
