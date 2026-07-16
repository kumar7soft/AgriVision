"use client";

import { useEffect, useRef, useState } from "react";
import type { SessionMessage } from "@/lib/types";

const STARTER_QUESTIONS = ["What should I fix first?", "How is my soil?", "When should I water?"];

export default function Chat({
  sessionId,
  initialMessages,
}: {
  sessionId: string;
  initialMessages: SessionMessage[];
}) {
  const [messages, setMessages] = useState<SessionMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendQuestion(question: string) {
    if (!question.trim() || loading) return;
    setError(null);
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question, timestamp: Date.now() }]);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, question }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "The AI is busy, try again in a moment.");
      setMessages((prev) => [...prev, { role: "model", content: data.answer, timestamp: Date.now() }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 px-4 pb-8">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Ask AgriTwin</h3>

      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {STARTER_QUESTIONS.map((q) => (
            <button
              key={q}
              onClick={() => sendQuestion(q)}
              className="rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 active:bg-green-100"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-3">
        {messages.length === 0 && (
          <p className="py-6 text-center text-sm text-neutral-400">Ask a question about your farm to get started.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                m.role === "user" ? "bg-green-600 text-white" : "bg-neutral-100 text-neutral-800"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-neutral-100 px-3 py-2 text-sm">
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400" />
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendQuestion(input);
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your farm…"
          className="flex-1 rounded-full border border-neutral-300 px-4 py-2 text-sm focus:border-green-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-full bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
