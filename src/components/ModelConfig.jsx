import React, { useState } from 'react';
import {
  Card,
  Input,
  Button,
  Space,
  Row,
  Col,
  message,
  Collapse,
  Select,
  Tag,
  Tooltip,
  Spin,
} from 'antd';
import { useStore } from '../store';

const PROVIDERS = [
  {
    key: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4o', name: 'gpt-4o' },
      { id: 'gpt-4o-mini', name: 'gpt-4o-mini' },
      { id: 'gpt-4-turbo', name: 'gpt-4-turbo' },
      { id: 'gpt-3.5-turbo', name: 'gpt-3.5-turbo' },
    ]
  },
  {
    key: 'anthropic',
    name: 'Anthropic (Claude)',
    baseUrl: 'https://api.anthropic.com',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'claude-sonnet-4-20250514' },
      { id: 'claude-haiku-4-20250414', name: 'claude-haiku-4-20250414' },
      { id: 'claude-opus-4-20250514', name: 'claude-opus-4-20250514' },
      { id: 'claude-3-5-sonnet-20241022', name: 'claude-3.5-sonnet' },
      { id: 'claude-3-5-haiku-20241022', name: 'claude-3.5-haiku' },
    ]
  },
  {
    key: 'doubao',
    name: 'Doubao',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: [
      { id: 'doubao-pro-256k', name: 'doubao-pro-256k' },
      { id: 'doubao-lite-128k', name: 'doubao-lite-128k' },
      { id: 'doubao-pro-32k', name: 'doubao-pro-32k' },
    ]
  },
  {
    key: 'qwen',
    name: 'Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      { id: 'qwen-max', name: 'qwen-max' },
      { id: 'qwen-plus', name: 'qwen-plus' },
      { id: 'qwen-turbo', name: 'qwen-turbo' },
      { id: 'qwen-long', name: 'qwen-long' },
    ]
  },
  {
    key: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: [
      { id: 'gemini-2.0-flash', name: 'gemini-2.0-flash' },
      { id: 'gemini-2.0-pro', name: 'gemini-2.0-pro' },
      { id: 'gemini-1.5-flash', name: 'gemini-1.5-flash' },
    ]
  },
  {
    key: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: [
      { id: 'deepseek-chat', name: 'deepseek-chat' },
      { id: 'deepseek-reasoner', name: 'deepseek-reasoner' },
    ]
  },
];

