/**
 * HomePage — 黑白双色 + hermes 结构
 * ----------------------------------------------------------------------
 * 配色：纯黑白（#fff / #0a0a0a / 灰阶），不使用任何彩色
 * 结构参考 hermes-agent.nousresearch.com：
 *   - 顶部 PILL 小字
 *   - 衬线巨型标题（无装饰）
 *   - 衬线副本（居中段落）
 *   - 三个 CTA（黑边方块按钮）
 *   - INSTALL/BUILD/START 序号 + 命令框 + COPY 按钮（命令框用黑底白字反差）
 *   - 实时统计 4 格
 *   - 极简 Footer
 *
 * 字体：
 *   衬线: Cormorant Garamond / Source Serif Pro / Georgia
 *   等宽: SF Mono / JetBrains Mono / Menlo
 */

import React, { useEffect, useState, useMemo } from 'react';
import { message } from 'antd';
import { useStore } from '../store';

// ─── 黑白 token ────────────────────────────────────────────────────────
const C = {
  bg:        '#ffffff',
  bgSubtle:  '#fafafa',
  bgInverse: '#0a0a0a',          // 反差命令框背景
  text:      '#0a0a0a',
  textInv:   '#fafafa',          // 反差命令框文字
  textSub:   '#525252',
  textFaint: '#9ca3af',
  border:    '#0a0a0a',
  borderSoft:'#e5e7eb',
};

const FONT_SERIF = "'Cormorant Garamond', 'Source Serif Pro', 'Crimson Text', Georgia, 'Times New Roman', serif";
const FONT_MONO  = "'SF Mono', 'JetBrains Mono', 'Roboto Mono', Menlo, Consolas, monospace";

export default function HomePage() {
  const { setActiveTab, skills = [], evaluations = [] } = useStore();
  const [serverStats, setServerStats] = useState(null);

  useEffect(() => {
    fetch('/api/stats').then((r) => r.json()).then(setServerStats).catch(() => setServerStats({}));
  }, []);

  // 合并前端 store + 后端 stats
  const stats = useMemo(() => {
    const localSkills      = skills.length;
    const localVersions    = skills.reduce((s, sk) => s + (sk.versions?.length || 0), 0);
    const localEvaluations = evaluations.length;
    return {
      skills:    Math.max(localSkills,      serverStats?.skills_count           || 0),
      versions:  Math.max(localVersions,    serverStats?.skill_versions_count   || 0),
      evals:     Math.max(localEvaluations, serverStats?.evaluations_count      || 0),
      standards: serverStats?.standards_active_count || 0,
    };
  }, [skills, evaluations, serverStats]);

  return (
    <div style={{
      background: C.bg,
      color: C.text,
      minHeight: '100vh',
      width: '100%',
    }}>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 32px' }}>

        {/* ─── 1. PILL ─────────────────────────────────────────────────── */}
        <div style={{
          textAlign: 'center', paddingTop: 80, marginBottom: 36,
          fontFamily: FONT_MONO, fontSize: 11,
          letterSpacing: '0.22em', color: C.textFaint,
        }}>
          OPEN SOURCE  ·  MIT LICENSE
        </div>

        {/* ─── 2. 衬线大标题 ──────────────────────────────────────────── */}
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

        {/* ─── 3. 描述 ────────────────────────────────────────────────── */}
        <p style={{
          fontFamily: FONT_SERIF,
          fontSize: 19, lineHeight: 1.5,
          color: C.textSub,
          textAlign: 'center',
          maxWidth: 660,
          margin: '0 auto 56px',
        }}>
          基于规则评估
          <span style={{
            fontFamily: FONT_MONO, fontSize: 16,
            color: C.text, padding: '0 6px',
            background: C.bgSubtle,
            border: `1px solid ${C.borderSoft}`,
            margin: '0 2px',
          }}>
            SKILL.md
          </span>
          的元数据完整性、流程可执行性、命名合规性等多维度，配置 LLM 后可解锁针对性的优化建议。
        </p>

        {/* ─── 4. CTA ─────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', gap: 16, justifyContent: 'center',
          marginBottom: 96, flexWrap: 'wrap',
        }}>
          <CTA primary onClick={() => setActiveTab('skill-evaluator')}>开始评估 →</CTA>
          <CTA onClick={() => setActiveTab('skill-library')}>技能上传</CTA>
          <CTA onClick={() => setActiveTab('config-center')}>配置中心</CTA>
        </div>

        {/* ─── 5. STATS ──────────────────────────────────────────────── */}
        <SectionLabel>STATS / 实时统计</SectionLabel>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          border: `1px solid ${C.border}`,
          marginBottom: 96,
        }}>
          <Stat value={stats.skills}    subZh="技能数"     subEn="SKILLS" />
          <Stat value={stats.versions}  subZh="版本数"     subEn="VERSIONS" />
          <Stat value={stats.evals}     subZh="评估次数"   subEn="EVALUATIONS" />
          <Stat value={stats.standards} subZh="启用标准数" subEn="ACTIVE STANDARDS" last />
        </div>

        {/* ─── 6. RUN LOCALLY (hermes 命令框结构) ─────────────────────── */}
        <SectionLabel center>RUN LOCALLY / 本地运行</SectionLabel>
        <h2 style={{
          fontFamily: FONT_SERIF,
          fontSize: 'clamp(36px, 5vw, 56px)',
          fontWeight: 500, letterSpacing: '-0.01em',
          textAlign: 'center', color: C.text,
          margin: 0, marginBottom: 16, lineHeight: 1.05,
        }}>
          在你的电脑离线运行
        </h2>
        <p style={{
          fontFamily: FONT_SERIF, fontSize: 16, lineHeight: 1.6,
          color: C.textSub, textAlign: 'center',
          margin: '0 auto 40px', maxWidth: 580,
        }}>
          克隆仓库、三步即可运行整个平台，不依赖任何云服务。评估你的 skill，无需上传到外部服务。
        </p>

        <div style={{ maxWidth: 720, margin: '0 auto 28px' }}>
          <CmdBlock number="1." label="INSTALL"
            cmd="git clone https://github.com/uaandesign/skill-evaluator.git && cd skill-evaluator" />
          <CmdBlock number="2." label="BUILD"
            cmd="npm install && npm run build" />
          <CmdBlock number="3." label="START"
            cmd="npm start" />
        </div>

        <div style={{
          textAlign: 'center', marginBottom: 96,
          fontFamily: FONT_MONO, fontSize: 11,
          letterSpacing: '0.1em', color: C.textFaint,
        }}>
          REQUIRES NODE.JS ≥ 20  ·  PYTHON 3  ·  POSTGRES (OPTIONAL)
        </div>

        {/* ─── 7. Footer ─────────────────────────────────────────────── */}
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
      marginBottom: 20, textAlign: center ? 'center' : 'left',
    }}>
      {children}
    </div>
  );
}

