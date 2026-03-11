const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const ora = require("ora");
const gradient = require("gradient-string");
const readline = require("readline");
const { FingerprintInjector } = require("fingerprint-injector");

puppeteer.use(StealthPlugin());

let THREAD_COUNT = 3;
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

console.log(
  gradient.pastel.multiline(
    "=========================================\n🚀 GETATEXT AUTOMATION BOT INITIATED 🚀\n=========================================",
  ),
);

function readAccounts() {
  return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8"));
}

function writeAccounts(accounts) {
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
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
  return color.bold(`[🤖 W-${workerId}]`);
}

async function runWorker(workerId, account, proxyUrl, fingerprintPath) {
  const prefix = getLogPrefix(workerId);
  const spinner = ora({
    text: `${prefix} ${chalk.bold.cyan("Initializing account")} ${chalk.underline(account.email)} ⏳`,
    spinner: "dots",
  }).start();

  const args = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-blink-features=AutomationControlled",
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
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: { width: targetRes.w, height: targetRes.h },
      userDataDir: path.join(SESSIONS_DIR, account.email),
      args: args,
    });

    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();

    for (let i = 1; i < pages.length; i++) {
      await pages[i].close().catch(() => {});
    }

    await page.bringToFront();

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
    await page.goto(TARGET_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    spinner.text = `${prefix} ${chalk.cyan("Waiting for Register button...")} ⏳`;
    await page.waitForSelector('a[href="https://getatext.com/register"]', {
      visible: true,
      timeout: 30000,
    });

    spinner.text = `${prefix} ${chalk.cyan("Clicking 'Register' button...")} 🖱️`;
    await page.click('a[href="https://getatext.com/register"]');
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
    await page.waitForSelector('button[type="submit"].btn-login', {
      visible: true,
      timeout: 30000,
    });

    await Promise.all([
      page
        .waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 })
        .catch(() => {}), // catch if navigation doesn't perfectly trigger
      page.click('button[type="submit"].btn-login'),
    ]);

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
    const walletXpath = "xpath/.//*[contains(text(), 'Wallet')]";
    await page.waitForSelector(walletXpath, { visible: true, timeout: 30000 });
    const walletElements = await page.$$(walletXpath);
    if (walletElements.length > 0) {
      await page.evaluate((el) => el.click(), walletElements[0]);
      await new Promise((r) => setTimeout(r, 3000));
    }

    spinner.text = `${prefix} ${chalk.cyan("Opening Redeem Promocode...")} 🎁`;
    const redeemXpath = "xpath/.//*[contains(text(), 'Redeem promocode')]";
    await page.waitForSelector(redeemXpath, { visible: true, timeout: 20000 });
    const redeemElements = await page.$$(redeemXpath);
    if (redeemElements.length > 0) {
      await page.evaluate((el) => el.click(), redeemElements[0]);
      await new Promise((r) => setTimeout(r, 3000));
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

    await page.type(promoTextareaSelector, "WELCOMEDAISYUSERS", { delay: 50 });

    const applyXpath = "xpath/.//button[contains(., 'REDEEM PROMOCODE')]";
    const applyBtns = await page.$$(applyXpath);
    if (applyBtns.length > 0) {
      await page.evaluate((el) => el.click(), applyBtns[0]);
      await new Promise((r) => setTimeout(r, 3000));
    } else {
      const fallbackBtn = await page.$$('button.btn-full-width[type="submit"]');
      if (fallbackBtn.length > 0) {
        await page.evaluate((el) => el.click(), fallbackBtn[0]);
        await new Promise((r) => setTimeout(r, 3000));
      }
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
      spinner.succeed(
        `${prefix} ${chalk.green.bold("Success!")} 🎉 Account ${chalk.underline(account.email)} balance is $0.50. Marked done.`,
      );
      account.status = "done";

      try {
        const successFile = path.join(__dirname, "successAccounts.json");
        let successAccs = [];
        if (fs.existsSync(successFile)) {
          const content = fs.readFileSync(successFile, "utf-8");
          if (content.trim()) successAccs = JSON.parse(content);
        }
        if (!successAccs.find((a) => a.email === account.email)) {
          successAccs.push(account);
          fs.writeFileSync(successFile, JSON.stringify(successAccs, null, 2));
        }
      } catch (e) {}

      if (browser) await browser.close();
    } else {
      throw new Error("Balance did not reach $0.50 timeout reached.");
    }
  } catch (err) {
    spinner.fail(`${prefix} ${chalk.red.bold("Error!")} 💥 ${err.message}`);

    if (
      err.message.includes("ERR_TIMED_OUT") ||
      err.message.includes("Timeout") ||
      err.message.includes("ERR_PROXY_CONNECTION_FAILED") ||
      err.message.includes("Navigation timeout")
    ) {
      spinner.info(
        `${prefix} ${chalk.yellow("Network/Proxy timeout detected. Re-queueing account for a new proxy...")} 🔄`,
      );
      account.status = "queue";
      if (browser) await browser.close().catch(() => {});
    } else {
      account.status = "error";
    }
  } finally {
    if (browser && browser.isConnected()) {
      spinner.info(
        `${prefix} ${chalk.gray("Waiting for browser to be closed manually...")} 🛑`,
      );
      await new Promise((r) => browser.on("disconnected", r));
    }
  }
}

function askForThreads() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(
      chalk.bold.green(
        "\n❓ How many threads would you like to run? [Default: 3]: ",
      ),
      (answer) => {
        const parsed = parseInt(answer.trim(), 10);
        if (!isNaN(parsed) && parsed > 0) THREAD_COUNT = parsed;
        rl.close();
        resolve();
      },
    );
  });
}

async function main() {
  await askForThreads();
  const proxies = getProxies(),
    fingerprints = getFingerprintFiles();
  let proxyIndex = 0,
    fpIndex = 0;

  console.log(chalk.bold.yellow(`\n⚡ Checking Accounts Queue...\n`));

  let activeQueueTasks = new Set();
  let absoluteWorkerIdIndex = 0;

  while (true) {
    let accounts = readAccounts();
    const queuedAccounts = accounts.filter((a) => a.status === "queue");

    if (queuedAccounts.length === 0 && activeQueueTasks.size === 0) {
      console.log(
        gradient.cristal(`\n✨ All queues emptied! Shutting down... ✨\n`),
      );
      break;
    }

    if (queuedAccounts.length === 0 || activeQueueTasks.size >= THREAD_COUNT) {
      await Promise.race(activeQueueTasks);
      continue;
    }

    const acc = queuedAccounts[0];
    acc.status = "processing";
    const idx = accounts.findIndex((x) => x.email === acc.email);
    if (idx !== -1) accounts[idx] = acc;
    writeAccounts(accounts);

    const assignedProxy =
      proxies.length > 0
        ? proxies[Math.floor(Math.random() * proxies.length)]
        : null;
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
    ).then(() => {
      const freshAccounts = readAccounts();
      const targetIdx = freshAccounts.findIndex((x) => x.email === acc.email);
      if (targetIdx !== -1) {
        freshAccounts[targetIdx].status = acc.status;
        writeAccounts(freshAccounts);
      }
      activeQueueTasks.delete(taskPromise);
    });

    activeQueueTasks.add(taskPromise);
  }
}

main().catch((err) =>
  console.error(chalk.red.bold(`\n💀 CRITICAL FATAL ERROR:\n${err}\n`)),
);
