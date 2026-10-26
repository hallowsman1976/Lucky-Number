import '../styles/stage.css';
import './admin.css';
import { api, type Result } from '../lib/api';
import { downloadCsv, toCsv } from '../lib/csv';
import { $, h } from '../lib/dom';
import { toThaiMessage } from '../lib/errors';
import { currentSiteUrls } from '../lib/format';
import { watchTables } from '../lib/live';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import type { AdminRegistration, AdminState, DisplayMode, EventInfo, RoundInfo } from '../lib/types';
import {
  STATUS_LABEL,
  computeStats,
  registrationStatus,
  registrationsCsvRows,
  roundWinners,
  searchRegistrations,
  winnersCsvRows,
} from './model';

const MAX_ROWS = 100;
const NOT_ADMIN = 'ไม่มีสิทธิ์ใช้งานส่วนนี้';

let state: AdminState | null = null;
let stopWatching: (() => void) | null = null;
let busy = false;
/** แอดมินกำลังพิมพ์แก้รอบอยู่ — ไม่เอาค่าจาก refresh ไปทับ */
let editRoundDirty = false;
let editRoundId: string | null = null;

// ===== Session =====

function showLogin(): void {
  stopWatching?.();
  stopWatching = null;
  state = null;
  $('dashboard').hidden = true;
  $('loginView').hidden = false;
}

async function enterDashboard(email: string | undefined): Promise<void> {
  const res = await api.getAdminState();
  if (!res.ok) {
    if (res.message.startsWith(NOT_ADMIN)) {
      await supabase.auth.signOut();
      toast('บัญชีนี้ไม่มีสิทธิ์แอดมิน', 'error');
    } else {
      toast(res.message, 'error');
    }
    showLogin();
    return;
  }

  state = res.data;
  $('loginView').hidden = true;
  $('dashboard').hidden = false;
  $('userEmail').textContent = email ?? '';
  render();

  stopWatching?.();
  stopWatching = watchTables({
    channel: 'admin',
    tables: ['events', 'rounds', 'winners', 'registrations'],
    fallbackMs: 15_000,
    throttleMs: 500,
    refresh,
  });
}

async function refresh(): Promise<void> {
  const res = await api.getAdminState();
  if (!res.ok) {
    toast(res.message, 'error');
    return;
  }
  state = res.data;
  render();
}

/** ทำรายการทีละอย่าง (กันกดซ้ำ) แล้ว refresh */
async function run<T>(action: () => Promise<Result<T>>, success?: (data: T) => string): Promise<Result<T>> {
  if (busy) return { ok: false, message: 'กำลังทำรายการก่อนหน้า' };
  busy = true;
  $('dashboard').classList.add('busy');
  try {
    const res = await action();
    if (!res.ok) toast(res.message, 'error');
    else {
      if (success) toast(success(res.data), 'success');
      await refresh();
    }
    return res;
  } finally {
    busy = false;
    $('dashboard').classList.remove('busy');
  }
}

// ===== Render =====

function render(): void {
  if (!state) return;
  const hasEvent = state.event !== null;
  $('noEventPanel').hidden = hasEvent;
  $('eventPanels').hidden = !hasEvent;
  if (!state.event) {
    $('eventTitleHeader').textContent = 'ยังไม่มีงาน';
    return;
  }

  $('eventTitleHeader').textContent = state.event.title;
  renderOverview(state.event, state.registrations);
  renderLinks();
  renderRound(state.current_round, state.registrations);
  renderPeople(state.registrations);
}

