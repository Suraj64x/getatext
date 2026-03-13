# 🚀 GetaText Automation Bot v1.0.1 ✨

<div align="center">
  <h3>Multi-threaded Account Generation & API Key Extraction</h3>
  <p><strong>Optimized for 50+ concurrent threads with auto-generated accounts</strong></p>
  
  <p>
    <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript" />
    <img src="https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
    <img src="https://img.shields.io/badge/Puppeteer-40B5A4?style=for-the-badge&logo=puppeteer&logoColor=white" alt="Puppeteer" />
    <img src="https://img.shields.io/badge/Threads-50%2B-red?style=for-the-badge" alt="Threads" />
  </p>
</div>

---

## ⭐ What's New in v1.0.1

✨ **Latest Updates & Improvements:**
- ✅ **Auto-Generated Accounts** - No manual setup needed!
- 🖥️ **Headless Mode Toggle** - Choose speed or visibility
- 📊 **Domain-Specific Excel Export** - `output/successAccounts_[domain].xlsx` auto-updates per domain
- 🧹 **Auto Tab Closing** - Keeps focus on target site
- ⚡ **50+ Thread Support** - Fully optimized
- ⚠️ **Bad Proxy Detection** - Saves failures to `output/badproxies.txt`
-  **Proxy Validation Toggle** - Choose [y/n] to validate proxies or skip
- 📝 **Visible Terminal Input** - Characters now show while typing (prompt-sync)
- 🔧 **Interactive Menu** - Choose [1] Run Bot or [2] Extract API Keys

---

## ⭐ Key Features

### 🎯 Account Management
- **✅ Auto-Generated Accounts** - No manual account creation needed!
- **📧 Custom Email Domains** - Change domain anytime (e.g., @gmail.com, @tonexera.me, @custom.io)
- **🔐 Secure Passwords** - Automatically generated with uppercase, lowercase, numbers & special chars
- **📊 Batch Account Creation** - Generate 50, 100, or 1000+ accounts at once
- **💾 Domain-Specific Excel Export** - All accounts exported to `output/successAccounts_[domain].xlsx` organized by domain (email, password & API key)

### 🌐 Browser Control
- **🖥️ Headless Mode Toggle** - Choose between headless (faster) or visible browser
- **📱 Realistic Screen Sizes** - Multiple resolutions (1280x720 to 2560x1440)
- **🧹 Auto Tab Closing** - Closes extra tabs automatically, keeps focus on target site
- **⚡ Smart Process Cleanup** - Graceful browser closure with force-kill fallback
- **💪 50+ Thread Support** - Optimized for massive parallel execution

### 🛡️ Anti-Detection & Stealth
- **🕵️ Stealth Plugin** - Puppeteer-extra plugin evades bot detection
- **🧬 Hardware Fingerprinting** - Canvas, WebGL, GPU & CPU spoofing per thread
- **🌐 Proxy Rotation** - Round-robin proxy distribution with validation
- **⚠️ Bad Proxy Detection** - Saves non-working proxies to `output/badproxies.txt`
- **🔄 Smart Error Recovery** - Auto re-queues on timeout/proxy failures

### 📈 Performance & Logging
- **📊 Memory Monitoring** - Live heap/RSS memory tracking
- **⚡ Thread Throttling** - Max 5 concurrent browser launches prevents system overload
- **📝 Detailed Logs** - Color-coded worker threads with timestamps
- **🎨 Beautiful CLI UI** - Gradient output, spinners, and live progress

