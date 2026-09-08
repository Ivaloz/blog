<script setup>
import { ref, computed, onMounted } from 'vue'

// 配置
const CONFIG = {
  password: 'ialo2026',  // 登录密码
  adminPassword: 'admin2026',  // 管理员密码
  storageKey: 'treehole_posts',
}

// 状态
const isLoggedIn = ref(false)
const isAdmin = ref(false)
const passwordInput = ref('')
const posts = ref([])
const newPost = ref('')
const showAdmin = ref(false)
const error = ref('')

// 登录
function login() {
  if (passwordInput.value === CONFIG.password) {
    isLoggedIn.value = true
    isAdmin.value = false
    error.value = ''
    localStorage.setItem('treehole_logged_in', 'true')
    localStorage.setItem('treehole_is_admin', 'false')
    loadPosts()
  } else if (passwordInput.value === CONFIG.adminPassword) {
    isLoggedIn.value = true
    isAdmin.value = true
    error.value = ''
    localStorage.setItem('treehole_logged_in', 'true')
    localStorage.setItem('treehole_is_admin', 'true')
    loadPosts()
  } else {
    error.value = '密码错误'
  }
}

// 加载帖子（从localStorage）
function loadPosts() {
  const saved = localStorage.getItem(CONFIG.storageKey)
  if (saved) {
    posts.value = JSON.parse(saved).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }
}

// 发帖
function submitPost() {
  if (!newPost.value.trim()) return
  
  const post = {
    id: Date.now(),
    content: newPost.value,
    createdAt: new Date().toISOString(),
    visible: true,
  }
  
  posts.value.unshift(post)
  savePosts()
  newPost.value = ''
}

// 保存帖子
function savePosts() {
  localStorage.setItem(CONFIG.storageKey, JSON.stringify(posts.value))
}

// 切换帖子可见性（管理员）
function toggleVisibility(post) {
  post.visible = !post.visible
  savePosts()
}

// 删除帖子（管理员）
function deletePost(post) {
  if (!confirm('确认永久删除这条帖子？')) return
  posts.value = posts.value.filter(p => p.id !== post.id)
  savePosts()
}

// 退出登录
function logout() {
  isLoggedIn.value = false
  isAdmin.value = false
  localStorage.removeItem('treehole_logged_in')
  localStorage.removeItem('treehole_is_admin')
}

// 统计信息
const stats = computed(() => ({
  total: posts.value.length,
  visible: posts.value.filter(p => p.visible).length,
  hidden: posts.value.filter(p => !p.visible).length,
}))

// 可见帖子（用户视图）
const visiblePosts = computed(() => posts.value.filter(p => p.visible))

onMounted(() => {
  const saved = localStorage.getItem('treehole_logged_in')
  if (saved === 'true') {
    isLoggedIn.value = true
    isAdmin.value = localStorage.getItem('treehole_is_admin') === 'true'
    loadPosts()
  }
})
</script>

<template>
  <div class="treehole">
    <!-- 登录页 -->
    <div v-if="!isLoggedIn" class="login-page">
      <div class="login-box">
        <h1>🕳️ 树洞空间</h1>
        <p>这里是私密的树洞，输入密码进入</p>
        <div class="input-group">
          <input
            v-model="passwordInput"
            type="password"
            placeholder="请输入密码"
            @keyup.enter="login"
          />
          <button @click="login">进入</button>
        </div>
        <p v-if="error" class="error">{{ error }}</p>
      </div>
    </div>

    <!-- 主页面 -->
    <div v-else class="main-page">
      <header>
        <h1>🕳️ 树洞空间</h1>
        <div class="header-actions">
          <button v-if="isAdmin" @click="showAdmin = !showAdmin" class="admin-btn">
            {{ showAdmin ? '返回' : '管理后台' }}
          </button>
          <button @click="logout" class="logout-btn">退出</button>
        </div>
      </header>

      <!-- 管理后台 -->
      <div v-if="showAdmin && isAdmin" class="admin-panel">
        <h2>管理后台</h2>
        <div class="stats">
          <div class="stat-item">
            <span class="stat-number">{{ stats.total }}</span>
            <span class="stat-label">总帖子</span>
          </div>
          <div class="stat-item">
            <span class="stat-number">{{ stats.visible }}</span>
            <span class="stat-label">显示中</span>
          </div>
          <div class="stat-item">
            <span class="stat-number">{{ stats.hidden }}</span>
            <span class="stat-label">已隐藏</span>
          </div>
        </div>
        <div class="post-list">
          <div v-for="post in posts" :key="post.id" class="post-item admin">
            <div class="post-content">{{ post.content }}</div>
            <div class="post-meta">
              <span>{{ new Date(post.createdAt).toLocaleString('zh-CN') }}</span>
              <span :class="['status', post.visible ? 'open' : 'closed']">
                {{ post.visible ? '显示' : '已隐藏' }}
              </span>
              <button @click="toggleVisibility(post)" class="toggle-btn">
                {{ post.visible ? '隐藏' : '显示' }}
              </button>
              <button @click="deletePost(post)" class="delete-btn">删除</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 用户界面 -->
      <div v-else>
        <div class="post-form">
          <textarea
            v-model="newPost"
            placeholder="写下你想说的话...（匿名发送）"
            rows="4"
          ></textarea>
          <button @click="submitPost" :disabled="!newPost.trim()">
            匿名发送
          </button>
        </div>

        <div class="post-list">
          <div v-for="post in visiblePosts" :key="post.id" class="post-item">
            <div class="post-content">{{ post.content }}</div>
            <div class="post-meta">
              <span>匿名</span>
              <span>{{ new Date(post.createdAt).toLocaleString('zh-CN') }}</span>
            </div>
          </div>
          <div v-if="visiblePosts.length === 0" class="empty">
            还没有任何帖子，成为第一个发言的人吧~
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.treehole {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  min-height: 100vh;
}

