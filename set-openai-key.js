const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

const envPath = path.join(__dirname, ".env");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("请输入你的 OPENAI_API_KEY: ", (key) => {
  const value = key.trim();
  if (!value) {
    console.error("OPENAI_API_KEY 不能为空。");
    rl.close();
    process.exitCode = 1;
    return;
  }

  const defaults = [
    "APP_USERNAME=demo",
    "APP_PASSWORD=demo123",
    "OPENAI_API_KEY=",
    "OPENAI_MODEL=gpt-5.4-mini",
    "OPENAI_PROXY_URL=http://127.0.0.1:7890",
    "PORT=3000",
  ];

  const lines = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, "utf8").split(/\r?\n/)
    : defaults;

  let found = false;
  const updated = lines
    .filter((line, index, all) => line || index < all.length - 1)
    .map((line) => {
      if (line.replace(/^\uFEFF/, "").startsWith("OPENAI_API_KEY=")) {
        found = true;
        return `OPENAI_API_KEY=${value}`;
      }
      return line;
    });

  if (!found) updated.push(`OPENAI_API_KEY=${value}`);

  fs.writeFileSync(envPath, `${updated.join("\n")}\n`, "utf8");
  console.log("OPENAI_API_KEY 已写入 .env。现在可以运行 run.ps1 或 run.cmd 启动。");
  rl.close();
});
