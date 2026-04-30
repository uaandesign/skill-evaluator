/**
 * HomePage — 黑白双色 / 全无衬线 / hermes 结构
 * ----------------------------------------------------------------------
 * 配色：纯黑白（#fff / #0a0a0a / 灰阶），不使用任何彩色
 * 字体：全部使用无衬线（sans-serif）；命令行 / 标签可用等宽（mono）
 * 结构参考 hermes-agent.nousresearch.com（仅结构和样式）：
 *   - 顶部 PILL
 *   - 巨型标题
 *   - 居中段落描述
 *   - 4 个 CTA（开始评估 / 技能上传 / 配置中心 / 本地运行）
 *   - 实时统计
 *   - Footer
 *
 * 本地运行方案：从内联区块改为 Modal 弹窗，CTA 按钮触发
 */

import React, { useEffect, useState, useMemo } from 'react';
import { Modal, message } from 'antd';
import { useStore } from '../store';

// ─── 黑白 token ────────────────────────────────────────────────────────
const C = {
  bg:        '#ffffff',
  bgSubtle:  '#fafafa',
  bgInverse: '#0a0a0a',
  text:      '#0a0a0a',
  textInv:   '#fafafa',
  textSub:   '#525252',
  textFaint: '#9ca3af',
  border:    '#0a0a0a',
  borderSoft:'#e5e7eb',
};

// 全局无衬线字体栈（中英混排友好）
const FONT_SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Source Han Sans CN', 'Noto Sans SC', sans-serif";
const FONT_MONO = "'SF Mono', 'JetBrains Mono', 'Roboto Mono', Menlo, Consolas, monospace";

