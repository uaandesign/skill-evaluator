import React, { useState } from 'react';
import {
  Layout, Select, Button, Tabs, message, Modal,
  Spin, Upload, Progress, Tooltip, Tag, Alert,
} from 'antd';
import { useStore } from '../store';
import { saveEvalRecord } from '../utils/historyManager';
import HistoryPanel from './HistoryPanel';

const { Sider, Content } = Layout;
const { Option } = Select;

// PRD 4-dimension framework
const DIMENSIONS = [
  { key: '有用性', tip: 'Skill能否解决用户核心问题，输出是否符合用户预期，任务完成度（1-5分）' },
  { key: '稳定性', tip: '相同/相似输入下输出是否一致、可预期，边界用例通过率（1-5分）' },
  { key: '准确性', tip: '输出内容真实、无幻觉，符合Skill定义的规则及格式要求（1-5分）' },
  { key: '安全性', tip: '输出合规、无敏感信息泄露、无越权操作、无违规内容（1-5分）' },
];

const S = {
  divider:    { borderTop: '1px solid #e5e7eb', margin: '14px 0' },
  label:      { fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' },
  metaLine:   { fontSize: 11, color: '#9ca3af', marginTop: 4 },
  btnOutline: { width: '100%', borderRadius: 4, fontWeight: 500, fontSize: 13, borderColor: '#374151', color: '#374151', marginBottom: 8 },
  card:       { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: 16, marginBottom: 12 },
  codeBox:    { background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 4, padding: 10, fontSize: 12, fontFamily: 'monospace', color: '#374151', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowY: 'auto' },
};

function gradeFromScore(score) {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  return 'D';
}

// ─────────────────────────────────────────────────────────────────────────────
export default function SkillEvaluatorModule() {
  const { modelConfigs, skills, saveSkillVersion, skillEvalState, setSkillEvalState } = useStore();

  // All UI state lives in Zustand so it survives tab switches
  const {
    selectedModelId, selectedSkillId, selectedVersionIndex,
    testCasesJson, testCasesError, results, resultsTab, expanded,
    expandedRows, filterStatus, filterType, filterPriority,
  } = skillEvalState;

  const set = (updates) => setSkillEvalState(updates);

  // Transient loading state — OK to be local (no need to survive navigation)
  const [generating, setGenerating] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [optimizing, setOptimizing] = useState(false);

  // Volcano rule skill state
  const [volcanoRuleSkill, setVolcanoRuleSkill] = useState('');
  const [volcanoRuleFileName, setVolcanoRuleFileName] = useState('');

  const handleVolcanoRuleUpload = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setVolcanoRuleSkill(e.target.result);
      setVolcanoRuleFileName(file.name);
      message.success(`已加载规则 Skill: ${file.name}`);
    };
    reader.readAsText(file);
    return false;
  };

  // Derived
  const selectedSkill   = skills.find((s) => s.id === selectedSkillId) || null;
  const versions        = selectedSkill?.versions || [];
  const skillContent    = (selectedVersionIndex !== null && versions[selectedVersionIndex])
    ? versions[selectedVersionIndex].content : '';
  const selectedModel   = modelConfigs.find((m) => m.id === selectedModelId) || null;
  const isReady         = selectedModelId && selectedSkillId && selectedVersionIndex !== null
    && testCasesJson.trim() && !testCasesError;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSkillChange = (id) => {
    set({ selectedSkillId: id, selectedVersionIndex: null, testCasesJson: '', results: null });
  };

  const handleVersionChange = (idx) => {
    set({ selectedVersionIndex: idx, testCasesJson: '', results: null });
  };

  const handleJsonChange = (e) => {
    const val = e.target.value;
    let err = '';
    if (val.trim()) {
      try { JSON.parse(val); }
      catch { err = 'JSON 格式错误，请检查'; }
    }
    set({ testCasesJson: val, testCasesError: err });
  };

  const handleFileUpload = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      let err = '';
      try { JSON.parse(text); }
      catch { err = '文件 JSON 格式错误'; }
      set({ testCasesJson: text, testCasesError: err });
    };
    reader.readAsText(file);
    return false;
  };

  const handleGenerateTestCases = async () => {
    if (!skillContent) { message.warning('请先选择技能和版本'); return; }
    setGenerating(true);
    try {
      const res = await fetch('/api/generate-test-cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill_content: skillContent, skill_name: selectedSkill?.name || '', model_config: selectedModel }),
      });
      const data = await res.json();
      if (data.test_cases) {
        set({ testCasesJson: JSON.stringify(data.test_cases, null, 2), testCasesError: '' });
        message.success(`已生成 ${data.test_cases.length} 条测试用例`);
      } else {
        message.error(data.error || '生成失败，请重试');
      }
    } catch (err) {
      message.error('请求失败: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleEvaluate = async () => {
    if (!isReady) { message.warning('请完成所有配置项'); return; }
    let parsedCases;
    try { parsedCases = JSON.parse(testCasesJson); }
    catch { message.error('测试用例 JSON 格式有误'); return; }

    setEvaluating(true);
    set({ results: null, expandedRows: {}, resultsTab: 'evaluation' });
    try {
      const res = await fetch('/api/evaluate-skill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skill_id:      selectedSkillId,
          skill_version: versions[selectedVersionIndex]?.description || `v${selectedVersionIndex + 1}`,
          skill_content: skillContent,
          skill_name:    selectedSkill?.name || '',
          test_cases:    parsedCases,
          model_config:  selectedModel,
          skill_category: selectedSkill?.category || null,
          volcano_rule_skill: volcanoRuleSkill || null,
        }),
      });
      const data = await res.json();
      if (data.error) {
        message.error(data.error);
      } else {
        set({ results: data, resultsTab: 'evaluation' });
        message.success('评估完成');

        // Save evaluation record to history
        const scores = {};
        if (data.dimensional_scores) {
          for (const [key, value] of Object.entries(data.dimensional_scores)) {
            scores[key] = typeof value === 'object' ? value.score : value;
          }
        }

        await saveEvalRecord({
          skillId: selectedSkillId,
          skillName: selectedSkill?.name || '',
          scores: scores,
          optimizationSuggestions: data.optimization_suggestions || [],
          weaknessAnalysis: data.weakness_analysis || {},
          model: selectedModel?.displayName || `${selectedModel?.provider}/${selectedModel?.model}`,
        });
      }
    } catch (err) {
      message.error('请求失败: ' + err.message);
    } finally {
      setEvaluating(false);
    }
  };

  const handleOptimize = () => {
    if (!results) return;
    Modal.confirm({
      title: '一键优化',
      content: '优化后将生成新的 Skill 版本，保留原始版本，是否继续？',
      okText: '确认优化',
      cancelText: '取消',
      onOk: async () => {
        setOptimizing(true);
        try {
          const res = await fetch('/api/optimize-skill', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              skill_id:             selectedSkillId,
              skill_content:        skillContent,
              evaluation_results:   results,
              optimization_suggestions: results.optimization_suggestions,
              model_config:         selectedModel,
              current_version_count: versions.length,
            }),
          });
          const data = await res.json();
          if (data.optimized_content) {
            saveSkillVersion(selectedSkillId, data.optimized_content, data.new_version || '优化版');
            message.success(`优化成功，已生成新版本 ${data.new_version || '优化版'}`);
          } else {
            message.error(data.error || '优化失败，请重试');
          }
        } catch (err) {
          message.error('请求失败: ' + err.message);
        } finally {
          setOptimizing(false);
        }
      },
    });
  };

  const copyText = (text) => {
    navigator.clipboard.writeText(text).then(() => message.success('已复制')).catch(() => message.error('复制失败'));
  };

  const [exporting, setExporting] = useState(false);

  const handleExportReport = async () => {
    if (!results) return;
    setExporting(true);
    try {
      const res = await fetch('/api/export-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skill_name: selectedSkill?.name || '未知技能',
          skill_version: versions[selectedVersionIndex]?.description || `版本 ${(selectedVersionIndex ?? 0) + 1}`,
          model_name: selectedModel?.displayName || `${selectedModel?.provider}/${selectedModel?.model}`,
          results,
        }),
      });
      const data = await res.json();
      if (data.markdown) {
        const blob = new Blob([data.markdown], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `评估报告_${selectedSkill?.name || 'skill'}_${new Date().toISOString().slice(0, 10)}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        message.success('报告已导出');
      } else {
        message.error(data.error || '导出失败');
      }
    } catch (err) {
      message.error('导出失败: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  // ── LEFT PANEL FORM AREA ─────────────────────────────────────────────────
  const leftFormContent = (inExpandedMode = false) => (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>评估配置</span>
        <Button size="small" style={{ fontSize: 11, borderColor: '#d1d5db', color: '#374151' }} onClick={() => set({ expanded: !expanded })}>
          {expanded ? '收起' : '展开详情'}
        </Button>
      </div>

      {/* 1. 选择大模型 */}
      <div style={{ marginBottom: 14 }}>
        <span style={S.label}>1. 选择大模型</span>
        {modelConfigs.length === 0 ? (
          <div style={{ fontSize: 12, color: '#9ca3af' }}>暂无已配置模型，请前往「配置中心」添加</div>
        ) : (
          <Select style={{ width: '100%' }} placeholder="选择已配置的模型" value={selectedModelId} onChange={(v) => set({ selectedModelId: v })}>
            {modelConfigs.map((m) => (
              <Option key={m.id} value={m.id}>{m.displayName || `${m.provider} / ${m.model}`}</Option>
            ))}
          </Select>
        )}
        {selectedModel && <div style={S.metaLine}>{selectedModel.provider} · {selectedModel.model}</div>}
      </div>

      <div style={S.divider} />

      {/* 2. 选择技能 */}
      <div style={{ marginBottom: 14 }}>
        <span style={S.label}>2. 选择技能</span>
        {skills.length === 0 ? (
          <div style={{ fontSize: 12, color: '#9ca3af' }}>技能库为空，请前往「技能库」添加技能</div>
        ) : (
          <Select style={{ width: '100%' }} placeholder="选择技能" value={selectedSkillId} onChange={handleSkillChange}>
            {skills.map((s) => <Option key={s.id} value={s.id}>{s.name}</Option>)}
          </Select>
        )}
      </div>

      <div style={S.divider} />

      {/* 3. 选择技能版本 + SKILL.md preview */}
      <div style={{ marginBottom: 14 }}>
        <span style={S.label}>3. 选择技能版本</span>
        {!selectedSkill ? (
          <div style={{ fontSize: 12, color: '#9ca3af' }}>请先选择技能</div>
        ) : versions.length === 0 ? (
          <div style={{ fontSize: 12, color: '#9ca3af' }}>该技能暂无版本</div>
        ) : (
          <Select style={{ width: '100%' }} placeholder="选择版本" value={selectedVersionIndex} onChange={handleVersionChange}>
            {versions.map((v, i) => (
              <Option key={i} value={i}>
                {v.description || `版本 ${i + 1}`}
                {v.timestamp ? <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 6 }}>{new Date(v.timestamp).toLocaleDateString()}</span> : null}
              </Option>
            ))}
          </Select>
        )}
        {/* SKILL.md preview — hidden in expanded mode (shown in dedicated panel) */}
        {skillContent && !inExpandedMode && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>SKILL.md · {skillContent.length} 字符</div>
            <div style={{ ...S.codeBox, maxHeight: 120 }}>{skillContent}</div>
          </div>
        )}
      </div>

      <div style={S.divider} />

      {/* 4. 测试用例 JSON */}
      <div style={{ marginBottom: 14 }}>
        <span style={S.label}>4. 测试用例（JSON）</span>
        <Upload accept=".json" showUploadList={false} beforeUpload={handleFileUpload}>
          <Button style={S.btnOutline}>上传 JSON 文件</Button>
        </Upload>
        <Button style={S.btnOutline} onClick={handleGenerateTestCases} loading={generating} disabled={!skillContent}>
          {generating ? '生成中...' : '智能生成测试用例'}
        </Button>
        {/* JSON textarea — hidden in expanded mode (shown in dedicated panel) */}
        {!inExpandedMode && (
          <>
            <textarea
              rows={6}
              placeholder={'[\n  {\n    "id": "1",\n    "name": "用例名称",\n    "input": "...",\n    "expected_output": "..."\n  }\n]'}
              value={testCasesJson}
              onChange={handleJsonChange}
              style={{
                width: '100%', fontFamily: 'monospace', fontSize: 11, padding: 8, resize: 'vertical',
                border: testCasesError ? '1px solid #ef4444' : '1px solid #e5e7eb',
                borderRadius: 4, color: '#374151', background: '#f9fafb', boxSizing: 'border-box', outline: 'none',
              }}
            />
            {testCasesError && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>{testCasesError}</div>}
          </>
        )}
      </div>

      <div style={S.divider} />

      {/* 5. 火山规则 Skill (optional) */}
      <div style={{ marginBottom: 14 }}>
        <span style={S.label}>5. 火山规则 Skill（可选）</span>
        <Upload accept=".md,.txt,.json" showUploadList={false} beforeUpload={handleVolcanoRuleUpload}>
          <Button style={S.btnOutline}>上传规则 Skill 文件</Button>
        </Upload>
        {volcanoRuleFileName && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
            <span style={{ fontSize: 11, color: '#059669' }}>已加载: {volcanoRuleFileName} ({volcanoRuleSkill.length} 字符)</span>
            <span
              style={{ fontSize: 11, color: '#9ca3af', cursor: 'pointer', textDecoration: 'underline' }}
              onClick={() => { setVolcanoRuleSkill(''); setVolcanoRuleFileName(''); message.info('已清除规则 Skill'); }}
            >清除</span>
          </div>
        )}
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>上传后，火山评估将依据规则文件检查待评估 Skill 的合规性</div>
      </div>

      <div style={S.divider} />

      {/* Test button */}
      <Button
        style={{
          width: '100%', height: 40, borderRadius: 4, fontWeight: 700, fontSize: 14,
          background: isReady ? '#111827' : '#e5e7eb',
          borderColor: isReady ? '#111827' : '#e5e7eb',
          color: isReady ? '#fff' : '#9ca3af',
        }}
        disabled={!isReady}
        loading={evaluating}
        onClick={handleEvaluate}
      >
        {evaluating ? '测试中...' : '测试'}
      </Button>
      {!isReady && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6, textAlign: 'center' }}>请完成以上所有配置项</div>}
    </div>
  );

  // ── RIGHT PANEL: empty / loading / results ────────────────────────────────
  const emptyState = (
    <div style={{ height: '80%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 36, color: '#d1d5db', marginBottom: 12 }}>—</div>
      <div style={{ fontSize: 13, color: '#9ca3af' }}>完成左侧配置后点击「测试」</div>
      <div style={{ fontSize: 11, color: '#d1d5db', marginTop: 6 }}>平台将用大模型真实执行每条测试用例，再由 Judge 模型评分</div>
    </div>
  );

  const renderEvaluationTab = () => {
    const { summary, dimensional_scores, weakness_analysis } = results;

    // Azure AI Foundry style color mapping
    const getScoreColor = (score) => {
      if (score >= 80) return '#10b981';  // green
      if (score >= 60) return '#f59e0b';  // amber
      return '#ef4444';  // red
    };

    return (
      <div>
        {/* Judge 跳过警告 */}
        {results.judge_skipped && (
          <Alert
            type="warning"
            message="⚠️ Judge 模型不可用"
            description={`Judge 模型连接失败，本次评估仅基于执行结果生成。评分为估计值，不代表完整评估。原因：${results.judge_skip_reason || '未知'}`}
            showIcon={false}
            style={{ marginBottom: 16, padding: '12px 14px', fontSize: 12 }}
          />
        )}

        {/* Top info bar - Azure Foundry style */}
        <div style={{
          background: 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)',
          border: '1px solid #e5e7eb',
          borderRadius: '8px 8px 0 0',
          padding: '16px 20px',
          marginBottom: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {results.evaluation_mode === 'real' && (
              <>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: results.judge_skipped ? '#f59e0b' : '#10b981' }} />
                <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>
                  {results.judge_skipped ? '部分执行评估' : '真实执行评估'} · {selectedModel?.displayName || '配置模型'}
                </span>
              </>
            )}
          </div>
          <Button
            size="small"
            style={{ fontSize: 11, borderColor: '#d1d5db', color: '#374151' }}
            loading={exporting}
            onClick={handleExportReport}
          >
            {exporting ? '导出中...' : '📥 导出报告'}
          </Button>
        </div>

        {/* Summary cards - enhanced with Azure style */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20, padding: '20px 0' }}>
          {[
            { label: '综合评分', value: summary?.overall_score ?? '—', sub: '/ 100', color: getScoreColor(summary?.overall_score) },
            { label: '质量等级', value: summary?.overall_score != null ? gradeFromScore(summary.overall_score) : '—', sub: '' },
            { label: '测试通过', value: `${summary?.passed_tests ?? '—'}`, sub: `/ ${summary?.total_tests ?? '—'}` },
            { label: '通过率',   value: summary?.pass_rate != null ? `${Math.round(summary.pass_rate * 100)}%` : '—', sub: '' },
          ].map((c) => (
            <div key={c.label} style={{
              ...S.card,
              borderLeft: `4px solid ${c.color || '#d1d5db'}`,
              background: '#fff'
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>{c.label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: c.color || '#111827', lineHeight: 1.2 }}>
                {c.value}
                {c.sub && <span style={{ fontSize: 13, color: '#9ca3af', fontWeight: 400, marginLeft: 4 }}>{c.sub}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Weighted dimension bars */}
        {(summary?.quality_score != null || summary?.functionality_score != null || summary?.safety_score != null) && (
          <div style={{ ...S.card, marginBottom: 20, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 12 }}>评分构成（加权公式）</div>
            <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 12 }}>总体评分 = 质量维度×40% + 功能维度×35% + 安全合规×25%</div>
            {[
              { label: '质量维度 (40%)', score: summary.quality_score, desc: '稳定性 + 准确性' },
              { label: '功能维度 (35%)', score: summary.functionality_score, desc: '有用性' },
              { label: '安全合规 (25%)', score: summary.safety_score, desc: '安全性' },
            ].map((d) => (
              <div key={d.label} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{d.label}</span>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{d.score ?? 0}/100 <span style={{ fontSize: 10, color: '#9ca3af' }}>({d.desc})</span></span>
                </div>
                <div style={{ width: '100%', height: 8, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(d.score ?? 0, 100)}%`, height: '100%', background: (d.score ?? 0) >= 80 ? '#111827' : (d.score ?? 0) >= 60 ? '#6b7280' : '#d1d5db', borderRadius: 4, transition: 'width 0.5s' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Dimensional scores */}
        {dimensional_scores && Object.keys(dimensional_scores).length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 10 }}>通用评估维度（1-5 分制）</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {DIMENSIONS.map((dim) => {
                const entry   = dimensional_scores[dim.key];
                const score   = typeof entry === 'object' ? entry?.score   : entry;
                const comment = typeof entry === 'object' ? entry?.comment  : null;
                return (
                  <Tooltip key={dim.key} title={dim.tip} placement="top">
                    <div style={{ ...S.card, padding: 14, textAlign: 'center', cursor: 'help' }}>
                      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{dim.key}</div>
                      <div style={{ fontSize: 26, fontWeight: 800, color: score >= 4 ? '#111827' : score >= 3 ? '#374151' : '#9ca3af', lineHeight: 1 }}>{score ?? '—'}</div>
                      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>/ 5 分</div>
                      {comment && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6, textAlign: 'left', lineHeight: 1.4 }}>{comment}</div>}
                    </div>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        )}

        {/* Specialized dimensions (if available) */}
        {results.specialized_dimensional_scores && Object.keys(results.specialized_dimensional_scores).length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 10 }}>
              专项评估维度（{results.skill_category}，占比40%）
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {Object.entries(results.specialized_dimensional_scores).map(([key, entry]) => {
                const score = typeof entry === 'object' ? entry?.score : entry;
                const comment = typeof entry === 'object' ? entry?.comment : null;
                return (
                  <div key={key} style={{ ...S.card, padding: 14, textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{key}</div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: score >= 4 ? '#111827' : score >= 3 ? '#374151' : '#9ca3af', lineHeight: 1 }}>{score ?? '—'}</div>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>/ 5 分</div>
                    {comment && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6, textAlign: 'left', lineHeight: 1.4 }}>{comment}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Volcano evaluation dimensions */}
        {results.volcano_skipped ? (
          <div style={{ marginBottom: 20, padding: '12px 14px', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 6, fontSize: 12, color: '#92400e' }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>⚠️ 火山评估 - 未获取标准</div>
            <div>未上传火山规则 Skill，无法执行合规性评估。如需进行火山评估，请在配置第 5 项上传火山规则文件。</div>
          </div>
        ) : results.volcano_dimensional_scores && Object.keys(results.volcano_dimensional_scores).length > 0 ? (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>
                火山评估{results.volcano_score != null && <span style={{ fontSize: 12, fontWeight: 400, color: '#6b7280', marginLeft: 8 }}>综合 {results.volcano_score}/100</span>}
              </div>
              {results.volcano_compliance_summary && (
                <Tag style={{ fontSize: 10, margin: 0 }}>{results.volcano_compliance_summary}</Tag>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {Object.entries(results.volcano_dimensional_scores).map(([key, entry]) => {
                const score = typeof entry === 'object' ? entry?.score : entry;
                const comment = typeof entry === 'object' ? entry?.comment : null;
                const issues = typeof entry === 'object' ? entry?.issues : null;
                return (
                  <Tooltip key={key} title={issues?.length ? issues.join('; ') : comment || ''} placement="top">
                    <div style={{ ...S.card, padding: 14, textAlign: 'center', cursor: issues?.length ? 'help' : 'default' }}>
                      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{key}</div>
                      <div style={{ fontSize: 26, fontWeight: 800, color: score >= 4 ? '#059669' : score >= 3 ? '#d97706' : '#dc2626', lineHeight: 1 }}>{score ?? '—'}</div>
                      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>/ 5 分</div>
                      {comment && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6, textAlign: 'left', lineHeight: 1.4 }}>{comment}</div>}
                    </div>
                  </Tooltip>
                );
              })}
            </div>
            {/* Volcano fix suggestions */}
            {results.volcano_fix_suggestions?.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>合规修复建议</div>
                {results.volcano_fix_suggestions.map((fix, i) => (
                  <div key={i} style={{ ...S.card, padding: 10, marginBottom: 6 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
                        background: fix.priority === '高' ? '#fef2f2' : fix.priority === '中' ? '#fff7ed' : '#f9fafb',
                        color: fix.priority === '高' ? '#b91c1c' : fix.priority === '中' ? '#92400e' : '#6b7280',
                        border: `1px solid ${fix.priority === '高' ? '#fecaca' : fix.priority === '中' ? '#fed7aa' : '#e5e7eb'}`,
                      }}>{fix.priority}优先</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>{fix.dimension}</span>
                    </div>
                    {fix.issue && <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{fix.issue}</div>}
                    {fix.fix && <div style={{ fontSize: 11, color: '#374151' }}>{fix.fix}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {/* Optimization suggestions */}
        {results.optimization_suggestions?.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 12 }}>优化建议</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {results.optimization_suggestions.slice(0, 5).map((sug, i) => {
                const priorityColors = {
                  '高': { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c' },
                  'high': { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c' },
                  '中': { bg: '#fff7ed', border: '#fed7aa', text: '#92400e' },
                  'medium': { bg: '#fff7ed', border: '#fed7aa', text: '#92400e' },
                  '低': { bg: '#f9fafb', border: '#e5e7eb', text: '#6b7280' },
                  'low': { bg: '#f9fafb', border: '#e5e7eb', text: '#6b7280' },
                };
                const priorityColor = priorityColors[sug.priority] || priorityColors['中'];
                return (
                  <div key={i} style={{
                    ...S.card,
                    padding: 12,
                    background: priorityColor.bg,
                    border: `1px solid ${priorityColor.border}`,
                    marginBottom: 0
                  }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 3,
                        background: '#fff',
                        color: priorityColor.text,
                        border: `1px solid ${priorityColor.border}`,
                        flexShrink: 0
                      }}>{sug.priority}优先</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#374151', flex: 1 }}>{sug.dimension || '通用'}</span>
                      {sug.expected_impact && <span style={{ fontSize: 10, color: '#6b7280' }}>+{sug.expected_impact}</span>}
                    </div>
                    {sug.issue && <div style={{ fontSize: 11, color: '#4b5563', marginBottom: 4, lineHeight: 1.5 }}>{sug.issue}</div>}
                    {(sug.suggestion || sug.fix) && (
                      <div style={{ fontSize: 11, color: '#374151', lineHeight: 1.5, paddingTop: 4, borderTop: `1px solid ${priorityColor.border}` }}>
                        <strong>建议：</strong> {sug.suggestion || sug.fix}
                      </div>
                    )}
                  </div>
                );
              })}
              {results.optimization_suggestions.length > 5 && (
                <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', padding: 8 }}>
                  还有 {results.optimization_suggestions.length - 5} 条建议，查看详细报告了解更多
                </div>
              )}
            </div>
          </div>
        )}

        {/* Weakness analysis */}
        {weakness_analysis && Object.keys(weakness_analysis).length > 0 && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 10 }}>弱点分析</div>
            <div style={{ ...S.card, background: '#fafafa' }}>
              {weakness_analysis.lowest_dimension && <div style={{ marginBottom: 8, fontSize: 12 }}><span style={{ fontWeight: 600, color: '#6b7280' }}>最低得分维度：</span><span style={{ color: '#111827', fontWeight: 600 }}>{weakness_analysis.lowest_dimension}</span></div>}
              {weakness_analysis.common_failures?.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 3 }}>常见失败模式</div>
                  {weakness_analysis.common_failures.map((f, i) => <div key={i} style={{ fontSize: 12, color: '#374151', paddingLeft: 10, marginTop: 2 }}>· {f}</div>)}
                </div>
              )}
              {weakness_analysis.systematic_issues?.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 3 }}>系统性问题</div>
                  {weakness_analysis.systematic_issues.map((issue, i) => <div key={i} style={{ fontSize: 12, color: '#374151', paddingLeft: 10, marginTop: 2 }}>· {issue}</div>)}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderTestResultsTab = () => {
    const { summary, detailed_results = [] } = results;
    const passed = summary?.passed_tests ?? 0;
    const total  = summary?.total_tests  ?? 0;
    const rate   = total > 0 ? Math.round((passed / total) * 100) : 0;

    const types      = ['全部', ...new Set(detailed_results.map((r) => r.test_type).filter(Boolean))];
    const priorities = ['全部', ...new Set(detailed_results.map((r) => r.priority).filter(Boolean))];

    const filtered = detailed_results.filter((r) => {
      if (filterStatus   !== '全部' && (filterStatus === '通过') !== r.passed) return false;
      if (filterType     !== '全部' && r.test_type !== filterType)             return false;
      if (filterPriority !== '全部' && r.priority  !== filterPriority)         return false;
      return true;
    });

    return (
      <div>
        {/* Pass-rate bar */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>测试通过率 · {passed}/{total} 通过</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: '#111827' }}>{rate}%</span>
          </div>
          <Progress percent={rate} showInfo={false} strokeColor={rate >= 80 ? '#111827' : rate >= 60 ? '#6b7280' : '#d1d5db'} trailColor="#f3f4f6" strokeWidth={10} />
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {[{ label: '状态', opts: ['全部', '通过', '失败'], val: filterStatus, setVal: (v) => set({ filterStatus: v }) },
            { label: '类型', opts: types,      val: filterType,     setVal: (v) => set({ filterType: v }) },
            { label: '优先级', opts: priorities, val: filterPriority, setVal: (v) => set({ filterPriority: v }) }]
            .map(({ label, opts, val, setVal }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 11, color: '#6b7280' }}>{label}:</span>
                <Select size="small" value={val} onChange={setVal} style={{ width: 90 }}>
                  {opts.map((o) => <Option key={o} value={o}>{o}</Option>)}
                </Select>
              </div>
            ))}
          <span style={{ fontSize: 11, color: '#9ca3af' }}>显示 {filtered.length}/{detailed_results.length} 条</span>
        </div>

        {/* Case list — expandable rows */}
        {filtered.length === 0
          ? <div style={{ textAlign: 'center', color: '#9ca3af', padding: 24, fontSize: 13 }}>无匹配的测试用例</div>
          : filtered.map((r, i) => {
              const rowKey = r.id || i;
              const isExpanded = expandedRows[rowKey];
              return (
                <div key={rowKey} style={{ ...S.card, marginBottom: 8, padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                       onClick={() => set({ expandedRows: { ...expandedRows, [rowKey]: !isExpanded } })}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 3, flexShrink: 0,
                      background: r.passed ? '#f0fdf4' : '#fef2f2',
                      color: r.passed ? '#166534' : '#b91c1c',
                      border: `1px solid ${r.passed ? '#bbf7d0' : '#fecaca'}`,
                    }}>{r.passed ? '通过' : '失败'}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#111827', flex: 1 }}>
                      {r.id ? `#${r.id} ` : ''}{r.name || '未命名用例'}
                    </span>
                    {r.test_type && <span style={{ fontSize: 10, color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 3, padding: '1px 5px' }}>{r.test_type}</span>}
                    {r.priority  && <span style={{ fontSize: 10, color: r.priority === '高' ? '#92400e' : '#6b7280', border: '1px solid #e5e7eb', borderRadius: 3, padding: '1px 5px' }}>{r.priority}优先</span>}
                    {r.latency_ms > 0 && <span style={{ fontSize: 10, color: '#9ca3af' }}>{r.latency_ms}ms</span>}
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f3f4f6' }}>
                      {r.input && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 3 }}>输入内容</div>
                          <div style={{ ...S.codeBox, fontSize: 11, maxHeight: 100 }}>{r.input}</div>
                        </div>
                      )}
                      {r.expected_output && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 3 }}>预期输出</div>
                          <div style={{ ...S.codeBox, fontSize: 11, maxHeight: 100 }}>{r.expected_output}</div>
                        </div>
                      )}
                      {r.actual_output && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>实际输出（大模型真实响应）</div>
                            <span style={{ fontSize: 11, color: '#9ca3af', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => copyText(r.actual_output)}>复制</span>
                          </div>
                          <div style={{ ...S.codeBox, fontSize: 11, maxHeight: 160 }}>{r.actual_output}</div>
                        </div>
                      )}
                      {!r.passed && r.failure_reason && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#b91c1c', marginBottom: 3 }}>失败原因</div>
                          <div style={{ fontSize: 11, color: '#374151', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: 8 }}>{r.failure_reason}</div>
                        </div>
                      )}
                      {r.scores && Object.keys(r.scores).length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>维度得分</div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {Object.entries(r.scores).map(([dim, s]) => (
                              <span key={dim} style={{ fontSize: 11, padding: '2px 8px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 3 }}>{dim} {s}/5</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
        }
      </div>
    );
  };

  const renderOptimizationTab = () => {
    const suggestions = results.optimization_suggestions || [];
    const priorityOrder = { '高': 0, 'high': 0, '中': 1, 'medium': 1, '低': 2, 'low': 2 };
    const sorted = [...suggestions].sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9));

    if (sorted.length === 0) {
      return (
        <div>
          <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: 40 }}>暂无优化建议</div>
          <Button disabled style={{ width: '100%', height: 40, borderRadius: 4, fontWeight: 700 }}>一键优化</Button>
        </div>
      );
    }

    return (
      <div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
          共 <strong style={{ color: '#111827' }}>{sorted.length}</strong> 条优化建议，按优先级排序
        </div>
        {sorted.map((s, i) => {
          const priorityCn = { 'high': '高', 'medium': '中', 'low': '低' }[s.priority] || s.priority;
          const isHigh = s.priority === 'high' || s.priority === '高';
          const isMid  = s.priority === 'medium' || s.priority === '中';
          const badge  = isHigh ? { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' }
                       : isMid  ? { bg: '#fff7ed', color: '#92400e', border: '#fed7aa' }
                       :          { bg: '#f9fafb', color: '#6b7280', border: '#e5e7eb' };
          const txt = `【${s.dimension}】问题：${s.issue}\n建议：${s.suggestion}${s.expected_impact ? `\n预期提升：${s.expected_impact}` : ''}`;
          return (
            <div key={i} style={{ ...S.card, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', border: `1px solid ${badge.border}`, borderRadius: 3, background: badge.bg, color: badge.color }}>{priorityCn}优先</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{s.dimension}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#9ca3af', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => copyText(txt)}>复制</span>
              </div>
              {s.issue      && <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}><span style={{ fontWeight: 600 }}>问题描述：</span>{s.issue}</div>}
              {s.suggestion && <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}><span style={{ fontWeight: 600 }}>优化方案：</span>{s.suggestion}</div>}
              {s.expected_impact && <div style={{ fontSize: 11, color: '#9ca3af' }}>预期提升：{s.expected_impact}</div>}
            </div>
          );
        })}
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16, marginTop: 8 }}>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 10, textAlign: 'center' }}>点击后将根据优化建议自动改写 SKILL.md，并保存为新版本</div>
          <Button
            style={{ width: '100%', height: 42, borderRadius: 4, fontWeight: 700, fontSize: 14, background: '#111827', borderColor: '#111827', color: '#fff' }}
            loading={optimizing}
            onClick={handleOptimize}
          >
            {optimizing ? '优化中...' : '一键优化'}
          </Button>
        </div>
      </div>
    );
  };

  const rightPanelContent = (
    <div style={{ padding: 24, height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      {!results && !evaluating && emptyState}
      {evaluating && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80%', gap: 16 }}>
          <Spin size="large" />
          <div style={{ fontSize: 14, color: '#374151', fontWeight: 600 }}>测试执行中...</div>
          <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', maxWidth: 320 }}>
            第一阶段：用大模型基于 SKILL.md 逐条执行测试用例<br />
            第二阶段：Judge 模型对实际输出评分并生成分析报告
          </div>
        </div>
      )}
      {results && !evaluating && (
        <Tabs
          activeKey={resultsTab}
          onChange={(k) => set({ resultsTab: k })}
          tabBarStyle={{ borderBottom: '1px solid #e5e7eb', marginBottom: 20 }}
          items={[
            {
              key: 'evaluation',
              label: '技能评估',
              children: renderEvaluationTab()
            },
            {
              key: 'test-results',
              label: `测试结果（${results.summary?.total_tests ?? 0}条）`,
              children: renderTestResultsTab()
            },
            {
              key: 'optimization',
              label: '优化方案',
              children: renderOptimizationTab()
            },
            {
              key: 'history',
              label: '评估历史',
              children: selectedSkill ? (
                <HistoryPanel skillId={selectedSkill.id} skillName={selectedSkill.name} />
              ) : null
            }
          ]}
        />
      )}
    </div>
  );

  // ── EXPANDED MODE: side-by-side SKILL.md + test cases | results ──────────
  if (expanded) {
    return (
      <Layout style={{ height: '100%', background: '#f9fafb' }}>
        {/* Left: config form + SKILL.md detail + test cases textarea */}
        <Sider width="50%" style={{ background: '#fff', borderRight: '1px solid #e5e7eb', overflow: 'auto', height: '100%' }}>
          <div style={{ padding: 20, boxSizing: 'border-box' }}>
            {/* Config row (compact) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>评估配置</span>
              <Button size="small" style={{ fontSize: 11, borderColor: '#d1d5db', color: '#374151' }} onClick={() => set({ expanded: false })}>收起</Button>
            </div>

            {/* Compact selectors row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div>
                <span style={{ ...S.label, marginBottom: 4 }}>大模型</span>
                <Select size="small" style={{ width: '100%' }} placeholder="选择模型" value={selectedModelId} onChange={(v) => set({ selectedModelId: v })}>
                  {modelConfigs.map((m) => <Option key={m.id} value={m.id}>{m.displayName || `${m.provider}/${m.model}`}</Option>)}
                </Select>
              </div>
              <div>
                <span style={{ ...S.label, marginBottom: 4 }}>技能</span>
                <Select size="small" style={{ width: '100%' }} placeholder="选择技能" value={selectedSkillId} onChange={handleSkillChange}>
                  {skills.map((s) => <Option key={s.id} value={s.id}>{s.name}</Option>)}
                </Select>
              </div>
              <div>
                <span style={{ ...S.label, marginBottom: 4 }}>版本</span>
                <Select size="small" style={{ width: '100%' }} placeholder="选择版本" value={selectedVersionIndex} onChange={handleVersionChange} disabled={!selectedSkill}>
                  {versions.map((v, i) => <Option key={i} value={i}>{v.description || `版本 ${i + 1}`}</Option>)}
                </Select>
              </div>
            </div>

            <div style={S.divider} />

            {/* SKILL.md full view */}
            {skillContent && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ ...S.label, marginBottom: 0 }}>SKILL.md</span>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>{skillContent.length} 字符</span>
                </div>
                <div style={{ ...S.codeBox, maxHeight: 'calc(50vh - 160px)', minHeight: 120 }}>{skillContent}</div>
              </div>
            )}

            <div style={S.divider} />

            {/* Test cases full view */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ ...S.label, marginBottom: 0 }}>测试用例（JSON）</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Upload accept=".json" showUploadList={false} beforeUpload={handleFileUpload}>
                    <Button size="small" style={{ fontSize: 11, borderColor: '#d1d5db', color: '#374151' }}>上传</Button>
                  </Upload>
                  <Button size="small" style={{ fontSize: 11, borderColor: '#d1d5db', color: '#374151' }} onClick={handleGenerateTestCases} loading={generating} disabled={!skillContent}>
                    {generating ? '生成中' : '智能生成'}
                  </Button>
                </div>
              </div>
              <textarea
                rows={12}
                placeholder={'[\n  {\n    "id": "1",\n    "name": "用例名称",\n    "input": "...",\n    "expected_output": "..."\n  }\n]'}
                value={testCasesJson}
                onChange={handleJsonChange}
                style={{
                  width: '100%', fontFamily: 'monospace', fontSize: 11, padding: 8, resize: 'vertical',
                  border: testCasesError ? '1px solid #ef4444' : '1px solid #e5e7eb',
                  borderRadius: 4, color: '#374151', background: '#f9fafb', boxSizing: 'border-box', outline: 'none',
                  maxHeight: 'calc(50vh - 100px)',
                }}
              />
              {testCasesError && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>{testCasesError}</div>}
            </div>

            <Button
              style={{
                width: '100%', height: 40, borderRadius: 4, fontWeight: 700, fontSize: 14,
                background: isReady ? '#111827' : '#e5e7eb',
                borderColor: isReady ? '#111827' : '#e5e7eb',
                color: isReady ? '#fff' : '#9ca3af',
              }}
              disabled={!isReady}
              loading={evaluating}
              onClick={handleEvaluate}
            >
              {evaluating ? '测试中...' : '测试'}
            </Button>
          </div>
        </Sider>

        {/* Right: results */}
        <Content style={{ overflow: 'auto', height: '100%', background: '#f9fafb' }}>
          {rightPanelContent}
        </Content>
      </Layout>
    );
  }

  // ── NORMAL MODE: 380px left sidebar + content ─────────────────────────────
  return (
    <Layout style={{ height: '100%', background: '#f9fafb' }}>
      <Sider width={380} style={{ background: '#fff', borderRight: '1px solid #e5e7eb', overflow: 'auto', height: '100%' }}>
        {leftFormContent(false)}
      </Sider>
      <Content style={{ overflow: 'auto', height: '100%', background: '#f9fafb' }}>
        {rightPanelContent}
      </Content>
    </Layout>
  );
}