// ─── Sub: CTA ──────────────────────────────────────────────────────────
function CTA({ children, primary, onClick }) {
  const [hover, setHover] = useState(false);
  // primary: 默认黑底白字, hover 反色
  // secondary: 默认透明黑边, hover 黑底白字
  const isInv = primary ? !hover : hover;
  return (
    <button
      type="button" onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '14px 26px',
        fontFamily: FONT_MONO,
        fontSize: 12, fontWeight: 600,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        background: isInv ? C.text : 'transparent',
        color:      isInv ? C.bg   : C.text,
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

// ─── Sub: Stat ─────────────────────────────────────────────────────────
function Stat({ value, subZh, subEn, last }) {
  return (
    <div style={{
      padding: '36px 24px',
      borderRight: last ? 'none' : `1px solid ${C.borderSoft}`,
      textAlign: 'center',
    }}>
      <div style={{
        fontFamily: FONT_SERIF,
        fontSize: 64,
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

// ─── Sub: 命令框（黑白反差版）─────────────────────────────────────────
function CmdBlock({ number, label, cmd }) {
  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(cmd).then(
      () => message.success('已复制'),
      () => message.error('复制失败')
    );
  };
  return (
    <div style={{ marginBottom: 14 }}>
      {/* Header row: NN. LABEL ............ COPY */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        fontFamily: FONT_MONO, fontSize: 11,
        letterSpacing: '0.18em', color: C.textFaint,
        marginBottom: 6,
      }}>
        <span>
          <span style={{ color: C.text, marginRight: 8 }}>{number}</span>
          {label}
        </span>
        <button
          onClick={handleCopy}
          style={{
            background: 'transparent', border: 'none',
            color: C.textFaint, fontFamily: FONT_MONO, fontSize: 11,
            letterSpacing: '0.18em', cursor: 'pointer', padding: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = C.text)}
          onMouseLeave={(e) => (e.currentTarget.style.color = C.textFaint)}
        >
          COPY
        </button>
      </div>
      {/* 命令框：黑底白字，呼应 hermes 的反差感（但不用彩色） */}
      <div style={{
        background: C.bgInverse,
        color: C.textInv,
        border: `1px solid ${C.bgInverse}`,
        padding: '14px 18px',
        fontFamily: FONT_MONO, fontSize: 13,
        whiteSpace: 'pre',
        overflowX: 'auto',
      }}>
        <span style={{ color: C.textFaint, marginRight: 10, userSelect: 'none' }}>$</span>
        {cmd}
      </div>
    </div>
  );
}

// ─── Sub: Footer Link ──────────────────────────────────────────────────
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
        textDecoration: 'none', padding: 0,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = C.text)}
      onMouseLeave={(e) => (e.currentTarget.style.color = C.textSub)}
    >
      {children}
    </Tag>
  );
}
