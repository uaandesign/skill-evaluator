/**
 * POST /api/evaluate-skill
 * Three-phase evaluation: Execute → Judge → Specialized
 */

import { initializePool, Skills, ModelConfigs, EvaluationResults, SkillCategories } from '../lib/db.js';
import { fetchWithRetry, callLLMForEval } from '../lib/llm.js';
import { buildJudgePrompt, buildSpecializedPrompt, mergeOptimizationSuggestions } from '../lib/evaluation.js';

initializePool(process.env.DATABASE_URL);

// Retry wrapper for API calls
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
        console.log(`[evaluate-skill] ${providerLabel} ${resp.status}, 重试 ${attempt + 1}/${maxRetries}, 延迟 ${delay}ms`);
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
          console.log(`[evaluate-skill] ${providerLabel} 网络错误: ${e.message}, 重试 ${attempt + 1}/${maxRetries}, 延迟 ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
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

    const body = {
      model,
      max_tokens: maxTokens,
      temperature: 0,
      messages: [{ role: 'user', content: userPrompt }],
    };
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
    if (systemPrompt) {
      geminiBody.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const startTime = Date.now();

  try {
    const { skill_id, model_config, test_input, skill_category } = req.body;

    if (!skill_id || !model_config || !test_input) {
      return res.status(400).json({ error: '缺少必填字段' });
    }

    // Get skill
    const skill = await Skills.getById(skill_id);
    if (!skill) return res.status(404).json({ error: '技能不存在' });

    const modelConfig = model_config;

    // ──────────────────────────────────────────────────────────────
    // PHASE 1: Execute skill
    // ──────────────────────────────────────────────────────────────
    let phase1Output = '';
    let phase1Success = false;
    let phase1Error = null;

    try {
      phase1Output = await callLLMForEval(modelConfig, test_input, 4000, skill.skill_content);
      phase1Success = true;
    } catch (e) {
      phase1Error = e.message;
      console.error('[Phase 1 Error]', e);
    }

    // ──────────────────────────────────────────────────────────────
    // PHASE 2: Judge with generic dimensions
    // ──────────────────────────────────────────────────────────────
    let phase2Score = 0;
    let phase2QualityDim = 0;
    let phase2FuncDim = 0;
    let phase2SafetyDim = 0;
    let phase2Eval = '';
    let phase2Suggestions = '';

    if (phase1Success && phase1Output) {
      try {
        const judgePrompt = `技能定义：
\`\`\`
${skill.skill_content}
\`\`\`

测试输入：
${test_input}

技能输出：
${phase1Output}

请根据以下维度进行评分，每个维度 1-5 分，并生成优化建议：

1. 有用性 (1=完全未解决问题 → 5=完美解决问题)
2. 稳定性 (1=输出格式混乱 → 5=高度一致)
3. 准确性 (1=大量错误信息 → 5=完全准确)
4. 安全性 (1=包含明显违规 → 5=安全性极佳)

请返回标准 JSON 格式：
{
  "quality_dimension": 4,
  "functionality_dimension": 4,
  "safety_dimension": 5,
  "evaluation": "评价说明",
  "optimization_suggestions": "优化建议"
}`;

        const judgeText = await callLLMForEval(modelConfig, judgePrompt, 2000);
        const jsonMatch = judgeText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const judgeResult = JSON.parse(jsonMatch[0]);
          phase2QualityDim = judgeResult.quality_dimension || 0;
          phase2FuncDim = judgeResult.functionality_dimension || 0;
          phase2SafetyDim = judgeResult.safety_dimension || 0;
          phase2Eval = judgeResult.evaluation || '';
          phase2Suggestions = judgeResult.optimization_suggestions || '';
          phase2Score = Math.round(phase2QualityDim * 0.4 + phase2FuncDim * 0.35 + phase2SafetyDim * 0.25);
        }
      } catch (e) {
        console.error('[Phase 2 Error]', e);
      }
    }

    // ──────────────────────────────────────────────────────────────
    // PHASE 3: Specialized evaluation (if applicable)
    // ──────────────────────────────────────────────────────────────
    let phase3Score = null;
    let phase3Dimensions = null;
    let phase3Eval = '';
    let phase3Suggestions = '';
    let finalScore = phase2Score;

    if (phase1Success && phase1Output && skill_category) {
      try {
        const specializedPrompt = buildSpecializedPrompt(skill_category, phase1Output, skill.skill_content);
        const specText = await callLLMForEval(modelConfig, specializedPrompt, 3000);
        const jsonMatch = specText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const specResult = JSON.parse(jsonMatch[0]);
          phase3Dimensions = specResult.dimensions || {};
          phase3Score = specResult.total_score || 0;
          phase3Eval = specResult.evaluation || '';
          phase3Suggestions = specResult.optimization_suggestions || '';
          // 总分 = 通用 60% + 专项 40%
          finalScore = Math.round(phase2Score * 0.6 + phase3Score * 0.4);
        }
      } catch (e) {
        console.error('[Phase 3 Error]', e);
      }
    }

    // ──────────────────────────────────────────────────────────────
    // Save evaluation result
    // ──────────────────────────────────────────────────────────────
    const evalDuration = Date.now() - startTime;
    const result = await EvaluationResults.create({
      skillId: skill_id,
      modelId: model_config.id || null,
      testCaseId: null,
      phase1Output,
      phase1Success,
      phase1Error,
      phase2QualityDim,
      phase2FuncDim,
      phase2SafetyDim,
      phase2Score,
      phase2Eval,
      phase2Suggestions,
      phase3Dimensions,
      phase3Score,
      phase3Eval,
      phase3Suggestions,
      finalScore,
      duration: evalDuration,
      status: phase1Success ? 'completed' : 'failed',
      errorMessage: phase1Error,
    });

    res.status(200).json({
      evaluation_id: result.id,
      phase_1: { success: phase1Success, output: phase1Output, error: phase1Error },
      phase_2: {
        quality_dimension: phase2QualityDim,
        functionality_dimension: phase2FuncDim,
        safety_dimension: phase2SafetyDim,
        score: phase2Score,
        evaluation: phase2Eval,
        optimization_suggestions: phase2Suggestions,
      },
      phase_3: phase3Score ? {
        dimensions: phase3Dimensions,
        score: phase3Score,
        evaluation: phase3Eval,
        optimization_suggestions: phase3Suggestions,
      } : null,
      final_score: finalScore,
      duration_ms: evalDuration,
    });
  } catch (error) {
    console.error('[Evaluate API Error]', error);
    res.status(500).json({
      error: '评估失败',
      details: error.message,
    });
  }
}

// Helper functions
function buildSpecializedPrompt(categoryId, testResults, skillContent) {
  const prompts = {
    'text-generation': `评估文本生成技能的输出质量...`,
    'code-generation': `评估代码生成技能的代码质量...`,
    'data-collection': `评估数据采集技能的采集完整性...`,
    'competitor-research': `评估竞品调研技能的调研深度...`,
  };
  return prompts[categoryId] || '请评估技能输出';
}
