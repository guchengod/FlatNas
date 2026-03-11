<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useMainStore } from "../stores/main";
import type { MarketplaceItem } from "@/types";

defineProps<{ show: boolean }>();
const emit = defineEmits(["update:show"]);
const store = useMainStore();

const close = () => emit("update:show", false);

// 默认商城地址
const defaultUrl = "http://qdnas.icu:23111/";
const marketplaceUrl = computed(() => store.appConfig.marketplaceListUrl || defaultUrl);
const iframeRef = ref<HTMLIFrameElement | null>(null);

const onIframeLoad = () => {
  if (iframeRef.value?.contentWindow) {
    const info = {
      type: "FLATNAS_INFO",
      payload: {
        origin: window.location.origin,
        apiBase: "/api",
        version: store.currentVersion || "unknown",
      },
    };
    iframeRef.value.contentWindow.postMessage(info, "*");
  }
};

const handleMessage = async (event: MessageEvent) => {
  // 1. Check origin
  try {
    const allowedOrigin = new URL(marketplaceUrl.value).origin;
    if (event.origin !== allowedOrigin) return;
  } catch {
    // marketplaceUrl might be invalid
    return;
  }

  // 2. Parse data
  const { type, payload } = event.data;
  if (type !== 'INSTALL_COMPONENT' || !payload) return;

  const item = payload as MarketplaceItem;
  console.log("Received component install request:", item);

  // 3. JS Disclaimer check
  if (item.js && !store.appConfig.customJsDisclaimerAgreed) {
    if (!confirm(`组件 "${item.name}" 包含自定义 JavaScript 脚本。\n自定义脚本具有较高权限，可能存在安全风险。\n\n请确认您信任该组件来源。是否同意并在本地启用？`)) {
      return;
    }
    store.appConfig.customJsDisclaimerAgreed = true;
  }

  // 4. Apply
  try {
    store.applyMarketplaceItem(item);
    // 5. Feedback
    alert(`组件 "${item.name}" 已安装成功！`);
    
    // Optional: Send success message back to iframe
    if (event.source) {
      (event.source as Window).postMessage({ type: 'INSTALL_SUCCESS', id: item.id }, event.origin);
    }
  } catch (e) {
    console.error(e);
    alert(`组件安装失败: ${e instanceof Error ? e.message : String(e)}`);
  }
};

onMounted(() => {
  window.addEventListener("message", handleMessage);
});

onUnmounted(() => {
  window.removeEventListener("message", handleMessage);
});

</script>

<template>
  <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-8">
    <div class="bg-white w-full h-full max-w-5xl max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      <!-- Header -->
      <div class="flex justify-between items-center px-4 py-3 border-b border-gray-100 bg-gray-50/50">
        <h3 class="text-base font-bold text-gray-800 flex items-center gap-2">
          <span class="text-lg">🛒</span> 组件商城
        </h3>
        <div class="flex items-center gap-4">
            <a :href="marketplaceUrl" target="_blank" class="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1">
                <span>在新窗口打开</span>
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
            </a>
            <button @click="close" class="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
            </button>
        </div>
      </div>
      
      <!-- Content -->
      <div class="flex-1 bg-gray-50 relative">
        <iframe 
          ref="iframeRef"
          :src="marketplaceUrl" 
          @load="onIframeLoad"
          class="w-full h-full border-0"
          allowfullscreen
          allow="clipboard-write"
        ></iframe>
      </div>
    </div>
  </div>
</template>
