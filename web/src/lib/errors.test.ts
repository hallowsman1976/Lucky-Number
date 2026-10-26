import { describe, expect, it } from 'vitest';
import { toThaiMessage } from './errors';

describe('toThaiMessage', () => {
  it('passes through Thai messages raised by database functions', () => {
    expect(toThaiMessage({ message: 'ปิดรับลงทะเบียนแล้ว', code: 'P0001' })).toBe('ปิดรับลงทะเบียนแล้ว');
  });

  it('keeps the Thai admin-check message even though its code is 42501', () => {
    const message = 'ไม่มีสิทธิ์ใช้งานส่วนนี้ กรุณาเข้าสู่ระบบด้วยบัญชีแอดมิน';
    expect(toThaiMessage({ message, code: '42501' })).toBe(message);
  });

  it('explains network failures', () => {
    expect(toThaiMessage({ message: 'TypeError: Failed to fetch' })).toContain('เชื่อมต่อระบบไม่สำเร็จ');
    expect(toThaiMessage(null)).toContain('เชื่อมต่อระบบไม่สำเร็จ');
  });

  it('translates common English errors', () => {
    expect(toThaiMessage({ message: 'permission denied for function draw_next', code: '42501' })).toBe('ไม่มีสิทธิ์ใช้งานส่วนนี้');
    expect(toThaiMessage({ message: 'JWT expired', code: 'PGRST301' })).toContain('เซสชันหมดอายุ');
    expect(toThaiMessage({ message: 'Invalid login credentials' })).toBe('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  });
});
