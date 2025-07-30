const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "src", "i18n.js");

if (!fs.existsSync(filePath)) {
  console.error("❌ File not found:", filePath);
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

// Optional backup
fs.writeFileSync(filePath + ".bak", content, "utf8");

const objectRegex = /({[\s\S]*?})/g;

content = content.replace(objectRegex, (block) => {
  try {
    // Convert JS to JSON-compatible
    const jsonSafe = block
      .replace(/(\w+):/g, '"$1":') // key: → "key":
      .replace(/,\s*}/g, "}");     // remove trailing commas

    const parsed = JSON.parse(jsonSafe);
    const seen = new Set();
    const cleaned = Object.entries(parsed).filter(([key]) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return JSON.stringify(Object.fromEntries(cleaned), null, 2);
  } catch (err) {
    return block; // skip bad blocks
  }
});

fs.writeFileSync(filePath, content, "utf8");
console.log("✅ Cleaned duplicate keys in src/i18n.js");
