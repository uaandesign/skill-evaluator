/**
 * HomePage — Hermes-style 深色首页
 * ----------------------------------------------------------------------
 * 参考 https://hermes-agent.nousresearch.com/ 的视觉语言：
 *   - 深绿黑色背景 (#0d1311)
 *   - 奶白色主文字 (#ede4d0)
 *   - 浅紫色 highlight (#d4b8ff) 用于命令框 / 重点
 *   - 衬线大标题 (Georgia/Cormorant 系列, italic 可选)
 *   - 等宽字体描述 (SF Mono / JetBrains Mono)
 *   - 大量留白, 居中对齐
 *
 * 区块顺序：
 *   1. 顶部 nav-pill (OPEN SOURCE · MIT LICENSE)
 *   2. 大标题 Skill Evaluator (衬线斜体)
 *   3. 副本（描述文字）
 *   4. 三个 CTA: 开始评估 / 技能上传 / 配置中心
 *   5. 实时统计（4 格，前端 store + 后端合并）
 *   6. 本地运行（INSTALL / RUN 命令框 + COPY 按钮，Hermes 同款风格）
 *   7. Footer
 */

import React, { useEffect, useState, useMemo } from 'react';
import { message } from 'antd';
import { useStore } from '../store';

// ─── Hermes 风格 token ──────────────────────────────────────────────────
const C = {
  bg:        '#0d1311',     // 深绿黑色
  bgPanel:   '#0f1714',     // 略浅, 用于命令框背景
  bgCmd:     'rgba(212, 184, 255, 0.10)', // 紫色 highlight 命令背景
  cmdHL:     '#d4b8ff',     // 紫色高亮
  text:      '#ede4d0',     // 奶白色主文字
  textSub:   '#a39880',     // 偏暗的米色, 副文字
  textFaint: '#6a6052',     // 灰色备注
  border:    'rgba(237, 228, 208, 0.12)',
  borderSoft:'rgba(237, 228, 208, 0.06)',
};

const FONT_SERIF = "'Cormorant Garamond', 'Source Serif Pro', 'Crimson Text', Georgia, 'Times New Roman', serif";
const FONT_MONO  = "'SF Mono', 'JetBrains Mono', 'Roboto Mono', Menlo, Consolas, monospace";

