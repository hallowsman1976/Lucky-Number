import { supabase } from './supabase';

export interface WatchOptions {
  channel: string;
  tables: readonly string[];
  refresh: () => Promise<void>;
  /** ดึงข้อมูลใหม่เป็นระยะเผื่อ websocket หลุด */
  fallbackMs: number;
  /** รวมการเปลี่ยนแปลงที่มาติด ๆ กันเป็นการ refresh ครั้งเดียว */
  throttleMs?: number;
}

/**
 * ฟัง Realtime ของตารางที่ระบุ แล้วเรียก refresh() (ไม่ใช้ payload ของ event เลย
 * เพราะ state จริงมาจาก get_*_state() ซึ่งผ่านการตรวจสิทธิ์/ปิดบังข้อมูลแล้ว)
 */
export function watchTables(opts: WatchOptions): () => void {
  let running = false;
  let rerun = false;
  let pending: number | undefined;

  const run = async (): Promise<void> => {
    if (running) {
      rerun = true;
      return;
    }
    running = true;
    try {
      await opts.refresh();
    } finally {
      running = false;
      if (rerun) {
        rerun = false;
        void run();
      }
    }
  };

  const schedule = (): void => {
    if (pending !== undefined) return;
    pending = window.setTimeout(() => {
      pending = undefined;
      void run();
    }, opts.throttleMs ?? 300);
  };

  let channel = supabase.channel(opts.channel);
  for (const table of opts.tables) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, schedule);
  }
  channel.subscribe((status) => {
    // ต่อติด (หรือต่อใหม่หลังหลุด) แล้วดึง state ล่าสุดเลย
    if (status === 'SUBSCRIBED') schedule();
  });

  const interval = window.setInterval(() => void run(), opts.fallbackMs);
  const onVisible = (): void => {
    if (document.visibilityState === 'visible') schedule();
  };
  document.addEventListener('visibilitychange', onVisible);

  void run();

  return () => {
    window.clearInterval(interval);
    window.clearTimeout(pending);
    document.removeEventListener('visibilitychange', onVisible);
    void supabase.removeChannel(channel);
  };
}
