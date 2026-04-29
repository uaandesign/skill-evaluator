/**
 * HomePage
 * ----------------------------------------------------------------------
 * 黑白极简首页（参考 hermes-agent.nousresearch.com 排版）
 *
 * 区块：
 *   1. Hero：项目名 + 一句话定位 + 三个 CTA
 *   2. Stats：4 个统计数据（skill 数 / 版本数 / 评估次数 / 启用标准数）
 *   3. How it works：3 步流程
 *   4. Run Locally：本地运行说明（git clone + npm 命令 + GitHub link）
 *   5. Footer：版本号 + 链接
 *
 * 设计原则：
 *   - 纯黑白（#000 / #fff / #f3f3f3 灰阶），无彩色
 *   - 单色字体（系统等宽 / serif / sans）
 *   - 无任何 icon / emoji / 图片，只有文字 + 几何边框
 *   - 大量留白
 */

import React, { useEffect, useState } from 'react';
import { useStore } from '../store';

const COLORS = {
  bg:         '#ffffff',
  text:       '#0a0a0a',
  textSub:    '#6b7280',
  textFaint:  '#9ca3af',
  border:     '#0a0a0a',
  borderSoft: '#e5e7eb',
  accent:     '#000000',
  surface:    '#fafafa',
};

const FONT_MONO = "'SF Mono', 'JetBrains Mono', 'Roboto Mono', Menlo, Consolas, 'Liberation Mono', monospace";
const FONT_SANS = "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'Segoe UI', Inter, sans-serif";

