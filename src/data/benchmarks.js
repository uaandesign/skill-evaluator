export const benchmarkSkills = [
  {
    name: "分析文档内容",
    format: "skill_md",
    category: "文档处理",
    scores: {
      structure: 92,
      coverage: 90,
      trigger: 91,
      robustness: 89,
      maintainability: 90,
    },
    description: "高效分析和提取各类文档内容的工具集，支持多种格式和复杂场景。",
  },
  {
    name: "处理数据转换",
    format: "skill_md",
    category: "数据处理",
    scores: {
      structure: 88,
      coverage: 91,
      trigger: 87,
      robustness: 88,
      maintainability: 86,
    },
    description: "数据格式转换和清洗工具，包含完整的错误处理和验证机制。",
  },
  {
    name: "生成代码实现",
    format: "skill_md",
    category: "代码生成",
    scores: {
      structure: 90,
      coverage: 88,
      trigger: 89,
      robustness: 87,
      maintainability: 88,
    },
    description: "从描述自动生成高质量代码的工具，支持多种编程语言。",
  },
  {
    name: "调试错误问题",
    format: "skill_md",
    category: "问题诊断",
    scores: {
      structure: 85,
      coverage: 87,
      trigger: 86,
      robustness: 90,
      maintainability: 84,
    },
    description: "诊断和修复常见错误的工具，提供详细的错误分析和解决方案。",
  },
  {
    name: "优化代码质量",
    format: "skill_md",
    category: "代码优化",
    scores: {
      structure: 89,
      coverage: 86,
      trigger: 88,
      robustness: 88,
      maintainability: 87,
    },
    description: "提升代码可读性、性能和维护性的工具集。",
  },
  {
    name: "编写测试用例",
    format: "skill_md",
    category: "测试工程",
    scores: {
      structure: 91,
      coverage: 89,
      trigger: 90,
      robustness: 89,
      maintainability: 91,
    },
    description: "自动生成单元测试、集成测试和端到端测试的工具。",
  },
  {
    name: "创建项目文档",
    format: "skill_md",
    category: "文档编写",
    scores: {
      structure: 87,
      coverage: 85,
      trigger: 86,
      robustness: 84,
      maintainability: 88,
    },
    description: "生成项目文档、API 文档和用户指南的工具。",
  },
  {
    name: "管理项目配置",
    format: "skill_md",
    category: "项目管理",
    scores: {
      structure: 88,
      coverage: 87,
      trigger: 87,
      robustness: 86,
      maintainability: 89,
    },
    description: "项目配置文件生成和管理工具，支持多环境配置。",
  },
];

export const evaluationCriteria = {
  structure: {
    name: "结构完整性",
    description: "检查 YAML 前置事项、name/description 规范、正文长度、目录结构和文件引用深度。",
    weight: 0.25,
  },
  coverage: {
    name: "功能覆盖度",
    description: "检查快速开始、代码示例、工作流说明、输入输出定义、错误处理和反馈循环。",
    weight: 0.20,
  },
  trigger: {
    name: "触发准确率",
    description: "检查 description 具体度、关键术语、第三人称使用、name 动名词形式和 triggers 定义。",
    weight: 0.20,
  },
  robustness: {
    name: "鲁棒性",
    description: "检查错误处理、魔法数字注释、数据验证、时间敏感性、决策点和依赖说明。",
    weight: 0.20,
  },
  maintainability: {
    name: "可维护性",
    description: "检查元数据、术语一致、路径格式、内容简洁、示例具体和注释完整。",
    weight: 0.15,
  },
};
