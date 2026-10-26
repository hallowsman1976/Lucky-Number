/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const page = (file: string) => fileURLToPath(new URL(file, import.meta.url));

// multi-page: / = ลงทะเบียน, /admin.html = แอดมิน, /display.html = จอแสดงผล
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        register: page('./index.html'),
        admin: page('./admin.html'),
        display: page('./display.html'),
      },
    },
  },
  test: {
    environment: 'node',
  },
});
