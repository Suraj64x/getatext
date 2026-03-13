const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const ora = require("ora");
const gradient = require("gradient-string");
const readline = require("readline");
const { FingerprintInjector } = require("fingerprint-injector");
const XLSX = require("xlsx");

// Create readline interface for proper CLI input on Windows
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Helper function to get user input with proper prompting
function promptUser(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

puppeteer.use(StealthPlugin());

let THREAD_COUNT = 3;
let EMAIL_DOMAIN = "@tonexera.me";
let HEADLESS_MODE = false;
let IS_FATAL_BROWSER_MISSING = false;
let PROXY_INDEX = 0;
let LAUNCH_QUEUE = 0;
const MAX_CONCURRENT_LAUNCHES = 5; // Prevent resource spike on browser launches
const LAUNCH_DELAY = 1000; // 1 second delay between thread launches
const MAX_LAUNCH_RETRIES = 3;
const MAX_PROXY_FAILURES = 3; // Increased from 1 to avoid marking working proxies as bad
const MAX_ACCOUNT_TIMEOUT_RETRIES = 5;
const PROXY_VALIDATION_RETRIES = 2; // Retry proxy validation on transient failures
const PROXY_VALIDATION_CONCURRENCY = 5;
const PROXY_VALIDATION_TIMEOUT_MS = 12000;
const TARGET_URL = "https://getatext.com/";
const ACCOUNTS_FILE = path.join(__dirname, "accounts.json");
const PROXIES_FILE = path.join(
  __dirname,
  "resources",
  "proxies",
  "proxies.txt",
);
const FINGERPRINTS_DIR = path.join(__dirname, "resources", "fingerprints");
const SESSIONS_DIR = path.join(__dirname, "sessions");
const OUTPUT_DIR = path.join(__dirname, "output");
const BAD_PROXIES_FILE = path.join(OUTPUT_DIR, "badproxies.txt");

// Helper function to get domain-specific file paths
function getSuccessAccountsFiles(domain) {
  const cleanDomain = domain.replace(/^@/, "");
  return {
    json: path.join(__dirname, `successAccounts_${cleanDomain}.json`),
    xlsx: path.join(OUTPUT_DIR, `successAccounts_${cleanDomain}.xlsx`),
  };
}

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log(
  gradient.vice.multiline(
    "╔════════════════════════════════════════════════════════════╗\n" +
      "║     🚀 GETATEXT AUTOMATION BOT INITIATED - v1.0.1 🤖       ║\n" +
      "╚════════════════════════════════════════════════════════════╝\n",
  ),
);

function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
    rss: Math.round(usage.rss / 1024 / 1024),
  };
}

function logMemoryUsage(workerId, stage) {
  const mem = getMemoryUsage();
  if (mem.heapUsed > 2000) {
    console.log(
      chalk.yellow(
        `[Worker-${workerId}] ${stage} - Memory: ${mem.heapUsed}MB / ${mem.heapTotal}MB (RSS: ${mem.rss}MB)`
      )
    );
  }
}

async function waitForLaunchSlot() {
  while (LAUNCH_QUEUE >= MAX_CONCURRENT_LAUNCHES) {
    await new Promise((r) => setTimeout(r, 100));
  }
  LAUNCH_QUEUE++;
}

function releaseLaunchSlot() {
  LAUNCH_QUEUE = Math.max(0, LAUNCH_QUEUE - 1);
}

function isChromeMissingError(message) {
  if (!message) return false;
  return (
    message.includes("Could not find Chrome") ||
    message.includes("executablePath") ||
    message.includes("Browser was not found")
  );
}

function isLikelyProxyError(message) {
  if (!message) return false;
  return (
    message.includes("ERR_PROXY_CONNECTION_FAILED") ||
    message.includes("ERR_TUNNEL_CONNECTION_FAILED") ||
    message.includes("ERR_TIMED_OUT") ||
    message.includes("Proxy")
  );
}

async function ensureBrowserReady() {
  const spinner = ora({
    text: `${chalk.cyan("Checking browser runtime...")} 🌐`,
    spinner: "dots",
  }).start();

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    await browser.close();
    spinner.succeed(`${chalk.green("Browser runtime is ready")} ✅`);
    
    // Clean up old stale session directories to prevent conflicts
    try {
      if (fs.existsSync(SESSIONS_DIR)) {
        const sessions = fs.readdirSync(SESSIONS_DIR);
        for (const session of sessions) {
          const sessionPath = path.join(SESSIONS_DIR, session);
          const lockFile = path.join(sessionPath, 'SingletonLock');
          // Remove lock files that might prevent browser reuse
          if (fs.existsSync(lockFile)) {
            try {
              fs.removeSync ? fs.removeSync(lockFile) : fs.unlinkSync(lockFile);
            } catch (e) {}
          }
        }
      }
    } catch (e) {}
    
    return true;
  } catch (error) {
    const message = error?.message || String(error);

    if (isChromeMissingError(message)) {
      IS_FATAL_BROWSER_MISSING = true;
      spinner.fail(`${chalk.red("Chrome is missing for Puppeteer")} ❌`);
      console.log(chalk.yellow("\nInstall browser with:"));
      console.log(chalk.bold.cyan("  npx puppeteer browsers install chrome\n"));
      console.log(chalk.yellow("Then run bot again: node index.js\n"));
      return false;
    }

    spinner.fail(`${chalk.red("Browser preflight failed")} ❌ ${message}`);
    return false;
  }
}

function getNextProxy(proxies) {
  if (proxies.length === 0) return null;

  let attempts = 0;
  while (attempts < proxies.length) {
    const proxy = proxies[PROXY_INDEX % proxies.length];
    PROXY_INDEX++;
    attempts++;

    if (!BAD_PROXY_SET.has(proxy)) {
      return proxy;
    }
  }

  return null;
}

const PROXY_FAILURE_COUNTS = new Map();
const BAD_PROXY_SET = new Set();

function recordProxyFailure(proxyUrl) {
  if (!proxyUrl) return;

  const currentCount = PROXY_FAILURE_COUNTS.get(proxyUrl) || 0;
  const nextCount = currentCount + 1;
  PROXY_FAILURE_COUNTS.set(proxyUrl, nextCount);

  if (nextCount >= MAX_PROXY_FAILURES && !BAD_PROXY_SET.has(proxyUrl)) {
    saveBadProxy(proxyUrl);
  }
}

