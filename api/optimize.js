/**
 * POST /api/optimize
 * ----------------------------------------------------------------------
 * 基于评估报告（Python 静态规则输出）+ 大模型，给 skill 提优化建议
 *
 * 入参:
 *   {
 *     skill_content:   string,              当前 skill 文本
 *     skill_name:      string,
 *     model_config:    { provider, model, apiKey, baseUrl? },
 *     reports:         [{ standard, report }]  /api/evaluate 返回的 results 数组
 *     mode:            'suggestions' | 'rewrite'  // 默认 suggestions（仅给建议，不改写）
 *   }
 *
 * 输出（mode=suggestions）:
 *   {
 *     suggestions: [
 *       { dimension, severity, issue, fix, expected_impact }
 *     ],
 *     summary: string,
 *     duration_ms: number
 *   }
 *
 * 输出（mode=rewrite）:
 *   {
 *     optimized_content: string,    // 改写后的完整 SKILL.md
 *     diff_summary: string,
 *     suggestions: [...],
 *     duration_ms: number
 *   }
 *
 * 没配 model_config 时返回 400 + 友好提示，前端按需展示"配置模型可解锁"
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const startTs = Date.now();
  try {
    const {
      skill_content,
      skill_name,
      model_config,
      reports = [],
      mode = 'suggestions',
    } = req.body || {};

    if (!skill_content) {
      return res.status(400).json({ error: '缺少 skill_content' });
    }
    if (!model_config || !model_config.provider || !model_config.model || !model_config.apiKey) {
      return res.status(400).json({
        error: '需要 model_config（provider, model, apiKey）',
        hint: '请在配置中心填写至少一个模型，并将其设置为评估专用模型',
      });
    }
    if (!Array.isArray(reports) || reports.length === 0) {
      return res.status(400).json({ error: '需要 reports 数组（来自 /api/evaluate 的结果）' });
    }

    // ─── 整理失败检查项 + 提示词 ─────────────────────────────────
    const failedChecks = collectFailedChecks(reports);
    const summaryStr = summarizeReports(reports);

    const systemPrompt = SYSTEM_PROMPT;
    const userPrompt = buildOptimizationUserPrompt({
      skillContent: skill_content,
      skillName: skill_name || 'skill',
      summary: summaryStr,
      failedChecks,
      mode,
    });

    // ─── 调 LLM ─────────────────────────────────────────────────
    const llmText = await callLLM(model_config, systemPrompt, userPrompt);

    // ─── 解析输出（约定 JSON 格式）─────────────────────────────
    const parsed = parseLLMOutput(llmText, mode);

    return res.status(200).json({
      ...parsed,
      duration_ms: Date.now() - startTs,
      raw_response: llmText.slice(0, 4000), // 留作排错用，超过部分截断
    });
  } catch (err) {
    console.error('[optimize] error:', err);
    return res.status(500).json({ error: '优化失败', details: err.message });
  }
}

// ─── 提示词构造 ─────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `你是一位资深的 AI Skill 评测和编排专家。
你的任务是根据 Python 静态评估器的报告，给用户的 SKILL.md 文件提出针对性的优化建议。

要求：
1. 只针对评估器明确指出的问题给建议，不要扩散到无关方面
2. 每条建议必须可操作（指出"在第几节加什么"或"把 X 改为 Y"）
3. 严格按照请求中要求的 JSON 格式返回，不要附加任何额外说明
4. 中文回复
`;

function buildOptimizationUserPrompt({ skillContent, skillName, summary, failedChecks, mode }) {
  const head = `# Skill 优化任务

## 当前 Skill: ${skillName}

\`\`\`markdown
${truncate(skillContent, 8000)}
\`\`\`

## 评估摘要
${summary}

## 评估失败的检查项（共 ${failedChecks.length} 项）
${failedChecks.map((c, i) => `${i + 1}. [${c.standard}] ${c.category} — ${c.title}\n   ${c.message}`).join('\n')}
`;

  if (mode === 'rewrite') {
    return head + `
## 你的任务
对照失败检查项，重写整个 SKILL.md，让它满足评估标准。
保留原 skill 的核心意图（name, description, 主要功能流程），只补强不达标的部分。

返回严格 JSON 格式（不要 markdown code fence）：
\`\`\`json
{
  "optimized_content": "<完整的新 SKILL.md 文本>",
  "diff_summary": "<200字以内总结主要改动>",
  "suggestions": [
    { "dimension": "维度名", "severity": "high|medium|low", "issue": "原问题", "fix": "做了什么修改", "expected_impact": "+几分" }
  ]
}
\`\`\`
`;
  }

  return head + `
## 你的任务
针对每个失败的检查项，给出可执行的优化建议。

返回严格 JSON 格式（不要 markdown code fence）：
\`\`\`json
{
  "suggestions": [
    {
      "dimension": "维度名（中文）",
      "severity": "high|medium|low",
      "issue": "现状问题（一句话）",
      "fix": "具体修改建议（指出要在 SKILL.md 哪一节加什么或改什么）",
      "expected_impact": "预期分数提升（+X 分 或 通过判定）"
    }
  ],
  "summary": "30字以内总结这次优化的整体方向"
}
\`\`\`
`;
}

// ─── 辅助 ─────────────────────────────────────────────────────────────
function collectFailedChecks(reports) {
  const out = [];
  for (const r of reports) {
    const checks = r?.report?.checks || [];
    for (const c of checks) {
      if (c.passed === false || c.passed === 0) {
        out.push({
          standard: r.standard?.display_name || r.standard?.standard_key || '未知标准',
          category: c.category_name_zh || c.category || '',
          title:    c.title_zh || c.id || '未知检查',
          message:  c.result_message_zh || c.evidence || '',
        });
      }
    }
  }
  return out;
}

function summarizeReports(reports) {
  return reports
    .map((r) => {
      const score = r?.report?.score ?? '—';
      const grade = r?.report?.grade ?? '—';
      const tag   = r?.report?.generic_assessment?.tag || r?.report?.volcano_assessment?.tag || '—';
      const name  = r?.standard?.display_name || r?.standard?.standard_key || '标准';
      return `- ${name}：${score} 分（${grade}）· ${tag}`;
    })
    .join('\n');
}

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '\n\n... [内容过长已截断]' : s;
}

function parseLLMOutput(text, mode) {
  // 提取 ```json ... ``` 或第一个 { ... } 块
  let jsonStr = text;
  const fence = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fence) jsonStr = fence[1];
  else {
    const firstBrace = text.indexOf('{');
    const lastBrace  = text.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      jsonStr = text.slice(firstBrace, lastBrace + 1);
    }
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return {
      suggestions: parsed.suggestions || [],
      summary:     parsed.summary || '',
      optimized_content: mode === 'rewrite' ? (parsed.optimized_content || null) : null,
      diff_summary:      mode === 'rewrite' ? (parsed.diff_summary || '') : null,
    };
  } catch (err) {
    // 兜底：把整段文本作为 summary 返回
    return {
      suggestions: [],
      summary: text.slice(0, 500),
      _parse_error: err.message,
    };
  }
}

// ─── LLM 调用 ─────────────────────────────────────────────────────────
async function callLLM(modelConfig, systemPrompt, userPrompt) {
  const { provider, model, apiKey, baseUrl } = modelConfig;

  if (provider === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        temperature: 0.3,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 400)}`);
    const data = await r.json();
    return data.content?.[0]?.text || '';
  }

  if (provider === 'gemini') {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
        }),
      }
    );
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 400)}`);
    const data = await r.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  // OpenAI 兼容（doubao / qwen / deepseek / ...）
  const DEFAULTS = {
    openai:   'https://api.openai.com/v1',
    doubao:   'https://ark.cn-beijing.volces.com/api/v3',
    qwen:     'https://dashscope.aliyuncs.com/compatible-mode/v1',
    deepseek: 'https://api.deepseek.com/v1',
    groq:     'https://api.groq.com/openai/v1',
    moonshot: 'https://api.moonshot.cn/v1',
    mistral:  'https://api.mistral.ai/v1',
    xai:      'https://api.x.ai/v1',
  };
  const bu = (baseUrl || DEFAULTS[provider] || 'https://api.openai.com/v1').replace(/\/$/, '');
  const r = await fetch(`${bu}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
    }),
  });
  if (!r.ok) throw new Error(`${provider} ${r.status}: ${(await r.text()).slice(0, 400)}`);
  const data = await r.json();
  return data.choices?.[0]?.message?.content || '';
}
