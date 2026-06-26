export interface ReportSummary {
  from_date: string;
  to_date: string;
  total_revenue: number;
  month_revenue: number;
  today_revenue: number;
  avg_daily: number;
  avg_ticket: number;
  transaction_count: number;
  rejected_amount: number;
  rejected_count: number;
  pending_count: number;
  new_users: number;
  confirmation_rate: number;
  is_today_in_range: boolean;
}

export interface TimelinePoint {
  date: string;
  revenue: number;
  transactions: number;
  new_users: number;
}

export interface BreakdownItem {
  label: string;
  count: number;
  revenue: number;
}

export interface TopUserRow {
  user_id: number;
  username?: string | null;
  full_name?: string | null;
  total: number;
  transaction_count: number;
}
