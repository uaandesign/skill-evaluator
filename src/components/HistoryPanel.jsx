import React, { useState, useEffect } from 'react';
import { Tabs, Button, Empty, Space, Tag, Spin, message, Modal, Statistic, Row, Col } from 'antd';
import { DeleteOutlined, DownloadOutlined, ClearOutlined } from '@ant-design/icons';
import { getTestHistory, getEvalHistory, deleteTestRecord, deleteEvalRecord, clearSkillHistory, exportHistory } from '../utils/historyManager';

export default function HistoryPanel({ skillId, skillName }) {
  const [testRecords, setTestRecords] = useState([]);
  const [evalRecords, setEvalRecords] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (skillId) {
      loadHistory();
    }
  }, [skillId]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const [tests, evals] = await Promise.all([
        getTestHistory(skillId),
        getEvalHistory(skillId),
      ]);
      setTestRecords(tests || []);
      setEvalRecords(evals || []);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTest = async (id) => {
    Modal.confirm({
      title: '删除测试记录',
      content: '确定要删除这条测试记录吗？',
      okText: '删除',
      cancelText: '取消',
      onOk: async () => {
        const success = await deleteTestRecord(id);
        if (success) {
          setTestRecords(testRecords.filter(r => r.id !== id));
          message.success('删除成功');
        } else {
          message.error('删除失败');
        }
      },
    });
  };

  const handleDeleteEval = async (id) => {
    Modal.confirm({
      title: '删除评估记录',
      content: '确定要删除这条评估记录吗？',
      okText: '删除',
      cancelText: '取消',
      onOk: async () => {
        const success = await deleteEvalRecord(id);
        if (success) {
          setEvalRecords(evalRecords.filter(r => r.id !== id));
          message.success('删除成功');
        } else {
          message.error('删除失败');
        }
      },
    });
  };

  const handleClear = async () => {
    Modal.confirm({
      title: '清空历史记录',
      content: `确定要清空 "${skillName}" 的所有历史记录吗？此操作不可撤销。`,
      okText: '清空',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        const success = await clearSkillHistory(skillId);
        if (success) {
          setTestRecords([]);
          setEvalRecords([]);
          message.success('历史记录已清空');
        } else {
          message.error('清空失败');
        }
      },
    });
  };

  const handleExport = async () => {
    const success = await exportHistory(skillId);
    if (success) {
      message.success('导出成功');
    } else {
      message.error('导出失败');
    }
  };

  return (
    <Spin spinning={loading}>
      <Tabs
        items={[
          {
            key: 'test',
            label: `测试历史 (${testRecords.length})`,
            children: <TestHistoryTab records={testRecords} onDelete={handleDeleteTest} />,
          },
          {
            key: 'eval',
            label: `评估历史 (${evalRecords.length})`,
            children: <EvalHistoryTab records={evalRecords} onDelete={handleDeleteEval} />,
          },
        ]}
      />

      <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e5e7eb' }}>
        <Space>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>
            导出历史
          </Button>
          <Button icon={<ClearOutlined />} danger onClick={handleClear}>
            清空所有记录
          </Button>
        </Space>
      </div>
    </Spin>
  );
}

function TestHistoryTab({ records, onDelete }) {
  if (records.length === 0) {
    return <Empty description="暂无测试历史" style={{ marginTop: 50 }} />;
  }

  return (
    <div style={{ marginTop: 16 }}>
      {records.map((record) => (
        <div
          key={record.id}
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            padding: 16,
            marginBottom: 12,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ marginBottom: 8 }}>
                <Tag color="blue">{record.model}</Tag>
                <Tag>{record.latency}ms</Tag>
                <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 12 }}>
                  {new Date(record.timestamp).toLocaleString('zh-CN')}
                </span>
              </div>

              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>
                  输入：
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: '#374151',
                    background: '#f9fafb',
                    padding: 8,
                    borderRadius: 4,
                    maxHeight: 60,
                    overflow: 'auto',
                  }}
                >
                  {record.test_input}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>
                  输出：
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: '#374151',
                    background: '#f9fafb',
                    padding: 8,
                    borderRadius: 4,
                    maxHeight: 80,
                    overflow: 'auto',
                  }}
                >
                  {record.test_output}
                </div>
              </div>
            </div>

            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              size="small"
              onClick={() => onDelete(record.id)}
              style={{ marginLeft: 12 }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function EvalHistoryTab({ records, onDelete }) {
  if (records.length === 0) {
    return <Empty description="暂无评估历史" style={{ marginTop: 50 }} />;
  }

  return (
    <div style={{ marginTop: 16 }}>
      {records.map((record) => (
        <div
          key={record.id}
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            padding: 16,
            marginBottom: 12,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ marginBottom: 12 }}>
                <Tag color="green" style={{ fontSize: 14, padding: '4px 12px' }}>
                  总分：{record.avg_score?.toFixed(1) || '-'}/5
                </Tag>
                <Tag>{record.model}</Tag>
                <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 12 }}>
                  {new Date(record.timestamp).toLocaleString('zh-CN')}
                </span>
              </div>

              <Row gutter={16} style={{ marginBottom: 12 }}>
                {record.scores &&
                  Object.entries(record.scores).map(([dimension, score]) => (
                    <Col key={dimension} xs={12} sm={6}>
                      <Statistic
                        title={dimension}
                        value={score}
                        suffix="/5"
                        valueStyle={{ fontSize: 14 }}
                      />
                    </Col>
                  ))}
              </Row>

              {record.optimization_suggestions?.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>
                    优化建议：
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                    • {record.optimization_suggestions[0]}
                  </div>
                </div>
              )}
            </div>

            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              size="small"
              onClick={() => onDelete(record.id)}
              style={{ marginLeft: 12 }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
