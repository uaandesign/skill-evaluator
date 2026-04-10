import { parseSkill } from './skillParser.js';

// 预置基准分数 (基于 Claude 官方 Skill 最佳实践)
const DEFAULT_BENCHMARKS = {
  structure: 80,
  coverage: 85,
  trigger: 80,
  robustness: 78,
  maintainability: 75
};

/**
 * 评估单个 Skill 的质量
 * 基于 Claude 官方 Skill 最佳实践的五个维度
 * @param {Object} skill - 包含 content 和 format 的 skill 对象
 * @returns {Object} 评估结果
 */
export function evaluateSkill(skill) {
  const { content = '', format = 'skill_md' } = skill;

  // 标准化 format 名称
  const formatMap = { 'skillmd': 'skill_md', 'function': 'function_call', 'prompt': 'prompt_template' };
  const normalizedFormat = formatMap[format] || format;

  // 解析 Skill
  const parseResult = parseSkill(content, normalizedFormat);

  if (!parseResult.valid) {
    return {
      totalScore: 0,
      scores: {
        structure: 0,
        coverage: 0,
        trigger: 0,
        robustness: 0,
        maintainability: 0
      },
      details: {
        structure: [{ check: '解析失败', passed: false, reason: parseResult.errors[0] }],
        coverage: [],
        trigger: [],
        robustness: [],
        maintainability: []
      },
      percentile: '<50%',
      weakestDimension: '结构完整性',
      errors: parseResult.errors,
      warnings: parseResult.warnings,
      comparison: {
        structure: 0 - DEFAULT_BENCHMARKS.structure,
        coverage: 0 - DEFAULT_BENCHMARKS.coverage,
        trigger: 0 - DEFAULT_BENCHMARKS.trigger,
        robustness: 0 - DEFAULT_BENCHMARKS.robustness,
        maintainability: 0 - DEFAULT_BENCHMARKS.maintainability
      }
    };
  }

  const parsed = parseResult.parsed;

  // 执行五维评估
  const structureEval = evaluateStructure(parsed, content);
  const coverageEval = evaluateCoverage(parsed, content);
  const triggerEval = evaluateTrigger(parsed, content);
  const robustnessEval = evaluateRobustness(parsed, content);
  const maintainabilityEval = evaluateMaintainability(parsed, content);

  // 计算总分 (各维度权重: structure 25%, coverage 20%, trigger 20%, robustness 20%, maintainability 15%)
  const scores = {
    structure: structureEval.score,
    coverage: coverageEval.score,
    trigger: triggerEval.score,
    robustness: robustnessEval.score,
    maintainability: maintainabilityEval.score
  };

  const totalScore = Math.round(
    (scores.structure * 25 + scores.coverage * 20 + scores.trigger * 20 + scores.robustness * 20 + scores.maintainability * 15) / 100
  );

  // 找出最弱维度
  const dimensionNames = {
    structure: '结构完整性',
    coverage: '功能覆盖度',
    trigger: '触发准确率',
    robustness: '鲁棒性',
    maintainability: '可维护性'
  };

  const weakestDimension = Object.entries(scores).reduce((prev, [key, val]) =>
    val < scores[prev] ? key : prev
  );

  // 百分位 (基于评分区间)
  const percentile = calculatePercentile(totalScore);

  return {
    totalScore,
    scores,
    details: {
      structure: structureEval.details,
      coverage: coverageEval.details,
      trigger: triggerEval.details,
      robustness: robustnessEval.details,
      maintainability: maintainabilityEval.details
    },
    percentile,
    weakestDimension: dimensionNames[weakestDimension],
    comparison: {
      structure: scores.structure - DEFAULT_BENCHMARKS.structure,
      coverage: scores.coverage - DEFAULT_BENCHMARKS.coverage,
      trigger: scores.trigger - DEFAULT_BENCHMARKS.trigger,
      robustness: scores.robustness - DEFAULT_BENCHMARKS.robustness,
      maintainability: scores.maintainability - DEFAULT_BENCHMARKS.maintainability
    }
  };
}

