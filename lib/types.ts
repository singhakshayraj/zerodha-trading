export interface UserProfile {
  user_id: string;
  user_name: string;
  email: string;
  broker: string;
  user_type: string;
  avatar_url?: string;
}

export interface Holding {
  tradingsymbol: string;
  exchange: string;
  isin: string;
  t1_quantity: number;
  realised_quantity: number;
  quantity: number;
  authorised_quantity: number;
  opening_quantity: number;
  collateral_quantity: number;
  collateral_type: string;
  discrepancy: boolean;
  average_price: number;
  last_price: number;
  close_price: number;
  pnl: number;
  day_change: number;
  day_change_percentage: number;
}

export interface Position {
  tradingsymbol: string;
  exchange: string;
  instrument_token: number;
  product: string;
  quantity: number;
  overnight_quantity: number;
  multiplier: number;
  average_price: number;
  close_price: number;
  last_price: number;
  value: number;
  pnl: number;
  m2m: number;
  unrealised: number;
  realised: number;
  buy_quantity: number;
  buy_price: number;
  buy_value: number;
  buy_m2m: number;
  sell_quantity: number;
  sell_price: number;
  sell_value: number;
  sell_m2m: number;
  day_buy_quantity: number;
  day_buy_price: number;
  day_buy_value: number;
  day_sell_quantity: number;
  day_sell_price: number;
  day_sell_value: number;
}

export interface Funds {
  equity: {
    enabled: boolean;
    net: number;
    available: {
      adhoc_margin: number;
      cash: number;
      opening_balance: number;
      live_balance: number;
      collateral: number;
      intraday_payin: number;
    };
    utilised: {
      debits: number;
      exposure: number;
      m2m_realised: number;
      m2m_unrealised: number;
      option_premium: number;
      payout: number;
      span: number;
      holding_sales: number;
      turnover: number;
      liquid_collateral: number;
      stock_collateral: number;
      delivery: number;
    };
  };
  commodity: {
    enabled: boolean;
    net: number;
    available: {
      adhoc_margin: number;
      cash: number;
      opening_balance: number;
      live_balance: number;
      collateral: number;
      intraday_payin: number;
    };
    utilised: {
      debits: number;
      exposure: number;
      m2m_realised: number;
      m2m_unrealised: number;
      option_premium: number;
      payout: number;
      span: number;
      holding_sales: number;
      turnover: number;
      liquid_collateral: number;
      stock_collateral: number;
      delivery: number;
    };
  };
}

export interface Order {
  order_id: string;
  exchange_order_id: string;
  parent_order_id: string | null;
  status: string;
  status_message: string | null;
  status_message_raw: string | null;
  order_timestamp: string;
  exchange_update_timestamp: string;
  exchange_timestamp: string;
  variety: string;
  exchange: string;
  tradingsymbol: string;
  instrument_token: number;
  order_type: string;
  transaction_type: string;
  validity: string;
  validity_ttl: number;
  product: string;
  quantity: number;
  disclosed_quantity: number;
  price: number;
  trigger_price: number;
  average_price: number;
  filled_quantity: number;
  pending_quantity: number;
  cancelled_quantity: number;
  market_protection: number;
  meta: Record<string, unknown>;
  tag: string | null;
  guid: string;
}

export interface PlaceOrderParams {
  tradingsymbol: string;
  exchange: string;
  transaction_type: "BUY" | "SELL";
  order_type: "MARKET" | "LIMIT" | "SL" | "SL-M";
  quantity: number;
  product: "CNC" | "NRML" | "MIS";
  price?: number;
  trigger_price?: number;
  validity?: "DAY" | "IOC" | "TTL";
  disclosed_quantity?: number;
  squareoff?: number;
  stoploss?: number;
  trailing_stoploss?: number;
  tag?: string;
}

export interface ZerodhaApiResponse<T> {
  status: string;
  data: T;
  message?: string;
  error_type?: string;
}

export class ZerodhaError extends Error {
  constructor(
    message: string,
    public status: number,
    public errorType?: string
  ) {
    super(message);
    this.name = "ZerodhaError";
  }
}

export interface BrainActivity {
  id: string;
  session_id: string;
  activity_type: string;
  symbol: string | null;
  message: string | null;
  data: Record<string, unknown> | null;
  created_at: string;
}

export type BrainStatus = "OFFLINE" | "ONLINE" | "RUNNING" | "ERROR";

export interface BrainHeartbeat {
  status: BrainStatus;
  lastPing: string | null;
  message: string | null;
  currentCycle: number | null;
  isAlive: boolean;
  secondsSinceLastPing: number | null;
}

export interface SessionConfig {
  sessionId: string;
  capitalDeployed: number;
  maxTrades: number;
  maxLossPercent: number;
  maxProfitPercent: number;
  tradeIntervalSeconds: number;
  stockUniverse: string;
}
