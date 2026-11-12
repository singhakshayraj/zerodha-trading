import { notFound } from "next/navigation";
import AskEvalClient from "./client";

// [P-54 spike] Local-only harness: the eval spec injects a fixture and a
// question list, picks a model, and reads the traces back. 404 in production.
export default function AskEvalPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AskEvalClient />;
}
