/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

const page = (file: string) => fileURLToPath(new URL(file, import.meta.url));

const REQUIRED_ENV = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];

// multi-page: / = ลงทะเบียน, /admin.html = แอดมิน, /display.html = จอแสดงผล
export default defineConfig(({ command, mode }) => {
  // ค่า VITE_* ถูกฝังตอน build ถ้าลืมตั้งบน Cloudflare ให้ build ล้มเลย ดีกว่าได้เว็บที่ใช้ไม่ได้
  if (command === 'build') {
    const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
    const missing = REQUIRED_ENV.filter((name) => !env[name]);
    if (missing.length > 0) {
      throw new Error(`ยังไม่ได้ตั้งค่า ${missing.join(', ')} (ตั้งเป็น build variables หรือใน .env.production.local)`);
    }
  }

  return {
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
  };
});
