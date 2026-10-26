export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error('ไม่พบ element #' + id);
  return el as T;
}

type Child = Node | string | null | undefined | false;

/** สร้าง element โดยใส่ข้อความผ่าน textContent เสมอ (กัน XSS จากชื่อที่ผู้ใช้พิมพ์เอง) */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (name === 'class') el.className = String(value);
    else el.setAttribute(name, value === true ? '' : value);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}

export function show(el: HTMLElement, visible: boolean, display = 'block'): void {
  el.style.display = visible ? display : 'none';
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
