import React, { useState } from 'react';
import { Layout, Menu, ConfigProvider } from 'antd';
import { useStore } from './store';
import CompareTest from './components/CompareTest';
import ConfigCenter from './components/ConfigCenter';
import SkillLibrary from './components/SkillLibrary';
import SkillEditor from './components/SkillEditor';
import QualityEval from './components/QualityEval';
import SkillEvaluatorModule from './components/SkillEvaluatorModule';

const { Header, Sider, Content } = Layout;

const App = () => {
  const { activeTab, setActiveTab } = useStore();
  const [collapsed, setCollapsed] = useState(false);

  const menuItems = [
    { key: 'skill-evaluator', label: '技能评估' },
    { key: 'skill-editor', label: '技能编辑' },
    { key: 'skill-library', label: '技能库' },
    { key: 'config-center', label: '配置中心' },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'compare-test': return <CompareTest />;
      case 'config-center': return <ConfigCenter />;
      case 'skill-library': return <SkillLibrary />;
      case 'skill-editor': return <SkillEditor />;
      case 'quality-eval': return <QualityEval />;
      case 'skill-evaluator': return <SkillEvaluatorModule />;
      default: return <SkillEvaluatorModule />;
    }
  };

  const getTabTitle = () => {
    const item = menuItems.find(m => m.key === activeTab);
    return item ? item.label : '';
  };

  const isFullWidth = activeTab === 'compare-test' || activeTab === 'skill-evaluator' || activeTab === 'skill-editor';

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#111827',
          colorSuccess: '#374151',
          colorWarning: '#6b7280',
          colorError: '#374151',
          borderRadius: 8,
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans SC', sans-serif",
          fontSize: 13,
        },
        components: {
          Menu: { itemHeight: 40, itemMarginInline: 8 },
        },
      }}
    >
      <Layout style={{ height: '100vh', background: '#f9fafb' }}>
        <Header
          style={{
            height: '52px', lineHeight: '52px', padding: '0 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: '1px solid #e5e7eb', backgroundColor: '#fff',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)', zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '13px', fontWeight: 700, letterSpacing: '-0.5px' }}>SE</div>
            <span style={{ fontSize: '15px', fontWeight: 600, color: '#111827', letterSpacing: '-0.3px' }}>Skill Evaluator</span>
            <div style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#111827', opacity: 0.4 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 400 }}>{getTabTitle()}</span>
            <span style={{ fontSize: '10px', color: '#9ca3af', background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px', fontWeight: 500 }}>v2.0</span>
          </div>
        </Header>

        <Layout style={{ flex: 1, overflow: 'hidden' }}>
          <Sider
            collapsed={collapsed} onCollapse={setCollapsed} collapsible trigger={null}
            width={200} collapsedWidth={60}
            style={{ backgroundColor: '#fff', borderRight: '1px solid #e5e7eb', overflow: 'auto' }}
          >
            <div style={{ padding: '8px 0' }}>
              <Menu mode="inline" selectedKeys={[activeTab]} items={menuItems} onClick={({ key }) => setActiveTab(key)} style={{ border: 'none', background: 'transparent' }} />
            </div>
            <div onClick={() => setCollapsed(!collapsed)} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '10px', textAlign: 'center', borderTop: '1px solid #f3f4f6', cursor: 'pointer', fontSize: '14px', color: '#9ca3af', userSelect: 'none' }}>
              {collapsed ? '>' : '<'}
            </div>
          </Sider>
          <Content style={{ padding: isFullWidth ? '0' : '20px', overflow: isFullWidth ? 'hidden' : 'auto', backgroundColor: '#f9fafb' }}>
            <div style={{ maxWidth: isFullWidth ? '100%' : '1400px', margin: '0 auto', height: isFullWidth ? '100%' : 'auto' }}>
              {renderContent()}
            </div>
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
};

export default App;