export default function HomePage() {
  const { setActiveTab } = useStore();
  const [stats, setStats] = useState({
    skills_count: 0,
    skill_versions_count: 0,
    evaluations_count: 0,
    standards_active_count: 0,
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then((d) => { setStats(d); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  return (
    <div style={{
      background: COLORS.bg,
      color: COLORS.text,
      fontFamily: FONT_SANS,
      minHeight: '100vh',
      width: '100%',
    }}>
      {/* ─── Hero ───────────────────────────────────────────────── */}
      <section style={{
        padding: '80px 64px 60px',
        borderBottom: `1px solid ${COLORS.border}`,
        maxWidth: 1280,
        margin: '0 auto',
      }}>
        <div style={{
          fontSize: 11,
          fontFamily: FONT_MONO,
          letterSpacing: '0.18em',
          color: COLORS.textFaint,
          marginBottom: 28,
        }}>
          SKILL EVALUATOR · MVP 1.0
        </div>

        <h1 style={{
          fontSize: 'clamp(48px, 7vw, 96px)',
          fontWeight: 800,
          letterSpacing: '-0.04em',
          lineHeight: 0.95,
          margin: 0,
          marginBottom: 24,
        }}>
          为 Claude Skill <br />
          打分的平台
        </h1>

        <p style={{
          fontSize: 18,
          lineHeight: 1.5,
          color: COLORS.textSub,
          maxWidth: 640,
          margin: 0,
          marginBottom: 40,
        }}>
          基于确定性 Python 静态规则评估 SKILL.md 的元数据完整性、流程可执行性、命名合规性等多维度，
          不依赖大模型，结果可复现。配置 LLM 后可解锁针对性的优化建议。
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <CTA primary onClick={() => setActiveTab('skill-evaluator')}>开始评估 →</CTA>
          <CTA onClick={() => setActiveTab('skill-creator')}>创建 Skill</CTA>
          <CTA onClick={() => setActiveTab('config-center')}>配置中心</CTA>
        </div>
      </section>

      {/* ─── Stats ──────────────────────────────────────────────── */}
      <section style={{
        padding: '0 64px',
        maxWidth: 1280,
        margin: '0 auto',
        borderBottom: `1px solid ${COLORS.border}`,
      }}>
        <SectionLabel>STATS / 实时统计</SectionLabel>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 0,
          borderTop: `1px solid ${COLORS.borderSoft}`,
        }}>
          <StatCell label="技能数"     value={stats.skills_count}           sub="SKILLS" />
          <StatCell label="版本数"     value={stats.skill_versions_count}   sub="VERSIONS" />
          <StatCell label="评估次数"   value={stats.evaluations_count}      sub="EVALUATIONS" />
          <StatCell label="启用标准数" value={stats.standards_active_count} sub="ACTIVE STANDARDS" />
        </div>
        <div style={{
          fontSize: 11, fontFamily: FONT_MONO, color: COLORS.textFaint,
          padding: '14px 0', textAlign: 'right',
        }}>
          {loaded ? '○ 数据每 60 秒刷新' : '○ 加载中...'}
        </div>
      </section>

      {/* ─── How it works ───────────────────────────────────────── */}
      <section style={{
        padding: '0 64px',
        maxWidth: 1280,
        margin: '0 auto',
        borderBottom: `1px solid ${COLORS.border}`,
      }}>
        <SectionLabel>WORKFLOW / 工作流</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, paddingBottom: 60 }}>
          <Step
            number="01"
            title="上传 Skill"
            body="把要评估的 skill 文件夹（含 SKILL.md）打包成 zip，或在平台内创建/导入。"
          />
          <Step
            number="02"
            title="确定性评估"
            body="平台执行内置或自定义的 Python 评估脚本，按维度打分。耗时 2–5 秒，全程不调用 LLM。"
          />
          <Step
            number="03"
            title="可选优化"
            body="若已配置大模型，可一键生成针对失败检查项的优化建议，或直接重写为新版本。"
          />
        </div>
      </section>

      {/* ─── Run Locally ────────────────────────────────────────── */}
      <section style={{
        padding: '0 64px',
        maxWidth: 1280,
        margin: '0 auto',
        borderBottom: `1px solid ${COLORS.border}`,
      }}>
        <SectionLabel>RUN LOCALLY / 本地运行</SectionLabel>
        <div style={{ paddingBottom: 60 }}>
          <p style={{ fontSize: 15, color: COLORS.textSub, lineHeight: 1.6, marginTop: 0, marginBottom: 24, maxWidth: 700 }}>
            想在自己电脑上运行平台、离线评估自己的 skill？只要 3 行命令：
          </p>

          <pre style={{
            fontFamily: FONT_MONO,
            fontSize: 13,
            background: COLORS.text,
            color: '#fafafa',
            padding: 24,
            borderRadius: 0,
            border: `1px solid ${COLORS.border}`,
            lineHeight: 1.8,
            margin: 0,
            marginBottom: 20,
            overflowX: 'auto',
          }}>
{`$ git clone https://github.com/uaandesign/skill-evaluator.git
$ cd skill-evaluator
$ npm install && npm run build && npm start
$ open http://localhost:3000`}
          </pre>

          <div style={{ display: 'flex', gap: 24, fontSize: 13, color: COLORS.textSub, fontFamily: FONT_MONO }}>
            <span>需要 Node.js ≥ 20</span>
            <span>·</span>
            <span>需要 Python 3</span>
            <span>·</span>
            <span>可选: Neon Postgres</span>
          </div>

          <div style={{ marginTop: 32, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <CTA href="https://github.com/uaandesign/skill-evaluator" external>查看仓库 ↗</CTA>
            <CTA href="https://github.com/uaandesign/skill-evaluator/blob/main/README.md" external>文档 ↗</CTA>
          </div>
        </div>
      </section>

      {/* ─── Footer ─────────────────────────────────────────────── */}
      <footer style={{
        padding: '32px 64px',
        maxWidth: 1280,
        margin: '0 auto',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontFamily: FONT_MONO,
        fontSize: 11,
        letterSpacing: '0.08em',
        color: COLORS.textFaint,
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div>SKILL-EVALUATOR / MVP 1.0 / 2026</div>
        <div style={{ display: 'flex', gap: 24 }}>
          <a
            href="https://github.com/uaandesign/skill-evaluator"
            target="_blank" rel="noreferrer"
            style={{ color: COLORS.textSub, textDecoration: 'none', borderBottom: `1px solid ${COLORS.borderSoft}` }}
          >
            GITHUB
          </a>
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); setActiveTab('config-center'); }}
            style={{ color: COLORS.textSub, textDecoration: 'none', borderBottom: `1px solid ${COLORS.borderSoft}` }}
          >
            SETTINGS
          </a>
        </div>
      </footer>
    </div>
  );
}

// ─── 子组件 ─────────────────────────────────────────────────────────────
function CTA({ children, primary, onClick, href, external }) {
  const style = {
    display: 'inline-flex', alignItems: 'center',
    padding: '14px 24px',
    fontFamily: FONT_MONO,
    fontSize: 13, fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    background: primary ? COLORS.text : 'transparent',
    color: primary ? '#fafafa' : COLORS.text,
    border: `1px solid ${COLORS.border}`,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    textDecoration: 'none',
    userSelect: 'none',
  };
  const hover = (e, on) => {
    e.currentTarget.style.background = on ? COLORS.text : (primary ? COLORS.text : 'transparent');
    e.currentTarget.style.color      = on ? '#fafafa'   : (primary ? '#fafafa'    : COLORS.text);
  };
  if (href) {
    return (
      <a href={href} target={external ? '_blank' : undefined} rel="noreferrer"
         style={style}
         onMouseEnter={(e) => hover(e, true)}
         onMouseLeave={(e) => hover(e, false)}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" style={style} onClick={onClick}
      onMouseEnter={(e) => hover(e, true)}
      onMouseLeave={(e) => hover(e, false)}>
      {children}
    </button>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontFamily: FONT_MONO,
      fontSize: 11,
      letterSpacing: '0.18em',
      color: COLORS.textFaint,
      padding: '32px 0 18px',
    }}>
      {children}
    </div>
  );
}

function StatCell({ label, value, sub }) {
  return (
    <div style={{
      padding: '32px 24px',
      borderRight: `1px solid ${COLORS.borderSoft}`,
    }}>
      <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.04em', marginBottom: 8, color: COLORS.text }}>
        {Number(value || 0).toLocaleString()}
      </div>
      <div style={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '0.15em', color: COLORS.textFaint, marginBottom: 4 }}>
        {sub}
      </div>
      <div style={{ fontSize: 13, color: COLORS.textSub }}>{label}</div>
    </div>
  );
}

function Step({ number, title, body }) {
  return (
    <div style={{
      padding: '36px 24px',
      borderRight: `1px solid ${COLORS.borderSoft}`,
      borderTop: `1px solid ${COLORS.borderSoft}`,
    }}>
      <div style={{
        fontFamily: FONT_MONO,
        fontSize: 12, fontWeight: 700,
        letterSpacing: '0.15em',
        color: COLORS.text,
        marginBottom: 14,
      }}>
        {number}
      </div>
      <h3 style={{
        fontSize: 22, fontWeight: 700,
        margin: 0, marginBottom: 10,
        letterSpacing: '-0.01em',
      }}>
        {title}
      </h3>
      <p style={{
        fontSize: 14, color: COLORS.textSub,
        lineHeight: 1.6, margin: 0,
      }}>
        {body}
      </p>
    </div>
  );
}
