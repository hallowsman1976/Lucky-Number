export type ToastType = 'success' | 'error' | 'info';

/** หน้าที่ใช้ต้องมี style ของ .toast / .toast-success / .toast-error / .toast-info */
export function toast(message: string, type: ToastType = 'info'): void {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.classList.add('toast-leaving'), 2600);
  setTimeout(() => el.remove(), 3000);
}
