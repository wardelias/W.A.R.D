export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      calendar_blocks: {
        Row: {
          changed_at: string;
          created_at: string;
          day: string;
          deleted_at: string | null;
          ends_at: string;
          goal_id: string | null;
          google_calendar_id: string | null;
          google_etag: string | null;
          google_event_id: string | null;
          google_updated_at: string | null;
          habit_id: string | null;
          id: string;
          kind: string;
          outcome: string | null;
          starts_at: string;
          sync_error: string | null;
          sync_state: string;
          task_id: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          changed_at?: string;
          created_at?: string;
          day: string;
          deleted_at?: string | null;
          ends_at: string;
          goal_id?: string | null;
          google_calendar_id?: string | null;
          google_etag?: string | null;
          google_event_id?: string | null;
          google_updated_at?: string | null;
          habit_id?: string | null;
          id?: string;
          kind: string;
          outcome?: string | null;
          starts_at: string;
          sync_error?: string | null;
          sync_state?: string;
          task_id?: string | null;
          title: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          changed_at?: string;
          created_at?: string;
          day?: string;
          deleted_at?: string | null;
          ends_at?: string;
          goal_id?: string | null;
          google_calendar_id?: string | null;
          google_etag?: string | null;
          google_event_id?: string | null;
          google_updated_at?: string | null;
          habit_id?: string | null;
          id?: string;
          kind?: string;
          outcome?: string | null;
          starts_at?: string;
          sync_error?: string | null;
          sync_state?: string;
          task_id?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_blocks_goal_fk";
            columns: ["goal_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "calendar_blocks_habit_fk";
            columns: ["habit_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "habits";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "calendar_blocks_task_fk";
            columns: ["task_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      calendar_events: {
        Row: {
          all_day: boolean;
          busy: boolean;
          end_date: string | null;
          ends_at: string | null;
          google_calendar_id: string;
          google_event_id: string;
          html_link: string | null;
          start_date: string | null;
          starts_at: string | null;
          status: string;
          synced_at: string;
          title: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          all_day: boolean;
          busy?: boolean;
          end_date?: string | null;
          ends_at?: string | null;
          google_calendar_id: string;
          google_event_id: string;
          html_link?: string | null;
          start_date?: string | null;
          starts_at?: string | null;
          status: string;
          synced_at?: string;
          title?: string;
          user_id: string;
        };
        Update: {
          all_day?: boolean;
          busy?: boolean;
          end_date?: string | null;
          ends_at?: string | null;
          google_calendar_id?: string;
          google_event_id?: string;
          html_link?: string | null;
          start_date?: string | null;
          starts_at?: string | null;
          status?: string;
          synced_at?: string;
          title?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_events_calendar_fk";
            columns: ["user_id", "google_calendar_id"];
            isOneToOne: false;
            referencedRelation: "calendars";
            referencedColumns: ["user_id", "google_calendar_id"];
          },
        ];
      };
      calendars: {
        Row: {
          created_at: string;
          google_calendar_id: string;
          is_ward: boolean;
          last_error: string | null;
          last_synced_at: string | null;
          selected: boolean;
          summary: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          google_calendar_id: string;
          is_ward?: boolean;
          last_error?: string | null;
          last_synced_at?: string | null;
          selected?: boolean;
          summary?: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          google_calendar_id?: string;
          is_ward?: boolean;
          last_error?: string | null;
          last_synced_at?: string | null;
          selected?: boolean;
          summary?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      day_plans: {
        Row: {
          created_at: string;
          day: string;
          mit_set_at: string | null;
          mit_task_id: string | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          day: string;
          mit_set_at?: string | null;
          mit_task_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          day?: string;
          mit_set_at?: string | null;
          mit_task_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "day_plans_mit_fk";
            columns: ["mit_task_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      goals: {
        Row: {
          created_at: string;
          id: string;
          label: string;
          rank: number;
          title: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          label: string;
          rank: number;
          title: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          label?: string;
          rank?: number;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      google_accounts: {
        Row: {
          access_expires_at: string | null;
          access_token_enc: string | null;
          connected_at: string;
          email: string;
          google_sub: string;
          last_sync_error: string | null;
          last_synced_at: string | null;
          refresh_token_enc: string;
          scopes: string[];
          status: string;
          updated_at: string;
          user_id: string;
          ward_calendar_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          access_expires_at?: string | null;
          access_token_enc?: string | null;
          connected_at?: string;
          email: string;
          google_sub: string;
          last_sync_error?: string | null;
          last_synced_at?: string | null;
          refresh_token_enc: string;
          scopes?: string[];
          status?: string;
          updated_at?: string;
          user_id: string;
          ward_calendar_id?: string | null;
        };
        Update: {
          access_expires_at?: string | null;
          access_token_enc?: string | null;
          connected_at?: string;
          email?: string;
          google_sub?: string;
          last_sync_error?: string | null;
          last_synced_at?: string | null;
          refresh_token_enc?: string;
          scopes?: string[];
          status?: string;
          updated_at?: string;
          user_id?: string;
          ward_calendar_id?: string | null;
        };
        Relationships: [];
      };
      habit_logs: {
        Row: {
          day: string;
          habit_id: string;
          id: string;
          level: string;
          logged_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          day: string;
          habit_id: string;
          id?: string;
          level: string;
          logged_at?: string;
          user_id?: string;
        };
        Update: {
          day?: string;
          habit_id?: string;
          id?: string;
          level?: string;
          logged_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "habit_logs_habit_fk";
            columns: ["habit_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "habits";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      habits: {
        Row: {
          archived_at: string | null;
          block_min: number | null;
          created_at: string;
          goal_id: string;
          grace_allowed: number;
          grace_window: number;
          id: string;
          minimum_version: string;
          name: string;
          per_week: number | null;
          position: number;
          schedule_days: number[] | null;
          schedule_kind: string;
          starts_on: string;
          target_time: string | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          block_min?: number | null;
          created_at?: string;
          goal_id: string;
          grace_allowed?: number;
          grace_window?: number;
          id?: string;
          minimum_version: string;
          name: string;
          per_week?: number | null;
          position?: number;
          schedule_days?: number[] | null;
          schedule_kind: string;
          starts_on?: string;
          target_time?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          archived_at?: string | null;
          block_min?: number | null;
          created_at?: string;
          goal_id?: string;
          grace_allowed?: number;
          grace_window?: number;
          id?: string;
          minimum_version?: string;
          name?: string;
          per_week?: number | null;
          position?: number;
          schedule_days?: number[] | null;
          schedule_kind?: string;
          starts_on?: string;
          target_time?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "habits_goal_fk";
            columns: ["goal_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      reviews: {
        Row: {
          completed_at: string;
          created_at: string;
          id: string;
          kind: string;
          note: string | null;
          period_end: string;
          period_start: string;
          stats: NonNullable<Json>;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          completed_at?: string;
          created_at?: string;
          id?: string;
          kind: string;
          note?: string | null;
          period_end: string;
          period_start: string;
          stats?: NonNullable<Json>;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          completed_at?: string;
          created_at?: string;
          id?: string;
          kind?: string;
          note?: string | null;
          period_end?: string;
          period_start?: string;
          stats?: NonNullable<Json>;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          block_reminders: boolean;
          break_min: number;
          created_at: string;
          day_rollover: string;
          focus_block_min: number;
          focus_capacity_min: number;
          focus_windows: NonNullable<Json>;
          onboarded_at: string | null;
          shutdown_time: string;
          theme: string;
          timezone: string;
          updated_at: string;
          user_id: string;
          wake_time: string;
          week_start: number;
        };
        ComputedFields: never;
        Insert: {
          block_reminders?: boolean;
          break_min?: number;
          created_at?: string;
          day_rollover?: string;
          focus_block_min?: number;
          focus_capacity_min?: number;
          focus_windows?: NonNullable<Json>;
          onboarded_at?: string | null;
          shutdown_time?: string;
          theme?: string;
          timezone?: string;
          updated_at?: string;
          user_id?: string;
          wake_time?: string;
          week_start?: number;
        };
        Update: {
          block_reminders?: boolean;
          break_min?: number;
          created_at?: string;
          day_rollover?: string;
          focus_block_min?: number;
          focus_capacity_min?: number;
          focus_windows?: NonNullable<Json>;
          onboarded_at?: string | null;
          shutdown_time?: string;
          theme?: string;
          timezone?: string;
          updated_at?: string;
          user_id?: string;
          wake_time?: string;
          week_start?: number;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          completed_at: string | null;
          created_at: string;
          due_on: string | null;
          est_min: number | null;
          goal_id: string;
          id: string;
          notes: string | null;
          planned_for: string | null;
          position: number | null;
          slip_count: number;
          status: string;
          title: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          due_on?: string | null;
          est_min?: number | null;
          goal_id: string;
          id?: string;
          notes?: string | null;
          planned_for?: string | null;
          position?: number | null;
          slip_count?: number;
          status?: string;
          title: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          due_on?: string | null;
          est_min?: number | null;
          goal_id?: string;
          id?: string;
          notes?: string | null;
          planned_for?: string | null;
          position?: number | null;
          slip_count?: number;
          status?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_goal_fk";
            columns: ["goal_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      reorder_goals: { Args: { p_ids: string[] }; Returns: undefined };
      replace_calendar_window: {
        Args: {
          p_calendar: string;
          p_events: Json;
          p_from: string;
          p_from_date: string;
          p_to: string;
          p_to_date: string;
          p_user: string;
        };
        Returns: number;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
