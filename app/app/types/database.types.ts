export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type AppRole = 'admin' | 'accountant' | 'warehouse'
export type TransferKind = 'transfer' | 'settlement' | 'other' | 'commission'
export type DeliveryCostKind = 'nolon' | 'nathriyat'
export type StockLocationKind = 'section' | 'store' | 'mekla' | 'client' | 'waste'

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
          account_type_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          notes?: string | null
          is_active?: boolean
          account_type_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          notes?: string | null
          is_active?: boolean
          account_type_id?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'suppliers_account_type_id_fkey'
            columns: ['account_type_id']
            isOneToOne: false
            referencedRelation: 'account_types'
            referencedColumns: ['id']
          }
        ]
      }
      warehouses: {
        Row: {
          id: string
          name: string
          is_active: boolean
          notes: string | null
          account_type_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          is_active?: boolean
          notes?: string | null
          account_type_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          is_active?: boolean
          notes?: string | null
          account_type_id?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'warehouses_account_type_id_fkey'
            columns: ['account_type_id']
            isOneToOne: false
            referencedRelation: 'account_types'
            referencedColumns: ['id']
          }
        ]
      }
      account_types: {
        Row: {
          id: string
          name: string
          notes: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          id: string
          name: string
          notes: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock_statuses: {
        Row: {
          id: string
          product_id: string
          name: string
          notes: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          product_id: string
          name: string
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          name?: string
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'stock_statuses_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          }
        ]
      }
      purchases: {
        Row: {
          id: string
          season_id: string
          supplier_id: string
          product_id: string
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
          product_id: string
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
          product_id?: string
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
          },
          {
            foreignKeyName: 'purchases_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          }
        ]
      }
      cash_transfers: {
        Row: {
          id: string
          season_id: string
          supplier_id: string
          product_id: string
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
          product_id: string
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
          product_id?: string
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
          },
          {
            foreignKeyName: 'cash_transfers_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          }
        ]
      }
      warehouse_expenses: {
        Row: {
          id: string
          warehouse_id: string
          season_id: string
          payment_date: string
          amount: number
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          warehouse_id: string
          season_id: string
          payment_date?: string
          amount: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          warehouse_id?: string
          season_id?: string
          payment_date?: string
          amount?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'warehouse_expenses_warehouse_id_fkey'
            columns: ['warehouse_id']
            isOneToOne: false
            referencedRelation: 'warehouses'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'warehouse_expenses_season_id_fkey'
            columns: ['season_id']
            isOneToOne: false
            referencedRelation: 'seasons'
            referencedColumns: ['id']
          }
        ]
      }
      warehouse_sections: {
        Row: {
          id: string
          warehouse_id: string
          name: string
          notes: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          warehouse_id: string
          name: string
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          warehouse_id?: string
          name?: string
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'warehouse_sections_warehouse_id_fkey'
            columns: ['warehouse_id']
            isOneToOne: false
            referencedRelation: 'warehouses'
            referencedColumns: ['id']
          }
        ]
      }
      stores: {
        Row: {
          id: string
          name: string
          notes: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      meklas: {
        Row: {
          id: string
          name: string
          notes: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          id: string
          name: string
          notes: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          id: string
          season_id: string
          product_id: string
          status_id: string
          movement_date: string
          quantity_kg: number
          from_kind: StockLocationKind
          from_id: string
          to_kind: StockLocationKind
          to_id: string
          notes: string | null
          is_cancelled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          season_id: string
          product_id: string
          status_id: string
          movement_date?: string
          quantity_kg: number
          from_kind: StockLocationKind
          from_id: string
          to_kind: StockLocationKind
          to_id: string
          notes?: string | null
          is_cancelled?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          season_id?: string
          product_id?: string
          status_id?: string
          movement_date?: string
          quantity_kg?: number
          from_kind?: StockLocationKind
          from_id?: string
          to_kind?: StockLocationKind
          to_id?: string
          notes?: string | null
          is_cancelled?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'stock_movements_season_id_fkey'
            columns: ['season_id']
            isOneToOne: false
            referencedRelation: 'seasons'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'stock_movements_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'stock_movements_status_id_fkey'
            columns: ['status_id']
            isOneToOne: false
            referencedRelation: 'stock_statuses'
            referencedColumns: ['id']
          }
        ]
      }
      warehouse_deliveries: {
        Row: {
          id: string
          season_id: string
          warehouse_id: string
          section_id: string
          supplier_id: string
          product_id: string
          status_id: string
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
          section_id: string
          supplier_id: string
          product_id: string
          status_id: string
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
          section_id?: string
          supplier_id?: string
          product_id?: string
          status_id?: string
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
            foreignKeyName: 'warehouse_deliveries_section_id_fkey'
            columns: ['section_id']
            isOneToOne: false
            referencedRelation: 'warehouse_sections'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'warehouse_deliveries_supplier_id_fkey'
            columns: ['supplier_id']
            isOneToOne: false
            referencedRelation: 'suppliers'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'warehouse_deliveries_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'warehouse_deliveries_status_id_fkey'
            columns: ['status_id']
            isOneToOne: false
            referencedRelation: 'stock_statuses'
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
          product_id: string
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
          },
          {
            foreignKeyName: 'purchases_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
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
          product_id: string | null
          product_name: string | null
          status_id: string | null
          status_name: string | null
          notes: string | null
          is_active: boolean
          account_type_id: string
          account_type_name: string
          kg_total: number
          ardab_total: number
        }[]
      }
      section_balances: {
        Args: {
          p_warehouse_id: string
          p_season_id?: string | null
        }
        Returns: {
          section_id: string
          section_name: string
          product_id: string | null
          product_name: string | null
          status_id: string | null
          status_name: string | null
          notes: string | null
          is_active: boolean
          kg_in: number
          kg_out: number
          kg_remaining: number
        }[]
      }
      store_balances: {
        Args: {
          p_season_id?: string | null
        }
        Returns: {
          store_id: string
          store_name: string
          product_id: string | null
          product_name: string | null
          status_id: string | null
          status_name: string | null
          notes: string | null
          is_active: boolean
          kg_total: number
        }[]
      }
      mekla_balances: {
        Args: {
          p_season_id?: string | null
        }
        Returns: {
          mekla_id: string
          mekla_name: string
          product_id: string | null
          product_name: string | null
          status_id: string | null
          status_name: string | null
          notes: string | null
          is_active: boolean
          kg_total: number
        }[]
      }
      location_remaining_kg: {
        Args: {
          p_kind: StockLocationKind
          p_id: string
          p_product_id: string
          p_status_id: string
          p_season_id?: string | null
        }
        Returns: number
      }
      supplier_balances: {
        Args: {
          p_season_id?: string | null
        }
        Returns: {
          supplier_id: string
          supplier_name: string
          product_id: string | null
          product_name: string | null
          notes: string | null
          is_active: boolean
          account_type_id: string
          account_type_name: string
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
          product_id: string | null
          product_name: string | null
          account_type_id: string
          account_type_name: string
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
      delivery_cost_kind: DeliveryCostKind
      stock_location_kind: StockLocationKind
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
