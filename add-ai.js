const fs = require('fs');
let content = fs.readFileSync('./server.js', 'utf8');
if (!content.includes('callDeepSeek')) {
    const askPos = content.indexOf('app.post(\'/api/ask\'');
    if (askPos === -1) throw new Error('Cannot find app.post(/api/ask)');
    const helpers = `
// DeepSeek API
async function callDeepSeek(userMsg, systemPrompt) {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': \`Bearer \${process.env.DEEPSEEK_API_KEY}\`
        },
        body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user',   content: userMsg }
            ],
            max_tokens: 2048,
            response_format: { type: 'json_object' }
        })
    });
    if (!res.ok) throw new Error(\`DeepSeek API error: \${res.status}\`);
    const data = await res.json();
    return data.choices[0].message.content;
}

// Moonshot (Kimi) API
async function callMoonshot(userMsg, systemPrompt) {
    const res = await fetch('https://api.moonshot.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': \`Bearer \${process.env.MOONSHOT_API_KEY}\`
        },
        body: JSON.stringify({
            model: 'moonshot-v1-8k',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user',   content: userMsg }
            ],
            max_tokens: 2048,
            temperature: 0.7
        })
    });
    if (!res.ok) throw new Error(\`Moonshot API error: \${res.status}\`);
    const data = await res.json();
    return data.choices[0].message.content;
}
`;
    content = content.slice(0, askPos) + helpers + content.slice(askPos);
    console.log('✅ Added helper functions');
}
const localAnswerMatch = content.match(/[a-z]*\s*localAnswer\s*=\s*localSearch\([^;]+;/);
if (!localAnswerMatch) throw new Error('localAnswer definition not found');
const insertAfter = localAnswerMatch.index + localAnswerMatch[0].length;
const newBlock = `
let aiAnswer = null;
let source = '';
let savedCount = 0;

if (process.env.DEEPSEEK_API_KEY) {
    try {
        const raw = await callDeepSeek(USER_MSG, SYSTEM_PROMPT);
        const m = raw.match(/\\{[\\s\\S]*\\}/);
        if (m) {
            const p = JSON.parse(m[0]);
            aiAnswer = p.answer;
            if (Array.isArray(p.new_resources) && p.new_resources.length) savedCount = saveNewResources(p.new_resources);
            source = 'deepseek';
        } else {
            aiAnswer = raw;
            source = 'deepseek';
        }
    } catch(e) { log('WARN','DeepSeek fail',{message:e.message}); }
}

if (!aiAnswer && process.env.MOONSHOT_API_KEY) {
    try {
        const raw = await callMoonshot(USER_MSG, SYSTEM_PROMPT);
        const m = raw.match(/\\{[\\s\\S]*\\}/);
        if (m) {
            const p = JSON.parse(m[0]);
            aiAnswer = p.answer;
            if (Array.isArray(p.new_resources) && p.new_resources.length) savedCount = saveNewResources(p.new_resources);
            source = 'moonshot';
        } else {
            aiAnswer = raw;
            source = 'moonshot';
        }
    } catch(e) { log('WARN','Moonshot fail',{message:e.message}); }
}
`;
content = content.slice(0, insertAfter) + newBlock + content.slice(insertAfter);
content = content.replace(/if\s*\(\s*groqKey\s*\)\s*\{/g, 'if (!aiAnswer && groqKey) {');
content = content.replace(/if\s*\(\s*anthropicKey\s*\)\s*\{/g, 'if (!aiAnswer && anthropicKey) {');
const aiRes = content.indexOf('res.json({ answer, source: \'ai\', saved: savedCount });');
if (aiRes !== -1) {
    const before = content.slice(0, aiRes);
    const after = content.slice(aiRes + 'res.json({ answer, source: \'ai\', saved: savedCount });'.length);
    content = before + 'res.json({ answer: aiAnswer || answer, source: aiAnswer ? source : \'ai\', saved: aiAnswer ? savedCount : savedCount });' + after;
}
const fallback = content.indexOf('res.json({ answer: localAnswer, source: \'local\', saved: 0 });');
if (fallback !== -1) {
    const before = content.slice(0, fallback);
    const after = content.slice(fallback + 'res.json({ answer: localAnswer, source: \'local\', saved: 0 });'.length);
    content = before + 'res.json({ answer: aiAnswer || localAnswer, source: aiAnswer ? source : \'local\', saved: aiAnswer ? savedCount : 0 });' + after;
}
fs.writeFileSync('./server.js', content);
console.log('✅ Patched /api/ask with DeepSeek & Moonshot');
