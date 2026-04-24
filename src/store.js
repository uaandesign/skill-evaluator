import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * PROVIDERS — canonical list of supported LLM providers.
 * Shared across ConfigCenter and all consuming modules.
 */
export const PROVIDERS = [
  // ─── Anthropic ────────────────────────────────────────────────
  {
    key: 'anthropic', name: 'Anthropic (Claude)',
    defaultBaseUrl: 'https://api.anthropic.com',
    models: [
      { id: 'claude-opus-4-6',          name: 'Claude Opus 4.6 ✦ 最新' },
      { id: 'claude-sonnet-4-6',        name: 'Claude Sonnet 4.6 ✦ 最新' },
      { id: 'claude-haiku-4-5-20251001',name: 'Claude Haiku 4.5' },
      { id: 'claude-3-opus-20240229',   name: 'Claude 3 Opus' },
      { id: 'claude-3-5-sonnet-20241022',name: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-haiku-20240307',  name: 'Claude 3 Haiku' },
    ],
  },

  // ─── OpenAI ───────────────────────────────────────────────────
  {
    key: 'openai', name: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-5.4',         name: 'GPT-5.4' },
      { id: 'gpt-5.4-pro',     name: 'GPT-5.4 Pro' },
      { id: 'gpt-5.2',         name: 'GPT-5.2' },
      { id: 'gpt-5.1-codex',   name: 'GPT-5.1 Codex' },
      { id: 'gpt-4o',          name: 'GPT-4o' },
      { id: 'gpt-4o-mini',     name: 'GPT-4o mini' },
      { id: 'o1',              name: 'o1 (推理)' },
      { id: 'o3',              name: 'o3 (推理)' },
      { id: 'gpt-4',           name: 'GPT-4' },
      { id: 'gpt-3.5-turbo',   name: 'GPT-3.5 Turbo' },
    ],
  },

  // ─── Google ───────────────────────────────────────────────────
  {
    key: 'gemini', name: 'Google Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: [
      { id: 'gemini-2.0-flash',        name: 'Gemini 2.0 Flash' },
      { id: 'gemini-2.0-flash-exp',    name: 'Gemini 2.0 Flash (Exp)' },
      { id: 'gemini-2.0-pro-exp-02-05',name: 'Gemini 2.0 Pro (Exp)' },
      { id: 'gemini-1.5-pro',          name: 'Gemini 1.5 Pro' },
      { id: 'gemini-1.5-flash',        name: 'Gemini 1.5 Flash' },
    ],
  },

  // ─── xAI ──────────────────────────────────────────────────────
  {
    key: 'xai', name: 'xAI (Grok)',
    defaultBaseUrl: 'https://api.x.ai/v1',
    models: [
      { id: 'grok-4.1',           name: 'Grok 4.1' },
      { id: 'grok-4.1-mini',      name: 'Grok 4.1 mini' },
      { id: 'grok-code-fast-1',   name: 'Grok Code Fast 1' },
    ],
  },

  // ─── Mistral ──────────────────────────────────────────────────
  {
    key: 'mistral', name: 'Mistral AI',
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large (最新)' },
      { id: 'mistral-large-2411',   name: 'Mistral Large 2411' },
      { id: 'codestral-latest',     name: 'Codestral (最新)' },
    ],
  },

  // ─── NVIDIA NIM ───────────────────────────────────────────────
  {
    key: 'nvidia', name: 'NVIDIA NIM',
    defaultBaseUrl: 'https://integrate.api.nvidia.com/v1',
    models: [
      { id: 'meta/llama-3.1-405b-instruct',            name: 'Llama 3.1 405B Instruct' },
      { id: 'meta/llama-3.3-70b-instruct',             name: 'Llama 3.3 70B Instruct' },
      { id: 'nvidia/llama-3.1-nemotron-70b-instruct',  name: 'Nemotron 70B Instruct' },
      { id: 'mistralai/mistral-large',                 name: 'Mistral Large (NIM)' },
      { id: 'google/gemma-2-27b-it',                   name: 'Gemma 2 27B IT' },
    ],
  },

  // ─── Groq ─────────────────────────────────────────────────────
  {
    key: 'groq', name: 'Groq',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile' },
      { id: 'llama-3.3-70b-specdec',   name: 'Llama 3.3 70B SpecDec' },
      { id: 'qwen-qwq-32b',            name: 'Qwen QwQ 32B (推理)' },
      { id: 'llama-3.1-8b-instant',    name: 'Llama 3.1 8B Instant' },
    ],
  },

  // ─── Amazon Bedrock ───────────────────────────────────────────
  {
    key: 'bedrock', name: 'Amazon Bedrock',
    defaultBaseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com/v1',
    models: [
      { id: 'anthropic.claude-opus-4-6',          name: 'Claude Opus 4.6 (Bedrock)' },
      { id: 'meta.llama3-70b-instruct-v1:0',       name: 'Llama 3 70B (Bedrock)' },
      { id: 'meta.llama3-8b-instruct-v1:0',        name: 'Llama 3 8B (Bedrock)' },
      { id: 'amazon.titan-text-premier-v1:0',      name: 'Titan Text Premier' },
      { id: 'amazon.titan-text-express-v1',        name: 'Titan Text Express' },
    ],
  },

  // ─── Venice AI ────────────────────────────────────────────────
  {
    key: 'venice', name: 'Venice AI',
    defaultBaseUrl: 'https://api.venice.ai/api/v1',
    models: [
      { id: 'claude-opus-4-5',  name: 'Claude Opus 4.5 (Venice)' },
      { id: 'llama-3.3-70b',    name: 'Llama 3.3 70B (Venice)' },
    ],
  },

  // ─── DeepSeek ─────────────────────────────────────────────────
  {
    key: 'deepseek', name: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    models: [
      { id: 'deepseek-chat',      name: 'DeepSeek Chat (V3)' },
      { id: 'deepseek-coder',     name: 'DeepSeek Coder' },
      { id: 'deepseek-reasoner',  name: 'DeepSeek R1 (推理)' },
      { id: 'deepseek-v2',        name: 'DeepSeek V2' },
    ],
  },

  // ─── Moonshot AI (Kimi) ───────────────────────────────────────
  {
    key: 'moonshot', name: 'Moonshot AI (Kimi)',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    models: [
      { id: 'kimi-k2-5',          name: 'Kimi K2.5' },
      { id: 'kimi-k2-thinking',   name: 'Kimi K2 Thinking (推理)' },
      { id: 'moonshot-v1-128k',   name: 'Moonshot v1 128K' },
      { id: 'moonshot-v1-32k',    name: 'Moonshot v1 32K' },
      { id: 'moonshot-v1-8k',     name: 'Moonshot v1 8K' },
    ],
  },

  // ─── 智谱 AI (GLM) ────────────────────────────────────────────
  {
    key: 'zhipu', name: '智谱 AI (GLM)',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      { id: 'glm-5',          name: 'GLM-5' },
      { id: 'glm-5-free',     name: 'GLM-5 Free' },
      { id: 'glm-4.7-VL',     name: 'GLM-4.7 VL (多模态)' },
      { id: 'glm-4.7-flash',  name: 'GLM-4.7 Flash' },
      { id: 'glm-4',          name: 'GLM-4' },
      { id: 'glm-4-air',      name: 'GLM-4 Air' },
      { id: 'glm-4-9b',       name: 'GLM-4 9B Chat' },
    ],
  },

  // ─── MiniMax ──────────────────────────────────────────────────
  {
    key: 'minimax', name: 'MiniMax',
    defaultBaseUrl: 'https://api.minimax.chat/v1',
    models: [
      { id: 'MiniMax-M2.5',           name: 'MiniMax M2.5' },
      { id: 'MiniMax-M2.1',           name: 'MiniMax M2.1' },
      { id: 'MiniMax-M2.1-lightning', name: 'MiniMax M2.1 Lightning' },
      { id: 'abab6-chat',             name: 'ABAB6 Chat' },
    ],
  },

  // ─── 通义千问 (Qwen) ──────────────────────────────────────────
  {
    key: 'qwen', name: 'Qwen (通义千问)',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      { id: 'qwen3.5-72b-instruct',   name: 'Qwen3.5 72B Instruct' },
      { id: 'qwen3.5-27b-instruct',   name: 'Qwen3.5 27B Instruct' },
      { id: 'qwen3.5-9b-instruct',    name: 'Qwen3.5 9B Instruct' },
      { id: 'qwen3.5-7b-instruct',    name: 'Qwen3.5 7B Instruct' },
      { id: 'qwen3-32b',              name: 'Qwen3 32B' },
      { id: 'qwen-max',               name: 'Qwen Max' },
      { id: 'qwen-plus',              name: 'Qwen Plus' },
      { id: 'qwen-long',              name: 'Qwen Long (长文本)' },
      { id: 'qwen2.5-72b-instruct',   name: 'Qwen2.5 72B Instruct' },
      { id: 'qwen2.5-32b-instruct',   name: 'Qwen2.5 32B Instruct' },
      { id: 'qwen2-57b-a14b-instruct',name: 'Qwen2 MoE 57B' },
    ],
  },

  // ─── 字节跳动 / 火山引擎 (Doubao) ────────────────────────────
  // 注意：豆包需要配置自己的工作负载 ID（Endpoint ID），不支持通用模型名称
  // 使用方法：
  // 1. 在火山引擎控制台创建或找到你的工作负载 ID（如 ep-xxx-xxx）
  // 2. 在模型字段输入完整的 Endpoint ID
  // 3. 配置 API Key（火山引擎 API Key）
  // 4. 点击"保存"使用
  {
    key: 'doubao', name: '字节跳动 / 火山引擎 (Doubao) ⚠️ 需要工作负载ID',
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: [
      { id: 'ep-', name: '输入你的工作负载 ID（如 ep-20250101xxx-xxxxx）' },
    ],
  },
];