function loadPersistedBadProxies() {
  try {
    if (!fs.existsSync(BAD_PROXIES_FILE)) return;

    const lines = fs
      .readFileSync(BAD_PROXIES_FILE, "utf-8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    for (const line of lines) {
      const bracketIndex = line.indexOf(" [");
      const proxy = bracketIndex === -1 ? line : line.slice(0, bracketIndex);
      if (proxy) BAD_PROXY_SET.add(proxy);
    }
  } catch (error) {
    console.error(chalk.red(`Failed to load bad proxies: ${error.message}`));
  }
}

// Account file operations
const ACCOUNT_UPDATE_QUEUE = [];
let ACCOUNT_UPDATE_IN_PROGRESS = false;

function readAccounts() {
  return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8"));
}

function writeAccounts(accounts) {
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
}

async function queueAccountUpdate(email, newStatus) {
  return new Promise((resolve) => {
    ACCOUNT_UPDATE_QUEUE.push({ email, newStatus, resolve });
    processAccountUpdateQueue();
  });
}

async function processAccountUpdateQueue() {
  if (ACCOUNT_UPDATE_IN_PROGRESS || ACCOUNT_UPDATE_QUEUE.length === 0)
    return;

  ACCOUNT_UPDATE_IN_PROGRESS = true;
  try {
    const batch = ACCOUNT_UPDATE_QUEUE.splice(0, 10);
    const accounts = readAccounts();

    batch.forEach(({ email, newStatus }) => {
      const idx = accounts.findIndex((x) => x.email === email);
      if (idx !== -1) {
        accounts[idx].status = newStatus;
      }
    });

    writeAccounts(accounts);
    batch.forEach((item) => item.resolve());
  } finally {
    ACCOUNT_UPDATE_IN_PROGRESS = false;
    if (ACCOUNT_UPDATE_QUEUE.length > 0) {
      processAccountUpdateQueue();
    }
  }
}

function generateRandomString(length = 8) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateRandomEmail(domain = EMAIL_DOMAIN) {
  const firstNames = [
    // Common male names
    "james", "john", "robert", "michael", "william", "david", "richard", "joseph", "thomas", "charles",
    "christopher", "daniel", "matthew", "kenneth", "anthony", "mark", "donald", "steven", "paul", "andrew",
    "joshua", "kenneth", "kevin", "brian", "george", "edward", "ronald", "timothy", "jason", "jeffrey",
    "ryan", "jacob", "gary", "nicholas", "eric", "jonathan", "stephen", "larry", "justin", "scott",
    "brandon", "benjamin", "samuel", "frank", "gregory", "alexander", "raymond", "patrick", "jack", "dennis",
    "jerry", "tyler", "aaron", "jose", "adam", "henry", "douglas", "zachary", "peter", "kyle",
    "walter", "harold", "keith", "christian", "terry", "sean", "austin", "gerald", "carl", "roger",
    "craig", "pablo", "alex", "carlos", "luis", "juan", "mario", "francisco", "antonio", "diego",
    "vincent", "anthony", "philip", "johnny", "ernest", "martin", "randall", "vincent", "ralph", "roy",
    "russell", "louis", "phillip", "johnny", "earnest", "martin", "myles", "vincent", "ralph", "roy",
    // Common female names
    "maria", "rosa", "anna", "sarah", "emily", "emma", "jessica", "ashley", "linda", "barbara",
    "elizabeth", "susan", "karen", "nancy", "lisa", "betty", "margaret", "sandra", "ashley", "kimberly",
    "donna", "carol", "michelle", "dorothy", "marie", "helen", "joyce", "virginia", "victoria", "kelly",
    "christine", "deborah", "rachel", "catherine", "ruth", "brenda", "sharon", "cynthia", "kathleen", "amy",
    "angela", "shirley", "anna", "brenda", "pamela", "judy", "stephanie", "catherine", "samantha", "sarah",
    "gloria", "alice", "ann", "diane", "paula", "jill", "dawn", "rebecca", "janet", "catherine",
    "maria", "rosa", "julia", "sophia", "olivia", "isabella", "mia", "charlotte", "amelia", "harper",
    "evelyn", "abigail", "elizabeth", "avery", "ella", "scarlett", "victoria", "audrey", "grace", "lily",
    "chloe", "lillian", "nora", "hannah", "lila", "lucy", "megan", "ava", "zoe", "natalie",
    // Additional diverse names
    "alex", "taylor", "morgan", "jordan", "casey", "riley", "jamie", "avery", "quinn", "dakota",
    "cameron", "blake", "parker", "drew", "dallas", "reagan", "skyler", "denver", "hunter", "london",
    "brookelyn", "montana", "savannah", "brooklyn", "paisley", "scarlett", "madelyn", "natalie", "emily", "jacob",
    "liam", "noah", "oliver", "elijah", "james", "william", "benjamin", "lucas", "henry", "alexander",
    "mason", "michael", "ethan", "daniel", "jacob", "logan", "jackson", "sebastian", "aiden", "matthew",
    "samuel", "david", "joseph", "carter", "owen", "wyatt", "luke", "jayden", "dylan", "gabriel",
    "nicholas", "connor", "caleb", "isaac", "cole", "levi", "ryan", "grayson", "evan", "jacob",
    // Additional diverse last names
    "anderson", "martinez", "thompson", "garcia", "robinson", "williams", "cruz", "rodriguez", "lewis", "lee",
    "walker", "hall", "allen", "young", "king", "wright", "scott", "green", "baker", "hill",
    "rivera", "campbell", "parker", "evans", "edwards", "collins", "reyes", "stewart", "morris", "morales",
    "murphy", "cook", "rogers", "gutierrez", "ortiz", "morgan", "cooper", "peterson", "richardson", "cox",
    "howard", "ward", "torres", "gray", "ramirez", "james", "watson", "brooks", "kelly", "sanders",
    "bennett", "chavez", "armstrong", "wheeler", "miranda", "ashley", "summers", "sinclair", "owens", "powers",
    "mccoy", "castillo", "chase", "soto", "bass", "marsh", "root", "shaw", "hunter", "kimball",
    "shields", "woodward", "santiago", "adkins", "nickerson", "paulson", "mcallister", "mccarty", "mcdonald", "mcgee",
    "mckinney", "mcmahon", "mcnally", "mcneil", "mcnulty", "mcphee", "mcpherson", "mcquaid", "mcspadden", "mcwilliams"
  ];

  const lastNames = [
    "smith", "johnson", "williams", "brown", "jones", "garcia", "miller", "davis", "rodriguez", "martinez",
    "hernandez", "lopez", "gonzalez", "wilson", "anderson", "thomas", "taylor", "moore", "jackson", "martin",
    "lee", "perez", "thompson", "white", "harris", "sanchez", "clark", "ramirez", "lewis", "robinson",
    "walker", "young", "allen", "king", "wright", "scott", "torres", "peterson", "phillips", "campbell",
    "parker", "evans", "edwards", "collins", "reyes", "stewart", "morris", "morales", "murphy", "cook",
    "rogers", "gutierrez", "ortiz", "morgan", "cooper", "peterson", "richardson", "cox", "howard", "ward",
    "torres", "gray", "ramirez", "james", "watson", "brooks", "kelly", "sanders", "bennett", "rivera",
    "chavez", "armstrong", "wheeler", "miranda", "ashley", "summers", "parker", "sinclair", "owens", "powers",
    "mccoy", "castillo", "chase", "soto", "bass", "marsh", "root", "shaw", "hunter", "kimball",
    "shields", "woodward", "santiago", "adkins", "nickerson", "paulson", "jensen", "hanson", "bowman", "medina",
    "fowler", "brewer", "hoffman", "carlson", "silva", "pearson", "carroll", "alexander", "russell", "griffin",
    "hayes", "gilbert", "meyer", "delgado", "nolan", "hudson", "garrett", "garland", "goodwin", "goodyear",
    "graff", "graham", "grant", "graves", "greenwood", "greer", "gregg", "gregory", "grenier", "gresham",
    "grey", "gribble", "grice", "grid", "griggs", "grigsby", "grimes", "grinnell", "grisham", "gristle",
    "grother", "grott", "ground", "group", "grout", "grove", "grover", "groves", "grubbs", "grudge",
    "grudzinski", "gruenberg", "gruenwald", "gruew", "gruhl", "gruhn", "grunaug", "grunch", "grundmann", "grundy",
    "grunert", "grunfeld", "grunwald", "grus", "gruskin", "grutzmacher", "grybowski", "gryc", "gryder", "grygiel",
    "gryjaski", "grymonprez", "gryn", "grynaviski", "grynic", "grynko", "grynsiw", "grynspan", "grynwajc", "grynwas",
    "gryphon", "gryski", "grysz", "gryta", "gryte", "grytner", "grytting", "grytz", "grytzell", "gryzlov",
    "gryzyn", "gryzysz", "grz", "grzbowski", "grzechnik", "grzegorzewicz", "grzegorzewski", "grzegorzynski", "grzegory", "grzela",
    "grzelinski", "grzelka", "grzesko", "grzeskowiak", "grzeszczyk", "grzessiak", "grzeszczyk", "grzeszul", "grzeta", "grzewaczewski",
    "grzewinski", "grzezbinski", "grzezniak", "grzezinski", "grzezula", "grzezulski", "grzezyk", "grzezyna", "grzezyny", "grzhimali"
  ];

  const fn = firstNames[Math.floor(Math.random() * firstNames.length)];
  const ln = lastNames[Math.floor(Math.random() * lastNames.length)];
  const timestamp = Date.now().toString().slice(-6); // Last 6 digits of timestamp for uniqueness
  const randomStr = generateRandomString(5); // Random 5-char string
  const specialChars = [".", "_", "-"];
  const randomSpecial = specialChars[Math.floor(Math.random() * specialChars.length)];
  
  // Advanced patterns with special characters and guaranteed uniqueness
  const patterns = [
    () => `${fn}${randomSpecial}${ln}${randomSpecial}${timestamp}`, // john.smith-524891
    () => `${fn[0]}${ln}${randomSpecial}${randomStr}${Math.floor(Math.random() * 999)}`, // jsmith-abc123
    () => `${fn}${randomSpecial}${randomStr}${randomSpecial}${ln}${Math.floor(Math.random() * 99)}`, // john-abc_smith12
    () => `${ln}${randomSpecial}${fn}${randomSpecial}${timestamp}`, // smith.john-749821
    () => `${fn}${randomStr}${randomSpecial}${ln}${randomSpecial}${Math.floor(Math.random() * 9999)}`, // johnabc_smith-5731
    () => `${randomSpecial.repeat(1)}${fn}${randomSpecial}${ln}${randomSpecial}${timestamp}`, // _john.smith_482916
    () => `${fn}${randomSpecial}${randomSpecial}${ln}${generateRandomString(6)}`, // john..smith + random
    () => `${fn[0]}${randomSpecial}${ln[0]}${randomSpecial}${randomStr}${Math.floor(Math.random() * 9999)}`, // j.s_abcd1234
    () => `${fn}${Math.floor(Math.random() * 999)}${randomSpecial}${ln}${randomStr}`, // john123_smithabcd
    () => `${randomStr}${randomSpecial}${fn}${randomSpecial}${ln}${timestamp}`, // abc_john.smith749821
  ];

  const pattern = patterns[Math.floor(Math.random() * patterns.length)];

  // Ensure domain starts with @
  const normalizedDomain = domain.startsWith('@') ? domain : `@${domain}`;
  return `${pattern()}${normalizedDomain}`;
}