.login-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 80vh;
}

.login-box {
  text-align: center;
  padding: 40px;
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.login-box h1 {
  font-size: 2em;
  margin-bottom: 10px;
}

.login-box p {
  color: var(--vp-c-text-2);
  margin-bottom: 20px;
}

.input-group {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.input-group input {
  padding: 10px 16px;
  border: 1px solid var(--vp-c-border);
  border-radius: 8px;
  font-size: 16px;
  width: 200px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
}

.input-group button {
  padding: 10px 24px;
  background: var(--vp-c-brand-1);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
}

.input-group button:hover {
  background: var(--vp-c-brand-2);
}

.error {
  color: var(--vp-c-danger-1);
  margin-top: 10px;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--vp-c-border);
}

header h1 {
  font-size: 1.8em;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.admin-btn, .logout-btn {
  padding: 8px 16px;
  border: 1px solid var(--vp-c-border);
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
}

.admin-btn:hover, .logout-btn:hover {
  background: var(--vp-c-bg-soft);
}

.post-form {
  margin-bottom: 30px;
}

.post-form textarea {
  width: 100%;
  padding: 16px;
  border: 1px solid var(--vp-c-border);
  border-radius: 8px;
  font-size: 16px;
  resize: vertical;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-family: inherit;
}

.post-form button {
  margin-top: 10px;
  padding: 12px 32px;
  background: var(--vp-c-brand-1);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
}

.post-form button:hover:not(:disabled) {
  background: var(--vp-c-brand-2);
}

.post-form button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loading, .empty {
  text-align: center;
  padding: 40px;
  color: var(--vp-c-text-2);
}

.post-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.post-item {
  padding: 20px;
  background: var(--vp-c-bg-soft);
  border-radius: 8px;
  border-left: 3px solid var(--vp-c-brand-1);
}

.post-item.admin {
  border-left-color: var(--vp-c-warning-1);
}

.post-content {
  font-size: 16px;
  line-height: 1.6;
  margin-bottom: 10px;
  white-space: pre-wrap;
}

.post-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  color: var(--vp-c-text-2);
}

.admin-panel h2 {
  margin-bottom: 20px;
}

.stats {
  display: flex;
  gap: 30px;
  margin-bottom: 30px;
  padding: 20px;
  background: var(--vp-c-bg-soft);
  border-radius: 8px;
}

.stat-item {
  text-align: center;
}

.stat-number {
  display: block;
  font-size: 2em;
  font-weight: bold;
  color: var(--vp-c-brand-1);
}

.stat-label {
  font-size: 14px;
  color: var(--vp-c-text-2);
}

.status {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.status.open {
  background: var(--vp-c-success-1);
  color: white;
}

.status.closed {
  background: var(--vp-c-text-3);
  color: white;
}

.toggle-btn {
  padding: 4px 12px;
  border: 1px solid var(--vp-c-border);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
}

.toggle-btn:hover {
  background: var(--vp-c-brand-1);
  color: white;
  border-color: var(--vp-c-brand-1);
}

.delete-btn {
  padding: 4px 12px;
  border: 1px solid var(--vp-c-border);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
}

.delete-btn:hover {
  background: var(--vp-c-danger-1);
  color: white;
  border-color: var(--vp-c-danger-1);
}
</style>
