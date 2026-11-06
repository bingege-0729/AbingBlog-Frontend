<script setup lang="ts">
import { reactive, ref } from 'vue'
import { adminApi, AdminApiError, isAuthError } from '../services/admin'

const emit = defineEmits<{ authExpired: [] }>()

const form = reactive({ oldPassword: '', newPassword: '', confirm: '' })
const saving = ref(false)
const error = ref('')
const savedTip = ref('')

// 前端先拦一遍，避免无谓打接口；后端仍会再校验一遍
const localError = ref('')
function validate(): string {
  if (!form.oldPassword) return '请输入当前密码'
  if (form.newPassword.length < 6) return '新密码至少 6 位'
  if (form.newPassword === form.oldPassword) return '新密码不能与当前密码相同'
  if (form.confirm !== form.newPassword) return '两次输入的新密码不一致'
  return ''
}

async function submit() {
  if (saving.value) return
  localError.value = validate()
  if (localError.value) return

  saving.value = true
  error.value = ''
  savedTip.value = ''
  try {
    await adminApi.changePassword(form.oldPassword, form.newPassword)
    savedTip.value = '密码已更新'
    form.oldPassword = ''
    form.newPassword = ''
    form.confirm = ''
  } catch (e) {
    if (isAuthError(e)) return emit('authExpired')
    error.value = e instanceof AdminApiError ? e.message : '修改失败'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="admin-panel">
    <div class="view-title">
      <p class="eyebrow">后台 / 账号安全</p>
      <h2>账号安全</h2>
      <span>修改登录密码</span>
    </div>

    <p v-if="error" class="login-error" role="alert">{{ error }}</p>

    <form class="admin-form admin-form-narrow" @submit.prevent="submit">
      <label>
        当前密码
        <input v-model="form.oldPassword" type="password" autocomplete="current-password" maxlength="64" />
      </label>
      <label>
        新密码
        <input v-model="form.newPassword" type="password" autocomplete="new-password" maxlength="64" placeholder="至少 6 位" />
      </label>
      <label>
        确认新密码
        <input v-model="form.confirm" type="password" autocomplete="new-password" maxlength="64" />
      </label>

      <p v-if="localError" class="login-error" role="alert">{{ localError }}</p>

      <div class="admin-form-actions">
        <button class="admin-submit" type="submit" :disabled="saving">{{ saving ? '保存中…' : '更新密码' }}</button>
      </div>
      <p v-if="savedTip" class="admin-saved">{{ savedTip }}</p>
    </form>
  </section>
</template>