function generateRandomPassword() {
  const length = Math.floor(Math.random() * 8) + 12; // 12-19 characters
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";
  const special = "!@#$%^&*-_=+";
  const all = uppercase + lowercase + numbers + special;
  
  let password = "";
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];
  
  for (let i = password.length; i < length; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }
  
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

function getProxies() {
  try {
    return fs
      .readFileSync(PROXIES_FILE, "utf-8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  } catch {
    return [];
  }
}

function getFingerprintFiles() {
  try {
    return fs
      .readdirSync(FINGERPRINTS_DIR)
      .filter((f) => f.endsWith(".json") || f.endsWith(".tmp"))
      .map((f) => path.join(FINGERPRINTS_DIR, f));
  } catch {
    return [];
  }
}

function saveBadProxy(proxy) {
  try {
    if (!proxy || BAD_PROXY_SET.has(proxy)) {
      return;
    }

    BAD_PROXY_SET.add(proxy);

    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    const timestamp = new Date().toISOString();
    const badProxyEntry = `${proxy} [${timestamp}]\n`;
    fs.appendFileSync(BAD_PROXIES_FILE, badProxyEntry);
  } catch (e) {
    console.error(chalk.red(`Failed to save bad proxy: ${e.message}`));
  }
}

function updateSuccessAccountsXlsx(accounts, domain = EMAIL_DOMAIN) {
  try {
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const files = getSuccessAccountsFiles(domain);
    const xlsxData = accounts.map((acc) => ({
      Email: acc.email || "",
      Password: acc.password || "",
      "API Key": acc.apikey || "Pending",
      Status: acc.status || "done",
      "Created At": acc.createdAt || new Date().toISOString(),
    }));

    const worksheet = XLSX.utils.json_to_sheet(xlsxData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Accounts");

    // Auto-fit column widths
    const columnWidths = [
      { wch: 30 }, // Email
      { wch: 20 }, // Password
      { wch: 50 }, // API Key
      { wch: 12 }, // Status
      { wch: 25 }, // Created At
    ];
    worksheet["!cols"] = columnWidths;

    XLSX.writeFile(workbook, files.xlsx);
  } catch (e) {
    console.error(chalk.red(`Failed to update XLSX: ${e.message}`));
  }
}

async function validateProxy(proxyUrl, retryCount = 0) {
  if (!proxyUrl) return true;

  try {
    let tempUrl = proxyUrl;
    if (!tempUrl.startsWith("http") && !tempUrl.startsWith("socks")) {
      tempUrl = "http://" + tempUrl;
    }

    const parsedUrl = new URL(tempUrl);
    const args = [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      `--proxy-server=${parsedUrl.protocol}//${parsedUrl.host}`,
    ];

    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args,
      });

      const page = await browser.newPage();

      if (parsedUrl.username && parsedUrl.password) {
        await page.authenticate({
          username: decodeURIComponent(parsedUrl.username),
          password: decodeURIComponent(parsedUrl.password),
        });
      }

      await page.goto("https://httpbin.org/ip", {
        waitUntil: "domcontentloaded",
        timeout: PROXY_VALIDATION_TIMEOUT_MS,
      });

      return true;
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  } catch (error) {
    // Retry on transient errors
    if (retryCount < PROXY_VALIDATION_RETRIES) {
      // Add slight delay before retry
      await new Promise((r) => setTimeout(r, 500));
      return validateProxy(proxyUrl, retryCount + 1);
    }
    return false;
  }
}

