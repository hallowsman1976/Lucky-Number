// ตัว sweetalert2 ใส่ CSS ของตัวเองให้แล้ว ไฟล์นี้แค่ปรับสีตามธีมของหน้า
import Swal from 'sweetalert2';
import './alert.css';

export type ToastType = 'success' | 'error' | 'info';

const toastPopup = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true,
  didOpen: (el) => {
    el.addEventListener('mouseenter', () => Swal.stopTimer());
    el.addEventListener('mouseleave', () => Swal.resumeTimer());
  },
});

/**
 * มีกล่องยืนยัน/แจ้งเตือนเปิดค้างให้ผู้ใช้ตอบอยู่ (SweetAlert เปิดได้ทีละกล่อง เปิดใหม่จะปิดกล่องเดิม)
 * กล่องที่เพิ่งกดตอบและกำลังเล่นแอนิเมชันปิด (swal2-hide) ไม่นับ
 */
function modalOpen(): boolean {
  const popup = Swal.getPopup();
  return (
    Swal.isVisible() &&
    !!popup &&
    !popup.classList.contains('swal2-toast') &&
    !popup.classList.contains('swal2-hide')
  );
}

/**
 * แจ้งสั้น ๆ มุมจอแล้วหายเอง
 * ถ้ามีกล่องยืนยันเปิดอยู่จะไม่แสดง เพื่อไม่ให้ปิดกล่องที่ผู้ใช้กำลังตอบ
 */
export function toast(message: string, type: ToastType = 'info'): void {
  if (modalOpen()) return;
  void toastPopup.fire({ icon: type, title: message });
}

/** กล่องแจ้งข้อผิดพลาดที่ต้องกด "ตกลง" แล้วโฟกัสช่องที่ต้องแก้ (ถ้ามี) */
export async function alertError(message: string, title = 'ทำรายการไม่สำเร็จ', focus?: HTMLElement): Promise<void> {
  await Swal.fire({
    icon: 'error',
    title,
    text: message,
    confirmButtonText: 'ตกลง',
    returnFocus: !focus,
  });
  focus?.focus();
}

/** แจ้งให้กรอกข้อมูลให้ครบ แล้วโฟกัสช่องนั้น */
export async function alertWarning(message: string, focus?: HTMLElement): Promise<void> {
  await Swal.fire({
    icon: 'warning',
    title: message,
    confirmButtonText: 'ตกลง',
    returnFocus: !focus,
  });
  focus?.focus();
}

export interface ConfirmOptions {
  title: string;
  text?: string;
  confirmText?: string;
  /** ปุ่มยืนยันสีแดง สำหรับการกระทำที่ย้อนกลับยาก */
  danger?: boolean;
  icon?: 'warning' | 'question';
}

/** ถามยืนยันก่อนทำรายการ คืน true เมื่อกดยืนยัน */
export async function confirmAction(opts: ConfirmOptions): Promise<boolean> {
  const res = await Swal.fire({
    icon: opts.icon ?? (opts.danger ? 'warning' : 'question'),
    title: opts.title,
    text: opts.text,
    showCancelButton: true,
    confirmButtonText: opts.confirmText ?? 'ยืนยัน',
    cancelButtonText: 'ยกเลิก',
    reverseButtons: true,
    focusCancel: Boolean(opts.danger),
    customClass: opts.danger ? { confirmButton: 'is-danger' } : {},
  });
  return res.isConfirmed;
}