export default function HomePage() {
  const { setActiveTab, skills = [], evaluations = [] } = useStore();
  const [serverStats, setServerStats] = useState(null);

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then(setServerStats)
      .catch(() => setServerStats({}));
  }, []);

  // 合并前端 store + 后端 stats，取最大值（前端有未同步到后端的本地 skill）
  const stats = useMemo(() => {
    const localSkills      = skills.length;
    const localVersions    = skills.reduce((s, sk) => s + (sk.versions?.length || 0), 0);
    const localEvaluations = evaluations.length;

    return {
      skills:     Math.max(localSkills,      serverStats?.skills_count           || 0),
      versions:   Math.max(localVersions,    serverStats?.skill_versions_count   || 0),
      evals:      Math.max(localEvaluations, serverStats?.evaluations_count      || 0),
      standards:  serverStats?.standards_active_count || 0,
    };
  }, [skills, evaluations, serverStats]);

  return (
    <div style={{
      background: C.bg,
      color: C.text,
      minHeight: '100vh',
      width: '100%',
      // hermes 那种粗糙的纸质纹理（用极淡的 SVG 噪点模拟）
      backgroundImage: `radial-gradient(circle at 25% 30%, rgba(212,184,255,0.025) 0%, transparent 35%),
                        radial-gradient(circle at 75% 70%, rgba(237,228,208,0.020) 0%, transparent 35%)`,
    }}>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 32px' }}>

        {/* ─── 1. Pill ──────────────────────────────────────────────────── */}
        <div style={{
          textAlign: 'center', paddingTop: 80, marginBottom: 36,
          fontFamily: FONT_MONO, fontSize: 11,
          letterSpacing: '0.22em', color: C.textSub,
        }}>
          OPEN SOURCE  ·  MIT LICENSE
        </div>

        {/* ─── 2. 大标题 ─────────────────────────────────────────────────── */}
        <h1 style={{
          fontFamily: FONT_SERIF,
          fontSize: 'clamp(56px, 8vw, 104px)',
          fontWeight: 500,
          letterSpacing: '-0.01em',
          lineHeight: 0.98,
          textAlign: 'center',
          color: C.text,
          margin: 0,
          marginBottom: 28,
        }}>
          Skill Evaluator
        </h1>

        {/* ─── 3. 描述文字 ──────────────────────────────────────────────── */}
        <p style={{
          fontFamily: FONT_SERIF,
          fontSize: 19,
          lineHeight: 1.5,
          color: C.textSub,
          textAlign: 'center',
          maxWidth: 660,
          margin: '0 auto 56px',
        }}>
          基于规则评估 <span style={{ fontFamily: FONT_MONO, fontSize: 16, color: C.text, padding: '0 4px' }}>SKILL.md</span> 的元数据完整性、流程可执行性、命名合规性等多维度，
          配置 LLM 后可解锁针对性的优化建议。
        </p>

        {/* ─── 4. CTA 按钮 ──────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', gap: 16, justifyContent: 'center',
          marginBottom: 80, flexWrap: 'wrap',
        }}>
          <CTA primary onClick={() => setActiveTab('skill-evaluator')}>开始评估 →</CTA>
          <CTA onClick={() => setActiveTab('skill-library')}>技能上传</CTA>
          <CTA onClick={() => setActiveTab('config-center')}>配置中心</CTA>
        </div>

        {/* ─── 5. 实时统计 ───────────────────────────────────────────────── */}
        <SectionLabel>STATS</SectionLabel>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 0,
          border: `1px solid ${C.border}`,
          marginBottom: 80,
        }}>
          <Stat value={stats.skills}     subZh="技能数"     subEn="SKILLS" />
          <Stat value={stats.versions}   subZh="版本数"     subEn="VERSIONS" />
          <Stat value={stats.evals}      subZh="评估次数"   subEn="EVALUATIONS" />
          <Stat value={stats.standards}  subZh="启用标准数" subEn="ACTIVE STANDARDS" last />
        </div>

        {/* ─── 6. 本地运行 (Hermes 同款命令框) ──────────────────────────── */}
        <div style={{
          maxWidth: 760, margin: '0 auto 80px',
          textAlign: 'center',
        }}>
          <SectionLabel center>RUN LOCALLY</SectionLabel>

          <h2 style={{
            fontFamily: FONT_SERIF, fontSize: 'clamp(36px, 5vw, 56px)',
            fontWeight: 500, letterSpacing: '-0.01em',
            color: C.text, margin: 0, marginBottom: 18, lineHeight: 1.05,
          }}>
            在你的电脑离线运行
          </h2>

          <p style={{
            fontFamily: FONT_SERIF, fontSize: 16, lineHeight: 1.6,
            color: C.textSub, margin: '0 auto 40px', maxWidth: 580,
          }}>
            克隆仓库，三行命令即可运行整个平台，不依赖任何云服务。
            评估你的 skill，无需上传到外部服务。
          </p>

          <CmdBlock
            number="1."
            label="INSTALL"
            cmd="git clone https://github.com/uaandesign/skill-evaluator.git && cd skill-evaluator"
          />
          <CmdBlock
            number="2."
            label="BUILD"
            cmd="npm install && npm run build"
          />
          <CmdBlock
            number="3."
            label="START"
            cmd="npm start  →  http://localhost:3000"
          />

          <div style={{
            marginTop: 32, fontFamily: FONT_MONO, fontSize: 11,
            color: C.textFaint, letterSpacing: '0.06em',
          }}>
            REQUIRES NODE.JS ≥ 20  ·  PYTHON 3  ·  POSTGRES (OPTIONAL)
          </div>
        </div>

        {/* ─── 7. Footer ────────────────────────────────────────────────── */}
        <div style={{
          borderTop: `1px solid ${C.border}`,
          padding: '32px 0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontFamily: FONT_MONO, fontSize: 11,
          letterSpacing: '0.1em', color: C.textFaint,
          flexWrap: 'wrap', gap: 12,
        }}>
          <div>SKILL EVALUATOR  /  MVP 1.0  /  2026</div>
          <div style={{ display: 'flex', gap: 28 }}>
            <FooterLink href="https://github.com/uaandesign/skill-evaluator">GITHUB ↗</FooterLink>
            <FooterLink onClick={() => setActiveTab('config-center')}>SETTINGS</FooterLink>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Sub: SectionLabel ─────────────────────────────────────────────────
