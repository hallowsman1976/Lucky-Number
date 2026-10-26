// รูปร่าง JSON ที่ Postgres functions คืนมา (ดู supabase/migrations) — คำศัพท์ตาม CONTEXT.md

export type DisplayMode = 'register' | 'wheel';

export interface EventInfo {
  id: string;
  title: string;
  registration_open: boolean;
  display_mode: DisplayMode;
}

export interface Unit {
  id: number;
  name: string;
}

export interface RoundInfo {
  id: string;
  seq: number;
  name: string;
  target: number;
  /** จำนวนผู้โชคดีที่ไม่สละสิทธิ์ */
  filled: number;
}

export interface RegistrationForm {
  event: EventInfo | null;
  units: Unit[];
}

export interface DisplayWinner {
  id: string;
  round_id: string;
  round_name: string;
  full_name: string;
  unit: string;
  member_id_masked: string;
  drawn_at: string;
  forfeited: boolean;
}

export type DisplayState =
  | { event: null }
  | {
      event: EventInfo;
      total_registrations: number;
      eligible_count: number;
      current_round: RoundInfo | null;
      /** ใหม่สุดก่อน */
      winners: DisplayWinner[];
    };

export interface AdminWinner {
  id: string;
  round_id: string;
  round_name: string;
  drawn_at: string;
  forfeited_at: string | null;
}

export interface AdminRegistration {
  id: string;
  member_id: string;
  full_name: string;
  unit: string;
  disqualified: boolean;
  created_at: string;
  winner: AdminWinner | null;
}

export type AdminState =
  | { event: null }
  | {
      event: EventInfo;
      current_round: RoundInfo | null;
      rounds: RoundInfo[];
      /** เก่าสุดก่อน */
      registrations: AdminRegistration[];
    };

export interface DrawResult {
  winner: { id: string; member_id: string; full_name: string; unit: string };
  round: RoundInfo;
  eligible_count: number;
}
