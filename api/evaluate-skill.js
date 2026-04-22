/**
 * POST /api/evaluate-skill  (Vercel Serverless Function)
 * Four-phase evaluation: Execute → Judge → Specialized → Volcano
 * Self-contained — no external lib imports.
 */

// ── LLM helpers (self-contained) ──────────────────────────────────────────

async function fetchWithRetry(url, options, { maxRetries = 3, baseDelay = 1000, providerLabel = 'API' } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, options);
      if (resp.ok) return resp;
      if (resp.status === 404) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(`${providerLabel} error (404): ${err.error?.message || JSON.stringify(err)}`);
      }
      if ((resp.status === 429 || resp.status === 503) && attempt < maxRetries) {
        const retryAfter = resp.headers.get('retry-after');
        const delay = resp.status === 429
          ? (retryAfter ? parseInt(retryAfter, 10) * 1000 : baseDelay * Math.pow(2, attempt) * 2)
          : baseDelay * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      const err = await resp.json().catch(() => ({}));
      throw new Error(`${providerLabel} error (${resp.status}): ${err.error?.message || JSON.stringify(err)}`);
    } catch (e) {
      lastError = e;
      if ((e.cause || e.code === 'ECONNRESET' || e.code === 'ETIMEDOUT' || (e.message && e.message.includes('fetch failed'))) && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt)));
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}

async function callLLMForEval(modelConfig, userPrompt, maxTokens = 4000, systemPrompt = null) {
  if (!modelConfig || modelConfig.provider === 'anthropic') {
    const apiKey = modelConfig?.apiKey || process.env.ANTHROPIC_API_KEY;
    const model = modelConfig?.model || 'claude-sonnet-4-6';
    if (!apiKey) throw new Error('Anthropic API key 未配置');
    const body = { model, max_tokens: maxTokens, temperature: 0, messages: [{ role: 'user', content: userPrompt }] };
    if (systemPrompt) body.system = systemPrompt;
    const resp = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }, { providerLabel: 'Anthropic' });
    const data = await resp.json();
    return data.content?.[0]?.text || '';
  }

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
      headers: { Authorization: `Bearer ${modelConfig.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(reqBody),
    }, { providerLabel: modelConfig.provider });
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '';
  }

  if (modelConfig.provider === 'gemini') {
    const model = modelConfig.model || 'gemini-2.0-flash';
    const apiKey = modelConfig.apiKey;
    const baseUrl = (modelConfig.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
    const geminiBody = {
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0 },
    };
    if (systemPrompt) geminiBody.systemInstruction = { parts: [{ text: systemPrompt }] };
    const resp = await fetchWithRetry(`${baseUrl}/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(geminiBody),
    }, { providerLabel: 'Gemini' });
    const data = await resp.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  throw new Error(`不支持的模型供应商: ${modelConfig.provider}`);
}

// ── Eval Standard resolver ─────────────────────────────────────────────────

/**
 * 从评估标准对象中提取纯文本内容。
 * - 文本文件：直接返回 content 字符串
 * - 压缩包（base64 zip）：解压后返回主 SKILL.md 内容
 * - 字符串（向后兼容）：直接返回
 * @param {string|object|null} standard
 * @returns {Promise<string|null>}
 */
async function resolveSkillContent(standard) {
  if (!standard) return null;
  // 向后兼容：旧版本直接传字符串
  if (typeof standard === 'string') return standard;
  // 普通文本文件
  if (!standard.isCompressed) return standard.content || null;
  // 压缩包：base64 → Buffer → AdmZip
  if (!standard.base64) return null;
  try {
    const AdmZip = (await import('adm-zip')).default;
    const buf = Buffer.from(standard.base64, 'base64');
    const zip = new AdmZip(buf);
    const entries = zip.getEntries().filter((e) => !e.isDirectory);
    // 优先找 SKILL.md，其次找任意 .md，最后找任意文本文件
    const skillMd = entries.find((e) => /SKILL\.md$/i.test(e.entryName));
    const anyMd   = entries.find((e) => /\.md$/i.test(e.entryName));
    const anyTxt  = entries.find((e) => /\.(md|txt|markdown)$/i.test(e.entryName));
    const entry   = skillMd || anyMd || anyTxt || entries[0];
    if (!entry) return null;
    return entry.getData().toString('utf8');
  } catch (err) {
    console.error('[resolveSkillContent] 解压失败:', err.message);
    return null;
  }
}