/**
 * 维度1: 结构完整性 (25分)
 * - YAML 前置事项完整性
 * - name/description 规范性
 * - 正文组织清晰度
 */
function evaluateStructure(parsed, content) {
  const details = [];
  let score = 100;

  // 检查 YAML frontmatter
  const hasFrontmatter = parsed.frontmatter && Object.keys(parsed.frontmatter).length > 0;
  details.push({
    check: 'YAML 前置事项存在',
    passed: hasFrontmatter,
    reason: hasFrontmatter ? '✓' : '缺少 YAML frontmatter'
  });
  if (!hasFrontmatter) score -= 25;

  // 检查 name 字段
  const { name } = parsed.frontmatter || {};
  const nameValid = name && /^[a-z][a-z0-9\-]*$/.test(name) && name.length <= 64;
  details.push({
    check: 'name 字段规范 (小写+连字符, ≤64字)',
    passed: nameValid,
    reason: nameValid ? '✓' : name ? `不符合规范: "${name}"` : '缺少 name'
  });
  if (!nameValid) score -= 15;

  // 检查 description 字段
  const { description } = parsed.frontmatter || {};
  const descValid = description && description.length > 0 && description.length <= 1024;
  details.push({
    check: 'description 字段存在 (≤1024字)',
    passed: descValid,
    reason: descValid ? '✓' : description ? `过长 (${description.length} 字)` : '缺少 description'
  });
  if (!descValid) score -= 15;

  // 检查正文行数
  const bodyLines = (parsed.body || '').split('\n').length;
  const bodyLengthOk = bodyLines >= 3 && bodyLines <= 500;
  details.push({
    check: '正文长度合适 (3-500 行)',
    passed: bodyLengthOk,
    reason: bodyLengthOk ? `✓ (${bodyLines} 行)` : `${bodyLines} 行 ${bodyLines < 3 ? '太短' : '过长'}`
  });
  if (!bodyLengthOk) score -= 10;

  // 检查目录结构清晰度 (markdown headers)
  const headers = (parsed.body || '').match(/^#+\s+/gm) || [];
  const headerOk = headers.length >= 2;
  details.push({
    check: '使用清晰的 Markdown 标题',
    passed: headerOk,
    reason: headerOk ? `✓ (${headers.length} 个标题)` : headers.length === 0 ? '没有标题' : '标题不足'
  });
  if (!headerOk) score -= 10;

  // 检查渐进式披露 (检查引用文件深度)
  const fileRefs = (parsed.body || '').match(/\[.*?\]\(.*?\/.*?\/.*?\)/g) || [];
  const refDepthOk = fileRefs.length === 0;
  details.push({
    check: '渐进式披露 (文件引用≤一级)',
    passed: refDepthOk,
    reason: refDepthOk ? '✓' : `有 ${fileRefs.length} 个多级引用`
  });
  if (!refDepthOk) score -= 10;

  return {
    score: Math.max(0, score),
    details
  };
}

/**
 * 维度2: 功能覆盖度 (20分)
 * - 快速开始/使用说明
 * - 代码示例
 * - 工作流/步骤说明
 * - 输入/输出格式定义
 * - 错误处理指南
 * - 反馈循环
 */
function evaluateCoverage(parsed, content) {
  const details = [];
  let score = 100;

  const body = parsed.body || '';

  // 检查是否有快速开始部分
  const hasQuickStart = /quick start|快速开始|使用说明|入门/i.test(body);
  details.push({
    check: '有快速开始/使用说明',
    passed: hasQuickStart,
    reason: hasQuickStart ? '✓ 有快速开始指南' : '缺少快速开始'
  });
  if (!hasQuickStart) score -= 12;

  // 检查是否有代码示例
  const codeBlocks = (body.match(/```[\s\S]*?```/g) || []).length;
  const hasCodeExamples = codeBlocks > 0;
  details.push({
    check: '包含代码示例',
    passed: hasCodeExamples,
    reason: hasCodeExamples ? `✓ (${codeBlocks} 个示例)` : '无代码示例'
  });
  if (!hasCodeExamples) score -= 15;

  // 检查是否有工作流/步骤说明
  const hasWorkflow = /workflow|工作流|步骤|step|步骤|流程/i.test(body);
  details.push({
    check: '有工作流或步骤说明',
    passed: hasWorkflow,
    reason: hasWorkflow ? '✓ 有工作流说明' : '缺少工作流描述'
  });
  if (!hasWorkflow) score -= 12;

  // 检查是否有输入/输出格式定义
  const hasIOFormat = /input|output|输入|输出|参数|返回|return/i.test(body);
  details.push({
    check: '定义了输入/输出格式',
    passed: hasIOFormat,
    reason: hasIOFormat ? '✓ 有格式定义' : '缺少输入输出说明'
  });
  if (!hasIOFormat) score -= 15;

  // 检查是否有错误处理指南
  const hasErrorGuidance = /error|exception|异常|错误处理|error handling|handle|处理/i.test(body);
  details.push({
    check: '包含错误处理指南',
    passed: hasErrorGuidance,
    reason: hasErrorGuidance ? '✓ 有错误处理说明' : '缺少错误处理指南'
  });
  if (!hasErrorGuidance) score -= 14;

  // 检查是否有反馈循环说明
  const hasFeedbackLoop = /feedback|validate|verify|verify|校验|验证|反馈|循环|retry|重试/i.test(body);
  details.push({
    check: '说明了反馈循环机制',
    passed: hasFeedbackLoop,
    reason: hasFeedbackLoop ? '✓ 有反馈循环' : '缺少反馈循环说明'
  });
  if (!hasFeedbackLoop) score -= 12;

  return {
    score: Math.max(0, score),
    details
  };
}

/**
 * 维度3: 触发准确率 (20分)
 * - description 包含功能和使用时机
 * - 包含关键术语
 * - 使用第三人称
 * - name 动名词形式
 * - 避免模糊描述
 */
function evaluateTrigger(parsed, content) {
  const details = [];
  let score = 100;

  const { name, description, triggers } = parsed.frontmatter || {};

  // 检查 name 是否使用动名词形式
  const gerundPattern = /-ing$|-ing-/;
  const hasGerund = gerundPattern.test(name || '');
  details.push({
    check: '命名使用动名词形式',
    passed: hasGerund,
    reason: hasGerund ? `✓ (${name})` : '建议使用动作形式'
  });
  if (!hasGerund) score -= 10;

  // 检查 description 长度和内容质量
  const descLength = description ? description.length : 0;
  const hasContent = descLength > 50 && descLength <= 1024;
  details.push({
    check: 'description 详细且适中 (50-1024字)',
    passed: hasContent,
    reason: hasContent ? `✓ (${descLength} 字)` : `${descLength} 字`
  });
  if (!hasContent) score -= 15;

  // 检查是否包含具体关键术语 (避免使用模糊词如 helper/utils)
  const vagueTerms = ['helper', 'utils', 'tool', 'utility', 'script'];
  const hasVagueTerm = (description || '').toLowerCase().match(new RegExp(`\\b(${vagueTerms.join('|')})\\b`));
  const hasSpecificTerms = (description || '').split(/\s+/).length > 10;

  details.push({
    check: '避免模糊术语 (helper/utils/tool)',
    passed: !hasVagueTerm && hasSpecificTerms,
    reason: hasVagueTerm ? '包含模糊术语' : hasSpecificTerms ? '✓ 术语具体' : '术语不够具体'
  });
  if (hasVagueTerm || !hasSpecificTerms) score -= 12;

  // 检查 triggers 字段
  const triggerList = (triggers || '').split(',').map(t => t.trim()).filter(t => t);
  const triggersValid = triggerList.length >= 1 && triggerList.length <= 10;
  details.push({
    check: 'triggers 字段定义完善 (1-10 个)',
    passed: triggersValid,
    reason: triggersValid ? `✓ (${triggerList.length} 个)` : triggerList.length === 0 ? '无 triggers' : '过多 triggers'
  });
  if (!triggersValid) score -= 15;

  // 检查第三人称 (基础检查)
  const firstPerson = /\b(I |我|we |我们|you |你|your |你的)\b/i;
  const notFirstPerson = !firstPerson.test(description || '');
  details.push({
    check: '使用第三人称编写',
    passed: notFirstPerson,
    reason: notFirstPerson ? '✓' : '检测到第一人称或第二人称'
  });
  if (!notFirstPerson) score -= 12;

  return {
    score: Math.max(0, score),
    details
  };
}

/**
 * 维度4: 鲁棒性 (20分)
 * - 错误处理而非推卸
 * - 避免魔法数字
 * - 有验证步骤
 * - 避免时间敏感信息
 * - 条件工作流和决策点
 * - 明确依赖安装
 */
function evaluateRobustness(parsed, content) {
  const details = [];
  let score = 100;

  const body = parsed.body || '';

  // 检查错误处理 (error, exception, try, catch 等)
  const hasErrorHandling = /error|exception|try|catch|handle|处理|异常|错误/i.test(body);
  details.push({
    check: '处理错误而非推卸',
    passed: hasErrorHandling,
    reason: hasErrorHandling ? '✓ 有错误处理' : '缺少错误处理说明'
  });
  if (!hasErrorHandling) score -= 15;

  // 检查"魔法数字" (数字后跟注释或有解释)
  const magicNumbers = (body.match(/\b\d+\b/g) || []);
  const commentedNumbers = (body.match(/\b\d+\b.*?(#|\/\/|注释|comment)/g) || []).length;
  const magicNumbersOk = magicNumbers.length <= 3 || commentedNumbers > 0;
  details.push({
    check: '避免未注释的魔法数字',
    passed: magicNumbersOk,
    reason: magicNumbersOk ? '✓' : `有 ${magicNumbers.length - commentedNumbers} 个未注释数字`
  });
  if (!magicNumbersOk) score -= 12;

  // 检查验证/校验 (validate, verify, check 等)
  const hasValidation = /validate|verify|check|valid|校验|验证|检查/i.test(body);
  details.push({
    check: '包含验证步骤',
    passed: hasValidation,
    reason: hasValidation ? '✓ 有验证步骤' : '缺少验证机制'
  });
  if (!hasValidation) score -= 15;

  // 检查时间敏感信息 (日期、"最新"等)
  const timeSensitive = /(2\d{3}-\d{2}-\d{2}|latest|最新|当前|now)/i.test(body);
  details.push({
    check: '避免时间敏感信息',
    passed: !timeSensitive,
    reason: !timeSensitive ? '✓' : '检测到时间敏感词'
  });
  if (timeSensitive) score -= 12;

  // 检查条件/决策点 (if, else, switch, 决策, 条件等)
  const hasDecision = /if|else|switch|decide|decision|条件|决策|分支|branch/i.test(body);
  details.push({
    check: '有条件工作流和决策点',
    passed: hasDecision,
    reason: hasDecision ? '✓ 有条件分支' : '可能无条件逻辑'
  });
  if (!hasDecision) score -= 12;

  // 检查明确的依赖说明 (dependencies, requires, 依赖等)
  const hasDependencies = /dependencies|requires|depend|依赖|需要|install|安装/i.test(body);
  details.push({
    check: '明确列出依赖安装',
    passed: hasDependencies,
    reason: hasDependencies ? '✓ 有依赖说明' : '缺少依赖安装说明'
  });
  if (!hasDependencies) score -= 12;

  return {
    score: Math.max(0, score),
    details
  };
}

/**
 * 维度5: 可维护性 (15分)
 * - 术语一致性
 * - 示例具体非抽象
 * - 使用正斜杠路径
 * - 自由度与任务匹配
 * - 简洁性
 * - 文件命名描述性
 */
function evaluateMaintainability(parsed, content) {
  const details = [];
  let score = 100;

  const body = parsed.body || '';
  const { version, author, updated, category } = parsed.frontmatter || {};

  // 检查元数据 (version, author, updated)
  const hasVersion = !!version;
  const hasAuthor = !!author;
  const hasUpdated = !!updated;
  const hasMetadata = hasVersion && hasAuthor && hasUpdated;

  details.push({
    check: '包含完整元数据 (version, author, updated)',
    passed: hasMetadata,
    reason: hasMetadata ? '✓' : `缺少: ${[!hasVersion && 'version', !hasAuthor && 'author', !hasUpdated && 'updated'].filter(Boolean).join(', ')}`
  });
  if (!hasMetadata) score -= 15;

  // 检查术语一致性 (简单启发式: 检查重复使用的术语)
  const words = body.toLowerCase().split(/\W+/).filter(w => w.length > 5);
  const wordFreq = {};
  words.forEach(w => wordFreq[w] = (wordFreq[w] || 0) + 1);
  const consistentTerms = Object.values(wordFreq).filter(f => f >= 3).length > 0;
  details.push({
    check: '术语使用一致',
    passed: consistentTerms,
    reason: consistentTerms ? '✓ 有重复术语' : '术语可能不够一致'
  });
  if (!consistentTerms) score -= 12;

  // 检查路径使用正斜杠
  const backslashPaths = (body.match(/[^\/]\\[^\/]/g) || []).length;
  const pathsOk = backslashPaths === 0;
  details.push({
    check: '路径使用正斜杠',
    passed: pathsOk,
    reason: pathsOk ? '✓' : `检测到 ${backslashPaths} 个反斜杠`
  });
  if (!pathsOk) score -= 12;

  // 检查是否避免过度解释
  const contentLength = body.length;
  const contentOk = contentLength > 200 && contentLength < 10000;
  details.push({
    check: '内容简洁 (避免过度解释)',
    passed: contentOk,
    reason: contentOk ? `✓ (${contentLength} 字)` : `${contentLength} 字 ${contentLength < 200 ? '过短' : '过长'}`
  });
  if (!contentOk) score -= 12;

  // 检查示例是否具体
  const hasConcreteExamples = /example|示例/.test(body) && codeBlocks > 0;
  const codeBlocks = (body.match(/```[\s\S]*?```/g) || []).length;
  details.push({
    check: '提供具体非抽象的示例',
    passed: hasConcreteExamples,
    reason: hasConcreteExamples ? '✓ 有具体示例' : '示例可能太抽象'
  });
  if (!hasConcreteExamples) score -= 12;

  // 检查注释/文档质量
  const hasComments = /(<!--[\s\S]*?-->|#.*?$|\/\/|注释)/m.test(body);
  details.push({
    check: '包含必要的注释/文档',
    passed: hasComments,
    reason: hasComments ? '✓ 有注释' : '缺少注释'
  });
  if (!hasComments) score -= 12;

  return {
    score: Math.max(0, score),
    details
  };
}

/**
 * 与预置基准对比
 * @param {Object} evaluation - 评估结果
 * @param {Object} benchmarks - 基准分数
 * @returns {Object} 对比结果
 */
export function compareWithBenchmarks(evaluation, benchmarks = DEFAULT_BENCHMARKS) {
  const benchmarkAverages = Object.values(benchmarks).reduce((a, b) => a + b, 0) / Object.values(benchmarks).length;

  return {
    benchmarkAverages,
    benchmarks,
    dimensionComparisons: Object.keys(benchmarks).map(dimension => ({
      dimension,
      current: evaluation.scores[dimension] || 0,
      benchmark: benchmarks[dimension],
      diff: (evaluation.scores[dimension] || 0) - benchmarks[dimension]
    }))
  };
}

/**
 * 生成优化建议
 * @param {Object} evaluation - 评估结果
 * @returns {Array} 建议列表
 */
export function generateSuggestions(evaluation) {
  const suggestions = [];
  const dimensionNames = {
    structure: '结构完整性',
    coverage: '功能覆盖度',
    trigger: '触发准确率',
    robustness: '鲁棒性',
    maintainability: '可维护性'
  };

  Object.entries(evaluation.scores).forEach(([dimension, score]) => {
    const details = evaluation.details[dimension] || [];
    const failedChecks = details.filter(d => !d.passed);

    failedChecks.forEach((check) => {
      const priority = score < 50 ? 'high' : score < 75 ? 'medium' : 'low';

      let title = '';
      let description = '';
      let example = '';

      // 根据维度和检查项生成具体建议
      if (dimension === 'structure') {
        if (check.check.includes('name')) {
          title = '修复 name 字段格式';
          description = '使用小写字母和连字符，长度不超过 64 字符';
          example = 'name: analyzing-documents';
        } else if (check.check.includes('description')) {
          title = '完善 description 字段';
          description = '清晰说明 Skill 的功能和使用场景，长度 50-1024 字';
          example = 'description: 高效分析和处理文档内容，支持多种格式的解析和提取';
        } else if (check.check.includes('正文')) {
          title = '扩展正文内容';
          description = '补充详细说明，包括使用场景、步骤和示例，维持 3-500 行';
          example = '## 使用场景\n\n## 步骤说明\n\n## 代码示例';
        } else if (check.check.includes('标题')) {
          title = '添加清晰的 Markdown 标题';
          description = '至少需要 2 个一级或二级标题来组织内容结构';
          example = '# 功能说明\n## 使用场景\n## 代码示例';
        } else if (check.check.includes('引用')) {
          title = '避免深层嵌套的文件引用';
          description = '文件引用最多一级深度，避免过复杂的链接结构';
          example = '[示例](./examples) ✓\n[示例](./folder/sub/example) ✗';
        }
      } else if (dimension === 'coverage') {
        if (check.check.includes('快速开始')) {
          title = '补充快速开始指南';
          description = '添加最小化可运行的示例，让用户快速上手';
          example = '## 快速开始\n\n1. 安装\n2. 配置\n3. 运行示例';
        } else if (check.check.includes('代码示例')) {
          title = '添加代码示例';
          description = '使用代码块展示实际使用方法，至少一个完整示例';
          example = '```javascript\nconst result = await analyzeDocument(file);\nconsole.log(result);\n```';
        } else if (check.check.includes('工作流')) {
          title = '说明工作流和步骤';
          description = '清晰描述执行流程，包括各个步骤和转换点';
          example = '## 工作流\n1. 验证输入\n2. 处理数据\n3. 验证结果';
        } else if (check.check.includes('输入/输出')) {
          title = '定义输入和输出格式';
          description = '明确说明接受什么输入，返回什么输出，包括数据类型';
          example = '## 输入参数\n- `file` (File): 待分析的文档\n\n## 输出\n- `Object`: 分析结果';
        } else if (check.check.includes('错误处理')) {
          title = '补充错误处理指南';
          description = '说明如何处理常见异常和边界情况';
          example = '## 错误处理\n- 文件格式不支持: 返回错误信息\n- 文件过大: 分块处理';
        } else if (check.check.includes('反馈循环')) {
          title = '说明反馈循环机制';
          description = '描述验证-修复-重复的反馈流程';
          example = '验证结果 → 质量检查 → 失败则重试 → 成功则返回';
        }
      } else if (dimension === 'trigger') {
        if (check.check.includes('动名词')) {
          title = '使用动名词形式命名';
          description = '以 -ing 结尾或包含动作词，清晰表达 Skill 的作用';
          example = '✓ analyzing-documents\n✓ processing-pdf\n✗ document-tool';
        } else if (check.check.includes('description')) {
          title = '详细补充 description';
          description = '描述应说明"功能是什么"和"何时使用"';
          example = '描述应包含：功能 + 应用场景 + 主要特性';
        } else if (check.check.includes('模糊术语')) {
          title = '使用具体术语替代模糊词';
          description = '避免使用 helper、utils、tool 等模糊术语';
          example = '✓ 文档分析工具\n✓ PDF 内容提取器\n✗ 通用工具';
        } else if (check.check.includes('triggers')) {
          title = '补充 triggers 字段';
          description = '定义 1-10 个关键词，帮助系统发现此 Skill';
          example = 'triggers: document-processing, pdf-analysis, content-extraction';
        } else if (check.check.includes('人称')) {
          title = '改为第三人称描述';
          description = '避免使用 I/we/you，改为客观描述';
          example = '✓ 此工具用于分析文档\n✗ 我使用此工具分析文档';
        }
      } else if (dimension === 'robustness') {
        if (check.check.includes('错误处理')) {
          title = '实现完整的错误处理';
          description = '主动处理异常，提供清晰的错误信息，而非简单推卸';
          example = 'try/catch + 错误日志 + 用户友好的错误消息';
        } else if (check.check.includes('魔法数字')) {
          title = '为数字添加说明注释';
          description = '所有常量应有注释解释其含义和来源';
          example = '# 最大文件大小: 100MB\nMAX_SIZE = 100 * 1024 * 1024';
        } else if (check.check.includes('验证')) {
          title = '补充数据验证步骤';
          description = '验证输入有效性、范围、类型等';
          example = '验证文件格式 → 验证大小 → 验证内容 → 处理';
        } else if (check.check.includes('时间敏感')) {
          title = '移除时间敏感信息';
          description = '避免硬编码日期、版本号等会过期的信息';
          example = '✗ 最新支持至 2024-12-31\n✓ 支持最新的标准规范';
        } else if (check.check.includes('决策点')) {
          title = '补充条件判断逻辑';
          description = '为不同场景添加分支判断，提高适用性';
          example = 'if 条件1 then 处理A else 处理B';
        } else if (check.check.includes('依赖')) {
          title = '明确列出所有依赖';
          description = '清晰说明外部库、API、系统要求等';
          example = '## 依赖\n- Claude 3.5 Sonnet\n- Node.js 18+\n- 自定义库 v1.0+';
        }
      } else if (dimension === 'maintainability') {
        if (check.check.includes('元数据')) {
          title = '补充元数据字段';
          description = '添加 version、author、updated 字段便于维护';
          example = 'version: 1.0.0\nauthor: Your Name\nupdated: 2026-04-02';
        } else if (check.check.includes('术语')) {
          title = '保持术语一致性';
          description = '同一概念使用统一的术语，不混用同义词';
          example = '选择 "文档" 或 "文件" 其一，避免混用';
        } else if (check.check.includes('路径')) {
          title = '使用正斜杠路径';
          description = '跨平台兼容，使用 / 而非 \\';
          example = 'path/to/file ✓\npath\\to\\file ✗';
        } else if (check.check.includes('简洁')) {
          title = '简化内容避免过度解释';
          description = '移除冗余说明，不重复解释 Claude 已知信息';
          example = '避免: "JavaScript 是编程语言，用来..."\n保留: 直接说明实现方式';
        } else if (check.check.includes('示例')) {
          title = '提供具体示例';
          description = '示例应明确具体，避免抽象的占位符';
          example = '✓ 处理 PDF: [具体实现]\n✗ 处理 [文件类型]: [实现]';
        } else if (check.check.includes('注释')) {
          title = '添加必要的注释/文档';
          description = '复杂逻辑、关键决策需要注释解释';
          example = '# 检查文件格式是否支持\nif not is_supported(file_type):';
        }
      }

      if (title) {
        suggestions.push({
          dimension: dimensionNames[dimension],
          priority,
          title,
          description,
          example,
          score
        });
      }
    });
  });

  // 按优先级和重要性排序
  return suggestions.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return a.score - b.score;
  });
}

/**
 * 计算百分位
 */
function calculatePercentile(score) {
  if (score >= 95) return '95+%';
  if (score >= 85) return '85-95%';
  if (score >= 75) return '75-85%';
  if (score >= 65) return '65-75%';
  if (score >= 50) return '50-65%';
  return '<50%';
}
