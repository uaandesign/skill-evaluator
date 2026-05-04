/**
 * App.jsx — 根组件
 * ─────────────────────────────────────────────────────────────────────────
 * 变更说明（本次）：
 *   1. 未登录时展示独立全屏登录页，与首页风格完全一致（黑白极简）
 *   2. 登录后才能访问所有平台功能
 *   3. 全局强制方形边框：ConfigProvider + CSS 变量双重覆盖
 *   4. Header/Sidebar/Content 样式统一对齐首页黑白设计语言
 */

import React, { useState, useEffect } from 'react';
import {
  Layout, Menu, ConfigProvider, App as AntApp,
  Form, Input, Button, message, Dropdown, Divider,
} from 'antd';
import { useStore } from './store';
import CompareTest          from './components/CompareTest';
import ConfigCenter         from './components/ConfigCenter';
import SkillLibrary         from './components/SkillLibrary';
import SkillEditor          from './components/SkillEditor';
import SkillEditorMVP       from './components/SkillEditorMVP';
import QualityEval          from './components/QualityEval';
import SkillEvaluatorModule from './components/SkillEvaluatorModule';
import HomePage             from './components/HomePage';

const { Header, Sider, Content } = Layout;

// ─── Design tokens（与 HomePage 完全一致）────────────────────────────────
const FONT_SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif";
const FONT_MONO = "'SF Mono', 'JetBrains Mono', 'Roboto Mono', Menlo, Consolas, monospace";
const C = {
  bg:         '#ffffff',
  bgSubtle:   '#fafafa',
  bgCmd:      '#f5f5f5',
  text:       '#0a0a0a',
  textSub:    '#525252',
  textFaint:  '#9ca3af',
  border:     '#0a0a0a',
  borderSoft: '#e5e7eb',
};

// ─── Ant Design 全局主题（方形 + 黑白）────────────────────────────────────
const ANT_THEME = {
  token: {
    colorPrimary:         '#0a0a0a',
    colorPrimaryHover:    '#2d2d2d',
    colorPrimaryActive:   '#000000',
    colorSuccess:         '#16a34a',
    colorWarning:         '#d97706',
    colorError:           '#dc2626',
    colorTextBase:        '#0a0a0a',
    colorBgBase:          '#ffffff',
    // 全局方形
    borderRadius:         0,
    borderRadiusLG:       0,
    borderRadiusSM:       0,
    borderRadiusXS:       0,
    fontFamily:           FONT_SANS,
    fontSize:             13,
    lineHeight:           1.5,
    colorBorder:          '#e5e7eb',
    colorBorderSecondary: '#f3f4f6',
    controlHeight:        36,
    controlHeightLG:      42,
    controlHeightSM:      28,
    boxShadow:            'none',
    boxShadowSecondary:   '0 2px 8px rgba(0,0,0,0.06)',
  },
  components: {
    Menu: {
      itemHeight:        38,
      itemMarginInline:  0,
      itemBorderRadius:  0,
      itemColor:         '#525252',
      itemSelectedBg:    '#0a0a0a',
      itemSelectedColor: '#ffffff',
      itemHoverBg:       '#f5f5f5',
      itemHoverColor:    '#0a0a0a',
      itemActiveBg:      '#0a0a0a',
      itemPaddingInline: 16,
    },
    Button:   { borderRadius: 0, primaryShadow: 'none', fontWeight: 600, defaultShadow: 'none' },
    Card:     { borderRadius: 0, boxShadow: 'none', borderColor: '#e5e7eb' },
    Input:    { borderRadius: 0, activeShadow: 'none' },
    Select:   { borderRadius: 0 },
    Modal:    { borderRadius: 0 },
    Table:    { borderRadius: 0, headerBg: '#fafafa', headerColor: '#525252', headerBorderRadius: 0 },
    Tag:      { borderRadius: 0 },
    Switch:   { colorPrimary: '#0a0a0a', colorPrimaryHover: '#2d2d2d' },
    Tabs:     { inkBarColor: '#0a0a0a', itemActiveColor: '#0a0a0a', itemSelectedColor: '#0a0a0a', borderRadius: 0 },
    Collapse: { borderRadius: 0, headerBg: '#fafafa' },
    Alert:    { borderRadius: 0 },
    Badge:    { borderRadius: 0 },
    Tooltip:  { borderRadius: 0 },
    Popover:  { borderRadius: 0 },
    Dropdown: { borderRadius: 0 },
    Upload:   { borderRadius: 0 },
    Progress: { borderRadius: 0 },
  },
};

