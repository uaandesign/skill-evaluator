import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Card,
  Button,
  Select,
  Input,
  Typography,
  Tag,
  Space,
  Empty,
  message,
  Tabs,
  Tooltip,
  Spin,
  Alert,
  Segmented,
  List,
  Upload,
} from 'antd';
import { useStore } from '../store';
import { detectFormat, validateSkillMd, validateFunctionCall, validatePromptTemplate } from '../utils/skillParser';
import { getPreviewType } from '../specializedRules';
import DesignPreview from './DesignPreview';
import { saveTestRecord } from '../utils/historyManager';
import HistoryPanel from './HistoryPanel';

const { Text, Title, Paragraph } = Typography;
const { Option } = Select;

/**
 * SkillEditor — Dual-panel layout
 * ─────────────────────────────────────────────
 * LEFT  : Skill picker from library + editor (SKILL.md / function schema view)
 * RIGHT : Model picker + user input + run skill + output viewer
 * ─────────────────────────────────────────────
 */
const SkillEditor = () => {
  const {
    skills,
    updateSkill,
    saveSkillVersion,
    modelConfigs,
    activeSkillId,
    setActiveSkill,
  } = useStore();

  // ── Left panel state ──────────────────────────────────────────
  const [selectedSkillId, setSelectedSkillId] = useState(activeSkillId || null);
  const [editorContent, setEditorContent] = useState('');
  const [editorFormat, setEditorFormat] = useState('skillmd');
  const [dirty, setDirty] = useState(false);
  const [leftTab, setLeftTab] = useState('editor'); // 'editor' | 'function' | 'info'
  const [skillSearchText, setSkillSearchText] = useState('');

  // ── Right panel state ─────────────────────────────────────────
  const [selectedModelId, setSelectedModelId] = useState(null);
  const [userInput, setUserInput] = useState('');
  const [runLoading, setRunLoading] = useState(false);
  const [runOutput, setRunOutput] = useState('');
  const [runError, setRunError] = useState('');
  const [runDuration, setRunDuration] = useState(null);
  const [runModelLabel, setRunModelLabel] = useState('');
  const [outputTab, setOutputTab] = useState('preview'); // 'preview' | 'raw' | 'history'

  // ── Doc upload state ─────────────────────────────────────────
  const [docUploading, setDocUploading] = useState(false);
  const [uploadedDocName, setUploadedDocName] = useState('');
  const fileInputRef = useRef(null);

  // Read and extract text from uploaded document
  const handleDocUpload = async (file) => {
    const maxSize = 20 * 1024 * 1024; // 20 MB
    if (file.size > maxSize) {
      message.error('文件超过 20MB 限制');
      return false;
    }
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const supported = ['pdf', 'md', 'markdown', 'txt', 'doc', 'docx'];
    if (!supported.includes(ext)) {
      message.error(`不支持 .${ext} 格式，请上传 PDF / Markdown / TXT / Word`);
      return false;
    }

    setDocUploading(true);
    setUploadedDocName('');

    try {
      if (ext === 'txt' || ext === 'md' || ext === 'markdown') {
        // Read directly in browser
        const text = await file.text();
        setUserInput((prev) => (prev ? prev + '\n\n---\n\n' + text : text));
        setUploadedDocName(file.name);
        message.success(`已读取「${file.name}」`);
      } else {
        // Send to backend for PDF / DOCX extraction
        const ab = await file.arrayBuffer();
        // Use safe base64 encoding for large files (avoid stack overflow)
        let b64;
        try {
          // Try the optimized method first
          const bytes = new Uint8Array(ab);
          const binaryString = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
          b64 = btoa(binaryString);
        } catch (e) {
          // Fallback: chunk-based encoding for very large files
          const bytes = new Uint8Array(ab);
          const chunks = [];
          const chunkSize = 8192;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            chunks.push(String.fromCharCode.apply(null, bytes.slice(i, i + chunkSize)));
          }
          b64 = btoa(chunks.join(''));
        }
        const resp = await fetch('/api/extract-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, data: b64 }),
        });
        const result = await resp.json();
        if (result.error) throw new Error(result.error);
        const text = result.text || '';
        setUserInput((prev) => (prev ? prev + '\n\n---\n\n' + text : text));
        setUploadedDocName(file.name);
        message.success(`已从「${file.name}」提取 ${result.chars?.toLocaleString() || text.length} 字符`);
      }
    } catch (err) {
      message.error(`文档读取失败：${err.message}`);
    } finally {
      setDocUploading(false);
    }
    return false; // prevent antd auto upload
  };

  // ── Derived ───────────────────────────────────────────────────
  const selectedSkill = useMemo(
    () => skills.find((s) => s.id === selectedSkillId) || null,
    [skills, selectedSkillId]
  );

  const selectedModel = useMemo(
    () => modelConfigs.find((m) => m.id === selectedModelId) || null,
    [modelConfigs, selectedModelId]
  );

  const filteredSkills = useMemo(() => {
    if (!skillSearchText) return skills;
    const q = skillSearchText.toLowerCase();
    return skills.filter(
      (s) =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q)
    );
  }, [skills, skillSearchText]);

  // Load selected skill into editor
  useEffect(() => {
    if (selectedSkill) {
      setEditorContent(selectedSkill.content || '');
      const fmt = selectedSkill.format || detectFormat(selectedSkill.content || '');
      setEditorFormat(fmt);
      setDirty(false);
    } else {
      setEditorContent('');
      setEditorFormat('skillmd');
      setDirty(false);
    }
  }, [selectedSkill]);

  // Validate current content
  const validation = useMemo(() => {
    if (!editorContent) return null;
    switch (editorFormat) {
      case 'skillmd':
      case 'skill_md':
        return validateSkillMd(editorContent);
      case 'function':
      case 'function_call':
        return validateFunctionCall(editorContent);
      case 'prompt':
      case 'prompt_template':
        return validatePromptTemplate(editorContent);
      default:
        return null;
    }
  }, [editorContent, editorFormat]);

  // Function schema parsed from content
  const functionSchema = useMemo(() => {
    if (!selectedSkill || !editorContent) return null;

    // Case 1: skill itself is a function_call JSON
    if (editorFormat === 'function' || editorFormat === 'function_call') {
      try {
        return JSON.parse(editorContent);
      } catch {
        return null;
      }
    }

    // Case 2: skill is SKILL.md — try to extract parameters/returns from frontmatter via validator
    if (validation?.parsed) {
      const parsed = validation.parsed;
      if (parsed.name || parsed.parameters || parsed.returns) {
        return {
          name: parsed.name || selectedSkill.name || 'skill',
          description: parsed.description || selectedSkill.description || '',
          parameters: parsed.parameters || [],
          returns: parsed.returns || null,
        };
      }
    }

    return null;
  }, [selectedSkill, editorContent, editorFormat, validation]);

  // ── Handlers ──────────────────────────────────────────────────
  const handleContentChange = (e) => {
    setEditorContent(e.target.value);
    setDirty(true);
  };

  const handleSaveVersion = () => {
    if (!selectedSkill) {
      message.warning('请先选择一个技能');
      return;
    }
    if (!editorContent.trim()) {
      message.warning('内容不能为空');
      return;
    }
    saveSkillVersion(
      selectedSkill.id,
      editorContent,
      `编辑器修改 @ ${new Date().toLocaleString('zh-CN')}`
    );
    // Also update the "current content" on the skill so library shows latest
    updateSkill(selectedSkill.id, { content: editorContent, updatedAt: new Date().toISOString() });
    setDirty(false);
    message.success('已保存为新版本');
  };

  const handleRevert = () => {
    if (!selectedSkill) return;
    setEditorContent(selectedSkill.content || '');
    setDirty(false);
    message.info('已还原到当前版本');
  };

  const handleUseSkill = (skill) => {
    setSelectedSkillId(skill.id);
    setActiveSkill(skill.id);
    message.success(`已切换到技能：${skill.name || '未命名'}`);
  };

  const handleRunSkill = async () => {
    if (!selectedSkill || !editorContent) {
      message.warning('请先选择或编辑一个技能');
      return;
    }
    if (!selectedModel) {
      message.warning('请先选择一个大模型');
      return;
    }
    if (!userInput.trim()) {
      message.warning('请输入要发送给技能的内容');
      return;
    }

    setRunLoading(true);
    setRunOutput('');
    setRunError('');
    setRunDuration(null);

    try {
      // Add 300s timeout for browser fetch (supports slow models like Qwen)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300_000); // 300s timeout

      try {
        const resp = await fetch('/api/run-skill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            skill_content: editorContent,
            user_input: userInput,
            model_config: selectedModel,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const data = await resp.json();
        if (data.error) {
          setRunError(data.error);
          message.error(data.error);
        } else {
          setRunOutput(data.output || '');
          setRunDuration(data.duration_ms || null);
          setRunModelLabel(data.model || '');
          message.success('技能运行成功');

          // Save test record to history
          await saveTestRecord({
            skillId: selectedSkill.id,
            skillName: selectedSkill.name,
            testInput: userInput,
            testOutput: data.output || '',
            model: `${selectedModel.provider}/${selectedModel.model}`,
            latency: data.duration_ms || 0,
          });
        }
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        if (fetchErr.name === 'AbortError') {
          setRunError('请求超时（300秒）。模型响应太慢，请检查网络或换用其他模型');
          message.error('请求超时（300秒）。模型响应太慢，请检查网络或换用其他模型');
        } else {
          throw fetchErr;
        }
      }
    } catch (err) {
      setRunError(err.message || '请求失败');
      message.error('请求失败: ' + err.message);
    } finally {
      setRunLoading(false);
    }
  };

  const getFormatLabel = (f) => {
    const labels = {
      skillmd: 'SKILL.md',
      skill_md: 'SKILL.md',
      function: 'Function Call',
      function_call: 'Function Call',
      prompt: 'Prompt Template',
      prompt_template: 'Prompt Template',
    };
    return labels[f] || f || 'Unknown';
  };

  // ── Render: Left Panel ────────────────────────────────────────
  const leftPanel = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#fff',
        borderRight: '1px solid #e5e7eb',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid #e5e7eb',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Text strong style={{ fontSize: 14, color: '#111827' }}>技能编辑</Text>
          {selectedSkill && (
            <Space size={6}>
              <Tag style={{ fontSize: 11, margin: 0 }}>{getFormatLabel(editorFormat)}</Tag>
              {dirty && <Tag color="orange" style={{ fontSize: 11, margin: 0 }}>未保存</Tag>}
            </Space>
          )}
        </div>

        {/* Skill picker */}
        <Select
          showSearch
          allowClear
          placeholder="从技能库选择一个技能..."
          value={selectedSkillId}
          onChange={(v) => setSelectedSkillId(v)}
          style={{ width: '100%' }}
          filterOption={(input, option) =>
            (option?.label || '').toLowerCase().includes(input.toLowerCase())
          }
          options={skills.map((s) => ({
            value: s.id,
            label: s.name || '未命名技能',
          }))}
        />
      </div>

      {/* Skill quick list */}
      {!selectedSkillId && skills.length > 0 && (
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6' }}>
          <Text style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 8 }}>
            或快速选择技能库中的技能：
          </Text>
          <Input
            placeholder="搜索技能..."
            value={skillSearchText}
            onChange={(e) => setSkillSearchText(e.target.value)}
            size="small"
            allowClear
            style={{ marginBottom: 8 }}
          />
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            <List
              size="small"
              dataSource={filteredSkills.slice(0, 20)}
              locale={{ emptyText: '没有匹配的技能' }}
              renderItem={(skill) => (
                <List.Item
                  style={{ padding: '6px 0', cursor: 'pointer' }}
                  onClick={() => handleUseSkill(skill)}
                >
                  <div style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <Text strong style={{ fontSize: 12 }} ellipsis>
                        {skill.name || '未命名'}
                      </Text>
                      <Tag style={{ fontSize: 10, margin: 0, flexShrink: 0 }}>
                        {getFormatLabel(skill.format)}
                      </Tag>
                    </div>
                    {skill.description && (
                      <Text style={{ fontSize: 11, color: '#9ca3af' }} ellipsis>
                        {skill.description}
                      </Text>
                    )}
                  </div>
                </List.Item>
              )}
            />
          </div>
        </div>
      )}

      {!selectedSkillId && skills.length === 0 && (
        <div style={{ padding: 20, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Empty description="技能库为空，请前往「技能库」上传技能" imageStyle={{ height: 60 }} />
        </div>
      )}

      {/* Editor area */}
      {selectedSkillId && (
        <>
          <div style={{ padding: '12px 20px 0 20px', flexShrink: 0 }}>
            <Tabs
              activeKey={leftTab}
              onChange={setLeftTab}
              size="small"
              items={[
                { key: 'editor', label: '编辑 SKILL.md' },
                { key: 'function', label: '函数调用' },
                { key: 'info', label: '基本信息' },
              ]}
            />
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 16px 20px' }}>
            {leftTab === 'editor' && (
              <>
                <Input.TextArea
                  value={editorContent}
                  onChange={handleContentChange}
                  placeholder="技能内容 (SKILL.md 格式)..."
                  style={{
                    fontFamily: "'Fira Code', 'Courier New', monospace",
                    fontSize: 12,
                    lineHeight: 1.6,
                    minHeight: 380,
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 6,
                  }}
                  autoSize={{ minRows: 18, maxRows: 30 }}
                />

                {/* Validation errors only (not warnings) */}
                {validation && !validation.valid && validation.errors?.length > 0 && (
                  <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 6, background: '#fef2f2', border: '1px solid #fecaca', fontSize: 12, color: '#b91c1c' }}>
                    <span style={{ fontWeight: 600 }}>格式错误：</span>
                    {validation.errors.slice(0, 2).map((e, i) => (
                      <span key={i}> · {e.message}</span>
                    ))}
                  </div>
                )}
              </>
            )}

            {leftTab === 'function' && (
              <div>
                {functionSchema ? (
                  <div>
                    <Text style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 8 }}>
                      从技能中提取的函数调用结构：
                    </Text>
                    <pre
                      style={{
                        background: '#0f172a',
                        color: '#e2e8f0',
                        padding: 14,
                        borderRadius: 8,
                        fontSize: 12,
                        lineHeight: 1.6,
                        overflow: 'auto',
                        maxHeight: 420,
                        margin: 0,
                        fontFamily: "'Fira Code', 'Courier New', monospace",
                      }}
                    >
                      {JSON.stringify(functionSchema, null, 2)}
                    </pre>
                    <Button
                      size="small"
                      style={{ marginTop: 10 }}
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(functionSchema, null, 2));
                        message.success('已复制到剪贴板');
                      }}
                    >
                      复制 JSON
                    </Button>
                  </div>
                ) : (
                  <Empty
                    description={
                      <Text style={{ fontSize: 12, color: '#9ca3af' }}>
                        当前技能没有可识别的函数调用结构
                        <br />
                        （需要 SKILL.md 含 parameters 字段 或 JSON 函数格式）
                      </Text>
                    }
                    imageStyle={{ height: 60 }}
                    style={{ padding: '30px 0' }}
                  />
                )}
              </div>
            )}

            {leftTab === 'info' && selectedSkill && (
              <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                <div style={{ marginBottom: 8 }}>
                  <Text strong>名称：</Text>
                  <Text>{selectedSkill.name || '-'}</Text>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <Text strong>唯一名：</Text>
                  <Text code style={{ fontSize: 11 }}>{selectedSkill.uniqueName || '-'}</Text>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <Text strong>描述：</Text>
                  <Text>{selectedSkill.description || '-'}</Text>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <Text strong>格式：</Text>
                  <Tag>{getFormatLabel(selectedSkill.format)}</Tag>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <Text strong>版本数：</Text>
                  <Text>{selectedSkill.versions?.length || 1}</Text>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <Text strong>内容长度：</Text>
                  <Text>{(selectedSkill.content || '').length} 字符</Text>
                </div>
                <div>
                  <Text strong>更新时间：</Text>
                  <Text>
                    {selectedSkill.updatedAt
                      ? new Date(selectedSkill.updatedAt).toLocaleString('zh-CN')
                      : '-'}
                  </Text>
                </div>
              </div>
            )}
          </div>

          {/* Action bar */}
          <div
            style={{
              padding: '12px 20px',
              borderTop: '1px solid #e5e7eb',
              background: '#fafafa',
              flexShrink: 0,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 11, color: '#9ca3af' }}>
              {editorContent.length.toLocaleString()} 字符
            </Text>
            <Space>
              <Button size="small" onClick={handleRevert} disabled={!dirty}>
                还原
              </Button>
              <Button size="small" type="primary" onClick={handleSaveVersion} disabled={!dirty}>
                保存新版本
              </Button>
            </Space>
          </div>
        </>
      )}
    </div>
  );

  // ── Render: Right Panel ───────────────────────────────────────
  const rightPanel = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#f9fafb',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid #e5e7eb',
          background: '#fff',
          flexShrink: 0,
        }}
      >
        <Text strong style={{ fontSize: 14, color: '#111827' }}>
          运行测试
        </Text>
        <Text style={{ fontSize: 12, color: '#9ca3af', marginLeft: 8 }}>
          使用大模型运行当前技能，实时查看效果
        </Text>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {/* Model picker */}
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ fontSize: 12, color: '#374151', display: 'block', marginBottom: 6 }}>
            1. 选择大模型
          </Text>
          {modelConfigs.length === 0 ? (
            <Alert
              type="warning"
              message="暂无已配置模型"
              description="请前往「配置中心」添加模型"
              showIcon={false}
              style={{ padding: '8px 12px', fontSize: 12 }}
            />
          ) : (
            <Select
              value={selectedModelId}
              onChange={setSelectedModelId}
              placeholder="选择已配置的模型"
              style={{ width: '100%' }}
            >
              {modelConfigs.map((m) => (
                <Option key={m.id} value={m.id}>
                  {m.displayName || `${m.provider} / ${m.model}`}
                </Option>
              ))}
            </Select>
          )}
          {selectedModel && (
            <Text style={{ fontSize: 11, color: '#9ca3af', display: 'block', marginTop: 4 }}>
              {selectedModel.provider} · {selectedModel.model}
            </Text>
          )}
        </div>

        {/* User input */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Text strong style={{ fontSize: 12, color: '#374151' }}>
              2. 输入测试内容
            </Text>
            <Upload
              accept=".pdf,.md,.markdown,.txt,.doc,.docx"
              beforeUpload={handleDocUpload}
              showUploadList={false}
              maxCount={1}
            >
              <Button
                size="small"
                loading={docUploading}
                style={{ fontSize: 11 }}
              >
                {docUploading ? '解析中…' : '📎 上传文档'}
              </Button>
            </Upload>
          </div>
          <Input.TextArea
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="输入测试内容，或点击「上传文档」导入 PDF / Markdown / TXT / Word..."
            rows={6}
            style={{ fontSize: 13, borderRadius: 6 }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <Text style={{ fontSize: 11, color: '#9ca3af' }}>
              支持直接粘贴文本，或上传 PDF / Markdown / TXT / Word 文档
            </Text>
            {uploadedDocName && (
              <Text style={{ fontSize: 11, color: '#6b7280' }}>
                📄 {uploadedDocName}
                <span
                  style={{ marginLeft: 6, color: '#9ca3af', cursor: 'pointer' }}
                  onClick={() => { setUploadedDocName(''); setUserInput(''); }}
                >✕</span>
              </Text>
            )}
          </div>
        </div>

        {/* Run button */}
        <div style={{ marginBottom: 16 }}>
          <Button
            type="primary"
            block
            loading={runLoading}
            onClick={handleRunSkill}
            disabled={!selectedSkill || !selectedModel || !userInput.trim()}
          >
            {runLoading ? '运行中...' : '运行技能'}
          </Button>
        </div>

        {/* Output */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Text strong style={{ fontSize: 12, color: '#374151' }}>
              3. 运行结果
            </Text>
            {runDuration !== null && (
              <Space size={8}>
                {runModelLabel && (
                  <Tag style={{ fontSize: 10, margin: 0 }}>{runModelLabel}</Tag>
                )}
                <Tag color="green" style={{ fontSize: 10, margin: 0 }}>
                  {runDuration} ms
                </Tag>
              </Space>
            )}
          </div>

          {runLoading ? (
            <div style={{ padding: 30, textAlign: 'center', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6 }}>
              <Spin />
              <Text style={{ fontSize: 12, color: '#6b7280', display: 'block', marginTop: 10 }}>
                正在调用大模型，请稍候...
              </Text>
            </div>
          ) : runError ? (
            <Alert type="error" message="运行失败" description={runError} showIcon={false} style={{ padding: '10px 14px', fontSize: 12 }} />
          ) : runOutput || selectedSkill ? (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <Tabs
                activeKey={outputTab}
                onChange={setOutputTab}
                size="small"
                style={{ flex: 1, minHeight: 0 }}
                items={[
                  {
                    key: 'preview',
                    label: '预览',
                    children: (
                      <div style={{ flex: 1, minHeight: 0 }}>
                        {runOutput ? (
                          <DesignPreview
                            output={runOutput}
                            previewType={getPreviewType(selectedSkill?.category)}
                            previewEnv={null}
                          />
                        ) : (
                          <div style={{ background: '#fff', border: '1px dashed #e5e7eb', borderRadius: 6, padding: 30, textAlign: 'center' }}>
                            <Text style={{ fontSize: 12, color: '#9ca3af' }}>
                              运行技能后，输出将显示在此处
                            </Text>
                          </div>
                        )}
                      </div>
                    )
                  },
                  {
                    key: 'raw',
                    label: '原始结果',
                    children: (
                      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                        {runOutput ? (
                          <pre style={{
                            background: '#0f172a',
                            color: '#e2e8f0',
                            padding: 14,
                            borderRadius: 6,
                            fontSize: 12,
                            lineHeight: 1.5,
                            margin: 0,
                            fontFamily: "'Fira Code', 'Courier New', monospace",
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}>
                            {runOutput}
                          </pre>
                        ) : (
                          <div style={{ background: '#fff', border: '1px dashed #e5e7eb', borderRadius: 6, padding: 30, textAlign: 'center' }}>
                            <Text style={{ fontSize: 12, color: '#9ca3af' }}>
                              运行技能后，原始结果将显示在此处
                            </Text>
                          </div>
                        )}
                      </div>
                    )
                  },
                  {
                    key: 'history',
                    label: '测试历史',
                    children: selectedSkill ? (
                      <HistoryPanel skillId={selectedSkill.id} skillName={selectedSkill.name} />
                    ) : null
                  }
                ]}
              />
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px dashed #e5e7eb', borderRadius: 6, padding: 30, textAlign: 'center' }}>
              <Text style={{ fontSize: 12, color: '#9ca3af' }}>
                运行技能后，输出将显示在此处
              </Text>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ── Main render ───────────────────────────────────────────────
  return (
    <div
      style={{
        display: 'flex',
        height: 'calc(100vh - 52px)',
        width: '100%',
        overflow: 'hidden',
      }}
    >
      <div style={{ width: '50%', minWidth: 400, height: '100%' }}>{leftPanel}</div>
      <div style={{ width: '50%', minWidth: 400, height: '100%' }}>{rightPanel}</div>
    </div>
  );
};

export default SkillEditor;
