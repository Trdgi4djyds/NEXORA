// Types de la base Supabase de NEXORA, générés par l'API de gestion (`pnpm supabase types`).
// Ne pas modifier à la main.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      announcement_reads: {
        Row: {
          announcement_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          active: boolean
          audience: string
          body: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          level: string
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          audience?: string
          body?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          level?: string
          starts_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          audience?: string
          body?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          level?: string
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          description: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "app_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          bucket: string
          created_at: string
          id: string
          kind: string
          mime: string | null
          name: string
          org_id: string
          owner_id: string | null
          path: string
          size_bytes: number
        }
        Insert: {
          bucket?: string
          created_at?: string
          id?: string
          kind?: string
          mime?: string | null
          name?: string
          org_id: string
          owner_id?: string | null
          path: string
          size_bytes?: number
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: string
          kind?: string
          mime?: string | null
          name?: string
          org_id?: string
          owner_id?: string | null
          path?: string
          size_bytes?: number
        }
        Relationships: [
          {
            foreignKeyName: "assets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity: string
          entity_id: string | null
          id: number
          meta: Json
          org_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: never
          meta?: Json
          org_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: never
          meta?: Json
          org_id?: string | null
        }
        Relationships: []
      }
      comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          org_id: string
          page_id: string | null
          resolved: boolean
          target_id: string
          target_type: string
          updated_at: string
          x: number | null
          y: number | null
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          org_id: string
          page_id?: string | null
          resolved?: boolean
          target_id: string
          target_type: string
          updated_at?: string
          x?: number | null
          y?: number | null
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          org_id?: string
          page_id?: string | null
          resolved?: boolean
          target_id?: string
          target_type?: string
          updated_at?: string
          x?: number | null
          y?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      design_documents: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          local_id: string | null
          name: string
          org_id: string
          owner_id: string | null
          pages_count: number
          project_id: string | null
          size_bytes: number
          storage_path: string | null
          thumb: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          local_id?: string | null
          name?: string
          org_id: string
          owner_id?: string | null
          pages_count?: number
          project_id?: string | null
          size_bytes?: number
          storage_path?: string | null
          thumb?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          local_id?: string | null
          name?: string
          org_id?: string
          owner_id?: string | null
          pages_count?: number
          project_id?: string | null
          size_bytes?: number
          storage_path?: string | null
          thumb?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "design_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_documents_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_documents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      device_boards: {
        Row: {
          created_at: string
          created_by: string | null
          devices: Json
          id: string
          name: string
          org_id: string
          project_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          devices?: Json
          id?: string
          name?: string
          org_id: string
          project_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          devices?: Json
          id?: string
          name?: string
          org_id?: string
          project_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_boards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_boards_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_boards_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          app_version: string | null
          created_at: string
          id: string
          last_seen_at: string
          name: string
          platform: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string
          name?: string
          platform: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string
          name?: string
          platform?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          description: string
          enabled: boolean
          key: string
          plans: string[]
          rollout: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          description?: string
          enabled?: boolean
          key: string
          plans?: string[]
          rollout?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          description?: string
          enabled?: boolean
          key?: string
          plans?: string[]
          rollout?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          org_id: string
          role: Database["public"]["Enums"]["member_role"]
          status: string
          token: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id: string
          role?: Database["public"]["Enums"]["member_role"]
          status?: string
          token?: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      monitor_checks: {
        Row: {
          checked_at: string
          error: string | null
          id: number
          latency_ms: number | null
          monitor_id: string
          ok: boolean
          org_id: string
          status_code: number | null
        }
        Insert: {
          checked_at?: string
          error?: string | null
          id?: never
          latency_ms?: number | null
          monitor_id: string
          ok: boolean
          org_id: string
          status_code?: number | null
        }
        Update: {
          checked_at?: string
          error?: string | null
          id?: never
          latency_ms?: number | null
          monitor_id?: string
          ok?: boolean
          org_id?: string
          status_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "monitor_checks_monitor_id_fkey"
            columns: ["monitor_id"]
            isOneToOne: false
            referencedRelation: "monitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitor_checks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      monitor_requests: {
        Row: {
          monitor_id: string
          request_id: number
          started_at: string
        }
        Insert: {
          monitor_id: string
          request_id: number
          started_at?: string
        }
        Update: {
          monitor_id?: string
          request_id?: number
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitor_requests_monitor_id_fkey"
            columns: ["monitor_id"]
            isOneToOne: false
            referencedRelation: "monitors"
            referencedColumns: ["id"]
          },
        ]
      }
      monitors: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          expected_status: number
          id: string
          interval_minutes: number
          keyword: string | null
          last_checked_at: string | null
          last_error: string | null
          last_latency_ms: number | null
          last_status: string
          name: string
          org_id: string
          project_id: string | null
          updated_at: string
          url: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          expected_status?: number
          id?: string
          interval_minutes?: number
          keyword?: string | null
          last_checked_at?: string | null
          last_error?: string | null
          last_latency_ms?: number | null
          last_status?: string
          name?: string
          org_id: string
          project_id?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          expected_status?: number
          id?: string
          interval_minutes?: number
          keyword?: string | null
          last_checked_at?: string | null
          last_error?: string | null
          last_latency_ms?: number | null
          last_status?: string
          name?: string
          org_id?: string
          project_id?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitors_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          org_id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          org_id: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          name: string
          owner_id: string | null
          personal: boolean
          slug: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          owner_id?: string | null
          personal?: boolean
          slug?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          owner_id?: string | null
          personal?: boolean
          slug?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          active: boolean
          created_at: string
          currency: string
          description: string
          features: Json
          id: string
          limits: Json
          name: string
          price_month_cents: number
          price_year_cents: number
          sort: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency?: string
          description?: string
          features?: Json
          id: string
          limits?: Json
          name: string
          price_month_cents?: number
          price_year_cents?: number
          sort?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          currency?: string
          description?: string
          features?: Json
          id?: string
          limits?: Json
          name?: string
          price_month_cents?: number
          price_year_cents?: number
          sort?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          app_role: Database["public"]["Enums"]["app_role"]
          avatar_url: string | null
          company: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          job_title: string | null
          last_seen_at: string | null
          locale: string
          onboarding_done: boolean
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          app_role?: Database["public"]["Enums"]["app_role"]
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          job_title?: string | null
          last_seen_at?: string | null
          locale?: string
          onboarding_done?: boolean
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          app_role?: Database["public"]["Enums"]["app_role"]
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          job_title?: string | null
          last_seen_at?: string | null
          locale?: string
          onboarding_done?: boolean
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          archived: boolean
          color: string | null
          created_at: string
          description: string
          favicon: string | null
          id: string
          kind: string
          local_key: string | null
          name: string
          org_id: string
          owner_id: string | null
          pinned: boolean
          settings: Json
          updated_at: string
          url: string | null
        }
        Insert: {
          archived?: boolean
          color?: string | null
          created_at?: string
          description?: string
          favicon?: string | null
          id?: string
          kind?: string
          local_key?: string | null
          name: string
          org_id: string
          owner_id?: string | null
          pinned?: boolean
          settings?: Json
          updated_at?: string
          url?: string | null
        }
        Update: {
          archived?: boolean
          color?: string | null
          created_at?: string
          description?: string
          favicon?: string | null
          id?: string
          kind?: string
          local_key?: string | null
          name?: string
          org_id?: string
          owner_id?: string | null
          pinned?: boolean
          settings?: Json
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      security_scans: {
        Row: {
          created_at: string
          created_by: string | null
          findings: Json
          grade: string | null
          headers: Json
          id: string
          org_id: string
          project_id: string | null
          score: number | null
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          findings?: Json
          grade?: string | null
          headers?: Json
          id?: string
          org_id: string
          project_id?: string | null
          score?: number | null
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          findings?: Json
          grade?: string | null
          headers?: Json
          id?: string
          org_id?: string
          project_id?: string | null
          score?: number | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_scans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_scans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_scans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      share_links: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          org_id: string
          target_id: string
          target_type: string
          token: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          org_id: string
          target_id: string
          target_type: string
          token?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          org_id?: string
          target_id?: string
          target_type?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_links_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_items: {
        Row: {
          created_at: string
          data: Json
          id: string
          kind: string
          name: string
          org_id: string
          owner_id: string | null
          project_id: string | null
          thumb: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          kind: string
          name?: string
          org_id: string
          owner_id?: string | null
          project_id?: string | null
          thumb?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          kind?: string
          name?: string
          org_id?: string
          owner_id?: string | null
          project_id?: string | null
          thumb?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "studio_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          id: string
          org_id: string
          plan_id: string
          provider: string
          provider_ref: string | null
          seats: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          org_id: string
          plan_id?: string
          provider?: string
          provider_ref?: string | null
          seats?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          org_id?: string
          plan_id?: string
          provider?: string
          provider_ref?: string | null
          seats?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          category: string
          closed_at: string | null
          created_at: string
          id: string
          org_id: string | null
          priority: Database["public"]["Enums"]["ticket_priority"]
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string
          closed_at?: string | null
          created_at?: string
          id?: string
          org_id?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          closed_at?: string | null
          created_at?: string
          id?: string
          org_id?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_messages: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          internal: boolean
          ticket_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          internal?: boolean
          ticket_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          internal?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_daily: {
        Row: {
          day: string
          metric: string
          org_id: string
          value: number
        }
        Insert: {
          day?: string
          metric: string
          org_id: string
          value?: number
        }
        Update: {
          day?: string
          metric?: string
          org_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "usage_daily_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          data: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          data?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          data?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { invite_token: string }; Returns: string }
      admin_broadcast: {
        Args: { audience?: string; body: string; link?: string; title: string }
        Returns: number
      }
      admin_orgs: {
        Args: { search?: string }
        Returns: {
          created_at: string
          designs: number
          id: string
          members: number
          name: string
          owner_email: string
          personal: boolean
          plan_id: string
          projects: number
          sub_status: string
        }[]
      }
      admin_set_plan: {
        Args: {
          org: string
          period_end?: string
          plan: string
          sub_status?: string
        }
        Returns: undefined
      }
      admin_set_role: {
        Args: {
          new_role: Database["public"]["Enums"]["app_role"]
          target: string
        }
        Returns: undefined
      }
      admin_set_status: {
        Args: { new_status: string; target: string }
        Returns: undefined
      }
      admin_stats: { Args: never; Returns: Json }
      admin_timeseries: {
        Args: { days?: number }
        Returns: {
          day: string
          designs: number
          projects: number
          scans: number
          signups: number
          tickets: number
        }[]
      }
      admin_users: {
        Args: { page?: number; page_size?: number; search?: string }
        Returns: {
          app_role: Database["public"]["Enums"]["app_role"]
          avatar_url: string
          created_at: string
          designs: number
          email: string
          full_name: string
          id: string
          last_seen_at: string
          orgs: number
          projects: number
          status: string
          total: number
        }[]
      }
      cleanup_old_data: { Args: never; Returns: undefined }
      collect_monitor_results: { Args: never; Returns: number }
      delete_my_account: { Args: never; Returns: undefined }
      get_shared: { Args: { share_token: string }; Returns: Json }
      leave_organization: { Args: { org: string }; Returns: undefined }
      my_invitations: {
        Args: never
        Returns: {
          expires_at: string
          id: string
          invited_by_name: string
          org_id: string
          org_name: string
          role: Database["public"]["Enums"]["member_role"]
          token: string
        }[]
      }
      org_quota: { Args: { org: string }; Returns: Json }
      run_monitor_checks: { Args: never; Returns: number }
      touch_presence: {
        Args: { app_version?: string; device_name?: string; platform: string }
        Returns: undefined
      }
      track_usage: {
        Args: { amount?: number; metric: string; org: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "user" | "admin" | "superadmin"
      member_role: "owner" | "admin" | "editor" | "viewer"
      ticket_priority: "low" | "normal" | "high" | "urgent"
      ticket_status: "open" | "pending" | "resolved" | "closed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["user", "admin", "superadmin"],
      member_role: ["owner", "admin", "editor", "viewer"],
      ticket_priority: ["low", "normal", "high", "urgent"],
      ticket_status: ["open", "pending", "resolved", "closed"],
    },
  },
} as const
