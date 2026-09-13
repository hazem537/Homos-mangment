export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type AppRole = 'admin' | 'accountant' | 'warehouse'
export type TransferKind = 'transfer' | 'settlement' | 'other' | 'commission'
export type SupplierAccountType = 'normal' | 'investment' | 'company'
export type DeliveryCostKind = 'nolon' | 'nathriyat'

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string
          full_name: string | null
          role: AppRole
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          username: string
          full_name?: string | null
          role?: AppRole
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          username?: string
          full_name?: string | null
          role?: AppRole
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      seasons: {
        Row: {
          id: string
          name: string
          year: number
          ardab_factor: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          year: number
          ardab_factor?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          year?: number
          ardab_factor?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          id: string
          name: string
          notes: string | null
          is_active: boolean
          account_type: SupplierAccountType
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          notes?: string | null
          is_active?: boolean
          account_type?: SupplierAccountType
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          notes?: string | null
          is_active?: boolean
          account_type?: SupplierAccountType
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      warehouses: {
        Row: {
          id: string
          name: string
          is_active: boolean
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          is_active?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          is_active?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      purchases: {
        Row: {
          id: string
          season_id: string
          supplier_id: string
          purchase_date: string
          quantity_kg: number
          ardab: number
          price_per_ardab: number
          total_price: number
          notes: string | null
          is_cancelled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          season_id: string
          supplier_id: string
          purchase_date?: string
          quantity_kg: number
          ardab: number
          price_per_ardab: number
          total_price: number
          notes?: string | null
          is_cancelled?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          season_id?: string
          supplier_id?: string
          purchase_date?: string
          quantity_kg?: number
          ardab?: number
          price_per_ardab?: number
          total_price?: number
          notes?: string | null
          is_cancelled?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'purchases_season_id_fkey'
            columns: ['season_id']
            isOneToOne: false
            referencedRelation: 'seasons'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'purchases_supplier_id_fkey'
            columns: ['supplier_id']
            isOneToOne: false
            referencedRelation: 'suppliers'
            referencedColumns: ['id']
          }
        ]
      }
      cash_transfers: {
        Row: {
          id: string
          season_id: string
          supplier_id: string
          transfer_date: string
          amount: number
          kind: TransferKind
          notes: string | null
          is_cancelled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          season_id: string
          supplier_id: string
          transfer_date?: string
          amount: number
          kind?: TransferKind
          notes?: string | null
          is_cancelled?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          season_id?: string
          supplier_id?: string
          transfer_date?: string
          amount?: number
          kind?: TransferKind
          notes?: string | null
          is_cancelled?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'cash_transfers_season_id_fkey'
            columns: ['season_id']
            isOneToOne: false
            referencedRelation: 'seasons'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'cash_transfers_supplier_id_fkey'
            columns: ['supplier_id']
            isOneToOne: false
            referencedRelation: 'suppliers'
            referencedColumns: ['id']
          }
        ]
      }
      warehouse_deliveries: {
        Row: {
          id: string
          season_id: string
          warehouse_id: string
          supplier_id: string
          delivery_date: string
          quantity_kg: number
          ardab: number
          nolon_total: number
          nathriyat_total: number
          vehicle_number: string | null
          notes: string | null
          is_cancelled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          season_id: string
          warehouse_id: string
          supplier_id: string
          delivery_date?: string
          quantity_kg: number
          ardab: number
          nolon_total?: number
          nathriyat_total?: number
          vehicle_number?: string | null
          notes?: string | null
          is_cancelled?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          season_id?: string
          warehouse_id?: string
          supplier_id?: string
          delivery_date?: string
          quantity_kg?: number
          ardab?: number
          nolon_total?: number
          nathriyat_total?: number
          vehicle_number?: string | null
          notes?: string | null
          is_cancelled?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'warehouse_deliveries_season_id_fkey'
            columns: ['season_id']
            isOneToOne: false
            referencedRelation: 'seasons'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'warehouse_deliveries_warehouse_id_fkey'
            columns: ['warehouse_id']
            isOneToOne: false
            referencedRelation: 'warehouses'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'warehouse_deliveries_supplier_id_fkey'
            columns: ['supplier_id']
            isOneToOne: false
            referencedRelation: 'suppliers'
            referencedColumns: ['id']
          }
        ]
      }
      delivery_cost_payments: {
        Row: {
          id: string
          delivery_id: string
          kind: DeliveryCostKind
          amount: number
          payment_date: string
          notes: string | null
          is_cancelled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          delivery_id: string
          kind: DeliveryCostKind
          amount: number
          payment_date?: string
          notes?: string | null
          is_cancelled?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          delivery_id?: string
          kind?: DeliveryCostKind
          amount?: number
          payment_date?: string
          notes?: string | null
          is_cancelled?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'delivery_cost_payments_delivery_id_fkey'
            columns: ['delivery_id']
            isOneToOne: false
            referencedRelation: 'warehouse_deliveries'
            referencedColumns: ['id']
          }
        ]
      }
    }
    Views: {
      purchase_ledger: {
        Row: {
          id: string
          season_id: string
          supplier_id: string
          purchase_date: string
          quantity_kg: number
          ardab: number
          price_per_ardab: number
          total_price: number
          notes: string | null
          is_cancelled: boolean
          created_at: string
          updated_at: string
          running_avg_price: number
        }
        Relationships: [
          {
            foreignKeyName: 'purchases_season_id_fkey'
            columns: ['season_id']
            isOneToOne: false
            referencedRelation: 'seasons'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'purchases_supplier_id_fkey'
            columns: ['supplier_id']
            isOneToOne: false
            referencedRelation: 'suppliers'
            referencedColumns: ['id']
          }
        ]
      }
    }
    Functions: {
      warehouse_balances: {
        Args: {
          p_season_id?: string | null
        }
        Returns: {
          warehouse_id: string
          warehouse_name: string
          notes: string | null
          is_active: boolean
          kg_total: number
          ardab_total: number
        }[]
      }
      supplier_balances: {
        Args: {
          p_season_id?: string | null
        }
        Returns: {
          supplier_id: string
          supplier_name: string
          notes: string | null
          is_active: boolean
          account_type: SupplierAccountType
          purchases_total: number
          transfers_total: number
          commission_total: number
          balance: number
          ardab_total: number
          ardab_delivered: number
          ardab_remaining: number
        }[]
      }
      supplier_due: {
        Args: {
          p_supplier_id: string
          p_season_id?: string | null
        }
        Returns: {
          supplier_id: string
          supplier_name: string
          account_type: SupplierAccountType
          purchases_total: number
          transfers_total: number
          commission_total: number
          balance: number
          ardab_total: number
          ardab_delivered: number
          ardab_remaining: number
        }[]
      }
    }
    Enums: {
      app_role: AppRole
      transfer_kind: TransferKind
      supplier_account_type: SupplierAccountType
      delivery_cost_kind: DeliveryCostKind
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