// ── Prompt builders (built-in fallback) ───────────────────────────────────

/**
 * Build Phase 2 judge prompt (built-in fallback, no custom eval skill).
 */
function buildJudgePrompt(skillContent, resultsForJudge, totalTests) {
  return `你是AI技能质量评估专家。\n\n## 技能定义\n\`\`\`\n${skillContent}\n\`\`\`\n\n## 测试结果\n${resultsForJudge}\n\n评估维度：有用性/稳定性/准确性/安全性（各1-5分），总分=质量(稳定+准确)×40%+功能(有用)×35%+安全×25%。\n\n返回JSON：{"summary":{"overall_score":0,"quality_score":0,"functionality_score":0,"safety_score":0,"total_tests":${totalTests},"passed_tests":0,"failed_tests":0,"pass_rate":0.0},"dimensional_scores":{"有用性":{"score":4,"weight":"功能维度(35%)","comment":""},"稳定性":{"score":3,"weight":"质量维度(40%)","comment":""},"准确性":{"score":4,"weight":"质量维度(40%)","comment":""},"安全性":{"score":5,"weight":"安全合规(25%)","comment":""}},"detailed_results":[{"id":"1","name":"","passed":true,"actual_output":"","failure_reason":"","latency_ms":0,"scores":{"有用性":4,"稳定性":4,"准确性":5,"安全性":5}}],"weakness_analysis":{"lowest_dimension":"","common_failures":[],"systematic_issues":[]},"optimization_suggestions":[{"dimension":"","priority":"","issue":"","suggestion":"","expected_impact":""}]}`;
}

/**
 * Build Phase 2 user message when a custom generic eval skill is provided.
 * The eval skill becomes the system prompt; this becomes the user message.
 * IMPORTANT: explicitly instructs the LLM to use ONLY the dimensions defined
 * in the system prompt (eval skill), not invent its own.
 */
function buildJudgeUserMessage(skillContent, resultsForJudge, totalTests) {
  return `请严格遵照系统提示（你的评估标准）中定义的评估维度和评分规则，对以下技能进行综合评分。

⚠️ 关键约束（必须严格遵守）：
1. dimensional_scores 中的维度名称和数量必须与系统提示中定义的完全一致，一个不多，一个不少
2. 不得自行添加、删减或重命名任何维度
3. 评分标准、分值区间以系统提示为准

## 技能定义
\`\`\`
${skillContent}
\`\`\`

## 测试执行结果（共 ${totalTests} 条）
${resultsForJudge}

请严格返回 JSON（不要输出任何其他内容）。dimensional_scores 的每个 key 必须是系统提示中定义的维度名，有多少维度就写多少个 key：
{"summary":{"overall_score":0,"total_tests":${totalTests},"passed_tests":0,"failed_tests":0,"pass_rate":0.0},"dimensional_scores":{"<系统提示定义的维度1>":{"score":80,"comment":"评分理由"},"<系统提示定义的维度2>":{"score":75,"comment":"评分理由"},"<...每个维度都要写>":{"score":0,"comment":""}},"detailed_results":[{"id":"1","name":"","passed":true,"actual_output":"","failure_reason":"","latency_ms":0,"scores":{}}],"weakness_analysis":{"lowest_dimension":"","common_failures":[],"systematic_issues":[]},"optimization_suggestions":[{"dimension":"","priority":"高/中/低","issue":"","suggestion":"","expected_impact":""}]}`;
}

/**
 * Build Phase 3 prompt (built-in fallback per category).
 */
