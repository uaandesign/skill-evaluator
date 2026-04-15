import React, { useState, useEffect } from 'react';
import {
  Card,
  Select,
  Timeline,
  Button,
  Modal,
  Typography,
  Tag,
  Space,
  Row,
  Col,
  Input,
  Statistic,
  Popconfirm,
  Empty,
  message,
  Descriptions,
  Tabs,
  Divider,
  Spin,
} from 'antd';
import * as Diff from 'diff';
import { useStore } from '../store';
import { chatWithModel } from '../utils/api';

const { Title, Text, Paragraph } = Typography;

/**
 * Diff 查看器组件 — 行级红/绿色块高亮
 */
const DiffViewer = ({ changes }) => {
  const lines = [];
  changes.forEach((part, partIdx) => {
    const segments = part.value.split('\n');
    segments.forEach((seg, segIdx) => {
      if (segIdx === segments.length - 1 && seg === '') return;
      lines.push({ text: seg, added: part.added, removed: part.removed, key: `${partIdx}-${segIdx}` });
    });
  });

  return (
    <div style={{ fontFamily: "'JetBrains Mono','Fira Code','Consolas',monospace", fontSize: '12px', lineHeight: '1.65', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
      <div style={{ display: 'flex', gap: '16px', padding: '8px 12px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '11px', color: '#6b7280' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '2px', background: '#fee2e2', border: '1px solid #fca5a5' }} />
          删除 (版本A)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '2px', background: '#dcfce7', border: '1px solid #86efac' }} />
          新增 (版本B)
        </span>
      </div>
      <div>
        {lines.map((line, idx) => (
          <div
            key={line.key}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              padding: '1px 0',
              background: line.removed ? '#fee2e2' : line.added ? '#dcfce7' : (idx % 2 === 0 ? '#fff' : '#fafafa'),
              borderLeft: line.removed ? '3px solid #ef4444' : line.added ? '3px solid #22c55e' : '3px solid transparent',
            }}
          >
            <span style={{
              width: '20px', flexShrink: 0, textAlign: 'center',
              fontSize: '11px', fontWeight: 700, paddingTop: '1px',
              color: line.removed ? '#dc2626' : line.added ? '#16a34a' : 'transparent',
              userSelect: 'none',
            }}>
              {line.removed ? '−' : line.added ? '+' : ''}
            </span>
            <span style={{ width: '36px', flexShrink: 0, textAlign: 'right', paddingRight: '10px', fontSize: '11px', color: '#9ca3af', userSelect: 'none' }}>
              {idx + 1}
            </span>
            <span style={{
              flex: 1, padding: '1px 8px 1px 2px',
              color: line.removed ? '#b91c1c' : line.added ? '#15803d' : '#374151',
              textDecoration: line.removed ? 'line-through' : 'none',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>
              {line.text || ' '}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * 版本管理器组件
 */
const VersionManager = () => {
  const { skills, updateSkill, saveSkillVersion, rollbackSkillVersion, modelConfigs } = useStore();

  // 状态
  const [selectedSkillId, setSelectedSkillId] = useState(null);
  const [selectedVersionIndex, setSelectedVersionIndex] = useState(null);
  const [compareModalVisible, setCompareModalVisible] = useState(false);
  const [compareVersionA, setCompareVersionA] = useState(null);
  const [compareVersionB, setCompareVersionB] = useState(null);
  const [abTestModalVisible, setAbTestModalVisible] = useState(false);
  const [abTestVersionA, setAbTestVersionA] = useState(null);
  const [abTestVersionB, setAbTestVersionB] = useState(null);
  const [abTestPrompt, setAbTestPrompt] = useState('');
  const [abTestResults, setAbTestResults] = useState(null);
  const [abTestLoading, setAbTestLoading] = useState(false);

  // 初始化第一个技能
  useEffect(() => {
    if (skills.length > 0 && !selectedSkillId) {
      setSelectedSkillId(skills[0].id);
      setSelectedVersionIndex(0);
    }
  }, [skills, selectedSkillId]);

  const selectedSkill = skills.find((s) => s.id === selectedSkillId);
  const selectedVersion =
    selectedSkill && selectedVersionIndex !== null
      ? selectedSkill.versions[selectedVersionIndex]
      : null;

  const skillOptions = skills.map((skill) => ({
    label: (
      <Space>
        <span>{skill.name}</span>
        <Tag color="blue" size="small">
          {skill.format}
        </Tag>
      </Space>
    ),
    value: skill.id,
  }));

  /**
   * 处理技能选择变化
   */
  const handleSkillChange = (skillId) => {
    setSelectedSkillId(skillId);
    setSelectedVersionIndex(0);
    setCompareModalVisible(false);
    setAbTestModalVisible(false);
  };

  /**
   * 处理版本时间线点击
   */
  const handleVersionSelect = (index) => {
    setSelectedVersionIndex(index);
  };

  /**
   * 处理回滚到版本
   */
  const handleRollback = () => {
    if (!selectedSkill || selectedVersionIndex === null) return;

    const version = selectedSkill.versions[selectedVersionIndex];
    const updated = {
      ...selectedSkill,
      content: version.content,
      lastModified: new Date().toISOString(),
    };

    updateSkill(selectedSkillId, updated);
    message.success(`已回滚到版本 ${version.versionNumber}`);
  };

  /**
   * 处理导出版本
   */
  const handleExportVersion = () => {
    if (!selectedSkill || !selectedVersion) return;

    const content = selectedVersion.content;
    const filename = `${selectedSkill.name}_v${selectedVersion.versionNumber}.md`;
    const element = document.createElement('a');
    element.setAttribute(
      'href',
      'data:text/plain;charset=utf-8,' + encodeURIComponent(content)
    );
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    message.success('版本已导出');
  };

  /**
   * 处理 A/B 测试
   */
  const handleRunABTest = async () => {
    if (!selectedSkill || abTestVersionA === null || abTestVersionB === null || !abTestPrompt) {
      message.error('请选择两个版本并输入测试提示');
      return;
    }

    setAbTestLoading(true);
    try {
      const versionAContent =
        selectedSkill.versions[abTestVersionA].content;
      const versionBContent =
        selectedSkill.versions[abTestVersionB].content;

      // 使用第一个可用的模型配置进行 A/B 测试
      const activeModel = modelConfigs.find((m) => m.apiKey) || modelConfigs[0];
      if (!activeModel) {
        message.error('请先在模型配置中添加至少一个模型');
        setAbTestLoading(false);
        return;
      }

      const baseParams = {
        provider: activeModel.provider,
        apiKey: activeModel.apiKey,
        model: activeModel.model,
      };

      const [resultA, resultB] = await Promise.all([
        chatWithModel({
          ...baseParams,
          messages: [{ role: 'user', content: abTestPrompt }],
          systemPrompt: versionAContent,
        }),
        chatWithModel({
          ...baseParams,
          messages: [{ role: 'user', content: abTestPrompt }],
          systemPrompt: versionBContent,
        }),
      ]);

      setAbTestResults({
        versionA: {
          version: abTestVersionA + 1,
          content: resultA.content || JSON.stringify(resultA),
          latency: resultA.latency || 0,
        },
        versionB: {
          version: abTestVersionB + 1,
          content: resultB.content || JSON.stringify(resultB),
          latency: resultB.latency || 0,
        },
      });

      message.success('A/B 测试完成');
    } catch (error) {
      message.error('A/B 测试失败：' + error.message);
    } finally {
      setAbTestLoading(false);
    }
  };

  /**
   * 处理版本对比
   */
  const handleCompareVersions = () => {
    if (compareVersionA === null || compareVersionB === null) {
      message.error('请选择两个版本进行对比');
      return;
    }

    setCompareModalVisible(true);
  };

  const diffChanges =
    selectedSkill && compareVersionA !== null && compareVersionB !== null
      ? Diff.diffLines(
          selectedSkill.versions[compareVersionA].content,
          selectedSkill.versions[compareVersionB].content
        )
      : [];

  // 计算版本统计
  const versionStats =
    selectedSkill && selectedSkill.versions.length > 0
      ? {
          totalVersions: selectedSkill.versions.length,
          daysSinceFirst: Math.floor(
            (new Date() - new Date(selectedSkill.versions[0].timestamp)) /
              (1000 * 60 * 60 * 24)
          ),
          averageFrequency:
            selectedSkill.versions.length > 1
              ? (
                  Math.floor(
                    (new Date() - new Date(selectedSkill.versions[0].timestamp)) /
                      (1000 * 60 * 60 * 24)
                  ) / (selectedSkill.versions.length - 1)
                ).toFixed(1)
              : 'N/A',
        }
      : null;

  return (
    <div>
      <Card
        style={{
          marginBottom: '24px',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        }}
      >
        <Title level={2} style={{ marginBottom: '16px' }}>
          版本管理器
        </Title>
        <Select
          style={{ width: '300px', borderRadius: '8px' }}
          placeholder="选择一个技能"
          options={skillOptions}
          value={selectedSkillId}
          onChange={handleSkillChange}
        />
      </Card>

      {!selectedSkill || !selectedSkill.versions || selectedSkill.versions.length === 0 ? (
        <Card style={{ borderRadius: '12px', border: '1px solid #e5e7eb' }}>
          <Empty description="暂无版本数据" />
        </Card>
      ) : (
        <>
          <Row gutter={[24, 24]}>
            {/* 版本时间线 - 左侧 */}
            <Col xs={24} md={6}>
              <Card
                title={
                  <Text strong style={{ fontSize: '16px' }}>
                    版本历史
                  </Text>
                }
                style={{
                  height: '600px',
                  borderRadius: '12px',
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                }}
                styles={{ body: { overflowY: 'auto', padding: '16px', height: 'calc(100% - 57px)' } }}
              >
                <Timeline
                  items={selectedSkill.versions.map((version, index) => ({
                    color:
                      selectedVersionIndex === index
                        ? '#6366f1'
                        : '#d9d9d9',
                    dot: (
                      <div
                        onClick={() => handleVersionSelect(index)}
                        style={{
                          cursor: 'pointer',
                          fontWeight:
                            selectedVersionIndex === index
                              ? 'bold'
                              : 'normal',
                        }}
                      >
                        <Text strong>{version.versionNumber}</Text>
                      </div>
                    ),
                    children: (
                      <div
                        onClick={() => handleVersionSelect(index)}
                        style={{
                          cursor: 'pointer',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          background:
                            selectedVersionIndex === index
                              ? '#eef2ff'
                              : 'transparent',
                          transition: 'all 200ms',
                        }}
                      >
                        <Paragraph
                          style={{
                            fontSize: '11px',
                            margin: '4px 0',
                            color: '#6b7280',
                          }}
                        >
                          {new Date(version.timestamp).toLocaleString(
                            'zh-CN'
                          )}
                        </Paragraph>
                        <Paragraph
                          style={{
                            fontSize: '12px',
                            margin: '4px 0',
                            color: '#9ca3af',
                          }}
                          ellipsis={{ rows: 2 }}
                        >
                          {version.changeDescription || '无描述'}
                        </Paragraph>
                      </div>
                    ),
                  }))}
                />
              </Card>
            </Col>

            {/* 版本详情面板 - 右侧 */}
            <Col xs={24} md={18}>
              <Card
                title={
                  <Text strong style={{ fontSize: '16px' }}>
                    版本详情
                  </Text>
                }
                style={{
                  borderRadius: '12px',
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                }}
              >
                {selectedVersion && (
                  <>
                    <Descriptions
                      column={{ xxl: 2, xl: 2, lg: 2, md: 1, sm: 1, xs: 1 }}
                      size="small"
                      style={{ marginBottom: '16px' }}
                    >
                      <Descriptions.Item label="版本号">
                        <Tag color="indigo">{selectedVersion.versionNumber}</Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="格式">
                        <Tag color="cyan">{selectedSkill.format}</Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="创建时间">
                        {new Date(
                          selectedVersion.timestamp
                        ).toLocaleString('zh-CN')}
                      </Descriptions.Item>
                      <Descriptions.Item label="内容长度">
                        {selectedVersion.content.length} 字符
                      </Descriptions.Item>
                    </Descriptions>

                    <Divider style={{ margin: '16px 0' }} />

                    <Text strong style={{ display: 'block', marginBottom: '12px', fontSize: '14px' }}>
                      版本描述
                    </Text>
                    <Paragraph
                      style={{
                        padding: '12px',
                        background: '#f9fafb',
                        borderRadius: '8px',
                        marginBottom: '16px',
                        border: '1px solid #f3f4f6',
                        minHeight: '60px',
                      }}
                    >
                      {selectedVersion.changeDescription || '无描述'}
                    </Paragraph>

                    <Divider style={{ margin: '16px 0' }} />

                    <Text strong style={{ display: 'block', marginBottom: '12px', fontSize: '14px' }}>
                      版本内容
                    </Text>
                    <div style={{ marginBottom: '16px' }}>
                      <Input.TextArea
                        value={selectedVersion.content}
                        readOnly
                        rows={15}
                        style={{
                          fontFamily: 'monospace',
                          fontSize: '12px',
                          borderRadius: '8px',
                          border: '1px solid #e5e7eb',
                        }}
                      />
                    </div>

                    <Divider style={{ margin: '16px 0' }} />

                    {/* 操作按钮 */}
                    <Space wrap>
                      <Popconfirm
                        title="确认回滚"
                        description={`确定要回滚到版本 ${selectedVersion.versionNumber} 吗？`}
                        onConfirm={handleRollback}
                        okText="确认"
                        cancelText="取消"
                      >
                        <Button
                          type="primary"
                          danger
                        >
                          ↩ 回滚到此版本
                        </Button>
                      </Popconfirm>

                      <Button
                        onClick={() => setAbTestModalVisible(true)}
                      >
                        🧪 A/B 测试
                      </Button>

                      <Button
                        onClick={handleExportVersion}
                      >
                        ⬇ 导出版本
                      </Button>

                      <Button
                        onClick={() => setCompareModalVisible(true)}
                      >
                        🔄 版本对比
                      </Button>
                    </Space>
                  </>
                )}
              </Card>

              {/* 版本统计 */}
              {versionStats && (
                <Card
                  style={{
                    marginTop: '24px',
                    borderRadius: '12px',
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                  }}
                >
                  <Row gutter={24}>
                    <Col xs={24} sm={8}>
                      <Statistic
                        title="总版本数"
                        value={versionStats.totalVersions}
                        valueStyle={{ color: '#6366f1', fontWeight: 600 }}
                      />
                    </Col>
                    <Col xs={24} sm={8}>
                      <Statistic
                        title="天数"
                        value={versionStats.daysSinceFirst}
                        suffix="天"
                        valueStyle={{ color: '#10b981', fontWeight: 600 }}
                      />
                    </Col>
                    <Col xs={24} sm={8}>
                      <Statistic
                        title="平均编辑频率"
                        value={versionStats.averageFrequency}
                        suffix="天/版本"
                        valueStyle={{ color: '#f59e0b', fontWeight: 600 }}
                      />
                    </Col>
                  </Row>
                </Card>
              )}
            </Col>
          </Row>

          {/* 版本对比模态框 */}
          <Modal
            title={
              <Text strong style={{ fontSize: '16px' }}>
                版本对比
              </Text>
            }
            open={compareModalVisible}
            onCancel={() => setCompareModalVisible(false)}
            width={1000}
            footer={null}
            styles={{ body: { borderRadius: '12px' } }}
          >
            <Space
              style={{
                marginBottom: '16px',
                display: 'flex',
                justifyContent: 'space-around',
                gap: '16px',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <Text strong>版本 A</Text>
                <Select
                  style={{ width: '200px', marginLeft: '8px', borderRadius: '8px' }}
                  placeholder="选择版本"
                  value={compareVersionA}
                  onChange={setCompareVersionA}
                  options={selectedSkill.versions.map((v, idx) => ({
                    label: v.versionNumber,
                    value: idx,
                  }))}
                />
              </div>
              <div>
                <Text strong>版本 B</Text>
                <Select
                  style={{ width: '200px', marginLeft: '8px', borderRadius: '8px' }}
                  placeholder="选择版本"
                  value={compareVersionB}
                  onChange={setCompareVersionB}
                  options={selectedSkill.versions.map((v, idx) => ({
                    label: v.versionNumber,
                    value: idx,
                  }))}
                />
              </div>
              <Button
                type="primary"
                onClick={handleCompareVersions}
                disabled={compareVersionA === null || compareVersionB === null}
              >
                对比
              </Button>
            </Space>

            {diffChanges.length > 0 && (
              <div style={{ maxHeight: '520px', overflowY: 'auto', borderRadius: '8px' }}>
                <DiffViewer changes={diffChanges} />
              </div>
            )}

            {diffChanges.length === 0 &&
              compareVersionA !== null &&
              compareVersionB !== null && (
                <Empty description="两个版本内容相同" />
              )}
          </Modal>

          {/* A/B 测试模态框 */}
          <Modal
            title={
              <Text strong style={{ fontSize: '16px' }}>
                A/B 测试
              </Text>
            }
            open={abTestModalVisible}
            onCancel={() => {
              setAbTestModalVisible(false);
              setAbTestResults(null);
              setAbTestPrompt('');
            }}
            width={1200}
            footer={null}
            styles={{ body: { borderRadius: '12px' } }}
          >
            <Tabs
              items={[
                {
                  key: 'setup',
                  label: '测试设置',
                  children: (
                    <div>
                      <Row gutter={16} style={{ marginBottom: '16px' }}>
                        <Col xs={24} sm={12}>
                          <Text strong>版本 A</Text>
                          <Select
                            style={{ width: '100%', marginTop: '8px', borderRadius: '8px' }}
                            placeholder="选择版本 A"
                            value={abTestVersionA}
                            onChange={setAbTestVersionA}
                            options={selectedSkill.versions.map((v, idx) => ({
                              label: v.versionNumber,
                              value: idx,
                            }))}
                          />
                        </Col>
                        <Col xs={24} sm={12}>
                          <Text strong>版本 B</Text>
                          <Select
                            style={{ width: '100%', marginTop: '8px', borderRadius: '8px' }}
                            placeholder="选择版本 B"
                            value={abTestVersionB}
                            onChange={setAbTestVersionB}
                            options={selectedSkill.versions.map((v, idx) => ({
                              label: v.versionNumber,
                              value: idx,
                            }))}
                          />
                        </Col>
                      </Row>

                      <Text strong style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>
                        测试提示
                      </Text>
                      <Input.TextArea
                        placeholder="输入用于测试的提示词"
                        rows={6}
                        value={abTestPrompt}
                        onChange={(e) => setAbTestPrompt(e.target.value)}
                        style={{
                          marginBottom: '16px',
                          borderRadius: '8px',
                          border: '1px solid #e5e7eb',
                        }}
                      />

                      <Button
                        type="primary"
                        loading={abTestLoading}
                        onClick={handleRunABTest}
                        disabled={
                          abTestVersionA === null ||
                          abTestVersionB === null ||
                          !abTestPrompt
                        }
                      >
                        运行测试
                      </Button>
                    </div>
                  ),
                },
                {
                  key: 'results',
                  label: '测试结果',
                  children: abTestResults ? (
                    <Row gutter={16}>
                      <Col xs={24} sm={12}>
                        <Card
                          title={`版本 ${abTestResults.versionA.version}`}
                          size="small"
                          style={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                        >
                          <div
                            style={{
                              maxHeight: '400px',
                              overflowY: 'auto',
                              padding: '12px',
                              background: '#f9fafb',
                              borderRadius: '6px',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              border: '1px solid #f3f4f6',
                            }}
                          >
                            {abTestResults.versionA.content}
                          </div>
                        </Card>
                      </Col>
                      <Col xs={24} sm={12}>
                        <Card
                          title={`版本 ${abTestResults.versionB.version}`}
                          size="small"
                          style={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                        >
                          <div
                            style={{
                              maxHeight: '400px',
                              overflowY: 'auto',
                              padding: '12px',
                              background: '#f9fafb',
                              borderRadius: '6px',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              border: '1px solid #f3f4f6',
                            }}
                          >
                            {abTestResults.versionB.content}
                          </div>
                        </Card>
                      </Col>
                    </Row>
                  ) : (
                    <Empty description="暂无测试结果" />
                  ),
                  disabled: !abTestResults,
                },
              ]}
            />
          </Modal>
        </>
      )}
    </div>
  );
};

export default VersionManager;