function SectionLabel({ children, center }) {
  return (
    <div style={{
      fontFamily: FONT_MONO, fontSize: 11,
      letterSpacing: '0.22em', color: C.textFaint,
      marginBottom: 20,
      textAlign: center ? 'center' : 'left',
    }}>
      {children}
    </div>
  );
}

// ─── Sub: CTA Button ───────────────────────────────────────────────────
function CTA({ children, primary, onClick }) {
  const [hover, setHover] = useState(false);
  const isDark = primary ? !hover : hover;
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '14px 26px',
        fontFamily: FONT_MONO,
        fontSize: 12, fontWeight: 600,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        background: isDark ? C.text : 'transparent',
        color: isDark ? C.bg : C.text,
        border: `1px solid ${C.text}`,
        borderRadius: 0,
        cursor: 'pointer',
        transition: 'all 0.18s ease',
        userSelect: 'none',
        minWidth: 160,
      }}
    >
      {children}
    </button>
  );
}

// ─── Sub: Stat cell ─────────────────────────────────────────────────────
function Stat({ value, subZh, subEn, last }) {
  return (
    <div style={{
      padding: '32px 24px',
      borderRight: last ? 'none' : `1px solid ${C.border}`,
      textAlign: 'center',
    }}>
      <div style={{
        fontFamily: FONT_SERIF, fontSize: 64,
        color: C.text, lineHeight: 1, letterSpacing: '-0.02em',
        marginBottom: 12,
      }}>
        {Number(value || 0).toLocaleString()}
      </div>
      <div style={{
        fontFamily: FONT_MONO, fontSize: 10,
        letterSpacing: '0.18em', color: C.textFaint,
        marginBottom: 4,
      }}>
        {subEn}
      </div>
      <div style={{ fontSize: 12, color: C.textSub, fontFamily: FONT_SERIF }}>
        {subZh}
      </div>
    </div>
  );
}

// ─── Sub: Hermes-style command block ───────────────────────────────────
function CmdBlock({ number, label, cmd }) {
  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(cmd).then(
      () => message.success('已复制'),
      () => message.error('复制失败')
    );
  };
  return (
    <div style={{ marginBottom: 14, textAlign: 'left' }}>
      {/* Header row: NN. LABEL ............ COPY */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        fontFamily: FONT_MONO, fontSize: 11,
        letterSpacing: '0.18em', color: C.textFaint,
        marginBottom: 6,
      }}>
        <span>
          <span style={{ color: C.textSub, marginRight: 8 }}>{number}</span>
          {label}
        </span>
        <button
          onClick={handleCopy}
          style={{
            background: 'transparent', border: 'none',
            color: C.textFaint, fontFamily: FONT_MONO, fontSize: 11,
            letterSpacing: '0.18em', cursor: 'pointer',
            padding: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = C.text)}
          onMouseLeave={(e) => (e.currentTarget.style.color = C.textFaint)}
        >
          COPY
        </button>
      </div>

      {/* Cmd box */}
      <div style={{
        background: C.bgCmd,
        border: `1px solid rgba(212, 184, 255, 0.20)`,
        padding: '14px 18px',
        fontFamily: FONT_MONO, fontSize: 13,
        color: C.cmdHL,
        whiteSpace: 'pre',
        overflowX: 'auto',
      }}>
        {cmd}
      </div>
    </div>
  );
}

// ─── Sub: Footer Link ───────────────────────────────────────────────────
function FooterLink({ children, href, onClick }) {
  const Tag = href ? 'a' : 'button';
  const props = href
    ? { href, target: '_blank', rel: 'noreferrer' }
    : { type: 'button', onClick };
  return (
    <Tag
      {...props}
      style={{
        background: 'transparent', border: 'none',
        color: C.textSub, fontFamily: FONT_MONO, fontSize: 11,
        letterSpacing: '0.1em', cursor: 'pointer',
        textDecoration: 'none',
        padding: 0,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = C.text)}
      onMouseLeave={(e) => (e.currentTarget.style.color = C.textSub)}
    >
      {children}
    </Tag>
  );
}