async function validateProxies() {
  const log = ora(`${chalk.cyan("Validating proxies...")} 🔍`).start();
  const proxies = [...new Set(getProxies())];
  
  if (proxies.length === 0) {
    log.warn(`${chalk.yellow("No proxies found in proxies.txt")}`);
    return proxies;
  }
  
  const validProxies = [];
  let skippedKnownBad = 0;

  const candidates = proxies.filter((proxy) => {
    if (BAD_PROXY_SET.has(proxy)) {
      skippedKnownBad++;
      return false;
    }
    return true;
  });

  const concurrency = Math.max(
    1,
    Math.min(PROXY_VALIDATION_CONCURRENCY, candidates.length),
  );
  let cursor = 0;
  let checked = 0;

  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const index = cursor;
      cursor++;
      if (index >= candidates.length) break;

      const proxy = candidates[index];
      const isValid = await validateProxy(proxy);
      checked++;

      if (isValid) {
        validProxies.push(proxy);
      } else {
        saveBadProxy(proxy);
      }

      if (checked % 20 === 0 || checked === candidates.length) {
        log.text = `${chalk.cyan("Validating proxies...")} 🔍 ${checked}/${candidates.length}`;
      }
    }
  });

  await Promise.all(workers);
  
  log.succeed(
    `${chalk.green(`Proxy validation complete: ${validProxies.length}/${proxies.length} valid`)} ✅`
  );

  if (skippedKnownBad > 0) {
    console.log(
      chalk.yellow(
        `⚠️ Skipped ${skippedKnownBad} proxies already marked bad from previous runs.`,
      ),
    );
  }
  
  if (proxies.length > validProxies.length) {
    console.log(chalk.yellow(`\n❌ Bad proxies saved to ${BAD_PROXIES_FILE}\n`));
  }
  
  return validProxies;
}

function getLogPrefix(workerId) {
  const colors = [
    chalk.red,
    chalk.green,
    chalk.yellow,
    chalk.blue,
    chalk.magenta,
    chalk.cyan,
    chalk.white,
  ];
  const color = colors[workerId % colors.length];
  const time = new Date().toLocaleTimeString("en-US", { hour12: false });
  return color.bold(`[${time}] [🤖 Worker-${workerId}]`);
}

