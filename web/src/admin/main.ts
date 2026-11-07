import '../styles/stage.css';
import './admin.css';
import { api, type Result } from '../lib/api';
import { downloadCsv, toCsv } from '../lib/csv';
import { $, h } from '../lib/dom';
import { toThaiMessage } from '../lib/errors';
import { currentSiteUrls } from '../lib/format';
import { watchTables } from '../lib/live';
import { supabase } from '../lib/supabase';
import { alertError, alertWarning, confirmAction, toast } from '../lib/alert';
import type { AdminRegistration, AdminState, DisplayMode, EventInfo, RoundInfo } from '../lib/types';
import {
  STATUS_LABEL,
  clampDrawCount,
  computeStats,
  drawLimit,
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
/** ช่องจำนวนที่จะสุ่มกลับเป็น 1 ทุกครั้งที่เริ่มรอบใหม่ */
let drawCountRoundId: string | null = null;

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
      void alertError('บัญชีนี้ไม่มีสิทธิ์แอดมิน', 'เข้าสู่ระบบไม่สำเร็จ');
    } else {
      void alertError(res.message, 'โหลดข้อมูลไม่สำเร็จ');
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
    if (!res.ok) void alertError(res.message);
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

  const countInput = $<HTMLInputElement>('drawCountInput');
  if (round && round.id !== drawCountRoundId) {
    drawCountRoundId = round.id;
    countInput.value = '1';
  }
  const limit = drawLimit(round, eligible);
  countInput.max = String(Math.max(1, limit));
  // ไม่ทับค่าที่แอดมินกำลังพิมพ์อยู่ (ตอนกดสุ่มจะปรับให้อยู่ในช่วงอีกที)
  if (document.activeElement !== countInput) countInput.value = String(clampDrawCount(readTarget('drawCountInput'), limit));
  for (const id of ['drawCountInput', 'drawOneBtn', 'drawAllBtn']) $<HTMLInputElement>(id).disabled = limit === 0;
  $('drawHint').textContent = round && !complete ? `รอบนี้ยังขาดอีก ${round.target - round.filled} คน` : '';
  renderDrawButton();

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

function currentDrawLimit(): number {
  if (!state?.event) return 0;
  return drawLimit(state.current_round, computeStats(state.registrations).eligible);
}

function renderDrawButton(): void {
  const round = state?.event ? state.current_round : null;
  const limit = currentDrawLimit();
  const count = clampDrawCount(readTarget('drawCountInput'), limit);
  const drawBtn = $<HTMLButtonElement>('drawBtn');
  drawBtn.disabled = limit === 0;
  if (round && round.filled < round.target && limit === 0) drawBtn.textContent = 'ไม่มีผู้มีสิทธิ์เหลือให้สุ่ม';
  else drawBtn.textContent = count > 1 ? `🎉 สุ่มผู้โชคดีพร้อมกัน ${count} คน` : '🎉 สุ่มผู้โชคดีคนถัดไป';
}

function setDrawCount(count: number): void {
  $<HTMLInputElement>('drawCountInput').value = String(clampDrawCount(count, currentDrawLimit()));
  renderDrawButton();
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
    } else {
      void confirmAction({
        title: `${r.full_name} สละสิทธิ์?`,
        text: 'จากนั้นสุ่มคนแทนในรอบนี้ได้',
        confirmText: 'สละสิทธิ์',
        danger: true,
      }).then((ok) => {
        if (ok) void run(() => api.forfeitWinner(winnerId), () => `${r.full_name} สละสิทธิ์แล้ว สุ่มคนแทนได้เลย`);
      });
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
    action.addEventListener('click', async () => {
      const ok = await confirmAction({
        title: `ตัดสิทธิ์ ${r.full_name}?`,
        text: `เลขสมาชิก ${r.member_id}\nคนนี้จะไม่ถูกสุ่มจนกว่าจะคืนสิทธิ์`,
        confirmText: 'ตัดสิทธิ์',
        danger: true,
      });
      if (!ok) return;
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

async function createEvent(input: HTMLInputElement, confirmFirst: boolean): Promise<void> {
  const title = input.value.trim();
  if (!title) return alertWarning('กรุณาตั้งชื่องาน', input);
  if (confirmFirst) {
    const first = await confirmAction({
      title: `เริ่มงานใหม่ "${title}"?`,
      text: 'งานปัจจุบันจะถูกปิด และเริ่มนับผู้ลงทะเบียน/ผู้โชคดีใหม่',
      confirmText: 'ถัดไป',
      danger: true,
    });
    if (!first) return;
    const second = await confirmAction({
      title: 'ยืนยันอีกครั้ง',
      text: 'จอแสดงผลและฟอร์มลงทะเบียนจะเปลี่ยนไปใช้งานใหม่ทันที',
      confirmText: 'เริ่มงานใหม่',
      danger: true,
    });
    if (!second) return;
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
    if (error) return alertError(toThaiMessage(error), 'เข้าสู่ระบบไม่สำเร็จ');
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
    void createEvent($<HTMLInputElement>('firstEventTitle'), false);
  });
  $<HTMLFormElement>('newEventForm').addEventListener('submit', (e) => {
    e.preventDefault();
    void createEvent($<HTMLInputElement>('newEventTitle'), true);
  });

  $('toggleRegistrationBtn').addEventListener('click', async () => {
    if (!state?.event) return;
    const open = !state.event.registration_open;
    if (
      !open &&
      !(await confirmAction({
        title: 'ปิดรับลงทะเบียน?',
        text: 'คนที่สแกน QR หลังจากนี้จะลงทะเบียนไม่ได้',
        confirmText: 'ปิดรับลงทะเบียน',
        danger: true,
      }))
    )
      return;
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

  $('drawCountInput').addEventListener('input', renderDrawButton);
  $('drawCountInput').addEventListener('change', () => setDrawCount(readTarget('drawCountInput')));
  $('drawOneBtn').addEventListener('click', () => setDrawCount(1));
  $('drawAllBtn').addEventListener('click', () => setDrawCount(currentDrawLimit()));
  $('drawBtn').addEventListener('click', async () => {
    const count = clampDrawCount(readTarget('drawCountInput'), currentDrawLimit());
    if (
      count > 1 &&
      !(await confirmAction({
        title: `สุ่มผู้โชคดีพร้อมกัน ${count} คน?`,
        text: `จอแสดงผลจะเปิดชื่อทั้ง ${count} คนพร้อมกัน`,
        confirmText: `🎉 สุ่ม ${count} คน`,
      }))
    )
      return;
    void run(
      () => api.drawMany(count),
      (d) => (d.winners.length === 1 ? `🎉 ผู้โชคดี: ${d.winners[0]?.full_name}` : `🎉 ได้ผู้โชคดี ${d.winners.length} คน`),
    );
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