function buildSpecializedPrompt(categoryId, testResults, skillContent) {
  const categoryPrompts = {
    'text-generation':    `你是一名文本生成专项评估专家。请基于以下4个维度对该技能进行评分：\n- 可读性提升\n- 专业度匹配\n- 信息完整性\n- 格式规范性`,
    'code-generation':    `你是一名代码生成专项评估专家。请基于以下4个维度对该技能进行评分：\n- 语法正确性\n- 可运行性\n- 规范符合性\n- 性能与安全`,
    'data-collection':    `你是一名数据采集专项评估专家。请基于以下4个维度对该技能进行评分：\n- 数据准确性\n- 采集效率\n- 合规性\n- 可用性`,
    'competitor-research':`你是一名竞品调研专项评估专家。请基于以下4个维度对该技能进行评分：\n- 信息全面性\n- 信息准确性\n- 分析深度\n- 格式规范性`,
    'design-spec':        `你是一名设计规范专项评估专家。请基于以下4个维度对该技能的输出进行评分：\n- 规范覆盖度\n- 术语一致性\n- 可执行性\n- 与基准规范偏离度`,
    'figma-gen':          `你是一名 Figma 设计生成专项评估专家。请基于以下4个维度对该技能的输出进行评分：\n- 结构合法性\n- Design Token 合规\n- 层级与命名\n- 需求对齐度`,
    'agent-page':         `你是一名 Agent 页面生成专项评估专家。请基于以下4个维度对该技能的输出进行评分：\n- 代码可运行性\n- Design Token 使用\n- 可访问性基础\n- 需求还原度`,
  };
  const categoryPrompt = categoryPrompts[categoryId] || '你是一名 AI 技能专项评估专家。';
  const resultsText = testResults
    .map((r, i) => `用例 ${i + 1}: ${r.name} (${r.test_type})\n输入: ${r.input}\n预期: ${r.expected_output}\n实际: ${r.actual_output}\n状态: ${r.passed ? '通过' : '失败'}`)
    .join('\n\n');
  return `${categoryPrompt}\n\n## 技能定义\n\`\`\`\n${skillContent}\n\`\`\`\n\n## 测试执行结果\n${resultsText}\n\n请为以上4个维度各评分1-5分，并生成JSON格式结果：\n{"dimensional_scores":{"维度名":{"score":4,"comment":"评分说明"}},"weakness_analysis":{"lowest_dimension":"","common_failures":[],"systematic_issues":[]},"optimization_suggestions":[{"dimension":"","priority":"高/中/低","issue":"","suggestion":"","expected_impact":""}]}`;
}

/**
 * Build Phase 3 user message when a custom specialized eval skill is provided.
 */
function buildSpecializedUserMessage(categoryId, testResults, skillContent) {
  const resultsText = testResults
    .map((r, i) => `用例 ${i + 1}: ${r.name} (${r.test_type})\n输入: ${r.input}\n预期: ${r.expected_output}\n实际: ${r.actual_output}\n状态: ${r.passed ? '通过' : '失败'}`)
    .join('\n\n');
  return `请依据你的专项评估规则对以下技能进行评分。技能类别：${categoryId || '通用'}\n\n## 技能定义\n\`\`\`\n${skillContent}\n\`\`\`\n\n## 测试执行结果\n${resultsText}\n\n请严格返回 JSON（不要输出其他内容）：\n{"dimensional_scores":{"维度名":{"score":4,"comment":"评分说明"}},"weakness_analysis":{"lowest_dimension":"","common_failures":[],"systematic_issues":[]},"optimization_suggestions":[{"dimension":"","priority":"高/中/低","issue":"","suggestion":"","expected_impact":""}]}`;
}

/**
 * Build Phase 4 prompt (built-in fallback).
 */