function renderOverview(event: EventInfo, registrations: readonly AdminRegistration[]): void {
  const stats = computeStats(registrations);
  $('statTotal').textContent = String(stats.total);
  $('statEligible').textContent = String(stats.eligible);
  $('statWinner').textContent = String(stats.winner);
  $('statForfeited').textContent = String(stats.forfeited);
  $('statDisqualified').textContent = String(stats.disqualified);

  const badge = $('registrationBadge');
  badge.textContent = event.registration_open ? 'เปิดอยู่' : 'ปิดแล้ว';
  badge.className = 'badge ' + (event.registration_open ? 'on' : 'off');
  $('toggleRegistrationBtn').textContent = event.registration_open ? 'ปิดรับลงทะเบียน' : 'เปิดรับลงทะเบียน';

  $('btnModeRegister').classList.toggle('active', event.display_mode === 'register');
  $('btnModeWheel').classList.toggle('active', event.display_mode === 'wheel');
}

function renderLinks(): void {
  const urls = currentSiteUrls();
  $('regUrlLine').textContent = urls.register;
  $('displayUrlLine').textContent = urls.display;
  $<HTMLAnchorElement>('openDisplayLink').href = urls.display;
}

function renderRound(round: RoundInfo | null, registrations: readonly AdminRegistration[]): void {
  const complete = round !== null && round.filled >= round.target;
  const eligible = computeStats(registrations).eligible;

  $('roundBadge').textContent = round
    ? `รอบที่ ${round.seq}: ${round.name} (${round.filled}/${round.target})${complete ? ' ✓ ครบแล้ว' : ''}`
    : 'ยังไม่ได้เริ่มรอบ';

  const editForm = $('editRoundForm');
  editForm.hidden = round === null;
  if (round && (round.id !== editRoundId || !editRoundDirty)) {
    editRoundId = round.id;
    editRoundDirty = false;
    $<HTMLInputElement>('editRoundName').value = round.name;
    $<HTMLInputElement>('editRoundTarget').value = String(round.target);
  }

  const drawBtn = $<HTMLButtonElement>('drawBtn');
  drawBtn.disabled = round === null || complete || eligible === 0;
  drawBtn.textContent = round && !complete && eligible === 0 ? 'ไม่มีผู้มีสิทธิ์เหลือให้สุ่ม' : '🎉 สุ่มผู้โชคดีคนถัดไป';

  const winners = round ? roundWinners(registrations, round.id) : [];
  $('roundWinners').replaceChildren(
    ...(winners.length
      ? winners.map((r) => winnerRow(r, complete))
      : [h('div', { class: 'muted small' }, round ? 'ยังไม่มีผู้โชคดีในรอบนี้' : '-')]),
  );

  const canStart = round === null || complete;
  $<HTMLButtonElement>('startRoundBtn').disabled = !canStart;
  $('newRoundHint').textContent = canStart
    ? `ผู้มีสิทธิ์เหลือ ${eligible} คน`
    : `ต้องสุ่มรอบปัจจุบันให้ครบ หรือแก้จำนวนที่ต้องการให้เท่ากับที่ได้ (${round?.filled ?? 0} คน) ก่อนเริ่มรอบใหม่`;
}

function winnerRow(r: AdminRegistration, roundComplete: boolean): HTMLElement {
  const forfeited = Boolean(r.winner?.forfeited_at);
  const btn = h(
    'button',
    { class: 'btn btn-muted small-btn', type: 'button', disabled: forfeited && roundComplete },
    forfeited ? 'ยกเลิกการสละสิทธิ์' : 'สละสิทธิ์',
  );
  if (forfeited && roundComplete) btn.title = 'สุ่มคนแทนไปแล้ว ยกเลิกการสละสิทธิ์ไม่ได้';
  btn.addEventListener('click', () => {
    const winnerId = r.winner!.id;
    if (forfeited) {
      void run(() => api.undoForfeit(winnerId), () => `${r.full_name} กลับมาเป็นผู้โชคดีแล้ว`);
    } else if (confirm(`ยืนยันว่า ${r.full_name} สละสิทธิ์?\nจากนั้นสุ่มคนแทนในรอบนี้ได้`)) {
      void run(() => api.forfeitWinner(winnerId), () => `${r.full_name} สละสิทธิ์แล้ว สุ่มคนแทนได้เลย`);
    }
  });
  return h(
    'div',
    { class: 'wr' + (forfeited ? ' forfeited' : '') },
    h('span', { class: 'wr-name' }, `${r.full_name} — ${r.unit} (${r.member_id})${forfeited ? ' • สละสิทธิ์' : ''}`),
    btn,
  );
}

