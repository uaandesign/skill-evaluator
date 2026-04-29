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

// 综合评估等级规则:
// 通过: 总分 >= 90 且所有维度 >= 70分（百分制）
// 警告: 总分 80-89，或任一维度 < 70分
// 未通过: 总分 < 80
function computeEvalGrade(score, dimensionalScores) {
  if (score == null) return '—';
  if (score < 80) return '未通过';

  // 统计各维度是否均达到其满分的 70%
  const dimEntries = dimensionalScores ? Object.entries(dimensionalScores) : [];
  if (dimEntries.length > 0) {
    const hasMax = dimEntries.some(([, e]) => typeof e === 'object' && e?.max != null && e.max > 0);
    const rawScores = dimEntries.map(([, e]) => (typeof e === 'object' ? (e?.score ?? 0) : (e ?? 0)));
    const maxRaw = Math.max(...rawScores, 0);
    const isHundredScale = hasMax || maxRaw > 5;
    const allDimsPass = dimEntries.every(([, e]) => {
      const s = typeof e === 'object' ? (e?.score ?? 0) : (e ?? 0);
      const m = typeof e === 'object' ? (e?.max   ?? null) : null;
      // 有满分字段则用实际得分/满分，否则按分制推断百分比
      const pct = m != null && m > 0 ? (s / m * 100) : isHundredScale ? s : s * 20;
      return pct >= 70;
    });
    if (score >= 90 && allDimsPass) return '通过';
    return '警告';
  }
  // 无维度信息
  return score >= 90 ? '通过' : '警告';
}

// ── 辅助：判断一个标准是否属于"火山评估"分类 ──────────────────────────────
// 用于把多个评估标准的结果拆到 通用评估 vs 火山评估 两个独立分区
function isVolcanoStandard(standardKey) {
  if (!standardKey) return false;
  const k = standardKey.toLowerCase();
  return k.includes('volcano') || k.includes('火山') || k.startsWith('ved-') || k === 'volcano-uploaded';
}

// ── 辅助：把新 /api/evaluate 的响应转成兼容旧渲染器的 shape ──────────────
// 新格式: { fingerprint, duration_ms, results: [{standard, report, error?}] }
//   - report = { score, grade, generic_assessment|volcano_assessment, category_scores, checks }
//   - report.category_scores[k] = { earned, available, display_name_zh, description_zh, ... }
//
// 旧渲染器期望:
//   { summary, dimensional_scores: {中文名:{...}}, volcano_dimensional_scores: {中文名:{...}} }
//
// 策略：
//   1) 综合分 = 各标准 score 的算术平均
//   2) 通用类标准（skill-evaluator 等）→ dimensional_scores（中文 key）
//   3) 火山类标准（ved-/volcano-）→ volcano_dimensional_scores（中文 key）
//   4) 维度卡片直接用中文 display_name_zh，不再显示 standard_key 前缀
function transformPyEvalResults(evalData, selectedModel) {
  const results = evalData?.results || [];
  if (results.length === 0) {
    return { summary: { overall_score: null, grade: '—', tag: '—' }, dimensional_scores: {}, py_results: [] };
  }

  // 过滤掉执行失败的
  const successResults = results.filter((r) => r.report && !r.error);
  if (successResults.length === 0) {
    return {
      summary: { overall_score: null, grade: '—', tag: '执行失败' },
      dimensional_scores: {},
      py_results: results,
      errors: results.map((r) => `${r.standard?.standard_key}: ${r.error}`).filter(Boolean),
    };
  }

  // 综合分 = 各标准 score 的简单算术平均
  const overall = Math.round(
    successResults.reduce((sum, r) => sum + (r.report.score || 0), 0) / successResults.length
  );

  // tag: 任一标准为"不通过" → 整体不通过；否则任一"警告" → 警告；都通过 → 通过
  const tags = successResults.map(
    (r) => r.report.generic_assessment?.tag || r.report.volcano_assessment?.tag || '—'
  );
  const overallTag = tags.includes('不通过') ? '不通过' : tags.includes('警告') ? '警告' : '通过';

  // 拆桶：通用评估 vs 火山评估
  const dimensional_scores = {};
  const volcano_dimensional_scores = {};
  for (const r of successResults) {
    const isVolcano = isVolcanoStandard(r.standard.standard_key);
    const targetBucket = isVolcano ? volcano_dimensional_scores : dimensional_scores;
    const cats = r.report.category_scores || {};
    for (const [catKey, catData] of Object.entries(cats)) {
      // 中文名作为 key（让 UI 卡片标题和雷达图标签直接显示中文）
      // 如果重名（极少见），后缀加标准 key 避免覆盖
      let dimKey = catData.display_name_zh || catKey;
      if (targetBucket[dimKey]) dimKey = `${dimKey}（${r.standard.standard_key}）`;
      targetBucket[dimKey] = {
        score: catData.earned ?? 0,
        max:   catData.available ?? 0,
        eng_name: catKey,                // 英文 key 作为副标题展示
        display_name: catData.display_name_zh || catKey,
        description: catData.description_zh || '',
        passed_checks: catData.passed_checks ?? 0,
        failed_checks: catData.failed_checks ?? 0,
        total_checks:  catData.total_checks ?? 0,
        standard_key:  r.standard.standard_key,
        standard_display_name: r.standard.display_name,
      };
    }
  }

  // 火山如果空表示用户没上传火山标准 → UI 会显示"未获取标准"提示
  const hasVolcano = Object.keys(volcano_dimensional_scores).length > 0;

  // 单独算 通用 / 火山 各自的总分（供中间进度条展示）
  const genericReports  = successResults.filter((r) => !isVolcanoStandard(r.standard.standard_key));
  const volcanoReports  = successResults.filter((r) =>  isVolcanoStandard(r.standard.standard_key));
  const genericScore = genericReports.length > 0
    ? Math.round(genericReports.reduce((s, r) => s + (r.report.score || 0), 0) / genericReports.length)
    : null;
  const volcanoScore = volcanoReports.length > 0
    ? Math.round(volcanoReports.reduce((s, r) => s + (r.report.score || 0), 0) / volcanoReports.length)
    : null;

  return {
    summary: {
      overall_score: overall,
      grade: successResults[0].report.grade || '—',
      tag:   overallTag,
      generic_score: genericScore,
      volcano_score: volcanoScore,
    },
    dimensional_scores,
    volcano_dimensional_scores: hasVolcano ? volcano_dimensional_scores : null,
    volcano_skipped: !hasVolcano,
    evaluation_source: 'script',
    fingerprint: evalData.fingerprint,
    duration_ms: evalData.duration_ms,
    // 保留新格式原始数据
    py_results: successResults,
    optimization_suggestions: [],
    weakness_analysis: collectFailedChecks(successResults),
    model_displayname: selectedModel?.displayName || '—',
  };
}

