/**
 * Specialized Evaluation Rules for 4 Core Skill Categories
 * 专项评估规则配置
 */

export const SKILL_CATEGORIES = [
  { id: 'text-generation', label: '文本生成类', description: '文档优化、文案生成、需求梳理等' },
  { id: 'code-generation', label: '代码生成类', description: '组件代码、前端页面生成等' },
  { id: 'data-collection', label: '数据采集类', description: '设计数据、用户行为、业务数据采集' },
  { id: 'competitor-research', label: '竞品调研类', description: '竞品设计、功能、行业趋势调研' },
];

export const SPECIALIZED_RULES = {
  'text-generation': {
    name: '文本生成类',
    weight: 0.4, // 专项占40%
    dimensions: [
      {
        id: 'readability',
        name: '可读性提升',
        weight: 10,
        description: '优化后可读性分数提升≥15%、冗余降低≥20%',
        rubric: {
          5: '可读性提升≥25%，冗余降低≥30%，文本结构优化显著',
          4: '可读性提升≥20%，冗余降低≥25%，效果明显',
          3: '可读性提升≥15%，冗余降低≥20%，达到基本要求',
          2: '可读性提升10-15%，冗余降低10-20%，改进有限',
          1: '可读性提升<10%，冗余降低<10%，无明显改进',
        },
        testMethod: '前后分数对比、冗余统计',
      },
      {
        id: 'professionalism',
        name: '专业度匹配',
        weight: 10,
        description: '设计/产品术语准确率100%、符合文档规范',
        rubric: {
          5: '术语准确率100%，符合所有规范，专业度高',
          4: '术语准确率≥98%，符合规范，表述专业',
          3: '术语准确率≥95%，基本符合规范',
          2: '术语准确率85-95%，部分规范偏离',
          1: '术语准确率<85%，规范违反多',
        },
        testMethod: '术语库匹配、模板校验',
      },
      {
        id: 'information-completeness',
        name: '信息完整性',
        weight: 10,
        description: '核心信息保留率100%、无篡改',
        rubric: {
          5: '核心信息保留率100%，无任何篡改，补充价值信息',
          4: '核心信息保留率100%，无篡改，内容完整',
          3: '核心信息保留率≥95%，无篡改',
          2: '核心信息保留率85-95%，有轻微篡改',
          1: '核心信息保留率<85%或有重大篡改',
        },
        testMethod: '前后信息对比、关键数据校验',
      },
      {
        id: 'format-compliance',
        name: '格式规范性',
        weight: 10,
        description: 'Markdown格式合规、结构清晰',
        rubric: {
          5: 'Markdown格式完全合规，结构清晰层级明确',
          4: 'Markdown格式基本合规，结构清晰',
          3: 'Markdown格式有轻微问题，结构基本清晰',
          2: 'Markdown格式问题较多，结构混乱',
          1: 'Markdown格式不规范，结构混乱',
        },
        testMethod: '格式校验、结构检查',
      },
    ],
  },

  'code-generation': {
    name: '代码生成类',
    weight: 0.4,
    dimensions: [
      {
        id: 'syntax-correctness',
        name: '语法正确性',
        weight: 10,
        description: '语法合规率100%、无乱码',
        rubric: {
          5: '语法100%正确，无任何错误，代码优化',
          4: '语法正确率≥98%，无致命错误',
          3: '语法正确率≥95%，仅有轻微语法问题',
          2: '语法正确率85-95%，有多处错误',
          1: '语法正确率<85%，有严重错误',
        },
        testMethod: '语法解析、静态检查',
      },
      {
        id: 'runability',
        name: '可运行性',
        weight: 10,
        description: '代码可编译运行、无报错',
        rubric: {
          5: '代码完美运行，无任何报错，输出正确',
          4: '代码可运行，输出基本正确，无致命错误',
          3: '代码可运行，有轻微运行时警告',
          2: '代码可部分运行，有多处运行错误',
          1: '代码无法运行或崩溃',
        },
        testMethod: '沙箱自动运行、日志校验',
      },
      {
        id: 'specification-compliance',
        name: '规范符合性',
        weight: 10,
        description: '符合前端规范、设计token',
        rubric: {
          5: '完全符合前端规范和设计token，代码规范化',
          4: '符合大部分规范，仅有轻微偏离',
          3: '基本符合规范，有部分偏离',
          2: '符合规范程度不足，多处不符',
          1: '完全不符合规范',
        },
        testMethod: 'ESLint校验、token匹配',
      },
      {
        id: 'performance-security',
        name: '性能与安全',
        weight: 10,
        description: '无性能隐患、无安全漏洞',
        rubric: {
          5: '性能优秀，无安全漏洞，代码高效',
          4: '性能良好，无安全风险',
          3: '性能可接受，无明显安全问题',
          2: '性能一般，有潜在安全问题',
          1: '有性能问题或安全漏洞',
        },
        testMethod: '性能检测、漏洞扫描',
      },
    ],
  },

  'data-collection': {
    name: '数据采集类',
    weight: 0.4,
    dimensions: [
      {
        id: 'data-accuracy',
        name: '数据准确性',
        weight: 10,
        description: '准确率100%、无遗漏',
        rubric: {
          5: '准确率100%，无遗漏，数据完美',
          4: '准确率≥99%，无遗漏',
          3: '准确率≥95%，基本无遗漏',
          2: '准确率85-95%，有部分遗漏',
          1: '准确率<85%或大量遗漏',
        },
        testMethod: '与真实数据源对比、完整性校验',
      },
      {
        id: 'collection-efficiency',
        name: '采集效率',
        weight: 10,
        description: '耗时达标、批量采集成功率≥95%',
        rubric: {
          5: '耗时最优，批量成功率≥99%',
          4: '耗时良好，批量成功率≥97%',
          3: '耗时可接受，批量成功率≥95%',
          2: '耗时偏长，批量成功率85-95%',
          1: '耗时过长或成功率<85%',
        },
        testMethod: '耗时统计、批量测试',
      },
      {
        id: 'compliance',
        name: '合规性',
        weight: 10,
        description: '符合法规、无敏感信息采集',
        rubric: {
          5: '完全合规，无任何敏感信息风险',
          4: '符合规范，无敏感信息',
          3: '基本合规，无严重违规',
          2: '有部分合规问题',
          1: '有严重违规或敏感信息泄露',
        },
        testMethod: '敏感信息扫描、权限校验',
      },
      {
        id: 'usability',
        name: '可用性',
        weight: 10,
        description: '可直接用于分析、无冗余',
        rubric: {
          5: '数据完全可用，格式优化，零冗余',
          4: '数据可用，格式规范，冗余少',
          3: '数据基本可用，有轻微冗余',
          2: '数据可用性一般，冗余较多',
          1: '数据可用性差或冗余严重',
        },
        testMethod: '可用性打分、冗余统计',
      },
    ],
  },

  'competitor-research': {
    name: '竞品调研类',
    weight: 0.4,
    dimensions: [
      {
        id: 'information-comprehensiveness',
        name: '信息全面性',
        weight: 10,
        description: '覆盖核心调研维度、无遗漏',
        rubric: {
          5: '覆盖所有核心维度，无遗漏，信息全面',
          4: '覆盖主要维度，无关键遗漏',
          3: '覆盖基本维度，大体完整',
          2: '覆盖部分维度，有遗漏',
          1: '覆盖维度不足，遗漏严重',
        },
        testMethod: '维度完整性校验、关键信息检查',
      },
      {
        id: 'information-accuracy',
        name: '信息准确性',
        weight: 10,
        description: '准确率100%、信息最新',
        rubric: {
          5: '准确率100%，信息最新',
          4: '准确率≥98%，信息最近',
          3: '准确率≥95%，基本最新',
          2: '准确率85-95%，信息有延滞',
          1: '准确率<85%或信息过时',
        },
        testMethod: '与真实竞品对比、时效性校验',
      },
      {
        id: 'analysis-depth',
        name: '分析深度',
        weight: 10,
        description: '有竞品对比、设计建议',
        rubric: {
          5: '深度分析，有竞品对比和有价值的建议',
          4: '有分析，有基本对比和建议',
          3: '基本分析，有对比但建议有限',
          2: '分析浅，对比或建议不足',
          1: '无深度分析',
        },
        testMethod: '分析完整性、建议相关性检查',
      },
      {
        id: 'format-compliance',
        name: '格式规范性',
        weight: 10,
        description: '结构清晰、可直接参考',
        rubric: {
          5: '结构清晰规范，完全可参考',
          4: '结构清晰，易于参考',
          3: '结构基本清晰，可参考',
          2: '结构欠缺，参考性一般',
          1: '结构混乱，难以参考',
        },
        testMethod: '结构检查、格式校验',
      },
    ],
  },
};

