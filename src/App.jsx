import React, { useState } from 'react';
import { Layout, Menu, ConfigProvider, App as AntApp } from 'antd';
import { useStore } from './store';
import CompareTest from './components/CompareTest';
import ConfigCenter from './components/ConfigCenter';
import SkillLibrary from './components/SkillLibrary';
import SkillEditor from './components/SkillEditor';
import SkillEditorMVP from './components/SkillEditorMVP';
import QualityEval from './components/QualityEval';
import SkillEvaluatorModule from './components/SkillEvaluatorModule';
import HomePage from './components/HomePage';

const { Header, Sider, Content } = Layout;

const App = () => {
  const { activeTab, setActiveTab } = useStore();
  const [collapsed, setCollapsed] = useState(false);

  const menuItems = [
    { key: 'home',            label: '首页' },
    { key: 'skill-evaluator', label: '技能评估' },
    { key: 'skill-editor',    label: '技能编辑' },
    { key: 'skill-library',   label: '技能库' },
    { key: 'config-center',   label: '配置中心' },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'home':            return <HomePage />;
      case 'compare-test':    return <CompareTest />;
      case 'config-center':   return <ConfigCenter />;
      case 'skill-library':   return <SkillLibrary />;
      case 'skill-editor':    return <SkillEditorMVP />;
      case 'skill-editor-legacy': return <SkillEditor />; /* 旧版（含运行测试），保留以备后续二期启用 */
      case 'quality-eval':    return <QualityEval />;
      case 'skill-evaluator': return <SkillEvaluatorModule />;
      default:                return <HomePage />;  // 默认进首页
    }
  };

  const getTabTitle = () => {
    const item = menuItems.find(m => m.key === activeTab);
    return item ? item.label : '';
  };

  const isFullWidth = activeTab === 'compare-test' || activeTab === 'skill-evaluator'
    || activeTab === 'skill-editor' || activeTab === 'home';

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#2563eb',
          colorPrimaryHover: '#1d4ed8',
          colorPrimaryActive: '#1e40af',
          colorSuccess: '#16a34a',
          colorWarning: '#d97706',
          colorError: '#dc2626',
          colorTextBase: '#111827',
          colorBgBase: '#ffffff',
          borderRadius: 8,
          borderRadiusLG: 12,
          borderRadiusSM: 6,
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans SC', sans-serif",
          fontSize: 13,
          lineHeight: 1.5,
          colorBorder: '#e5e7eb',
          colorBorderSecondary: '#f3f4f6',
          controlHeight: 34,
          controlHeightLG: 40,
          controlHeightSM: 28,
          boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        },
        components: {
          Menu: {
            itemHeight: 38,
            itemMarginInline: 4,
            itemBorderRadius: 0,                  /* hermes 风格无圆角 */
            itemColor: '#525252',
            itemSelectedBg: '#0a0a0a',            /* 黑底反白选中态 */
            itemSelectedColor: '#ffffff',
            itemHoverBg: '#f5f5f5',
            itemHoverColor: '#0a0a0a',
            itemActiveBg: '#0a0a0a',
            itemPaddingInline: 14,
          },
          Button: {
            borderRadius: 8,
            primaryShadow: '0 1px 3px rgba(0,0,0,0.12)',
          },
          Card: {
            borderRadiusLG: 12,
          },
          Input: {
            borderRadius: 8,
          },
          Select: {
            borderRadius: 8,
          },
          Modal: {
            borderRadiusLG: 16,
          },
        },
      }}
    >
      <AntApp>
        <Layout style={{ height: '100vh', background: '#fff' }}>
        <Header
          style={{
            height: '56px', lineHeight: '56px', padding: '0 28px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: '1px solid #e5e7eb',
            backgroundColor: '#ffffff',
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <img
              src="/huo.svg"
              alt="VolcD"
              style={{ width: '24px', height: '24px', objectFit: 'contain' }}
            />
            {/* 衬线大字标题，与首页保持一致 */}
            <span style={{
              fontFamily: "'Cormorant Garamond', 'Source Serif Pro', Georgia, 'Times New Roman', serif",
              fontSize: '22px', fontWeight: 500, color: '#0a0a0a', letterSpacing: '-0.01em',
            }}>Skill Evaluator</span>
            <div style={{ width: '1px', height: '16px', background: '#e5e7eb' }} />
            {/* 当前 tab 名用等宽小字（hermes 标签风格） */}
            <span style={{
              fontFamily: "'SF Mono', 'JetBrains Mono', Menlo, monospace",
              fontSize: '11px', color: '#6b7280', letterSpacing: '0.14em', textTransform: 'uppercase',
            }}>{getTabTitle()}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              fontFamily: "'SF Mono', 'JetBrains Mono', Menlo, monospace",
              fontSize: '10px', color: '#0a0a0a',
              background: 'transparent',
              padding: '3px 10px', borderRadius: '0', fontWeight: 600,
              border: '1px solid #0a0a0a',
              letterSpacing: '0.14em', lineHeight: '18px',
            }}>MVP 1.0</span>
          </div>
        </Header>

        <Layout style={{ flex: 1, overflow: 'hidden' }}>
          <Sider
            collapsed={collapsed} onCollapse={setCollapsed} collapsible trigger={null}
            width={200} collapsedWidth={56}
            style={{
              backgroundColor: '#ffffff',
              borderRight: '1px solid #e5e7eb',
              overflow: 'auto',
            }}
          >
            <div style={{ padding: '12px 6px' }}>
              <Menu
                mode="inline"
                selectedKeys={[activeTab]}
                items={menuItems}
                onClick={({ key }) => setActiveTab(key)}
                style={{
                  border: 'none', background: 'transparent', fontSize: '12px',
                  fontFamily: "'SF Mono', 'JetBrains Mono', Menlo, monospace",
                  letterSpacing: '0.06em',
                }}
              />
            </div>
            <div
              onClick={() => setCollapsed(!collapsed)}
              style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                padding: '12px', textAlign: 'center',
                borderTop: '1px solid #f3f4f6',
                cursor: 'pointer', fontSize: '11px',
                color: '#9ca3af', userSelect: 'none',
                transition: 'color 200ms',
                fontFamily: "'SF Mono', 'JetBrains Mono', Menlo, monospace",
                letterSpacing: '0.12em',
              }}
            >
              {collapsed ? '→' : '←'}
            </div>
          </Sider>
          <Content style={{ padding: isFullWidth ? '0' : '20px 24px', overflow: isFullWidth ? 'hidden' : 'auto', backgroundColor: '#f4f6f9' }}>
            <div style={{ maxWidth: isFullWidth ? '100%' : '1400px', margin: '0 auto', height: isFullWidth ? '100%' : 'auto' }}>
              {renderContent()}
            </div>
          </Content>
        </Layout>
      </Layout>
      </AntApp>
    </ConfigProvider>
  );
};

export default App;
