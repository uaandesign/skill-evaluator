import React, { useState, useCallback } from 'react';
import {
  Card,
  Select,
  Input,
  Button,
  Row,
  Col,
  Segmented,
  Spin,
  Typography,
  Tag,
  Collapse,
  Statistic,
  Space,
  Divider,
  message,
} from 'antd';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

import { useStore } from '../store';
import { chatWithModel } from '../utils/api';

const SimpleMarkdown = ({ children }) => (
  <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}
    dangerouslySetInnerHTML={{
      __html: (children || '')
        .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre style="background:#f5f5f5;padding:12px;border-radius:6px;overflow-x:auto"><code>$2</code></pre>')
        .replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;padding:2px 6px;border-radius:3px">$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^### (.+)$/gm, '<h4>$1</h4>')
        .replace(/^## (.+)$/gm, '<h3>$1</h3>')
        .replace(/^# (.+)$/gm, '<h2>$1</h2>')
        .replace(/\n/g, '<br/>')
    }}
  />
);

const { TextArea } = Input;
const { Title, Text, Paragraph } = Typography;

const calculateDiff = (original, modified) => {
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');
  const diffs = [];

  const maxLength = Math.max(originalLines.length, modifiedLines.length);

  for (let i = 0; i < maxLength; i++) {
    const origLine = originalLines[i] || '';
    const modLine = modifiedLines[i] || '';

    if (origLine !== modLine) {
      diffs.push({
        type: 'changed',
        original: origLine,
        modified: modLine,
      });
    } else {
      diffs.push({
        type: 'same',
        text: origLine,
      });
    }
  }

  return diffs;
};

const ComparePanel = () => {
  const { modelConfigs, skills, addTestResult } = useStore();

  const [selectedModels, setSelectedModels] = useState([]);
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [viewMode, setViewMode] = useState('side-by-side');
  const [testHistory, setTestHistory] = useState([]);

  const modelOptions = modelConfigs.map((model) => ({
    label: model.displayName || `${model.provider} - ${model.model}`,
    value: model.id,
  }));

  const skillOptions = [
    { label: '无 (裸模型)', value: null },
    ...skills.map((skill) => ({
      label: skill.name,
      value: skill.id,
    })),
  ];

  const runComparison = useCallback(async () => {
    if (selectedModels.length === 0 || !prompt.trim()) {
      message.warning('请选择模型并输入提示词');
      return;
    }

    setLoading(true);
    const startTime = Date.now();
    const newResults = [];

    try {
      for (const modelId of selectedModels) {
        const modelConfig = modelConfigs.find((m) => m.id === modelId);
        if (!modelConfig) continue;

        const baseParams = {
          provider: modelConfig.provider,
          apiKey: modelConfig.apiKey,
          model: modelConfig.model,
          baseUrl: modelConfig.baseUrl,
        };

        // 裸模型响应
        const bareStart = Date.now();
        const bareRes = await chatWithModel({
          ...baseParams,
          messages: [{ role: 'user', content: prompt }],
        });
        const bareLatency = Date.now() - bareStart;

        // Skill 增强响应
        let skilledRes = null;
        let skilledLatency = 0;

        if (selectedSkill) {
          const selectedSkillData = skills.find((s) => s.id === selectedSkill);
          const skilledStart = Date.now();

          skilledRes = await chatWithModel({
            ...baseParams,
            messages: [{ role: 'user', content: prompt }],
            systemPrompt: selectedSkillData?.content || '',
            tools: selectedSkillData?.tools || [],
          });

          skilledLatency = Date.now() - skilledStart;
        } else {
          skilledRes = bareRes;
          skilledLatency = bareLatency;
        }

        newResults.push({
          modelId,
          modelConfig,
          bareResponse: {
            text: bareRes.content || bareRes.message || '',
            latency: bareLatency,
            tokens: bareRes.usage || {},
            timestamp: new Date().toISOString(),
          },
          skilledResponse: {
            text: skilledRes.content || skilledRes.message || '',
            latency: skilledLatency,
            tokens: skilledRes.usage || {},
            timestamp: new Date().toISOString(),
          },
        });
      }

      setResults(newResults);

      const totalTime = Date.now() - startTime;
      const historyEntry = {
        id: Date.now(),
        prompt: prompt.substring(0, 100),
        models: selectedModels,
        skill: selectedSkill,
        timestamp: new Date().toISOString(),
        totalTime,
      };

      setTestHistory((prev) => [historyEntry, ...prev.slice(0, 49)]);
      addTestResult(historyEntry);

      message.success(`对比完成，耗时 ${totalTime}ms`);
    } catch (error) {
      console.error('对比错误:', error);
      message.error(`对比失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [selectedModels, selectedSkill, prompt, modelConfigs, skills, addTestResult]);

  const replayTest = useCallback(
    (entry) => {
      setSelectedModels(entry.models);
      setSelectedSkill(entry.skill);
      setPrompt(entry.prompt);
      setTimeout(() => runComparison(), 100);
    },
    [runComparison]
  );

  const clearHistory = () => {
    setTestHistory([]);
    message.success('历史已清除');
  };

  const renderDiffView = (bareText, skilledText) => {
    const diffs = calculateDiff(bareText, skilledText);

    return (
      <div style={{ border: '1px solid #f0f0f0', borderRadius: '6px', padding: '12px', backgroundColor: '#fafafa' }}>
        <div style={{ marginBottom: '12px' }}>
          <Tag color="red">删除（裸模型）</Tag>
          <Tag color="green">新增（Skill增强）</Tag>
          <Tag>未变更</Tag>
        </div>
        {diffs.map((diff, idx) => (
          <div key={idx} style={{ marginBottom: '8px', fontFamily: 'monospace', fontSize: '12px' }}>
            {diff.type === 'same' ? (
              <div style={{ color: '#999' }}>{diff.text || '(空行)'}</div>
            ) : (
              <>
                <div style={{ color: '#d32f2f', backgroundColor: '#ffebee', padding: '4px' }}>
                  − {diff.original}
                </div>
                <div style={{ color: '#388e3c', backgroundColor: '#f1f8e9', padding: '4px' }}>
                  + {diff.modified}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderResponseCard = (result, responseType) => {
    const response = responseType === 'bare' ? result.bareResponse : result.skilledResponse;
    const title = responseType === 'bare' ? '裸模型响应' : 'Skill 增强响应';

    return (
      <Card
        title={title}
        style={{ marginBottom: '16px' }}
        size="small"
      >
        <div style={{ minHeight: '200px', maxHeight: '400px', overflowY: 'auto', marginBottom: '16px' }}>
          <SimpleMarkdown>{response.text}</SimpleMarkdown>
        </div>
        <Divider style={{ margin: '12px 0' }} />
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <Statistic
            title="延迟"
            value={response.latency}
            suffix="ms"
            size="small"
          />
          {response.tokens.prompt_tokens && (
            <>
              <Statistic
                title="提示 Token"
                value={response.tokens.prompt_tokens}
                size="small"
              />
              <Statistic
                title="完成 Token"
                value={response.tokens.completion_tokens}
                size="small"
              />
              <Statistic
                title="总 Token"
                value={
                  (response.tokens.prompt_tokens || 0) +
                  (response.tokens.completion_tokens || 0)
                }
                size="small"
              />
            </>
          )}
        </Space>
      </Card>
    );
  };

  const renderMetricsChart = () => {
    if (results.length === 0) return null;

    const chartData = results.map((result) => ({
      name: result.modelConfig.displayName.substring(0, 20),
      裸模型延迟: result.bareResponse.latency,
      增强延迟: result.skilledResponse.latency,
      裸模型Token: (result.bareResponse.tokens.prompt_tokens || 0) + (result.bareResponse.tokens.completion_tokens || 0),
      增强Token: (result.skilledResponse.tokens.prompt_tokens || 0) + (result.skilledResponse.tokens.completion_tokens || 0),
    }));

    return (
      <Card title="性能指标对比" style={{ marginBottom: '24px' }}>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Title level={5}>延迟对比 (ms)</Title>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="裸模型延迟" fill="#1890ff" />
                <Bar dataKey="增强延迟" fill="#52c41a" />
              </BarChart>
            </ResponsiveContainer>
          </Col>
          <Col xs={24} md={12}>
            <Title level={5}>Token 用量对比</Title>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="裸模型Token" fill="#1890ff" />
                <Bar dataKey="增强Token" fill="#52c41a" />
              </BarChart>
            </ResponsiveContainer>
          </Col>
        </Row>
      </Card>
    );
  };

  const historyItems = testHistory.map((entry) => ({
    key: entry.id,
    label: (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
        <Text strong>{entry.prompt}...</Text>
        <Text type="secondary" style={{ fontSize: '12px' }}>
          {new Date(entry.timestamp).toLocaleString()}
        </Text>
      </div>
    ),
    extra: (
      <Button
        type="text"
        size="small"
        onClick={(e) => {
          e.stopPropagation();
          replayTest(entry);
        }}
      >
        ▶ 重放
      </Button>
    ),
    children: (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Paragraph><strong>模型:</strong> {entry.models.join(', ')}</Paragraph>
        <Paragraph><strong>Skill:</strong> {entry.skill || '无'}</Paragraph>
        <Paragraph><strong>总耗时:</strong> {entry.totalTime}ms</Paragraph>
      </Space>
    ),
  }));

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 100px)' }}>
      {/* 左侧配置区 */}
      <div style={{ width: '300px', borderRight: '1px solid #f0f0f0', padding: '20px', overflowY: 'auto' }}>
        <div style={{ marginBottom: '20px' }}>
          <Text strong>选择 Skill</Text>
          <Select
            placeholder="选择 Skill"
            options={skillOptions}
            value={selectedSkill}
            onChange={setSelectedSkill}
            style={{ width: '100%', marginTop: '8px' }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <Text strong>选择模型</Text>
          <Select
            mode="multiple"
            placeholder="选择一个或多个模型"
            options={modelOptions}
            value={selectedModels}
            onChange={setSelectedModels}
            style={{ width: '100%', marginTop: '8px' }}
            maxTagCount="responsive"
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <Text strong>测试提示词</Text>
          <TextArea
            placeholder="输入测试提示词..."
            rows={6}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            style={{ marginTop: '8px' }}
          />
        </div>

        <Button
          type="primary"
          block
          size="large"
          loading={loading}
          onClick={runComparison}
          style={{ marginBottom: '20px' }}
        >
          {loading ? '对比中...' : '开始对比'}
        </Button>

        {/* 测试历史 */}
        <Collapse
          items={[
            {
              key: '1',
              label: `测试历史 (${testHistory.length})`,
              extra: (
                <Button
                  type="text"
                  danger
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearHistory();
                  }}
                >
                  🗑️ 清空
                </Button>
              ),
              children:
                testHistory.length > 0 ? (
                  <Collapse items={historyItems} size="small" />
                ) : (
                  <Text type="secondary">暂无历史</Text>
                ),
            },
          ]}
          size="small"
        />
      </div>

      {/* 右侧响应区 */}
      <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
        {loading && (
          <Card style={{ textAlign: 'center', marginBottom: '24px' }}>
            <Spin tip="对比中..." />
          </Card>
        )}

        {!loading && results.length === 0 && (
          <Card style={{ textAlign: 'center', color: '#999' }}>
            <p>选择模型和 Skill，输入提示词，点击"开始对比"</p>
          </Card>
        )}

        {!loading && results.length > 0 && (
          <>
            {/* 视图模式切换 */}
            <div style={{ marginBottom: '20px' }}>
              <Text strong>视图模式</Text>
              <Segmented
                value={viewMode}
                onChange={setViewMode}
                options={[
                  { label: '并排显示', value: 'side-by-side' },
                  { label: 'Diff 视图', value: 'diff' },
                ]}
                style={{ marginLeft: '16px' }}
              />
            </div>

            {/* 性能指标 */}
            {renderMetricsChart()}

            {/* 响应内容 */}
            {results.map((result, idx) => (
              <div key={result.modelId} style={{ marginBottom: '24px' }}>
                <h4 style={{ color: '#666', borderBottom: '1px solid #f0f0f0', paddingBottom: '8px' }}>
                  {result.modelConfig.displayName}
                </h4>

                {viewMode === 'side-by-side' ? (
                  <Row gutter={16}>
                    <Col xs={24} md={12}>
                      {renderResponseCard(result, 'bare')}
                    </Col>
                    <Col xs={24} md={12}>
                      {renderResponseCard(result, 'skilled')}
                    </Col>
                  </Row>
                ) : (
                  <div style={{ marginTop: '16px' }}>
                    <Card title="Diff 对比" size="small" style={{ marginBottom: '16px' }}>
                      {renderDiffView(result.bareResponse.text, result.skilledResponse.text)}
                    </Card>
                  </div>
                )}

                <Divider />
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

export default ComparePanel;