function buildVolcanoPrompt(skillContent, skillName) {
  return `你是一名火山平台规范审查专家。请对以下技能进行火山平台合规性评估。\n\n## 待评估的技能名称\n${skillName || '未提供'}\n\n## 待评估的技能定义\n\`\`\`\n${skillContent}\n\`\`\`\n\n## 检查维度（共4个维度，每项 1-5 分）\n\n1. 函数引用规范 — 是否使用标准格式，参数完整，函数名规范\n2. Skill 命名规范 — kebab-case/snake_case，长度合理，无中文\n3. 元信息完整性 — frontmatter 含 name/description/version\n4. 规则 Skill 合规度 — 默认给 3 分（未上传规则文件）\n\n请严格返回JSON：\n{"dimensional_scores":{"函数引用规范":{"score":4,"comment":"","issues":[]},"Skill命名规范":{"score":3,"comment":"","issues":[]},"元信息完整性":{"score":4,"comment":"","issues":[]},"规则Skill合规度":{"score":3,"comment":"","issues":[]}},"compliance_summary":"总结","fix_suggestions":[{"dimension":"","priority":"高/中/低","issue":"","fix":""}]}`;
}

/**
 * Build Phase 4 user message when a custom volcano eval skill is provided.
 * IMPORTANT: explicitly instructs the LLM to use ONLY the dimensions defined
 * in the system prompt (volcano eval skill), not invent its own.
 */
function buildVolcanoUserMessage(skillContent, skillName) {
  return `请严格遵照系统提示（你的合规检查标准）中定义的检查维度，对以下技能进行合规评估。

⚠️ 关键约束（必须严格遵守）：
1. dimensional_scores 中的维度名称和数量必须与系统提示中定义的完全一致，一个不多，一个不少
2. 不得自行添加、删减或重命名任何检查维度
3. 评分标准、分值区间以系统提示为准

## 技能名称
${skillName || '未提供'}

## 技能定义
\`\`\`
${skillContent}
\`\`\`

请严格返回 JSON（不要输出其他内容）。dimensional_scores 的每个 key 必须是系统提示中定义的检查维度名，有多少维度就写多少个 key：
{"dimensional_scores":{"<系统提示定义的维度1>":{"score":80,"comment":"评分理由","issues":[]},"<系统提示定义的维度2>":{"score":90,"comment":"","issues":[]},"<...每个维度都要写>":{"score":0,"comment":"","issues":[]}},"compliance_summary":"总体合规性总结","fix_suggestions":[{"dimension":"","priority":"高/中/低","issue":"","fix":""}]}`;
}

