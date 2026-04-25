const fs = require('fs');
const buf = fs.readFileSync('C:\\Users\\kwz50\\AppData\\Roaming\\Trae\\User\\globalStorage\\.ckg\\storage\\u_e27000596adc34b7b8f12926737b03929ddbe709eabaa06bf16f5a43c43aeddd\\PromptManager_b95b623fba6bf5_15xrkz_codekg.db');
const s = buf.toString('binary');
const tables = s.match(/CREATE TABLE ["']?(\w+)["']?/g);
console.log('Tables found:', tables);

// Also look for common keywords
const keywords = ['message', 'chat', 'history', 'session', 'content', 'role'];
keywords.forEach(kw => {
  const count = (s.match(new RegExp(kw, 'gi')) || []).length;
  console.log(`${kw}: ${count}`);
});
