import { toThaiMessage } from './errors';
import { supabase } from './supabase';
import type { AdminState, DisplayMode, DisplayState, DrawResult, RegistrationForm, RoundInfo } from './types';

export type Result<T> = { ok: true; data: T } | { ok: false; message: string };

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<Result<T>> {
  try {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) return { ok: false, message: toThaiMessage(error) };
    return { ok: true, data: data as T };
  } catch (e) {
    return { ok: false, message: toThaiMessage(e instanceof Error ? e : null) };
  }
}

// ทุกการเขียนข้อมูลผ่าน Postgres functions เท่านั้น (ดู supabase/migrations)
export const api = {
  getRegistrationForm: () => call<RegistrationForm>('get_registration_form'),
  register: (memberId: string, fullName: string, unitId: number) =>
    call<null>('register', { p_member_id: memberId, p_full_name: fullName, p_unit_id: unitId }),

  getDisplayState: () => call<DisplayState>('get_display_state'),
  getEffectNames: () => call<string[]>('get_effect_names'),

  getAdminState: () => call<AdminState>('get_admin_state'),
  createEvent: (title: string) => call<string>('create_event', { p_title: title }),
  setRegistrationOpen: (open: boolean) => call<null>('set_registration_open', { p_open: open }),
  setDisplayMode: (mode: DisplayMode) => call<null>('set_display_mode', { p_mode: mode }),
  startRound: (name: string, target: number) => call<RoundInfo>('start_round', { p_name: name, p_target: target }),
  updateRound: (roundId: string, name: string, target: number) =>
    call<RoundInfo>('update_round', { p_round_id: roundId, p_name: name, p_target: target }),
  drawNext: () => call<DrawResult>('draw_next'),
  forfeitWinner: (winnerId: string) => call<null>('forfeit_winner', { p_winner_id: winnerId }),
  undoForfeit: (winnerId: string) => call<null>('undo_forfeit', { p_winner_id: winnerId }),
  disqualify: (registrationId: string) => call<null>('disqualify', { p_registration_id: registrationId }),
  requalify: (registrationId: string) => call<null>('requalify', { p_registration_id: registrationId }),
};