// ─── Auth API ─────────────────────────────────────────────────────────────
async function callAuthApi(action, body) {
  const res = await fetch(`/api/auth/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ═══════════════════════════════════════════════════════════════════════════
// LoginPage — 全屏登录页，风格与 HomePage 完全一致
// ═══════════════════════════════════════════════════════════════════════════
function LoginPage({ onSuccess }) {
  const [mode, setMode]       = useState('login'); // 'login' | 'register'
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => { form.resetFields(); }, [mode]);

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      const data = await callAuthApi(mode, values);
      onSuccess(data.user, data.token);
    } catch (err) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', width: '100%',
      background: C.bg, color: C.text,
      fontFamily: FONT_SANS,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* ── 顶部 PILL（与首页一致）── */}
      <div style={{
        textAlign: 'center', paddingTop: 72, marginBottom: 40,
        fontFamily: FONT_MONO, fontSize: 11,
        letterSpacing: '0.22em', color: C.textFaint,
      }}>
        OPEN SOURCE  ·  MIT LICENSE
      </div>

      {/* ── 巨型标题 ── */}
      <h1 style={{
        fontFamily: FONT_SANS,
        fontSize: 'clamp(40px, 6vw, 80px)',
        fontWeight: 800,
        letterSpacing: '-0.04em',
        lineHeight: 0.95,
        textAlign: 'center',
        color: C.text,
        margin: '0 0 20px',
      }}>
        Skill Evaluator
      </h1>

      {/* ── 副标题 ── */}
      <p style={{
        fontFamily: FONT_MONO, fontSize: 11,
        letterSpacing: '0.18em', color: C.textFaint,
        textAlign: 'center', margin: '0 0 56px',
      }}>
        {mode === 'login' ? 'SIGN IN TO CONTINUE' : 'CREATE YOUR ACCOUNT'}
      </p>

      {/* ── 表单容器 ── */}
      <div style={{
        width: '100%', maxWidth: 400,
        margin: '0 auto', padding: '0 24px',
        flex: 1,
      }}>
        {/* 表单标题 */}
        <div style={{
          fontFamily: FONT_SANS, fontSize: 18, fontWeight: 800,
          letterSpacing: '-0.02em', color: C.text,
          marginBottom: 28,
          borderBottom: `1px solid ${C.borderSoft}`,
          paddingBottom: 16,
        }}>
          {mode === 'login' ? '登录' : '注册账号'}
        </div>

        <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark={false}>
          {mode === 'register' && (
            <Form.Item
              label={<FieldLabel>显示名称（可选）</FieldLabel>}
              name="displayName"
            >
              <Input placeholder="你的名字" style={inputSt} />
            </Form.Item>
          )}

          <Form.Item
            label={<FieldLabel>邮箱</FieldLabel>}
            name="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '邮箱格式不正确' },
            ]}
          >
            <Input placeholder="you@example.com" style={inputSt} />
          </Form.Item>

          <Form.Item
            label={<FieldLabel>密码{mode === 'register' ? '（至少 8 位）' : ''}</FieldLabel>}
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              ...(mode === 'register' ? [{ min: 8, message: '密码至少 8 位' }] : []),
            ]}
          >
            <Input.Password placeholder="••••••••" style={inputSt} />
          </Form.Item>

          {/* 主按钮 */}
          <Form.Item style={{ marginTop: 8, marginBottom: 0 }}>
            <LoginBtn loading={loading}>
              {mode === 'login' ? '登录 →' : '注册 →'}
            </LoginBtn>
          </Form.Item>
        </Form>

        {/* 切换模式 */}
        <div style={{
          marginTop: 24, paddingTop: 20,
          borderTop: `1px solid ${C.borderSoft}`,
          textAlign: 'center',
          fontFamily: FONT_SANS, fontSize: 13, color: C.textSub,
        }}>
          {mode === 'login' ? (
            <>还没有账号？{' '}
              <SwitchBtn onClick={() => setMode('register')}>立即注册</SwitchBtn>
            </>
          ) : (
            <>已有账号？{' '}
              <SwitchBtn onClick={() => setMode('login')}>直接登录</SwitchBtn>
            </>
          )}
        </div>
      </div>

      {/* ── Footer（与首页一致）── */}
      <div style={{
        maxWidth: 980, width: '100%', margin: '64px auto 0',
        padding: '24px 32px',
        borderTop: `1px solid ${C.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontFamily: FONT_MONO, fontSize: 11,
        letterSpacing: '0.1em', color: C.textFaint,
        flexWrap: 'wrap', gap: 12,
      }}>
        <div>SKILL EVALUATOR  /  MVP 1.0  /  2026</div>
        <a
          href="https://github.com/uaandesign/skill-evaluator"
          target="_blank" rel="noreferrer"
          style={{ color: C.textSub, textDecoration: 'none', letterSpacing: '0.1em' }}
        >
          GITHUB ↗
        </a>
      </div>
    </div>
  );
}

