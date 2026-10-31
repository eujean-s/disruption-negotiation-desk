<script setup>
import { ref } from 'vue'

const result = ref('')
const loading = ref(false)

async function testAgent() {
  loading.value = true
  result.value = ''
  try {
    const res = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: 'You are a test assistant. Reply in one short sentence.',
        messages: [{ role: 'user', content: 'Say hello and confirm you are working.' }],
      }),
    })
    const data = await res.json()
    result.value = data.text || data.error
  } catch (e) {
    result.value = 'Request failed: ' + e.message
  }
  loading.value = false
}
</script>

<template>
  <div class="container py-5">
    <h1 class="mb-3">Agent test</h1>
    <button class="btn btn-primary" :disabled="loading" @click="testAgent">
      {{ loading ? 'Calling Claude...' : 'Test agent' }}
    </button>
    <div v-if="result" class="card mt-4">
      <div class="card-body" style="white-space: pre-wrap">{{ result }}</div>
    </div>
  </div>
</template>