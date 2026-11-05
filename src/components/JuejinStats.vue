<script setup lang="ts">
import { computed } from 'vue'
import type { JuejinStats } from '../types/content'

const props = defineProps<{ stats?: JuejinStats | null }>()

// 只有拿到且阅读量 > 0 才展示整块；点赞/评论/收藏只在 > 0 时才显示单项。
// 掘金把互动数压缩成变量，免登录拿不到，恒为 0 —— 由模板里的 v-if 自然隐藏。
const show = computed(() => !!props.stats && props.stats.ok && props.stats.views > 0)
const views = computed(() => (show.value ? props.stats!.views : 0))
const likes = computed(() => (show.value ? props.stats!.likes : 0))
const comments = computed(() => (show.value ? props.stats!.comments : 0))
const collects = computed(() => (show.value ? props.stats!.collects : 0))
</script>

<template>
  <div v-if="show" class="juejin-stats" title="来自掘金的公开阅读数据">
    <svg class="js-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 1.6 2.4 9l4 12.4h11.2L21.6 9 12 1.6Z" fill="var(--accent)" />
      <path d="M12 6.5 7.2 10.1l2.1 5.8h5.4l2.1-5.8L12 6.5Z" fill="var(--bg)" />
    </svg>
    <span class="js-num">{{ views.toLocaleString() }}</span>
    <span class="js-label">阅读</span>
    <template v-if="likes > 0">
      <span class="js-sep">·</span><span class="js-num">{{ likes.toLocaleString() }}</span><span class="js-label">赞</span>
    </template>
    <template v-if="comments > 0">
      <span class="js-sep">·</span><span class="js-num">{{ comments.toLocaleString() }}</span><span class="js-label">评论</span>
    </template>
    <template v-if="collects > 0">
      <span class="js-sep">·</span><span class="js-num">{{ collects.toLocaleString() }}</span><span class="js-label">收藏</span>
    </template>
  </div>
</template>
