import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useStore = create(
  persist(
    (set, get) => ({
      // Model configuration
      modelConfigs: [],
      addModelConfig: (config) =>
        set((state) => ({
          modelConfigs: [...state.modelConfigs, { ...config, id: Date.now().toString() }],
        })),
      removeModelConfig: (id) =>
        set((state) => ({
          modelConfigs: state.modelConfigs.filter((config) => config.id !== id),
        })),
      updateModelConfig: (id, updates) =>
        set((state) => ({
          modelConfigs: state.modelConfigs.map((config) =>
            config.id === id ? { ...config, ...updates } : config
          ),
        })),
      setActiveModel: (id) =>
        set((state) => ({
          modelConfigs: state.modelConfigs.map((config) => ({
            ...config,
            isActive: config.id === id,
          })),
        })),

      // Skill management
      skills: [],
      activeSkillId: null,
      addSkill: (skill) =>
        set((state) => ({
          skills: [
            ...state.skills,
            {
              ...skill,
              id: Date.now().toString(),
              versions: [{ content: skill.content, timestamp: Date.now() }],
              currentVersionIndex: 0,
            },
          ],
        })),
      removeSkill: (id) =>
        set((state) => ({
          skills: state.skills.filter((skill) => skill.id !== id),
          activeSkillId: state.activeSkillId === id ? null : state.activeSkillId,
        })),
      updateSkill: (id, updates) =>
        set((state) => ({
          skills: state.skills.map((skill) =>
            skill.id === id ? { ...skill, ...updates } : skill
          ),
        })),
      setActiveSkill: (id) =>
        set(() => ({
          activeSkillId: id,
        })),
      saveSkillVersion: (skillId, content) =>
        set((state) => ({
          skills: state.skills.map((skill) =>
            skill.id === skillId
              ? {
                  ...skill,
                  versions: [
                    ...skill.versions,
                    { content, timestamp: Date.now() },
                  ],
                  currentVersionIndex: skill.versions.length,
                }
              : skill
          ),
        })),
      rollbackSkillVersion: (skillId, versionIndex) =>
        set((state) => ({
          skills: state.skills.map((skill) =>
            skill.id === skillId
              ? {
                  ...skill,
                  currentVersionIndex: versionIndex,
                  content: skill.versions[versionIndex].content,
                }
              : skill
          ),
        })),

      // Test results
      testResults: [],
      addTestResult: (result) =>
        set((state) => ({
          testResults: [
            ...state.testResults,
            {
              ...result,
              id: Date.now().toString(),
              timestamp: Date.now(),
            },
          ],
        })),
      clearTestResults: () =>
        set(() => ({
          testResults: [],
        })),

      // Evaluation results
      evaluations: [],
      addEvaluation: (evaluation) =>
        set((state) => ({
          evaluations: [
            ...state.evaluations,
            {
              ...evaluation,
              id: Date.now().toString(),
              timestamp: Date.now(),
            },
          ],
        })),

      // UI state
      activeTab: 'config',
      setActiveTab: (tab) =>
        set(() => ({
          activeTab: tab,
        })),
      isLoading: false,
      setLoading: (loading) =>
        set(() => ({
          isLoading: loading,
        })),
    }),
    {
      name: 'skill-evaluator-store',
    }
  )
);

export default useStore;
