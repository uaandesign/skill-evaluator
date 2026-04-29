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
            itemHeight: 40,
            itemMarginInline: 6,
            itemBorderRadius: 8,
            itemSelectedBg: '#eff6ff',
            itemSelectedColor: '#1d4ed8',
            itemHoverBg: '#eff6ff',
            itemHoverColor: '#2563eb',
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
            borderBottom: '1px solid #e5e7eb', backgroundColor: '#fff',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)', zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img
              src="/huo.svg"
              alt="VolcD"
              style={{
                width: '30px',
                height: '30px',
                objectFit: 'contain'
              }}
            />
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#111827', letterSpacing: '-0.2px' }}>Skill Evaluator</span>
            <div style={{ width: '1px', height: '16px', background: '#e5e7eb' }} />
            <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 400 }}>{getTabTitle()}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#6b7280', background: '#f3f4f6', padding: '3px 10px', borderRadius: '6px', fontWeight: 500, border: '1px solid #e5e7eb', letterSpacing: '0.03em', lineHeight: '18px' }}>v2.0</span>
          </div>
        </Header>

        <Layout style={{ flex: 1, overflow: 'hidden' }}>
          <Sider
            collapsed={collapsed} onCollapse={setCollapsed} collapsible trigger={null}
            width={196} collapsedWidth={56}
            style={{ backgroundColor: '#fff', borderRight: '1px solid #e5e7eb', overflow: 'auto', boxShadow: '1px 0 4px rgba(0,0,0,0.03)' }}
          >
            <div style={{ padding: '8px 4px' }}>
              <Menu
                mode="inline"
                selectedKeys={[activeTab]}
                items={menuItems}
                onClick={({ key }) => setActiveTab(key)}
                style={{ border: 'none', background: 'transparent', fontSize: '13px' }}
              />
            </div>
            <div
              onClick={() => setCollapsed(!collapsed)}
              style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                padding: '12px', textAlign: 'center',
                borderTop: '1px solid #f3f4f6',
                cursor: 'pointer', fontSize: '12px',
                color: '#9ca3af', userSelect: 'none',
                transition: 'color 200ms',
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