async function runWorker(workerId, account, proxyUrl, fingerprintPath) {
  logMemoryUsage(workerId, "START");

  // Wait for browser launch slot
  await waitForLaunchSlot();
  // Add stagger delay when many threads are running
  if (THREAD_COUNT > 10) {
    await new Promise((r) => setTimeout(r, Math.random() * LAUNCH_DELAY));
  }

  const prefix = getLogPrefix(workerId);
  const spinner = ora({
    text: `${prefix} ${chalk.bold.cyan("Initializing account")} ${chalk.underline(account.email)} ⏳`,
    spinner: "dots",
  }).start();

  const args = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-blink-features=AutomationControlled",
    "--disable-dev-shm-usage", // Important for high thread count - uses less memory
    "--disable-gpu", // Disable GPU to save resources
    "--single-process=false", // Use multiple processes instead of single
  ];

  const allowedResolutions = [
    { w: 1280, h: 720 }, // 16:9
    { w: 1366, h: 768 }, // ~16:9
    { w: 1600, h: 900 }, // 16:9
    { w: 1920, h: 1080 }, // 16:9
    { w: 2560, h: 1440 }, // 16:9
    { w: 1280, h: 800 }, // 16:10
    { w: 1440, h: 900 }, // 16:10
    { w: 1680, h: 1050 }, // 16:10
    { w: 1920, h: 1200 }, // 16:10
  ];
  const targetRes =
    allowedResolutions[Math.floor(Math.random() * allowedResolutions.length)];
  args.push(`--window-size=${targetRes.w},${targetRes.h}`);

  let proxyAuth = null;
  if (proxyUrl) {
    try {
      let tempUrl = proxyUrl;
      if (!tempUrl.startsWith("http") && !tempUrl.startsWith("socks"))
        tempUrl = "http://" + tempUrl;

      const parsedUrl = new URL(tempUrl);
      args.push(`--proxy-server=${parsedUrl.protocol}//${parsedUrl.host}`);

      if (parsedUrl.username && parsedUrl.password) {
        proxyAuth = {
          username: decodeURIComponent(parsedUrl.username),
          password: decodeURIComponent(parsedUrl.password),
        };
      }
    } catch (e) {
      spinner.warn(
        `${prefix} ${chalk.yellow("Invalid proxy format")} ${proxyUrl}`,
      );
    }
  }

  let browser;
  try {
    spinner.text = `${prefix} ${chalk.magenta("Launching browser...")} 🌐`;
    try {
      browser = await puppeteer.launch({
        headless: HEADLESS_MODE,
        defaultViewport: { width: targetRes.w, height: targetRes.h },
        userDataDir: path.join(SESSIONS_DIR, account.email),
        args: args,
      });
    } catch (launchErr) {
      spinner.fail(
        `${prefix} ${chalk.red.bold("Browser launch failed!")} 💥 ${launchErr.message}`
      );

      if (isChromeMissingError(launchErr.message)) {
        IS_FATAL_BROWSER_MISSING = true;
        account.status = "error";
        await queueAccountUpdate(account.email, "error");
      } else {
        if (proxyUrl && isLikelyProxyError(launchErr.message)) {
          recordProxyFailure(proxyUrl);
          spinner.warn(
            `${prefix} ${chalk.yellow("Proxy marked as bad and removed from rotation.")} 🚫`,
          );
        }

        account.launchFailures = (account.launchFailures || 0) + 1;
        if (account.launchFailures >= MAX_LAUNCH_RETRIES) {
          spinner.warn(
            `${prefix} ${chalk.yellow("Max browser launch retries reached. Marking account as error.")}`,
          );
          account.status = "error";
          await queueAccountUpdate(account.email, "error");
        } else {
          account.status = "queue";
          await queueAccountUpdate(account.email, "queue");
        }
      }

      return;
    }

    logMemoryUsage(workerId, "BROWSER_LAUNCHED");

    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();

    // Close all extra pages/tabs aggressively
    for (let i = 1; i < pages.length; i++) {
      try {
        await pages[i].close();
      } catch (e) {}
    }

    // Set page to focus on target
    await page.bringToFront();
    
    // Close any new tabs that open during execution
    const pageCreationHandler = async (newPage) => {
      spinner.info(`${prefix} ${chalk.yellow("Closing extra tab...")}`);
      await newPage.close().catch(() => {});
    };
    browser.on("page", pageCreationHandler);

    if (proxyAuth) await page.authenticate(proxyAuth);

    if (fingerprintPath) {
      try {
        const fpData = JSON.parse(fs.readFileSync(fingerprintPath, "utf-8"));
        const fingerprintContent = fpData.fingerprint || fpData;

        if (fingerprintContent.screen) {
          fingerprintContent.screen.width = targetRes.w;
          fingerprintContent.screen.height = targetRes.h;
          fingerprintContent.screen.availWidth = targetRes.w;
          fingerprintContent.screen.availHeight = targetRes.h - 40;
        }

        const injector = new FingerprintInjector();
        await injector.attachFingerprintToPuppeteer(page, fingerprintContent);
        spinner.text = `${prefix} ${chalk.blue("Injected CPU/GPU/Canvas profile")} 🧬`;
      } catch (e) {
        spinner.text = `${prefix} ${chalk.red("Failed to inject fingerprint")} 🧬`;
      }
    }

    spinner.text = `${prefix} ${chalk.cyan("Navigating to target...")} 🛸`;
    await page.goto("https://getatext.com/register", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await new Promise((r) => setTimeout(r, 3000));

    spinner.text = `${prefix} ${chalk.yellow("Typing credentials...")} ⌨️`;
    await page.waitForSelector("#email", { visible: true, timeout: 30000 });
    await page.type("#email", account.email, {
      delay: Math.floor(Math.random() * 50) + 50,
    });

    await page.type("#password", account.password, {
      delay: Math.floor(Math.random() * 50) + 50,
    });

    await page.type("#password_confirmation", account.password, {
      delay: Math.floor(Math.random() * 50) + 50,
    });

    spinner.text = `${prefix} ${chalk.cyan("Checking Terms and scrolling...")} ✔️`;
    await page.click("#terms");
    await new Promise((r) => setTimeout(r, 3000));

    await page.evaluate(() => window.scrollBy(0, 400));
    await new Promise((r) => setTimeout(r, 1000));

    spinner.text = `${prefix} ${chalk.magenta("Clicking Submit/Register...")} 🚀`;
    const submitBtnSelector = 'button[type="submit"]';
    await page.waitForSelector(submitBtnSelector, {
      visible: true,
      timeout: 30000,
    });

    const clickSubmit = async () => {
      const btns = await page.$$(submitBtnSelector);
      if (btns.length > 0) {
        await page.evaluate((el) => el.click(), btns[0]);
      }
    };

    await Promise.all([
      page
        .waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 })
        .catch(() => {}),
      clickSubmit(),
    ]);

    const emailTaken = await page.evaluate(() => {
      return document.body.innerText.includes(
        "The email has already been taken.",
      );
    });

    if (emailTaken) {
      spinner.fail(`${prefix} ${chalk.red.bold("Email already used!")}`);
      account.status = "emailalreadyused";
      if (browser) await browser.close();
      return;
    }

    spinner.text = `${prefix} ${chalk.cyan("Scrolling to bottom for Accept All...")} 📜`;
    await new Promise((r) => setTimeout(r, 3000));

    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
      window.scrollBy(0, 2000);
    });
    await new Promise((r) => setTimeout(r, 1000));

    spinner.text = `${prefix} ${chalk.magenta("Clicking Accept All...")} 🚀`;
    const acceptAllXpath = "xpath/.//button[contains(., 'Accept All')]";
    try {
      await page.waitForSelector(acceptAllXpath, {
        visible: true,
        timeout: 10000,
      });
      const acceptElements = await page.$$(acceptAllXpath);
      if (acceptElements.length > 0) {
        await page.evaluate((el) => el.click(), acceptElements[0]);
        await new Promise((r) => setTimeout(r, 3000));
      }
    } catch (e) {}

    spinner.text = `${prefix} ${chalk.cyan("Navigating to Wallet...")} 💼`;
    try {
      // Try to find and click Wallet button
      await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('a, button, div[role="button"], span'));
        const walletBtn = elements.find(el => el.innerText && el.innerText.toLowerCase().includes('wallet'));
        if (walletBtn) walletBtn.click();
      });
      await new Promise((r) => setTimeout(r, 3000));
    } catch (e) {
      spinner.warn(`${prefix} ${chalk.yellow("Could not find Wallet button")}`);
      throw new Error("Wallet button not found");
    }

    spinner.text = `${prefix} ${chalk.cyan("Opening Redeem Promocode...")} 🎁`;
    try {
      // Try to find and click Redeem Promocode button
      await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('button, a, div[role="button"], span'));
        const redeemBtn = elements.find(el => 
          el.innerText && el.innerText.toLowerCase().includes('redeem') && 
          el.innerText.toLowerCase().includes('promo')
        );
        if (redeemBtn) redeemBtn.click();
      });
      await new Promise((r) => setTimeout(r, 3000));
    } catch (e) {
      spinner.warn(`${prefix} ${chalk.yellow("Could not find Redeem Promocode button")}`)
    }

    spinner.text = `${prefix} ${chalk.yellow("Typing promo code...")} ⌨️`;
    const promoTextareaSelector =
      'textarea.promo-codes-input[name="promo_codes"]';
    await page.waitForSelector(promoTextareaSelector, {
      visible: true,
      timeout: 15000,
    });

    await page.click(promoTextareaSelector);
    await new Promise((r) => setTimeout(r, 500));

    await page.type(promoTextareaSelector, "DAISYUSERSWELCOME", { delay: 50 });

    try {
      // Try to find and click REDEEM button
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const redeemBtn = buttons.find(b => b.innerText && b.innerText.toUpperCase().includes('REDEEM'));
        if (redeemBtn) redeemBtn.click();
      });
      await new Promise((r) => setTimeout(r, 3000));
    } catch (e) {
      // Fallback: try submit button
      try {
        const fallbackBtn = await page.$$('button.btn-full-width[type="submit"], button[type="submit"]');
        if (fallbackBtn.length > 0) {
          await page.evaluate((el) => el.click(), fallbackBtn[0]);
          await new Promise((r) => setTimeout(r, 3000));
        }
      } catch (fallbackErr) {}
    }

    spinner.text = `${prefix} ${chalk.cyan("Waiting for $0.50 balance...")} 💰`;
    let balanceFound = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      let balanceText = await page.evaluate(() => {
        const el =
          document.querySelector(".balance-amount") ||
          document.querySelector('span:contains("$")') ||
          Array.from(document.querySelectorAll("span, div, p")).find((e) =>
            e.innerText.includes("$0.50"),
          );
        return el ? el.innerText : "";
      });
      if (balanceText && balanceText.includes("$0.50")) {
        balanceFound = true;
        break;
      }
    }

    if (balanceFound) {
      spinner.text = `${prefix} ${chalk.cyan("Fetching API Key from profile...")} 🔑`;
      await page.goto("https://getatext.com/profile", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await new Promise((r) => setTimeout(r, 3000));

      let apiKey = "";
      try {
        await page.waitForSelector("#apiKeyDisplay", {
          visible: true,
          timeout: 15000,
        });
        apiKey = await page.evaluate(() => {
          const el = document.getElementById("apiKeyDisplay");
          return el ? el.innerText.trim() : "";
        });
      } catch (e) {
        // Fallback if selector is not found
      }

      spinner.text = `${prefix} ${chalk.cyan("Disabling IP confirmation toggle...")} 🔐`;
      try {
        // Scroll to find the toggle button
        await page.evaluate(() => {
          window.scrollBy(0, 500);
        });
        await new Promise((r) => setTimeout(r, 1000));

        // Look for the toggle button for "New log in IP confirmation"
        const toggleButtons = await page.$$('input[type="checkbox"], input[type="radio"], .toggle-switch, [role="switch"]');
        
        // Find the one that matches the IP confirmation setting
        let toggleFound = false;
        for (const btn of toggleButtons) {
          const parentText = await page.evaluate((el) => {
            let parent = el.closest('[class*="setting"], [class*="option"], [class*="field"], .form-group, [role="group"]');
            if (!parent) parent = el.parentElement?.parentElement;
            return parent ? parent.innerText.toLowerCase() : '';
          }, btn);
          
          if (parentText.includes('ip') || parentText.includes('confirmation') || parentText.includes('login')) {
            const isChecked = await page.evaluate((el) => {
              return el.checked || el.getAttribute('aria-checked') === 'true';
            }, btn);
            
            if (isChecked) {
              await page.evaluate((el) => {
                if (el.type === 'checkbox' || el.type === 'radio') {
                  el.click();
                } else {
                  el.click();
                }
              }, btn);
              toggleFound = true;
              spinner.text = `${prefix} ${chalk.green("IP confirmation toggle disabled")} ✅`;
              await new Promise((r) => setTimeout(r, 2000));
              break;
            }
          }
        }
        
        if (!toggleFound) {
          spinner.warn(`${prefix} ${chalk.yellow("Could not locate IP confirmation toggle")}`);
        }
      } catch (e) {
        spinner.warn(`${prefix} ${chalk.yellow("Failed to disable IP confirmation: " + e.message)}`);
      }

      spinner.succeed(
        `${prefix} ${chalk.green.bold("Success!")} 🎉 Account ${chalk.underline(account.email)} balance is $0.50. API Key: ${apiKey || "N/A"}`,
      );
      account.status = "done";
      account.timeoutRetries = 0;
      account.launchFailures = 0;
      if (apiKey) account.apikey = apiKey;

      try {
        const files = getSuccessAccountsFiles(EMAIL_DOMAIN);
        let successAccs = [];
        if (fs.existsSync(files.json)) {
          const content = fs.readFileSync(files.json, "utf-8");
          if (content.trim()) successAccs = JSON.parse(content);
        }
        if (!successAccs.find((a) => a.email === account.email)) {
          account.createdAt = new Date().toISOString();
          successAccs.push(account);
          fs.writeFileSync(
            files.json,
            JSON.stringify(successAccs, null, 2)
          );
          updateSuccessAccountsXlsx(successAccs, EMAIL_DOMAIN);
        }
      } catch (e) {}

      if (browser) await browser.close();
    } else {
      throw new Error("Balance did not reach $0.50 timeout reached.");
    }
  } catch (err) {
    const errorMessage = err?.message || "Unknown error";
    const isTransientNetworkError =
      errorMessage.includes("ERR_TIMED_OUT") ||
      errorMessage.includes("Timeout") ||
      errorMessage.includes("ERR_PROXY_CONNECTION_FAILED") ||
      errorMessage.includes("Navigation timeout");

    if (isTransientNetworkError) {
      account.timeoutRetries = (account.timeoutRetries || 0) + 1;
      if (proxyUrl) recordProxyFailure(proxyUrl);

      if (account.timeoutRetries >= MAX_ACCOUNT_TIMEOUT_RETRIES) {
        spinner.fail(
          `${prefix} ${chalk.red.bold("Max timeout retries reached.")} Marking account as error. 💥 ${errorMessage}`,
        );
        account.status = "error";
        await queueAccountUpdate(account.email, "error");
      } else {
        spinner.warn(
          `${prefix} ${chalk.yellow("Transient network/proxy timeout. Re-queueing...")} 🔄 Attempt ${account.timeoutRetries}/${MAX_ACCOUNT_TIMEOUT_RETRIES}`,
        );
        account.status = "queue";
        await queueAccountUpdate(account.email, "queue");
      }
    } else {
      spinner.fail(`${prefix} ${chalk.red.bold("Error!")} 💥 ${errorMessage}`);
      account.status = "error";
      await queueAccountUpdate(account.email, "error");
    }
  } finally {
    logMemoryUsage(workerId, "CLEANUP");
    if (browser && browser.isConnected()) {
      try {
        // Close all pages first
        const allPages = await browser.pages();
        for (const p of allPages) {
          try {
            await p.close();
          } catch (e) {}
        }
        // Close browser
        await browser.close();
        spinner.info(`${prefix} ${chalk.gray("Browser process closed cleanly")} ✅`);
      } catch (e) {
        console.error(
          chalk.red(`Worker-${workerId}: Failed to close browser: ${e.message}`)
        );
        // Force kill process if graceful close fails
        try {
          process.kill(browser.process().pid, 'SIGKILL');
          spinner.info(`${prefix} ${chalk.yellow("Browser process force-killed")}`);
        } catch (killErr) {}
      }
    }
    releaseLaunchSlot();
  }
}

