import React, { useState, useEffect } from 'react';
import {
  Card,
  Button,
  Select,
  Table,
  Tag,
  Progress,
  Space,
  Row,
  Col,
  Typography,
  Collapse,
  Statistic,
  Alert,
  Spin,
  Empty,
  Tooltip,
  message,
  Timeline,
} from 'antd';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from 'recharts';
import { useStore } from '../store';
import {
  evaluateSkill,
  compareWithBenchmarks,
  generateSuggestions,
} from '../utils/evaluator';
import { benchmarkSkills } from '../data/benchmarks';

const { Title, Text, Paragraph } = Typography;

const DIMENSIONS = [
  {
    key: 'structure',
    label: '结构完整性',
    description: 'YAML 前置、name/description 规范、正文长度、标题清晰、文件引用',
    weight: 25
  },
  {
    key: 'coverage',
    label: '功能覆盖度',
    description: '快速开始、代码示例、工作流、输入输出、错误处理、反馈循环',
    weight: 20
  },
  {
    key: 'trigger',
    label: '触发准确率',
    description: 'description 具体、关键术语、第三人称、动名词、triggers 定义',
    weight: 20
  },
  {
    key: 'robustness',
    label: '鲁棒性',
    description: '错误处理、魔法数字、验证步骤、时间敏感、决策点、依赖说明',
    weight: 20
  },
  {
    key: 'maintainability',
    label: '可维护性',
    description: '元数据、术语一致、正斜杠路径、简洁性、具体示例、注释文档',
    weight: 15
  },
];

const getScoreColor = (score) => {
  if (score >= 80) return '#111827';
  if (score >= 60) return '#4b5563';
  return '#9ca3af';
};

const getGrade = (score) => {
  if (score >= 95) return { grade: 'S', color: '#111827' };
  if (score >= 85) return { grade: 'A', color: '#1f2937' };
  if (score >= 75) return { grade: 'B', color: '#374151' };
  if (score >= 65) return { grade: 'C', color: '#6b7280' };
  return { grade: 'D', color: '#9ca3af' };
};

