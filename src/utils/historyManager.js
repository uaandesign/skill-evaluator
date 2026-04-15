/**
 * History Manager - 客户端历史记录管理
 * 用于与后端历史 API 交互
 */

const API_BASE = '/api/history';

/**
 * 保存技能测试记录
 */
export async function saveTestRecord({
  skillId,
  skillName,
  testInput,
  testOutput,
  model,
  latency,
}) {
  try {
    const response = await fetch(`${API_BASE}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skill_id: skillId,
        skill_name: skillName,
        test_input: testInput,
        test_output: testOutput,
        model,
        latency,
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) throw new Error(`Save failed: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Failed to save test record:', error);
    return null;
  }
}

/**
 * 获取技能的测试历史
 */
export async function getTestHistory(skillId, limit = 50) {
  try {
    const response = await fetch(
      `${API_BASE}/tests?skill_id=${skillId}&limit=${limit}`
    );
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch test history:', error);
    return [];
  }
}

/**
 * 保存技能评估记录
 */
export async function saveEvalRecord({
  skillId,
  skillName,
  scores,
  optimizationSuggestions,
  weaknessAnalysis,
  model,
}) {
  try {
    const avgScore =
      Object.values(scores).reduce((a, b) => a + b, 0) /
      Object.values(scores).length;

    const response = await fetch(`${API_BASE}/eval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skill_id: skillId,
        skill_name: skillName,
        scores,
        avg_score: avgScore,
        optimization_suggestions: optimizationSuggestions,
        weakness_analysis: weaknessAnalysis,
        model,
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) throw new Error(`Save failed: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Failed to save eval record:', error);
    return null;
  }
}

/**
 * 获取技能的评估历史
 */
export async function getEvalHistory(skillId, limit = 30) {
  try {
    const response = await fetch(
      `${API_BASE}/evals?skill_id=${skillId}&limit=${limit}`
    );
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch eval history:', error);
    return [];
  }
}

/**
 * 获取评估趋势数据（用于图表展示）
 */
export async function getEvalTrends(skillId, days = 7) {
  try {
    const response = await fetch(
      `${API_BASE}/trends?skill_id=${skillId}&days=${days}`
    );
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch eval trends:', error);
    return [];
  }
}

/**
 * 删除单条测试记录
 */
export async function deleteTestRecord(recordId) {
  try {
    const response = await fetch(`${API_BASE}/test/${recordId}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error(`Delete failed: ${response.status}`);
    return true;
  } catch (error) {
    console.error('Failed to delete test record:', error);
    return false;
  }
}

/**
 * 删除单条评估记录
 */
export async function deleteEvalRecord(recordId) {
  try {
    const response = await fetch(`${API_BASE}/eval/${recordId}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error(`Delete failed: ${response.status}`);
    return true;
  } catch (error) {
    console.error('Failed to delete eval record:', error);
    return false;
  }
}

/**
 * 清空某个技能的所有历史记录
 */
export async function clearSkillHistory(skillId) {
  try {
    const response = await fetch(
      `${API_BASE}/clear?skill_id=${skillId}`,
      { method: 'DELETE' }
    );
    if (!response.ok) throw new Error(`Clear failed: ${response.status}`);
    return true;
  } catch (error) {
    console.error('Failed to clear history:', error);
    return false;
  }
}

/**
 * 导出历史记录为 JSON
 */
export async function exportHistory(skillId) {
  try {
    const tests = await getTestHistory(skillId, 1000);
    const evals = await getEvalHistory(skillId, 1000);

    const data = {
      exportDate: new Date().toISOString(),
      skillId,
      tests,
      evals,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `history-${skillId}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    return true;
  } catch (error) {
    console.error('Failed to export history:', error);
    return false;
  }
}