/**
 * 把 store 里的 evalStandards 转成后端 /api/evaluate 接受的 inline_standards 格式
 * evalStandards.{generic|specialized|volcano} 形如：
 *   { name, base64, isCompressed: true }    // zip
 *   { name, content, isCompressed: false }  // .md/.txt
 * 后端只支持 zip（需要 SKILL.md + 脚本），文本类目前忽略并提示
 */
function buildInlineStandards(evalStandards) {
  if (!evalStandards) return [];
  const result = [];
  for (const [role, std] of Object.entries(evalStandards)) {
    if (!std) continue;
    if (std.isCompressed && std.base64) {
      result.push({
        standard_key: `${role}-uploaded`,
        base64: std.base64,
      });
    }
    // 非 zip（纯文本）暂不支持，跳过（用户已上传 zip 时正常工作）
  }
  return result;
}

// 把所有 standard 的 failed checks 汇总成 weakness_analysis
function collectFailedChecks(successResults) {
  const failed = [];
  for (const r of successResults) {
    const checks = r.report.checks || [];
    for (const c of checks) {
      if (c.passed === false || c.passed === 0) {
        failed.push({
          standard: r.standard.display_name || r.standard.standard_key,
          category: c.category_name_zh || c.category || '',
          title: c.title_zh || c.id || '未知检查',
          message: c.result_message_zh || c.evidence || '',
        });
      }
    }
  }
  return { failed_checks: failed };
}