function renderPeople(registrations: readonly AdminRegistration[]): void {
  const query = $<HTMLInputElement>('searchInput').value;
  const matched = searchRegistrations(registrations, query).reverse();
  const shown = matched.slice(0, MAX_ROWS);

  $('peopleBody').replaceChildren(
    ...(shown.length
      ? shown.map(personRow)
      : [h('tr', {}, h('td', { colspan: '5', class: 'muted' }, 'ไม่พบข้อมูล'))]),
  );
  $('peopleNote').textContent =
    matched.length > MAX_ROWS ? `แสดง ${MAX_ROWS} รายการล่าสุดจาก ${matched.length} รายการ พิมพ์ค้นหาเพื่อดูคนอื่น` : '';
}

function personRow(r: AdminRegistration): HTMLElement {
  const status = registrationStatus(r);
  let action: HTMLElement | null = null;
  if (status === 'eligible') {
    action = h('button', { class: 'btn btn-danger small-btn', type: 'button' }, 'ตัดสิทธิ์');
    action.addEventListener('click', () => {
      if (!confirm(`ตัดสิทธิ์ ${r.full_name} (เลขสมาชิก ${r.member_id})?\nคนนี้จะไม่ถูกสุ่มจนกว่าจะคืนสิทธิ์`)) return;
      void run(() => api.disqualify(r.id), () => `ตัดสิทธิ์ ${r.full_name} แล้ว`);
    });
  } else if (status === 'disqualified') {
    action = h('button', { class: 'btn btn-muted small-btn', type: 'button' }, 'คืนสิทธิ์');
    action.addEventListener('click', () => void run(() => api.requalify(r.id), () => `คืนสิทธิ์ ${r.full_name} แล้ว`));
  }

  const statusText = r.winner ? `${STATUS_LABEL[status]} (${r.winner.round_name})` : STATUS_LABEL[status];
  return h(
    'tr',
    {},
    h('td', {}, r.member_id),
    h('td', {}, r.full_name),
    h('td', {}, r.unit),
    h('td', {}, h('span', { class: `tag tag-${status}` }, statusText)),
    h('td', {}, action),
  );
}

// ===== Actions =====

