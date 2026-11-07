import './register.css';
import { api } from '../lib/api';
import { $, h } from '../lib/dom';
import { alertError, alertWarning } from '../lib/alert';

const form = $<HTMLFormElement>('formView');
const memberIdInput = $<HTMLInputElement>('memberId');
const fullNameInput = $<HTMLInputElement>('fullName');
const unitSelect = $<HTMLSelectElement>('unit');
const submitBtn = $<HTMLButtonElement>('submitBtn');

function showView(view: 'form' | 'success' | 'closed'): void {
  form.hidden = view !== 'form';
  $('successView').hidden = view !== 'success';
  $('closedView').hidden = view !== 'closed';
}

function showClosed(title: string, text: string): void {
  $('closedTitle').textContent = title;
  $('closedText').textContent = text;
  showView('closed');
}

function setSubmitting(submitting: boolean): void {
  submitBtn.disabled = submitting;
  submitBtn.replaceChildren(
    submitting ? h('span', { class: 'btn-spinner' }) : h('i', { class: 'ph ph-ticket' }),
    h('span', {}, submitting ? 'กำลังบันทึก...' : 'ลงทะเบียน'),
  );
}

async function init(): Promise<void> {
  const res = await api.getRegistrationForm();
  if (!res.ok) {
    $('eventTitle').textContent = 'โหลดข้อมูลไม่สำเร็จ';
    void alertError(res.message, 'โหลดข้อมูลไม่สำเร็จ');
    return;
  }

  const { event, units } = res.data;
  if (!event) {
    $('eventTitle').textContent = 'ระบบจับรางวัลผู้โชคดี';
    showClosed('ยังไม่เปิดงาน', 'กรุณาลองใหม่อีกครั้งเมื่อถึงเวลางาน');
    return;
  }

  $('eventTitle').textContent = event.title;
  document.title = 'ลงทะเบียน - ' + event.title;
  if (!event.registration_open) {
    showClosed('ปิดรับลงทะเบียนแล้ว', 'ขออภัย ขณะนี้ไม่ได้เปิดรับลงทะเบียน');
    return;
  }

  unitSelect.append(...units.map((u) => h('option', { value: String(u.id) }, u.name)));
  showView('form');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const memberId = memberIdInput.value.replace(/\s/g, '');
  const fullName = fullNameInput.value.trim();
  const unitId = Number(unitSelect.value);

  if (!memberId) return alertWarning('กรุณากรอกเลขสมาชิก', memberIdInput);
  if (!/^[0-9]+$/.test(memberId)) return alertWarning('เลขสมาชิกต้องเป็นตัวเลขเท่านั้น', memberIdInput);
  if (!fullName) return alertWarning('กรุณากรอกชื่อ-นามสกุล', fullNameInput);
  if (!unitId) return alertWarning('กรุณาเลือกหน่วยงาน', unitSelect);

  setSubmitting(true);
  const res = await api.register(memberId, fullName, unitId);
  if (res.ok) {
    showView('success');
    return;
  }
  setSubmitting(false);
  void alertError(res.message, 'ลงทะเบียนไม่สำเร็จ');
});

void init();