const S = {
  divider:    { borderTop: '1px solid #e5e7eb', margin: '14px 0' },
  label:      { fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' },
  metaLine:   { fontSize: 11, color: '#9ca3af', marginTop: 4 },
  btnOutline: { width: '100%', borderRadius: 4, fontWeight: 500, fontSize: 13, borderColor: '#374151', color: '#374151', marginBottom: 8 },
  card:       { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: 16, marginBottom: 12 },
  codeBox:    { background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 4, padding: 10, fontSize: 12, fontFamily: 'monospace', color: '#374151', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowY: 'auto' },
};

// ── 辅助：等级字母 ─────────────────────────────────────────────────────────────
const scoreToLetter = (score) => {
  if (score == null) return '—';
  if (score >= 95) return 'S';
  if (score >= 90) return 'A';
  if (score >= 80) return 'B+';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  return 'D';
};

// ── 辅助：维度名称英文映射 ────────────────────────────────────────────────────
const DIM_ENGLISH = {
  '有用性': 'USEFULNESS', '稳定性': 'STABILITY', '准确性': 'ACCURACY',
  '安全性': 'SAFETY', '元数据与触发能力': 'METADATA', '上下文理解': 'CONTEXT',
  '响应质量': 'QUALITY', '指令遵从': 'INSTRUCTION', '格式规范': 'FORMAT',
  '命名结构': 'NAMING', 'naming_required_rules': 'NAMING',
  'skill_frontmatter': 'FRONTMATTER', 'directory_structure': 'STRUCTURE',
};

// ── 辅助：SVG 雷达图 ──────────────────────────────────────────────────────────
const RadarChart = ({ dimensions, size = 140 }) => {
  const n = dimensions.length;
  if (n < 3) return null;
  const cx = size / 2, cy = size / 2, r = size * 0.38;
  const angleFor = (i) => -Math.PI / 2 + (i / n) * 2 * Math.PI;
  const ptStr = (pts) => pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const axisPoints = Array.from({ length: n }, (_, i) => {
    const a = angleFor(i); return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
  const dataPoints = dimensions.map((d, i) => {
    const pct = Math.min((d.pct ?? 0) / 100, 1);
    const a = angleFor(i); return [cx + r * pct * Math.cos(a), cy + r * pct * Math.sin(a)];
  });
  const rings = [0.25, 0.5, 0.75, 1.0];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', flexShrink: 0 }}>
      {rings.map((frac) => {
        const pts = Array.from({ length: n }, (_, i) => {
          const a = angleFor(i); return [cx + r * frac * Math.cos(a), cy + r * frac * Math.sin(a)];
        });
        return <polygon key={frac} points={ptStr(pts)} fill="none" stroke="#e5e7eb" strokeWidth={0.8} />;
      })}
      {axisPoints.map(([x, y], i) => (
        <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#e5e7eb" strokeWidth={0.8} />
      ))}
      <polygon points={ptStr(dataPoints)} fill="rgba(17,24,39,0.10)" stroke="#111827" strokeWidth={1.5} />
      {dataPoints.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2.5} fill="#111827" />
      ))}
    </svg>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
export default function SkillEvaluatorModule() {
  const {
    modelConfigs, skills, saveSkillVersion, updateSkill,
    skillEvalState, setSkillEvalState,
    evalStandards, setEvalStandard, clearEvalStandard,
    evalModelId, setActiveTab,
    judgeEnabled,
  } = useStore();

  // All UI state lives in Zustand so it survives tab switches
  const {
    selectedSkillId, selectedVersionIndex,
    testCasesJson, testCasesError, results, resultsTab, expanded,
    expandedRows, filterStatus, filterType, filterPriority,
  } = skillEvalState;

  const set = (updates) => setSkillEvalState(updates);

  // Transient loading state — OK to be local (no need to survive navigation)
  const [generating, setGenerating] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [viewingStandard, setViewingStandard] = useState(null); // { title, content }

  // Eval standards shortcuts
  const genericStd     = evalStandards?.generic     || null;
  const specializedStd = evalStandards?.specialized || null;
  const volcanoStd     = evalStandards?.volcano     || null;

  /** 内联上传处理：同时支持文本文件和压缩包 */
  const handleInlineStandardUpload = (type, label, file) => {
    const isCompressed = /\.(zip|gz|tgz)$/i.test(file.name);
    if (isCompressed) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const arr = new Uint8Array(e.target.result);
        let binary = '';
        for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
        const base64 = btoa(binary);
        setEvalStandard(type, { name: file.name, content: null, base64, isCompressed: true, size: file.size, uploadedAt: Date.now() });
        message.success(`已上传${label}（压缩包）: ${file.name}`);
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        setEvalStandard(type, { name: file.name, content: e.target.result, isCompressed: false, size: file.size, uploadedAt: Date.now() });
        message.success(`已上传${label}: ${file.name}`);
      };
      reader.readAsText(file);
    }
    return false;
  };

  // Derived
  const selectedSkill   = skills.find((s) => s.id === selectedSkillId) || null;
  const versions        = selectedSkill?.versions || [];
  const skillContent    = (selectedVersionIndex !== null && versions[selectedVersionIndex])
    ? versions[selectedVersionIndex].content : '';
  // 评估模型从全局 evalModelId 获取（在配置中心-评估标准 Tab 中配置）
  // MVP 一期：评估走 Python 静态规则，不依赖大模型；模型仅用于"优化建议"
  const selectedModel   = modelConfigs.find((m) => m.id === evalModelId) || null;
  // 测试用例评估默认禁用（一期），仅在 judgeEnabled=true 或显式提供测试用例时需要
  // MVP 一期 testcase 功能关闭：默认 false
  const testcaseFeaturesEnabled = false; // TODO: 接 app_settings.testcase_features_enabled
  const requiresLLM    = judgeEnabled === true || testcaseFeaturesEnabled;
  const isReady         = !!selectedSkillId
    && selectedVersionIndex !== null
    && (!requiresLLM || !!evalModelId);

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
    if (!isReady) {
      message.warning(requiresLLM ? '请配置评估模型' : '请选择技能和版本');
      return;
    }

    setEvaluating(true);
    set({ results: null, expandedRows: {}, resultsTab: 'evaluation' });

    try {
      // ─── MVP 一期：纯 Python 静态评估（/api/evaluate）─────────────────
      // 直接传 skill_content（前端 skill 大部分是本地 ID 不是 UUID，无法走 DB 查询）
      // 同时把 localStorage 里上传的评估标准（旧 UI）作为 inline_standards 传过去
      const inlineStandards = buildInlineStandards(evalStandards);

      const evalRes = await fetch('/api/evaluate?save=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skill_content: skillContent,
          skill_name:    selectedSkill?.name || 'skill',
          // 仅当 selectedSkillId 是合法 UUID 时后端才会把它入到 evaluation_results.skill_id
          // 否则后端自动置 null，不影响评估流程
          skill_id:      selectedSkillId,
          skill_version: versions[selectedVersionIndex]?.description || `v${selectedVersionIndex + 1}`,
          // 用户上传的标准（zip → base64）。空数组时后端回退到 DB 内置标准
          inline_standards: inlineStandards,
        }),
      });

      const evalData = await evalRes.json();
      if (evalData.error) {
        message.error(evalData.error + (evalData.details ? `（${evalData.details}）` : ''));
        return;
      }

      // ─── 把 /api/evaluate 的多标准结果转成兼容旧渲染的 shape ─────────
      const transformed = transformPyEvalResults(evalData, selectedModel);
      set({ results: transformed, resultsTab: 'evaluation' });
      message.success('评估完成');

      const data = transformed;
      // 复用原有等级回写到技能卡片的逻辑
      {

        // 把最新评估等级写回技能对象，供技能库卡片展示
        const evalGrade = computeEvalGrade(data.summary?.overall_score, data.dimensional_scores);
        if (selectedSkillId && updateSkill) {
          updateSkill(selectedSkillId, {
            latestEvalGrade: evalGrade,
            latestEvalScore: data.summary?.overall_score ?? null,
            latestEvalAt: Date.now(),
            latestEvalVersionIndex: selectedVersionIndex,
          });
        }

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

            // 同步 SKILL.md frontmatter 中的 name 字段到技能库卡片
            const fmMatch = data.optimized_content.match(/^---[\s\S]*?^name:\s*(.+?)$/m);
            if (fmMatch) {
              const newName = fmMatch[1].trim().replace(/^["']|["']$/g, '');
              if (newName && newName !== selectedSkill?.name) {
                updateSkill(selectedSkillId, { name: newName });
              }
            }

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

      {/* 评估模型提示（仅作为可选项；评估走 Python 静态规则不依赖模型）*/}
      {selectedModel ? (
        <div style={{ marginBottom: 14, padding: '8px 10px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontWeight: 600, color: '#111827' }}>优化建议模型</span>
            <span style={{ color: '#6b7280', marginLeft: 8 }}>{selectedModel.displayName || `${selectedModel.provider}/${selectedModel.model}`}</span>
          </div>
          <Button size="small" type="link" style={{ fontSize: 11, padding: 0, color: '#374151' }} onClick={() => setActiveTab('config-center')}>
            修改 →
          </Button>
        </div>
      ) : (
        <div style={{ marginBottom: 14, padding: '8px 10px', background: '#fafafa', border: '1px dashed #d1d5db', borderRadius: 6, fontSize: 12, color: '#6b7280', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>评估不依赖大模型 · 配置后可解锁优化建议</span>
          <Button size="small" type="link" style={{ fontSize: 11, padding: 0, color: '#374151' }} onClick={() => setActiveTab('config-center')}>
            前往配置 →
          </Button>
        </div>
      )}

      <div style={S.divider} />

      {/* 1. 选择技能 */}
      <div style={{ marginBottom: 14 }}>
        <span style={S.label}>1. 选择技能</span>
        {skills.length === 0 ? (
          <div style={{ fontSize: 12, color: '#9ca3af' }}>技能库为空，请前往「技能库」添加技能</div>
        ) : (
          <Select style={{ width: '100%' }} placeholder="选择技能" value={selectedSkillId} onChange={handleSkillChange}>
            {skills.map((s) => <Option key={s.id} value={s.id}>{s.name}</Option>)}
          </Select>
        )}
      </div>

      <div style={S.divider} />

      {/* 2. 选择技能版本 + SKILL.md preview */}
      <div style={{ marginBottom: 14 }}>
        <span style={S.label}>2. 选择技能版本</span>
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

      {/* 3. 测试用例 JSON */}
      <div style={{ marginBottom: 14 }}>
        <span style={S.label}>3. 测试用例（JSON）</span>
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
                border: testCasesError ? '1px solid #374151' : '1px solid #e5e7eb',
                borderRadius: 4, color: '#374151', background: '#f9fafb', boxSizing: 'border-box', outline: 'none',
              }}
            />
            {testCasesError && <div style={{ fontSize: 11, color: '#374151', marginTop: 3 }}>{testCasesError}</div>}
          </>
        )}
      </div>

      <div style={S.divider} />

      {/* 4. 评估标准 Skill（黑白UI，无 icon） */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={S.label}>4. 评估标准 Skill</span>
          <Button
            size="small"
            type="link"
            style={{ fontSize: 11, padding: 0, height: 'auto', color: '#374151' }}
            onClick={() => setActiveTab('config-center')}
          >
            配置中心管理 →
          </Button>
        </div>

        {/* 专项评估规则暂时隐藏，一期不做 */}
        {[
          { type: 'generic',  label: '通用评估规则', std: genericStd  },
          { type: 'volcano',  label: '火山合规规则', std: volcanoStd  },
        ].map(({ type, label, std }) => (
          <div
            key={type}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 6, padding: '6px 10px', background: '#f9fafb', borderRadius: 6,
              border: '1px solid #e5e7eb',
              borderLeft: std ? '3px solid #111827' : '3px solid #d1d5db',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: std ? '#111827' : '#9ca3af' }}>{label}</span>
              {std ? (
                <div style={{ fontSize: 11, color: '#374151', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {std.name}
                  {std.isCompressed && <span style={{ marginLeft: 5, fontSize: 10, border: '1px solid #e5e7eb', borderRadius: 3, padding: '0 4px', color: '#6b7280' }}>压缩包</span>}
                  {!std.isCompressed && std.content && (
                    <span
                      style={{ marginLeft: 6, color: '#6b7280', cursor: 'pointer', textDecoration: 'underline' }}
                      onClick={() => setViewingStandard({ title: label, content: std.content })}
                    >查看</span>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>使用内置规则</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 8 }}>
              <Upload
                accept=".md,.txt,.markdown,.zip,.gz,.tgz"
                showUploadList={false}
                beforeUpload={(f) => handleInlineStandardUpload(type, label, f)}
              >
                <Button size="small" style={{ fontSize: 11, height: 22, padding: '0 6px' }}>上传</Button>
              </Upload>
              {std && (
                <Button size="small" danger style={{ fontSize: 11, height: 22, padding: '0 6px' }}
                  onClick={() => { clearEvalStandard(type); message.info(`已清除「${label}」`); }}>
                  清除
                </Button>
              )}
            </div>
          </div>
        ))}

        {/* 查看内容 Modal */}
        <Modal
          title={viewingStandard?.title}
          open={!!viewingStandard}
          onCancel={() => setViewingStandard(null)}
          footer={<Button onClick={() => setViewingStandard(null)}>关闭</Button>}
          width={680}
          styles={{ body: { maxHeight: '60vh', overflowY: 'auto', padding: 0 } }}
        >
          {viewingStandard && (
            <pre style={{ margin: 0, padding: '16px 20px', fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#f9fafb', color: '#374151', lineHeight: 1.7 }}>
              {viewingStandard.content}
            </pre>
          )}
        </Modal>
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
      {!isReady && (
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6, textAlign: 'center' }}>
          {!selectedSkillId
            ? '请先选择技能'
            : selectedVersionIndex === null
            ? '请选择技能版本'
            : requiresLLM && !evalModelId
            ? '当前已启用 Judge / 测试用例评估，需在「配置中心 → 评估标准」配置评估模型'
            : '请完成以上所有配置项'}
        </div>
      )}
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

    // ── 综合等级计算 ─────────────────────────────────────────────────────────
    const grade = summary?.overall_score != null
      ? computeEvalGrade(summary.overall_score, dimensional_scores) : '—';
    const gradeColor = grade === '通过' ? '#111827' : grade === '警告' ? '#6b7280'
      : grade === '未通过' ? '#374151' : '#9ca3af';
    const letter = scoreToLetter(summary?.overall_score);

    // ── 构建雷达图用的维度数组 ───────────────────────────────────────────────
    const buildDimList = (scores) => {
      if (!scores) return [];
      const entries = Object.entries(scores);
      const hasMax = entries.some(([, e]) => typeof e === 'object' && e?.max != null && e.max > 0);
      const rawMax = Math.max(...entries.map(([, e]) => typeof e === 'object' ? (e?.score ?? 0) : (e ?? 0)), 0);
      const isHundred = hasMax || rawMax > 5;
      return entries.map(([name, entry]) => {
        const score = typeof entry === 'object' ? (entry?.score ?? 0) : (entry ?? 0);
        const max   = typeof entry === 'object' ? (entry?.max   ?? null) : null;
        const pct   = max != null && max > 0 ? Math.round(score / max * 100)
          : isHundred ? score : score * 20;
        return { name, score, max, pct };
      });
    };
    const dimList     = buildDimList(dimensional_scores);
    const volcDimList = buildDimList(results.volcano_dimensional_scores);

    return (
      <div>
        {/* Judge 跳过警告：仅当 Judge 已开启但调用失败时展示；主动关闭时不展示 */}
        {results.judge_skipped && judgeEnabled && (
          <Alert
            type="warning"
            message="⚠️ Judge 模型调用失败"
            description={`Judge 模型连接失败，本次评估仅基于执行结果生成。评分为估计值，不代表完整评估。原因：${results.judge_skip_reason || '未知'}`}
            showIcon={false}
            style={{ marginBottom: 16, padding: '12px 14px', fontSize: 12 }}
          />
        )}

        {/* 顶部操作栏 */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 0', marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {results.evaluation_mode === 'real' && (
              <>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#111827' }} />
                <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>
                  {results.evaluation_source === 'script' ? '脚本评估' : '执行评估'} · {selectedModel?.displayName || '配置模型'}
                </span>
              </>
            )}
          </div>
          <Button size="small" style={{ fontSize: 11, borderColor: '#d1d5db', color: '#374151' }}
            loading={exporting} onClick={handleExportReport}>
            {exporting ? '导出中...' : '📥 导出报告'}
          </Button>
        </div>

        {/* ═══════════════════════ 综合评分卡 (Image 1) ═══════════════════════ */}
        <div style={{
          background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
          padding: 20, marginBottom: 20, display: 'flex', gap: 20, alignItems: 'flex-start',
        }}>
          {/* 左：大分数 + 等级 */}
          <div style={{ flex: '0 0 auto', minWidth: 110, textAlign: 'center' }}>
            <div style={{ fontSize: 68, fontWeight: 800, color: '#111827', lineHeight: 1, letterSpacing: '-2px' }}>
              {summary?.overall_score ?? '—'}
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, marginBottom: 8 }}>/ 100 分</div>
            {/* 等级徽章 */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 700,
              background: gradeColor + '18', color: gradeColor, border: `1px solid ${gradeColor}50`,
            }}>
              <span style={{ fontSize: 16, fontWeight: 800 }}>{letter}</span>
              <span style={{ fontSize: 11 }}>{grade}</span>
            </div>
            {/* 测试通过 */}
            <div style={{ marginTop: 10, fontSize: 11, color: '#6b7280' }}>
              {summary?.passed_tests ?? '—'} / {summary?.total_tests ?? '—'} 通过
              {summary?.pass_rate != null && (
                <span style={{ marginLeft: 4, fontWeight: 600, color: '#374151' }}>
                  ({Math.round(summary.pass_rate * 100)}%)
                </span>
              )}
            </div>
          </div>

          {/* 中：进度条 + 评分构成 */}
          <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
            {/* 综合得分进度条（带 60/75/90 标注） */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>综合得分</span>
                <span style={{
                  fontSize: 10, background: '#f3f4f6', padding: '1px 8px', borderRadius: 10,
                  color: '#374151', fontWeight: 600,
                }}>
                  {summary?.generic_score != null && summary?.volcano_score != null
                    ? '加权平均 · 通用×80% + 火山×20%' : '加权平均'}
                </span>
              </div>
              <div style={{ position: 'relative', height: 12, background: '#f3f4f6', borderRadius: 6 }}>
                <div style={{
                  position: 'absolute', left: 0, top: 0,
                  width: `${Math.min(summary?.overall_score ?? 0, 100)}%`,
                  height: '100%', borderRadius: 6,
                  background: (summary?.overall_score ?? 0) >= 90 ? '#111827'
                    : (summary?.overall_score ?? 0) >= 75 ? '#6b7280' : '#374151',
                  transition: 'width 0.8s ease',
                }} />
                {/* 阈值标记 */}
                {[60, 75, 90].map((t) => (
                  <div key={t} style={{
                    position: 'absolute', left: `${t}%`, top: -3, bottom: -3,
                    width: 2, background: '#374151', borderRadius: 1, zIndex: 2,
                  }}>
                    <div style={{
                      position: 'absolute', bottom: -18, left: '50%',
                      transform: 'translateX(-50%)', fontSize: 9, color: '#6b7280', whiteSpace: 'nowrap',
                    }}>{t}</div>
                  </div>
                ))}
              </div>
              <div style={{ height: 18 }} />{/* 为标记数字留空间 */}
            </div>

            {/* 评分构成分项 */}
            {(summary?.generic_score != null || summary?.volcano_score != null) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  summary?.generic_score != null && { label: '通用评估', score: summary.generic_score, weight: '80%', hint: '基于通用评估标准' },
                  summary?.volcano_score != null && { label: '火山评估', score: summary.volcano_score, weight: '20%', hint: '基于火山合规规则' },
                ].filter(Boolean).map((d) => (
                  <div key={d.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 11, color: '#6b7280' }}>
                        {d.label} <span style={{ fontSize: 10, color: '#9ca3af' }}>×{d.weight}</span>
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>
                        {d.score}/100
                        <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 400, marginLeft: 6 }}>({d.hint})</span>
                      </span>
                    </div>
                    <div style={{ height: 5, background: '#f3f4f6', borderRadius: 3 }}>
                      <div style={{
                        width: `${Math.min(d.score ?? 0, 100)}%`, height: '100%', borderRadius: 3,
                        background: (d.score ?? 0) >= 80 ? '#111827' : (d.score ?? 0) >= 60 ? '#6b7280' : '#374151',
                        transition: 'width 0.6s',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 右：雷达图 + 维度列表 */}
          {dimList.length >= 3 && (
            <div style={{ flex: '0 0 auto', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <RadarChart dimensions={dimList} size={120} />
              <div style={{ fontSize: 11, minWidth: 90 }}>
                {dimList.map((d, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#111827', flexShrink: 0 }} />
                    <span style={{ color: '#6b7280', flex: 1 }}>{d.name}</span>
                    <span style={{ fontWeight: 700, color: '#111827', marginLeft: 4 }}>
                      {d.score}{d.max != null ? `/${d.max}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ═══════════════════════ 通用评估维度 (Image 2) ═════════════════════ */}
        {dimensional_scores && Object.keys(dimensional_scores).length > 0 && (() => {
          const dimEntries = Object.entries(dimensional_scores);
          const hasMax = dimEntries.some(([, e]) => typeof e === 'object' && e?.max != null && e.max > 0);
          const rawScores = dimEntries.map(([, e]) => typeof e === 'object' ? (e?.score ?? 0) : (e ?? 0));
          const maxRaw = Math.max(...rawScores, 0);
          const isHundredScale = hasMax || maxRaw > 5;
          const totalEarned = hasMax ? dimEntries.reduce((s, [, e]) => s + (typeof e === 'object' ? (e?.score ?? 0) : (e ?? 0)), 0) : null;
          const totalMax    = hasMax ? dimEntries.reduce((s, [, e]) => s + (typeof e === 'object' ? (e?.max   ?? 0) : 0), 0) : null;
          const cols = Math.min(dimEntries.length, 4);

          return (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>通用评估维度</span>
                <span style={{ fontSize: 11, color: '#9ca3af' }}>
                  {hasMax ? `各维度由 eval skill 定义 · 共 ${dimEntries.length} 项` : `共 ${dimEntries.length} 项`}
                </span>
                {hasMax && totalMax > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginLeft: 4 }}>
                    合计 {totalEarned}/{totalMax}
                  </span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10 }}>
                {dimEntries.map(([dimKey, entry]) => {
                  const score   = typeof entry === 'object' ? (entry?.score   ?? null) : entry;
                  const dimMax  = typeof entry === 'object' ? (entry?.max     ?? null) : null;
                  const comment = typeof entry === 'object' ? (entry?.comment ?? null) : null;
                  const score100 = score == null ? null
                    : dimMax != null && dimMax > 0 ? Math.round(score / dimMax * 100)
                    : isHundredScale ? score : score * 20;
                  const passedThreshold = score100 != null && score100 >= 70;
                  // 优先用 transform 写入的 entry.eng_name（英文 category key）
                  // 兜底再走原有 DIM_ENGLISH 映射；中文名超长时不再生硬 slice
                  const engName = (typeof entry === 'object' && entry?.eng_name)
                    ? entry.eng_name.toUpperCase().slice(0, 24)
                    : (DIM_ENGLISH[dimKey] || dimKey.toUpperCase().replace(/\s+/g, '_').slice(0, 14));
                  const barColor = score100 == null ? '#d1d5db'
                    : passedThreshold ? '#111827' : score100 >= 50 ? '#6b7280' : '#374151';

                  return (
                    <div key={dimKey} style={{
                      background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16,
                      borderTop: `3px solid ${barColor}`,
                    }}>
                      {/* 大分数 */}
                      <div style={{ fontSize: 34, fontWeight: 800, color: '#111827', lineHeight: 1 }}>
                        {score ?? '—'}
                      </div>
                      <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 6 }}>
                        / {dimMax != null ? dimMax : isHundredScale ? 100 : 5} 分
                      </div>
                      {/* 英文副标题 */}
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.08em', marginBottom: 2 }}>
                        {engName}
                      </div>
                      {/* 中文名称 */}
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 10 }}>
                        {dimKey}
                      </div>
                      {/* 进度条 */}
                      <div style={{ height: 4, background: '#f3f4f6', borderRadius: 2, marginBottom: 8 }}>
                        <div style={{ width: `${score100 ?? 0}%`, height: '100%', borderRadius: 2, background: barColor, transition: 'width 0.6s' }} />
                      </div>
                      {/* 达标状态 */}
                      {score100 != null && (
                        <div style={{ fontSize: 10, fontWeight: 600, color: passedThreshold ? '#111827' : '#6b7280', marginBottom: comment ? 6 : 0 }}>
                          {passedThreshold ? `✓ 达标 (${score100}%)` : `△ 偏低 (${score100}%)`}
                        </div>
                      )}
                      {/* 评论说明（完整显示，不折叠） */}
                      {comment && (
                        <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.45, borderTop: '1px solid #f3f4f6', paddingTop: 6, marginTop: 4 }}>
                          {comment}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ═══════════════════════ 火山评估维度 (Image 2 同款样式) ════════════ */}
        {results.volcano_skipped ? (
          <div style={{ marginBottom: 20, padding: '12px 14px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, color: '#374151' }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>⚠️ 火山评估 - 未获取标准</div>
            <div>未上传火山规则 Skill，如需进行火山评估，请在左侧「4. 评估标准 Skill」中上传火山合规规则文件。</div>
          </div>
        ) : results.volcano_dimensional_scores && Object.keys(results.volcano_dimensional_scores).length > 0 ? (() => {
          const volcEntries = Object.entries(results.volcano_dimensional_scores);
          const volcHasMax = volcEntries.some(([, e]) => typeof e === 'object' && e?.max != null && e.max > 0);
          const volcRawScores = volcEntries.map(([, e]) => typeof e === 'object' ? (e?.score ?? 0) : (e ?? 0));
          const volcMaxRaw = Math.max(...volcRawScores, 0);
          const isVolcHundred = volcHasMax || volcMaxRaw > 5;
          const volcTotalEarned = volcHasMax ? volcEntries.reduce((s, [, e]) => s + (typeof e === 'object' ? (e?.score ?? 0) : (e ?? 0)), 0) : null;
          const volcTotalMax    = volcHasMax ? volcEntries.reduce((s, [, e]) => s + (typeof e === 'object' ? (e?.max ?? 0) : 0), 0) : null;
          const volcCols = Math.min(volcEntries.length, 4);

          return (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>火山评估</span>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>
                    {volcHasMax ? `各维度由 eval skill 定义 · 共 ${volcEntries.length} 项` : `共 ${volcEntries.length} 项`}
                  </span>
                  {volcHasMax && volcTotalMax > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>
                      合计 {volcTotalEarned}/{volcTotalMax}
                    </span>
                  )}
                  {results.volcano_score != null && (
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                      综合 {results.volcano_score}/100
                    </span>
                  )}
                </div>
                {results.volcano_compliance_summary && (
                  <Tag style={{ fontSize: 10, margin: 0 }}>{results.volcano_compliance_summary}</Tag>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${volcCols}, 1fr)`, gap: 10 }}>
                {volcEntries.map(([key, entry]) => {
                  const score   = typeof entry === 'object' ? (entry?.score   ?? null) : entry;
                  const dimMax  = typeof entry === 'object' ? (entry?.max     ?? null) : null;
                  const comment = typeof entry === 'object' ? (entry?.comment ?? null) : null;
                  const issues  = typeof entry === 'object' ? (entry?.issues  ?? null) : null;
                  const score100 = score == null ? null
                    : dimMax != null && dimMax > 0 ? Math.round(score / dimMax * 100)
                    : isVolcHundred ? score : score * 20;
                  const passed  = score100 != null && score100 >= 70;
                  const barColor = score100 == null ? '#d1d5db'
                    : passed ? '#111827' : score100 >= 50 ? '#6b7280' : '#374151';
                  const engName = DIM_ENGLISH[key] || key.toUpperCase().replace(/\s+/g, '_').slice(0, 14);
                  const tooltipText = issues?.length ? issues.join('; ') : comment || '';

                  return (
                    <Tooltip key={key} title={tooltipText} placement="top">
                      <div style={{
                        background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16,
                        borderTop: `3px solid ${barColor}`,
                        cursor: tooltipText ? 'help' : 'default',
                      }}>
                        <div style={{ fontSize: 34, fontWeight: 800, color: '#111827', lineHeight: 1 }}>
                          {score ?? '—'}
                        </div>
                        <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 6 }}>
                          / {dimMax != null ? dimMax : isVolcHundred ? 100 : 5} 分
                        </div>
                        <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.08em', marginBottom: 2 }}>
                          {engName}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 10 }}>{key}</div>
                        <div style={{ height: 4, background: '#f3f4f6', borderRadius: 2, marginBottom: 8 }}>
                          <div style={{ width: `${score100 ?? 0}%`, height: '100%', borderRadius: 2, background: barColor, transition: 'width 0.6s' }} />
                        </div>
                        {score100 != null && (
                          <div style={{ fontSize: 10, fontWeight: 600, color: passed ? '#111827' : '#6b7280', marginBottom: comment ? 6 : 0 }}>
                            {passed ? `✓ 达标 (${score100}%)` : `△ 偏低 (${score100}%)`}
                          </div>
                        )}
                        {comment && (
                          <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.45, borderTop: '1px solid #f3f4f6', paddingTop: 6, marginTop: 4 }}>
                            {comment}
                          </div>
                        )}
                        {/* 显示 issues（火山独有） */}
                        {issues?.length > 0 && (
                          <div style={{ marginTop: 6 }}>
                            {issues.map((iss, idx) => (
                              <div key={idx} style={{ fontSize: 10, color: '#374151', marginTop: 2 }}>· {iss}</div>
                            ))}
                          </div>
                        )}
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
                          background: fix.priority === '高' ? '#f9fafb' : fix.priority === '中' ? '#f9fafb' : '#f9fafb',
                          color: fix.priority === '高' ? '#374151' : fix.priority === '中' ? '#374151' : '#6b7280',
                          border: `1px solid ${fix.priority === '高' ? '#e5e7eb' : fix.priority === '中' ? '#e5e7eb' : '#e5e7eb'}`,
                        }}>{fix.priority}优先</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>{fix.dimension}</span>
                      </div>
                      {fix.issue && <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{fix.issue}</div>}
                      {fix.fix   && <div style={{ fontSize: 11, color: '#374151' }}>{fix.fix}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })() : null}

        {/* ═══════════════════════ 优化建议预览（前3条，完整列表在「优化方案」Tab） ══ */}
        {results.optimization_suggestions?.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>优化建议</span>
              <span style={{ fontSize: 11, color: '#6b7280' }}>
                共 {results.optimization_suggestions.length} 条 · <span
                  style={{ color: '#374151', textDecoration: 'underline', cursor: 'pointer' }}
                  onClick={() => set({ resultsTab: 'optimization' })}>查看全部 →</span>
              </span>
            </div>
            {results.optimization_suggestions.slice(0, 3).map((sug, i) => {
              const isHigh = sug.priority === 'high' || sug.priority === '高';
              const isMid  = sug.priority === 'medium' || sug.priority === '中';
              const badge  = isHigh ? { bg: '#f9fafb', color: '#374151', border: '#e5e7eb', label: 'High' }
                           : isMid  ? { bg: '#f9fafb', color: '#374151', border: '#e5e7eb', label: 'Med'  }
                           :          { bg: '#f9fafb', color: '#6b7280', border: '#e5e7eb', label: 'Low'  };
              return (
                <div key={i} style={{
                  background: '#fff', border: '1px solid #e5e7eb', borderRadius: 7,
                  padding: '10px 14px', marginBottom: 6,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: sug.issue ? 5 : 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', minWidth: 24 }}>
                      S-{i + 1}
                    </span>
                    {sug.dimension && (
                      <span style={{ fontSize: 10, padding: '1px 6px', background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 4, fontWeight: 600 }}>
                        {sug.dimension}
                      </span>
                    )}
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
                      {badge.label}
                    </span>
                    <span style={{ flex: 1, fontSize: 11, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sug.issue || sug.suggestion}
                    </span>
                    {sug.expected_impact && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', flexShrink: 0 }}>
                        +{sug.expected_impact}
                      </span>
                    )}
                  </div>
                  {sug.suggestion && sug.issue && (
                    <div style={{ fontSize: 11, color: '#6b7280', paddingLeft: 32, marginTop: 3, lineHeight: 1.4 }}>
                      {sug.suggestion}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ═══════════════════════ 弱点分析 ════════════════════════════════════ */}
        {weakness_analysis && Object.keys(weakness_analysis).length > 0 && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 10 }}>弱点分析</div>
            <div style={{ ...S.card, background: '#fafafa' }}>
              {weakness_analysis.lowest_dimension && (
                <div style={{ marginBottom: 8, fontSize: 12 }}>
                  <span style={{ fontWeight: 600, color: '#6b7280' }}>最低得分维度：</span>
                  <span style={{ color: '#111827', fontWeight: 600 }}>{weakness_analysis.lowest_dimension}</span>
                </div>
              )}
              {weakness_analysis.common_failures?.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 3 }}>常见失败模式</div>
                  {weakness_analysis.common_failures.map((f, i) => (
                    <div key={i} style={{ fontSize: 12, color: '#374151', paddingLeft: 10, marginTop: 2 }}>· {f}</div>
                  ))}
                </div>
              )}
              {weakness_analysis.systematic_issues?.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 3 }}>系统性问题</div>
                  {weakness_analysis.systematic_issues.map((issue, i) => (
                    <div key={i} style={{ fontSize: 12, color: '#374151', paddingLeft: 10, marginTop: 2 }}>· {issue}</div>
                  ))}
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
                      background: r.passed ? '#f3f4f6' : '#f9fafb',
                      color: r.passed ? '#111827' : '#374151',
                      border: `1px solid ${r.passed ? '#d1d5db' : '#e5e7eb'}`,
                    }}>{r.passed ? '通过' : '失败'}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#111827', flex: 1 }}>
                      {r.id ? `#${r.id} ` : ''}{r.name || '未命名用例'}
                    </span>
                    {r.test_type && <span style={{ fontSize: 10, color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 3, padding: '1px 5px' }}>{r.test_type}</span>}
                    {r.priority  && <span style={{ fontSize: 10, color: r.priority === '高' ? '#374151' : '#6b7280', border: '1px solid #e5e7eb', borderRadius: 3, padding: '1px 5px' }}>{r.priority}优先</span>}
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
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 3 }}>失败原因</div>
                          <div style={{ fontSize: 11, color: '#374151', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 4, padding: 8 }}>{r.failure_reason}</div>
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

    // 统计各优先级数量
    const highCnt = sorted.filter((s) => s.priority === 'high' || s.priority === '高').length;
    const midCnt  = sorted.filter((s) => s.priority === 'medium' || s.priority === '中').length;
    const lowCnt  = sorted.filter((s) => s.priority === 'low' || s.priority === '低').length;

    return (
      <div>
        {/* 统计头部 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>
            共 <strong style={{ color: '#111827' }}>{sorted.length}</strong> 条优化建议
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            {highCnt > 0 && <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: '#f9fafb', color: '#374151', border: '1px solid #e5e7eb', fontWeight: 700 }}>High ×{highCnt}</span>}
            {midCnt  > 0 && <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: '#f9fafb', color: '#374151', border: '1px solid #e5e7eb', fontWeight: 700 }}>Med ×{midCnt}</span>}
            {lowCnt  > 0 && <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: '#f9fafb', color: '#6b7280', border: '1px solid #e5e7eb', fontWeight: 700 }}>Low ×{lowCnt}</span>}
          </div>
        </div>

        {/* ── 可折叠建议列表 (Image 3) ─────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
          {sorted.map((s, i) => {
            const rowKey  = `opt-sug-${i}`;
            const isOpen  = !!expandedRows[rowKey];
            const isHigh  = s.priority === 'high' || s.priority === '高';
            const isMid   = s.priority === 'medium' || s.priority === '中';
            const badge   = isHigh ? { bg: '#f9fafb', color: '#374151', border: '#e5e7eb', label: 'High' }
                          : isMid  ? { bg: '#f9fafb', color: '#374151', border: '#e5e7eb', label: 'Med'  }
                          :          { bg: '#f9fafb', color: '#6b7280', border: '#e5e7eb', label: 'Low'  };
            const copyTxt = `【${s.dimension || '通用'}】问题：${s.issue || ''}\n建议：${s.suggestion || s.fix || ''}${s.expected_impact ? `\n预期提升：+${s.expected_impact}` : ''}`;

            return (
              <div key={i} style={{
                background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
                overflow: 'hidden', boxShadow: isOpen ? '0 2px 8px rgba(0,0,0,0.05)' : 'none',
              }}>
                {/* 可点击的标题行 */}
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                    cursor: 'pointer', background: isOpen ? '#f9fafb' : '#fff',
                    transition: 'background 0.15s',
                  }}
                  onClick={() => set({ expandedRows: { ...expandedRows, [rowKey]: !isOpen } })}
                >
                  {/* 编号 */}
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', minWidth: 28, flexShrink: 0 }}>
                    S-{i + 1}
                  </span>
                  {/* 维度标签 */}
                  {s.dimension && (
                    <span style={{
                      fontSize: 10, padding: '1px 7px', background: '#f3f4f6',
                      color: '#374151', border: '1px solid #e5e7eb', borderRadius: 4,
                      fontWeight: 600, flexShrink: 0,
                    }}>
                      {s.dimension}
                    </span>
                  )}
                  {/* 优先级徽章 */}
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 4,
                    background: badge.bg, color: badge.color,
                    border: `1px solid ${badge.border}`, flexShrink: 0,
                  }}>
                    {badge.label}
                  </span>
                  {/* 问题摘要（截断） */}
                  <span style={{
                    flex: 1, fontSize: 12, color: '#374151',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {s.issue || s.suggestion || s.fix || '优化建议'}
                  </span>
                  {/* 预期分数提升 */}
                  {s.expected_impact && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', flexShrink: 0 }}>
                      +{s.expected_impact}
                    </span>
                  )}
                  {/* 展开箭头 */}
                  <span style={{ fontSize: 10, color: '#9ca3af', flexShrink: 0, marginLeft: 2 }}>
                    {isOpen ? '▲' : '▼'}
                  </span>
                </div>

                {/* 展开内容 */}
                {isOpen && (
                  <div style={{ padding: '12px 14px', borderTop: '1px solid #f3f4f6' }}>
                    {/* 问题描述 */}
                    {s.issue && (
                      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8, lineHeight: 1.5 }}>
                        <span style={{ fontWeight: 600, color: '#374151' }}>问题描述：</span>{s.issue}
                      </div>
                    )}
                    {/* 优化方案 */}
                    {(s.suggestion || s.fix) && (
                      <div style={{
                        fontSize: 12, color: '#374151', marginBottom: 12, lineHeight: 1.6,
                        background: '#f9fafb', borderRadius: 6, padding: '8px 12px',
                        border: '1px solid #f3f4f6',
                      }}>
                        <span style={{ fontWeight: 600 }}>优化方案：</span>{s.suggestion || s.fix}
                      </div>
                    )}
                    {/* 操作按钮行 */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Button size="small" style={{ fontSize: 11 }} onClick={() => copyText(copyTxt)}>
                        复制建议
                      </Button>
                      <Button size="small" style={{ fontSize: 11 }} onClick={() => message.info('请导出报告后查看详细 Diff')}>
                        查看 Diff
                      </Button>
                      <Button size="small" style={{ fontSize: 11 }} onClick={() => message.info('可将该用例补充到测试集中重新评估')}>
                        补充测试用例
                      </Button>
                      <Button size="small" danger style={{ fontSize: 11 }}
                        onClick={() => set({ expandedRows: { ...expandedRows, [rowKey]: false } })}>
                        忽略
                      </Button>
                      {/* 置信度 */}
                      {s.confidence != null && (
                        <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 'auto' }}>
                          置信度 {typeof s.confidence === 'number' ? `${Math.round(s.confidence * 100)}%` : s.confidence}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 一键优化按钮 */}
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 10, textAlign: 'center' }}>
            点击后将根据以上优化建议自动改写 SKILL.md，并保存为新版本
          </div>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
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
            {/* 评估模型只读展示 */}
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12 }}>
              评估模型：
              {selectedModel
                ? <span style={{ color: '#111827', fontWeight: 600, marginLeft: 4 }}>{selectedModel.displayName || selectedModel.model}</span>
                : <Button type="link" size="small" style={{ fontSize: 11, padding: '0 4px', color: '#374151' }} onClick={() => set({ expanded: false })}>
                    未配置，点击收起后前往配置中心设置
                  </Button>
              }
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
                  border: testCasesError ? '1px solid #374151' : '1px solid #e5e7eb',
                  borderRadius: 4, color: '#374151', background: '#f9fafb', boxSizing: 'border-box', outline: 'none',
                  maxHeight: 'calc(50vh - 100px)',
                }}
              />
              {testCasesError && <div style={{ fontSize: 11, color: '#374151', marginTop: 3 }}>{testCasesError}</div>}
            </div>

            <div style={S.divider} />

            {/* 评估标准 Skill（展开模式同步显示，修复标准消失 Bug） */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ ...S.label, marginBottom: 0 }}>4. 评估标准 Skill</span>
                <Button size="small" type="link" style={{ fontSize: 11, padding: 0, height: 'auto', color: '#374151' }} onClick={() => { set({ expanded: false }); setActiveTab('config-center'); }}>
                  配置中心 →
                </Button>
              </div>
              {[
                { type: 'generic',  label: '通用评估规则', std: genericStd  },
                { type: 'volcano',  label: '火山合规规则', std: volcanoStd  },
              ].map(({ type, label, std }) => (
                <div key={type} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 6, padding: '6px 10px', background: '#f9fafb', borderRadius: 6,
                  border: '1px solid #e5e7eb', borderLeft: std ? '3px solid #111827' : '3px solid #d1d5db',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: std ? '#111827' : '#9ca3af' }}>{label}</span>
                    <div style={{ fontSize: 11, color: std ? '#374151' : '#9ca3af', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {std ? std.name : '使用内置规则'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 8 }}>
                    <Upload accept=".md,.txt,.markdown,.zip,.gz,.tgz" showUploadList={false} beforeUpload={(f) => handleInlineStandardUpload(type, label, f)}>
                      <Button size="small" style={{ fontSize: 11, height: 22, padding: '0 6px' }}>上传</Button>
                    </Upload>
                    {std && (
                      <Button size="small" danger style={{ fontSize: 11, height: 22, padding: '0 6px' }}
                        onClick={() => { clearEvalStandard(type); message.info(`已清除「${label}」`); }}>
                        清除
                      </Button>
                    )}
                  </div>
                </div>
              ))}
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