// LoginPage 子组件
const FieldLabel = ({ children }) => (
  <span style={{
    fontFamily: FONT_MONO, fontSize: 10,
    letterSpacing: '0.14em', color: C.textSub,
    textTransform: 'uppercase',
  }}>
    {children}
  </span>
);

// 主按钮 — 黑底白字，hover 变灰，与首页 CTA 一致
function LoginBtn({ children, loading, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="submit"
      disabled={loading}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%', height: 46,
        background: hover ? '#2d2d2d' : C.text,
        color: '#ffffff', border: 'none', borderRadius: 0,
        fontFamily: FONT_SANS, fontSize: 14, fontWeight: 700,
        letterSpacing: '0.02em', cursor: loading ? 'not-allowed' : 'pointer',
        transition: 'background 0.15s ease',
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading ? '请稍候...' : children}
    </button>
  );
}

const SwitchBtn = ({ children, onClick }) => (
  <button
    onClick={onClick}
    style={{
      background: 'none', border: 'none', cursor: 'pointer',
      color: C.text, fontWeight: 700, fontSize: 13,
      fontFamily: FONT_SANS, padding: 0, textDecoration: 'underline',
    }}
  >
    {children}
  </button>
);

const inputSt = {
  borderRadius: 0,
  borderColor: C.borderSoft,
  fontFamily: FONT_SANS,
  height: 42,
  fontSize: 13,
};