const QualityEval = () => {
  const { skills, activeSkillId, addEvaluation } = useStore();
  const [selectedSkillId, setSelectedSkillId] = useState(activeSkillId);
  const [evaluationData, setEvaluationData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [radarData, setRadarData] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [history, setHistory] = useState([]);
  const [benchmarkComparison, setBenchmarkComparison] = useState(null);

  const currentSkillId = selectedSkillId || activeSkillId;

  const skillOptions = skills.map((skill) => ({
    label: skill.name || skill.id,
    value: skill.id,
  }));

  const handleStartEvaluation = async () => {
    if (!currentSkillId) {
      message.warning('请先选择 Skill');
      return;
    }

    setLoading(true);
    try {
      const skill = skills.find((s) => s.id === currentSkillId);
      if (!skill) {
        message.error('找不到选定的 Skill');
        return;
      }

      // 获取当前版本的 content
      const skillContent = skill.content || skill.code || '';
      if (!skillContent) {
        message.error('Skill 内容为空');
        return;
      }

      // 执行评估
      const evaluation = evaluateSkill({ content: skillContent, format: skill.format || 'skill_md' });
      const comparison = compareWithBenchmarks(evaluation);
      const sugg = generateSuggestions(evaluation);

      setEvaluationData(evaluation);
      setBenchmarkComparison(comparison);
      setSuggestions(sugg);

      // 构建雷达图数据
      const radarChartData = DIMENSIONS.map((dim) => ({
        dimension: dim.label,
        key: dim.key,
        ['当前Skill']: evaluation.scores[dim.key] || 0,
        ['最佳实践']: 85, // 参考最佳实践基准
      }));
      setRadarData(radarChartData);

      // 添加到历史记录
      setHistory((prev) => [
        {
          timestamp: new Date().toLocaleString('zh-CN'),
          score: evaluation.totalScore,
          skillId: currentSkillId,
        },
        ...prev.slice(0, 9),
      ]);

      // 保存评估结果
      addEvaluation({
        skillId: currentSkillId,
        skillName: skill.name,
        evaluation,
        comparison,
        timestamp: new Date().toISOString(),
      });

      message.success('评估完成！');
    } catch (error) {
      message.error('评估失败: ' + error.message);
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = (code) => {
    navigator.clipboard.writeText(code);
    message.success('已复制！');
  };

  // 最佳实践符合度表格列
  const practiceColumns = [
    {
      title: '检查项',
      dataIndex: 'check',
      key: 'check',
      width: 250,
      render: (text) => <Text>{text}</Text>,
    },
    {
      title: '维度',
      dataIndex: 'dimension',
      key: 'dimension',
      width: 120,
      render: (text) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'passed',
      key: 'passed',
      width: 100,
      render: (passed) => (
        <Tag color={passed ? 'green' : 'red'}>
          {passed ? '通过' : '未通过'}
        </Tag>
      ),
    },
    {
      title: '说明',
      dataIndex: 'reason',
      key: 'reason',
      ellipsis: true,
      render: (text) => <Text type="secondary" ellipsis>{text}</Text>,
    },
  ];

  // 组织检查项数据
  const practiceTableData = [];
  if (evaluationData && evaluationData.details) {
    Object.entries(evaluationData.details).forEach(([dimension, checks]) => {
      const dimensionName = DIMENSIONS.find(d => d.key === dimension)?.label || dimension;
      (checks || []).forEach((check, idx) => {
        practiceTableData.push({
          key: `${dimension}-${idx}`,
          dimension: dimensionName,
          check: check.check,
          passed: check.passed,
          reason: check.reason,
        });
      });
    });
  }

  // 建议项目 (展开卡片)
  const suggestionItems = suggestions.map((sugg, idx) => {
    const priorityColors = {
      high: { emoji: '[H]', label: '高' },
      medium: { emoji: '[M]', label: '中' },
      low: { emoji: '[L]', label: '低' },
    };
    const pConfig = priorityColors[sugg.priority] || { emoji: '[L]', label: '低' };

    return {
      key: idx,
      label: (
        <Space>
          <span>{pConfig.emoji}</span>
          <Tag color="cyan">{sugg.dimension}</Tag>
          <span style={{ fontWeight: 500 }}>{sugg.title}</span>
        </Space>
      ),
      children: (
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text strong>说明：</Text>
            <br />
            <Text type="secondary">{sugg.description}</Text>
          </div>
          <div>
            <Text strong>当前分数：</Text>
            <Text style={{ color: getScoreColor(sugg.score) }}>
              {sugg.score} 分
            </Text>
          </div>
          {sugg.example && (
            <Card size="small" style={{ backgroundColor: '#f5f5f5' }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>
                  <Text strong>示例：</Text>
                </div>
                <pre style={{ fontSize: '12px', overflow: 'auto', maxHeight: '200px', margin: 0 }}>
                  {sugg.example}
                </pre>
                <Button
                  type="text"
                  size="small"
                  onClick={() => handleCopyCode(sugg.example)}
                >
                  复制示例
                </Button>
              </Space>
            </Card>
          )}
        </Space>
      ),
    };
  });

  // 基准对比表
  const benchmarkColumns = [
    {
      title: 'Skill 名称',
      dataIndex: 'name',
      key: 'name',
      width: 150,
    },
    {
      title: '结构完整性',
      dataIndex: ['scores', 'structure'],
      key: 'structure',
      width: 100,
      render: (score) => (
        <span style={{ color: getScoreColor(score) }}>{score}</span>
      ),
    },
    {
      title: '功能覆盖度',
      dataIndex: ['scores', 'coverage'],
      key: 'coverage',
      width: 100,
      render: (score) => (
        <span style={{ color: getScoreColor(score) }}>{score}</span>
      ),
    },
    {
      title: '触发准确率',
      dataIndex: ['scores', 'trigger'],
      key: 'trigger',
      width: 100,
      render: (score) => (
        <span style={{ color: getScoreColor(score) }}>{score}</span>
      ),
    },
    {
      title: '鲁棒性',
      dataIndex: ['scores', 'robustness'],
      key: 'robustness',
      width: 100,
      render: (score) => (
        <span style={{ color: getScoreColor(score) }}>{score}</span>
      ),
    },
    {
      title: '可维护性',
      dataIndex: ['scores', 'maintainability'],
      key: 'maintainability',
      width: 100,
      render: (score) => (
        <span style={{ color: getScoreColor(score) }}>{score}</span>
      ),
    },
  ];

  // 历史时间线
  const timelineItems = history.map((item, idx) => ({
    dot: (
      <span
        style={{
          fontSize: '16px',
          color: getScoreColor(item.score),
          display: 'inline-block',
        }}
      >
        ✓
      </span>
    ),
    children: (
      <div>
        <Text strong>{item.timestamp}</Text>
        <br />
        <Text type="secondary">总分: {item.score}</Text>
      </div>
    ),
  }));

  return (
    <div style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* 评估配置区 */}
        <Card
          title={<Title level={4}>评估配置</Title>}
          style={{ boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}
        >
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Row gutter={16} align="middle">
              <Col xs={24} sm={16}>
                <Select
                  placeholder="选择要评估的 Skill"
                  options={skillOptions}
                  onChange={(value) => setSelectedSkillId(value)}
                  value={currentSkillId}
                  style={{ width: '100%' }}
                />
              </Col>
              <Col xs={24} sm={8}>
                <Button
                  type="primary"
                  size="large"
                  onClick={handleStartEvaluation}
                  loading={loading}
                  block
                  style={{ height: '40px', fontSize: '16px' }}
                >
                  开始评估
                </Button>
              </Col>
            </Row>
          </Space>
        </Card>

        {evaluationData ? (
          <>
            {/* 总分和等级 */}
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Card
                  style={{
                    textAlign: 'center',
                    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                  }}
                >
                  <Space direction="vertical">
                    <Title
                      level={2}
                      style={{
                        margin: 0,
                        color: getGrade(evaluationData.totalScore).color,
                      }}
                    >
                      {getGrade(evaluationData.totalScore).grade}
                    </Title>
                    <Statistic
                      value={evaluationData.totalScore}
                      suffix="/ 100"
                      valueStyle={{
                        color: getScoreColor(evaluationData.totalScore),
                        fontSize: '32px',
                      }}
                    />
                    <Text type="secondary">
                      {evaluationData.totalScore >= 95
                        ? '卓越水准'
                        : evaluationData.totalScore >= 85
                        ? '优秀水准'
                        : evaluationData.totalScore >= 75
                        ? '良好水准'
                        : evaluationData.totalScore >= 65
                        ? '及格水准'
                        : '需要改进'}
                    </Text>
                  </Space>
                </Card>
              </Col>
              <Col xs={24} md={12}>
                <Card style={{ boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
                  <Paragraph>
                    <Text strong>评估概览</Text>
                    <br />
                    <Text>
                      该 Skill 在 5 个维度的综合表现为
                      <Text
                        strong
                        style={{
                          color: getScoreColor(evaluationData.totalScore),
                        }}
                      >
                        {' '}
                        {evaluationData.totalScore}{' '}
                      </Text>
                      分，位于
                      <Text strong>{evaluationData.percentile}</Text>
                      分位数。
                    </Text>
                    <br />
                    <Text>
                      最弱维度：
                      <Tag color="orange" style={{ marginLeft: '8px' }}>
                        {evaluationData.weakestDimension}
                      </Tag>
                    </Text>
                  </Paragraph>
                </Card>
              </Col>
            </Row>

            {/* 雷达图 */}
            {radarData.length > 0 && (
              <Card
                title={<Title level={4}>多维度评估雷达图</Title>}
                style={{ boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}
              >
                <ResponsiveContainer width="100%" height={450}>
                  <RadarChart
                    data={radarData}
                    margin={{ top: 20, right: 30, bottom: 20, left: 30 }}
                  >
                    <PolarGrid strokeDasharray="3 3" />
                    <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 12 }} />
                    <PolarRadiusAxis
                      angle={90}
                      domain={[0, 100]}
                      tick={{ fontSize: 12 }}
                    />
                    <Radar
                      name="当前 Skill"
                      dataKey="当前Skill"
                      stroke="#1890ff"
                      fill="#1890ff"
                      fillOpacity={0.6}
                    />
                    <Radar
                      name="最佳实践"
                      dataKey="最佳实践"
                      stroke="#bfbfbf"
                      fill="#bfbfbf"
                      fillOpacity={0.2}
                      strokeDasharray="5 5"
                    />
                    <Legend
                      wrapperStyle={{ paddingTop: '20px' }}
                      verticalAlign="bottom"
                      height={36}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </Card>
            )}

            {/* 各维度得分卡 */}
            <Row gutter={16}>
              {DIMENSIONS.map((dim) => {
                const score = evaluationData.scores[dim.key];
                const comparison = evaluationData.comparison[dim.key];
                const isBetter = comparison > 0;

                return (
                  <Col xs={24} sm={12} md={8} lg={4.8} key={dim.key}>
                    <Card
                      style={{
                        borderTop: `4px solid ${getScoreColor(score)}`,
                        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                      }}
                    >
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <div>
                          <div
                            style={{
                              fontSize: '32px',
                              fontWeight: 'bold',
                              color: getScoreColor(score),
                              textAlign: 'center',
                            }}
                          >
                            {score}
                          </div>
                          <Text type="secondary" style={{ fontSize: '12px' }}>
                            {dim.label}
                          </Text>
                        </div>
                        <Text
                          type="secondary"
                          style={{ fontSize: '12px', lineHeight: '1.4' }}
                        >
                          {dim.description}
                        </Text>
                        <Progress
                          percent={score}
                          strokeColor={getScoreColor(score)}
                          showInfo={false}
                        />
                        <div style={{ textAlign: 'center' }}>
                          {isBetter ? (
                            <span style={{ color: '#52c41a', fontSize: '12px' }}>
                              ↑ +{comparison}
                            </span>
                          ) : (
                            <span style={{ color: '#ff4d4f', fontSize: '12px' }}>
                              ↓ {comparison}
                            </span>
                          )}
                        </div>
                      </Space>
                    </Card>
                  </Col>
                );
              })}
            </Row>

            {/* 详细检查项展开面板 */}
            <Card
              title={<Title level={4}>详细检查项</Title>}
              style={{ boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}
            >
              <Table
                columns={practiceColumns}
                dataSource={practiceTableData}
                pagination={{ pageSize: 15, showSizeChanger: true }}
                size="small"
                scroll={{ x: 800 }}
              />
            </Card>

            {/* 基准对比表 */}
            <Card
              title={<Title level={4}>基准 Skill 对比</Title>}
              style={{ boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}
            >
              <Table
                columns={benchmarkColumns}
                dataSource={benchmarkSkills.map((skill, idx) => ({ ...skill, key: idx }))}
                pagination={{ pageSize: 10, showSizeChanger: true }}
                size="small"
                scroll={{ x: 800 }}
              />
            </Card>

            {/* 优化建议 */}
            {suggestions.length > 0 && (
              <Card
                title={<Title level={4}>优化建议（按优先级排序）</Title>}
                style={{ boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}
              >
                {suggestions.filter((s) => s.priority === 'high').length > 0 && (
                  <Alert
                    message={`发现 ${suggestions.filter((s) => s.priority === 'high').length} 个高优先级问题，建议立即修复`}
                    type="error"
                    showIcon
                    style={{ marginBottom: '16px' }}
                  />
                )}
                {suggestions.length > 0 ? (
                  <Collapse items={suggestionItems} />
                ) : (
                  <Text type="success">该 Skill 已符合所有最佳实践</Text>
                )}
              </Card>
            )}

            {/* 评估历史 */}
            {history.length > 0 && (
              <Card
                title={<Title level={4}>评估历史和趋势</Title>}
                style={{ boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}
              >
                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Title level={5}>最近评估记录</Title>
                    <Timeline items={timelineItems} />
                  </Col>
                  <Col xs={24} md={12}>
                    {history.length > 1 && (
                      <>
                        <Title level={5}>分数趋势</Title>
                        <ResponsiveContainer width="100%" height={300}>
                          <LineChart
                            data={history.slice().reverse()}
                            margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                              dataKey="timestamp"
                              tick={{ fontSize: 10 }}
                              angle={-45}
                              textAnchor="end"
                              height={80}
                            />
                            <YAxis domain={[0, 100]} />
                            <RechartsTooltip />
                            <Line
                              type="monotone"
                              dataKey="score"
                              stroke="#1890ff"
                              dot={{ fill: '#1890ff' }}
                              name="总分"
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </>
                    )}
                  </Col>
                </Row>
              </Card>
            )}
          </>
        ) : (
          <Card
            style={{
              textAlign: 'center',
              padding: '48px',
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
            }}
          >
            <Spin spinning={loading}>
              <Empty
                description="选择 Skill 并点击『开始评估』查看详细分析"
                style={{ marginTop: '24px' }}
              />
            </Spin>
          </Card>
        )}
      </Space>
    </div>
  );
};

export default QualityEval;
