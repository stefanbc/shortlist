export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor: string | null
          at: string
          entity: string
          entity_id: string | null
          id: string
          new: Json | null
          old: Json | null
        }
        ComputedFields: never
        Insert: {
          action: string
          actor?: string | null
          at?: string
          entity: string
          entity_id?: string | null
          id?: string
          new?: Json | null
          old?: Json | null
        }
        Update: {
          action?: string
          actor?: string | null
          at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          new?: Json | null
          old?: Json | null
        }
        Relationships: []
      }
      criteria: {
        Row: {
          created_at: string
          event_id: string
          id: string
          name: string
          position: number
          weight: number
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          name: string
          position?: number
          weight: number
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          name?: string
          position?: number
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: 'criteria_event_id_fkey'
            columns: ['event_id']
            isOneToOne: false
            referencedRelation: 'events'
            referencedColumns: ['id']
          },
        ]
      }
      event_jurors: {
        Row: {
          created_at: string
          event_id: string
          juror_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          event_id: string
          juror_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          juror_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'event_jurors_event_id_fkey'
            columns: ['event_id']
            isOneToOne: false
            referencedRelation: 'events'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'event_jurors_juror_id_fkey'
            columns: ['juror_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          locked_at: string | null
          name: string
          now_pitching_since: string | null
          now_pitching_team_id: string | null
          pitch_minutes: number
          starts_at: string
          status_override: string
          timer_duration_s: number | null
          timer_elapsed_ms: number
          timer_started_at: string | null
          event_closed_at: string | null
          event_phase: string | null
        }
        ComputedFields: 'event_closed_at' | 'event_phase'
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          locked_at?: string | null
          name: string
          now_pitching_since?: string | null
          now_pitching_team_id?: string | null
          pitch_minutes?: number
          starts_at: string
          status_override?: string
          timer_duration_s?: number | null
          timer_elapsed_ms?: number
          timer_started_at?: string | null
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          locked_at?: string | null
          name?: string
          now_pitching_since?: string | null
          now_pitching_team_id?: string | null
          pitch_minutes?: number
          starts_at?: string
          status_override?: string
          timer_duration_s?: number | null
          timer_elapsed_ms?: number
          timer_started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'events_now_pitching_team_id_fkey'
            columns: ['now_pitching_team_id']
            isOneToOne: false
            referencedRelation: 'teams'
            referencedColumns: ['id']
          },
        ]
      }
      juror_notes: {
        Row: {
          body: string
          created_at: string
          juror_id: string
          team_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          body?: string
          created_at?: string
          juror_id: string
          team_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          juror_id?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'juror_notes_juror_id_fkey'
            columns: ['juror_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'juror_notes_team_id_fkey'
            columns: ['team_id']
            isOneToOne: false
            referencedRelation: 'teams'
            referencedColumns: ['id']
          },
        ]
      }
      juror_tokens: {
        Row: {
          created_at: string
          id: string
          juror_id: string
          revoked_at: string | null
          token_hash: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id?: string
          juror_id: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          created_at?: string
          id?: string
          juror_id?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: 'juror_tokens_juror_id_fkey'
            columns: ['juror_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      late_score_attempts: {
        Row: {
          criterion_id: string
          event_id: string
          id: string
          juror_id: string
          received_at: string
          tapped_at: string
          team_id: string
          value: number | null
        }
        ComputedFields: never
        Insert: {
          criterion_id: string
          event_id: string
          id?: string
          juror_id: string
          received_at?: string
          tapped_at: string
          team_id: string
          value?: number | null
        }
        Update: {
          criterion_id?: string
          event_id?: string
          id?: string
          juror_id?: string
          received_at?: string
          tapped_at?: string
          team_id?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'late_score_attempts_criterion_id_fkey'
            columns: ['criterion_id']
            isOneToOne: false
            referencedRelation: 'criteria'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'late_score_attempts_event_id_fkey'
            columns: ['event_id']
            isOneToOne: false
            referencedRelation: 'events'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'late_score_attempts_juror_id_fkey'
            columns: ['juror_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'late_score_attempts_team_id_fkey'
            columns: ['team_id']
            isOneToOne: false
            referencedRelation: 'teams'
            referencedColumns: ['id']
          },
        ]
      }
      permissions: {
        Row: {
          key: string
        }
        ComputedFields: never
        Insert: {
          key: string
        }
        Update: {
          key?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          display_name: string
          email: string | null
          id: string
          role: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          created_at?: string
          display_name: string
          email?: string | null
          id: string
          role?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: 'profiles_role_fkey'
            columns: ['role']
            isOneToOne: false
            referencedRelation: 'roles'
            referencedColumns: ['key']
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string | null
          repo_url: string | null
          team_id: string
          theme_id: string | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string | null
          repo_url?: string | null
          team_id: string
          theme_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string | null
          repo_url?: string | null
          team_id?: string
          theme_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'projects_team_id_fkey'
            columns: ['team_id']
            isOneToOne: true
            referencedRelation: 'teams'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'projects_theme_id_fkey'
            columns: ['theme_id']
            isOneToOne: false
            referencedRelation: 'themes'
            referencedColumns: ['id']
          },
        ]
      }
      role_permissions: {
        Row: {
          permission: string
          role: string
        }
        ComputedFields: never
        Insert: {
          permission: string
          role: string
        }
        Update: {
          permission?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: 'role_permissions_permission_fkey'
            columns: ['permission']
            isOneToOne: false
            referencedRelation: 'permissions'
            referencedColumns: ['key']
          },
          {
            foreignKeyName: 'role_permissions_role_fkey'
            columns: ['role']
            isOneToOne: false
            referencedRelation: 'roles'
            referencedColumns: ['key']
          },
        ]
      }
      roles: {
        Row: {
          key: string
        }
        ComputedFields: never
        Insert: {
          key: string
        }
        Update: {
          key?: string
        }
        Relationships: []
      }
      scores: {
        Row: {
          created_at: string
          criterion_id: string
          event_id: string
          id: string
          juror_id: string
          tapped_at: string
          team_id: string
          updated_at: string
          value: number
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          criterion_id: string
          event_id: string
          id?: string
          juror_id: string
          tapped_at: string
          team_id: string
          updated_at?: string
          value: number
        }
        Update: {
          created_at?: string
          criterion_id?: string
          event_id?: string
          id?: string
          juror_id?: string
          tapped_at?: string
          team_id?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: 'scores_criterion_id_fkey'
            columns: ['criterion_id']
            isOneToOne: false
            referencedRelation: 'criteria'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'scores_event_id_fkey'
            columns: ['event_id']
            isOneToOne: false
            referencedRelation: 'events'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'scores_juror_id_fkey'
            columns: ['juror_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'scores_team_id_fkey'
            columns: ['team_id']
            isOneToOne: false
            referencedRelation: 'teams'
            referencedColumns: ['id']
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          event_id: string
          id: string
          manual_tiebreak: number | null
          members: string[]
          name: string
          no_show: boolean
          pitch_order: number | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          manual_tiebreak?: number | null
          members?: string[]
          name: string
          no_show?: boolean
          pitch_order?: number | null
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          manual_tiebreak?: number | null
          members?: string[]
          name?: string
          no_show?: boolean
          pitch_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'teams_event_id_fkey'
            columns: ['event_id']
            isOneToOne: false
            referencedRelation: 'events'
            referencedColumns: ['id']
          },
        ]
      }
      themes: {
        Row: {
          created_at: string
          event_id: string
          id: string
          name: string
          position: number
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          name: string
          position?: number
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: 'themes_event_id_fkey'
            columns: ['event_id']
            isOneToOne: false
            referencedRelation: 'events'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      copy_event_setup: {
        Args: { p_ends: string; p_name: string; p_source: string; p_starts: string }
        Returns: string
      }
      event_closed_at: {
        Args: {
          e: Omit<
            Database['public']['Tables']['events']['Row'],
            Database['public']['Tables']['events']['ComputedFields']
          >
        }
        Returns: string
      }
      event_phase: {
        Args: {
          e: Omit<
            Database['public']['Tables']['events']['Row'],
            Database['public']['Tables']['events']['ComputedFields']
          >
        }
        Returns: string
      }
      has_permission: { Args: { p: string }; Returns: boolean }
      import_event: { Args: { p: Json }; Returns: string }
      is_event_juror: { Args: { event: string }; Returns: boolean }
      pitch_timer: {
        Args: { p_action: string; p_event: string; p_seconds?: number }
        Returns: undefined
      }
      require_permission: { Args: { p: string }; Returns: undefined }
      set_event_status: { Args: { p_event: string; p_override: string }; Returns: undefined }
      set_now_pitching: { Args: { p_event: string; p_team: string }; Returns: undefined }
      upsert_score: {
        Args: {
          p_criterion: string
          p_juror: string
          p_tapped_at: string
          p_team: string
          p_value: number
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