export default function HomePage() {
  const { setActiveTab, skills = [], evaluations = [] } = useStore();
  const [serverStats, setServerStats] = useState(null);
  const [activeStandardsCount, setActiveStandardsCount] = useState(0);
  const [runLocallyOpen, setRunLocallyOpen] = useState(false);

  useEffect(() => {
    // 拉服务器统计
    fetch('/api/stats').then((r) => r.json()).then(setServerStats).catch(() => setServerStats({}));
    // 直接拉评估标准列表（更可靠）
    fetch('/api/standards')
      .then((r) => r.json())
      .then((d) => {
        const active = (d?.standards || []).filter((s) => s.is_active).length;
        setActiveStandardsCount(active);
      })
      .catch(() => {});
  }, []);

  // 合并所有可能的评估次数来源（前端 store + 持久化的 zustand storage + 后端 stats）
  const evalsLocal = useMemo(() => {
    let count = evaluations?.length || 0;
    // 兜底：直接从 zustand 的 localStorage key 读（防止 hydrate 时序问题）
    try {
      const raw = localStorage.getItem('skill-evaluator-storage');
      if (raw) {
        const parsed = JSON.parse(raw);
        const arr = parsed?.state?.evaluations;
        if (Array.isArray(arr)) count = Math.max(count, arr.length);
      }
    } catch {}
    return count;
  }, [evaluations]);

  const stats = useMemo(() => {
    const localSkills      = skills.length;
    const localVersions    = skills.reduce((s, sk) => s + (sk.versions?.length || 0), 0);
    return {
      skills:    Math.max(localSkills,   serverStats?.skills_count           || 0),
      versions:  Math.max(localVersions, serverStats?.skill_versions_count   || 0),
      evals:     Math.max(evalsLocal,    serverStats?.evaluations_count      || 0),
      standards: Math.max(activeStandardsCount, serverStats?.standards_active_count || 0),
    };
  }, [skills, evalsLocal, serverStats, activeStandardsCount]);

  return (
    <div style={{
      background: C.bg,
      color: C.text,
      minHeight: '100vh',
      width: '100%',
      fontFamily: FONT_SANS,
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

        {/* ─── 2. 标题（无衬线，超粗） ─────────────────────────────────── */}
        <h1 style={{
          fontFamily: FONT_SANS,
          fontSize: 'clamp(56px, 8vw, 104px)',
          fontWeight: 800,
          letterSpacing: '-0.04em',
          lineHeight: 0.95,
          textAlign: 'center',
          color: C.text,
          margin: 0,
          marginBottom: 28,
        }}>
          Skill Evaluator
        </h1>

        {/* ─── 3. 描述 ────────────────────────────────────────────────── */}
        <p style={{
          fontFamily: FONT_SANS,
          fontSize: 17, lineHeight: 1.6,
          color: C.textSub,
          textAlign: 'center',
          maxWidth: 660,
          margin: '0 auto 56px',
        }}>
          基于规则评估
          <span style={{
            fontFamily: FONT_MONO, fontSize: 14,
            color: C.text, padding: '1px 6px',
            background: C.bgSubtle,
            border: `1px solid ${C.borderSoft}`,
            margin: '0 4px',
          }}>
            SKILL.md
          </span>
          的元数据完整性、流程可执行性、命名合规性等多维度，配置 LLM 后可解锁针对性的优化建议。
        </p>

        {/* ─── 4. CTA（4 个按钮）─────────────────────────────────────── */}
        <div style={{
          display: 'flex', gap: 14, justifyContent: 'center',
          marginBottom: 96, flexWrap: 'wrap',
        }}>
          <CTA primary onClick={() => setActiveTab('skill-evaluator')}>开始评估 →</CTA>
          <CTA onClick={() => setActiveTab('skill-library')}>技能上传</CTA>
          <CTA onClick={() => setActiveTab('config-center')}>配置中心</CTA>
          <CTA onClick={() => setRunLocallyOpen(true)}>本地运行</CTA>
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

        {/* ─── 6. Footer ─────────────────────────────────────────────── */}
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

      <RunLocallyModal open={runLocallyOpen} onClose={() => setRunLocallyOpen(false)} />
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
  const isInv = primary ? !hover : hover;
  return (
    <button
      type="button" onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '14px 26px',
        fontFamily: FONT_SANS,
        fontSize: 13, fontWeight: 600,
        letterSpacing: '0.02em',
        background: isInv ? C.text : 'transparent',
        color:      isInv ? C.bg   : C.text,
        border: `1px solid ${C.text}`,
        borderRadius: 0,
        cursor: 'pointer',
        transition: 'all 0.18s ease',
        userSelect: 'none',
        minWidth: 140,
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
        fontFamily: FONT_SANS,
        fontSize: 64, fontWeight: 800,
        color: C.text, lineHeight: 1, letterSpacing: '-0.04em',
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
      <div style={{ fontSize: 12, color: C.textSub, fontFamily: FONT_SANS }}>
        {subZh}
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

// ─── Sub: 命令行（带 COPY 按钮）────────────────────────────────────────
function CmdLine({ cmd }) {
  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(cmd).then(
      () => message.success('已复制'),
      () => message.error('复制失败')
    );
  };
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch',
      background: C.bgInverse, color: C.textInv,
      fontFamily: FONT_MONO, fontSize: 13,
      marginBottom: 8,
    }}>
      <div style={{
        flex: 1, padding: '12px 16px',
        whiteSpace: 'pre-wrap', wordBreak: 'break-all',
      }}>
        <span style={{ color: C.textFaint, marginRight: 10, userSelect: 'none' }}>$</span>
        {cmd}
      </div>
      <button
        onClick={handleCopy}
        style={{
          background: 'transparent', border: 'none',
          borderLeft: `1px solid rgba(250,250,250,0.15)`,
          color: C.textInv, fontFamily: FONT_MONO,
          fontSize: 11, letterSpacing: '0.18em',
          cursor: 'pointer', padding: '0 16px',
          opacity: 0.7,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = 0.7)}
      >
        COPY
      </button>
    </div>
  );
}

// ─── Sub: 本地运行 Modal（详细教程）────────────────────────────────────
function RunLocallyModal({ open, onClose }) {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={760}
      destroyOnClose
      title={
        <div style={{
          fontFamily: FONT_SANS,
          fontSize: 22, fontWeight: 800,
          letterSpacing: '-0.02em',
          color: C.text,
        }}>
          本地运行 Skill Evaluator
        </div>
      }
      styles={{
        body: { padding: '4px 24px 24px', fontFamily: FONT_SANS },
      }}
    >
      {/* 系统要求 */}
      <div style={{ marginBottom: 24, padding: '12px 16px', background: C.bgSubtle, border: `1px solid ${C.borderSoft}` }}>
        <div style={{
          fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '0.18em',
          color: C.textFaint, marginBottom: 8,
        }}>
          REQUIREMENTS
        </div>
        <div style={{ fontSize: 13, color: C.text, lineHeight: 1.7 }}>
          <div>· <strong>Node.js</strong> ≥ 20.x（推荐 20 LTS，<a href="https://nodejs.org/" target="_blank" rel="noreferrer" style={{ color: C.text }}>下载</a>）</div>
          <div>· <strong>Python 3</strong>（macOS / Linux 一般已自带，Windows 需 <a href="https://python.org" target="_blank" rel="noreferrer" style={{ color: C.text }}>下载</a>）</div>
          <div>· <strong>Git</strong>（<a href="https://git-scm.com/" target="_blank" rel="noreferrer" style={{ color: C.text }}>下载</a>）</div>
          <div>· <strong>PostgreSQL</strong>（可选，本地评估用，推荐 <a href="https://neon.tech/" target="_blank" rel="noreferrer" style={{ color: C.text }}>Neon 免费实例</a>）</div>
        </div>
      </div>

      {/* 步骤 1 */}
      <Step num="01" title="克隆仓库">
        <CmdLine cmd="git clone https://github.com/uaandesign/skill-evaluator.git" />
        <CmdLine cmd="cd skill-evaluator" />
      </Step>

      {/* 步骤 2 */}
      <Step num="02" title="安装依赖">
        <CmdLine cmd="npm install" />
        <Hint>第一次安装约 1–3 分钟，下载 React / Express / @neondatabase/serverless 等。</Hint>
      </Step>

      {/* 步骤 3 */}
      <Step num="03" title="配置环境变量（可选）">
        <p style={{ fontSize: 13, color: C.textSub, marginTop: 0, marginBottom: 8 }}>
          如果你想用数据库存评估历史，需要配置 <code style={inlineCode}>DATABASE_URL</code>。
          不配置也能运行（评估能跑，但不持久化）。
        </p>
        <CmdLine cmd="cp .env.example .env" />
        <p style={{ fontSize: 13, color: C.textSub, margin: '8px 0' }}>
          编辑 <code style={inlineCode}>.env</code>，填入 Neon Postgres 连接串：
        </p>
        <CmdLine cmd="DATABASE_URL=postgresql://user:pass@xxx-pooler.region.aws.neon.tech/db?sslmode=require" />
        <CmdLine cmd="ADMIN_TOKEN=your-secret" />
        <Hint>
          连接串必须是 <strong>pooler</strong> 域名，并且带 <code style={inlineCode}>?sslmode=require</code>。
          否则 serverless 函数连不上 Neon。
        </Hint>
      </Step>

      {/* 步骤 4 */}
      <Step num="04" title="构建 + 启动（生产模式）">
        <CmdLine cmd="npm run build" />
        <CmdLine cmd="npm start" />
        <Hint>
          启动后访问 <a href="http://localhost:3000" target="_blank" rel="noreferrer" style={{ color: C.text }}>http://localhost:3000</a>
        </Hint>
      </Step>

      {/* 步骤 5 (可选) */}
      <Step num="05" title="开发模式（可选，自动热更新）">
        <p style={{ fontSize: 13, color: C.textSub, marginTop: 0, marginBottom: 8 }}>
          想改代码看实时效果时用这个：
        </p>
        <CmdLine cmd="npm run dev" />
        <Hint>
          会同时启动前端（Vite 5173 端口）+ 后端（dev-server.js 3001 端口）。
          访问 <code style={inlineCode}>http://localhost:5173</code>
        </Hint>
      </Step>

      {/* 故障排查 */}
      <div style={{ marginTop: 28, paddingTop: 20, borderTop: `1px solid ${C.borderSoft}` }}>
        <div style={{
          fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '0.18em',
          color: C.textFaint, marginBottom: 12,
        }}>
          TROUBLESHOOTING / 故障排查
        </div>
        <Trouble
          q="启动后访问 /api/health 返回 502？"
          a={<>检查 <code style={inlineCode}>DATABASE_URL</code> 是否正确，连接串末尾必须有 <code style={inlineCode}>?sslmode=require</code>。</>}
        />
        <Trouble
          q="评估时报 'spawn python3 ENOENT'？"
          a={<>说明系统没有 <strong>python3</strong> 命令。Mac 用 <code style={inlineCode}>brew install python3</code>，Windows 去 python.org 下载并勾选 "Add to PATH"。</>}
        />
        <Trouble
          q="没有数据库怎么用？"
          a={<>不配置 DATABASE_URL 也能跑评估，但内置标准从 zip 上传的方式提供：在配置中心上传 zip 评估标准即可。</>}
        />
      </div>

      {/* GitHub link */}
      <div style={{
        marginTop: 24, padding: '12px 16px',
        background: C.bgInverse, color: C.textInv,
        fontFamily: FONT_MONO, fontSize: 12,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ letterSpacing: '0.06em', opacity: 0.8 }}>
          源代码 / 提 Issue / 贡献：
        </span>
        <a
          href="https://github.com/uaandesign/skill-evaluator"
          target="_blank" rel="noreferrer"
          style={{ color: C.textInv, textDecoration: 'underline' }}
        >
          github.com/uaandesign/skill-evaluator ↗
        </a>
      </div>
    </Modal>
  );
}

