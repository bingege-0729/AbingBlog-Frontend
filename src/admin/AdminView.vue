<script setup lang="ts">
import { ref } from 'vue'
import ArticlePanel from './ArticlePanel.vue'
import CategoryPanel from './CategoryPanel.vue'
import TagPanel from './TagPanel.vue'
import ProjectPanel from './ProjectPanel.vue'
import VisitPanel from './VisitPanel.vue'
import FriendLinkPanel from './FriendLinkPanel.vue'
import ProfilePanel from './ProfilePanel.vue'
import ResumePanel from './ResumePanel.vue'
import SecurityPanel from './SecurityPanel.vue'

const emit = defineEmits<{ logout: []; back: [] }>()

type AdminTab =
  | 'articles'
  | 'categories'
  | 'tags'
  | 'projects'
  | 'friendlinks'
  | 'profile'
  | 'resume'
  | 'visits'
  | 'account'

const tabs: { id: AdminTab; label: string }[] = [
  { id: 'articles', label: '文章' },
  { id: 'categories', label: '分类' },
  { id: 'tags', label: '标签' },
  { id: 'projects', label: '项目' },
  { id: 'friendlinks', label: '友链' },
  { id: 'profile', label: '档案' },
  { id: 'resume', label: '简历' },
  { id: 'visits', label: '访客' },
  { id: 'account', label: '账号' },
]
const tab = ref<AdminTab>('articles')

// 任一面板收到 401（token 过期/非法）→ 交给 App.vue 清 token 回登录
function onAuthExpired() {
  emit('logout')
}
</script>

<template>
  <main class="admin-shell">
    <aside class="admin-side">
      <div class="admin-brand">ABING<i></i>控制台</div>
      <nav class="admin-nav" aria-label="后台栏目">
        <button
          v-for="item in tabs"
          :key="item.id"
          :class="{ active: tab === item.id }"
          type="button"
          :aria-current="tab === item.id ? 'page' : undefined"
          @click="tab = item.id"
        >{{ item.label }}</button>
      </nav>
      <div class="admin-side-foot">
        <button type="button" title="返回公开站点" @click="emit('back')">← 返回站点</button>
        <button class="logout-btn" type="button" @click="emit('logout')">退出登录</button>
      </div>
    </aside>

    <section class="admin-main">
      <ArticlePanel v-if="tab === 'articles'" @auth-expired="onAuthExpired" />
      <CategoryPanel v-else-if="tab === 'categories'" @auth-expired="onAuthExpired" />
      <TagPanel v-else-if="tab === 'tags'" @auth-expired="onAuthExpired" />
      <ProjectPanel v-else-if="tab === 'projects'" @auth-expired="onAuthExpired" />
      <FriendLinkPanel v-else-if="tab === 'friendlinks'" @auth-expired="onAuthExpired" />
      <ProfilePanel v-else-if="tab === 'profile'" @auth-expired="onAuthExpired" />
      <ResumePanel v-else-if="tab === 'resume'" @auth-expired="onAuthExpired" />
      <VisitPanel v-else-if="tab === 'visits'" @auth-expired="onAuthExpired" />
      <SecurityPanel v-else @auth-expired="onAuthExpired" />
    </section>
  </main>
</template>
