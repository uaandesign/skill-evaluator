/**
 * App.jsx — 根组件
 * ─────────────────────────────────────────────────────────────────────────
 * 变更说明（本次）：
 *   1. 新增登录/注册 Modal（邮箱 + 密码，调用 /api/auth/register & /login）
 *   2. Header 右侧显示已登录用户 + 退出下拉菜单
 *   3. 主题色从 blue 改为 black/white，对齐首页极简风格
 *   4. ConfigProvider 全局取消圆角，统一使用方形边框
 */

import React, { useState, useEffect } from 'react';
import {
  Layout, Menu, ConfigProvider, App as AntApp,
  Modal, Form, Input, Button, message, Dropdown, Divider,
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

// ─── 字体 / 颜色 Token（与 HomePage 保持一致）─────────────────────────────
const FONT_SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif";
const FONT_MONO = "'SF Mono', 'JetBrains Mono', 'Roboto Mono', Menlo, Consolas, monospace";
const C = {
  bg:         '#ffffff',
  bgSubtle:   '#fafafa',
  text:       '#0a0a0a',
  textSub:    '#525252',
  textFaint:  '#9ca3af',
  border:     '#0a0a0a',
  borderSoft: '#e5e7eb',
};

// ─── 调用认证 API ─────────────────────────────────────────────────────────
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

// ─── AuthModal ────────────────────────────────────────────────────────────
function AuthModal({ open, onClose, onSuccess }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) form.resetFields();
  }, [open, mode]);

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      const data = await callAuthApi(mode, values);
      onSuccess(data.user, data.token);
      onClose();
    } catch (err) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const labelSt = {
    fontFamily: FONT_MONO, fontSize: 10,
    letterSpacing: '0.14em', color: C.textSub,
    textTransform: 'uppercase',
  };
  const inputSt = {
    borderRadius: 0, borderColor: C.borderSoft,
    fontFamily: FONT_SANS, height: 40,
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={420}
      centered
      styles={{
        content: { borderRadius: 0, padding: 0, border: `1px solid ${C.border}`, boxShadow: 'none' },
        header:  { display: 'none' },
        mask:    { backdropFilter: 'blur(2px)', backgroundColor: 'rgba(0,0,0,0.3)' },
      }}
      closable={false}
    >
      <div style={{ padding: '36px 36px 28px', fontFamily: FONT_SANS }}>
        {/* 标题 */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{
            fontFamily: FONT_SANS, fontSize: 20, fontWeight: 800,
            letterSpacing: '-0.03em', color: C.text, margin: '0 0 6px',
          }}>
            {mode === 'login' ? '登录' : '注册账号'}
          </h2>
          <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: C.textFaint, letterSpacing: '0.18em' }}>
            {mode === 'login' ? 'SIGN IN · SKILL EVALUATOR' : 'CREATE YOUR ACCOUNT'}
          </div>
        </div>

        <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark={false}>
          {mode === 'register' && (
            <Form.Item label={<span style={labelSt}>显示名称（可选）</span>} name="displayName">
              <Input placeholder="你的名字" style={inputSt} />
            </Form.Item>
          )}

          <Form.Item
            label={<span style={labelSt}>邮箱</span>}
            name="email"
            rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '邮箱格式不正确' }]}
          >
            <Input placeholder="you@example.com" style={inputSt} />
          </Form.Item>

          <Form.Item
            label={<span style={labelSt}>密码{mode === 'register' ? '（至少 8 位）' : ''}</span>}
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              ...(mode === 'register' ? [{ min: 8, message: '密码至少 8 位' }] : []),
            ]}
          >
            <Input.Password placeholder="••••••••" style={inputSt} />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, marginTop: 4 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              style={{
                height: 42, borderRadius: 0,
                background: C.text, border: 'none',
                fontFamily: FONT_SANS, fontWeight: 700, fontSize: 13,
              }}
            >
              {mode === 'login' ? '登录' : '注册'}
            </Button>
          </Form.Item>
        </Form>

        <Divider style={{ borderColor: C.borderSoft, margin: '20px 0' }} />

        <div style={{ textAlign: 'center', fontSize: 13, color: C.textSub }}>
          {mode === 'login' ? (
            <>还没有账号？{' '}
              <button
                onClick={() => setMode('register')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text, fontWeight: 700, fontSize: 13, textDecoration: 'underline', padding: 0 }}
              >立即注册</button>
            </>
          ) : (
            <>已有账号？{' '}
              <button
                onClick={() => setMode('login')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text, fontWeight: 700, fontSize: 13, textDecoration: 'underline', padding: 0 }}
              >直接登录</button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ─── 主 App ───────────────────────────────────────────────────────────────
