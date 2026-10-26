/** ค่าที่ต้องให้ Excel แสดงเป็นข้อความตรงตัว เช่น เลขสมาชิก '00123' (ไม่ให้ตัดเลข 0 นำหน้า) */
export interface TextCell {
  text: string;
}

export type Cell = string | number | null | undefined | TextCell;

const NEEDS_QUOTE = /[",\r\n]/;
// กัน CSV injection: ค่าที่ขึ้นต้นด้วยอักขระเหล่านี้ Excel จะตีความเป็นสูตร
const FORMULA_START = /^[=+\-@\t\r]/;

function quote(value: string): string {
  return NEEDS_QUOTE.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function formatCell(cell: Cell): string {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'number') return String(cell);
  if (typeof cell === 'object') return quote(`="${cell.text.replace(/"/g, '""')}"`);
  return quote(FORMULA_START.test(cell) ? `'${cell}` : cell);
}

/** CSV ที่เปิดใน Excel แล้วภาษาไทยไม่เพี้ยน (มี BOM, ขึ้นบรรทัดแบบ CRLF) */
export function toCsv(rows: readonly (readonly Cell[])[]): string {
  return '﻿' + rows.map((row) => row.map(formatCell).join(',')).join('\r\n') + '\r\n';
}

export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
