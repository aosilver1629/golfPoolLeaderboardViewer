export type PoolStatus = "upcoming" | "active" | "completed";
export type PickType = "group_a" | "group_b" | "group_c" | "group_d" | "wildcard";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          email: string;
          is_admin: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          email: string;
          is_admin?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          email?: string;
          is_admin?: boolean;
          created_at?: string;
        };
      };
      pools: {
        Row: {
          id: string;
          name: string;
          tournament_id: string | null;
          status: PoolStatus;
          invite_code: string;
          entry_fee: number | null;
          max_entries_per_user: number;
          created_by: string;
          lock_date: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          tournament_id?: string | null;
          status?: PoolStatus;
          invite_code: string;
          entry_fee?: number | null;
          max_entries_per_user?: number;
          created_by: string;
          lock_date?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          tournament_id?: string | null;
          status?: PoolStatus;
          invite_code?: string;
          entry_fee?: number | null;
          max_entries_per_user?: number;
          created_by?: string;
          lock_date?: string | null;
          created_at?: string;
        };
      };
      pool_members: {
        Row: {
          id: string;
          pool_id: string;
          user_id: string;
          joined_at: string;
        };
        Insert: {
          id?: string;
          pool_id: string;
          user_id: string;
          joined_at?: string;
        };
        Update: {
          id?: string;
          pool_id?: string;
          user_id?: string;
          joined_at?: string;
        };
      };
      groups: {
        Row: {
          id: string;
          pool_id: string;
          name: string;
          sort_order: number;
        };
        Insert: {
          id?: string;
          pool_id: string;
          name: string;
          sort_order: number;
        };
        Update: {
          id?: string;
          pool_id?: string;
          name?: string;
          sort_order?: number;
        };
      };
      group_golfers: {
        Row: {
          id: string;
          group_id: string;
          golfer_name: string;
          golfer_api_id: string | null;
        };
        Insert: {
          id?: string;
          group_id: string;
          golfer_name: string;
          golfer_api_id?: string | null;
        };
        Update: {
          id?: string;
          group_id?: string;
          golfer_name?: string;
          golfer_api_id?: string | null;
        };
      };
      entries: {
        Row: {
          id: string;
          pool_id: string;
          user_id: string | null;
          entry_name: string;
          tiebreaker_score: number | null;
          total_points: number;
          rank: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          pool_id: string;
          user_id?: string | null;
          entry_name: string;
          tiebreaker_score?: number | null;
          total_points?: number;
          rank?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          pool_id?: string;
          user_id?: string | null;
          entry_name?: string;
          tiebreaker_score?: number | null;
          total_points?: number;
          rank?: number | null;
          created_at?: string;
        };
      };
      entry_picks: {
        Row: {
          id: string;
          entry_id: string;
          golfer_name: string;
          golfer_api_id: string | null;
          pick_type: PickType;
          current_position: string | null;
          current_points: number;
        };
        Insert: {
          id?: string;
          entry_id: string;
          golfer_name: string;
          golfer_api_id?: string | null;
          pick_type: PickType;
          current_position?: string | null;
          current_points?: number;
        };
        Update: {
          id?: string;
          entry_id?: string;
          golfer_name?: string;
          golfer_api_id?: string | null;
          pick_type?: PickType;
          current_position?: string | null;
          current_points?: number;
        };
      };
      tournament_leaderboard: {
        Row: {
          id: string;
          pool_id: string;
          golfer_name: string;
          golfer_api_id: string;
          position: number | null;
          position_display: string;
          score_to_par: number;
          current_round: number;
          thru: string;
          total_score: number | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pool_id: string;
          golfer_name: string;
          golfer_api_id: string;
          position?: number | null;
          position_display?: string;
          score_to_par?: number;
          current_round?: number;
          thru?: string;
          total_score?: number | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          pool_id?: string;
          golfer_name?: string;
          golfer_api_id?: string;
          position?: number | null;
          position_display?: string;
          score_to_par?: number;
          current_round?: number;
          thru?: string;
          total_score?: number | null;
          updated_at?: string;
        };
      };
      points_table: {
        Row: {
          id: string;
          pool_id: string;
          position_start: number;
          position_end: number;
          points: number;
        };
        Insert: {
          id?: string;
          pool_id: string;
          position_start: number;
          position_end: number;
          points: number;
        };
        Update: {
          id?: string;
          pool_id?: string;
          position_start?: number;
          position_end?: number;
          points?: number;
        };
      };
    };
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    Views: {};
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    Functions: {};
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    Enums: {};
  };
}