export const useStore = create(
  persist(
    (set, get) => ({

      /* ============================================
         UI State
         ============================================ */
      activeTab: 'skill-evaluator',
      setActiveTab: (tab) => set({ activeTab: tab }),
      isLoading: false,
      setLoading: (loading) => set({ isLoading: loading }),

      /* ============================================
         CONFIG CENTER — Models
         Each entry: { id, provider, model, apiKey, baseUrl, displayName, status }
         ============================================ */
      modelConfigs: [],
      addModelConfig: (config) =>
        set((state) => ({
          modelConfigs: [
            ...state.modelConfigs,
            { ...config, id: config.id || `${config.provider}-${config.model}-${Date.now()}` },
          ],
        })),
      removeModelConfig: (id) =>
        set((state) => ({
          modelConfigs: state.modelConfigs.filter((c) => c.id !== id),
        })),
      updateModelConfig: (id, updates) =>
        set((state) => ({
          modelConfigs: state.modelConfigs.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          ),
        })),

      /* ============================================
         CONFIG CENTER — Capabilities
         Centralized config for all underlying services.
         Configured once, consumed everywhere.
         ============================================ */
      capabilities: {
        // PDF parsing engine
        pdf: {
          enabled: true,
          engine: 'server',        // 'server' (built-in) | 'custom'
          maxChars: 80000,
          customEndpoint: '',      // user can point to an external PDF service
        },
        // Text file handling
        textFiles: {
          enabled: true,
          maxChars: 50000,
          supportedExts: ['txt', 'md', 'csv', 'json', 'yaml', 'yml'],
        },
        // Feishu / Lark integration
        feishu: {
          enabled: false,
          authMode: 'public',      // 'public' (no auth) | 'token' (app token) | 'cli' (lark-cli)
          appId: '',
          appSecret: '',
          tenantToken: '',
          cliInstalled: false,
        },
        // External link fetching
        linkFetch: {
          enabled: true,
          timeout: 15000,
          maxChars: 50000,
        },
        // Global skill / plugin permissions
        plugins: {
          globalSkillAccess: true,
          allowedPlugins: [],       // plugin IDs that are globally enabled
        },
      },
      updateCapability: (section, updates) =>
        set((state) => ({
          capabilities: {
            ...state.capabilities,
            [section]: { ...state.capabilities[section], ...updates },
          },
        })),

      /* ============================================
         Skill Management
         ============================================ */
      skills: [],
      activeSkillId: null,
      currentSkill: {
        id: null, name: '', description: '', code: '', content: '',
        format: 'skill_md', language: 'markdown',
      },
      setCurrentSkill: (skill) => set({ currentSkill: skill }),
      updateSkillCode: (code) =>
        set((state) => ({ currentSkill: { ...state.currentSkill, code } })),
      addSkill: (skill) =>
        set((state) => ({
          skills: [
            ...state.skills,
            {
              ...skill,
              id: skill.id || Date.now().toString(),
              versions: [{ content: skill.content || skill.code || '', timestamp: Date.now(), description: '初始版本' }],
              currentVersionIndex: 0,
            },
          ],
        })),
      removeSkill: (id) =>
        set((state) => ({
          skills: state.skills.filter((s) => s.id !== id),
          activeSkillId: state.activeSkillId === id ? null : state.activeSkillId,
        })),
      updateSkill: (id, updates) =>
        set((state) => ({
          skills: state.skills.map((s) => (s.id === id ? { ...s, ...updates } : s)),
        })),
      setActiveSkill: (id) => set({ activeSkillId: id }),
      saveSkillVersion: (skillId, content, description) =>
        set((state) => ({
          skills: state.skills.map((skill) =>
            skill.id === skillId
              ? {
                  ...skill, content,
                  versions: [...skill.versions, { content, timestamp: Date.now(), description: description || `版本 ${skill.versions.length + 1}` }],
                  currentVersionIndex: skill.versions.length,
                }
              : skill
          ),
        })),
      rollbackSkillVersion: (skillId, versionIndex) =>
        set((state) => ({
          skills: state.skills.map((skill) =>
            skill.id === skillId
              ? { ...skill, currentVersionIndex: versionIndex, content: skill.versions[versionIndex]?.content || skill.content }
              : skill
          ),
        })),

      /* ============================================
         Test Results & Evaluations
         ============================================ */
      testResults: [],
      addTestResult: (result) =>
        set((state) => ({
          testResults: [...state.testResults, { ...result, id: result.id || Date.now().toString(), timestamp: result.timestamp || Date.now() }],
        })),
      clearTestResults: () => set({ testResults: [] }),

      evaluations: [],
      addEvaluation: (evaluation) =>
        set((state) => ({
          evaluations: [...state.evaluations, { ...evaluation, id: evaluation.id || Date.now().toString(), timestamp: evaluation.timestamp || Date.now() }],
        })),

      versions: [],
      addVersion: (version) =>
        set((state) => ({ versions: [...state.versions, version] })),

      qualityMetrics: { totalTests: 0, passedTests: 0, avgLatency: 0, avgCost: 0 },
      updateQualityMetrics: (metrics) => set({ qualityMetrics: metrics }),

      /* ============================================
         Skill Evaluator Module — persistent UI state
         Keeps selections + results alive across tab switches
         ============================================ */
      skillEvalState: {
        selectedModelId:      null,
        selectedSkillId:      null,
        selectedVersionIndex: null,
        testCasesJson:        '',
        testCasesError:       '',
        results:              null,
        resultsTab:           'evaluation',
        expanded:             false,
        expandedRows:         {},
        filterStatus:         '全部',
        filterType:           '全部',
        filterPriority:       '全部',
      },
      setSkillEvalState: (updates) =>
        set((state) => ({
          skillEvalState: { ...state.skillEvalState, ...updates },
        })),
      resetSkillEvalResults: () =>
        set((state) => ({
          skillEvalState: {
            ...state.skillEvalState,
            results:      null,
            resultsTab:   'evaluation',
            expandedRows: {},
          },
        })),

      /* ============================================
         Evaluation Standards — uploaded by user
         Each standard: { name, content, size, uploadedAt } | null
         - generic:     通用评估规则，替代 Phase 2 Judge 的内置 prompt
         - specialized: 专项评估规则，替代 Phase 3 专项评估的内置 prompt
         - volcano:     火山合规规则，替代 Phase 4 火山规范检查的内置 prompt
         ============================================ */
      /**
       * evalModelId — 评估专用大模型 ID，在「配置中心 → 评估标准」tab 中统一配置
       * 对应 modelConfigs 中某条记录的 id
       */
      evalModelId: null,
      setEvalModelId: (id) => set({ evalModelId: id }),

      /**
       * judgeEnabled — 是否启用 LLM Judge 模型评分（配置中心 → 评估标准 中控制）
       * false（默认）：一期跳过 Judge，使用 Python 脚本或执行结果直接评估
       * true：启用 Judge 模型，在脚本失败时回退 LLM Judge 评分
       */
      judgeEnabled: false,
      setJudgeEnabled: (enabled) => set({ judgeEnabled: enabled }),

      /**
       * evalStandards — 用户上传的评估标准 Skill 文件
       * 文本文件：{ name, content, isCompressed: false, size, uploadedAt }
       * 压缩包：  { name, content: null, base64, isCompressed: true, size, uploadedAt }
       */
      evalStandards: {
        generic:     null,
        specialized: null,
        volcano:     null,
      },
      setEvalStandard: (type, standard) =>
        set((state) => ({
          evalStandards: { ...state.evalStandards, [type]: standard },
        })),
      clearEvalStandard: (type) =>
        set((state) => ({
          evalStandards: { ...state.evalStandards, [type]: null },
        })),

      /* ============================================
         Helper: get a model config by ID (not an action, a selector)
         ============================================ */
      getModelConfigById: (id) => {
        return get().modelConfigs.find((m) => m.id === id) || null;
      },
    }),
    {
      name: 'skill-evaluator-store',
      partialize: (state) => ({
        modelConfigs:   state.modelConfigs,
        capabilities:   state.capabilities,
        skills:         state.skills,
        activeSkillId:  state.activeSkillId,
        evaluations:    state.evaluations,
        activeTab:      state.activeTab,
        skillEvalState: state.skillEvalState,
        evalStandards:  state.evalStandards,
        evalModelId:    state.evalModelId,
        judgeEnabled:   state.judgeEnabled,
      }),
    }
  )
);

export default useStore;
