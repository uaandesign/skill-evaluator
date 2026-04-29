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
            itemBorderRadius: 0,                         /* hermes 风格无圆角 */
            // 浅色 menu (内容页) - 不会用到，因为 sider 用 dark theme
            itemSelectedBg: '#eff6ff',
            itemSelectedColor: '#1d4ed8',
            itemHoverBg: '#eff6ff',
            itemHoverColor: '#2563eb',
            // 深色 menu (sider) hermes 风格
            darkItemBg: 'transparent',
            darkSubMenuItemBg: 'transparent',
            darkItemColor: '#a39880',
            darkItemSelectedBg: 'rgba(212, 184, 255, 0.10)',
            darkItemSelectedColor: '#ede4d0',
            darkItemHoverBg: 'rgba(237, 228, 208, 0.06)',
            darkItemHoverColor: '#ede4d0',
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
        <Layout style={{ height: '100vh', background: '#f4f6f9' }}>
        <Header
          style={{
            height: '52px', lineHeight: '52px', padding: '0 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: '1px solid rgba(237, 228, 208, 0.12)',
            backgroundColor: '#0d1311', /* hermes 深绿黑色 */
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img
              src="/huo.svg"
              alt="VolcD"
              style={{
                width: '26px', height: '26px', objectFit: 'contain',
                filter: 'invert(0.92) sepia(0.3) hue-rotate(15deg)',  /* 让 logo 与浅色调协调 */
              }}
            />
            <span style={{
              fontFamily: "'Cormorant Garamond', Georgia, 'Times New Roman', serif",
              fontSize: '20px', fontWeight: 500, color: '#ede4d0', letterSpacing: '-0.01em',
            }}>Skill Evaluator</span>
            <div style={{ width: '1px', height: '14px', background: 'rgba(237,228,208,0.20)' }} />
            <span style={{
              fontFamily: "'SF Mono', 'JetBrains Mono', Menlo, monospace",
              fontSize: '11px', color: '#a39880', letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>{getTabTitle()}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              fontFamily: "'SF Mono', monospace",
              fontSize: '10px', color: '#a39880', background: 'rgba(212, 184, 255, 0.10)',
              padding: '3px 10px', borderRadius: '0', fontWeight: 500,
              border: '1px solid rgba(212, 184, 255, 0.20)',
              letterSpacing: '0.12em', lineHeight: '18px',
            }}>MVP 1.0</span>
          </div>
        </Header>

        <Layout style={{ flex: 1, overflow: 'hidden' }}>
          <Sider
            collapsed={collapsed} onCollapse={setCollapsed} collapsible trigger={null}
            width={196} collapsedWidth={56}
            style={{
              backgroundColor: '#0d1311',
              borderRight: '1px solid rgba(237, 228, 208, 0.12)',
              overflow: 'auto',
            }}
          >
            <div style={{ padding: '8px 4px' }}>
              <Menu
                mode="inline"
                selectedKeys={[activeTab]}
                items={menuItems}
                onClick={({ key }) => setActiveTab(key)}
                style={{
                  border: 'none', background: 'transparent', fontSize: '12px',
                  color: '#a39880',
                  fontFamily: "'SF Mono', 'JetBrains Mono', Menlo, monospace",
                  letterSpacing: '0.06em',
                }}
                theme="dark"
              />
            </div>
            <div
              onClick={() => setCollapsed(!collapsed)}
              style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                padding: '12px', textAlign: 'center',
                borderTop: '1px solid rgba(237, 228, 208, 0.08)',
                cursor: 'pointer', fontSize: '12px',
                color: '#6a6052', userSelect: 'none',
                transition: 'color 200ms',
                fontFamily: "'SF Mono', monospace",
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