// ── Main handler ──────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const {
      skill_content, test_cases, model_config,
      skill_category, skill_name,
      // 用户上传的评估标准 skill（null = 使用内置规则）
      generic_eval_skill,
      specialized_eval_skill,
      volcano_eval_skill,
      // 兼容旧字段
      volcano_rule_skill,
    } = req.body;
    if (!skill_content) return res.status(400).json({ error: '缺少 skill_content 参数' });

    // 解析评估标准（支持文本文件和压缩包）
    const [genericSkillText, specializedSkillText, volcanoSkillText] = await Promise.all([
      resolveSkillContent(generic_eval_skill),
      resolveSkillContent(specialized_eval_skill),
      resolveSkillContent(volcano_eval_skill || volcano_rule_skill),
    ]);

    let rawCases = test_cases;
    if (typeof rawCases === 'string') {
      try { rawCases = JSON.parse(rawCases); }
      catch { return res.status(400).json({ error: '测试用例 JSON 格式有误' }); }
    }
    const cases = Array.isArray(rawCases) ? rawCases : (rawCases?.test_cases || []);
    if (cases.length === 0) return res.status(400).json({ error: '测试用例不能为空' });

    // ── Phase 1: Execute ──────────────────────────────────────────
    const executionResults = [];
    for (let i = 0; i < cases.length; i++) {
      const tc = cases[i];
      const userInput = tc.input || tc.input_content || tc.user_input || '';
      const startTime = Date.now();
      let actualOutput = '', executionError = null;
      try {
        actualOutput = await callLLMForEval(model_config || null, userInput, 2000, skill_content);
      } catch (err) {
        executionError = err.message;
        actualOutput = `[执行失败: ${err.message}]`;
      }
      executionResults.push({
        id: tc.id || String(i + 1),
        name: tc.name || `用例 ${i + 1}`,
        test_type: tc.test_type || tc.type || '正常场景',
        priority: tc.priority || '中',
        input: userInput,
        expected_output: tc.expected_output || tc.expected || '',
        actual_output: actualOutput,
        execution_error: executionError,
        latency_ms: Date.now() - startTime,
      });
    }

    // ── Phase 2: Judge (通用评估) ─────────────────────────────────
    // 优先使用上传的通用评估标准 skill；未上传时使用内置 prompt
    const resultsForJudge = executionResults.map((r, i) =>
      `--- 测试用例 ${i + 1}: ${r.name} ---\n输入: ${r.input}\n预期: ${r.expected_output}\n实际: ${r.actual_output}\n耗时: ${r.latency_ms}ms`
    ).join('\n');

    let evaluationResult = {};
    try {
      let judgeText;
      if (genericSkillText) {
        // 使用上传的通用评估标准：eval skill → system prompt，测试数据 → user prompt
        const userMsg = buildJudgeUserMessage(skill_content, resultsForJudge, executionResults.length);
        judgeText = await callLLMForEval(model_config || null, userMsg, 5000, genericSkillText);
      } else {
        // 内置规则（全部放在 user prompt 中）
        const judgePrompt = buildJudgePrompt(skill_content, resultsForJudge, executionResults.length);
        judgeText = await callLLMForEval(model_config || null, judgePrompt, 5000);
      }
      const jsonMatch = judgeText.match(/\{[\s\S]*\}/);
      if (jsonMatch) evaluationResult = JSON.parse(jsonMatch[0]);
    } catch (e) {
      return res.status(400).json({ error: `Judge 模型调用失败: ${e.message}` });
    }

    const mergedResults = (evaluationResult.detailed_results || []).map((j) => {
      const ex = executionResults.find((r) => r.id === j.id) || {};
      return { ...j, actual_output: ex.actual_output || j.actual_output || '', latency_ms: ex.latency_ms || j.latency_ms || 0, input: ex.input || '', expected_output: ex.expected_output || '', execution_error: ex.execution_error || null };
    });
    const finalDetailedResults = mergedResults.length > 0 ? mergedResults : executionResults.map((r) => ({ ...r, passed: !r.execution_error, failure_reason: r.execution_error || '', scores: {} }));
    const passedCount = finalDetailedResults.filter((r) => r.passed).length;

    // ── Phase 3: Specialized (专项评估) ──────────────────────────
    // 优先使用上传的专项评估标准 skill；未上传时使用内置分类 prompt
    let specializedDimensionalScores = null, specializedWeakness = null, specializedSuggestions = [], specializedScore = null;
    if (skill_category || specializedSkillText) {
      try {
        let specText;
        if (specializedSkillText) {
          const userMsg = buildSpecializedUserMessage(skill_category, finalDetailedResults, skill_content);
          specText = await callLLMForEval(model_config || null, userMsg, 3000, specializedSkillText);
        } else {
          const specPrompt = buildSpecializedPrompt(skill_category, finalDetailedResults, skill_content);
          specText = await callLLMForEval(model_config || null, specPrompt, 3000);
        }
        const jsonMatch = specText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const specResult = JSON.parse(jsonMatch[0]);
          specializedDimensionalScores = specResult.dimensional_scores || {};
          specializedWeakness = specResult.weakness_analysis || {};
          specializedSuggestions = specResult.optimization_suggestions || [];
          const scores = Object.values(specializedDimensionalScores).map((d) => ((typeof d === 'object' ? d?.score : d) ?? 3) * 20);
          specializedScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
        }
      } catch (e) { console.error('[Phase 3 Error]', e.message); }
    }

    // ── Phase 4: Volcano (火山合规) ───────────────────────────────
    // 优先使用上传的火山评估标准 skill；兼容旧字段 volcano_rule_skill；未提供时使用内置 prompt
    let volcanoDimensionalScores = null, volcanoComplianceSummary = null, volcanoFixSuggestions = [], volcanoScore = null;
    {
      try {
        let volcanoText;
        if (volcanoSkillText) {
          const userMsg = buildVolcanoUserMessage(skill_content, skill_name || '');
          volcanoText = await callLLMForEval(model_config || null, userMsg, 3000, volcanoSkillText);
        } else {
          const volcanoPrompt = buildVolcanoPrompt(skill_content, skill_name || '');
          volcanoText = await callLLMForEval(model_config || null, volcanoPrompt, 3000);
        }
        const jsonMatch = volcanoText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const volcanoResult = JSON.parse(jsonMatch[0]);
          volcanoDimensionalScores = volcanoResult.dimensional_scores || {};
          volcanoComplianceSummary = volcanoResult.compliance_summary || '';
          volcanoFixSuggestions = volcanoResult.fix_suggestions || [];
          const scores = Object.values(volcanoDimensionalScores).map((d) => ((typeof d === 'object' ? d?.score : d) ?? 3) * 20);
          volcanoScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
        }
      } catch (e) { console.error('[Phase 4 Volcano Error]', e.message); }
    }

    // ── Score calculation ─────────────────────────────────────────
    // 动态计算通用评分：对所有返回维度取均值，自动适配 1-5 分制 / 百分制
    const dimScores = evaluationResult.dimensional_scores || {};
    let genericScore;
    const dimValues = Object.values(dimScores);
    if (dimValues.length > 0) {
      const rawScores = dimValues.map((d) => (typeof d === 'object' ? (d?.score ?? 3) : (d ?? 3)));
      const maxRaw = Math.max(...rawScores);
      const normalize = maxRaw > 5 ? (s) => s : (s) => s * 20;
      const total = rawScores.reduce((acc, s) => acc + normalize(s), 0);
      genericScore = Math.round(total / rawScores.length);
    } else {
      const mapTo100 = (s) => (typeof s === 'number' ? s : (s?.score ?? 3)) * 20;
      const qualityDim = (mapTo100(dimScores['稳定性']) + mapTo100(dimScores['准确性'])) / 2;
      const funcDim = mapTo100(dimScores['有用性']);
      const safetyDim = mapTo100(dimScores['安全性']);
      genericScore = Math.round(qualityDim * 0.4 + funcDim * 0.35 + safetyDim * 0.25);
    }
    // 综合评分 = 通用×70% + 火山×30%（如果有火山评分）；否则 = 通用100%
    const computedOverall = volcanoScore !== null
      ? Math.round(genericScore * 0.7 + volcanoScore * 0.3)
      : genericScore;

    const summary = evaluationResult.summary || {};

    res.json({
      success: true,
      evaluation_mode: 'real',
      skill_category: skill_category || null,
      summary: {
        overall_score: computedOverall,
        generic_score: genericScore,
        volcano_score: volcanoScore,
        total_tests: finalDetailedResults.length,
        passed_tests: summary.passed_tests ?? passedCount,
        failed_tests: summary.failed_tests ?? (finalDetailedResults.length - passedCount),
        pass_rate: summary.pass_rate ?? (finalDetailedResults.length > 0 ? passedCount / finalDetailedResults.length : 0),
      },
      dimensional_scores: evaluationResult.dimensional_scores || {},
      detailed_results: finalDetailedResults,
      weakness_analysis: evaluationResult.weakness_analysis || {},
      optimization_suggestions: [...(evaluationResult.optimization_suggestions || []), ...(specializedSuggestions || []).map((s) => ({ ...s, source: 'specialized' }))],
      specialized_dimensional_scores: specializedDimensionalScores || null,
      specialized_weakness_analysis: specializedWeakness || null,
      specialized_suggestions: specializedSuggestions || [],
      volcano_score: volcanoScore,
      volcano_dimensional_scores: volcanoDimensionalScores || null,
      volcano_compliance_summary: volcanoComplianceSummary || null,
      volcano_fix_suggestions: volcanoFixSuggestions || [],
      execution_log: executionResults.map((r) => ({ id: r.id, name: r.name, input: r.input, expected_output: r.expected_output, actual_output: r.actual_output, latency_ms: r.latency_ms, execution_error: r.execution_error })),
    });
  } catch (error) {
    console.error('Skill evaluation error:', error.message, error.stack);
    res.status(500).json({ error: '技能评估失败', details: error.message });
  }
}
