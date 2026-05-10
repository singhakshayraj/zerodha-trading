"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { Order, PlaceOrderParams } from "@/lib/types";
import api from "@/lib/api";
import { Loader2, RefreshCw, CheckCircle2, XCircle, Clock } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  COMPLETE: "text-[#22c55e]",
  REJECTED: "text-[#ef4444]",
  CANCELLED: "text-[#666666]",
  OPEN: "text-[#3b82f6]",
  PENDING: "text-[#f59e0b]",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  COMPLETE: <CheckCircle2 className="w-3 h-3" />,
  REJECTED: <XCircle className="w-3 h-3" />,
  OPEN: <Clock className="w-3 h-3" />,
};

const defaultForm: PlaceOrderParams = {
  tradingsymbol: "",
  exchange: "NSE",
  transaction_type: "BUY",
  order_type: "MARKET",
  quantity: 1,
  product: "CNC",
  price: undefined,
  validity: "DAY",
};

export default function TradingPage() {
  const router = useRouter();
  const { isConnected, hydrateFromStorage } = useAppStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<PlaceOrderParams>(defaultForm);
  const [placing, setPlacing] = useState(false);
  const [orderMsg, setOrderMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  useEffect(() => {
    if (!isConnected) router.push("/connect");
  }, [isConnected, router]);

  async function fetchOrders() {
    setLoading(true);
    try {
      const res = await api.post("/trade/orders");
      setOrders(res.data.orders || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isConnected) fetchOrders();
  }, [isConnected]);

  async function handlePlaceOrder(e: React.FormEvent) {
    e.preventDefault();
    setPlacing(true);
    setOrderMsg(null);
    try {
      const payload = { ...form };
      if (form.order_type === "MARKET") delete payload.price;
      const res = await api.post("/trade/place", payload);
      setOrderMsg({ type: "success", text: `Order placed: ${res.data.order_id}` });
      setForm(defaultForm);
      fetchOrders();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Order failed";
      setOrderMsg({ type: "error", text: msg });
    } finally {
      setPlacing(false);
    }
  }

  function field<K extends keyof PlaceOrderParams>(key: K, value: PlaceOrderParams[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="flex h-screen bg-[#0a0a0a]">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Trading" />
        <main className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <div className="bg-[#111111] border border-[#1f1f1f] rounded-lg p-5">
                <h2 className="text-sm font-medium text-[#f5f5f5] mb-4">Place Order</h2>
                <form onSubmit={handlePlaceOrder} className="space-y-3">
                  <div>
                    <label className="block text-xs text-[#666666] mb-1">Symbol</label>
                    <input
                      value={form.tradingsymbol}
                      onChange={(e) => field("tradingsymbol", e.target.value.toUpperCase())}
                      placeholder="e.g. RELIANCE"
                      required
                      className="w-full bg-[#0a0a0a] border border-[#1f1f1f] rounded px-3 py-2 text-sm text-[#f5f5f5] placeholder-[#444] focus:outline-none focus:border-[#3b82f6] font-mono uppercase"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-[#666666] mb-1">Exchange</label>
                      <select
                        value={form.exchange}
                        onChange={(e) => field("exchange", e.target.value)}
                        className="w-full bg-[#0a0a0a] border border-[#1f1f1f] rounded px-3 py-2 text-sm text-[#f5f5f5] focus:outline-none focus:border-[#3b82f6]"
                      >
                        <option>NSE</option>
                        <option>BSE</option>
                        <option>NFO</option>
                        <option>MCX</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-[#666666] mb-1">Product</label>
                      <select
                        value={form.product}
                        onChange={(e) => field("product", e.target.value as PlaceOrderParams["product"])}
                        className="w-full bg-[#0a0a0a] border border-[#1f1f1f] rounded px-3 py-2 text-sm text-[#f5f5f5] focus:outline-none focus:border-[#3b82f6]"
                      >
                        <option value="CNC">CNC</option>
                        <option value="MIS">MIS</option>
                        <option value="NRML">NRML</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-[#666666] mb-1">Side</label>
                      <div className="flex rounded overflow-hidden border border-[#1f1f1f]">
                        {(["BUY", "SELL"] as const).map((side) => (
                          <button
                            key={side}
                            type="button"
                            onClick={() => field("transaction_type", side)}
                            className={`flex-1 py-2 text-xs font-medium transition-colors ${
                              form.transaction_type === side
                                ? side === "BUY"
                                  ? "bg-[#22c55e] text-white"
                                  : "bg-[#ef4444] text-white"
                                : "bg-[#0a0a0a] text-[#666666] hover:text-[#f5f5f5]"
                            }`}
                          >
                            {side}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-[#666666] mb-1">Order Type</label>
                      <select
                        value={form.order_type}
                        onChange={(e) => field("order_type", e.target.value as PlaceOrderParams["order_type"])}
                        className="w-full bg-[#0a0a0a] border border-[#1f1f1f] rounded px-3 py-2 text-sm text-[#f5f5f5] focus:outline-none focus:border-[#3b82f6]"
                      >
                        <option value="MARKET">MARKET</option>
                        <option value="LIMIT">LIMIT</option>
                        <option value="SL">SL</option>
                        <option value="SL-M">SL-M</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-[#666666] mb-1">Quantity</label>
                      <input
                        type="number"
                        min={1}
                        value={form.quantity}
                        onChange={(e) => field("quantity", parseInt(e.target.value) || 1)}
                        required
                        className="w-full bg-[#0a0a0a] border border-[#1f1f1f] rounded px-3 py-2 text-sm text-[#f5f5f5] focus:outline-none focus:border-[#3b82f6]"
                      />
                    </div>
                    {form.order_type !== "MARKET" && form.order_type !== "SL-M" && (
                      <div>
                        <label className="block text-xs text-[#666666] mb-1">Price</label>
                        <input
                          type="number"
                          step="0.05"
                          value={form.price ?? ""}
                          onChange={(e) => field("price", parseFloat(e.target.value) || undefined)}
                          className="w-full bg-[#0a0a0a] border border-[#1f1f1f] rounded px-3 py-2 text-sm text-[#f5f5f5] focus:outline-none focus:border-[#3b82f6]"
                        />
                      </div>
                    )}
                  </div>

                  {orderMsg && (
                    <div className={`text-xs rounded p-2.5 ${
                      orderMsg.type === "success"
                        ? "bg-[#22c55e]/10 border border-[#22c55e]/20 text-[#22c55e]"
                        : "bg-[#ef4444]/10 border border-[#ef4444]/20 text-[#ef4444]"
                    }`}>
                      {orderMsg.text}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={placing}
                    className={`w-full py-2.5 rounded text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                      form.transaction_type === "BUY"
                        ? "bg-[#22c55e] hover:bg-[#16a34a] text-white"
                        : "bg-[#ef4444] hover:bg-[#dc2626] text-white"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {placing && <Loader2 className="w-4 h-4 animate-spin" />}
                    {placing ? "Placing..." : `${form.transaction_type} ${form.tradingsymbol || "Order"}`}
                  </button>
                </form>
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="bg-[#111111] border border-[#1f1f1f] rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#1f1f1f]">
                  <h2 className="text-sm font-medium text-[#f5f5f5]">Today&apos;s Orders</h2>
                  <button
                    onClick={fetchOrders}
                    className="flex items-center gap-1.5 text-xs text-[#666666] hover:text-[#f5f5f5] transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Refresh
                  </button>
                </div>

                {loading ? (
                  <div className="flex items-center justify-center h-48">
                    <Loader2 className="w-5 h-5 animate-spin text-[#3b82f6]" />
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#1f1f1f]">
                        {["Time", "Symbol", "Type", "Qty", "Price", "Status"].map((h) => (
                          <th key={h} className="text-left px-4 py-3 text-xs text-[#666666] font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((o) => (
                        <tr key={o.order_id} className="border-b border-[#1f1f1f] hover:bg-[#1a1a1a] transition-colors">
                          <td className="px-4 py-3 text-xs text-[#666666]">
                            {o.order_timestamp ? o.order_timestamp.split(" ")[1]?.slice(0, 5) : "-"}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-[#f5f5f5]">{o.tradingsymbol}</p>
                            <p className="text-xs text-[#666666]">{o.exchange}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-medium ${o.transaction_type === "BUY" ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
                              {o.transaction_type}
                            </span>
                            <span className="text-xs text-[#666666] ml-1">{o.order_type}</span>
                          </td>
                          <td className="px-4 py-3 text-[#f5f5f5]">{o.quantity}</td>
                          <td className="px-4 py-3 text-[#f5f5f5]">
                            {o.average_price > 0 ? `₹${o.average_price}` : o.price > 0 ? `₹${o.price}` : "MKT"}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`flex items-center gap-1 text-xs font-medium ${STATUS_COLORS[o.status] || "text-[#666666]"}`}>
                              {STATUS_ICONS[o.status]}
                              {o.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {orders.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-[#666666] text-sm">
                            No orders today
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