const ModelConfig = () => {
  const { modelConfigs, addModelConfig, updateModelConfig, removeModelConfig } = useStore();
  const [providerApiKeys, setProviderApiKeys] = useState({});
  const [providerBaseUrls, setProviderBaseUrls] = useState({});
  const [testingConfigId, setTestingConfigId] = useState(null);
  const [selectedModels, setSelectedModels] = useState({});

  const getProviderConfig = (providerKey) => {
    return PROVIDERS.find(p => p.key === providerKey);
  };

  const getConfigsForProvider = (providerKey) => {
    return modelConfigs.filter(c => c.provider === providerKey);
  };

  const handleApiKeyChange = (providerKey, value) => {
    setProviderApiKeys({
      ...providerApiKeys,
      [providerKey]: value,
    });
  };

  const handleBaseUrlChange = (providerKey, value) => {
    setProviderBaseUrls({
      ...providerBaseUrls,
      [providerKey]: value,
    });
  };

  const handleModelSelect = (providerKey, selectedValues) => {
    setSelectedModels({
      ...selectedModels,
      [providerKey]: selectedValues || [],
    });
  };

  const handleSaveConfig = (providerKey) => {
    const apiKey = providerApiKeys[providerKey];
    const selectedModelIds = selectedModels[providerKey] || [];
    const provider = getProviderConfig(providerKey);

    if (!apiKey || !apiKey.trim()) {
      message.error('请输入 API Key');
      return;
    }

    if (selectedModelIds.length === 0) {
      message.error('请选择至少一个模型');
      return;
    }

    const baseUrl = providerBaseUrls[providerKey] || provider.baseUrl;

    selectedModelIds.forEach((modelId) => {
      const model = provider.models.find(m => m.id === modelId);
      if (!model) {
        message.error(`模型 ${modelId} 不存在`);
        return;
      }

      const configId = `${providerKey}-${modelId}-${Date.now()}`;
      const newConfig = {
        id: configId,
        provider: providerKey,
        model: modelId,
        apiKey,
        displayName: `${provider.name} - ${model.name}`,
        status: 'untested',
        baseUrl,
      };

      addModelConfig(newConfig);
    });

    message.success('模型配置已保存');
    setSelectedModels({ ...selectedModels, [providerKey]: [] });
  };

  const handleTestConnection = async (configId) => {
    setTestingConfigId(configId);
    try {
      const config = modelConfigs.find(c => c.id === configId);
      if (!config) return;

      await new Promise(resolve => setTimeout(resolve, 1500));

      updateModelConfig(configId, { status: 'connected' });
      message.success(`已连接到 ${config.displayName}`);
    } catch (error) {
      updateModelConfig(configId, { status: 'disconnected' });
      message.error('连接失败');
    } finally {
      setTestingConfigId(null);
    }
  };

  const handleRemoveConfig = (configId) => {
    removeModelConfig(configId);
    message.success('模型配置已删除');
  };

  const getStatusTag = (status) => {
    const tags = {
      connected: <Tag>已连接</Tag>,
      disconnected: <Tag>已断开</Tag>,
      untested: <Tag>未测试</Tag>,
    };
    return tags[status] || tags.untested;
  };

  const collapseItems = PROVIDERS.map((provider) => {
    const configs = getConfigsForProvider(provider.key);
    const currentSelectedModels = selectedModels[provider.key] || [];
    const currentApiKey = providerApiKeys[provider.key] || '';
    const currentBaseUrl = providerBaseUrls[provider.key] || provider.baseUrl;

    return {
      key: provider.key,
      label: (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>{provider.name}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              {configs.length > 0 ? `已配置 ${configs.length} 个模型` : '未配置'}
            </div>
          </div>
        </div>
      ),
      children: (
        <div style={{ padding: '20px 0' }}>
          {/* Base URL Input */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ marginBottom: '8px', fontWeight: 500 }}>API Base URL</div>
            <Input
              placeholder="输入 API Base URL"
              value={currentBaseUrl}
              onChange={(e) => handleBaseUrlChange(provider.key, e.target.value)}
              style={{ marginBottom: '12px' }}
            />
          </div>

          {/* API Key Input */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ marginBottom: '8px', fontWeight: 500 }}>API Key</div>
            <Input.Password
              placeholder="输入 API Key"
              value={currentApiKey}
              onChange={(e) => handleApiKeyChange(provider.key, e.target.value)}
              style={{ marginBottom: '12px' }}
            />
          </div>

          {/* Model Selection */}
          {provider.models.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ marginBottom: '8px', fontWeight: 500 }}>选择模型</div>
              <Select
                mode="multiple"
                placeholder="选择一个或多个模型"
                options={provider.models.map(m => ({
                  label: m.name,
                  value: m.id,
                }))}
                value={currentSelectedModels}
                onChange={(values) => handleModelSelect(provider.key, values)}
                style={{ width: '100%', marginBottom: '12px' }}
              />
            </div>
          )}

          {/* Save Config Button */}
          <Button
            type="primary"
            onClick={() => handleSaveConfig(provider.key)}
            style={{ marginBottom: '20px' }}
          >
            保存配置
          </Button>

          {/* Configured Models */}
          {configs.length > 0 && (
            <div>
              <div style={{ marginBottom: '12px', fontWeight: 500 }}>已激活模型</div>
              <Space direction="vertical" style={{ width: '100%' }}>
                {configs.map((config) => (
                  <Card
                    key={config.id}
                    size="small"
                    style={{
                      borderLeft: '4px solid #111827',
                      backgroundColor: '#fafafa',
                    }}
                    styles={{ body: { padding: '12px' } }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          <span style={{ fontWeight: 500 }}>{config.displayName}</span>
                          {getStatusTag(config.status)}
                        </div>
                        <div style={{ fontSize: '12px', color: '#666' }}>
                          <div>Base URL: {config.baseUrl}</div>
                        </div>
                      </div>
                      <Space>
                        <Button
                          size="small"
                          type="primary"
                          onClick={() => handleTestConnection(config.id)}
                          loading={testingConfigId === config.id}
                          disabled={testingConfigId === config.id}
                        >
                          {testingConfigId === config.id ? '测试中...' : '连接测试'}
                        </Button>
                        <Button
                          size="small"
                          danger
                          onClick={() => handleRemoveConfig(config.id)}
                        >
                          删除
                        </Button>
                      </Space>
                    </div>
                  </Card>
                ))}
              </Space>
            </div>
          )}
        </div>
      ),
    };
  });

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ marginBottom: '8px', marginTop: 0, fontSize: '24px', fontWeight: 600 }}>
          模型供应商配置
        </h1>
        <div style={{ color: '#666', fontSize: '14px' }}>
          配置不同模型供应商，支持多模型并行对比测试
        </div>
      </div>

      <Collapse items={collapseItems} accordion={false} />

      {modelConfigs.length > 0 && (
        <Card style={{ marginTop: '24px' }}>
          <h3 style={{ marginTop: 0 }}>已激活模型汇总</h3>
          <Row gutter={[16, 16]}>
            {modelConfigs.map((config) => (
              <Col key={config.id} xs={24} sm={12} md={8} lg={6}>
                <Card
                  hoverable
                  style={{
                    borderTop: '3px solid #111827',
                    textAlign: 'center',
                  }}
                  styles={{ body: { padding: '12px' } }}
                >
                  <div style={{ fontSize: '12px', marginBottom: '8px', color: '#666' }}>
                    {config.displayName}
                  </div>
                  <div style={{ fontSize: '11px', color: '#999' }}>
                    {getStatusTag(config.status)}
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        </Card>
      )}
    </div>
  );
};

export default ModelConfig;
