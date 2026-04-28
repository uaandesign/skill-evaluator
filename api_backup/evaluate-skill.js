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

// ── Eval Standard resolver + Python script runner ─────────────────────────

/**
 * 从 SKILL.md 的维度表格中解析 ID → {name, max} 映射。
 * 匹配格式：| dimension_id | 中文名称 | 15 |
 */
function parseDimensionTable(text) {
  if (!text) return {};
  const map = {};
  const re = /^\|\s*([a-z][a-z0-9_]+)\s*\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    const id   = m[1].trim();
    const name = m[2].trim().replace(/`/g, '').replace(/\*\*/g, '');
    const max  = parseInt(m[3], 10);
    if (id.length > 2 && max >= 5 && max <= 100) map[id] = { name, max };
  }
  return map;
}

/**
 * 从 SKILL.md 提取评估脚本相对路径。
 * 匹配格式：评估脚本：`scripts/evaluate_skill.py`
 */
function parseScriptName(text) {
  if (!text) return null;
  const m = text.match(/评估脚本[：:]\s*`?([^\s`\n]+\.py)`?/m);
  return m ? m[1].trim() : null;
}

/**
 * 将 Python 脚本 category_scores 映射到前端 dimensional_scores 格式。
 * @param {object} categoryScores - {id: {earned, available}}
 * @param {object} dimensionMap   - {id: {name, max}}
 * @param {Array}  allChecks      - 脚本输出的全量检查项，用于生成分数解释
 */
function mapCategoryScores(categoryScores, dimensionMap, allChecks = []) {
  const result = {};
  for (const [id, data] of Object.entries(categoryScores || {})) {
    const earned = data.earned    ?? 0;
    const avail  = data.available ?? 0;
    const name   = dimensionMap[id]?.name || id;

    // 构建分数说明：列举该维度下各检查项的通过/失败情况
    const catChecks    = allChecks.filter((c) => c.category === id);
    const failedChecks = catChecks.filter((c) => !c.passed);
    const passedChecks = catChecks.filter((c) =>  c.passed);

    let comment;
    if (catChecks.length > 0) {
      const ratio = avail > 0 ? Math.round(earned / avail * 100) : 0;
      const parts = [`得分 ${earned}/${avail}（${ratio}%），共 ${catChecks.length} 项检查`];
      if (passedChecks.length > 0) parts.push(`✅ 通过 ${passedChecks.length} 项`);
      if (failedChecks.length > 0) {
        const failDetails = failedChecks
          .map((c) => `[${c.id}] ${c.title}${c.evidence ? '：' + c.evidence : ''}`)
          .join('；');
        parts.push(`❌ 未通过 ${failedChecks.length} 项：${failDetails}`);
      }
      comment = parts.join('，');
    } else {
      if (avail > 0) {
        const ratio = Math.round(earned / avail * 100);
        if (ratio >= 90)      comment = `得分 ${earned}/${avail}，表现优秀，几乎满足该维度全部要求。`;
        else if (ratio >= 70) comment = `得分 ${earned}/${avail}，基本达标，仍有小幅提升空间。`;
        else if (ratio >= 50) comment = `得分 ${earned}/${avail}，部分要求未满足，建议针对性优化。`;
        else                  comment = `得分 ${earned}/${avail}，该维度得分较低，需要重点改进。`;
      } else {
        comment = `得分 ${earned} 分。`;
      }
    }

    result[name] = { score: earned, max: avail, comment };
  }
  return result;
}

/**
 * 将英文优先级标识统一转换为中文
 */
function normalizePriority(p) {
  if (!p) return '低';
  const lp = String(p).toLowerCase();
  if (lp === 'high'   || p === '高') return '高';
  if (lp === 'medium' || lp === 'mid' || p === '中') return '中';
  return '低';
}

/**
 * 合并通用、专项、火山优化建议，统一中文优先级标签并按优先级排序。
 */
function mergeOptimizationSuggestions(generic = [], specialized = [], volcano = []) {
  const merged = [];
  generic.forEach((s)    => merged.push({ ...s, priority: normalizePriority(s.priority), source: s.source || 'generic' }));
  specialized.forEach((s) => merged.push({ ...s, priority: normalizePriority(s.priority), source: 'specialized' }));
  volcano.forEach((s)    => merged.push({ ...s, priority: normalizePriority(s.priority), source: 'volcano' }));
  const order = { '高': 0, '中': 1, '低': 2 };
  return merged.sort((a, b) => (order[a.priority] ?? 9) - (order[b.priority] ?? 9));
}

/**
 * 运行评估 Skill zip 中的 Python 脚本，对目标 Skill 进行确定性评估。
 * 注意：Vercel 标准 serverless 环境无 Python 3，此函数将失败并返回 null（优雅降级到 LLM）。
 */
async function runEvalScript(evalSkillBase64, targetContent, targetName, scriptRelPath) {
  if (!evalSkillBase64) return null;
  try {
    const fs      = await import('fs');
    const os      = await import('os');
    const path    = await import('path');
    const cp      = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(cp.execFile);

    const AdmZip = (await import('adm-zip')).default;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-eval-'));

    try {
      const buf  = Buffer.from(evalSkillBase64, 'base64');
      const zip  = new AdmZip(buf);
      const evalDir = path.join(tmpDir, 'eval-skill');
      fs.mkdirSync(evalDir, { recursive: true });
      const entries = zip.getEntries().filter((e) => !e.isDirectory && !e.entryName.includes('__MACOSX'));
      for (const entry of entries) {
        const dest = path.join(evalDir, entry.entryName);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, entry.getData());
      }
      let evalRoot = evalDir;
      const tops = fs.readdirSync(evalDir);
      if (tops.length === 1 && fs.statSync(path.join(evalDir, tops[0])).isDirectory()) {
        evalRoot = path.join(evalDir, tops[0]);
      }
      let scriptPath = null;
      if (scriptRelPath) {
        const sp = path.join(evalRoot, scriptRelPath);
        if (fs.existsSync(sp)) scriptPath = sp;
      }
      if (!scriptPath) {
        const sd = path.join(evalRoot, 'scripts');
        if (fs.existsSync(sd)) {
          const py = fs.readdirSync(sd).filter((f) => f.endsWith('.py'));
          if (py.length) scriptPath = path.join(sd, py[0]);
        }
      }
      if (!scriptPath) return null;

      let folderName = (targetName || 'target-skill').replace(/[^a-zA-Z0-9-_]/g, '-');
      const fmMatch = (targetContent || '').match(/^---[\s\S]*?^name:\s*(.+?)$/m);
      if (fmMatch) { const p = fmMatch[1].trim().replace(/^["']|["']$/g, ''); if (p) folderName = p; }
      const targetFolder = path.join(tmpDir, 'target', folderName);
      fs.mkdirSync(targetFolder, { recursive: true });
      fs.writeFileSync(path.join(targetFolder, 'SKILL.md'), targetContent || '', 'utf8');

      const { stdout, stderr } = await execFileAsync(
        'python3', [scriptPath, targetFolder, '--format', 'json'],
        { timeout: 30000, maxBuffer: 2 * 1024 * 1024 }
      );
      if (stderr) console.warn('[runEvalScript] stderr:', stderr.substring(0, 200));
      const result = JSON.parse(stdout.trim());
      console.log(`[runEvalScript] 脚本完成，score: ${result.score}`);
      return result;
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  } catch (err) {
    console.warn('[runEvalScript] 失败（Vercel 无 Python？）:', err.message);
    return null;
  }
}

/**
 * 从评估标准对象中提取内容，返回 { text, dimensionMap, scriptName, base64 }。
 * - 文本文件：直接解析
 * - 压缩包：读取全部 .md/.txt/.yaml 文件并拼接
 */
async function resolveEvalSkillContent(standard) {
  const empty = { text: null, dimensionMap: {}, scriptName: null, base64: null };
  if (!standard) return empty;
  if (typeof standard === 'string') {
    return { text: standard, dimensionMap: parseDimensionTable(standard), scriptName: parseScriptName(standard), base64: null };
  }
  if (!standard.isCompressed) {
    const text = standard.content || null;
    return { text, dimensionMap: parseDimensionTable(text), scriptName: parseScriptName(text), base64: null };
  }
  if (!standard.base64) return empty;
  try {
    const AdmZip = (await import('adm-zip')).default;
    const buf  = Buffer.from(standard.base64, 'base64');
    const zip  = new AdmZip(buf);
    const all  = zip.getEntries().filter((e) => !e.isDirectory && !e.entryName.includes('__MACOSX'));
    const txts = all.filter((e) => /\.(md|txt|yaml|yml)$/i.test(e.entryName));
    txts.sort((a, b) => {
      const rank = (n) => /SKILL\.md$/i.test(n) ? 0 : /references\//i.test(n) ? 1 : 2;
      return rank(a.entryName) - rank(b.entryName);
    });
    let text = null;
    if (txts.length > 0) {
      text = txts.map((e) => {
        const fn = e.entryName.split('/').filter(Boolean).pop();
        return `<!-- file: ${fn} -->\n${e.getData().toString('utf8')}`;
      }).join('\n\n---\n\n');
    } else if (all.length > 0) {
      text = all[0].getData().toString('utf8');
    }
    const skillMdEntry = txts.find((e) => /SKILL\.md$/i.test(e.entryName));
    const skillMdText  = skillMdEntry ? skillMdEntry.getData().toString('utf8') : text;
    const dimensionMap = parseDimensionTable(skillMdText);
    const scriptName   = parseScriptName(skillMdText);
    console.log(`[resolveEvalSkillContent] zip 解析，维度表 ${Object.keys(dimensionMap).length} 项，脚本: ${scriptName || '未找到'}`);
    return { text, dimensionMap, scriptName, base64: standard.base64 };
  } catch (err) {
    console.error('[resolveEvalSkillContent] 解压失败:', err.message);
    return empty;
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

请严格返回 JSON（不要输出任何其他内容）。
- dimensional_scores 的每个 key 必须是系统提示中定义的维度名，有多少维度就写多少个 key
- 每个维度必须包含 score（实际得分）和 max（该维度在系统提示评分规则中的满分），从系统提示评分规则里直接读取满分值，不得估算或捏造
{"summary":{"total_tests":${totalTests},"passed_tests":0,"failed_tests":0,"pass_rate":0.0},"dimensional_scores":{"<维度1名>":{"score":12,"max":15,"comment":"评分理由"},"<维度2名>":{"score":16,"max":20,"comment":"评分理由"},"<...每个维度>":{"score":0,"max":0,"comment":""}},"detailed_results":[{"id":"1","name":"","passed":true,"actual_output":"","failure_reason":"","latency_ms":0,"scores":{}}],"weakness_analysis":{"lowest_dimension":"","common_failures":[],"systematic_issues":[]},"optimization_suggestions":[{"dimension":"","priority":"高/中/低","issue":"","suggestion":"","expected_impact":""}]}`;
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

请严格返回 JSON（不要输出其他内容）。
- dimensional_scores 的每个 key 必须是系统提示中定义的检查维度名，有多少维度就写多少个 key
- 每个维度必须包含 score（实际得分）和 max（该维度在系统提示评分规则中的满分），从系统提示评分规则里直接读取满分值，不得估算或捏造
{"dimensional_scores":{"<维度1名>":{"score":45,"max":55,"comment":"评分理由","issues":[]},"<维度2名>":{"score":20,"max":25,"comment":"","issues":[]},"<...每个维度>":{"score":0,"max":0,"comment":"","issues":[]}},"compliance_summary":"总体合规性总结","fix_suggestions":[{"dimension":"","priority":"高/中/低","issue":"","fix":""}]}`;
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
      // Judge 开关：前端「配置中心 → 评估标准 → 启用 Judge 模型评分」传入
      use_judge,
    } = req.body;
    if (!skill_content) return res.status(400).json({ error: '缺少 skill_content 参数' });

    // 解析评估标准（支持文本文件和压缩包，同时提取维度表和脚本名）
    const [genericResolved, specializedResolved, volcanoResolved] = await Promise.all([
      resolveEvalSkillContent(generic_eval_skill),
      resolveEvalSkillContent(specialized_eval_skill),
      resolveEvalSkillContent(volcano_eval_skill || volcano_rule_skill),
    ]);
    const genericSkillText     = genericResolved.text;
    const genericDimensionMap  = genericResolved.dimensionMap;
    const genericScriptName    = genericResolved.scriptName;
    const genericBase64        = genericResolved.base64;
    const specializedSkillText = specializedResolved.text;
    const volcanoSkillText     = volcanoResolved.text;
    const volcanoDimensionMap  = volcanoResolved.dimensionMap;
    const volcanoScriptName    = volcanoResolved.scriptName;
    const volcanoBase64        = volcanoResolved.base64;

    const hasGenericScript = !!(genericBase64 && genericScriptName);
    const hasVolcanoScript = !!(volcanoBase64 && volcanoScriptName);

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

    // ── Phase 2: Judge (通用评估) — 优先 Python 脚本，失败回退 LLM ──────
    const resultsForJudge = executionResults.map((r, i) =>
      `--- 测试用例 ${i + 1}: ${r.name} ---\n输入: ${r.input}\n预期: ${r.expected_output}\n实际: ${r.actual_output}\n耗时: ${r.latency_ms}ms`
    ).join('\n');

    // use_judge 由前端「配置中心 → 评估标准 → 启用 Judge 模型评分」传入
    // 默认 false（一期推荐关闭）；true 时在脚本失败后回退 LLM Judge
    const SKIP_JUDGE = !use_judge;

    let evaluationResult = {};
    let scriptUsed  = false;
    let judgeSkipped = false;

    // ① 尝试运行通用评估脚本（确定性评估）
    if (hasGenericScript) {
      const scriptResult = await runEvalScript(genericBase64, skill_content, skill_name, genericScriptName);
      if (scriptResult) {
        const passedN   = executionResults.filter((r) => !r.execution_error).length;
        const allChecks = scriptResult.checks || [];
        const dimScoresFromScript = mapCategoryScores(scriptResult.category_scores || {}, genericDimensionMap, allChecks);
        evaluationResult = {
          summary: {
            overall_score: scriptResult.score ?? 0,
            total_tests:   executionResults.length,
            passed_tests:  passedN,
            failed_tests:  executionResults.length - passedN,
            pass_rate:     executionResults.length > 0 ? passedN / executionResults.length : 0,
          },
          dimensional_scores: dimScoresFromScript,
          detailed_results: executionResults.map((r) => ({
            ...r, passed: !r.execution_error, failure_reason: r.execution_error || '', scores: {},
          })),
          weakness_analysis: {
            lowest_dimension: (() => {
              let ln = '', lp = Infinity;
              for (const [n, d] of Object.entries(dimScoresFromScript)) {
                const pct = d.max > 0 ? d.score / d.max : 0;
                if (pct < lp) { lp = pct; ln = n; }
              }
              return ln;
            })(),
            common_failures: allChecks.filter((c) => !c.passed).slice(0, 5).map((c) => `[${c.id}] ${c.title}: ${c.evidence}`),
            systematic_issues: [],
          },
          optimization_suggestions: allChecks.filter((c) => !c.passed).map((c) => ({
            dimension:       genericDimensionMap[c.category]?.name || c.category,
            priority:        c.severity === 'hard' ? '高' : '低',
            issue:           c.title || `检查项 ${c.id} 未通过`,
            suggestion:      `请修复检查项 [${c.id}]${c.evidence ? '：当前问题为"' + c.evidence + '"，请针对该问题进行修正' : '，参照评估标准进行改进'}。`,
            expected_impact: c.available ? `可提升 ${c.available} 分` : '提升通用评分',
          })),
          script_checks:     allChecks,
          script_score:      scriptResult.score,
          script_assessment: scriptResult.generic_assessment || null,
          evaluation_source: 'script',
        };
        scriptUsed   = true;
        judgeSkipped = true;
        console.log(`[Phase 2] 脚本评估成功，score: ${scriptResult.score}`);
      }
    }

    // ② 脚本未运行或失败：根据 SKIP_JUDGE 决定是否调用 LLM Judge
    if (!scriptUsed) {
      let judgeResponseText;
      if (!SKIP_JUDGE) {
        // ── Judge 模式：调用 LLM ──
        console.log(`[Phase 2] 调用 Judge 模型 (${model_config?.provider}/${model_config?.model})...`);
        try {
          if (genericSkillText) {
            judgeResponseText = await callLLMForEval(
              model_config || null,
              buildJudgeUserMessage(skill_content, resultsForJudge, executionResults.length),
              5000, genericSkillText
            );
          } else {
            judgeResponseText = await callLLMForEval(
              model_config || null,
              buildJudgePrompt(skill_content, resultsForJudge, executionResults.length),
              5000
            );
          }
        } catch (e) {
          console.error('[Phase 2] Judge 调用失败，降级到基础评估:', e.message);
        }
        if (judgeResponseText) {
          try {
            const jsonMatch = judgeResponseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              evaluationResult = JSON.parse(jsonMatch[0]);
              judgeSkipped = false;
              console.log('[Phase 2] Judge 解析成功');
            }
          } catch (e) {
            console.error('[Phase 2] Judge 响应解析失败，降级到基础评估');
          }
        }
      }

      // ── SKIP_JUDGE 或 Judge 失败：基于执行结果构建基础评估 ──
      if (SKIP_JUDGE || !judgeResponseText || !evaluationResult.dimensional_scores) {
        console.log('[Phase 2] 构建基础评估结果（无脚本/无 Judge）');
        const passedN  = executionResults.filter((r) => !r.execution_error).length;
        const totalN   = executionResults.length;
        const passRate = totalN > 0 ? passedN / totalN : 0;

        let baseScores = {};
        if (genericDimensions && genericDimensions.length > 0) {
          genericDimensions.forEach((dim) => {
            baseScores[dim.name] = {
              score:   Math.round(dim.max * passRate),
              max:     dim.max,
              comment: `基于测试通过率（${Math.round(passRate * 100)}%）估算得分，请上传评估脚本以获取精确评分。`,
            };
          });
        } else {
          const s = passRate >= 0.8 ? 4 : passRate >= 0.6 ? 3 : 2;
          baseScores = {
            '有用性': { score: s, max: 5, comment: `基于测试通过率（${Math.round(passRate * 100)}%）估算。` },
            '稳定性': { score: s, max: 5, comment: `基于测试通过率（${Math.round(passRate * 100)}%）估算。` },
            '准确性': { score: s, max: 5, comment: `基于测试通过率（${Math.round(passRate * 100)}%）估算。` },
            '安全性': { score: 4, max: 5, comment: '无脚本评估，默认较高分；请上传评估脚本以精确检查。' },
          };
        }
        evaluationResult = {
          summary: {
            overall_score: Math.round(passRate * 100),
            total_tests: totalN, passed_tests: passedN,
            failed_tests: totalN - passedN, pass_rate: passRate,
          },
          dimensional_scores: baseScores,
          detailed_results: executionResults.map((r, i) => ({
            id: r.id || `${i + 1}`, name: r.name || `测试用例 ${i + 1}`,
            test_type: r.test_type || '正常场景', priority: r.priority || '中',
            passed: !r.execution_error,
            actual_output: r.actual_output || '', expected_output: r.expected_output || '',
            input: r.input || '', failure_reason: r.execution_error || '',
            latency_ms: r.latency_ms || 0, scores: {},
          })),
          weakness_analysis: {
            lowest_dimension: '',
            common_failures: executionResults.filter((r) => r.execution_error).map((r) => r.execution_error).slice(0, 3),
            systematic_issues: [],
          },
          optimization_suggestions: [],
          judge_skipped: true,
          judge_skip_reason: use_judge
            ? 'Judge 模型调用失败，已降级为基于执行结果的基础评估。'
            : '未启用 Judge 模型（配置中心 → 评估标准 → Judge 模型评分 已关闭），请上传含评估脚本的 ZIP 包以获取精确评分。',
          evaluation_source: 'execution_only',
        };
        judgeSkipped = true;
      }
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

    // ── Phase 4: Volcano (火山合规) — 优先 Python 脚本，失败回退 LLM ────
    let volcanoDimensionalScores = null, volcanoComplianceSummary = null, volcanoFixSuggestions = [], volcanoScore = null;
    if (volcanoSkillText || hasVolcanoScript) {
      let volcScriptUsed = false;

      // ① 尝试运行火山评估脚本
      if (hasVolcanoScript) {
        const vsr = await runEvalScript(volcanoBase64, skill_content, skill_name, volcanoScriptName);
        if (vsr) {
          // 合并所有火山检查项，去重
          const volcAllChecks = []
            .concat(vsr.checks         || [])
            .concat(vsr.hard_failures  || [])
            .concat(vsr.warnings       || [])
            .filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i);

          volcanoDimensionalScores = mapCategoryScores(vsr.category_scores || {}, volcanoDimensionMap, volcAllChecks);
          volcanoComplianceSummary = vsr.volcano_assessment?.reason || '';

          // 构建火山合规优化建议（全中文，含命名规范问题）
          volcanoFixSuggestions = volcAllChecks
            .filter((c) => !c.passed)
            .map((c) => {
              const dimName  = volcanoDimensionMap[c.category]?.name || c.category || '火山合规';
              const priority = c.severity === 'hard' ? '高' : '低';
              let issueCn = c.title || `检查项 ${c.id} 未通过`;
              if (/^[A-Za-z\s_\-:]+$/.test(issueCn)) issueCn = `[${c.id}] ${issueCn}`;
              const evidence = c.evidence ? `当前值为："${c.evidence}"` : '';
              let fixCn;
              const catLower = (c.category || '').toLowerCase();
              if (catLower.includes('naming') || catLower.includes('name') || c.id?.toLowerCase().includes('name')) {
                fixCn = `【命名规范】请修正 Skill 命名，确保使用小写字母、数字和连字符，避免空格及特殊字符。${evidence}`;
              } else if (catLower.includes('metadata') || catLower.includes('meta')) {
                fixCn = `【元数据】请补全或修正 SKILL.md 中的元数据字段（如 name、description、version 等）。${evidence}`;
              } else if (catLower.includes('trigger') || catLower.includes('desc')) {
                fixCn = `【触发描述】请优化 Skill 的触发词或描述，确保语义清晰、符合规范。${evidence}`;
              } else if (catLower.includes('format') || catLower.includes('struct')) {
                fixCn = `【格式结构】请检查 SKILL.md 的文档格式，确保章节结构、Markdown 语法符合规范。${evidence}`;
              } else if (catLower.includes('security') || catLower.includes('safe')) {
                fixCn = `【安全合规】请检查并移除潜在的安全风险内容，确保 Skill 符合平台安全要求。${evidence}`;
              } else {
                fixCn = `请修复检查项 [${c.id}] 所指出的问题。${evidence ? evidence + '，' : ''}建议参照火山平台 Skill 规范进行修正。`;
              }
              return {
                dimension:       dimName,
                priority,
                issue:           issueCn,
                suggestion:      fixCn,
                expected_impact: c.available ? `可提升 ${c.available} 分` : '提升合规得分',
                source:          'volcano',
              };
            });

          volcanoScore = vsr.score ?? 0;
          volcScriptUsed = true;
          console.log(`[Phase 4] 火山脚本评估成功，score: ${volcanoScore}`);
        }
      }

      // ② 回退：LLM
      if (!volcScriptUsed) {
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
            volcanoFixSuggestions    = volcanoResult.fix_suggestions || [];
            const volcEntries = Object.entries(volcanoDimensionalScores);
            const volcHasMax  = volcEntries.some(([, d]) => typeof d === 'object' && d?.max != null && d.max > 0);
            if (volcHasMax) {
              let ve = 0, vt = 0;
              for (const [, d] of volcEntries) {
                ve += typeof d === 'object' ? (d?.score ?? 0) : (d ?? 0);
                vt += typeof d === 'object' ? (d?.max   ?? 0) : 0;
              }
              volcanoScore = vt > 0 ? Math.round(ve / vt * 100) : 0;
            } else {
              const vr = volcEntries.map(([, d]) => typeof d === 'object' ? (d?.score ?? 0) : (d ?? 0));
              const vm = vr.length > 0 ? Math.max(...vr) : 0;
              volcanoScore = vr.length > 0 ? Math.round(vr.map(vm > 5 ? (s) => s : (s) => s * 20).reduce((a, b) => a + b, 0) / vr.length) : 0;
            }
          }
        } catch (e) { console.error('[Phase 4 Volcano Error]', e.message); }
      }
    }

    // ── Score calculation — 读取 skill 定义的维度满分，零硬编码 ─────
    const dimScores  = evaluationResult.dimensional_scores || {};
    const dimEntries = Object.entries(dimScores);
    let genericScore;

    if (scriptUsed && evaluationResult.script_score != null) {
      // 脚本评估：直接使用脚本输出的总分
      genericScore = evaluationResult.script_score;
    } else if (dimEntries.length > 0) {
      const hasMax = dimEntries.some(([, d]) => typeof d === 'object' && d?.max != null && d.max > 0);
      if (hasMax) {
        let totalEarned = 0, totalMax = 0;
        for (const [, d] of dimEntries) {
          totalEarned += typeof d === 'object' ? (d?.score ?? 0) : (d ?? 0);
          totalMax    += typeof d === 'object' ? (d?.max   ?? 0) : 0;
        }
        genericScore = totalMax > 0 ? Math.round(totalEarned / totalMax * 100) : 0;
      } else {
        const rawScores = dimEntries.map(([, d]) => typeof d === 'object' ? (d?.score ?? 0) : (d ?? 0));
        const maxRaw    = Math.max(...rawScores);
        const normalize = maxRaw > 5 ? (s) => s : (s) => s * 20;
        genericScore = Math.round(rawScores.map(normalize).reduce((a, b) => a + b, 0) / rawScores.length);
      }
    } else {
      genericScore = 0;
    }
    // 综合评分 = 通用×80% + 火山×20%（如果有火山评分）；否则 = 通用100%
    const computedOverall = volcanoScore !== null
      ? Math.round(genericScore * 0.8 + volcanoScore * 0.2)
      : genericScore;

    const summary = evaluationResult.summary || {};

    res.json({
      success: true,
      evaluation_mode: 'real',
      evaluation_source: scriptUsed ? 'script' : 'llm',
      script_checks: scriptUsed ? (evaluationResult.script_checks || []) : [],
      script_assessment: scriptUsed ? (evaluationResult.script_assessment || null) : null,
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
      optimization_suggestions: mergeOptimizationSuggestions(
        evaluationResult.optimization_suggestions || [],
        specializedSuggestions,
        volcanoFixSuggestions,
      ),
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
