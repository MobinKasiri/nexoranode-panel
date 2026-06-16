export interface Admin {
  username: string;
  full_name: string;
  role: string;
}

export interface Transaction {
  id: number;
  user_id: number;
  amount: number;
  payment_amount: number;
  type: string;
  plan_id?: string;
  service_name?: string;
  payment_method?: string;
  has_receipt: boolean;
  discount_code?: string;
  discount_amount: number;
  status: string;
  created_at: string;
  confirmed_at?: string;
  user?: {
    tg_id: number;
    username?: string;
    full_name: string;
    balance: number;
  };
  plan?: { id: string; gb: number; days: number; price: number; tier_name?: string };
  intent?: Record<string, unknown>;
  user_purchase_count?: number;
}

export interface UserItem {
  tg_id: number;
  username?: string;
  full_name: string;
  balance: number;
  active_configs: number;
  purchases: number;
  is_banned: boolean;
  created_at: string;
}

export interface VPNConfigItem {
  id: number;
  service_name: string;
  user_id: number;
  username?: string;
  plan_gb: number;
  plan_days: number;
  traffic_used_bytes: number;
  traffic_limit_bytes: number;
  expiry_date?: string;
  is_active: boolean;
  subscription_url?: string;
}

export interface DashboardStats {
  total_users: number;
  today_users: number;
  users_change: number;
  active_configs: number;
  today_revenue: number;
  revenue_change_pct: number;
  pending_payments: number;
}

export interface ServerHealth {
  cpu_percent: number;
  ram_percent: number;
  ram_used_gb: number;
  ram_total_gb: number;
  disk_percent: number;
  xray_status: string;
  uptime: string;
  active_connections: number;
}
