import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Card,
  Select,
  Input,
  Button,
  Row,
  Col,
  Upload,
  Spin,
  Typography,
  Tag,
  Space,
  Divider,
  message,
  Tooltip,
  Empty,
  Tabs,
  Badge,
  List,
} from 'antd';
import { useStore } from '../store';
import { chatWithModel } from '../utils/api';

const { TextArea } = Input;
const { Title, Text, Paragraph } = Typography;

/**
 * 简易 Markdown 渲染
 */
const SimpleMarkdown = ({ children }) => (
  <div
    style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}
    dangerouslySetInnerHTML={{
      __html: (children || '')
        .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre style="background:#f5f5f5;padding:12px;border-radius:6px;overflow-x:auto"><code>$2</code></pre>')
        .replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;padding:2px 6px;border-radius:3px">$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^### (.+)$/gm, '<h4>$1</h4>')
        .replace(/^## (.+)$/gm, '<h3>$1</h3>')
        .replace(/^# (.+)$/gm, '<h2>$1</h2>')
        .replace(/\n/g, '<br/>'),
    }}
  />
);

/**
 * 聊天消息气泡
 */
const ChatBubble = ({ role, content, timestamp }) => {
  const isUser = role === 'user';
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: '12px',
        padding: '0 8px',
      }}
    >
      <div
        style={{
          maxWidth: '85%',
          padding: '10px 14px',
          borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
          background: isUser ? '#6366f1' : '#f3f4f6',
          color: isUser ? '#fff' : '#1f2937',
          fontSize: '13px',
          lineHeight: '1.6',
          boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
        }}
      >
        {isUser ? (
          <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>
        ) : (
          <SimpleMarkdown>{content}</SimpleMarkdown>
        )}
        {timestamp && (
          <div style={{ fontSize: '10px', color: isUser ? 'rgba(255,255,255,0.6)' : '#9ca3af', marginTop: '4px', textAlign: 'right' }}>
            {new Date(timestamp).toLocaleTimeString('zh-CN')}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * 文件插槽标签
 */
const FileSlotTag = ({ file, onRemove }) => (
  <Tag
    closable
    onClose={() => onRemove(file.id)}
    style={{
      borderRadius: '6px',
      padding: '2px 8px',
      marginBottom: '4px',
      maxWidth: '200px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    }}
    color={
      file.type === 'skill' ? 'purple' :
      file.type === 'feishu' ? 'blue' :
      file.ext === 'pdf' ? 'red' :
      file.ext === 'csv' ? 'green' :
      'default'
    }
  >
    {file.type === 'skill' ? '🎯 ' : file.type === 'feishu' ? '📄 ' : '📎 '}
    {file.name}
  </Tag>
);

/**
 * 技能创建 - 左侧 AI 辅助编辑 + 右侧测试
 */
const SkillCreator = () => {
  const { modelConfigs, skills, addSkill, activeSkillId, setActiveSkill } = useStore();

  // ===== 左侧编辑区状态 =====
  const [editChatMessages, setEditChatMessages] = useState([]);
  const [editInput, setEditInput] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editModelId, setEditModelId] = useState(null);
  const [editAttachments, setEditAttachments] = useState([]); // { id, name, content, type, ext }
  const [skillContent, setSkillContent] = useState('');
  const [skillName, setSkillName] = useState('');

  // ===== 右侧测试区状态 =====
  const [testInput, setTestInput] = useState('');
  const [testModelId, setTestModelId] = useState(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState('');
  const [testAttachments, setTestAttachments] = useState([]);
  const [testHistory, setTestHistory] = useState([]);

  const editChatRef = useRef(null);
  const testResultRef = useRef(null);

  // 模型选项
  const modelOptions = modelConfigs.map((m) => ({
    label: m.displayName || `${m.provider} - ${m.model}`,
    value: m.id,
  }));

  // 技能选项（用于插槽）
  const skillOptions = skills.map((s) => ({
    label: s.name || '未命名',
    value: s.id,
  }));

  // 自动滚动到聊天底部
  useEffect(() => {
    if (editChatRef.current) {
      editChatRef.current.scrollTop = editChatRef.current.scrollHeight;
    }
  }, [editChatMessages]);

  // ===== 左侧编辑区功能 =====

  // 处理编辑区文件上传
  const handleEditFileUpload = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const ext = file.name.split('.').pop().toLowerCase();
      setEditAttachments((prev) => [
        ...prev,
        {
          id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          name: file.name,
          content: e.target.result,
          type: 'file',
          ext,
        },
      ]);
      message.success(`已添加文件: ${file.name}`);
    };
    reader.readAsText(file);
    return false;
  };

  // 添加技能引用插槽
  const handleAddSkillSlot = (skillId) => {
    const skill = skills.find((s) => s.id === skillId);
    if (!skill) return;
    setEditAttachments((prev) => [
      ...prev,
      {
        id: `skill_${Date.now()}`,
        name: skill.name,
        content: skill.content,
        type: 'skill',
        ext: 'md',
      },
    ]);
    message.success(`已引用技能: ${skill.name}`);
  };

  // 添加飞书云文档
  const handleAddFeishuDoc = () => {
    const url = window.prompt('请输入飞书云文档 URL:');
    if (!url) return;
    // 飞书文档支持：暂存 URL 引用
    setEditAttachments((prev) => [
      ...prev,
      {
        id: `feishu_${Date.now()}`,
        name: `飞书文档`,
        content: `[飞书云文档] ${url}`,
        type: 'feishu',
        ext: 'url',
      },
    ]);
    message.success('已添加飞书云文档引用');
  };

  // 移除附件
  const handleRemoveEditAttachment = (id) => {
    setEditAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // 发送编辑区消息（调用 AI）
  const handleEditSend = useCallback(async () => {
    if (!editInput.trim() && editAttachments.length === 0) return;
    if (!editModelId) {
      message.warning('请先选择一个模型');
      return;
    }

    const modelConfig = modelConfigs.find((m) => m.id === editModelId);
    if (!modelConfig || !modelConfig.apiKey) {
      message.warning('所选模型未配置 API Key');
      return;
    }

    // 构建消息内容（含附件）
    let fullContent = editInput;
    if (editAttachments.length > 0) {
      const attachmentText = editAttachments
        .map((a) => {
          if (a.type === 'skill') return `\n\n--- 引用技能: ${a.name} ---\n${a.content}\n--- 技能结束 ---`;
          if (a.type === 'feishu') return `\n\n--- 飞书文档引用 ---\n${a.content}\n--- 引用结束 ---`;
          return `\n\n--- 上传文件: ${a.name} ---\n${a.content}\n--- 文件结束 ---`;
        })
        .join('');
      fullContent = fullContent + attachmentText;
    }

    const userMessage = {
      role: 'user',
      content: editInput,
      attachments: editAttachments.map((a) => ({ name: a.name, type: a.type })),
      timestamp: Date.now(),
    };

    setEditChatMessages((prev) => [...prev, userMessage]);
    setEditInput('');
    setEditAttachments([]);
    setEditLoading(true);

    try {
      const systemPrompt = `你是一个 AI Skill 创建助手。你的任务是帮助用户编写和优化 AI Skill。
请使用中文回复。

当前技能内容：
${skillContent || '(空，尚未创建)'}

用户可能会：
- 要求你创建新的 Skill（SKILL.md 格式、函数调用格式或提示词模板格式）
- 要求你修改或优化现有技能
- 上传参考文件或引用其他技能
- 询问关于 Skill 编写的最佳实践

如果用户要求你创建或修改技能，请直接输出完整的技能内容（不要用代码块包裹），并说明修改了什么。`;

      const messages = [
        ...editChatMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        { role: 'user', content: fullContent },
      ];

      const result = await chatWithModel({
        provider: modelConfig.provider,
        apiKey: modelConfig.apiKey,
        model: modelConfig.model,
        baseUrl: modelConfig.baseUrl,
        messages,
        systemPrompt,
      });

      const assistantMessage = {
        role: 'assistant',
        content: result.content || result.error || '(无响应)',
        timestamp: Date.now(),
      };

      setEditChatMessages((prev) => [...prev, assistantMessage]);

      // 如果响应看起来像技能内容，自动提取到编辑器
      if (result.content && (result.content.includes('---\nname:') || result.content.includes('---\r\nname:'))) {
        setSkillContent(result.content);
        message.info('已自动提取技能内容到编辑区');
      }
    } catch (err) {
      message.error('AI 调用失败: ' + err.message);
    } finally {
      setEditLoading(false);
    }
  }, [editInput, editAttachments, editModelId, modelConfigs, editChatMessages, skillContent]);

  // 保存技能到技能库
  const handleSaveToLibrary = () => {
    if (!skillContent.trim()) {
      message.warning('技能内容为空');
      return;
    }
    const name = skillName || `新建技能_${new Date().toLocaleDateString('zh-CN')}`;
    const skillId = `skill_${Date.now()}`;
    addSkill({
      id: skillId,
      name,
      description: '通过技能创建模块创建',
      content: skillContent,
      format: 'skillmd',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setActiveSkill(skillId);
    message.success(`技能「${name}」已保存到技能库`);
  };

  // ===== 右侧测试区功能 =====

  // 处理测试区文件上传
  const handleTestFileUpload = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const ext = file.name.split('.').pop().toLowerCase();
      setTestAttachments((prev) => [
        ...prev,
        {
          id: `tfile_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          name: file.name,
          content: e.target.result,
          type: 'file',
          ext,
        },
      ]);
      message.success(`已添加测试文件: ${file.name}`);
    };
    if (['pdf'].includes(file.name.split('.').pop().toLowerCase())) {
      // PDF 以 base64 读取
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
    return false;
  };

  // 添加飞书云文档到测试区
  const handleAddTestFeishuDoc = () => {
    const url = window.prompt('请输入飞书云文档 URL:');
    if (!url) return;
    setTestAttachments((prev) => [
      ...prev,
      {
        id: `tfeishu_${Date.now()}`,
        name: '飞书文档',
        content: `[飞书云文档] ${url}`,
        type: 'feishu',
        ext: 'url',
      },
    ]);
    message.success('已添加飞书云文档引用');
  };

  const handleRemoveTestAttachment = (id) => {
    setTestAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // 运行测试
  const handleRunTest = useCallback(async () => {
    if (!testInput.trim() && testAttachments.length === 0) {
      message.warning('请输入测试内容');
      return;
    }
    if (!testModelId) {
      message.warning('请先选择测试模型');
      return;
    }

    const modelConfig = modelConfigs.find((m) => m.id === testModelId);
    if (!modelConfig || !modelConfig.apiKey) {
      message.warning('所选模型未配置 API Key');
      return;
    }

    setTestLoading(true);
    setTestResult('');

    try {
      // 构建测试消息（含附件）
      let fullTestContent = testInput;
      if (testAttachments.length > 0) {
        const attachmentText = testAttachments
          .map((a) => {
            if (a.type === 'feishu') return `\n\n--- 飞书文档引用 ---\n${a.content}\n--- 引用结束 ---`;
            return `\n\n--- 上传文件: ${a.name} ---\n${a.content}\n--- 文件结束 ---`;
          })
          .join('');
        fullTestContent = fullTestContent + attachmentText;
      }

      const startTime = Date.now();
      const result = await chatWithModel({
        provider: modelConfig.provider,
        apiKey: modelConfig.apiKey,
        model: modelConfig.model,
        baseUrl: modelConfig.baseUrl,
        messages: [{ role: 'user', content: fullTestContent }],
        systemPrompt: skillContent || undefined,
      });
      const latency = Date.now() - startTime;

      setTestResult(result.content || result.error || '(无响应)');

      // 记录测试历史
      setTestHistory((prev) => [
        {
          id: Date.now(),
          input: testInput.substring(0, 80),
          output: (result.content || '').substring(0, 120),
          latency,
          model: modelConfig.displayName || modelConfig.model,
          timestamp: new Date().toISOString(),
          tokens: result.usage,
        },
        ...prev.slice(0, 19),
      ]);

      message.success(`测试完成，耗时 ${latency}ms`);
    } catch (err) {
      message.error('测试失败: ' + err.message);
    } finally {
      setTestLoading(false);
    }
  }, [testInput, testAttachments, testModelId, modelConfigs, skillContent]);

  // ===== 渲染 =====

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 110px)', gap: '1px', background: '#e5e7eb' }}>
      {/* ====== 左侧：AI 辅助编辑区 ====== */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', minWidth: 0 }}>
        {/* 标题栏 */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <Text strong style={{ fontSize: '15px' }}>✏️ 技能创建</Text>
            <Tag color="purple" style={{ fontSize: '11px' }}>AI 辅助编辑</Tag>
          </Space>
          <Space size="small">
            <Select
              placeholder="选择模型"
              options={modelOptions}
              value={editModelId}
              onChange={setEditModelId}
              style={{ width: '180px' }}
              size="small"
            />
          </Space>
        </div>

        {/* 技能编辑器区域 */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
            <Input
              placeholder="技能名称"
              value={skillName}
              onChange={(e) => setSkillName(e.target.value)}
              style={{ width: '200px' }}
              size="small"
            />
            <Button type="primary" size="small" onClick={handleSaveToLibrary} disabled={!skillContent.trim()}>
              💾 保存到技能库
            </Button>
            <Button size="small" onClick={() => { if (skillContent) { navigator.clipboard.writeText(skillContent); message.success('已复制'); } }}>
              📋 复制
            </Button>
          </div>
          <TextArea
            placeholder="在此编写技能内容（SKILL.md 格式）...&#10;也可以通过下方 AI 对话生成"
            value={skillContent}
            onChange={(e) => setSkillContent(e.target.value)}
            rows={6}
            style={{
              fontFamily: "'Fira Code', 'Courier New', monospace",
              fontSize: '12px',
              borderRadius: '6px',
              resize: 'vertical',
            }}
          />
        </div>

        {/* AI 聊天区域 */}
        <div ref={editChatRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 8px', background: '#fafafa' }}>
          {editChatMessages.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>🤖</div>
              <Text style={{ color: '#9ca3af' }}>与 AI 对话来创建和优化技能</Text>
              <br />
              <Text style={{ color: '#d1d5db', fontSize: '12px' }}>可以上传参考文件、引用已有技能</Text>
            </div>
          )}
          {editChatMessages.map((msg, idx) => (
            <ChatBubble key={idx} role={msg.role} content={msg.content} timestamp={msg.timestamp} />
          ))}
          {editLoading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', padding: '0 8px', marginBottom: '12px' }}>
              <div style={{ padding: '10px 14px', borderRadius: '12px 12px 12px 2px', background: '#f3f4f6' }}>
                <Spin size="small" /> <Text style={{ marginLeft: '8px', color: '#6b7280', fontSize: '13px' }}>AI 思考中...</Text>
              </div>
            </div>
          )}
        </div>

        {/* 编辑区输入栏 */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #f3f4f6', background: '#fff' }}>
          {/* 附件显示 */}
          {editAttachments.length > 0 && (
            <div style={{ marginBottom: '8px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {editAttachments.map((a) => (
                <FileSlotTag key={a.id} file={a} onRemove={handleRemoveEditAttachment} />
              ))}
            </div>
          )}
          {/* 插槽按钮 */}
          <div style={{ marginBottom: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <Upload accept=".txt,.md,.csv,.pdf,.json,.yaml,.yml" beforeUpload={handleEditFileUpload} showUploadList={false}>
              <Button size="small" type="dashed">📎 上传文件</Button>
            </Upload>
            <Select
              placeholder="🎯 引用技能"
              options={skillOptions}
              onChange={handleAddSkillSlot}
              value={undefined}
              style={{ width: '140px' }}
              size="small"
              allowClear
            />
            <Button size="small" type="dashed" onClick={handleAddFeishuDoc}>
              📄 飞书文档
            </Button>
          </div>
          {/* 输入框 */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <TextArea
              placeholder="描述你想要创建的技能，或粘贴参考内容..."
              value={editInput}
              onChange={(e) => setEditInput(e.target.value)}
              onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); handleEditSend(); } }}
              autoSize={{ minRows: 1, maxRows: 4 }}
              style={{ flex: 1, borderRadius: '8px' }}
            />
            <Button
              type="primary"
              onClick={handleEditSend}
              loading={editLoading}
              disabled={!editInput.trim() && editAttachments.length === 0}
              style={{ alignSelf: 'flex-end', borderRadius: '8px' }}
            >
              发送
            </Button>
          </div>
        </div>
      </div>

      {/* ====== 右侧：测试区 ====== */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', minWidth: 0 }}>
        {/* 标题栏 */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <Text strong style={{ fontSize: '15px' }}>🧪 技能测试</Text>
            {skillContent && <Tag color="green" style={{ fontSize: '11px' }}>技能已加载</Tag>}
            {!skillContent && <Tag style={{ fontSize: '11px' }}>无技能（裸模型）</Tag>}
          </Space>
          <Select
            placeholder="选择测试模型"
            options={modelOptions}
            value={testModelId}
            onChange={setTestModelId}
            style={{ width: '180px' }}
            size="small"
          />
        </div>

        {/* 测试结果展示区 */}
        <div ref={testResultRef} style={{ flex: 1, overflowY: 'auto', padding: '16px', background: '#fafafa' }}>
          {!testResult && !testLoading && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>🧪</div>
              <Text style={{ color: '#9ca3af' }}>在下方输入测试内容，查看技能效果</Text>
              <br />
              <Text style={{ color: '#d1d5db', fontSize: '12px' }}>支持上传 TXT/MD/CSV/PDF 和飞书云文档</Text>
            </div>
          )}
          {testLoading && (
            <Card style={{ textAlign: 'center', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
              <Spin tip="测试中..." />
            </Card>
          )}
          {testResult && !testLoading && (
            <Card
              style={{ borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
              styles={{ body: { padding: '16px' } }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <Text strong>模型输出</Text>
                <Button
                  size="small"
                  type="text"
                  onClick={() => { navigator.clipboard.writeText(testResult); message.success('已复制'); }}
                >
                  📋 复制
                </Button>
              </div>
              <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                <SimpleMarkdown>{testResult}</SimpleMarkdown>
              </div>
            </Card>
          )}

          {/* 测试历史 */}
          {testHistory.length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <Text strong style={{ fontSize: '13px', color: '#6b7280' }}>测试历史</Text>
                <Button type="text" danger size="small" onClick={() => { setTestHistory([]); message.success('历史已清除'); }}>
                  清空
                </Button>
              </div>
              <List
                size="small"
                dataSource={testHistory}
                renderItem={(item) => (
                  <List.Item
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      marginBottom: '4px',
                      background: '#fff',
                      border: '1px solid #f3f4f6',
                    }}
                  >
                    <List.Item.Meta
                      title={
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Text style={{ fontSize: '12px' }} ellipsis>{item.input}...</Text>
                          <Tag style={{ fontSize: '10px' }}>{item.latency}ms</Tag>
                        </div>
                      }
                      description={
                        <Text style={{ fontSize: '11px', color: '#9ca3af' }} ellipsis>
                          {item.model} · {new Date(item.timestamp).toLocaleTimeString('zh-CN')}
                        </Text>
                      }
                    />
                  </List.Item>
                )}
              />
            </div>
          )}
        </div>

        {/* 测试输入区 */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #f3f4f6', background: '#fff' }}>
          {/* 测试附件 */}
          {testAttachments.length > 0 && (
            <div style={{ marginBottom: '8px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {testAttachments.map((a) => (
                <FileSlotTag key={a.id} file={a} onRemove={handleRemoveTestAttachment} />
              ))}
            </div>
          )}
          {/* 测试插槽 */}
          <div style={{ marginBottom: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <Upload accept=".txt,.md,.csv,.pdf" beforeUpload={handleTestFileUpload} showUploadList={false}>
              <Button size="small" type="dashed">📎 上传文件</Button>
            </Upload>
            <Button size="small" type="dashed" onClick={handleAddTestFeishuDoc}>
              📄 飞书文档
            </Button>
          </div>
          {/* 输入 */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <TextArea
              placeholder="输入测试内容..."
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); handleRunTest(); } }}
              autoSize={{ minRows: 1, maxRows: 4 }}
              style={{ flex: 1, borderRadius: '8px' }}
            />
            <Button
              type="primary"
              onClick={handleRunTest}
              loading={testLoading}
              disabled={!testInput.trim() && testAttachments.length === 0}
              style={{ alignSelf: 'flex-end', borderRadius: '8px', background: '#10b981', borderColor: '#10b981' }}
            >
              测试
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SkillCreator;
