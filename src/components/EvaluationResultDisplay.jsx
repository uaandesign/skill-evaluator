import React from 'react';
import { Card, Row, Col, Progress, Tag, Divider, Space, Timeline, Rate, Empty, Spin, Collapse } from 'antd';
import { CheckCircleOutlined, WarningOutlined, ClockCircleOutlined } from '@ant-design/icons';

/**
 * EvaluationResultDisplay - 参考 Azure AI Foundry 风格的评估结果展示
 * 展示：执行结果、Judge 评分、维度评估
 */
const EvaluationResultDisplay = ({ result, loading }) => {
  if (loading) {
    return (
      <Card style={{ textAlign: 'center', padding: '40px' }}>
        <Spin size="large" tip="评估中..." />
      </Card>
    );
  }

  if (!result) {
    return (
      <Card>
        <Empty description="暂无评估结果，请先运行评估" />
      </Card>
    );
  }

  const { execution, judge, specialized, latency, model } = result;

  // 获取评分颜色
  const getScoreColor = (score) => {
    if (score >= 4) return '#22c55e'; // green
    if (score >= 3) return '#f59e0b'; // amber
    return '#ef4444'; // red
  };

  // 评分卡片
  const ScoreCard = ({ label, score, description }) => (
    <Col xs={24} sm={12} md={6}>
      <Card style={{ textAlign: 'center', borderTop: `3px solid ${getScoreColor(score)}` }}>
        <div style={{ fontSize: '28px', fontWeight: 700, color: getScoreColor(score), marginBottom: '8px' }}>
          {typeof score === 'number' ? score.toFixed(1) : 'N/A'}
        </div>
        <div style={{ fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '4px' }}>
          {label}
        </div>
        <div style={{ fontSize: '11px', color: '#6b7280' }}>
          {description}
        </div>
      </Card>
    </Col>
  );

  return (
    <div>
      {/* 顶部信息栏 */}
      <Card style={{ marginBottom: '16px', background: '#f9fafb' }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={8}>
            <div>
              <span style={{ fontSize: '12px', color: '#6b7280', display: 'block' }}>模型</span>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>{model || 'Unknown'}</span>
            </div>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <div>
              <span style={{ fontSize: '12px', color: '#6b7280', display: 'block' }}>耗时</span>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>
                {latency ? `${(latency / 1000).toFixed(1)}s` : 'N/A'}
              </span>
            </div>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <div>
              <span style={{ fontSize: '12px', color: '#6b7280', display: 'block' }}>状态</span>
              <Space>
                <CheckCircleOutlined style={{ color: '#22c55e', fontSize: '16px' }} />
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>评估完成</span>
              </Space>
            </div>
          </Col>
        </Row>
      </Card>

      {/* Judge 评分维度 */}
      {judge && judge.scores && (
        <Card title="Judge 评分（维度评估）" style={{ marginBottom: '16px' }}>
          <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
            <ScoreCard
              label="准确性"
              score={judge.scores.accuracy}
              description="答案与预期的匹配程度"
            />
            <ScoreCard
              label="完整性"
              score={judge.scores.completeness}
              description="是否覆盖所有关键内容"
            />
            <ScoreCard
              label="清晰度"
              score={judge.scores.clarity}
              description="表达的清晰程度"
            />
            <ScoreCard
              label="相关性"
              score={judge.scores.relevance}
              description="与问题的相关程度"
            />
          </Row>

          {/* Judge 总体反馈 */}
          {judge.feedback && (
            <>
              <Divider />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
                  评价反馈
                </div>
                <div style={{ fontSize: '13px', color: '#4b5563', lineHeight: 1.6 }}>
                  {judge.feedback}
                </div>
              </div>
            </>
          )}
        </Card>
      )}

      {/* 执行结果 */}
      {execution && (
        <Card title="执行结果" style={{ marginBottom: '16px' }}>
          <div style={{ maxHeight: '400px', overflowY: 'auto', background: '#f9fafb', padding: '12px', borderRadius: '6px', fontSize: '12px', fontFamily: "'Fira Code', monospace" }}>
            <pre style={{ margin: 0, color: '#374151', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {execution.content || 'No output'}
            </pre>
          </div>
        </Card>
      )}

      {/* 专项评估（如果有） */}
      {specialized && specialized.length > 0 && (
        <Card title="专项评估" style={{ marginBottom: '16px' }}>
          <Collapse
            items={specialized.map((item, idx) => ({
              key: idx,
              label: item.category,
              children: (
                <div>
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>评分</div>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: getScoreColor(item.score) }}>
                      {item.score}/5
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>评价</div>
                    <div style={{ fontSize: '13px', color: '#4b5563', lineHeight: 1.6 }}>
                      {item.feedback}
                    </div>
                  </div>
                </div>
              ),
            }))}
          />
        </Card>
      )}
    </div>
  );
};

export default EvaluationResultDisplay;