async function askForHeadlessMode() {
  const answer = await promptUser(
    chalk.bold.blue(
      "\n🖥️  Browser mode? [1=Headless (faster), 2=Visible (default)]: "
    )
  );
  const choice = answer.trim();
  HEADLESS_MODE = choice === "1" || choice.toLowerCase() === "headless";
  const modeText = HEADLESS_MODE ? "Headless" : "Visible";
  console.log(chalk.cyan(`✅ Mode set to: ${modeText}\n`));
}

async function askRunMode() {
  const choice = await promptUser(
    chalk.bold.cyan(
      "\n🤖 What would you like to do?\n" +
      "  [1] Run Bot - Generate & Create Accounts\n" +
      "  [2] Extract API Keys - Export from existing accounts\n" +
      "\n❓ Choose [1 or 2] (Default: 1): "
    )
  );
  const mode = choice.trim() === "2" ? "extract" : "bot";
  const modeText = mode === "extract" ? "Extract API Keys" : "Run Bot";
  console.log(chalk.green(`\n✅ Mode selected: ${modeText}\n`));
  return mode;
}

async function askForThreads() {
  const answer = await promptUser(
    chalk.bold.green(
      "\n❓ How many threads would you like to run? [Default: 3]: "
    )
  );
  const parsed = parseInt(answer.trim(), 10);
  if (!isNaN(parsed) && parsed > 0) THREAD_COUNT = parsed;
}