const App = () => {
  const { activeTab, setActiveTab, authUser, authToken, setAuth, clearAuth } = useStore();
  const [collapsed, setCollapsed]     = useState(false);
  const [authModalOpen, setAuthModal] = useState(false);

  // 启动时验证本地 token 是否仍有效
  useEffect(() => {
    if (!authToken) return;
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((r) => r.json())
      .then((d) => { if (d.user) setAuth(d.user, authToken); else clearAuth(); })
      .catch(() => { /* 网络失败不清除 */ });
  }, []); // eslint-disable-line

  const handleLogout = () => {
    clearAuth();
    message.success('已退出登录');
  };

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

  const isFullWidth = ['compare-test', 'skill-evaluator', 'skill-editor', 'home'].includes(activeTab);
  const tabLabel    = menuItems.find((m) => m.key === activeTab)?.label || '';

  // 用户下拉菜单
  const userDropMenu = {
    items: [
      { key: 'email', label: <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.textSub }}>{authUser?.email}</span>, disabled: true },
      { type: 'divider' },
      { key: 'logout', label: '退出登录', danger: true },
    ],
    onClick: ({ key }) => { if (key === 'logout') handleLogout(); },
  };

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary:         '#0a0a0a',
          colorPrimaryHover:    '#2d2d2d',
          colorPrimaryActive:   '#000000',
          colorSuccess:         '#16a34a',
          colorWarning:         '#d97706',
          colorError:           '#dc2626',
          colorTextBase:        '#0a0a0a',
          colorBgBase:          '#ffffff',
          borderRadius:         0,
          borderRadiusLG:       0,
          borderRadiusSM:       0,
          fontFamily:           FONT_SANS,
          fontSize:             13,
          lineHeight:           1.5,
          colorBorder:          '#e5e7eb',
          colorBorderSecondary: '#f3f4f6',
          controlHeight:        36,
          controlHeightLG:      42,
          controlHeightSM:      28,
          boxShadow:            'none',
          boxShadowSecondary:   '0 2px 8px rgba(0,0,0,0.08)',
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
          Button: { borderRadius: 0, primaryShadow: 'none', fontWeight: 600 },
          Card:   { borderRadius: 0, boxShadow: 'none', borderColor: '#e5e7eb' },
          Input:  { borderRadius: 0 },
          Select: { borderRadius: 0 },
          Modal:  { borderRadius: 0 },
          Table:  { borderRadius: 0, headerBg: '#fafafa', headerColor: '#525252' },
          Tag:    { borderRadius: 0 },
          Switch: { colorPrimary: '#0a0a0a', colorPrimaryHover: '#2d2d2d' },
          Tabs:   { borderRadius: 0, inkBarColor: '#0a0a0a', itemActiveColor: '#0a0a0a', itemSelectedColor: '#0a0a0a' },
        },
      }}
    >
      <AntApp>
        <Layout style={{ height: '100vh', background: '#fff' }}>

          {/* ── Header ──────────────────────────────────────────────── */}
          <Header style={{
            height: 52, lineHeight: '52px', padding: '0 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: `1px solid ${C.borderSoft}`,
            backgroundColor: '#ffffff',
            zIndex: 10,
          }}>
            {/* 左：Logo + 当前页 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img src="/huo.svg" alt="Logo" style={{ width: 22, height: 22, objectFit: 'contain' }} />
              <span style={{ fontFamily: FONT_SANS, fontSize: 15, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>
                Skill Evaluator
              </span>
              {activeTab !== 'home' && (
                <>
                  <div style={{ width: 1, height: 14, background: C.borderSoft }} />
                  <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: C.textFaint, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                    {tabLabel}
                  </span>
                </>
              )}
            </div>

            {/* 右：Auth + 版本标签 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {authUser ? (
                <Dropdown menu={userDropMenu} trigger={['click']}>
                  <button style={{
                    background: C.bgSubtle, border: `1px solid ${C.borderSoft}`,
                    borderRadius: 0, cursor: 'pointer', padding: '4px 12px',
                    display: 'flex', alignItems: 'center', gap: 7,
                    fontFamily: FONT_MONO, fontSize: 11, color: C.text, letterSpacing: '0.04em',
                  }}>
                    {/* 头像圆 */}
                    <span style={{
                      width: 20, height: 20, borderRadius: '50%',
                      background: C.text, color: '#fff',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, flexShrink: 0,
                    }}>
                      {(authUser.display_name || authUser.email || '?')[0].toUpperCase()}
                    </span>
                    {authUser.display_name || authUser.email?.split('@')[0]}
                    <span style={{ color: C.textFaint, fontSize: 10 }}>▾</span>
                  </button>
                </Dropdown>
              ) : (
                <button
                  onClick={() => setAuthModal(true)}
                  style={{
                    background: C.text, border: 'none', borderRadius: 0,
                    cursor: 'pointer', padding: '5px 14px',
                    fontFamily: FONT_MONO, fontSize: 11, color: '#fff',
                    letterSpacing: '0.1em', fontWeight: 600,
                  }}
                >
                  登录 / 注册
                </button>
              )}

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
            {/* ── Sidebar ───────────────────────────────────────────── */}
            <Sider
              collapsed={collapsed}
              onCollapse={setCollapsed}
              collapsible
              trigger={null}
              width={176}
              collapsedWidth={52}
              style={{ backgroundColor: '#ffffff', borderRight: `1px solid ${C.borderSoft}`, overflow: 'auto' }}
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
              {/* 折叠按钮 */}
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

            {/* ── Content ───────────────────────────────────────────── */}
            <Content style={{
              padding:         isFullWidth ? 0 : '20px 24px',
              overflow:        isFullWidth ? 'hidden' : 'auto',
              backgroundColor: isFullWidth ? '#ffffff' : '#f9fafb',
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

        {/* ── Auth Modal ────────────────────────────────────────────── */}
        <AuthModal
          open={authModalOpen}
          onClose={() => setAuthModal(false)}
          onSuccess={(user, token) => {
            setAuth(user, token);
            message.success(`欢迎，${user.display_name || user.email}！`);
          }}
        />
      </AntApp>
    </ConfigProvider>
  );
};

export default App;