// ─── Modal 子组件 ─────────────────────────────────────────────────────
function Step({ num, title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 10 }}>
        <span style={{
          fontFamily: FONT_MONO, fontSize: 11,
          color: C.textFaint, letterSpacing: '0.18em',
          minWidth: 24,
        }}>{num}</span>
        <h3 style={{
          fontFamily: FONT_SANS,
          fontSize: 16, fontWeight: 700,
          margin: 0, color: C.text, letterSpacing: '-0.01em',
        }}>{title}</h3>
      </div>
      <div style={{ paddingLeft: 36 }}>
        {children}
      </div>
    </div>
  );
}

function Hint({ children }) {
  return (
    <div style={{
      fontSize: 12, color: C.textSub,
      lineHeight: 1.6,
      paddingLeft: 8, borderLeft: `2px solid ${C.borderSoft}`,
      marginTop: 6,
    }}>
      {children}
    </div>
  );
}

function Trouble({ q, a }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>
        Q: {q}
      </div>
      <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6, paddingLeft: 16 }}>
        {a}
      </div>
    </div>
  );
}

const inlineCode = {
  fontFamily: FONT_MONO,
  fontSize: 12,
  background: C.bgSubtle,
  border: `1px solid ${C.borderSoft}`,
  padding: '1px 5px',
  color: C.text,
};
