"use client";

import Link from "next/link";
import { ArrowLeft, Settings, Cpu, ShieldCheck } from "lucide-react";

export default function SettingsPage() {
  return (
    <main style={{ padding: "40px", color: "#e5e7eb" }}>
      <Link href="/" style={{ color: "#60a5fa" }}>
        <ArrowLeft size={16} /> Back to Chat
      </Link>

      <h1 style={{ marginTop: "30px" }}>
        <Settings size={24} /> Settings
      </h1>

      <section style={{ marginTop: "30px" }}>
        <h3><Cpu size={18} /> AI Configuration</h3>
        <p>AI Provider: Ollama</p>
        <p>Model: Qwen 2.5</p>
        <p>Backend: FastAPI (127.0.0.1:8000)</p>
      </section>

      <section style={{ marginTop: "30px" }}>
        <h3><ShieldCheck size={18} /> Security</h3>
        <p>Local document processing configuration.</p>
      </section>
    </main>
  );
}