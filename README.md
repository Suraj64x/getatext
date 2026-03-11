<div align="center">
  <h1>🚀 GetaText Automation Bot ✨</h1>
  <p><strong>Multi-threaded, stealthy, fingerprint-injected browser automation script.</strong></p>
  
  <p>
    <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript" />
    <img src="https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
    <img src="https://img.shields.io/badge/Puppeteer-40B5A4?style=for-the-badge&logo=puppeteer&logoColor=white" alt="Puppeteer" />
  </p>
</div>

---

## 🌟 Features
- **🔑 API Key Extraction:** Automatically navigates to the user profile and extracts the API Key natively after successful wallet verification.
- **🧠 Smart Error Handling:** Automatically detects "email already used" warnings during registration and dynamically skips/logs the account without freezing.
- **✨ Enhanced Logging:** Vivid time-stamped worker threads, dynamic UI indicators, and fresh terminal gradients.
- **⚡ Multi-Threading:** Run multiple accounts seamlessly in parallel. You choose the thread count!
- **🛡️ Ultimate Stealth:** Powered by `puppeteer-extra-plugin-stealth` to evade modern bot detection.
- **🧬 Hardware Fingerprinting:** Deep Canvas, WebGL, GPU, and CPU spoofing dynamically injected per thread using `fingerprint-injector`.
- **🌐 Proxy Rotation:** Automatically assigns and rotates proxies (HTTP/SOCKS) with full authentication support.
- **🎨 Beautiful CLI UI:** Stunning terminal outputs featuring `chalk`, `ora` spinners, and `gradient-string` rainbows. 🌈
- **🤖 Automated Tasking:** Fully manages Registration, Terms Acceptance, Promo Code injection, and real-time Balance Validation.

## ⚙️ Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- Google Chrome / Chromium installed locally.

## 🚀 Setup & Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Suraj64x/getatext.git
   cd getatext
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure your resources:**
   - **Accounts:** Rename `accounts.example.json` to `accounts.json` and add your targets. **Note: Change account status to `"queue"` (or `"error"`) to run them! Accounts left as `"done"` are skipped.**
   - **Proxies:** Add your proxies to `resources/proxies/proxies.txt` one per line (`http://user:pass@ip:port`).
   - **Fingerprints:** Drop your `.json` or `.tmp` spoofing payloads into `resources/fingerprints/`.

## 🎮 Usage
Start the master orchestrator by simply running:
```bash
node index.js
```
The console will dynamically prompt you for the desired thread count!

## 📂 File Structure
- `index.js` — The robust core logic and puppeteer tasks.
- `accounts.json` — Your active payload queue and live status tracker.
- `successAccounts.json` — Automatically generated file containing successfully verified `$0.50` wallets! 💰
- `sessions/` — Auto-generated persistent browser data for smooth re-entries.
- `resources/` — Holds all proxy lists and fingerprint payloads.

---
<div align="center">
  <i>Developed by SMOKiE with ❤️ for seamless web automation.</i>
</div>
