import './register.css';
import { api } from '../lib/api';
import { $, h } from '../lib/dom';
import { toast } from '../lib/toast';

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
    toast(res.message, 'error');
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

  if (!memberId) return toast('กรุณากรอกเลขสมาชิก', 'error');
  if (!/^[0-9]+$/.test(memberId)) return toast('เลขสมาชิกต้องเป็นตัวเลขเท่านั้น', 'error');
  if (!fullName) return toast('กรุณากรอกชื่อ-นามสกุล', 'error');
  if (!unitId) return toast('กรุณาเลือกหน่วยงาน', 'error');

  setSubmitting(true);
  const res = await api.register(memberId, fullName, unitId);
  if (res.ok) {
    showView('success');
    return;
  }
  setSubmitting(false);
  toast(res.message, 'error');
});

void init();
