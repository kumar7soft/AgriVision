"use client";

export default function SetupErrorScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="text-4xl">⚙️</div>
      <h2 className="text-lg font-semibold text-neutral-900">GEMINI_API_KEY is not set</h2>
      <p className="max-w-sm text-sm text-neutral-600">
        Copy <code className="rounded bg-neutral-100 px-1 py-0.5">.env.example</code> to{" "}
        <code className="rounded bg-neutral-100 px-1 py-0.5">.env.local</code>, add a free API key from{" "}
        <span className="font-medium">aistudio.google.com</span>, and restart the dev server.
      </p>
    </div>
  );
}
