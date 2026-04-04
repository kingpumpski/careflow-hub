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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      claims: {
        Row: {
          claim_amount: number
          claim_month: number | null
          claim_year: number | null
          created_at: string
          id: string
          insurance_company_id: string
          patient_name: string | null
          preauth_id: string | null
          procedure_name: string | null
          status: string
          submission_date: string
        }
        Insert: {
          claim_amount?: number
          claim_month?: number | null
          claim_year?: number | null
          created_at?: string
          id?: string
          insurance_company_id: string
          patient_name?: string | null
          preauth_id?: string | null
          procedure_name?: string | null
          status?: string
          submission_date?: string
        }
        Update: {
          claim_amount?: number
          claim_month?: number | null
          claim_year?: number | null
          created_at?: string
          id?: string
          insurance_company_id?: string
          patient_name?: string | null
          preauth_id?: string | null
          procedure_name?: string | null
          status?: string
          submission_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "claims_insurance_company_id_fkey"
            columns: ["insurance_company_id"]
            isOneToOne: false
            referencedRelation: "insurance_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_preauth_id_fkey"
            columns: ["preauth_id"]
            isOneToOne: false
            referencedRelation: "pre_authorizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_companies: {
        Row: {
          company_name: string
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          insurance_company_id: string | null
          phone: string | null
        }
        Insert: {
          company_name: string
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          insurance_company_id?: string | null
          phone?: string | null
        }
        Update: {
          company_name?: string
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          insurance_company_id?: string | null
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_companies_insurance_company_id_fkey"
            columns: ["insurance_company_id"]
            isOneToOne: false
            referencedRelation: "insurance_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnosis_codes: {
        Row: {
          category: string | null
          code: string
          created_at: string
          description: string
          id: string
        }
        Insert: {
          category?: string | null
          code: string
          created_at?: string
          description: string
          id?: string
        }
        Update: {
          category?: string | null
          code?: string
          created_at?: string
          description?: string
          id?: string
        }
        Relationships: []
      }
      doctors: {
        Row: {
          contact: string | null
          created_at: string
          doctor_name: string
          hospital: string | null
          id: string
          specialty: string | null
        }
        Insert: {
          contact?: string | null
          created_at?: string
          doctor_name: string
          hospital?: string | null
          id?: string
          specialty?: string | null
        }
        Update: {
          contact?: string | null
          created_at?: string
          doctor_name?: string
          hospital?: string | null
          id?: string
          specialty?: string | null
        }
        Relationships: []
      }
      insurance_companies: {
        Row: {
          address: string | null
          color: string | null
          company_name: string
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          phone: string | null
        }
        Insert: {
          address?: string | null
          color?: string | null
          company_name: string
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
        }
        Update: {
          address?: string | null
          color?: string | null
          company_name?: string
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
        }
        Relationships: []
      }
      ledger_entries: {
        Row: {
          account_credit: string
          account_debit: string
          amount: number
          claim_month: number | null
          claim_year: number | null
          created_at: string
          description: string | null
          entry_date: string
          entry_type: string
          id: string
          insurance_company_id: string | null
          reference: string | null
        }
        Insert: {
          account_credit: string
          account_debit: string
          amount?: number
          claim_month?: number | null
          claim_year?: number | null
          created_at?: string
          description?: string | null
          entry_date?: string
          entry_type?: string
          id?: string
          insurance_company_id?: string | null
          reference?: string | null
        }
        Update: {
          account_credit?: string
          account_debit?: string
          amount?: number
          claim_month?: number | null
          claim_year?: number | null
          created_at?: string
          description?: string | null
          entry_date?: string
          entry_type?: string
          id?: string
          insurance_company_id?: string | null
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_insurance_company_id_fkey"
            columns: ["insurance_company_id"]
            isOneToOne: false
            referencedRelation: "insurance_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string | null
          read: boolean | null
          title: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          read?: boolean | null
          title: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          read?: boolean | null
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      patients: {
        Row: {
          client_company_id: string | null
          created_at: string
          id: string
          insurance_company_id: string | null
          membership_number: string | null
          patient_name: string
          phone: string | null
        }
        Insert: {
          client_company_id?: string | null
          created_at?: string
          id?: string
          insurance_company_id?: string | null
          membership_number?: string | null
          patient_name: string
          phone?: string | null
        }
        Update: {
          client_company_id?: string | null
          created_at?: string
          id?: string
          insurance_company_id?: string | null
          membership_number?: string | null
          patient_name?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_client_company_id_fkey"
            columns: ["client_company_id"]
            isOneToOne: false
            referencedRelation: "client_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_insurance_company_id_fkey"
            columns: ["insurance_company_id"]
            isOneToOne: false
            referencedRelation: "insurance_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_paid: number
          claim_id: string | null
          claim_month: number | null
          claim_year: number | null
          created_at: string
          id: string
          insurance_company_id: string | null
          payment_date: string
          payment_method: string | null
          reference_number: string | null
        }
        Insert: {
          amount_paid?: number
          claim_id?: string | null
          claim_month?: number | null
          claim_year?: number | null
          created_at?: string
          id?: string
          insurance_company_id?: string | null
          payment_date?: string
          payment_method?: string | null
          reference_number?: string | null
        }
        Update: {
          amount_paid?: number
          claim_id?: string | null
          claim_month?: number | null
          claim_year?: number | null
          created_at?: string
          id?: string
          insurance_company_id?: string | null
          payment_date?: string
          payment_method?: string | null
          reference_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_insurance_company_id_fkey"
            columns: ["insurance_company_id"]
            isOneToOne: false
            referencedRelation: "insurance_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      pre_authorizations: {
        Row: {
          created_at: string
          created_by: string | null
          diagnosis: string | null
          doctor_id: string | null
          id: string
          insurance_company_id: string | null
          patient_id: string | null
          procedure_date: string | null
          procedure_id: string | null
          provider_address: string | null
          provider_name: string | null
          provider_phone: string | null
          status: string
          total_cost: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          diagnosis?: string | null
          doctor_id?: string | null
          id?: string
          insurance_company_id?: string | null
          patient_id?: string | null
          procedure_date?: string | null
          procedure_id?: string | null
          provider_address?: string | null
          provider_name?: string | null
          provider_phone?: string | null
          status?: string
          total_cost?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          diagnosis?: string | null
          doctor_id?: string | null
          id?: string
          insurance_company_id?: string | null
          patient_id?: string | null
          procedure_date?: string | null
          procedure_id?: string | null
          provider_address?: string | null
          provider_name?: string | null
          provider_phone?: string | null
          status?: string
          total_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pre_authorizations_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_authorizations_insurance_company_id_fkey"
            columns: ["insurance_company_id"]
            isOneToOne: false
            referencedRelation: "insurance_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_authorizations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_authorizations_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
        ]
      }
      preauth_catalog_items: {
        Row: {
          category: string | null
          created_at: string
          id: string
          item_name: string
          unit_price: number
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          item_name: string
          unit_price?: number
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          item_name?: string
          unit_price?: number
        }
        Relationships: []
      }
      preauth_items: {
        Row: {
          amount: number
          description: string
          id: string
          preauth_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          amount?: number
          description: string
          id?: string
          preauth_id: string
          quantity?: number
          unit_price?: number
        }
        Update: {
          amount?: number
          description?: string
          id?: string
          preauth_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "preauth_items_preauth_id_fkey"
            columns: ["preauth_id"]
            isOneToOne: false
            referencedRelation: "pre_authorizations"
            referencedColumns: ["id"]
          },
        ]
      }
      procedure_templates: {
        Row: {
          created_at: string
          diagnosis_code_id: string | null
          id: string
          items: Json
          procedure_id: string | null
          template_name: string
        }
        Insert: {
          created_at?: string
          diagnosis_code_id?: string | null
          id?: string
          items?: Json
          procedure_id?: string | null
          template_name: string
        }
        Update: {
          created_at?: string
          diagnosis_code_id?: string | null
          id?: string
          items?: Json
          procedure_id?: string | null
          template_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "procedure_templates_diagnosis_code_id_fkey"
            columns: ["diagnosis_code_id"]
            isOneToOne: false
            referencedRelation: "diagnosis_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedure_templates_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
        ]
      }
      procedures: {
        Row: {
          category: string | null
          created_at: string
          default_tariff: number
          description: string | null
          id: string
          procedure_code: string | null
          procedure_name: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          default_tariff?: number
          description?: string | null
          id?: string
          procedure_code?: string | null
          procedure_name: string
        }
        Update: {
          category?: string | null
          created_at?: string
          default_tariff?: number
          description?: string | null
          id?: string
          procedure_code?: string | null
          procedure_name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      withholding_tax: {
        Row: {
          claim_total: number | null
          created_at: string
          id: string
          insurance_company_id: string
          month: number
          tax_amount: number | null
          tax_rate: number | null
          year: number
        }
        Insert: {
          claim_total?: number | null
          created_at?: string
          id?: string
          insurance_company_id: string
          month: number
          tax_amount?: number | null
          tax_rate?: number | null
          year: number
        }
        Update: {
          claim_total?: number | null
          created_at?: string
          id?: string
          insurance_company_id?: string
          month?: number
          tax_amount?: number | null
          tax_rate?: number | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "withholding_tax_insurance_company_id_fkey"
            columns: ["insurance_company_id"]
            isOneToOne: false
            referencedRelation: "insurance_companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "superuser"
        | "admin"
        | "claims_officer"
        | "accounts_officer"
        | "data_entry_officer"
        | "auditor"
        | "viewer"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: [
        "superuser",
        "admin",
        "claims_officer",
        "accounts_officer",
        "data_entry_officer",
        "auditor",
        "viewer",
      ],
    },
  },
} as const
