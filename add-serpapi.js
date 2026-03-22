const fs = require('fs');
let content = fs.readFileSync('./server.js', 'utf8');

if (!content.includes('async function searchWeb')) {
    const askPos = content.indexOf('app.post(\'/api/ask\'');
    if (askPos === -1) throw new Error('Cannot find app.post(/api/ask)');
    const helpers = `
// ── Web Search (SerpAPI) ─────────────────────────────────────────────
async function searchWeb(query) {
  if (!process.env.SERPAPI_KEY) return [];
  const url = \`https://serpapi.com/search?q=\${encodeURIComponent(query)}&api_key=\${process.env.SERPAPI_KEY}&num=5\`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    return (data.organic_results || []).map(r => ({
      title: r.title,
      description: r.snippet,
      url: r.link
    }));
  } catch(e) {
    log('WARN', 'Web search failed', { message: e.message });
    return [];
  }
}
`;
    content = content.slice(0, askPos) + helpers + content.slice(askPos);
    console.log('✅ Added searchWeb helper');
}

// Find the line where USER_MSG is defined (supports single/double quotes and line breaks)
const userMsgMatch = content.match(/const\s+USER_MSG\s*=\s*`([^`]*)`/);
if (userMsgMatch) {
    const userMsgLine = userMsgMatch[0];
    const userMsgStart = userMsgMatch.index;
    const userMsgEnd = userMsgStart + userMsgLine.length;
    
    // Insert web search call before USER_MSG
    const before = content.slice(0, userMsgStart);
    const after = content.slice(userMsgStart);
    const webSearchBlock = `
    let webResults = [];
    if (process.env.SERPAPI_KEY) {
        webResults = await searchWeb(question);
        if (webResults.length) {
            log('INFO', 'Web search found results', { count: webResults.length });
        }
    }
    const webSummary = webResults.length
        ? '\\n\\nWeb search results:\\n' + webResults.map(r => \`- \${r.title}: \${r.description}\\n  \${r.url}\`).join('\\n')
        : '';
`;
    content = before + webSearchBlock + after;
    
    // Now modify USER_MSG to include webSummary
    const newUserMsg = userMsgLine.replace('`', '` + webSummary + `');
    content = content.replace(userMsgLine, newUserMsg);
} else {
    console.warn('⚠️ Could not find USER_MSG definition – skipping web summary insertion');
}

// Add /api/web-search endpoint if missing
if (!content.includes('app.get(\'/api/web-search\'')) {
    const endpoint = `
// ── Web Search API (for main search bar) ─────────────────────────────
app.get('/api/web-search', async (req, res) => {
  const q = req.query.q?.trim();
  if (!q) return res.json({ results: [] });
  const results = await searchWeb(q);
  res.json({ query: q, results });
});
`;
    const catchAll = content.indexOf('app.get(\'*\'');
    if (catchAll !== -1) {
        content = content.slice(0, catchAll) + endpoint + content.slice(catchAll);
    } else {
        content += endpoint;
    }
    console.log('✅ Added /api/web-search endpoint');
}

fs.writeFileSync('./server.js', content);
console.log('✅ server.js patched with SerpAPI');
