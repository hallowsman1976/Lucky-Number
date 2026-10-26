import '../styles/stage.css';
import './display.css';
import QRCode from 'qrcode';
import { api } from '../lib/api';
import { $, h, sleep } from '../lib/dom';
import { currentSiteUrls } from '../lib/format';
import { watchTables } from '../lib/live';
import type { DisplayMode, DisplayState, DisplayWinner } from '../lib/types';
import { takeNewWinners } from './reveal';

const seen = new Set<string>();
/** ผู้โชคดีที่รอเปิดชื่อ — ซ่อนจากรายชื่อด้านล่างจนกว่าจะเปิดชื่อเสร็จ */
const pending = new Set<string>();
const queue: DisplayWinner[] = [];
let lastState: DisplayState | null = null;
let currentEventId: string | null = null;
let primed = false;
let revealing = false;
let qrUrl = '';

function setMode(mode: DisplayMode | 'none'): void {
  $('noEventPanel').hidden = mode !== 'none';
  $('registerPanel').hidden = mode !== 'register';
  $('wheelPanel').hidden = mode !== 'wheel';
}

async function renderQr(url: string): Promise<void> {
  if (qrUrl === url) return;
  qrUrl = url;
  $<HTMLImageElement>('qrImg').src = await QRCode.toDataURL(url, { width: 680, margin: 1, errorCorrectionLevel: 'M' });
}

function renderWinners(winners: readonly DisplayWinner[]): void {
  const rows = winners
    .filter((w) => !w.forfeited && !pending.has(w.id))
    .slice(0, 100)
    .map((w) =>
      h(
        'div',
        { class: 'winner-row' },
        h(
          'div',
          {},
          h('div', { class: 'wname' }, w.full_name),
          h('div', { class: 'wunit' }, `${w.unit} • เลขสมาชิก ${w.member_id_masked}`),
        ),
        h('div', { class: 'wround' }, w.round_name),
      ),
    );
  $('winnersList').replaceChildren(...rows);
}

function render(state: DisplayState): void {
  lastState = state;
  if (!state.event) {
    $('eventTitle').textContent = 'ระบบจับรางวัลผู้โชคดี';
    setMode('none');
    return;
  }

  const event = state.event;
  $('eventTitle').textContent = event.title;
  if (event.id !== currentEventId) {
    currentEventId = event.id;
    primed = false;
    seen.clear();
  }
  setMode(event.display_mode);

  // โหมดลงทะเบียน
  const url = currentSiteUrls().register;
  void renderQr(url);
  $('regUrl').textContent = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  $('qrBox').hidden = !event.registration_open;
  $('regUrl').hidden = !event.registration_open;
  $('registerHint').hidden = !event.registration_open;
  $('closedNotice').hidden = event.registration_open;
  $('totalCount').textContent = state.total_registrations.toLocaleString('th-TH');

  // โหมดวงล้อ
  const round = state.current_round;
  $('roundName').textContent = round ? `รอบที่ ${round.seq}: ${round.name}` : 'ยังไม่ได้เริ่มรอบ';
  $('progressText').textContent = round ? `${round.filled} / ${round.target}` : '';

  // ผู้โชคดีที่มีอยู่ตอนเปิดจอครั้งแรก หรือที่ถูกสุ่มตอนอยู่โหมดลงทะเบียน จะไม่ถูกเปิดชื่อย้อนหลัง
  const fresh = takeNewWinners(seen, state.winners);
  if (primed && event.display_mode === 'wheel') {
    for (const w of fresh) pending.add(w.id);
    queue.push(...fresh);
  }
  primed = true;
  renderWinners(state.winners);
  void processQueue();
}

async function processQueue(): Promise<void> {
  if (revealing) return;
  revealing = true;
  try {
    for (let next = queue.shift(); next; next = queue.shift()) {
      await spinAndReveal(next);
      pending.delete(next.id);
      if (lastState?.event) renderWinners(lastState.winners);
    }
  } finally {
    revealing = false;
  }
}

async function spinAndReveal(winner: DisplayWinner): Promise<void> {
  const wheel = $('wheel');
  const slot = $('slotDisplay');
  slot.classList.remove('revealed');
  wheel.classList.add('spinning');

  // รายชื่อที่หมุนเป็นแค่ effect — ผลจริงตัดสินแล้วที่ draw_next()
  const res = await api.getEffectNames();
  const names = res.ok && res.data.length > 0 ? res.data : [winner.full_name];
  await cycleNames(slot, names, 2600, 70);
  await cycleNames(slot, names, 900, 160);

  wheel.classList.remove('spinning');
  slot.textContent = winner.full_name;
  slot.classList.add('revealed');

  showReveal(winner);
  await sleep(4200);
  hideReveal();
  await sleep(400);
}

function cycleNames(el: HTMLElement, names: readonly string[], durationMs: number, intervalMs: number): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    const timer = window.setInterval(() => {
      el.textContent = names[Math.floor(Math.random() * names.length)] ?? '';
      if (Date.now() - start >= durationMs) {
        window.clearInterval(timer);
        resolve();
      }
    }, intervalMs);
  });
}

function showReveal(winner: DisplayWinner): void {
  $('revealName').textContent = winner.full_name;
  $('revealUnit').textContent = winner.unit;
  $('revealId').textContent = 'เลขสมาชิก ' + winner.member_id_masked;
  const overlay = $('revealOverlay');
  overlay.hidden = false;
  requestAnimationFrame(() => $('revealCard').classList.add('show'));
  burstConfetti(overlay);
}

function hideReveal(): void {
  $('revealCard').classList.remove('show');
  setTimeout(() => ($('revealOverlay').hidden = true), 300);
}

function burstConfetti(container: HTMLElement): void {
  const colors = ['#f43f5e', '#facc15', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];
  for (let i = 0; i < 60; i++) {
    const piece = h('div', { class: 'confetti-piece' });
    piece.style.left = Math.random() * 100 + 'vw';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)] ?? '#facc15';
    piece.style.animationDuration = 2.2 + Math.random() * 1.6 + 's';
    piece.style.animationDelay = Math.random() * 0.4 + 's';
    container.append(piece);
    setTimeout(() => piece.remove(), 4500);
  }
}

watchTables({
  channel: 'display',
  tables: ['events', 'rounds', 'winners'],
  // registrations ฟัง Realtime ไม่ได้ (anon อ่านไม่ได้) ตัวนับผู้ลงทะเบียนจึงอัปเดตตามรอบนี้
  fallbackMs: 10_000,
  refresh: async () => {
    const res = await api.getDisplayState();
    if (res.ok) render(res.data);
  },
});