### 📋 Data Management
- **📁 accounts.json** - Auto-generated or manual account list
- **✅ successAccounts_[domain].json** - Successfully created accounts (organized by domain)
- **📊 successAccounts_[domain].xlsx** - Excel file with all account data per domain (auto-updated)
- **❌ badproxies.txt** - List of non-working proxies
- **💾 sessions/** - Browser session data for re-entry

---

## 📋 Prerequisites

- **Node.js** v18+ (Download: https://nodejs.org/)
- **Chrome/Chromium** (usually pre-installed)
- **Windows/Mac/Linux** (Any OS supported)

---

## 🚀 Quick Start

```bash
npm install          # Install dependencies (first time only)
node index.js        # Launch the bot
```

---

## ⚙️ Interactive Setup

### Step 1️⃣: Choose Mode
```
🤖 What would you like to do?
  [1] Run Bot - Generate & Create Accounts
  [2] Extract API Keys - Export from existing accounts

❓ Choose [1 or 2] (Default: 1):
```

**Option [1] - Run Bot:** Generate and create new accounts  
**Option [2] - Extract Keys:** Extract API keys from previously created accounts

---

### (If choosing [1] - Run Bot) Step 2️⃣: Thread Count
```
❓ How many threads would you like to run? [Default: 3]:
```
**Input:** Number (1-100)
- Desktop: 5-20 threads
- Server: 30-50 threads
- High-end: 50-100 threads

### Step 3️⃣: Browser Mode
```
🖥️  Browser mode? [1=Headless (faster), 2=Visible (default)]:
```
**Input:** `1` or `2`

| Mode | Speed | Memory | Best For |
|------|-------|--------|----------|
| **1 - Headless** | 40% faster | 50% less | 50+ threads |
| **2 - Visible** | Standard | Standard | Debugging |

**Examples:**
- Type `1` → No GUI, maximum speed
- Type `2` → See browser, easier to debug

### Step 4️⃣: Email Domain
```
📧 Enter email domain [Default: tonexera.me]:
```
**Input:** Domain name

**Examples:**
- `gmail.com` → john123@gmail.com
- `yahoo.com` → sarah_johnson@yahoo.com
- `mycompany.io` → robert.smith@mycompany.io
- (press Enter) → Uses default

### Step 5️⃣: Account Count
```
🔐 How many accounts do you want to auto-generate? [Default: 5]:
```
**Input:** Number of accounts (10, 50, 100, etc.)

### Step 6️⃣: Proxy Validation (NEW!)
```
🔍 Validate proxies before running? [y/n] (Default: y):
```
**Input:** `y` or `n`

| Option | Behavior |
|--------|----------|
| **y** | Validates all proxies via httpbin.org/ip (slower, ensures quality) |
| **n** | Skips validation, uses all proxies as-is (faster startup) |

---

## 📂 Project Structure

```
getatext-main/
├── index.js                             # Main bot code
├── package.json                         # Dependencies
├── README.md                            # Documentation
├── accounts.json                        # Auto-generated accounts
├── successAccounts_tonexera.me.json    # Created accounts per domain (JSON)
├── successAccounts_gmail.com.json      # Another domain's accounts
│
├── resources/
│   ├── proxies/
│   │   └── proxies.txt                 # Your proxies (one per line)
│   └── fingerprints/                   # Optional fingerprints (.json/.tmp)
│
├── output/                              # Generated files
│   ├── successAccounts_tonexera.me.xlsx # ⭐ Excel per domain (auto-update)
│   ├── successAccounts_gmail.com.xlsx   # Another domain's Excel file
│   └── badproxies.txt                  # Failed proxies
│
└── sessions/                            # Browser sessions
    └── email@domain.com/               # Per-account data
```

---

## 🎯 Usage Examples

### Example 1: Quick Test (Default Settings)
```bash
# Run: node index.js

Choose mode? [1 or 2]: 1
Threads? [3]: (Enter)
Mode? [1=Headless, 2=Visible]: (Enter)
Domain? [tonexera.me]: (Enter)
Accounts? [5]: (Enter)
Validate proxies? [y/n]: y

✅ Creates 5 tonexera.me accounts with 3 visible browsers, proxies validated
```

### Example 2: High-Speed Production (50 threads)
```bash
Choose mode? [1 or 2]: 1
Threads? [3]: 50
Mode? [1=Headless, 2=Visible]: 1
Domain? [tonexera.me]: (Enter)
Accounts? [5]: 100
Validate proxies? [y/n]: y

✅ Creates 100 accounts with 50 headless browsers
⚠️ Memory: ~10-12GB
```

### Example 3: Custom Domain with Skip Validation
```bash
Choose mode? [1 or 2]: 1
Threads? [3]: 30
Mode? [1=Headless, 2=Visible]: 1
Domain? [tonexera.me]: mycompany.io
Accounts? [5]: 50
Validate proxies? [y/n]: n

✅ Creates 50 @mycompany.io accounts, starts immediately (no validation)
```

### Example 4: Extract API Keys Only
```bash
Choose mode? [1 or 2]: 2

✅ Scans output/ for all successAccounts_*.json files
✅ Exports API keys to:
   - api-keys-list.txt (simple list)
   - api-keys-detailed.json (full details)
   - api-keys.csv (spreadsheet format)
```

---

## 🔧 Configuration

### Add Proxies to `resources/proxies/proxies.txt`
```
http://user:pass@proxy1.com:8080
http://user:pass@proxy2.com:8080
socks5://user:pass@proxy3.com:1080
http://ip:port
```

**Format:**
- `http://[user:pass@]ip:port` - HTTP proxy
- `socks5://[user:pass@]ip:port` - SOCKS5 proxy
- One per line
- Auth is optional

**Validation:** Bot automatically validates and saves bad proxies to `output/badproxies.txt`

### Add Fingerprints (Optional) to `resources/fingerprints/`
- Place `.json` or `.tmp` files
- Auto-selected per thread
- Leave empty to skip

---

## 📊 Output Files

### ✅ successAccounts_[domain].xlsx (Excel - Domain-Specific)
Opens in Excel/Google Sheets. Creates one file per email domain:

**Example: successAccounts_tonexera.me.xlsx**
```
Email | Password | API Key | Status | Created At
james.williams@tonex... | K9$mL#pQ@1xZ | sk_live_abc123... | done | 2026-03-11...
```

**Example: successAccounts_gmail.com.xlsx** (if you switch domains)
```
Email | Password | API Key | Status | Created At
jane.doe@gmail.com | A7%mN2@qR#sT | sk_live_xyz789... | done | 2026-03-11...
```

**Updates automatically!**

### ✅ successAccounts_[domain].json (JSON - Domain-Specific)
```json
[
  {
    "email": "james.williams@tonexera.me",
    "password": "K9$mL#pQ@1xZ",
    "apikey": "sk_live_abc123...",
    "status": "done",
    "domain": "@tonexera.me",
    "createdAt": "2026-03-11T14:30:45.123Z"
  }
]
```

### ❌ badproxies.txt
```
http://bad1.com:8080 [2026-03-11T14:25:30.000Z]
http://bad2.com:8080 [2026-03-11T14:26:15.000Z]
```

---

## 🎮 Console Output

```
[14:30:45] [🤖 Worker-1] Initializing account james.williams@tonexera.me ⏳
[14:30:46] [🤖 Worker-2] Launching browser... 🌐
[14:30:48] [🤖 Worker-1] Typed credentials... ⌨️
[14:30:50] [🤖 Worker-2] Accepting terms... ✔️
[14:31:15] [🤖 Worker-1] Waiting for $0.50 balance... 💰
[14:31:30] [🤖 Worker-1] Success! 🎉 Account james.williams@tonexera.me
[14:31:31] [🤖 Worker-1] Browser process closed cleanly ✅
```

### Status Icons

| Icon | Message | Meaning |
|------|---------|---------|
| ⏳ | Initializing | Starting browser |
| 🌐 | Launching | Opening Chrome |
| ⌨️ | Credentials | Filling form |
| ✔️ | Terms | Accepting checkbox |
| 💰 | Balance | Checking credit |
| 🎉 | Success! | Account created |
| 🔑 | API Key | Extracting key |
| ✅ | Browser closed | Safe shutdown |
| 🧹 | Closing tab | Removed extra tab |
| 💥 | Error! | Failed |
| 🔄 | Re-queueing | Retry |

---

## ⚡ Performance Tips

### Maximum Speed (50+ threads):
- Use Headless Mode (1)
- Set threads to 50+
- Use valid proxies
- Minimal fingerprints

### Stability (10-20 threads):
- Use Visible Mode (2)
- Monitor resource usage
- Check console output
- Use quality proxies

### Hardware Needed

| Threads | CPU | RAM | Mode |
|---------|-----|-----|------|
| 5-10 | 4-core | 4GB | Visible |
| 10-20 | 6-core | 8GB | Either |
| 30-50 | 8-core | 16GB | Headless |
| 50-100 | 16-core | 32GB | Headless |

---

## 🐛 Troubleshooting

### "Node.js not found"
→ Install from https://nodejs.org/ then restart terminal

### "Browser launch failed"
→ Run: `npm install puppeteer --force`

### "No proxies found"
→ Add proxies to `resources/proxies/proxies.txt`

### "Timeout errors"
→ Use better proxies or reduce thread count

### "High memory usage"
→ Use Headless Mode (1) or reduce threads

### "Excel not updating"
→ Close Excel, restart bot

---

## 🔐 Security Notes

- ✅ Data stored locally only
- ✅ No cloud upload
- ✅ No tracking/analytics
- ✅ Sensitive files are .gitignored

---

## 📜 Version History

### v1.0.1 (Current - March 2026) ⭐
- ✨ Proxy validation toggle (skip/validate option)
- ✨ Visible terminal input with prompt-sync library
- ✨ Interactive menu ([1] Bot or [2] Extract Keys)
- ✨ API key extraction feature with 3 export formats
- ✨ Improved proxy resilience (retry logic, MAX_PROXY_FAILURES increased to 3)
- ✨ Email deduplication for duplicate prevention
- ✨ Fixed activeQueueTasks variable scoping issue
- ✨ Enhanced error handling with global handlers
- ✨ 150+ diverse name options for realistic email generation
- ✨ Improved XPath selectors with querySelector fallbacks

### v1.0
- Multi-threading support
- Manual account configuration
- Proxy rotation
- Fingerprint injection

---

<div align="center">
  <h3>✨ Ready to Launch? ✨</h3>
  <p>Run: <code>node index.js</code></p>
  <p>Made with ❤️ by nexera$ smokie | v1.0.1 (March 2026)</p>
</div>