async function askForEmailDomain() {
  const answer = await promptUser(
    chalk.bold.magenta(
      "\n📧 Enter email domain [Default: tonexera.me]: "
    )
  );
  const domain = answer.trim().length === 0 ? "tonexera.me" : answer.trim();
  EMAIL_DOMAIN = domain.startsWith('@') ? domain : `@${domain}`;
}

async function askForAccountCount() {
  const answer = await promptUser(
    chalk.bold.cyan(
      "\n🔐 How many accounts do you want to auto-generate? [Default: 5]: "
    )
  );
  const parsed = parseInt(answer.trim(), 10);
  const count = isNaN(parsed) || parsed <= 0 ? 5 : parsed;
  return count;
}

function generateAccounts(count, domain = EMAIL_DOMAIN) {
  const accounts = [];
  const generatedEmails = new Set();
  let attempts = 0;
  const maxAttempts = count * 10; // Prevent infinite loops
  
  while (accounts.length < count && attempts < maxAttempts) {
    const email = generateRandomEmail(domain);
    attempts++;
    
    // Ensure unique emails only
    if (!generatedEmails.has(email)) {
      generatedEmails.add(email);
      accounts.push({
        number: accounts.length + 1,
        email: email,
        password: generateRandomPassword(),
        status: "queue",
        domain: domain
      });
    }
  }
  
  if (accounts.length < count) {
    console.warn(chalk.yellow(`⚠️  Could only generate ${accounts.length}/${count} unique emails. Try again for more.\n`));
  }
  
  return accounts;
}
function initializeOutputFiles() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  // Initialize XLSX if success accounts exist for current domain
  const files = getSuccessAccountsFiles(EMAIL_DOMAIN);
  if (fs.existsSync(files.json)) {
    try {
      const content = fs.readFileSync(files.json, "utf-8");
      if (content.trim()) {
        const accounts = JSON.parse(content);
        updateSuccessAccountsXlsx(accounts, EMAIL_DOMAIN);
      }
    } catch (e) {
      console.error(chalk.red(`Failed to initialize XLSX: ${e.message}`));
    }
  }
}
async function askToGenerateNewAccounts() {
  const answer = await promptUser(
    chalk.bold.yellow(
      "\n⚠️  No accounts to process. Generate new accounts? [y/n]: "
    )
  );
  const shouldGenerate =
    answer.toLowerCase() === "y" ||
    answer.toLowerCase() === "yes" ||
    answer.trim() === "";
  return shouldGenerate;
}

async function askToExportApiKeys() {
  const answer = await promptUser(
    chalk.bold.magenta(
      "\n🔑 Extract API keys to file? [y/n] (Default: y): "
    )
  );
  const shouldExport =
    answer.toLowerCase() !== "n" && answer.toLowerCase() !== "no";
  return shouldExport;
}

async function askToValidateProxies() {
  const answer = await promptUser(
    chalk.bold.cyan(
      "\n🔍 Validate proxies before running? [y/n] (Default: y): "
    )
  );
  const shouldValidate =
    answer.toLowerCase() !== "n" && answer.toLowerCase() !== "no";
  return shouldValidate;
}

async function initializeAccounts() {
  let accountsData = null;
  let needsGeneration = false;

  // Check if accounts file exists and has content
  if (fs.existsSync(ACCOUNTS_FILE)) {
    try {
      const content = fs.readFileSync(ACCOUNTS_FILE, "utf-8");
      if (content.trim() && content.trim() !== "[]") {
        accountsData = JSON.parse(content);
        // Check if there are any queued accounts
        const queuedAccounts = accountsData.filter(
          (a) => a.status === "queue" || a.status === "error"
        );
        if (queuedAccounts.length === 0) {
          console.log(
            chalk.yellow(
              "\n⚠️  All accounts already processed (status: done or processing)\n"
            )
          );
          needsGeneration = await askToGenerateNewAccounts();
        }
      } else {
        needsGeneration = true;
      }
    } catch (e) {
      console.error(chalk.red(`Error reading accounts: ${e.message}`));
      needsGeneration = true;
    }
  } else {
    console.log(chalk.cyan("\n📝 No accounts file found. Creating new one...\n"));
    needsGeneration = true;
  }

  // Generate new accounts if needed
  if (needsGeneration) {
    console.log(chalk.bold.cyan("\n🔧 Generating new accounts...\n"));
    await askForEmailDomain();
    const count = await askForAccountCount();
    const newAccounts = generateAccounts(count);
    writeAccounts(newAccounts);
    console.log(
      chalk.bold.green(
        `\n✅ Generated ${count} accounts with domain ${EMAIL_DOMAIN} and random passwords!\n`
      )
    );
    return newAccounts;
  }

  return accountsData || readAccounts();
}

