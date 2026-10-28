# ⚡ TraceLite — Lightweight Distributed Tracing & Causal Diagnosis Engine

> Part of the **Antigravity 20-Project Systems Engineering Portfolio**

TraceLite is an OpenTelemetry-compatible causal graph analyzer and root-cause localization platform. Rather than overwhelming engineers with thousands of raw spans, TraceLite parses execution DAGs, calculates actual span self-time, and pinpoints root-cause latency bottlenecks and cascade failures using historical p95 baselines.

---

## 🏗️ Architecture

```
OpenTelemetry Spans (Flat Array)
         │
         ▼
┌───────────────────────────┐
│    CausalGraphBuilder     │ ──> Parent-Child Tree, Depth, Self-Time Calculation
└───────────────────────────┘
         │
         ▼
┌───────────────────────────┐
│   Critical Path Engine    │ ──> Dominating Sequential Dependency Chain
└───────────────────────────┘
         │
         ▼
┌───────────────────────────┐
│     RootCauseEngine       │ ──> Baseline Deviation + Blame Score (0-100)
└───────────────────────────┘
         │
         ▼
Interactive Trace UI Waterfall & Visual Flamegraph (ui/index.html)
```

---

## 🚀 Quick Start

### 1. Run Tests
```bash
npm test
```

### 2. Launch Individual UI Dashboard
```bash
npm run ui
```
Opens the interactive distributed tracing console at `http://localhost:4020`.

---

## 💡 Key Capabilities

- **Self-Time vs Child-Wait Isolation:** Accurately subtracts downstream network and database latency from orchestrator services.
- **Critical Path Extraction:** Solves the longest sequential delay chain dominating the user experience.
- **Causal Blame Scoring:** Ranks culprits from 0 to 100 based on deviation from historical SLAs and failure propagation.
