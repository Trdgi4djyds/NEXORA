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
      app_insights_apps: {
        Row: {
          app_id: string
          created_at: string
          id: string
          ingest_key: string
          name: string
          owner: string
        }
        Insert: {
          app_id: string
          created_at?: string
          id?: string
          ingest_key?: string
          name?: string
          owner?: string
        }
        Update: {
          app_id?: string
          created_at?: string
          id?: string
          ingest_key?: string
          name?: string
          owner?: string
        }
        Relationships: []
      }
      app_insights_events: {
        Row: {
          app: string
          at: string
          detail: Json | null
          id: number
          install: string
          kind: string
          locale: string | null
          model: string | null
          os: string | null
          received_at: string
          signature: string | null
          version: string | null
          version_code: number | null
        }
        Insert: {
          app: string
          at?: string
          detail?: Json | null
          id?: never
          install: string
          kind: string
          locale?: string | null
          model?: string | null
          os?: string | null
          received_at?: string
          signature?: string | null
          version?: string | null
          version_code?: number | null
        }
        Update: {
          app?: string
          at?: string
          detail?: Json | null
          id?: never
          install?: string
          kind?: string
          locale?: string | null
          model?: string | null
          os?: string | null
          received_at?: string
          signature?: string | null
          version?: string | null
          version_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "app_insights_events_app_fkey"
            columns: ["app"]
            isOneToOne: false
            referencedRelation: "app_insights_apps"
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
      design_libraries: {
        Row: {
          data: Json
          id: string
          kind: string
          name: string
          org_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          data?: Json
          id?: string
          kind: string
          name: string
          org_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          data?: Json
          id?: string
          kind?: string
          name?: string
          org_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "design_libraries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      design_review_links: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          doc_local_id: string
          kind: string
          media_url: string | null
          mode: string
          name: string
          org_id: string
          pages: Json
          token: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          doc_local_id: string
          kind?: string
          media_url?: string | null
          mode?: string
          name?: string
          org_id: string
          pages?: Json
          token?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          doc_local_id?: string
          kind?: string
          media_url?: string | null
          mode?: string
          name?: string
          org_id?: string
          pages?: Json
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "design_review_links_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      design_reviews: {
        Row: {
          author: string
          comment: string
          created_at: string
          decision: string
          id: string
          page: number
          t: number | null
          token: string
          x: number | null
          y: number | null
        }
        Insert: {
          author: string
          comment?: string
          created_at?: string
          decision?: string
          id?: string
          page?: number
          t?: number | null
          token: string
          x?: number | null
          y?: number | null
        }
        Update: {
          author?: string
          comment?: string
          created_at?: string
          decision?: string
          id?: string
          page?: number
          t?: number | null
          token?: string
          x?: number | null
          y?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "design_reviews_token_fkey"
            columns: ["token"]
            isOneToOne: false
            referencedRelation: "design_review_links"
            referencedColumns: ["token"]
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
      invoices: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          customer: Json
          due_at: string | null
          id: string
          issued_at: string | null
          issuer: Json | null
          lines: Json
          notes: string
          number: string | null
          org_id: string | null
          paid_at: string | null
          sent_at: string | null
          sent_to: string | null
          status: string
          subtotal_cents: number
          tax_cents: number
          tax_rate: number
          total_cents: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          customer?: Json
          due_at?: string | null
          id?: string
          issued_at?: string | null
          issuer?: Json | null
          lines?: Json
          notes?: string
          number?: string | null
          org_id?: string | null
          paid_at?: string | null
          sent_at?: string | null
          sent_to?: string | null
          status?: string
          subtotal_cents?: number
          tax_cents?: number
          tax_rate?: number
          total_cents?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          customer?: Json
          due_at?: string | null
          id?: string
          issued_at?: string | null
          issuer?: Json | null
          lines?: Json
          notes?: string
          number?: string | null
          org_id?: string | null
          paid_at?: string | null
          sent_at?: string | null
          sent_to?: string | null
          status?: string
          subtotal_cents?: number
          tax_cents?: number
          tax_rate?: number
          total_cents?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      monitor_events: {
        Row: {
          at: string
          id: string
          kind: string
          label: string
          monitor_id: string | null
          org_id: string
          source: string
        }
        Insert: {
          at?: string
          id?: string
          kind?: string
          label?: string
          monitor_id?: string | null
          org_id: string
          source?: string
        }
        Update: {
          at?: string
          id?: string
          kind?: string
          label?: string
          monitor_id?: string | null
          org_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitor_events_monitor_id_fkey"
            columns: ["monitor_id"]
            isOneToOne: false
            referencedRelation: "monitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitor_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      monitor_hooks: {
        Row: {
          created_at: string
          org_id: string
          token: string
        }
        Insert: {
          created_at?: string
          org_id: string
          token: string
        }
        Update: {
          created_at?: string
          org_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitor_hooks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      monitor_hourly: {
        Row: {
          hour: string
          lat_max: number | null
          lat_n: number
          lat_sum: number
          monitor_id: string
          n: number
          ok: number
          org_id: string
          p50: number | null
          p95: number | null
        }
        Insert: {
          hour: string
          lat_max?: number | null
          lat_n?: number
          lat_sum?: number
          monitor_id: string
          n?: number
          ok?: number
          org_id: string
          p50?: number | null
          p95?: number | null
        }
        Update: {
          hour?: string
          lat_max?: number | null
          lat_n?: number
          lat_sum?: number
          monitor_id?: string
          n?: number
          ok?: number
          org_id?: string
          p50?: number | null
          p95?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "monitor_hourly_monitor_id_fkey"
            columns: ["monitor_id"]
            isOneToOne: false
            referencedRelation: "monitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitor_hourly_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      monitor_incidents: {
        Row: {
          ack_at: string | null
          ack_by: string | null
          cause: string
          checks: number
          closed_by: string | null
          ended_at: string | null
          escalated_at: string | null
          id: string
          kind: string
          last_cause: string
          monitor_id: string
          note: string
          notified: number
          notified_at: string | null
          org_id: string
          resolution: string
          started_at: string
        }
        Insert: {
          ack_at?: string | null
          ack_by?: string | null
          cause?: string
          checks?: number
          closed_by?: string | null
          ended_at?: string | null
          escalated_at?: string | null
          id?: string
          kind: string
          last_cause?: string
          monitor_id: string
          note?: string
          notified?: number
          notified_at?: string | null
          org_id: string
          resolution?: string
          started_at?: string
        }
        Update: {
          ack_at?: string | null
          ack_by?: string | null
          cause?: string
          checks?: number
          closed_by?: string | null
          ended_at?: string | null
          escalated_at?: string | null
          id?: string
          kind?: string
          last_cause?: string
          monitor_id?: string
          note?: string
          notified?: number
          notified_at?: string | null
          org_id?: string
          resolution?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitor_incidents_monitor_id_fkey"
            columns: ["monitor_id"]
            isOneToOne: false
            referencedRelation: "monitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitor_incidents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      monitor_maintenance: {
        Row: {
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          label: string
          local_id: string | null
          monitor_id: string | null
          org_id: string
          recur: string
          starts_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          label?: string
          local_id?: string | null
          monitor_id?: string | null
          org_id: string
          recur?: string
          starts_at: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          label?: string
          local_id?: string | null
          monitor_id?: string | null
          org_id?: string
          recur?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitor_maintenance_monitor_id_fkey"
            columns: ["monitor_id"]
            isOneToOne: false
            referencedRelation: "monitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitor_maintenance_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      monitor_probe_jobs: {
        Row: {
          created_at: string
          monitor_id: string
          url: string
        }
        Insert: {
          created_at?: string
          monitor_id: string
          url: string
        }
        Update: {
          created_at?: string
          monitor_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitor_probe_jobs_monitor_id_fkey"
            columns: ["monitor_id"]
            isOneToOne: true
            referencedRelation: "monitors"
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
      monitor_webhooks: {
        Row: {
          created_at: string
          created_by: string | null
          enabled: boolean
          events: string
          id: string
          name: string
          org_id: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          events?: string
          id?: string
          name?: string
          org_id: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          events?: string
          id?: string
          name?: string
          org_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitor_webhooks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      monitors: {
        Row: {
          active: boolean
          app_site_id: string | null
          confirm_count: number
          content_hash: string | null
          created_at: string
          created_by: string | null
          dns_expect: string | null
          dns_last: string | null
          dns_type: string
          dns_watch: boolean
          domain_checked_at: string | null
          domain_days: number | null
          domain_warn_days: number
          escalate_min: number
          expected_status: number
          fail_streak: number
          first_fail_at: string | null
          heartbeat_grace_min: number
          heartbeat_token: string | null
          id: string
          interval_minutes: number
          json_expect: string | null
          json_op: string
          json_path: string | null
          keyword: string | null
          kind: string
          last_checked_at: string | null
          last_error: string | null
          last_latency_ms: number | null
          last_ok_at: string | null
          last_ping_at: string | null
          last_status: string
          method: string
          muted_until: string | null
          name: string
          org_id: string
          project_id: string | null
          regional_at: string | null
          regional_colo: string | null
          regional_status: string | null
          req_body: string | null
          req_headers: Json
          slo: number
          slow_streak: number
          status_since: string | null
          threshold_ms: number
          updated_at: string
          url: string
          watch_change: boolean
        }
        Insert: {
          active?: boolean
          app_site_id?: string | null
          confirm_count?: number
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          dns_expect?: string | null
          dns_last?: string | null
          dns_type?: string
          dns_watch?: boolean
          domain_checked_at?: string | null
          domain_days?: number | null
          domain_warn_days?: number
          escalate_min?: number
          expected_status?: number
          fail_streak?: number
          first_fail_at?: string | null
          heartbeat_grace_min?: number
          heartbeat_token?: string | null
          id?: string
          interval_minutes?: number
          json_expect?: string | null
          json_op?: string
          json_path?: string | null
          keyword?: string | null
          kind?: string
          last_checked_at?: string | null
          last_error?: string | null
          last_latency_ms?: number | null
          last_ok_at?: string | null
          last_ping_at?: string | null
          last_status?: string
          method?: string
          muted_until?: string | null
          name?: string
          org_id: string
          project_id?: string | null
          regional_at?: string | null
          regional_colo?: string | null
          regional_status?: string | null
          req_body?: string | null
          req_headers?: Json
          slo?: number
          slow_streak?: number
          status_since?: string | null
          threshold_ms?: number
          updated_at?: string
          url: string
          watch_change?: boolean
        }
        Update: {
          active?: boolean
          app_site_id?: string | null
          confirm_count?: number
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          dns_expect?: string | null
          dns_last?: string | null
          dns_type?: string
          dns_watch?: boolean
          domain_checked_at?: string | null
          domain_days?: number | null
          domain_warn_days?: number
          escalate_min?: number
          expected_status?: number
          fail_streak?: number
          first_fail_at?: string | null
          heartbeat_grace_min?: number
          heartbeat_token?: string | null
          id?: string
          interval_minutes?: number
          json_expect?: string | null
          json_op?: string
          json_path?: string | null
          keyword?: string | null
          kind?: string
          last_checked_at?: string | null
          last_error?: string | null
          last_latency_ms?: number | null
          last_ok_at?: string | null
          last_ping_at?: string | null
          last_status?: string
          method?: string
          muted_until?: string | null
          name?: string
          org_id?: string
          project_id?: string | null
          regional_at?: string | null
          regional_colo?: string | null
          regional_status?: string | null
          req_body?: string | null
          req_headers?: Json
          slo?: number
          slow_streak?: number
          status_since?: string | null
          threshold_ms?: number
          updated_at?: string
          url?: string
          watch_change?: boolean
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
      nx_alert_prefs: {
        Row: {
          quiet_from: number | null
          quiet_to: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          quiet_from?: number | null
          quiet_to?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          quiet_from?: number | null
          quiet_to?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      nx_app_trials: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          local_id: string
          name: string
          org_id: string | null
          plan_at_creation: string
          platform: string
          source_kind: string
          source_url: string | null
          trial_ends_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          local_id: string
          name?: string
          org_id?: string | null
          plan_at_creation?: string
          platform?: string
          source_kind?: string
          source_url?: string | null
          trial_ends_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          local_id?: string
          name?: string
          org_id?: string | null
          plan_at_creation?: string
          platform?: string
          source_kind?: string
          source_url?: string | null
          trial_ends_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nx_app_trials_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nx_app_trials_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nx_billing: {
        Row: {
          cancel_at_period_end: boolean
          current_period_end: string | null
          customer_id: string | null
          period: string
          provider: string
          reminded_for: string | null
          status: string
          subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          current_period_end?: string | null
          customer_id?: string | null
          period?: string
          provider?: string
          reminded_for?: string | null
          status?: string
          subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          current_period_end?: string | null
          customer_id?: string | null
          period?: string
          provider?: string
          reminded_for?: string | null
          status?: string
          subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      nx_client_logs: {
        Row: {
          created_at: string
          detail: Json
          device_id: string | null
          event: string
          id: number
          ip: string | null
          level: string
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          detail?: Json
          device_id?: string | null
          event: string
          id?: number
          ip?: string | null
          level?: string
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          detail?: Json
          device_id?: string | null
          event?: string
          id?: number
          ip?: string | null
          level?: string
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nx_client_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "nx_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      nx_commissions: {
        Row: {
          amount_cents: number
          available_at: string
          canceled_at: string | null
          created_at: string
          currency: string
          id: number
          list_cents: number
          note: string
          paid_cents: number
          partner_id: string
          period: string
          rate: number
          source: string
          source_ref: string
          status: string
          user_id: string | null
        }
        Insert: {
          amount_cents: number
          available_at: string
          canceled_at?: string | null
          created_at?: string
          currency?: string
          id?: number
          list_cents?: number
          note?: string
          paid_cents: number
          partner_id: string
          period?: string
          rate: number
          source?: string
          source_ref: string
          status?: string
          user_id?: string | null
        }
        Update: {
          amount_cents?: number
          available_at?: string
          canceled_at?: string | null
          created_at?: string
          currency?: string
          id?: number
          list_cents?: number
          note?: string
          paid_cents?: number
          partner_id?: string
          period?: string
          rate?: number
          source?: string
          source_ref?: string
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nx_commissions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "nx_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      nx_device_accounts: {
        Row: {
          device_id: string
          email: string
          email_norm: string
          first_seen: string
          is_gmail: boolean
          last_ip: string | null
          last_seen: string
          released: boolean
          user_id: string
        }
        Insert: {
          device_id: string
          email?: string
          email_norm?: string
          first_seen?: string
          is_gmail?: boolean
          last_ip?: string | null
          last_seen?: string
          released?: boolean
          user_id: string
        }
        Update: {
          device_id?: string
          email?: string
          email_norm?: string
          first_seen?: string
          is_gmail?: boolean
          last_ip?: string | null
          last_seen?: string
          released?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nx_device_accounts_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "nx_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      nx_devices: {
        Row: {
          app_version: string
          blocked: boolean
          device_hash: string
          first_ip: string | null
          first_seen: string
          id: string
          last_ip: string | null
          last_seen: string
          name: string
          os: string
          trial_user: string | null
        }
        Insert: {
          app_version?: string
          blocked?: boolean
          device_hash: string
          first_ip?: string | null
          first_seen?: string
          id?: string
          last_ip?: string | null
          last_seen?: string
          name?: string
          os?: string
          trial_user?: string | null
        }
        Update: {
          app_version?: string
          blocked?: boolean
          device_hash?: string
          first_ip?: string | null
          first_seen?: string
          id?: string
          last_ip?: string | null
          last_seen?: string
          name?: string
          os?: string
          trial_user?: string | null
        }
        Relationships: []
      }
      nx_email_log: {
        Row: {
          created_at: string
          id: number
          kind: string
          request_id: number | null
          to_email: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          kind?: string
          request_id?: number | null
          to_email?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          kind?: string
          request_id?: number | null
          to_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      nx_invoice_counters: {
        Row: {
          last: number
          year: number
        }
        Insert: {
          last?: number
          year: number
        }
        Update: {
          last?: number
          year?: number
        }
        Relationships: []
      }
      nx_license_checks: {
        Row: {
          app_version: string
          created_at: string
          detail: Json
          device_id: string | null
          id: number
          ip: string | null
          ok: boolean
          plan: string
          reason: string
          source: string
          user_id: string | null
        }
        Insert: {
          app_version?: string
          created_at?: string
          detail?: Json
          device_id?: string | null
          id?: number
          ip?: string | null
          ok: boolean
          plan?: string
          reason?: string
          source?: string
          user_id?: string | null
        }
        Update: {
          app_version?: string
          created_at?: string
          detail?: Json
          device_id?: string | null
          id?: number
          ip?: string | null
          ok?: boolean
          plan?: string
          reason?: string
          source?: string
          user_id?: string | null
        }
        Relationships: []
      }
      nx_licenses: {
        Row: {
          activated_at: string | null
          created_at: string
          granted_at: string | null
          granted_by: string | null
          id: string
          key: string
          last_check_at: string | null
          max_devices: number | null
          note: string
          override_until: string | null
          plan_override: string | null
          source: string
          status: string
          trial_ends_at: string | null
          user_id: string
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          key: string
          last_check_at?: string | null
          max_devices?: number | null
          note?: string
          override_until?: string | null
          plan_override?: string | null
          source?: string
          status?: string
          trial_ends_at?: string | null
          user_id: string
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          key?: string
          last_check_at?: string | null
          max_devices?: number | null
          note?: string
          override_until?: string | null
          plan_override?: string | null
          source?: string
          status?: string
          trial_ends_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      nx_partner_access_codes: {
        Row: {
          code: string
          created_at: string
          month: string
          partner_id: string
          used_at: string | null
        }
        Insert: {
          code: string
          created_at?: string
          month: string
          partner_id: string
          used_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          month?: string
          partner_id?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nx_partner_access_codes_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "nx_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      nx_partners: {
        Row: {
          activated_at: string | null
          created_at: string
          created_by: string | null
          email: string
          failed_attempts: number
          id: string
          invite_created_at: string | null
          invite_token: string | null
          last_seen_at: string | null
          locked_until: string | null
          name: string
          note: string
          payout_details: string
          payout_method: string
          status: string
          unlocked_month: string | null
          user_id: string | null
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          failed_attempts?: number
          id?: string
          invite_created_at?: string | null
          invite_token?: string | null
          last_seen_at?: string | null
          locked_until?: string | null
          name?: string
          note?: string
          payout_details?: string
          payout_method?: string
          status?: string
          unlocked_month?: string | null
          user_id?: string | null
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          failed_attempts?: number
          id?: string
          invite_created_at?: string | null
          invite_token?: string | null
          last_seen_at?: string | null
          locked_until?: string | null
          name?: string
          note?: string
          payout_details?: string
          payout_method?: string
          status?: string
          unlocked_month?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      nx_pay_sessions: {
        Row: {
          amount_cents: number
          charged: string | null
          checkout_url: string
          created_at: string
          currency: string
          id: string
          net_amount: string | null
          paid_at: string | null
          paid_currency: string | null
          period: string
          ref: string
          referral_code: string | null
          status: string
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          amount_cents: number
          charged?: string | null
          checkout_url?: string
          created_at?: string
          currency?: string
          id: string
          net_amount?: string | null
          paid_at?: string | null
          paid_currency?: string | null
          period?: string
          ref: string
          referral_code?: string | null
          status?: string
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          amount_cents?: number
          charged?: string | null
          checkout_url?: string
          created_at?: string
          currency?: string
          id?: string
          net_amount?: string | null
          paid_at?: string | null
          paid_currency?: string | null
          period?: string
          ref?: string
          referral_code?: string | null
          status?: string
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      nx_payments: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          event_id: string
          id: number
          kind: string
          provider: string
          user_id: string | null
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          currency?: string
          event_id: string
          id?: number
          kind?: string
          provider: string
          user_id?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          event_id?: string
          id?: number
          kind?: string
          provider?: string
          user_id?: string | null
        }
        Relationships: []
      }
      nx_payouts: {
        Row: {
          admin_note: string
          amount_cents: number
          details: string
          id: string
          method: string
          partner_id: string
          processed_at: string | null
          processed_by: string | null
          reference: string
          requested_at: string
          status: string
        }
        Insert: {
          admin_note?: string
          amount_cents: number
          details?: string
          id?: string
          method: string
          partner_id: string
          processed_at?: string | null
          processed_by?: string | null
          reference?: string
          requested_at?: string
          status?: string
        }
        Update: {
          admin_note?: string
          amount_cents?: number
          details?: string
          id?: string
          method?: string
          partner_id?: string
          processed_at?: string | null
          processed_by?: string | null
          reference?: string
          requested_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "nx_payouts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "nx_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      nx_private_config: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      nx_quota_usage: {
        Row: {
          metric: string
          period_start: string
          subject_id: string
          updated_at: string
          value: number
        }
        Insert: {
          metric: string
          period_start: string
          subject_id: string
          updated_at?: string
          value?: number
        }
        Update: {
          metric?: string
          period_start?: string
          subject_id?: string
          updated_at?: string
          value?: number
        }
        Relationships: []
      }
      nx_referral_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          label: string
          partner_id: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          label?: string
          partner_id: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          label?: string
          partner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nx_referral_codes_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "nx_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      nx_referrals: {
        Row: {
          code: string
          code_id: string | null
          created_at: string
          partner_id: string
          source: string
          user_id: string
        }
        Insert: {
          code?: string
          code_id?: string | null
          created_at?: string
          partner_id: string
          source?: string
          user_id: string
        }
        Update: {
          code?: string
          code_id?: string | null
          created_at?: string
          partner_id?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nx_referrals_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "nx_referral_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nx_referrals_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "nx_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      nx_sessions: {
        Row: {
          app_version: string
          device_id: string | null
          ended_at: string | null
          id: string
          ip: string | null
          last_seen: string
          started_at: string
          user_id: string
        }
        Insert: {
          app_version?: string
          device_id?: string | null
          ended_at?: string | null
          id?: string
          ip?: string | null
          last_seen?: string
          started_at?: string
          user_id: string
        }
        Update: {
          app_version?: string
          device_id?: string | null
          ended_at?: string | null
          id?: string
          ip?: string | null
          last_seen?: string
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nx_sessions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "nx_devices"
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
          badge: string
          created_at: string
          currency: string
          description: string
          features: Json
          id: string
          limits: Json
          name: string
          perms: Json
          price_month_cents: number
          price_year_cents: number
          sort: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          badge?: string
          created_at?: string
          currency?: string
          description?: string
          features?: Json
          id: string
          limits?: Json
          name: string
          perms?: Json
          price_month_cents?: number
          price_year_cents?: number
          sort?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          badge?: string
          created_at?: string
          currency?: string
          description?: string
          features?: Json
          id?: string
          limits?: Json
          name?: string
          perms?: Json
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
      rum_events: {
        Row: {
          at: string
          cls: number | null
          device: string
          err: string | null
          err_src: string | null
          fcp: number | null
          id: number
          inp: number | null
          lcp: number | null
          org_id: string
          path: string
          site_id: string
          ttfb: number | null
        }
        Insert: {
          at?: string
          cls?: number | null
          device?: string
          err?: string | null
          err_src?: string | null
          fcp?: number | null
          id?: number
          inp?: number | null
          lcp?: number | null
          org_id: string
          path?: string
          site_id: string
          ttfb?: number | null
        }
        Update: {
          at?: string
          cls?: number | null
          device?: string
          err?: string | null
          err_src?: string | null
          fcp?: number | null
          id?: number
          inp?: number | null
          lcp?: number | null
          org_id?: string
          path?: string
          site_id?: string
          ttfb?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rum_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rum_events_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "rum_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      rum_sites: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          key: string
          name: string
          org_id: string
          origins: string[]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          key?: string
          name?: string
          org_id: string
          origins?: string[]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          key?: string
          name?: string
          org_id?: string
          origins?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "rum_sites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      status_pages: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          intro: string
          monitor_ids: string[]
          org_id: string
          published: boolean
          show_incidents: boolean
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          intro?: string
          monitor_ids?: string[]
          org_id: string
          published?: boolean
          show_incidents?: boolean
          slug: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          intro?: string
          monitor_ids?: string[]
          org_id?: string
          published?: boolean
          show_incidents?: boolean
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "status_pages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      status_subscribers: {
        Row: {
          confirmed_at: string | null
          created_at: string
          email: string
          id: string
          page_id: string
          token: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          email: string
          id?: string
          page_id: string
          token: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          email?: string
          id?: string
          page_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "status_subscribers_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "status_pages"
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
      app_insights_cleanup: { Args: never; Returns: undefined }
      app_insights_register: {
        Args: { p_app_id: string; p_name?: string }
        Returns: {
          id: string
          ingest_key: string
        }[]
      }
      app_insights_summary: {
        Args: { p_app: string; p_days?: number }
        Returns: Json
      }
      app_track: { Args: { p_events: Json; p_key: string }; Returns: number }
      cleanup_old_data: { Args: never; Returns: undefined }
      collect_monitor_results: { Args: never; Returns: number }
      delete_my_account: { Args: never; Returns: undefined }
      get_shared: { Args: { share_token: string }; Returns: Json }
      leave_organization: { Args: { org: string }; Returns: undefined }
      monitor_incident_action: {
        Args: { p_action: string; p_incident: string; p_note?: string }
        Returns: {
          ack_at: string | null
          ack_by: string | null
          cause: string
          checks: number
          closed_by: string | null
          ended_at: string | null
          escalated_at: string | null
          id: string
          kind: string
          last_cause: string
          monitor_id: string
          note: string
          notified: number
          notified_at: string | null
          org_id: string
          resolution: string
          started_at: string
        }
        SetofOptions: {
          from: "*"
          to: "monitor_incidents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      monitor_overview: {
        Args: { p_buckets?: number; p_hours?: number; p_org?: string }
        Returns: Json
      }
      monitor_series: {
        Args: { p_buckets?: number; p_hours?: number; p_monitor: string }
        Returns: Json
      }
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
      nx_admin_commission_cancel: {
        Args: { p_id: number; p_note?: string }
        Returns: Json
      }
      nx_admin_device_unlink: {
        Args: { p_device: string; p_user: string }
        Returns: Json
      }
      nx_admin_license_grant: {
        Args: {
          p_days?: number
          p_email: string
          p_max_devices?: number
          p_note?: string
          p_plan: string
        }
        Returns: Json
      }
      nx_admin_license_rekey: { Args: { p_id: string }; Returns: string }
      nx_admin_license_update: {
        Args: { p_id: string; p_patch: Json }
        Returns: Json
      }
      nx_admin_partner_code: {
        Args: { p_partner: string; p_regenerate?: boolean }
        Returns: Json
      }
      nx_admin_partner_create: {
        Args: { p_email: string; p_name: string; p_note?: string }
        Returns: Json
      }
      nx_admin_partner_invite_reset: {
        Args: { p_partner: string }
        Returns: Json
      }
      nx_admin_partner_update: {
        Args: {
          p_name?: string
          p_note?: string
          p_partner: string
          p_status?: string
          p_unlock?: boolean
        }
        Returns: Json
      }
      nx_admin_partners: { Args: never; Returns: Json }
      nx_admin_payout_update: {
        Args: {
          p_note?: string
          p_payout: string
          p_reference?: string
          p_status: string
        }
        Returns: Json
      }
      nx_admin_policy_set: {
        Args: { p_key: string; p_value: Json }
        Returns: Json
      }
      nx_admin_referral_assign: {
        Args: { p_code: string; p_email: string }
        Returns: Json
      }
      nx_admin_referral_overview: { Args: never; Returns: Json }
      nx_admin_referral_payment: {
        Args: {
          p_note?: string
          p_paid_cents: number
          p_period?: string
          p_user: string
        }
        Returns: Json
      }
      nx_admin_referral_settings: { Args: { p_value: Json }; Returns: Json }
      nx_admin_referrals: { Args: { p_limit?: number }; Returns: Json }
      nx_admin_required: { Args: never; Returns: undefined }
      nx_alert_email: {
        Args: { p_kind?: string; p_subject: string; p_text: string }
        Returns: Json
      }
      nx_alert_email_result: { Args: { p_id: number }; Returns: Json }
      nx_app_build: {
        Args: {
          p_feature?: string
          p_local_id: string
          p_name?: string
          p_platform?: string
          p_source_kind?: string
          p_url?: string
        }
        Returns: Json
      }
      nx_app_claim: {
        Args: {
          p_local_id: string
          p_name?: string
          p_org?: string
          p_platform?: string
          p_source_kind?: string
          p_url?: string
        }
        Returns: Json
      }
      nx_app_release: { Args: { p_local_id: string }; Returns: boolean }
      nx_app_state: {
        Args: {
          p_admin: boolean
          p_plan: string
          p_row: Database["public"]["Tables"]["nx_app_trials"]["Row"]
        }
        Returns: Json
      }
      nx_app_status: { Args: { p_local_ids?: string[] }; Returns: Json }
      nx_app_trial_extend: {
        Args: { p_days: number; p_id: string }
        Returns: string
      }
      nx_app_used: { Args: { p_plan: string; p_uid: string }; Returns: number }
      nx_billing_apply: {
        Args: {
          p_amount?: number
          p_cancel_at_end?: boolean
          p_currency?: string
          p_customer?: string
          p_event_id: string
          p_kind?: string
          p_period?: string
          p_period_end?: string
          p_provider: string
          p_secret: string
          p_status: string
          p_subscription?: string
          p_user: string
        }
        Returns: Json
      }
      nx_billing_remind: { Args: never; Returns: number }
      nx_brevo_post: {
        Args: {
          p_attachments?: Json
          p_html: string
          p_subject: string
          p_tag: string
          p_text: string
          p_to: string
          p_to_name: string
        }
        Returns: number
      }
      nx_brevo_send: {
        Args: {
          p_kicker?: string
          p_subject: string
          p_text: string
          p_to: string
          p_to_name: string
        }
        Returns: number
      }
      nx_brevo_set_key: { Args: { p_key: string }; Returns: undefined }
      nx_brevo_test: { Args: { p_to: string }; Returns: number }
      nx_can_edit_org: { Args: { p_org: string }; Returns: boolean }
      nx_can_read_org: { Args: { p_org: string }; Returns: boolean }
      nx_content_hash: { Args: { p: string }; Returns: string }
      nx_deploy_mark: {
        Args: { p_label?: string; p_token: string; p_url?: string }
        Returns: Json
      }
      nx_duration: { Args: { p: string }; Returns: string }
      nx_email_audience: {
        Args: { p_audience: string }
        Returns: {
          email: string
          first_name: string
          full_name: string
          id: string
        }[]
      }
      nx_email_broadcast: {
        Args: {
          p_audience: string
          p_dry_run?: boolean
          p_html: string
          p_subject: string
          p_tag?: string
          p_text: string
        }
        Returns: Json
      }
      nx_email_frame: { Args: { p_html: string }; Returns: string }
      nx_email_norm: { Args: { p_email: string }; Returns: string }
      nx_email_quota: { Args: { p_needed: number }; Returns: number }
      nx_email_render: {
        Args: { p_tpl: string; p_vars: Json }
        Returns: string
      }
      nx_email_result: { Args: { p_id: number }; Returns: Json }
      nx_email_send_admin: {
        Args: {
          p_html: string
          p_subject: string
          p_tag?: string
          p_text?: string
          p_to: string
          p_to_name: string
        }
        Returns: Json
      }
      nx_email_templates_save: { Args: { p: Json }; Returns: undefined }
      nx_feature_rule: {
        Args: { p_feature: string }
        Returns: Record<string, unknown>
      }
      nx_granted_plan: { Args: { p_uid: string }; Returns: string }
      nx_heartbeat_ping: { Args: { p_token: string }; Returns: Json }
      nx_html: { Args: { p: string }; Returns: string }
      nx_invoice_issue: {
        Args: { p_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          currency: string
          customer: Json
          due_at: string | null
          id: string
          issued_at: string | null
          issuer: Json | null
          lines: Json
          notes: string
          number: string | null
          org_id: string | null
          paid_at: string | null
          sent_at: string | null
          sent_to: string | null
          status: string
          subtotal_cents: number
          tax_cents: number
          tax_rate: number
          total_cents: number
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      nx_invoice_send: {
        Args: {
          p_filename: string
          p_html: string
          p_id: string
          p_pdf_base64: string
          p_subject: string
          p_text: string
          p_to: string
          p_to_name: string
        }
        Returns: Json
      }
      nx_is_admin: { Args: never; Returns: boolean }
      nx_is_admin_uid: { Args: { p_uid: string }; Returns: boolean }
      nx_is_gmail: { Args: { p_email: string }; Returns: boolean }
      nx_json_pick: { Args: { p_json: Json; p_path: string }; Returns: string }
      nx_license_check: {
        Args: {
          p_device: string
          p_integrity?: Json
          p_ip?: string
          p_key?: string
          p_name?: string
          p_nonce?: string
          p_os?: string
          p_secret?: string
          p_version?: string
        }
        Returns: Json
      }
      nx_license_cleanup: { Args: never; Returns: undefined }
      nx_license_device_release: { Args: { p_device: string }; Returns: Json }
      nx_license_get: {
        Args: { p_source?: string; p_uid: string }
        Returns: {
          activated_at: string | null
          created_at: string
          granted_at: string | null
          granted_by: string | null
          id: string
          key: string
          last_check_at: string | null
          max_devices: number | null
          note: string
          override_until: string | null
          plan_override: string | null
          source: string
          status: string
          trial_ends_at: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "nx_licenses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      nx_license_mine: { Args: { p_source?: string }; Returns: Json }
      nx_license_new_key: { Args: never; Returns: string }
      nx_license_verify: { Args: { p_key: string }; Returns: Json }
      nx_limit: { Args: { p_key: string; p_plan: string }; Returns: number }
      nx_mask_email: { Args: { p_email: string }; Returns: string }
      nx_metric_period: { Args: { p_metric: string }; Returns: string }
      nx_money_fr: { Args: { p_cents: number }; Returns: string }
      nx_monitor_cleanup: { Args: never; Returns: undefined }
      nx_monitor_escalate: {
        Args: {
          p_error: string
          p_incident: Database["public"]["Tables"]["monitor_incidents"]["Row"]
          p_monitor: Database["public"]["Tables"]["monitors"]["Row"]
        }
        Returns: undefined
      }
      nx_monitor_event: {
        Args: {
          p_body: string
          p_cause: string
          p_kind: string
          p_monitor: Database["public"]["Tables"]["monitors"]["Row"]
          p_title: string
        }
        Returns: undefined
      }
      nx_monitor_hook_token: { Args: { p_org: string }; Returns: string }
      nx_monitor_in_maint: {
        Args: { p_monitor: Database["public"]["Tables"]["monitors"]["Row"] }
        Returns: boolean
      }
      nx_monitor_monthly_report: { Args: never; Returns: number }
      nx_monitor_notify: {
        Args: {
          p_body: string
          p_monitor: Database["public"]["Tables"]["monitors"]["Row"]
          p_title: string
        }
        Returns: undefined
      }
      nx_monitor_reason: {
        Args: { p_error: string; p_timed_out: boolean }
        Returns: string
      }
      nx_monitor_record: {
        Args: {
          p_at: string
          p_error: string
          p_latency: number
          p_monitor: string
          p_ok: boolean
          p_status: number
        }
        Returns: undefined
      }
      nx_monitor_rollup: { Args: never; Returns: number }
      nx_monitor_webhooks: {
        Args: {
          p_body: string
          p_escalation?: boolean
          p_level: string
          p_monitor: Database["public"]["Tables"]["monitors"]["Row"]
          p_title: string
        }
        Returns: number
      }
      nx_month_end: { Args: never; Returns: string }
      nx_month_start: { Args: never; Returns: string }
      nx_org_perm: { Args: { p_key: string; p_org: string }; Returns: boolean }
      nx_org_plan: { Args: { p_org: string }; Returns: string }
      nx_paid_or_granted: { Args: { p_uid: string }; Returns: string }
      nx_paid_plan: {
        Args: { p_uid: string }
        Returns: {
          org_id: string
          plan_id: string
        }[]
      }
      nx_partner_access_code: {
        Args: { p_partner: string; p_regenerate?: boolean }
        Returns: {
          code: string
          created_at: string
          month: string
          partner_id: string
          used_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "nx_partner_access_codes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      nx_partner_activate: {
        Args: { p_code: string; p_token: string }
        Returns: Json
      }
      nx_partner_balance: { Args: { p_partner: string }; Returns: Json }
      nx_partner_code_create: {
        Args: { p_code: string; p_label?: string }
        Returns: Json
      }
      nx_partner_code_update: {
        Args: { p_active?: boolean; p_id: string; p_label?: string }
        Returns: Json
      }
      nx_partner_codes: { Args: never; Returns: Json }
      nx_partner_commissions: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: Json
      }
      nx_partner_dashboard: { Args: never; Returns: Json }
      nx_partner_gate: {
        Args: never
        Returns: {
          activated_at: string | null
          created_at: string
          created_by: string | null
          email: string
          failed_attempts: number
          id: string
          invite_created_at: string | null
          invite_token: string | null
          last_seen_at: string | null
          locked_until: string | null
          name: string
          note: string
          payout_details: string
          payout_method: string
          status: string
          unlocked_month: string | null
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "nx_partners"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      nx_partner_invite_info: { Args: { p_token: string }; Returns: Json }
      nx_partner_me: { Args: never; Returns: Json }
      nx_partner_payout_cancel: { Args: { p_id: string }; Returns: Json }
      nx_partner_payout_request: {
        Args: { p_amount_cents: number; p_details: string; p_method: string }
        Returns: Json
      }
      nx_partner_payouts: { Args: never; Returns: Json }
      nx_partner_profile_set: {
        Args: { p_details: string; p_method: string }
        Returns: Json
      }
      nx_partner_referrals: { Args: { p_limit?: number }; Returns: Json }
      nx_partner_try_code: {
        Args: { p_code: string; p_partner: string }
        Returns: boolean
      }
      nx_partner_unlock: { Args: { p_code: string }; Returns: Json }
      nx_pay_apply: {
        Args: {
          p_charged?: string
          p_currency?: string
          p_id: string
          p_net?: string
          p_secret: string
          p_transaction: string
        }
        Returns: Json
      }
      nx_pay_session_fail: {
        Args: { p_id: string; p_secret: string; p_transaction?: string }
        Returns: boolean
      }
      nx_pay_session_find: {
        Args: { p_ref: string; p_secret: string }
        Returns: Json
      }
      nx_pay_session_open: {
        Args: {
          p_amount: number
          p_currency?: string
          p_id: string
          p_period: string
          p_ref: string
          p_referral?: string
          p_secret: string
          p_url?: string
          p_user: string
        }
        Returns: Json
      }
      nx_pay_sessions_pending: {
        Args: { p_secret: string; p_transaction: string }
        Returns: Json
      }
      nx_period: { Args: { p_per: string }; Returns: string }
      nx_perm: { Args: { p_key: string; p_plan: string }; Returns: boolean }
      nx_plan_label: { Args: { p_plan: string }; Returns: string }
      nx_plan_needed: {
        Args: { p_metric: string; p_perm: string }
        Returns: string
      }
      nx_plan_rank: { Args: { p_plan: string }; Returns: number }
      nx_plan_status: { Args: { p_org?: string }; Returns: Json }
      nx_policy: { Args: { p_key: string }; Returns: Json }
      nx_policy_int: {
        Args: {
          p: Json
          p_default: number
          p_max?: number
          p_min?: number
          p_name: string
        }
        Returns: number
      }
      nx_probe_jobs: { Args: { p_secret: string }; Returns: Json }
      nx_probe_report: {
        Args: { p_results: Json; p_secret: string }
        Returns: number
      }
      nx_probe_secret_init: { Args: never; Returns: string }
      nx_probe_secret_ok: { Args: { p_secret: string }; Returns: boolean }
      nx_public_url: { Args: { p_url: string }; Returns: boolean }
      nx_referral_active: { Args: { p_user: string }; Returns: boolean }
      nx_referral_attach: {
        Args: { p_code: string; p_source?: string }
        Returns: Json
      }
      nx_referral_audit: {
        Args: { p_action: string; p_meta?: Json }
        Returns: undefined
      }
      nx_referral_cfg: { Args: never; Returns: Json }
      nx_referral_commission_add: {
        Args: {
          p_currency: string
          p_paid_cents: number
          p_period?: string
          p_ref: string
          p_source: string
          p_user: string
        }
        Returns: boolean
      }
      nx_referral_mine: { Args: never; Returns: Json }
      nx_referral_month_codes: { Args: never; Returns: number }
      nx_referral_mrr: { Args: { p_partner: string }; Returns: Json }
      nx_referral_prices: { Args: never; Returns: Json }
      nx_referral_random: { Args: { p_len?: number }; Returns: string }
      nx_referral_resolve: { Args: { p_code: string }; Returns: Json }
      nx_release_policy: { Args: never; Returns: Json }
      nx_release_seen: {
        Args: { p_publication: Json; p_secret: string }
        Returns: boolean
      }
      nx_request_ip: {
        Args: { p_ip?: string; p_secret?: string }
        Returns: string
      }
      nx_review_get: { Args: { p_token: string }; Returns: Json }
      nx_review_place: {
        Args: { p_kind: string; p_page: number; p_t: number }
        Returns: string
      }
      nx_review_post: {
        Args: {
          p_author: string
          p_comment: string
          p_decision: string
          p_page: number
          p_t?: number
          p_token: string
          p_x?: number
          p_y?: number
        }
        Returns: Json
      }
      nx_rum_cleanup: { Args: never; Returns: undefined }
      nx_rum_collect: {
        Args: { p_events: Json; p_key: string; p_origin: string }
        Returns: number
      }
      nx_security_report: {
        Args: {
          p_detail?: Json
          p_device: string
          p_ip?: string
          p_reason: string
          p_secret: string
          p_source?: string
          p_version?: string
        }
        Returns: Json
      }
      nx_session_ping: {
        Args: { p_end?: boolean; p_events?: Json; p_session: string }
        Returns: Json
      }
      nx_status_broadcast: {
        Args: {
          p_body: string
          p_monitor: Database["public"]["Tables"]["monitors"]["Row"]
          p_title: string
        }
        Returns: number
      }
      nx_status_confirm: { Args: { p_token: string }; Returns: Json }
      nx_status_page: { Args: { p_slug: string }; Returns: Json }
      nx_status_subscribe: {
        Args: { p_email: string; p_slug: string }
        Returns: Json
      }
      nx_status_unsubscribe: { Args: { p_token: string }; Returns: Json }
      nx_strip_icon: { Args: { p: string }; Returns: string }
      nx_use_feature: {
        Args: { p_amount?: number; p_check_only?: boolean; p_feature: string }
        Returns: Json
      }
      nx_user_plan: {
        Args: { p_uid: string }
        Returns: {
          org_id: string
          plan_id: string
        }[]
      }
      nx_version_num: { Args: { p_version: string }; Returns: number[] }
      nx_webhook_body: {
        Args: {
          p_body: string
          p_level: string
          p_title: string
          p_url: string
        }
        Returns: Json
      }
      nx_worker_secret_ok: { Args: { p_secret: string }; Returns: boolean }
      org_quota: { Args: { org: string }; Returns: Json }
      rum_summary: { Args: { p_hours?: number; p_site: string }; Returns: Json }
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