async function main() {
  initializeOutputFiles();
  loadPersistedBadProxies();
  
  // Ask if user wants to extract API keys or run bot
  const runChoice = await askRunMode();
  if (runChoice === "extract") {
    console.log(chalk.cyan("\n🔑 Launching API Key Extractor...\n"));
    try {
      const { runExtractor } = require("./extract-api-keys.js");
      runExtractor();
    } catch (e) {
      console.error(chalk.red(`Error running extractor: ${e.message}`));
    }
    return;
  }
  
  await askForThreads();
  await askForHeadlessMode();

  const browserReady = await ensureBrowserReady();
  if (!browserReady) {
    return;
  }

  // Show thread count warning
  if (THREAD_COUNT > 30) {
    console.log(
      chalk.yellow(
        `\n⚠️  Running with ${THREAD_COUNT} threads. Monitor system resources!\n`
      )
    );
  }

  await initializeAccounts();
  const configuredProxyCount = getProxies().length;
  console.log(chalk.cyan(`\n🔍 Found ${configuredProxyCount} proxies in proxies.txt\n`));
  
  let proxies;
  const shouldValidate = await askToValidateProxies();
  if (shouldValidate) {
    proxies = await validateProxies();
    console.log(chalk.green(`\n✅ ${proxies.length} valid proxies after validation\n`));
  } else {
    proxies = getProxies();
    console.log(chalk.yellow(`\n⏭️  Skipped proxy validation. Using all ${proxies.length} proxies as-is\n`));
  }

  if (configuredProxyCount > 0 && proxies.length === 0) {
    console.log(
      chalk.red(
        "\n💀 All configured proxies are marked bad/unusable. Update proxies.txt and retry.\n",
      ),
    );
    return;
  }

  const fingerprints = getFingerprintFiles();

  console.log(chalk.bold.yellow(`\n⚡ Checking Accounts Queue...\n`));
  
  let accounts = readAccounts();
  console.log(chalk.cyan(`📊 Total accounts in queue: ${accounts.length}`));
  const queuedCheck = accounts.filter((a) => a.status === "queue" || a.status === "error");
  console.log(chalk.cyan(`⏳ Accounts ready to process: ${queuedCheck.length}\n`));
    
    // Remove duplicate emails from accounts list to prevent browser session conflicts
    const emailSet = new Set();
    const uniqueAccounts = [];
    for (const acc of accounts) {
      if (!emailSet.has(acc.email)) {
        emailSet.add(acc.email);
        uniqueAccounts.push(acc);
      } else {
        console.log(chalk.yellow(`⚠️  Removing duplicate email: ${acc.email}`));
      }
    }
    if (uniqueAccounts.length < accounts.length) {
      writeAccounts(uniqueAccounts);
      accounts = uniqueAccounts;
    }
  console.log(chalk.bold.green(`\n🚀 Starting main processing loop with ${THREAD_COUNT} threads...\n`));

  let activeQueueTasks = new Set();
  let absoluteWorkerIdIndex = 0;

  while (true) {
    if (IS_FATAL_BROWSER_MISSING) {
      console.log(
        chalk.red(
          "\n💀 Stopping run: Chrome for Puppeteer is missing. Install it and retry.\n",
        ),
      );
      break;
    }

    let accounts = readAccounts();
    const queuedAccounts = accounts.filter(
      (a) => a.status === "queue" || a.status === "error",
    );

    if (queuedAccounts.length === 0 && activeQueueTasks.size === 0) {
      console.log(
        gradient.cristal(`\n✨ All queues emptied! Shutting down... ✨\n`)
      );
      
      // Ask if user wants to extract API keys
      const shouldExport = await askToExportApiKeys();
      if (shouldExport) {
        try {
          console.log(chalk.cyan("\n🔑 Extracting API keys...\n"));
          const { runExtractor } = require("./extract-api-keys.js");
          runExtractor();
        } catch (e) {
          console.error(chalk.red(`Error extracting keys: ${e.message}`));
        }
      }
      
      break;
    }

    if (
      queuedAccounts.length === 0 ||
      activeQueueTasks.size >= THREAD_COUNT ||
      LAUNCH_QUEUE >= MAX_CONCURRENT_LAUNCHES
    ) {
      // Wait for at least one task to complete before continuing
      if (activeQueueTasks.size > 0) {
        await Promise.race(activeQueueTasks);
      } else {
        // Short delay to prevent CPU spinning
        await new Promise((r) => setTimeout(r, 100));
      }
      continue;
    }

    const acc = queuedAccounts[0];
    acc.status = "processing";
    const idx = accounts.findIndex((x) => x.email === acc.email);
    if (idx !== -1) accounts[idx] = acc;
    writeAccounts(accounts);

    // Use round-robin proxy rotation for better distribution
    const assignedProxy = getNextProxy(proxies);

    if (proxies.length > 0 && !assignedProxy) {
      console.log(
        chalk.red(
          "\n💀 No usable proxies left in rotation. Stopping to avoid useless retries.\n",
        ),
      );
      break;
    }

    const assignedFp =
      fingerprints.length > 0
        ? fingerprints[Math.floor(Math.random() * fingerprints.length)]
        : null;

    absoluteWorkerIdIndex++;
    const threadWorkerId = absoluteWorkerIdIndex;

    const taskPromise = runWorker(
      threadWorkerId,
      acc,
      assignedProxy,
      assignedFp,
    ).then(async () => {
      activeQueueTasks.delete(taskPromise);
      // Batch process account updates instead of individual writes
      await queueAccountUpdate(acc.email, acc.status);
    });

    activeQueueTasks.add(taskPromise);
  }
}

main().catch((err) => {
  console.error(chalk.red.bold(`\n💀 CRITICAL FATAL ERROR:\n${err.message}\n${err.stack}\n`));
  rl.close();
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error(chalk.red.bold(`\n💀 UNCAUGHT EXCEPTION:\n${err.message}\n${err.stack}\n`));
  rl.close();
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red.bold(`\n💀 UNHANDLED PROMISE REJECTION:\n${reason}\n`));
  if (reason instanceof Error && reason.stack) {
    console.error(reason.stack);
  }
  rl.close();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log(chalk.yellow(`\n\n⚠️  Received interrupt signal. Cleaning up...\n`));
  rl.close();
  process.exit(0);
});
