const fs = require('fs');
const buf = fs.readFileSync('C:\\Users\\kwz50\\AppData\\Roaming\\Trae\\ModularData\\ai-agent\\database.db');
const s = buf.toString('binary');
const tables = s.match(/CREATE TABLE ["']?(\w+)["']?/g);
console.log('Tables found:', tables);

const keywords = ['message', 'chat', 'history', 'session', 'content', 'role'];
keywords.forEach(kw => {
  const count = (s.match(new RegExp(kw, 'gi')) || []).length;
  console.log(`${kw}: ${count}`);
});
