/**
 * POST /api/export-report
 * ─────────────────────────────────────────────────────────────────────────
 * 将前端评估结果（results 数组）转换为 Markdown 报告并返回。
 * 前端收到 { markdown } 后在本地触发文件下载，不存储到服务器。
 *
 * 请求体：
 *   {
 *     skill_name:    string,
 *     skill_version: string,
 *     model_name:    string,
 *     results:       EvaluateResponse   // /api/evaluate 返回的原始结构
 *   }
 *
 * 响应：{ markdown: string }
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { skill_name, skill_version, model_name, results } = req.body || {};

    if (!results) {
      return res.status(400).json({ error: '缺少 results 字段' });
    }

    const markdown = generateMarkdownReport({
      skillName:    skill_name    || '未知技能',
      skillVersion: skill_version || '未知版本',
      modelName:    model_name    || '未知模型',
      results,
    });

    return res.status(200).json({ markdown });
  } catch (err) {
    console.error('[export-report] error:', err);
    return res.status(500).json({ error: '报告生成失败', details: err.message });
  }
}

// ─── Markdown 生成 ────────────────────────────────────────────────────────

function generateMarkdownReport({ skillName, skillVersion, modelName, results }) {
  const now = new Date();
  const dateStr = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  const lines = [];

  // ── 封面 ──────────────────────────────────────────────────────────────
  lines.push(`# Skill 评估报告`);
  lines.push('');
  lines.push(`| 字段 | 内容 |`);
  lines.push(`|------|------|`);
  lines.push(`| **技能名称** | ${esc(skillName)} |`);
  lines.push(`| **版本** | ${esc(skillVersion)} |`);
  lines.push(`| **评估模型** | ${esc(modelName)} |`);
  lines.push(`| **生成时间** | ${dateStr} |`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // ── 汇总评分 ─────────────────────────────────────────────────────────
  const evalResults = results?.results || [];
  const successResults = evalResults.filter((r) => r.report && !r.error);

  if (successResults.length === 0) {
    lines.push('## 评估结果');
    lines.push('');
    lines.push('> 本次评估未产生有效结果，请检查配置后重试。');
    return lines.join('\n');
  }

  // 平均分
  const avgScore = successResults.reduce((s, r) => s + (r.report?.score || 0), 0) / successResults.length;
  const avgGrade = successResults[0]?.report?.grade || '—';

  lines.push('## 综合评分');
  lines.push('');
  lines.push(`| 指标 | 值 |`);
  lines.push(`|------|----|`);
  lines.push(`| 综合得分 | **${Math.round(avgScore)} 分** |`);
  lines.push(`| 等级 | **${avgGrade}** |`);
  lines.push(`| 参与评估的标准数 | ${successResults.length} |`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // ── 各标准详情 ────────────────────────────────────────────────────────
  lines.push('## 各评估标准详情');
  lines.push('');

  for (const r of evalResults) {
    const stdName = r.standard?.display_name || r.standard?.standard_key || '未知标准';

    lines.push(`### ${esc(stdName)}`);
    lines.push('');

    if (r.error) {
      lines.push(`> ⚠️ 评估失败：${esc(r.error)}`);
      lines.push('');
      continue;
    }

    const report = r.report || {};
    const score  = report.score ?? '—';
    const grade  = report.grade ?? '—';

    // 评估标签（通过 / 警告 / 不通过）
    const assessment = report.generic_assessment || report.volcano_assessment || {};
    const tag   = assessment.tag   || '—';
    const tagEmoji = tag === '通过' ? '✅' : tag === '警告' ? '⚠️' : tag === '不通过' ? '❌' : '—';

    lines.push(`**得分：${score} 分 ｜ 等级：${grade} ｜ 结论：${tagEmoji} ${tag}**`);
    lines.push('');

    // 分类得分表
    const catScores = report.category_scores || {};
    const catKeys = Object.keys(catScores);
    if (catKeys.length > 0) {
      lines.push('#### 分类得分');
      lines.push('');
      lines.push('| 维度 | 得分 | 满分 | 占比 |');
      lines.push('|------|------|------|------|');
      for (const k of catKeys) {
        const cat = catScores[k];
        const earned    = cat.earned    ?? cat.score ?? '—';
        const available = cat.available ?? cat.total ?? '—';
        const pct = (typeof earned === 'number' && typeof available === 'number' && available > 0)
          ? `${Math.round((earned / available) * 100)}%`
          : '—';
        const displayName = cat.display_name_zh || cat.display_name || k;
        lines.push(`| ${esc(displayName)} | ${earned} | ${available} | ${pct} |`);
      }
      lines.push('');
    }

    // 检查项列表
    const checks = report.checks || [];
    if (checks.length > 0) {
      lines.push('#### 检查项明细');
      lines.push('');
      const passed  = checks.filter((c) => c.passed);
      const failed  = checks.filter((c) => !c.passed);
      const warning = checks.filter((c) => c.warning);

      if (failed.length > 0) {
        lines.push('**❌ 未通过**');
        lines.push('');
        for (const c of failed) {
          lines.push(`- ${esc(c.name || c.check_id || '未命名')}: ${esc(c.message || c.reason || '')}`);
        }
        lines.push('');
      }
      if (warning.length > 0) {
        lines.push('**⚠️ 警告**');
        lines.push('');
        for (const c of warning) {
          lines.push(`- ${esc(c.name || c.check_id || '未命名')}: ${esc(c.message || c.reason || '')}`);
        }
        lines.push('');
      }
      if (passed.length > 0) {
        lines.push('**✅ 通过**');
        lines.push('');
        for (const c of passed) {
          lines.push(`- ${esc(c.name || c.check_id || '未命名')}`);
        }
        lines.push('');
      }
    }

    // 优化建议
    const suggestions =
      assessment.optimization_suggestions ||
      assessment.suggestions ||
      report.optimization_suggestions;

    if (suggestions) {
      lines.push('#### 优化建议');
      lines.push('');
      if (Array.isArray(suggestions)) {
        for (const s of suggestions) {
          lines.push(`- ${esc(typeof s === 'string' ? s : JSON.stringify(s))}`);
        }
      } else {
        lines.push(String(suggestions));
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  // ── 结尾 ──────────────────────────────────────────────────────────────
  lines.push(`*报告由 Skill Evaluator 自动生成 · ${dateStr}*`);

  return lines.join('\n');
}

/** 转义 Markdown 表格中的特殊字符 */
function esc(str) {
  if (!str) return '';
  return String(str).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
