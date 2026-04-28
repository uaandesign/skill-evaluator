/**
 * POST /api/run-skill
 * Lightweight skill execution endpoint.
 * Runs a skill with user input using the specified LLM model
 * and returns the raw output (no evaluation, no scoring).
 *
 * Input:  { skill_content, user_input, model_config }
 * Output: { output, duration_ms, model }
 */

// ── Retry wrapper ──────────────────────────────────────────────────────────
async function fetchWithRetry(url, options, { maxRetries = 3, baseDelay = 1000, providerLabel = 'API' } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, options);

      if (resp.ok) return resp;

      if (resp.status === 404) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(`${providerLabel} error (404 模型不存在): ${err.error?.message || JSON.stringify(err)}`);
      }

      if ((resp.status === 429 || resp.status === 503) && attempt < maxRetries) {
        const retryAfter = resp.headers.get('retry-after');
        const delay = resp.status === 429
          ? (retryAfter ? parseInt(retryAfter, 10) * 1000 : baseDelay * Math.pow(2, attempt) * 2)
          : baseDelay * Math.pow(2, attempt);
        console.log(`[run-skill] ${providerLabel} ${resp.status}, 重试 ${attempt + 1}/${maxRetries}, 延迟 ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      const err = await resp.json().catch(() => ({}));
      throw new Error(`${providerLabel} error (${resp.status}): ${err.error?.message || JSON.stringify(err)}`);
    } catch (e) {
      lastError = e;
      if (e.cause || e.code === 'ECONNRESET' || e.code === 'ETIMEDOUT' || e.message.includes('fetch failed')) {
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt);
          console.log(`[run-skill] ${providerLabel} 网络错误: ${e.message}, 重试 ${attempt + 1}/${maxRetries}, 延迟 ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }
      throw e;
    }
  }
  throw lastError;
}

// ── LLM call dispatch ──────────────────────────────────────────────────────
async function callLLM(modelConfig, userPrompt, systemPrompt = null, maxTokens = 4000) {
  // Anthropic
  if (!modelConfig || modelConfig.provider === 'anthropic') {
    const apiKey = modelConfig?.apiKey || process.env.ANTHROPIC_API_KEY;
    const model = modelConfig?.model || 'claude-sonnet-4-6';
    if (!apiKey) throw new Error('Anthropic API key 未配置');

    const body = {
      model,
      max_tokens: maxTokens,
      temperature: 0,
      messages: [{ role: 'user', content: userPrompt }],
    };
    if (systemPrompt) body.system = systemPrompt;

    const resp = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    }, { providerLabel: 'Anthropic' });

    const data = await resp.json();
    return data.content?.[0]?.text || '';
  }

  // OpenAI-compatible providers
  if (['openai', 'doubao', 'qwen', 'deepseek'].includes(modelConfig.provider)) {
    const DEFAULTS = {
      openai: 'https://api.openai.com/v1',
      doubao: 'https://ark.cn-beijing.volces.com/api/v3',
      qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      deepseek: 'https://api.deepseek.com/v1',
    };
    const baseUrl = (modelConfig.baseUrl || DEFAULTS[modelConfig.provider]).replace(/\/$/, '');
    const messages = systemPrompt
      ? [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }]
      : [{ role: 'user', content: userPrompt }];

    const reqBody = { model: modelConfig.model, max_tokens: maxTokens, temperature: 0, messages };
    if (modelConfig.provider === 'openai') reqBody.seed = 42;

    const resp = await fetchWithRetry(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${modelConfig.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(reqBody),
    }, { providerLabel: modelConfig.provider });

    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '';
  }

  // Gemini
  if (modelConfig.provider === 'gemini') {
    const model = modelConfig.model || 'gemini-2.0-flash';
    const apiKey = modelConfig.apiKey;
    const baseUrl = (modelConfig.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
    const geminiBody = {
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0 },
    };
    if (systemPrompt) {
      geminiBody.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    const resp = await fetchWithRetry(
      `${baseUrl}/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(geminiBody),
      },
      { providerLabel: 'Gemini' }
    );

    const data = await resp.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  throw new Error(`不支持的模型供应商: ${modelConfig.provider}`);
}

// ── Handler ────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const startTime = Date.now();

  try {
    const { skill_content, user_input, model_config } = req.body || {};

    if (!skill_content) {
      return res.status(400).json({ error: '缺少技能内容 (skill_content)' });
    }
    if (!user_input) {
      return res.status(400).json({ error: '缺少用户输入 (user_input)' });
    }
    if (!model_config || !model_config.provider || !model_config.model) {
      return res.status(400).json({ error: '缺少模型配置 (model_config)' });
    }

    // Skill content -> system prompt
    // User input    -> user prompt
    const output = await callLLM(model_config, user_input, skill_content, 4000);

    const duration = Date.now() - startTime;
    return res.status(200).json({
      output: output || '',
      duration_ms: duration,
      model: `${model_config.provider}/${model_config.model}`,
    });
  } catch (err) {
    console.error('[api/run-skill] Error:', err);
    return res.status(500).json({
      error: err.message || '运行失败',
      duration_ms: Date.now() - startTime,
    });
  }
}
