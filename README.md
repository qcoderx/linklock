<p align="center">
  <img src="frontend/public/assets/logo-full.svg" alt="LinkLock" width="360" />
</p>

<h1 align="center">LinkLock</h1>
<p align="center"><strong>Escrow at the speed of a transfer.</strong> Zero signup. A locked, isolated bank account per order. We never hold your money.</p>
<p align="center">Built for the <em>APIConf Lagos × Monnify Developer Challenge 2026</em> · Payments rail: <strong>Monnify</strong></p>

---

## The idea

Social commerce runs on chat. A vendor sends an account number, a buyer sends money on faith — and one of them usually gets burned. Every other escrow makes you sign up for a wallet. **LinkLock is just a link.** Click it and you get the order details plus a temporary bank account. Pay from your normal banking app; the money is caught and **locked** the instant it lands.

The one decision everything hangs on: **LinkLock never pools money.** Every order is backed by its own dedicated **Monnify reserved virtual account**. LinkLock is a non-custodial *routing and release* layer — not a wallet. That is what makes it safe, legal, and reversible.

Two things lift it above the escrows that fail here:

1. **A release state machine with default-release** — silence after delivery pays the honest vendor, so buyers can't hold funds hostage by ghosting the confirm step.
2. **An AI verification layer** — vision AI checks the vendor's proof-of-dispatch and the buyer's proof-of-problem, and compares them, so disputes are settled on evidence. The AI assists; **it never moves money on its own.**

## Release state machine

```
CREATED ──pay(webhook)──▶ LOCKED ──ship+AI proof──▶ SHIPPED ──deliver──▶ DELIVERY_WINDOW
                                                                              │
                     ┌──── buyer taps No (freeze) ◀──────────────────────────┤
                     ▼                                     confirm / timeout  ▼
                 DISPUTED ──vendor ACCEPT──▶ REVERSED                     RELEASED
                     │
                vendor CONTEST
                     ▼
               UNDER_REVIEW ──human──▶ RELEASE · REVERSE · SPLIT
```

- **Default-release:** a buyer who neither confirms nor disputes before the window closes auto-releases to the vendor. This single rule fixes the #1 reason escrows die.
- **Tap No freezes the funds.** No party can force frozen money to move — only the resolution path can.
- **Every money movement is idempotent,** keyed by reference, so duplicate webhooks / retries never double-pay.

## What's real vs. simulated

| Capability | Status |
| --- | --- |
| Monnify auth, **per-order reserved virtual accounts**, bank list | ✅ Live (sandbox) |
| Inbound payment → `LOCKED` via signed webhook | ✅ Live (HMAC-SHA512 verified). A **Simulate payment** button stands in when you can't make a real transfer on camera. |
| **Disbursement** (release to vendor) | ✅ Real Monnify call. If the wallet has Transfer-2FA on, Monnify returns `PENDING_AUTHORIZATION`; see [Transfer 2FA](#a-note-on-transfer-2fa). |
| **Refund / reversal** to buyer | ✅ Real when the inbound payment was real; simulated when the lock was simulated (no real collection reference to refund). |
| AI evidence verification | ✅ Live — Groq `qwen/qwen3.6-27b` (vision). Degrades gracefully if unavailable. |

If no Monnify contract code is set, the whole app still runs in **SIMULATION mode** so it demos end-to-end.

## Architecture

```
linklock/
├── backend/                 Node + Express + node:sqlite (zero native deps)
│   ├── src/
│   │   ├── index.js         server, webhook raw-body capture, default-release sweep
│   │   ├── config.js        env + LIVE/SIMULATION detection
│   │   ├── db.js            schema: orders, evidence, transactions, disputes, messages, events
│   │   ├── stateMachine.js  explicit, guarded transitions
│   │   ├── services/orderService.js   the heart: transitions + idempotent money movements
│   │   ├── routes/          orders · webhooks · admin · meta
│   │   └── lib/             monnify.js · ai.js · upload.js · notify.js · ids.js
│   └── .env                 secrets (gitignored)
└── frontend/                React + Vite + Tailwind (IBM Plex Sans/Mono, yellow + white)
    └── src/pages/           Home (generator) · OrderPay (buyer) · VendorOrder · Console (review)
```

## Run it

Prerequisites: **Node ≥ 20** (built-in SQLite + fetch; developed on Node 24).

```bash
# 1. install
npm run install:all

# 2. configure secrets — copy the example and fill it in
cp backend/.env.example backend/.env      # then edit backend/.env

# 3. run (two terminals)
npm run dev:backend      # http://localhost:4000
npm run dev:frontend     # http://localhost:5173
```

Open **http://localhost:5173**, generate a link, and follow it. The review console is at **/console** (`ADMIN_TOKEN`, dev default `linklock-admin-dev`).

### Required configuration

| Var | What it is |
| --- | --- |
| `MONNIFY_API_KEY` / `MONNIFY_SECRET_KEY` | Sandbox API credentials |
| `MONNIFY_CONTRACT_CODE` | **Dashboard → Settings → API Keys & Webhooks → Contract Code.** Required for real reserved accounts; blank ⇒ simulation mode. |
| `MONNIFY_WALLET_ACCOUNT` | Wallet account number — the *source* for disbursements |
| `LLM_API_KEY` | Groq API key (OpenAI-compatible) |
| `DELIVERY_WINDOW_SECONDS` | Demo override for the confirm window (e.g. `90`) |

### Receiving real webhooks locally

Set your webhook URL in the Monnify dashboard to `https://<your-ngrok>/api/webhooks/monnify` and set `PUBLIC_BASE_URL` to match. The endpoint verifies the `monnify-signature` header before acting.

## A note on Transfer 2FA

This sandbox wallet has **Transfer 2FA** enabled, so a disbursement returns `PENDING_AUTHORIZATION` and Monnify emails an OTP. For a fully-authorized on-camera release, either **disable Transfer 2FA** in the Monnify dashboard, or set `MONNIFY_DISBURSEMENT_OTP` to the emailed code. With 2FA on and `DEMO_MODE=true`, LinkLock records the release as a clearly-labelled *demo completion* so the flow never dead-ends — the transfer is genuinely accepted by Monnify, it just isn't OTP-authorized.

## Demo script (3 minutes)

1. **The link.** Generate a LinkLock link, open the buyer page, pay (Simulate) → screen flips to **LOCKED**, the vendor's *safe-to-ship* message fires.
2. **Scam one — ghosting/fake vendor.** Upload a stock/screenshot as dispatch proof → **AI flags it** and blocks progress. Buyer protected upfront.
3. **Scam two — smart buyer.** Honest vendor ships genuine proof; buyer receives the right item but taps **No** → funds freeze, vendor is pinged, vendor **contests**, a human resolves in the console using the AI evidence summary. Buyer can't keep goods *and* money.
4. **Default release.** A buyer who simply ghosts after delivery → window expires → money **auto-releases** to the honest vendor. No deadlock.

## Security

- Monnify secrets are **server-side only**; the client never holds credentials.
- Webhooks verified with HMAC-SHA512 over the raw body (timing-safe compare).
- Money never moves without a valid state transition; frozen funds can't be forced open.
- Evidence is timestamped at capture; images are downscaled before AI to respect rate limits.

> ⚠️ The API keys shared during this build were pasted in plaintext — **rotate the OpenAI, Monnify, and Groq keys** before any real use.

<p align="center"><sub>One link, both sides safe. Powered by Monnify.</sub></p>
