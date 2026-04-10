/**
 * Specialized Evaluation Utilities
 * 专项评估执行逻辑
 */

import {
  getSpecializedRule,
  getSpecializedDimensions,
  calculateSpecializedScore,
  generateTestCaseTemplate,
} from '../specializedRules';

/**
 * Generate specialized test cases based on skill category
 */
export function generateSpecializedTestCases(categoryId, skillName = '') {
  if (!categoryId) return [];
  const template = generateTestCaseTemplate(categoryId);
  return template.map((t) => ({
    ...t,
    id: t.id || String(Math.random()),
  }));
}

/**
 * Execute specialized evaluation based on category
 * This is called in addition to generic evaluation
 */
export async function executeSpecializedEvaluation(
  categoryId,
  skillContent,
  testResults,
  modelConfig,
  callLLM
) {
  if (!categoryId) {
    return null; // No specialized eval if no category
  }

  const rule = getSpecializedRule(categoryId);
  if (!rule) return null;

  // Build specialized evaluation prompt based on category
  const prompt = buildSpecializedPrompt(categoryId, rule, skillContent, testResults);

  try {
    const response = await callLLM(modelConfig, prompt, 3000);
    const parsed = parseSpecializedResponse(response);
    return parsed;
  } catch (error) {
    console.error('Specialized evaluation failed:', error);
    return null;
  }
}

/**
 * Build prompt for specialized evaluation
 */
function buildSpecializedPrompt(categoryId, rule, skillContent, testResults) {
  const dimensions = rule.dimensions || [];
  const dimensionsText = dimensions
    .map((d) => `- ${d.name}（${d.weight}分）: ${d.description}`)
    .join('\n');

  const resultsText = testResults
    .map(
      (r, i) => `
用例 ${i + 1}: ${r.name} (${r.test_type})
输入: ${r.input}
预期: ${r.expected_output}
实际: ${r.actual_output}
状态: ${r.passed ? '通过' : '失败'}
`
    )
    .join('\n');

  return `你是一名${rule.name}的专项评估专家。

## 技能定义
\`\`\`
${skillContent}
\`\`\`

## 专项评估维度（共${dimensions.length}个维度，每维度满分5分，总分40分）

${dimensionsText}

## 测试结果
${resultsText}

请基于上述维度，对该技能的表现进行1-5分的评分，并生成以下JSON格式的评估结果：

{
  "dimensional_scores": {
    "${dimensions[0]?.name || '维度1'}": { "score": 4, "comment": "具体评分说明" },
    // 其他维度...
  },
  "weakness_analysis": {
    "lowest_dimension": "得分最低的维度",
    "common_failures": ["共性问题"],
    "systematic_issues": ["系统性问题"]
  },
  "optimization_suggestions": [
    {
      "dimension": "维度名",
      "priority": "高/中/低",
      "issue": "具体问题",
      "suggestion": "优化建议",
      "expected_impact": "预期提升"
    }
  ]
}

注意：
1. 按照${rule.name}的专项标准评分，1-5分标尺要严格
2. 所有评分和建议都要具体、可执行
3. 仅输出JSON，无其他文本`;
}

/**
 * Parse specialized evaluation response
 */
function parseSpecializedResponse(responseText) {
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      success: true,
      dimensional_scores: parsed.dimensional_scores || {},
      weakness_analysis: parsed.weakness_analysis || {},
      optimization_suggestions: parsed.optimization_suggestions || [],
    };
  } catch (error) {
    console.error('Failed to parse specialized response:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Calculate final score combining generic (60%) and specialized (40%)
 */
export function calculateCombinedScore(genericScore, specializedScore) {
  if (!specializedScore) {
    return genericScore;
  }

  const genericPart = (genericScore || 0) * 0.6;
  const specializedPart = (specializedScore || 0) * 0.4;
  return Math.round(genericPart + specializedPart);
}

/**
 * Execute code-specific tests (for code-generation category)
 */
export async function executeCodeTests(testCases, modelConfig, callLLM) {
  const results = [];

  for (const testCase of testCases) {
    const testResult = {
      id: testCase.id,
      name: testCase.name,
      type: testCase.type || 'normal',
      passed: false,
      output: '',
      error: '',
    };

    // For code generation, we validate syntax and runability
    try {
      // Try to parse/evaluate the code to check syntax
      if (typeof testCase.actual_output === 'string' && testCase.actual_output.includes('function') || testCase.actual_output.includes('class')) {
        // Basic syntax check - avoid using eval
        const isSyntaxValid = !(/\{(?!.*\})|[\[\(](?!.*[\]\)])/g.test(testCase.actual_output));
        if (isSyntaxValid) {
          testResult.passed = true;
          testResult.output = '代码语法有效';
        } else {
          testResult.error = '检测到语法问题';
        }
      }
    } catch (err) {
      testResult.error = err.message;
    }

    results.push(testResult);
  }

  return results;
}

/**
 * Execute data-collection specific tests
 */
export async function executeDataTests(testCases) {
  const results = [];

  for (const testCase of testCases) {
    const testResult = {
      id: testCase.id,
      name: testCase.name,
      type: testCase.type || 'normal',
      passed: false,
      metrics: {},
    };

    // For data collection, check for data integrity and completeness
    try {
      const output = testCase.actual_output;
      if (output && typeof output === 'string') {
        // Check for common data quality issues
        const isSensitiveInfoPresent = /email|phone|address|ssn|password/i.test(output);
        const isFormatted = /json|csv|table/i.test(output);

        testResult.passed = !isSensitiveInfoPresent && isFormatted;
        testResult.metrics.hasSensitiveInfo = isSensitiveInfoPresent;
        testResult.metrics.isFormatted = isFormatted;
      }
    } catch (err) {
      testResult.error = err.message;
    }

    results.push(testResult);
  }

  return results;
}
