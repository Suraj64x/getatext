const fs = require("fs");
const path = require("path");
const chalk = require("chalk");

const OUTPUT_DIR = path.join(__dirname, "output");
const ROOT_DIR = __dirname;

function runExtractor() {
  console.log(
    chalk.bold.cyan(`
╔════════════════════════════════════════════════════════════╗
║          🔑 API KEY EXTRACTOR v1.0 🔑                      ║
╚════════════════════════════════════════════════════════════╝
`)
  );

  // Find all successAccounts_*.json files
  function findSuccessAccountsFiles() {
    const files = [];
    
    // Check in root directory
    try {
      const rootFiles = fs.readdirSync(ROOT_DIR);
      for (const file of rootFiles) {
        if (file.startsWith("successAccounts_") && file.endsWith(".json")) {
          files.push(path.join(ROOT_DIR, file));
        }
      }
    } catch (e) {}
    
    // Check in output directory
    try {
      const outputFiles = fs.readdirSync(OUTPUT_DIR);
      for (const file of outputFiles) {
        if (file.startsWith("successAccounts_") && file.endsWith(".json")) {
          const fullPath = path.join(OUTPUT_DIR, file);
          // Avoid duplicates
          if (!files.includes(fullPath)) {
            files.push(fullPath);
          }
        }
      }
    } catch (e) {}
    
    return files;
  }

  const successFiles = findSuccessAccountsFiles();
  
  if (successFiles.length === 0) {
    console.log(chalk.yellow("\n⚠️  No successAccounts JSON files found!\n"));
    return { success: false, message: "No files found" };
  }
  
  console.log(chalk.green(`\n📁 Found ${successFiles.length} success accounts file(s):\n`));
  
  let totalAccounts = 0;
  let totalApiKeys = 0;
  const allApiKeys = [];
  const accountsWithKeys = [];
  
  // Process each file
  for (const filePath of successFiles) {
    try {
      const fileName = path.basename(filePath);
      const content = fs.readFileSync(filePath, "utf-8");
      const accounts = JSON.parse(content);
      
      if (!Array.isArray(accounts)) {
        console.log(chalk.yellow(`⚠️  Skipping invalid file: ${fileName}\n`));
        continue;
      }
      
      console.log(chalk.bold.blue(`\n📄 ${fileName}`));
      console.log(chalk.gray("─".repeat(60)));
      
      let fileApiKeys = 0;
      for (const account of accounts) {
        totalAccounts++;
        
        if (account.apikey && account.apikey.trim()) {
          totalApiKeys++;
          fileApiKeys++;
          
          allApiKeys.push(account.apikey);
          accountsWithKeys.push({
            email: account.email,
            apikey: account.apikey,
            password: account.password || "N/A",
            status: account.status || "unknown"
          });
          
          console.log(chalk.cyan(`   Email: ${account.email}`));
          console.log(chalk.green(`   API Key: ${account.apikey}`));
          console.log(chalk.gray("   " + "─".repeat(56)));
        }
      }
      
      console.log(chalk.yellow(`\n   ✅ Found ${fileApiKeys}/${accounts.length} accounts with API keys\n`));
      
    } catch (e) {
      console.log(chalk.red(`❌ Error reading ${path.basename(filePath)}: ${e.message}\n`));
    }
  }
  
  // Summary
  console.log(chalk.bold.cyan(`\n${"═".repeat(60)}`));
  console.log(chalk.bold.cyan(`           📊 EXTRACTION SUMMARY`));
  console.log(chalk.bold.cyan(`${"═".repeat(60)}\n`));
  
  console.log(chalk.yellow(`Total Accounts Found: ${totalAccounts}`));
  console.log(chalk.green(`Accounts with API Keys: ${totalApiKeys}`));
  console.log(chalk.cyan(`Success Rate: ${totalAccounts > 0 ? ((totalApiKeys / totalAccounts) * 100).toFixed(2) : 0}%\n`));
  
  // Save API keys to file
  if (totalApiKeys > 0) {
    // Make sure output dir exists
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    
    // Save plain API keys list
    const apiKeysFile = path.join(OUTPUT_DIR, "api-keys-list.txt");
    const apiKeysList = allApiKeys.join("\n");
    fs.writeFileSync(apiKeysFile, apiKeysList);
    console.log(chalk.green(`✅ API Keys saved to: ${apiKeysFile}`));
    
    // Save detailed JSON
    const detailedFile = path.join(OUTPUT_DIR, "api-keys-detailed.json");
    fs.writeFileSync(detailedFile, JSON.stringify(accountsWithKeys, null, 2));
    console.log(chalk.green(`✅ Detailed info saved to: ${detailedFile}`));
    
    // Save CSV format
    const csvFile = path.join(OUTPUT_DIR, "api-keys.csv");
    let csvContent = "Email,API Key,Password,Status\n";
    for (const acc of accountsWithKeys) {
      csvContent += `"${acc.email}","${acc.apikey}","${acc.password}","${acc.status}"\n`;
    }
    fs.writeFileSync(csvFile, csvContent);
    console.log(chalk.green(`✅ CSV format saved to: ${csvFile}`));
    
    console.log(chalk.bold.green(`\n🎉 All API keys extracted successfully!\n`));
    return { success: true, count: totalApiKeys };
  } else {
    console.log(chalk.yellow(`\n⚠️  No API keys found to extract.\n`));
    return { success: false, count: 0 };
  }
}

// Export for use as module
module.exports = { runExtractor };

// Run directly if called as main script
if (require.main === module) {
  runExtractor();
}
