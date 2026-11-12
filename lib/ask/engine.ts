// [P-54 spike] In-browser model via WebLLM (WebGPU). Nothing leaves the
// device except the model download (cached by the browser after the first
// load) and our own read-only /api calls made by the tools.
"use client";

import type { ChatFn } from "./agent";
import { TOOLS } from "./tools";

const ROUTE_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    tool: { type: "string", enum: [...TOOLS.map((t) => t.name), "none"] },
    args: { type: "object", properties: { account: { type: "string" }, symbol: { type: "string" }, month: { type: "string" }, sector: { type: "string" }, kind: { type: "string" } } },
  },
  required: ["tool", "args"],
});

export const MODELS = [
  { id: "Qwen2.5-3B-Instruct-q4f16_1-MLC", label: "Qwen2.5 3B", gb: 2.5 },
  { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", label: "Qwen2.5 1.5B", gb: 1.6 },
  { id: "Llama-3.2-3B-Instruct-q4f16_1-MLC", label: "Llama 3.2 3B", gb: 2.3 },
  { id: "Qwen3.5-2B-q4f16_1-MLC", label: "Qwen3.5 2B", gb: 2.2 },
] as const;
export const DEFAULT_MODEL = MODELS[0].id;

type Engine = { chat: { completions: { create: (req: unknown) => Promise<{ choices: { message: { content: string | null } }[] }> } } };
let current: { id: string; engine: Engine } | null = null;

export const webgpuAvailable = () => typeof navigator !== "undefined" && "gpu" in navigator;

export async function loadModel(id: string, onProgress?: (text: string, pct: number) => void): Promise<ChatFn> {
  if (!current || current.id !== id) {
    const webllm = await import("@mlc-ai/web-llm");
    const engine = (await webllm.CreateMLCEngine(id, {
      initProgressCallback: (p: { text: string; progress: number }) => onProgress?.(p.text, p.progress),
    })) as unknown as Engine;
    current = { id, engine };
  }
  const engine = current.engine;
  let schemaOk = true;
  return async (messages, json) => {
    const base = {
      messages, temperature: 0, max_tokens: json ? 120 : 220,
      ...(/Qwen3/.test(id) ? { extra_body: { enable_thinking: false } } : {}),
    };
    // Constrained decoding: the tool name can only be one of ours. WebLLM
    // wants the schema as a JSON string; if a model rejects grammar mode we
    // fall back to plain prompting (parseRoute extracts the JSON either way).
    if (json && schemaOk) {
      try {
        const r = await engine.chat.completions.create({ ...base,
          response_format: { type: "json_object", schema: ROUTE_SCHEMA } });
        return r.choices[0]?.message?.content ?? "";
      } catch { schemaOk = false; }
    }
    const r = await engine.chat.completions.create(base);
    return r.choices[0]?.message?.content ?? "";
  };
}