// ═══════════════════════════════════════════════════════════════════════════
// MainLayout — 登录后的主界面
// ═══════════════════════════════════════════════════════════════════════════
function MainLayout() {
  const { activeTab, setActiveTab, authUser, authToken, setAuth, clearAuth } = useStore();
  const [collapsed, setCollapsed] = useState(false);

  // 启动时验证本地 token
  useEffect(() => {
    if (!authToken) return;
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${authToken}` } })
      .then((r) => r.json())
      .then((d) => { if (d.user) setAuth(d.user, authToken); else clearAuth(); })
      .catch(() => {});
  }, []); // eslint-disable-line

  const menuItems = [
    { key: 'home',            label: '首页' },
    { key: 'skill-evaluator', label: '技能评估' },
    { key: 'skill-editor',    label: '技能编辑' },
    { key: 'skill-library',   label: '技能库' },
    { key: 'config-center',   label: '配置中心' },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'home':                return <HomePage />;
      case 'compare-test':        return <CompareTest />;
      case 'config-center':       return <ConfigCenter />;
      case 'skill-library':       return <SkillLibrary />;
      case 'skill-editor':        return <SkillEditorMVP />;
      case 'skill-editor-legacy': return <SkillEditor />;
      case 'quality-eval':        return <QualityEval />;
      case 'skill-evaluator':     return <SkillEvaluatorModule />;
      default:                    return <HomePage />;
    }
  };

  const isFullWidth  = ['compare-test', 'skill-evaluator', 'skill-editor', 'home'].includes(activeTab);
  const tabLabel     = menuItems.find((m) => m.key === activeTab)?.label || '';

  // 用户下拉
  const userMenu = {
    items: [
      {
        key: 'email', disabled: true,
        label: <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.textSub }}>{authUser?.email}</span>,
      },
      { type: 'divider' },
      { key: 'logout', label: '退出登录', danger: true },
    ],
    onClick: ({ key }) => {
      if (key === 'logout') {
        clearAuth();
        message.success('已退出登录');
      }
    },
  };

  return (
    <Layout style={{ height: '100vh', background: C.bg }}>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <Header style={{
        height: 52, lineHeight: '52px', padding: '0 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `1px solid ${C.borderSoft}`,
        backgroundColor: C.bg, zIndex: 10,
      }}>
        {/* 左：Logo + 当前页 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/huo.svg" alt="Logo" style={{ width: 22, height: 22, objectFit: 'contain' }} />
          <span style={{
            fontFamily: FONT_SANS, fontSize: 15, fontWeight: 800,
            color: C.text, letterSpacing: '-0.02em',
          }}>
            Skill Evaluator
          </span>
          {activeTab !== 'home' && (
            <>
              <div style={{ width: 1, height: 14, background: C.borderSoft }} />
              <span style={{
                fontFamily: FONT_MONO, fontSize: 10,
                color: C.textFaint, letterSpacing: '0.16em', textTransform: 'uppercase',
              }}>
                {tabLabel}
              </span>
            </>
          )}
        </div>

        {/* 右：用户信息 + 版本 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Dropdown menu={userMenu} trigger={['click']}>
            <button style={{
              background: C.bgSubtle, border: `1px solid ${C.borderSoft}`,
              borderRadius: 0, cursor: 'pointer', padding: '4px 12px',
              display: 'flex', alignItems: 'center', gap: 7,
              fontFamily: FONT_MONO, fontSize: 11, color: C.text,
            }}>
              {/* 头像 */}
              <span style={{
                width: 20, height: 20, borderRadius: '50%',
                background: C.text, color: '#fff',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, flexShrink: 0,
              }}>
                {(authUser?.display_name || authUser?.email || '?')[0].toUpperCase()}
              </span>
              <span>{authUser?.display_name || authUser?.email?.split('@')[0]}</span>
              <span style={{ color: C.textFaint, fontSize: 10 }}>▾</span>
            </button>
          </Dropdown>

          <span style={{
            fontFamily: FONT_MONO, fontSize: 10, color: C.textSub,
            border: `1px solid ${C.borderSoft}`, padding: '3px 8px',
            background: C.bgSubtle, letterSpacing: '0.12em',
          }}>
            MVP 1.0
          </span>
        </div>
      </Header>

      <Layout style={{ flex: 1, overflow: 'hidden' }}>
        {/* ── Sidebar ───────────────────────────────────────────────── */}
        <Sider
          collapsed={collapsed} onCollapse={setCollapsed}
          collapsible trigger={null}
          width={176} collapsedWidth={52}
          style={{ backgroundColor: C.bg, borderRight: `1px solid ${C.borderSoft}`, overflow: 'auto' }}
        >
          <div style={{ padding: '10px 4px' }}>
            <Menu
              mode="inline"
              selectedKeys={[activeTab]}
              items={menuItems}
              onClick={({ key }) => setActiveTab(key)}
              style={{
                border: 'none', background: 'transparent',
                fontSize: 12, fontFamily: FONT_MONO, letterSpacing: '0.04em',
              }}
            />
          </div>
          <div
            onClick={() => setCollapsed(!collapsed)}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              padding: '10px', textAlign: 'center',
              borderTop: `1px solid ${C.borderSoft}`,
              cursor: 'pointer', fontSize: 11, color: C.textFaint,
              userSelect: 'none', fontFamily: FONT_MONO, letterSpacing: '0.1em',
            }}
          >
            {collapsed ? '→' : '←'}
          </div>
        </Sider>

        {/* ── Content ───────────────────────────────────────────────── */}
        <Content style={{
          padding:         isFullWidth ? 0 : '20px 24px',
          overflow:        isFullWidth ? 'hidden' : 'auto',
          backgroundColor: isFullWidth ? C.bg : '#f9fafb',
        }}>
          <div style={{
            maxWidth: isFullWidth ? '100%' : 1400,
            margin:   '0 auto',
            height:   isFullWidth ? '100%' : 'auto',
          }}>
            {renderContent()}
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// App — 根组件：判断登录状态，路由到登录页或主界面
// ═══════════════════════════════════════════════════════════════════════════
const App = () => {
  const { authUser, authToken, setAuth, clearAuth } = useStore();
  const [checking, setChecking] = useState(!!authToken); // token 验证中

  // 启动时验证 token 有效性
  useEffect(() => {
    if (!authToken) { setChecking(false); return; }
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${authToken}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d.user) setAuth(d.user, authToken);
        else clearAuth();
      })
      .catch(() => { /* 网络失败保留 token */ })
      .finally(() => setChecking(false));
  }, []); // eslint-disable-line

  // token 验证中，显示空白占位（避免闪屏）
  if (checking) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: FONT_MONO, fontSize: 11, letterSpacing: '0.18em', color: C.textFaint,
      }}>
        LOADING...
      </div>
    );
  }

  return (
    <ConfigProvider theme={ANT_THEME}>
      <AntApp>
        {/* 全局方形覆盖（针对 Ant Design 组件内部硬编码的圆角） */}
        <style>{`
          .ant-btn, .ant-input, .ant-input-affix-wrapper,
          .ant-select-selector, .ant-card, .ant-card-body,
          .ant-tag, .ant-alert, .ant-collapse,
          .ant-collapse-header, .ant-collapse-content,
          .ant-table-wrapper, .ant-modal-content,
          .ant-dropdown-menu, .ant-tooltip-inner,
          .ant-popover-inner, .ant-upload,
          .ant-progress-bg, .ant-badge-count,
          .ant-tabs-tab, .ant-input-number,
          .ant-picker, .ant-segmented {
            border-radius: 0 !important;
          }
        `}</style>

        {authUser
          ? <MainLayout />
          : <LoginPage onSuccess={(user, token) => {
              setAuth(user, token);
              message.success(`欢迎，${user.display_name || user.email}！`);
            }} />
        }
      </AntApp>
    </ConfigProvider>
  );
};

export default App;
