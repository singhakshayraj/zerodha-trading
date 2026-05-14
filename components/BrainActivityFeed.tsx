"use client";
import { useState, useEffect, useRef } from "react";

interface ActivityEvent {
  id: string;
  session_id: string;
  activity_type: string;
  symbol?: string;
  message?: string;
  data?: Record<string, unknown>;
  created_at: string;
}

export default function BrainActivityFeed({
  sessionId,
  isRunning = true,
}: {
  sessionId?: string | null;
  isRunning?: boolean; // eslint-disable-line @typescript-eslint/no-unused-vars
}) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchActivity = async () => {
    try {
      const url = sessionId
        ? `/api/brain/activity?sessionId=${sessionId}&limit=50`
        : `/api/brain/activity?limit=50`;

      const res = await fetch(url);
      const json = await res.json();

      const activityData = json.activity || [];

      if (Array.isArray(activityData) && activityData.length > 0) {
        setEvents([...activityData].reverse());
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  useEffect(() => {
    fetchActivity();
    const interval = setInterval(fetchActivity, 3000);
    return () => clearInterval(interval);
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  const getIcon = (type: string, message?: string) => {
    if (type === "CYCLE_START")  return "🔄";
    if (type === "ANALYZING")    return "🔍";
    if (type === "ORDER_PLACED") return "✅";
    if (type === "ORDER_FAILED") return "❌";
    if (type === "POSITION_EXIT")return "💰";
    if (type === "ERROR")        return "⚠️";
    if (type === "SIGNAL") {
      if (message?.includes("BUY"))  return "🟢";
      if (message?.includes("SELL")) return "🔴";
      return "⚪";
    }
    return "•";
  };

  const getColor = (type: string, message?: string) => {
    if (type === "ORDER_PLACED")  return "text-green-400 font-bold";
    if (type === "ORDER_FAILED")  return "text-red-400 font-bold";
    if (type === "POSITION_EXIT") return "text-yellow-400";
    if (type === "ERROR")         return "text-orange-400";
    if (type === "CYCLE_START")   return "text-blue-400";
    if (type === "SIGNAL") {
      if (message?.includes("BUY"))  return "text-green-400";
      if (message?.includes("SELL")) return "text-red-400";
      return "text-gray-400";
    }
    return "text-white";
  };

  const formatTime = (ts: string) =>
    new Date(ts).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });

  return (
    <div className="w-full">
      {error && (
        <div className="text-red-400 text-xs p-2 mb-2 bg-red-900/20 rounded">
          Error: {error}
        </div>
      )}
      <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg h-72 md:h-[400px] overflow-y-auto scroll-touch font-mono text-xs p-3">
        {events.length === 0 ? (
          <div className="text-gray-500 italic">Waiting for brain activity...</div>
        ) : (
          <>
            {events.map((event) => (
              <div key={event.id} className="mb-1 leading-relaxed">
                <span className="text-gray-600 mr-2">[{formatTime(event.created_at)}]</span>
                <span className="mr-1">{getIcon(event.activity_type, event.message)}</span>
                <span className={getColor(event.activity_type, event.message)}>
                  {event.symbol && (
                    <span className="text-blue-300 mr-1 font-bold">{event.symbol}</span>
                  )}
                  {event.message}
                </span>
              </div>
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>
      <div className="text-right text-xs text-gray-600 mt-1">{events.length} event{events.length !== 1 ? "s" : ""}</div>
    </div>
  );
}
