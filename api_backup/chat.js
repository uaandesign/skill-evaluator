export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { provider, apiKey, model, messages, systemPrompt, tools, baseUrl } = req.body || {};
  if (!provider || !apiKey || !model || !messages)
    return res.status(400).json({ error: 'Missing required fields: provider, apiKey, model, messages' });
  if (!Array.isArray(messages) || messages.length === 0)
    return res.status(400).json({ error: 'messages must be a non-empty array' });

  const DEFAULTS = {
    openai:   'https://api.openai.com/v1',
    doubao:   'https://ark.cn-beijing.volces.com/api/v3',
    qwen:     'https://dashscope.aliyuncs.com/compatible-mode/v1',
    deepseek: 'https://api.deepseek.com/v1',
    groq:     'https://api.groq.com/openai/v1',
    mistral:  'https://api.mistral.ai/v1',
    moonshot: 'https://api.moonshot.cn/v1',
    zhipu:    'https://open.bigmodel.cn/api/paas/v4',
    minimax:  'https://api.minimax.chat/v1',
    xai:      'https://api.x.ai/v1',
    nvidia:   'https://integrate.api.nvidia.com/v1',
    venice:   'https://api.venice.ai/api/v1',
  };

  try {
    let result;

    if (provider === 'anthropic') {
      const body = { model, max_tokens: 4096, messages };
      if (systemPrompt) body.system = systemPrompt;
      if (tools && tools.length > 0) body.tools = tools;
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) { const e = await r.text(); throw new Error(`Anthropic API error (${r.status}): ${e}`); }
      const d = await r.json();
      result = { provider, model, response: { role: 'assistant', content: d.content || '' }, usage: { input_tokens: d.usage?.input_tokens || 0, output_tokens: d.usage?.output_tokens || 0 } };

    } else if (provider === 'gemini') {
      const gm = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }] }));
      const sp = [];
      if (systemPrompt) sp.push({ text: systemPrompt });
      messages.filter(m => m.role === 'system').forEach(m => sp.push({ text: m.content }));
      const gb = { contents: gm, generationConfig: { temperature: 0.7, maxOutputTokens: 8192 } };
      if (sp.length > 0) gb.systemInstruction = { parts: sp };
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gb),
      });
      if (!r.ok) { const e = await r.text(); throw new Error(`Gemini API error (${r.status}): ${e}`); }
      const d = await r.json();
      const candidate = d.candidates?.[0];
      if (!candidate) throw new Error(`Gemini returned no candidates. blockReason: ${d.promptFeedback?.blockReason || 'unknown'}`);
      result = { provider, model, response: { role: 'assistant', content: candidate.content?.parts?.[0]?.text || '' }, usage: { input_tokens: d.usageMetadata?.promptTokenCount || 0, output_tokens: d.usageMetadata?.candidatesTokenCount || 0 } };

    } else {
      const bu = (baseUrl || DEFAULTS[provider] || 'https://api.openai.com/v1').replace(/\/$/, '');
      const fm = systemPrompt ? [{ role: 'system', content: systemPrompt }, ...messages] : messages;
      const b = { model, messages: fm, temperature: 0.7 };
      if (tools && tools.length > 0) b.tools = tools;
      const r = await fetch(`${bu}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(b),
      });
      if (!r.ok) {
        const e = await r.text();
        let p; try { p = JSON.parse(e); } catch { p = e; }
        throw new Error(`${provider} API error (${r.status}): ${typeof p === 'object' ? (p?.error?.message || JSON.stringify(p)) : p}`);
      }
      const d = await r.json();
      result = { provider, model, response: d.choices?.[0]?.message || { role: 'assistant', content: '' }, usage: d.usage || {} };
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error('[api/chat] Error:', error.message);
    const m = error.message.match(/\((\d{3})/);
    const up = m ? parseInt(m[1]) : null;
    let status = 502;
    if (up === 400) status = 400;
    else if (up === 401 || up === 403) status = 401;
    else if (up === 404) status = 404;
    else if (up === 429) status = 429;
    return res.status(status).json({ error: '模型调用失败', details: error.message, provider: req.body?.provider, model: req.body?.model });
  }
}