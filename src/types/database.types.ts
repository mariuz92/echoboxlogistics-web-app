export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      contact_messages: {
        Row: {
          company: string | null
          created_at: string
          email: string
          email_error: string | null
          emailed_at: string | null
          handled: boolean
          id: string
          ip_hash: string | null
          locale: string | null
          message: string
          name: string
          phone: string | null
          user_agent: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          email_error?: string | null
          emailed_at?: string | null
          handled?: boolean
          id?: string
          ip_hash?: string | null
          locale?: string | null
          message: string
          name: string
          phone?: string | null
          user_agent?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          email_error?: string | null
          emailed_at?: string | null
          handled?: boolean
          id?: string
          ip_hash?: string | null
          locale?: string | null
          message?: string
          name?: string
          phone?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      guides: {
        Row: {
          created_at: string
          email: string | null
          email_key: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          phone_digits: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          email_key?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          phone_digits?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          email_key?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          phone_digits?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          email_key: string | null
          expires_at: string
          full_name: string | null
          id: string
          invited_by: string | null
          roles: Database["public"]["Enums"]["app_role"][]
          tenant_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          email_key?: string | null
          expires_at?: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          roles: Database["public"]["Enums"]["app_role"][]
          tenant_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          email_key?: string | null
          expires_at?: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          roles?: Database["public"]["Enums"]["app_role"][]
          tenant_id?: string
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
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "rider_activity"
            referencedColumns: ["rider_id"]
          },
          {
            foreignKeyName: "invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          from_status: Database["public"]["Enums"]["order_status"] | null
          id: number
          order_id: string
          payload: Json
          tenant_id: string
          to_status: Database["public"]["Enums"]["order_status"] | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: never
          order_id: string
          payload?: Json
          tenant_id: string
          to_status?: Database["public"]["Enums"]["order_status"] | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: never
          order_id?: string
          payload?: Json
          tenant_id?: string
          to_status?: Database["public"]["Enums"]["order_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "order_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          balance: number
          created_at: string
          created_by: string | null
          delivered_at: string | null
          delivery_address: string
          delivery_at: string
          delivery_rider_id: string | null
          extra_radios: number
          guide_email: string | null
          guide_id: string | null
          guide_name: string
          guide_phone: string | null
          id: string
          invoice_required: boolean
          lost_radios: number
          notes: string | null
          picked_up_at: string | null
          pickup_address: string | null
          pickup_at: string | null
          pickup_rider_id: string | null
          radio_channel: number | null
          radios_count: number
          source: Database["public"]["Enums"]["order_source"]
          status: Database["public"]["Enums"]["order_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivery_address: string
          delivery_at: string
          delivery_rider_id?: string | null
          extra_radios?: number
          guide_email?: string | null
          guide_id?: string | null
          guide_name: string
          guide_phone?: string | null
          id?: string
          invoice_required?: boolean
          lost_radios?: number
          notes?: string | null
          picked_up_at?: string | null
          pickup_address?: string | null
          pickup_at?: string | null
          pickup_rider_id?: string | null
          radio_channel?: number | null
          radios_count?: number
          source?: Database["public"]["Enums"]["order_source"]
          status?: Database["public"]["Enums"]["order_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivery_address?: string
          delivery_at?: string
          delivery_rider_id?: string | null
          extra_radios?: number
          guide_email?: string | null
          guide_id?: string | null
          guide_name?: string
          guide_phone?: string | null
          id?: string
          invoice_required?: boolean
          lost_radios?: number
          notes?: string | null
          picked_up_at?: string | null
          pickup_address?: string | null
          pickup_at?: string | null
          pickup_rider_id?: string | null
          radio_channel?: number | null
          radios_count?: number
          source?: Database["public"]["Enums"]["order_source"]
          status?: Database["public"]["Enums"]["order_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "rider_activity"
            referencedColumns: ["rider_id"]
          },
          {
            foreignKeyName: "orders_delivery_rider_id_fkey"
            columns: ["delivery_rider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_delivery_rider_id_fkey"
            columns: ["delivery_rider_id"]
            isOneToOne: false
            referencedRelation: "rider_activity"
            referencedColumns: ["rider_id"]
          },
          {
            foreignKeyName: "orders_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "guides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_pickup_rider_id_fkey"
            columns: ["pickup_rider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_pickup_rider_id_fkey"
            columns: ["pickup_rider_id"]
            isOneToOne: false
            referencedRelation: "rider_activity"
            referencedColumns: ["rider_id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          disabled: boolean
          email: string
          full_name: string
          id: string
          last_login_at: string | null
          phone: string | null
          roles: Database["public"]["Enums"]["app_role"][]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          disabled?: boolean
          email: string
          full_name?: string
          id: string
          last_login_at?: string | null
          phone?: string | null
          roles: Database["public"]["Enums"]["app_role"][]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          disabled?: boolean
          email?: string
          full_name?: string
          id?: string
          last_login_at?: string | null
          phone?: string | null
          roles?: Database["public"]["Enums"]["app_role"][]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          channel_max: number
          channel_min: number
          channels_exclusive: boolean
          created_at: string
          description: string | null
          disabled_channels: number[]
          domain: string | null
          id: string
          is_active: boolean
          name: string
          name_key: string | null
          public_booking_enabled: boolean
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          channel_max?: number
          channel_min?: number
          channels_exclusive?: boolean
          created_at?: string
          description?: string | null
          disabled_channels?: number[]
          domain?: string | null
          id?: string
          is_active?: boolean
          name: string
          name_key?: string | null
          public_booking_enabled?: boolean
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          channel_max?: number
          channel_min?: number
          channels_exclusive?: boolean
          created_at?: string
          description?: string | null
          disabled_channels?: number[]
          domain?: string | null
          id?: string
          is_active?: boolean
          name?: string
          name_key?: string | null
          public_booking_enabled?: boolean
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      rider_activity: {
        Row: {
          active_orders: number | null
          current_leg: string | null
          current_order_id: string | null
          current_status: Database["public"]["Enums"]["order_status"] | null
          heading_to: string | null
          in_progress: boolean | null
          is_busy: boolean | null
          last_activity_at: string | null
          rider_id: string | null
          rider_name: string | null
          scheduled_at: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_platform_invitation: {
        Args: never
        Returns: {
          avatar_url: string | null
          created_at: string
          disabled: boolean
          email: string
          full_name: string
          id: string
          last_login_at: string | null
          phone: string | null
          roles: Database["public"]["Enums"]["app_role"][]
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_set_status: {
        Args: {
          p_order_id: string
          p_status: Database["public"]["Enums"]["order_status"]
        }
        Returns: {
          balance: number
          created_at: string
          created_by: string | null
          delivered_at: string | null
          delivery_address: string
          delivery_at: string
          delivery_rider_id: string | null
          extra_radios: number
          guide_email: string | null
          guide_id: string | null
          guide_name: string
          guide_phone: string | null
          id: string
          invoice_required: boolean
          lost_radios: number
          notes: string | null
          picked_up_at: string | null
          pickup_address: string | null
          pickup_at: string | null
          pickup_rider_id: string | null
          radio_channel: number | null
          radios_count: number
          source: Database["public"]["Enums"]["order_source"]
          status: Database["public"]["Enums"]["order_status"]
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assign_order: {
        Args: { p_leg: string; p_order_id: string; p_rider_id: string }
        Returns: {
          balance: number
          created_at: string
          created_by: string | null
          delivered_at: string | null
          delivery_address: string
          delivery_at: string
          delivery_rider_id: string | null
          extra_radios: number
          guide_email: string | null
          guide_id: string | null
          guide_name: string
          guide_phone: string | null
          id: string
          invoice_required: boolean
          lost_radios: number
          notes: string | null
          picked_up_at: string | null
          pickup_address: string | null
          pickup_at: string | null
          pickup_rider_id: string | null
          radio_channel: number | null
          radios_count: number
          source: Database["public"]["Enums"]["order_source"]
          status: Database["public"]["Enums"]["order_status"]
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      bootstrap_profile: {
        Args: never
        Returns: {
          avatar_url: string | null
          created_at: string
          disabled: boolean
          email: string
          full_name: string
          id: string
          last_login_at: string | null
          phone: string | null
          roles: Database["public"]["Enums"]["app_role"][]
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_plan_change_request: { Args: never; Returns: boolean }
      claim_billing_notices: { Args: { p_limit?: number }; Returns: Json }
      claim_push_deliveries: {
        Args: { p_limit?: number }
        Returns: {
          delivery_id: string
          lease_id: string
        }[]
      }
      company_billing: { Args: never; Returns: Json }
      create_public_order: {
        Args: {
          p_delivery_address: string
          p_delivery_at: string
          p_guide_email: string
          p_guide_name: string
          p_guide_phone: string
          p_notes?: string
          p_pickup_address?: string
          p_pickup_at?: string
          p_radios_count: number
          p_slug: string
        }
        Returns: string
      }
      finish_billing_notice: {
        Args: { p_error?: string; p_id: string; p_sent: boolean }
        Returns: undefined
      }
      finish_push_delivery: {
        Args: {
          p_code?: string
          p_delivery_id: string
          p_lease_id: string
          p_result: string
          p_retry_after?: number
          p_token?: string
        }
        Returns: undefined
      }
      get_channel_board: {
        Args: { p_from: string; p_to: string }
        Returns: {
          busy_until: string
          channel: number
          delivery_at: string
          guide_name: string
          order_id: string
          overdue: boolean
          pickup_at: string
          status: Database["public"]["Enums"]["order_status"]
        }[]
      }
      get_dashboard_insights: { Args: { p_month?: string }; Returns: Json }
      get_dashboard_stats: { Args: { p_month?: string }; Returns: Json }
      get_public_plans: { Args: never; Returns: Json }
      get_public_tenant: {
        Args: { p_slug: string }
        Returns: {
          accepting_bookings: boolean
          name: string
          slug: string
          timezone: string
        }[]
      }
      platform_billing_action: {
        Args: { p_action: string; p_values: Json }
        Returns: Json
      }
      platform_billing_overview: { Args: never; Returns: Json }
      platform_company_access: { Args: never; Returns: string }
      platform_console_action: {
        Args: { p_action: string; p_values: Json }
        Returns: Json
      }
      platform_console_snapshot: {
        Args: { p_search?: string; p_tenant_id?: string }
        Returns: Json
      }
      platform_finish_invitation: {
        Args: { p_attempt_id: string; p_invitation_id: string; p_state: string }
        Returns: boolean
      }
      platform_generate_invoices: {
        Args: { p_month?: string; p_reason: string; p_tenant?: string }
        Returns: number
      }
      platform_highlight_plan: {
        Args: { p_code: string; p_highlighted: boolean; p_reason: string }
        Returns: undefined
      }
      platform_issue_detail: { Args: { p_issue_id: string }; Returns: Json }
      platform_issue_queue: {
        Args: {
          p_offset?: number
          p_search?: string
          p_severity?: string
          p_source?: string
          p_state?: string
          p_tenant_id?: string
        }
        Returns: Json
      }
      platform_issue_triage: {
        Args: {
          p_assignee_id?: string
          p_issue_id: string
          p_reason: string
          p_severity: string
          p_state: string
          p_version: number
        }
        Returns: undefined
      }
      platform_operator_status: { Args: never; Returns: string }
      platform_order_history: {
        Args: { p_order_id: string; p_tenant_id: string }
        Returns: Json
      }
      platform_pending_invitation: { Args: never; Returns: Json }
      platform_runtime_settings: { Args: never; Returns: Json }
      platform_update_draft_invoice: {
        Args: {
          p_due_at?: string
          p_external_url?: string
          p_invoice_id: string
          p_lines: Json
          p_reason: string
        }
        Returns: undefined
      }
      read_push_delivery: {
        Args: { p_delivery_id: string; p_lease_id: string }
        Returns: {
          expires_at: string
          kind: string
          leg: string
          order_id: string
          token: string
        }[]
      }
      register_push_device: {
        Args: { p_device_id: string; p_platform: string; p_token: string }
        Returns: undefined
      }
      report_platform_issue: {
        Args: {
          p_area: string
          p_build?: string
          p_code: string
          p_source: string
        }
        Returns: string
      }
      request_plan_change: {
        Args: { p_interval?: string; p_note?: string; p_plan_code: string }
        Returns: string
      }
      rider_order_action: {
        Args: { p_action: string; p_lost?: number; p_order_id: string }
        Returns: {
          balance: number
          created_at: string
          created_by: string | null
          delivered_at: string | null
          delivery_address: string
          delivery_at: string
          delivery_rider_id: string | null
          extra_radios: number
          guide_email: string | null
          guide_id: string | null
          guide_name: string
          guide_phone: string | null
          id: string
          invoice_required: boolean
          lost_radios: number
          notes: string | null
          picked_up_at: string | null
          pickup_address: string | null
          pickup_at: string | null
          pickup_rider_id: string | null
          radio_channel: number | null
          radios_count: number
          source: Database["public"]["Enums"]["order_source"]
          status: Database["public"]["Enums"]["order_status"]
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      touch_login: { Args: never; Returns: undefined }
      unregister_push_device: {
        Args: { p_device_id: string }
        Returns: undefined
      }
      update_member: {
        Args: {
          p_disabled?: boolean
          p_full_name?: string
          p_phone?: string
          p_roles?: Database["public"]["Enums"]["app_role"][]
          p_user_id: string
        }
        Returns: {
          avatar_url: string | null
          created_at: string
          disabled: boolean
          email: string
          full_name: string
          id: string
          last_login_at: string | null
          phone: string | null
          roles: Database["public"]["Enums"]["app_role"][]
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "admin" | "rider"
      order_source: "dashboard" | "public_form"
      order_status:
        | "received"
        | "delivery_assigned"
        | "out_for_delivery"
        | "delivered"
        | "awaiting_pickup"
        | "pickup_assigned"
        | "out_for_pickup"
        | "picked_up"
        | "cancelled"
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
      app_role: ["admin", "rider"],
      order_source: ["dashboard", "public_form"],
      order_status: [
        "received",
        "delivery_assigned",
        "out_for_delivery",
        "delivered",
        "awaiting_pickup",
        "pickup_assigned",
        "out_for_pickup",
        "picked_up",
        "cancelled",
      ],
    },
  },
} as const

