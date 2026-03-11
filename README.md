<div align="center">
  <img src="https://via.placeholder.com/150/09f/fff.png" height="100" />
  <h1>🚀 GetaText Automation Bot ✨</h1>
  <p><strong>Multi-threaded, stealthy, fingerprint-injected browser automation script.</strong></p>
</div>

---

## 🌟 Features
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
   - **Accounts:** Rename `accounts.example.json` to `accounts.json` and add your targets.
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
  <i>Developed with ❤️ for seamless web automation.</i>
</div>