/**
 * Get specialized rule for a skill category
 */
export function getSpecializedRule(categoryId) {
  return SPECIALIZED_RULES[categoryId] || null;
}

/**
 * Get all specialized dimensions for a category
 */
export function getSpecializedDimensions(categoryId) {
  const rule = SPECIALIZED_RULES[categoryId];
  return rule ? rule.dimensions : [];
}

/**
 * Calculate specialized score based on dimension scores
 */
export function calculateSpecializedScore(dimensionScores) {
  if (!dimensionScores || Object.keys(dimensionScores).length === 0) {
    return 0;
  }
  const scores = Object.values(dimensionScores).map((d) => {
    const score = typeof d === 'object' ? d?.score : d;
    return (score ?? 3) * 20; // Map 1-5 to 0-100
  });
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

/**
 * Calculate final overall score: 通用60% + 专项40%
 */
export function calculateFinalScore(genericScore, specializedScore) {
  if (specializedScore === null || specializedScore === undefined) {
    return genericScore; // If no specialized score, use generic only
  }
  return Math.round(genericScore * 0.6 + specializedScore * 0.4);
}

/**
 * Generate test case template based on category
 */
export function generateTestCaseTemplate(categoryId) {
  const templates = {
    'text-generation': [
      {
        id: '1',
        name: '基础文本优化',
        type: '正常场景',
        priority: '中',
        input: '输入冗长或不规范的文本内容',
        expected_output: '输出应简洁清晰、术语准确、格式规范',
      },
      {
        id: '2',
        name: '专业术语准确性',
        type: '专业场景',
        priority: '高',
        input: '包含设计/产品专业术语的文本',
        expected_output: '输出术语准确，符合专业规范',
      },
      {
        id: '3',
        name: '边界情况 - 超长文本',
        type: '边界情况',
        priority: '中',
        input: '极长的冗余文本',
        expected_output: '应能有效提炼核心信息，保留关键数据',
      },
    ],
    'code-generation': [
      {
        id: '1',
        name: '基础HTML/CSS代码生成',
        type: '正常场景',
        priority: '高',
        input: '要求生成基础的HTML和CSS代码',
        expected_output: '代码语法正确，可运行，样式符合要求',
      },
      {
        id: '2',
        name: 'React组件生成',
        type: '专业场景',
        priority: '高',
        input: '要求生成React函数组件',
        expected_output: '代码遵循React规范，包含必要的hooks',
      },
      {
        id: '3',
        name: '边界情况 - 复杂布局',
        type: '边界情况',
        priority: '中',
        input: '要求生成响应式、复杂布局',
        expected_output: '代码应能正确实现布局，兼容主流浏览器',
      },
    ],
    'data-collection': [
      {
        id: '1',
        name: '基础数据采集',
        type: '正常场景',
        priority: '高',
        input: '指定数据源和采集范围',
        expected_output: '数据准确、完整、无遗漏',
      },
      {
        id: '2',
        name: '大规模批量采集',
        type: '专业场景',
        priority: '高',
        input: '多个数据源的批量采集',
        expected_output: '采集效率高，成功率≥95%',
      },
      {
        id: '3',
        name: '敏感信息处理',
        type: '安全场景',
        priority: '高',
        input: '包含敏感信息的采集需求',
        expected_output: '无敏感信息泄露，完全合规',
      },
    ],
    'competitor-research': [
      {
        id: '1',
        name: '竞品基本信息调研',
        type: '正常场景',
        priority: '中',
        input: '要求调研竞品的基本功能和特点',
        expected_output: '信息全面、准确、最新',
      },
      {
        id: '2',
        name: '竞品深度对比分析',
        type: '专业场景',
        priority: '高',
        input: '要求对标多个竞品进行对比分析',
        expected_output: '有深度分析、对比维度完整、建议有价值',
      },
      {
        id: '3',
        name: '行业趋势调研',
        type: '专业场景',
        priority: '中',
        input: '调研行业发展趋势',
        expected_output: '信息前沿、分析深入、洞察清晰',
      },
    ],
  };

  return templates[categoryId] || [];
}
