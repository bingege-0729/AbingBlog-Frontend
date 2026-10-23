<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { adminApi, AdminApiError, isAuthError } from '../services/admin'
import { THEMES } from '../utils/theme'
import type { Profile } from '../types/content'

const emit = defineEmits<{ authExpired: [] }>()

const loading = ref(true)
const saving = ref(false)
const error = ref('')
const savedTip = ref('')

const form = ref({
  headline: '',
  location: '',
  summary: '',
  stacks: '',
  awards: '',
  doing: '',
  interests: '',
  experiences: '',
  theme: '' as string,
})

function fill(profile: Profile) {
  form.value = {
    headline: profile.headline,
    location: profile.location,
    summary: profile.summary,
    stacks: profile.stacks.join(' / '),
    awards: profile.awards.join('\n'),
    doing: profile.doing,
    interests: profile.interests.join(' · '),
    experiences: profile.experiences.join('\n'),
    theme: profile.theme === 'ink' ? 'ink' : 'sand',
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    fill(await adminApi.getProfile())
  } catch (e) {
    if (isAuthError(e)) return emit('authExpired')
    error.value = e instanceof AdminApiError ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

function splitList(value: string, separator: RegExp): string[] {
  return value.split(separator).map((item) => item.trim()).filter(Boolean)
}

async function save() {
  if (saving.value) return
  saving.value = true
  error.value = ''
  savedTip.value = ''
  const input: Profile = {
    headline: form.value.headline.trim(),
    location: form.value.location.trim(),
    summary: form.value.summary.trim(),
    stacks: splitList(form.value.stacks, /[/,，]/),
    awards: form.value.awards.split('\n').map((item) => item.trim()).filter(Boolean),
    doing: form.value.doing.trim(),
    interests: splitList(form.value.interests, /[·,，]/),
    experiences: form.value.experiences.split('\n').map((item) => item.trim()).filter(Boolean),
    theme: form.value.theme === 'ink' ? 'ink' : 'sand',
  }
  try {
    fill(await adminApi.updateProfile(input))
    savedTip.value = '已保存'
  } catch (e) {
    if (isAuthError(e)) return emit('authExpired')
    error.value = e instanceof AdminApiError ? e.message : '保存失败'
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="admin-panel">
    <div class="view-title"><p class="eyebrow">后台 / 个人档案</p><h2>个人档案</h2><span>右侧档案区内容</span></div>

    <p v-if="error" class="login-error" role="alert">{{ error }}</p>
    <p v-if="loading" class="admin-empty">加载中…</p>

    <form v-else class="admin-form" @submit.prevent="save">
      <div class="admin-form-grid">
        <label>定位<input v-model="form.headline" maxlength="60" placeholder="后端开发 · AI 应用方向" /></label>
        <label>所在地<input v-model="form.location" maxlength="40" placeholder="广州" /></label>
        <label class="full">技术栈（用 / 或逗号分隔）<input v-model="form.stacks" placeholder="Go / Java / Vue / MySQL" /></label>
        <label class="full">奖项（每行一条）<textarea v-model="form.awards" class="short" placeholder="天池·欧莱雅赛题 Top 10"></textarea></label>
        <label>最近在做<input v-model="form.doing" maxlength="60" placeholder="天池·欧莱雅赛题" /></label>
        <label>兴趣（用 · 或逗号分隔）<input v-model="form.interests" placeholder="音乐 · 摄影" /></label>
        <label class="full">简介<textarea v-model="form.summary" class="short" placeholder="一句话介绍自己"></textarea></label>
        <label class="full">经历（每行一条，格式：时间段 | 标题 | 说明）<textarea v-model="form.experiences" class="short" placeholder="2024.09 – 2028.06 | 广东金融学院 · 计算机科学与技术 | 本科在读"></textarea></label>
        <div class="full admin-theme-row">
          <span class="admin-theme-label">站点配色（访客的默认主题，访客仍可在「显示设置」里自己切换）</span>
          <div class="admin-theme-options" role="radiogroup" aria-label="站点配色">
            <button
              v-for="item in THEMES"
              :key="item.id"
              type="button"
              :class="['theme-option', 'theme-option-' + item.id, { active: form.theme === item.id }]"
              :aria-pressed="form.theme === item.id"
              @click="form.theme = item.id"
            ><i></i><em>{{ item.label }}</em><small>{{ item.hint }}</small></button>
          </div>
        </div>
      </div>
      <div class="admin-form-actions">
        <button class="admin-submit" type="submit" :disabled="saving">{{ saving ? '保存中…' : '保存档案' }}</button>
      </div>
      <p v-if="savedTip" class="admin-saved">{{ savedTip }}</p>
    </form>
  </section>
</template>
