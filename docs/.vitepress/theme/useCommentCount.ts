import { ref } from 'vue'

// 由 Comments.vue 监听 giscus 的 message 事件写入，
// 由 PostMeta.vue 读取用于展示评论数。路径变化时由 Comments.vue 重置为 null。
export const commentCount = ref<number | null>(null)
