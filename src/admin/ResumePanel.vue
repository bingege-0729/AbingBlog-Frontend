<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { adminApi, AdminApiError, isAuthError } from '../services/admin'
import { fetchResumeMeta, resumeFileUrl, type ResumeMeta } from '../services/resume'

const emit = defineEmits<{ authExpired: [] }>()

const meta = ref<ResumeMeta>({ available: false, filename: '', size: 0, updated_at: '' })
const loading = ref(true)
const uploading = ref(false)
const error = ref('')
const savedTip = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const MAX_SIZE = 10 * 1024 * 1024

const sizeText = computed(() => {
  const size = meta.value.size
  if (!size) return ''
  return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(2)} MB` : `${Math.round(size / 1024)} KB`
})

const updatedText = computed(() => {
  if (!meta.value.updated_at) return ''
  const date = new Date(meta.value.updated_at)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN')
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    meta.value = await fetchResumeMeta()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

function pick() {
  fileInput.value?.click()
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // 允许连续选同一个文件（否则第二次不触发 change）
  if (!file || uploading.value) return

  error.value = ''
  savedTip.value = ''

  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    error.value = '只支持 PDF 文件'
    return
  }
  if (file.size > MAX_SIZE) {
    error.value = '文件超过 10MB'
    return
  }

  uploading.value = true
  try {
    meta.value = await adminApi.uploadResume(file)
    savedTip.value = '已上传，前台下载按钮已更新'
  } catch (e) {
    if (isAuthError(e)) return emit('authExpired')
    error.value = e instanceof AdminApiError ? e.message : '上传失败'
  } finally {
    uploading.value = false
  }
}

async function remove() {
  if (!window.confirm('删除后前台不再显示下载按钮，确认删除？')) return
  error.value = ''
  savedTip.value = ''
  try {
    await adminApi.deleteResume()
    meta.value = { available: false, filename: '', size: 0, updated_at: '' }
    savedTip.value = '已删除'
  } catch (e) {
    if (isAuthError(e)) return emit('authExpired')
    error.value = e instanceof AdminApiError ? e.message : '删除失败'
  }
}

onMounted(load)
</script>

<template>
  <section class="admin-panel">
    <div class="view-title"><p class="eyebrow">后台 / 简历</p><h2>简历文件</h2><span>简历视图的下载按钮</span></div>

    <p v-if="error" class="login-error" role="alert">{{ error }}</p>
    <p v-if="loading" class="admin-empty">加载中…</p>

    <template v-else>
      <div class="resume-card">
        <div class="resume-card-main">
          <span class="resume-card-label">当前文件</span>
          <template v-if="meta.available">
            <strong>{{ meta.filename || 'resume.pdf' }}</strong>
            <small>{{ sizeText }}<template v-if="updatedText"> · 更新于 {{ updatedText }}</template></small>
          </template>
          <template v-else>
            <strong class="resume-card-empty">还没有上传</strong>
            <small>上传后 <code>/resume</code> 页面才会出现「下载简历 PDF」按钮</small>
          </template>
        </div>
        <div class="resume-card-actions">
          <button class="admin-submit" type="button" :disabled="uploading" @click="pick">{{ uploading ? '上传中…' : (meta.available ? '替换 PDF' : '上传 PDF') }}</button>
          <a v-if="meta.available" class="resume-card-link" :href="resumeFileUrl" target="_blank" rel="noopener noreferrer">预览 ↗</a>
          <button v-if="meta.available" class="resume-card-danger" type="button" @click="remove">删除</button>
        </div>
      </div>

      <input ref="fileInput" class="resume-file-input" type="file" accept="application/pdf,.pdf" @change="onFileChange" />

      <p class="admin-hint">只接受 PDF，最大 10MB。上传会直接覆盖旧文件，下载链接始终是同一个。</p>
      <p v-if="savedTip" class="admin-saved">{{ savedTip }}</p>
    </template>
  </section>
</template>