function readTarget(id: string): number {
  return Number.parseInt($<HTMLInputElement>(id).value, 10);
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function setDisplayMode(mode: DisplayMode): void {
  void run(
    () => api.setDisplayMode(mode),
    () => (mode === 'wheel' ? '🎡 จอแสดงผลเปลี่ยนเป็นโหมดวงล้อแล้ว' : '📋 จอแสดงผลเปลี่ยนเป็นโหมดลงทะเบียนแล้ว'),
  );
}

function createEvent(input: HTMLInputElement, confirmFirst: boolean): void {
  const title = input.value.trim();
  if (!title) return toast('กรุณาตั้งชื่องาน', 'error');
  if (confirmFirst) {
    if (!confirm(`เริ่มงานใหม่ "${title}"?\nงานปัจจุบันจะถูกปิด และเริ่มนับผู้ลงทะเบียน/ผู้โชคดีใหม่`)) return;
    if (!confirm('ยืนยันอีกครั้ง — จอแสดงผลและฟอร์มลงทะเบียนจะเปลี่ยนไปใช้งานใหม่ทันที')) return;
  }
  void run(() => api.createEvent(title), () => `เริ่มงาน "${title}" แล้ว`).then((res) => {
    if (res.ok) input.value = '';
  });
}

function wireActions(): void {
  $<HTMLFormElement>('loginView').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $<HTMLButtonElement>('loginBtn');
    btn.disabled = true;
    const { data, error } = await supabase.auth.signInWithPassword({
      email: $<HTMLInputElement>('emailInput').value.trim(),
      password: $<HTMLInputElement>('passwordInput').value,
    });
    btn.disabled = false;
    if (error) return toast(toThaiMessage(error), 'error');
    $<HTMLInputElement>('passwordInput').value = '';
    await enterDashboard(data.user?.email);
  });

  $('logoutBtn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    showLogin();
  });
  $('refreshBtn').addEventListener('click', () => void refresh());

  $<HTMLFormElement>('createFirstEventForm').addEventListener('submit', (e) => {
    e.preventDefault();
    createEvent($<HTMLInputElement>('firstEventTitle'), false);
  });
  $<HTMLFormElement>('newEventForm').addEventListener('submit', (e) => {
    e.preventDefault();
    createEvent($<HTMLInputElement>('newEventTitle'), true);
  });

  $('toggleRegistrationBtn').addEventListener('click', () => {
    if (!state?.event) return;
    const open = !state.event.registration_open;
    if (!open && !confirm('ปิดรับลงทะเบียน? คนที่สแกน QR หลังจากนี้จะลงทะเบียนไม่ได้')) return;
    void run(() => api.setRegistrationOpen(open), () => (open ? 'เปิดรับลงทะเบียนแล้ว' : 'ปิดรับลงทะเบียนแล้ว'));
  });
  $('btnModeRegister').addEventListener('click', () => setDisplayMode('register'));
  $('btnModeWheel').addEventListener('click', () => setDisplayMode('wheel'));

  $('editRoundName').addEventListener('input', () => (editRoundDirty = true));
  $('editRoundTarget').addEventListener('input', () => (editRoundDirty = true));
  $<HTMLFormElement>('editRoundForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const round = state?.event ? state.current_round : null;
    if (!round) return;
    const name = $<HTMLInputElement>('editRoundName').value.trim();
    void run(() => api.updateRound(round.id, name, readTarget('editRoundTarget')), () => 'บันทึกการแก้ไขรอบแล้ว').then(
      (res) => {
        if (res.ok) editRoundDirty = false;
      },
    );
  });

  $('drawBtn').addEventListener('click', () => {
    void run(api.drawNext, (d) => `🎉 ผู้โชคดี: ${d.winner.full_name}`);
  });

  $<HTMLFormElement>('startRoundForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const nameInput = $<HTMLInputElement>('roundNameInput');
    const targetInput = $<HTMLInputElement>('roundTargetInput');
    const name = nameInput.value.trim();
    void run(() => api.startRound(name, readTarget('roundTargetInput')), (r) => `เริ่มรอบ "${r.name}" แล้ว`).then((res) => {
      if (!res.ok) return;
      nameInput.value = '';
      targetInput.value = '';
    });
  });

  $('searchInput').addEventListener('input', () => {
    if (state?.event) renderPeople(state.registrations);
  });

  $('exportRegistrationsBtn').addEventListener('click', () => {
    if (!state?.event) return;
    downloadCsv(`registrations-${stamp()}.csv`, toCsv(registrationsCsvRows(state.registrations)));
  });
  $('exportWinnersBtn').addEventListener('click', () => {
    if (!state?.event) return;
    downloadCsv(`winners-${stamp()}.csv`, toCsv(winnersCsvRows(state.registrations, state.rounds)));
  });
}

// ===== Boot =====

wireActions();
supabase.auth.onAuthStateChange((event) => {
  // เช่น refresh token หมดอายุ — ห้ามเรียก supabase ต่อใน callback นี้ตรง ๆ
  if (event === 'SIGNED_OUT') setTimeout(showLogin, 0);
});
void supabase.auth.getSession().then(({ data }) => {
  if (data.session) void enterDashboard(data.session.user.email);
  else showLogin();
});
