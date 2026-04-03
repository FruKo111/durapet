/**
 * Kök ./ + sabit `npm start` için: DURAPET_BUILD=web → Next (web/), aksi API.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const target = (process.env.DURAPET_BUILD || "api").toLowerCase();

if (target === "web") {
  const webDir = path.join(root, "web");
  if (!fs.existsSync(path.join(webDir, "package.json"))) {
    console.error("hostinger-start: web/package.json bulunamadi.");
    process.exit(1);
  }
  const port = process.env.PORT || "3000";
  execSync(`npm run start -- -p ${port}`, {
    cwd: webDir,
    stdio: "inherit",
    env: process.env,
  });
} else {
  execSync("node server/index.js", {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
}
