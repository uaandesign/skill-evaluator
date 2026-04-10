import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import './index.css';

// Monochrome theme configuration
const theme = {
  token: {
    colorPrimary: '#111827',
    colorSuccess: '#374151',
    colorWarning: '#6b7280',
    colorError: '#374151',
    colorInfo: '#4b5563',
    colorTextBase: '#111827',
    colorBgBase: '#ffffff',

    borderRadius: 8,
    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    boxShadowSecondary: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',

    fontSize: 14,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans SC', sans-serif",
    lineHeight: 1.5715,

    margin: 16,
    marginXS: 8,
    marginSM: 12,
    marginMD: 16,
    marginLG: 24,
    marginXL: 32,
    padding: 16,
    paddingXS: 8,
    paddingSM: 12,
    paddingMD: 16,
    paddingLG: 24,
    paddingXL: 32,
  },
  components: {
    Button: {
      primaryColor: '#111827',
      borderRadius: 6,
      controlHeight: 36,
    },
    Input: {
      borderRadius: 6,
      controlHeight: 36,
    },
    Select: {
      borderRadius: 6,
      controlHeight: 36,
    },
    Card: {
      borderRadius: 8,
      boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    },
    Menu: {
      itemBg: 'transparent',
      itemHoverBg: '#f3f4f6',
      itemSelectedBg: '#f3f4f6',
      itemSelectedColor: '#111827',
    },
    Layout: {
      headerBg: '#ffffff',
      headerHeight: 52,
      headerPadding: '0 20px',
      headerColor: '#111827',
      siderBg: '#ffffff',
    },
  },
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN} theme={theme}>
      <App />
    </ConfigProvider>
  </React.StrictMode>
);
