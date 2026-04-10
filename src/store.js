import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * PROVIDERS — canonical list of supported LLM providers.
 * Shared across ConfigCenter and all consuming modules.
 */
export const PROVIDERS = [
  {
    key: 'openai', name: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    models: [
      // GPT-4o 系列（稳定可用）
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o mini' },
      // GPT-4.1 系列
      { id: 'gpt-4.1', name: 'GPT-4.1' },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 mini' },
      { id: 'gpt-4.1-nano', name: 'GPT-4.1 nano' },
      // o 系列推理模型
      { id: 'o3', name: 'o3 (推理)' },
      { id: 'o3-mini', name: 'o3-mini (推理)' },
      { id: 'o4-mini', name: 'o4-mini (推理)' },
      { id: 'o1', name: 'o1 (推理)' },
      { id: 'o1-mini', name: 'o1-mini (推理)' },
    ],
  },
  {
    key: 'anthropic', name: 'Anthropic (Claude)',
    defaultBaseUrl: 'https://api.anthropic.com',
    models: [
      // Claude 4.6 系列（最新）
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      // Claude 4.5 系列
      { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5' },
      { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
      // Claude 4 系列
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
      // Claude 3.x 系列（旧版稳定）
      { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
    ],
  },
  {
    key: 'doubao', name: 'Doubao (字节跳动)',
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: [
      // 豆包 Seed 2.0 系列（最新）
      { id: 'doubao-seed-2-0-pro-260215', name: 'Seed 2.0 Pro (推理)' },
      // 豆包 1.5 系列（稳定可用）
      { id: 'doubao-1-5-pro-256k', name: '豆包 1.5 Pro 256K' },
      { id: 'doubao-1-5-pro-32k', name: '豆包 1.5 Pro 32K' },
      { id: 'doubao-1-5-lite-32k', name: '豆包 1.5 Lite 32K' },
      // 豆包经典系列（兼容旧版）
      { id: 'doubao-pro-256k', name: '豆包 Pro 256K' },
      { id: 'doubao-pro-32k', name: '豆包 Pro 32K' },
      { id: 'doubao-lite-32k', name: '豆包 Lite 32K' },
    ],
  },
  {
    key: 'qwen', name: 'Qwen (通义千问)',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      // Qwen 3 系列（最新）
      { id: 'qwen-max', name: 'Qwen Max' },
      { id: 'qwen-max-latest', name: 'Qwen Max (最新快照)' },
      { id: 'qwen-plus', name: 'Qwen Plus' },
      { id: 'qwen-plus-latest', name: 'Qwen Plus (最新快照)' },
      { id: 'qwen-turbo', name: 'Qwen Turbo' },
      { id: 'qwen-turbo-latest', name: 'Qwen Turbo (最新快照)' },
      { id: 'qwen-long', name: 'Qwen Long (长文本)' },
      // 推理模型
      { id: 'qwq-plus', name: 'QwQ Plus (推理)' },
      // 代码模型
      { id: 'qwen-coder-plus', name: 'Qwen Coder Plus' },
      { id: 'qwen-coder-turbo', name: 'Qwen Coder Turbo' },
    ],
  },
  {
    key: 'gemini', name: 'Google Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: [
      // Gemini 2.5 系列（当前推荐）
      { id: 'gemini-2.5-pro-preview-05-06', name: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash-preview-04-17', name: 'Gemini 2.5 Flash' },
      // Gemini 2.0 系列（稳定）
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
      { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite' },
      // Gemini 1.5 系列（旧版稳定）
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
    ],
  },
  {
    key: 'deepseek', name: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat (V3)' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (R1)' },
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
      }),
    }
  )
);

export default useStore;
