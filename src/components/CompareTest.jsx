import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Select, Input, Button, Upload, Spin, Typography, Space, message, Tooltip,
} from 'antd';
import { useStore } from '../store';
import { chatWithModel } from '../utils/api';
import { parseUploadedFile, fetchDocumentContent, getCapabilityStatus } from '../utils/fileService';

const { TextArea } = Input;
const { Text } = Typography;

/* ========== Shared Sub-components ========== */

const SimpleMarkdown = ({ children }) => (
  <div
    style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, fontSize: '13px', color: '#1f2937' }}
    dangerouslySetInnerHTML={{
      __html: (children || '')
        .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre style="background:#f3f4f6;padding:14px;border-radius:8px;overflow-x:auto;font-size:12px;border:1px solid #e5e7eb;font-family:JetBrains Mono,Fira Code,monospace"><code>$2</code></pre>')
        .replace(/`([^`]+)`/g, '<code style="background:#f3f4f6;padding:2px 7px;border-radius:4px;font-size:12px;color:#111827;font-family:JetBrains Mono,Fira Code,monospace">$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:600;color:#111827">$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^### (.+)$/gm, '<h4 style="margin:14px 0 6px;font-size:14px;font-weight:600;color:#111827">$1</h4>')
        .replace(/^## (.+)$/gm, '<h3 style="margin:16px 0 8px;font-size:15px;font-weight:600;color:#111827">$1</h3>')
        .replace(/^# (.+)$/gm, '<h2 style="margin:18px 0 10px;font-size:17px;font-weight:600;color:#111827">$1</h2>')
        .replace(/\n/g, '<br/>'),
    }}
  />
);

const ChatBubble = ({ role, content, timestamp }) => {
  const isUser = role === 'user';
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: '10px', padding: '0 6px' }}>
      {!isUser && (
        <div style={{ width: '24px', height: '24px', borderRadius: '8px', background: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '10px', fontWeight: 700, marginRight: '8px', flexShrink: 0, marginTop: '2px' }}>AI</div>
      )}
      <div style={{
        maxWidth: '85%', padding: '10px 14px',
        borderRadius: isUser ? '14px 14px 4px 14px' : '4px 14px 14px 14px',
        background: isUser ? '#111827' : '#fff',
        color: isUser ? '#fff' : '#1f2937', fontSize: '13px', lineHeight: '1.65',
        boxShadow: isUser ? '0 2px 8px rgba(0,0,0,0.12)' : '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        border: isUser ? 'none' : '1px solid #f3f4f6',
      }}>
        {isUser ? <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div> : <SimpleMarkdown>{content}</SimpleMarkdown>}
        {timestamp && (
          <div style={{ fontSize: '10px', color: isUser ? 'rgba(255,255,255,0.5)' : '#d1d5db', marginTop: '4px', textAlign: 'right' }}>
            {new Date(timestamp).toLocaleTimeString('zh-CN')}
          </div>
        )}
      </div>
    </div>
  );
};

const FileSlotTag = ({ file, onRemove }) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '3px 8px', marginBottom: '4px', maxWidth: '220px', fontSize: '12px', color: '#374151' }}>
    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{file.name}</span>
    {file.loading && <Spin size="small" />}
    <span
      onClick={(e) => { e.stopPropagation(); onRemove(file.id); }}
      style={{ cursor: 'pointer', color: '#9ca3af', fontSize: '14px', lineHeight: 1, flexShrink: 0, width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', transition: 'all 150ms' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#e5e7eb'; e.currentTarget.style.color = '#111827'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9ca3af'; }}
    >x</span>
  </div>
);

/* ========== Slash Command Dropdown ========== */

const SlashCommandMenu = ({ visible, commands, selectedIndex, onSelect }) => {
  if (!visible || commands.length === 0) return null;
  return (
    <div style={{ position: 'absolute', bottom: '100%', left: '0', width: '280px', maxHeight: '240px', overflowY: 'auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 1000, padding: '4px 0', marginBottom: '4px' }}>
      {commands.map((cmd, idx) => (
        <div key={cmd.id || idx} onClick={() => onSelect(cmd)}
          style={{ padding: '8px 14px', cursor: 'pointer', background: idx === selectedIndex ? '#f3f4f6' : '#fff', transition: 'background 100ms', borderBottom: idx < commands.length - 1 ? '1px solid #f9fafb' : 'none' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = idx === selectedIndex ? '#f3f4f6' : '#fff'; }}
        >
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>/{cmd.command}</div>
          <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>{cmd.description}</div>
        </div>
      ))}
    </div>
  );
};

/* ========== Unified Styles ========== */

const UNIFIED_INPUT_STYLE = { padding: '14px 16px', background: '#fff', borderTop: '1px solid #e5e7eb', flexShrink: 0 };
const UNIFIED_TEXTAREA_STYLE = { flex: 1, borderRadius: '8px', fontSize: '13px', lineHeight: '1.6', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" };
const UNIFIED_BTN_ROW = { marginBottom: '8px', display: 'flex', gap: '6px', alignItems: 'center' };

/* ========== Main Component ========== */

const CompareTest = () => {
  const { modelConfigs, skills, addSkill, saveSkillVersion, activeSkillId, setActiveSkill, setActiveTab } = useStore();

  /* ----- Left Edit Area ----- */
  const [skillContent, setSkillContent] = useState('');
  const [skillName, setSkillName] = useState('');
  const [editChatMessages, setEditChatMessages] = useState([]);
  const [editInput, setEditInput] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editModelId, setEditModelId] = useState(null);
  const [editAttachments, setEditAttachments] = useState([]);
  const [editSelectedSkillId, setEditSelectedSkillId] = useState(null);
  const editChatRef = useRef(null);

  // Auto-load skill content when a skill is selected in the header picker
  const handleEditSkillSelect = useCallback((skillId) => {
    setEditSelectedSkillId(skillId);
    if (!skillId) return;
    const sk = skills.find((s) => s.id === skillId);
    if (sk) {
      setSkillContent(sk.content || '');
      setSkillName(sk.name || '');
      setActiveSkill(skillId);
      message.success(`已加载技能「${sk.name}」的 SKILL.md`);
    }
  }, [skills, setActiveSkill]);

  /* ----- Right Test Area ----- */
  const [panelAModelId, setPanelAModelId] = useState(null);
  const [panelASkillId, setPanelASkillId] = useState('__current__');
  const [panelAResult, setPanelAResult] = useState('');
  const [panelALoading, setPanelALoading] = useState(false);
  const [panelALatency, setPanelALatency] = useState(0);
  const [panelATokens, setPanelATokens] = useState(null);
  const [panelBModelId, setPanelBModelId] = useState(null);
  const [panelBSkillId, setPanelBSkillId] = useState(null);
  const [panelBResult, setPanelBResult] = useState('');
  const [panelBLoading, setPanelBLoading] = useState(false);
  const [panelBLatency, setPanelBLatency] = useState(0);
  const [panelBTokens, setPanelBTokens] = useState(null);

  /* ----- Unified Test Input ----- */
  const [testInput, setTestInput] = useState('');
  const [testAttachments, setTestAttachments] = useState([]);

  /* ----- Slash Command State ----- */
  const [editSlashVisible, setEditSlashVisible] = useState(false);
  const [editSlashIndex, setEditSlashIndex] = useState(0);
  const [testSlashVisible, setTestSlashVisible] = useState(false);
  const [testSlashIndex, setTestSlashIndex] = useState(0);
  const [slashFilter, setSlashFilter] = useState('');

  /* ----- Slash commands ----- */
  const slashCommands = useMemo(() => {
    const builtIn = [
      { id: '__clear__', command: 'clear', description: '清空当前输入和附件' },
      { id: '__reset__', command: 'reset', description: '重置所有面板结果' },
      { id: '__config__', command: 'config', description: '打开配置中心' },
    ];
    const skillCmds = skills.map((s) => ({
      id: s.id, command: `skill:${(s.name || 'unnamed').replace(/\s+/g, '-').toLowerCase()}`,
      description: `引用技能「${s.name || '未命名'}」`, type: 'skill', content: s.content, name: s.name,
    }));
    return [...builtIn, ...skillCmds];
  }, [skills]);

  const filteredSlashCommands = useMemo(() => {
    if (!slashFilter) return slashCommands;
    const q = slashFilter.toLowerCase();
    return slashCommands.filter((c) => c.command.includes(q) || c.description.includes(q));
  }, [slashCommands, slashFilter]);

  /* ----- Options from ConfigCenter ----- */
  const modelOptions = modelConfigs.map((m) => ({ label: m.displayName || `${m.provider} - ${m.model}`, value: m.id }));
  const skillSelectOptions = [
    { label: '当前编辑中的 Skill', value: '__current__' },
    { label: '无（裸模型）', value: null },
    ...skills.map((s) => ({ label: s.name || '未命名', value: s.id })),
  ];
  const skillSlotOptions = skills.map((s) => ({ label: s.name || '未命名', value: s.id }));
  const capStatus = getCapabilityStatus();

  useEffect(() => {
    if (activeSkillId && !skillContent) {
      const skill = skills.find((s) => s.id === activeSkillId);
      if (skill) { setSkillContent(skill.content || ''); setSkillName(skill.name || ''); }
    }
  }, [activeSkillId]);

  useEffect(() => {
    if (editChatRef.current) editChatRef.current.scrollTop = editChatRef.current.scrollHeight;
  }, [editChatMessages]);

  /* ==============================
     Slash Command Handlers
     ============================== */

  const handleSlashInput = (value, setInput, setVisible, setIndex) => {
    setInput(value);
    const lines = value.split('\n');
    const lastLine = lines[lines.length - 1];
    if (lastLine.startsWith('/')) {
      setSlashFilter(lastLine.substring(1));
      setVisible(true);
      setIndex(0);
    } else {
      setVisible(false);
      setSlashFilter('');
    }
  };

  const handleSlashSelect = (cmd, input, setInput, setVisible, setAttachments, area) => {
    setVisible(false);
    setSlashFilter('');
    const lines = input.split('\n');
    lines[lines.length - 1] = '';
    const cleanInput = lines.join('\n').trimEnd();

    if (cmd.id === '__clear__') { setInput(''); setAttachments([]); message.info('已清空'); return; }
    if (cmd.id === '__reset__') {
      if (area === 'test') { setPanelAResult(''); setPanelBResult(''); setPanelALatency(0); setPanelBLatency(0); setPanelATokens(null); setPanelBTokens(null); }
      setInput(cleanInput); message.info('已重置'); return;
    }
    if (cmd.id === '__config__') { setActiveTab('config-center'); return; }
    if (cmd.type === 'skill') {
      setAttachments((prev) => [...prev, { id: `slash_${Date.now()}`, name: cmd.name, content: cmd.content, type: 'skill', ext: 'md' }]);
      setInput(cleanInput); message.success(`已引用技能: ${cmd.name}`); return;
    }
    setInput(cleanInput);
  };

  const handleSlashKeyDown = (e, visible, cmds, idx, setIdx, onSelect) => {
    if (!visible) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((p) => Math.min(p + 1, cmds.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((p) => Math.max(p - 1, 0)); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); if (cmds[idx]) onSelect(cmds[idx]); }
    else if (e.key === 'Escape') { e.preventDefault(); setEditSlashVisible(false); setTestSlashVisible(false); }
  };

  /* ==============================
     File Upload — delegates to fileService
     ============================== */

  const handleFileUpload = async (file, setAttachments) => {
    const fileId = `f_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const ext = file.name.split('.').pop().toLowerCase();

    // Add loading placeholder
    setAttachments((prev) => [...prev, { id: fileId, name: file.name, content: '', type: 'file', ext, loading: true }]);
    message.loading({ content: `解析文件: ${file.name}...`, key: fileId, duration: 0 });

    const result = await parseUploadedFile(file);

    setAttachments((prev) => prev.map((a) => a.id === fileId ? { ...result, id: fileId, loading: false } : a));
    message.destroy(fileId);
    message.success(`${file.name} 已就绪`);
    return false;
  };

  /* ==============================
     Document / Link Fetch — delegates to fileService
     ============================== */

  const handleAddDocOrLink = async (setAttachments) => {
    const url = window.prompt('请输入飞书云文档 URL 或外部链接:');
    if (!url?.trim()) return;

    const isFeishu = /feishu|lark/.test(url);
    const docId = `doc_${Date.now()}`;
    setAttachments((prev) => [...prev, { id: docId, name: isFeishu ? '飞书文档' : '外部链接', content: '', type: 'feishu', ext: 'url', loading: true }]);
    message.loading({ content: '拉取文档内容...', key: docId, duration: 0 });

    const result = await fetchDocumentContent(url);

    setAttachments((prev) => prev.map((a) => a.id === docId ? {
      ...a, content: result.text, loading: false,
      name: result.success ? (isFeishu ? '飞书文档 (已解析)' : '外部链接 (已解析)') : (isFeishu ? '飞书文档 (需权限)' : '外部链接'),
    } : a));
    message.destroy(docId);
    result.success ? message.success('文档拉取成功') : message.warning('文档拉取受限');
  };

  /* ==============================
     Left Edit Area
     ============================== */

  const handleRemoveEditAttachment = (id) => setEditAttachments((prev) => prev.filter((a) => a.id !== id));

  const handleEditSend = useCallback(async () => {
    if (!editInput.trim() && editAttachments.length === 0) return;
    if (!editModelId) { message.warning('请先选择模型'); return; }
    const mc = modelConfigs.find((m) => m.id === editModelId);
    if (!mc?.apiKey) { message.warning('所选模型未配置 API Key，请前往配置中心'); return; }
    if (editAttachments.some((a) => a.loading)) { message.warning('文件解析中，请稍候...'); return; }

    let fullContent = editInput;
    if (editAttachments.length > 0) {
      fullContent += editAttachments.map((a) => {
        if (a.type === 'skill') return `\n\n--- 引用技能: ${a.name} ---\n${a.content}\n--- 技能结束 ---`;
        if (a.type === 'feishu') return `\n\n--- 文档引用 ---\n${a.content}\n--- 引用结束 ---`;
        return `\n\n--- 上传文件: ${a.name} ---\n${a.content}\n--- 文件结束 ---`;
      }).join('');
    }

    const userMsg = { role: 'user', content: editInput, attachments: editAttachments.map((a) => ({ name: a.name, type: a.type })), timestamp: Date.now() };
    setEditChatMessages((prev) => [...prev, userMsg]);
    setEditInput('');
    setEditAttachments([]);
    setEditLoading(true);

    try {
      const sysPrompt = `你是一个 AI Skill 创建助手，请使用中文回复。\n当前正在编辑的 Skill 内容：\n${skillContent || '(空，尚未创建)'}\n\n你的任务是帮助用户编写、修改、优化 AI Skill。`;
      const msgs = [...editChatMessages.map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: fullContent }];
      const result = await chatWithModel({ provider: mc.provider, apiKey: mc.apiKey, model: mc.model, baseUrl: mc.baseUrl, messages: msgs, systemPrompt: sysPrompt });
      setEditChatMessages((prev) => [...prev, { role: 'assistant', content: result.content || result.error || '(无响应)', timestamp: Date.now() }]);
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

  const handleSaveToLibrary = () => {
    if (!skillContent.trim()) { message.warning('技能内容为空'); return; }
    const name = skillName || `新建技能_${new Date().toLocaleDateString('zh-CN')}`;
    if (activeSkillId) {
      const existing = skills.find((s) => s.id === activeSkillId);
      if (existing) { saveSkillVersion(activeSkillId, skillContent, `手动保存`); message.success(`技能「${existing.name}」已保存新版本`); return; }
    }
    const skillId = `skill_${Date.now()}`;
    addSkill({ id: skillId, name, description: '通过对比测试模块创建', content: skillContent, format: 'skillmd', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    setActiveSkill(skillId);
    message.success(`技能「${name}」已保存到技能库`);
  };

  /* ==============================
     Right Test Area
     ============================== */

  const handleRemoveTestAttachment = (id) => setTestAttachments((prev) => prev.filter((a) => a.id !== id));

  const resolveSkillContent = (panelSkillId) => {
    if (panelSkillId === '__current__') return skillContent || '';
    if (!panelSkillId) return '';
    return skills.find((sk) => sk.id === panelSkillId)?.content || '';
  };

  const buildTestMessage = () => {
    let msg = testInput;
    if (testAttachments.length > 0) {
      msg += testAttachments.map((a) => {
        if (a.type === 'feishu') return `\n\n--- 文档引用 ---\n${a.content}\n--- 引用结束 ---`;
        if (a.type === 'skill') return `\n\n--- 引用技能: ${a.name} ---\n${a.content}\n--- 技能结束 ---`;
        return `\n\n--- 上传文件: ${a.name} ---\n${a.content}\n--- 文件结束 ---`;
      }).join('');
    }
    return msg;
  };

  // Helper: Clean up output by removing thinking/reasoning blocks
  const cleanOutput = (output) => {
    if (!output || typeof output !== 'string') return output;

    // 1. Remove <thinking> or 思考 blocks
    let cleaned = output.replace(/<思考>[\s\S]*?<\/思考>/g, '');
    cleaned = cleaned.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
    cleaned = cleaned.replace(/<(?:thinking|analysis|reasoning|reflection)[\s\S]*?<\/(?:thinking|analysis|reasoning|reflection)>/gi, '');

    // 2. CRITICAL: Remove all HTML/CSS attribute code that's embedded in text
    // This matches patterns like: vertical-align:middle;margin-left:4px" title="4px">
    // The key is that CSS properties are followed by " and HTML attributes
    cleaned = cleaned.replace(/(?:vertical-align|margin-left|margin-right|margin-top|margin-bottom|padding|border-radius|box-shadow|font-weight|color|background|border|width|height|display|flex|position|top|left|right|bottom|line-height|letter-spacing|text-transform|font-size)\s*:\s*[^;]*(?:;|")/gi, '');

    // 3. Remove remaining HTML/CSS attributes that are still in text
    // Matches: title="4px"> or style="..." or any attribute="value"
    cleaned = cleaned.replace(/\s*(?:title|style|class|id|data-[\w-]+)\s*=\s*"[^"]*"\s*>/g, '');
    cleaned = cleaned.replace(/\s*(?:title|style|class|id|data-[\w-]+)\s*=\s*"[^"]*"/g, '');

    // 4. Remove stray quotes and angle brackets that are HTML debris
    cleaned = cleaned.replace(/["'`]>[^<]*?["'`]</g, '');
    cleaned = cleaned.replace(/^[>"'\s]+/gm, '');
    cleaned = cleaned.replace(/[<>"'\s]+$/gm, '');

    // 5. Remove lines that are pure CSS/HTML garbage
    cleaned = cleaned.split('\n').map(line => {
      let trimmed = line.trim();

      // Remove lines that contain ONLY HTML/CSS patterns
      if (/^[;>\s]*$/.test(trimmed)) return '';
      if (/^[#][a-f0-9]+[;:\s]*$/.test(trimmed)) return ''; // Hex color codes
      if (/^[0-9px;:\s]+$/.test(trimmed)) return ''; // Pure numbers/pixels
      if (/^[&]+[a-f0-9;]+$/.test(trimmed)) return ''; // HTML entities

      // Remove CSS patterns from within lines
      trimmed = trimmed.replace(/;[a-z-]+:\s*[^;]*(?=;|$)/gi, '');

      return trimmed;
    }).filter(line => line.trim().length > 0).join('\n');

    // 6. Final cleanup: Remove any remaining visual artifacts
    cleaned = cleaned.replace(/\s+[;>]+\s+/g, ' ');
    cleaned = cleaned.replace(/\s{2,}/g, ' '); // Multiple spaces to single
    cleaned = cleaned.replace(/\n\n\n+/g, '\n\n'); // Multiple newlines
    cleaned = cleaned.trim();

    return cleaned;
  };

  const runPanelTest = async (panelModelId, panelSkillId, setResult, setLoading, setLatency, setTokens) => {
    if (!testInput.trim() && testAttachments.length === 0) { message.warning('请先输入测试内容'); return; }
    if (!panelModelId) { message.warning('请为该面板选择模型'); return; }
    if (testAttachments.some((a) => a.loading)) { message.warning('文件解析中...'); return; }
    const mc = modelConfigs.find((m) => m.id === panelModelId);
    if (!mc?.apiKey) { message.warning('模型未配置 API Key，请前往配置中心'); return; }

    setLoading(true); setResult('');
    const startTime = Date.now();
    try {
      const sysPrompt = resolveSkillContent(panelSkillId);
      const result = await chatWithModel({
        provider: mc.provider, apiKey: mc.apiKey, model: mc.model, baseUrl: mc.baseUrl,
        messages: [{ role: 'user', content: buildTestMessage() }],
        systemPrompt: sysPrompt || undefined,
      });
      setLatency(Date.now() - startTime);
      setTokens(result.usage || null);
      const cleanedOutput = cleanOutput(result.content || result.error || '(无响应)');
      setResult(cleanedOutput);
    } catch (err) { setResult('错误: ' + err.message); }
    finally { setLoading(false); }
  };

  const handleRunBothTests = () => {
    if (!testInput.trim() && testAttachments.length === 0) { message.warning('请先输入测试内容'); return; }
    runPanelTest(panelAModelId, panelASkillId, setPanelAResult, setPanelALoading, setPanelALatency, setPanelATokens);
    runPanelTest(panelBModelId, panelBSkillId, setPanelBResult, setPanelBLoading, setPanelBLatency, setPanelBTokens);
  };

  /* ==============================
     Render Helpers
     ============================== */

  const sectionHeader = { padding: '10px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: '#fff' };

  const renderTestPanel = (label, panelKey, modelId, setModelId, skillId, setSkillId, result, loading, latency, tokens, setResult, setLoading, setLatency, setTokens) => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#fff', borderRight: '1px solid #e5e7eb' }}>
      <div style={{ padding: '8px 14px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: panelKey === 'A' ? '#111827' : '#6b7280' }} />
          <Text strong style={{ fontSize: '13px' }}>{label}</Text>
        </div>
        <Button size="small" type="text" loading={loading} onClick={() => runPanelTest(modelId, skillId, setResult, setLoading, setLatency, setTokens)} style={{ fontSize: '12px', fontWeight: 500, height: '26px', borderRadius: '6px' }}>Run</Button>
      </div>
      <div style={{ padding: '8px 14px', borderBottom: '1px solid #f3f4f6', flexShrink: 0, background: '#fafafa' }}>
        <div style={{ marginBottom: '4px' }}>
          <Text style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>MODEL</Text>
          <Select placeholder={modelOptions.length ? '选择模型' : '请先在配置中心添加模型'} options={modelOptions} value={modelId} onChange={setModelId} style={{ width: '100%' }} size="small" />
        </div>
        <div>
          <Text style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>SKILL</Text>
          <Select placeholder="选择 Skill" options={skillSelectOptions} value={skillId} onChange={setSkillId} style={{ width: '100%' }} size="small" />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', background: '#fafafa' }}>
        {loading && <div style={{ textAlign: 'center', padding: '48px 0' }}><Spin /><div style={{ marginTop: '12px', fontSize: '12px', color: '#9ca3af' }}>模型调用中...</div></div>}
        {!loading && !result && (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: '16px', fontWeight: 700, color: '#9ca3af' }}>{panelKey}</div>
            <Text style={{ color: '#d1d5db', fontSize: '12px' }}>等待测试执行</Text>
          </div>
        )}
        {!loading && result && (
          <div>
            <div style={{ background: '#fff', borderRadius: '10px', padding: '14px 16px', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
              <SimpleMarkdown>{result}</SimpleMarkdown>
            </div>
            {(latency > 0 || tokens) && (
              <div style={{ marginTop: '10px', padding: '8px 12px', background: '#fff', borderRadius: '8px', border: '1px solid #f3f4f6', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                {latency > 0 && <div><div style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 500 }}>Latency</div><div style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>{latency}<span style={{ fontSize: '11px', fontWeight: 400, color: '#9ca3af' }}> ms</span></div></div>}
                {tokens?.prompt_tokens > 0 && <div><div style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 500 }}>Input</div><div style={{ fontSize: '14px', fontWeight: 600, color: '#4b5563' }}>{tokens.prompt_tokens}<span style={{ fontSize: '11px', fontWeight: 400, color: '#9ca3af' }}> tok</span></div></div>}
                {tokens?.completion_tokens > 0 && <div><div style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 500 }}>Output</div><div style={{ fontSize: '14px', fontWeight: 600, color: '#4b5563' }}>{tokens.completion_tokens}<span style={{ fontSize: '11px', fontWeight: 400, color: '#9ca3af' }}> tok</span></div></div>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  /* ==============================
     Main Layout
     ============================== */

  // No-models prompt
  const noModelsHint = modelConfigs.length === 0 ? (
    <div style={{ padding: '12px 16px', background: '#fefce8', borderBottom: '1px solid #fef08a', fontSize: '12px', color: '#713f12', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span>尚未配置任何模型，请先在配置中心添加模型与 API Key</span>
      <Button size="small" type="link" onClick={() => setActiveTab('config-center')} style={{ fontSize: '12px', padding: 0 }}>前往配置</Button>
    </div>
  ) : null;

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 52px)', background: '#f3f4f6' }}>

      {/* ===== Left: Skill Edit ===== */}
      <div style={{ width: '420px', minWidth: '360px', display: 'flex', flexDirection: 'column', background: '#fff', flexShrink: 0, borderRight: '1px solid #e5e7eb' }}>

        {/* ── Left panel header: model + skill selectors ── */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #e5e7eb', flexShrink: 0, background: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            <div style={{ width: '6px', height: '16px', borderRadius: '3px', background: '#111827', flexShrink: 0 }} />
            <Text strong style={{ fontSize: '13px', flexShrink: 0 }}>Skill 编辑区</Text>
            {editSelectedSkillId && skillContent && (
              <span style={{ fontSize: '10px', color: '#059669', background: '#d1fae5', padding: '1px 6px', borderRadius: '4px', fontWeight: 500 }}>已加载</span>
            )}
          </div>

          {/* Row 1: model selector */}
          <div style={{ marginBottom: '6px' }}>
            <div style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 600, marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>AI 模型</div>
            <Select
              placeholder={modelOptions.length ? '选择 AI 模型' : '请先在配置中心添加模型'}
              options={modelOptions}
              value={editModelId}
              onChange={setEditModelId}
              style={{ width: '100%' }}
              size="small"
              allowClear
            />
          </div>

          {/* Row 2: skill selector */}
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 600, marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              SKILL &nbsp;
              <span style={{ fontSize: '10px', fontWeight: 400, textTransform: 'none', color: '#d1d5db' }}>— 选择后自动载入 SKILL.md</span>
            </div>
            <Select
              placeholder="从技能库选择 Skill…"
              options={[
                { label: '── 不加载技能（自由编写）──', value: '__none__' },
                ...skills.map((s) => ({ label: s.name || '未命名', value: s.id })),
              ]}
              value={editSelectedSkillId}
              onChange={(v) => handleEditSkillSelect(v === '__none__' ? null : v)}
              style={{ width: '100%' }}
              size="small"
              allowClear
              showSearch
              optionFilterProp="label"
            />
          </div>

          {/* Row 3: skill name + save */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <Input
              placeholder="技能名称（可编辑）"
              value={skillName}
              onChange={(e) => setSkillName(e.target.value)}
              style={{ flex: 1 }}
              size="small"
            />
            <Tooltip title="保存到技能库">
              <Button type="primary" size="small" onClick={handleSaveToLibrary} disabled={!skillContent.trim()}>保存</Button>
            </Tooltip>
          </div>
        </div>

        {/* ── Skill content editor ── */}
        <div style={{ padding: '8px 14px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
          <div style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            SKILL.md 内容
            {skillContent && <span style={{ fontSize: '10px', fontWeight: 400, textTransform: 'none', color: '#d1d5db', marginLeft: '6px' }}>{skillContent.length} 字符</span>}
          </div>
          <TextArea
            placeholder="在此编写 / 粘贴 Skill 内容（SKILL.md 格式），或从上方选择技能自动载入..."
            value={skillContent}
            onChange={(e) => setSkillContent(e.target.value)}
            autoSize={{ minRows: 4, maxRows: 10 }}
            style={{ fontFamily: "'Fira Code', 'Courier New', monospace", fontSize: '12px', borderRadius: '6px' }}
          />
        </div>

        <div ref={editChatRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 8px', background: '#f9fafb' }}>
          {editChatMessages.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 20px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}><span style={{ fontSize: '16px', fontWeight: 700, color: '#9ca3af' }}>AI</span></div>
              <Text strong style={{ fontSize: '13px', color: '#4b5563', display: 'block', marginBottom: '4px' }}>AI 辅助编辑</Text>
              <Text style={{ color: '#9ca3af', fontSize: '11px', lineHeight: '1.5' }}>与 AI 对话来创建和优化 Skill，输入 / 查看快捷命令</Text>
              <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center' }}>
                {['帮我写一个文档优化 Skill', '优化当前 Skill 的触发逻辑', '参考这份文档改进 Skill'].map((tip) => (
                  <span key={tip} onClick={() => setEditInput(tip)} style={{ fontSize: '11px', color: '#4b5563', background: '#f3f4f6', padding: '4px 10px', borderRadius: '12px', cursor: 'pointer', border: '1px solid #e5e7eb' }}>{tip}</span>
                ))}
              </div>
            </div>
          )}
          {editChatMessages.map((msg, idx) => <ChatBubble key={idx} role={msg.role} content={msg.content} timestamp={msg.timestamp} />)}
          {editLoading && <div style={{ display: 'flex', justifyContent: 'flex-start', padding: '0 4px', marginBottom: '10px' }}><div style={{ padding: '10px 14px', borderRadius: '12px 12px 12px 2px', background: '#f3f4f6' }}><Spin size="small" /> <Text style={{ marginLeft: '6px', color: '#6b7280', fontSize: '12px' }}>AI 思考中...</Text></div></div>}
        </div>

        {/* Left Input — NO Enter-to-submit */}
        <div style={{ ...UNIFIED_INPUT_STYLE, position: 'relative' }}>
          <SlashCommandMenu visible={editSlashVisible} commands={filteredSlashCommands} selectedIndex={editSlashIndex} onSelect={(cmd) => handleSlashSelect(cmd, editInput, setEditInput, setEditSlashVisible, setEditAttachments, 'edit')} />
          {editAttachments.length > 0 && <div style={{ marginBottom: '8px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>{editAttachments.map((a) => <FileSlotTag key={a.id} file={a} onRemove={handleRemoveEditAttachment} />)}</div>}
          <div style={UNIFIED_BTN_ROW}>
            <Upload accept=".txt,.md,.csv,.pdf,.json,.yaml,.yml" beforeUpload={(f) => handleFileUpload(f, setEditAttachments)} showUploadList={false}><Button size="small" type="dashed">文件</Button></Upload>
            <Select placeholder="引用技能" options={skillSlotOptions} onChange={(id) => { const s = skills.find((sk) => sk.id === id); if (s) { setEditAttachments((prev) => [...prev, { id: `es_${Date.now()}`, name: s.name, content: s.content, type: 'skill', ext: 'md' }]); message.success(`已引用: ${s.name}`); } }} value={undefined} style={{ width: '120px' }} size="small" allowClear />
            <Button size="small" type="dashed" onClick={() => handleAddDocOrLink(setEditAttachments)}>{capStatus.feishu ? '飞书/链接' : '链接'}</Button>
            <span style={{ fontSize: '10px', color: '#9ca3af', marginLeft: 'auto' }}>输入 / 调用命令</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <TextArea placeholder="描述修改需求，AI 帮你优化 Skill... (输入 / 使用快捷命令)" value={editInput}
              onChange={(e) => handleSlashInput(e.target.value, setEditInput, setEditSlashVisible, setEditSlashIndex)}
              onKeyDown={(e) => handleSlashKeyDown(e, editSlashVisible, filteredSlashCommands, editSlashIndex, setEditSlashIndex, (cmd) => handleSlashSelect(cmd, editInput, setEditInput, setEditSlashVisible, setEditAttachments, 'edit'))}
              autoSize={{ minRows: 3, maxRows: 6 }} style={UNIFIED_TEXTAREA_STYLE} />
            <Button type="primary" onClick={handleEditSend} loading={editLoading} disabled={(!editInput.trim() && editAttachments.length === 0) || editAttachments.some((a) => a.loading)} style={{ alignSelf: 'flex-end', borderRadius: '8px', height: '36px', paddingInline: '16px', fontWeight: 500, flexShrink: 0 }}>发送</Button>
          </div>
        </div>
      </div>

      {/* ===== Right: Dual Compare Test ===== */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f9fafb', minWidth: 0 }}>

        {noModelsHint}

        <div style={{ ...sectionHeader, background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
          <Space>
            <Text strong style={{ fontSize: '14px' }}>对比测试</Text>
            <span style={{ fontSize: '11px', color: '#4b5563', background: '#f3f4f6', padding: '2px 8px', borderRadius: '4px', fontWeight: 500 }}>双联模式</span>
            {/* Capability indicators */}
            {capStatus.pdf && <span style={{ fontSize: '10px', color: '#6b7280', background: '#f3f4f6', padding: '1px 6px', borderRadius: '4px' }}>PDF</span>}
            {capStatus.feishu && <span style={{ fontSize: '10px', color: '#6b7280', background: '#f3f4f6', padding: '1px 6px', borderRadius: '4px' }}>飞书</span>}
          </Space>
          <Button type="primary" onClick={handleRunBothTests} loading={panelALoading || panelBLoading} style={{ borderRadius: '8px', height: '32px', paddingInline: '16px' }}>同时测试</Button>
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', borderBottom: '1px solid #e5e7eb' }}>
          {renderTestPanel('面板 A', 'A', panelAModelId, setPanelAModelId, panelASkillId, setPanelASkillId, panelAResult, panelALoading, panelALatency, panelATokens, setPanelAResult, setPanelALoading, setPanelALatency, setPanelATokens)}
          {renderTestPanel('面板 B', 'B', panelBModelId, setPanelBModelId, panelBSkillId, setPanelBSkillId, panelBResult, panelBLoading, panelBLatency, panelBTokens, setPanelBResult, setPanelBLoading, setPanelBLatency, setPanelBTokens)}
        </div>

        {/* Test Input — NO Enter-to-submit */}
        <div style={{ ...UNIFIED_INPUT_STYLE, position: 'relative' }}>
          <SlashCommandMenu visible={testSlashVisible} commands={filteredSlashCommands} selectedIndex={testSlashIndex} onSelect={(cmd) => handleSlashSelect(cmd, testInput, setTestInput, setTestSlashVisible, setTestAttachments, 'test')} />
          {testAttachments.length > 0 && <div style={{ marginBottom: '8px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>{testAttachments.map((a) => <FileSlotTag key={a.id} file={a} onRemove={handleRemoveTestAttachment} />)}</div>}
          <div style={UNIFIED_BTN_ROW}>
            <Upload accept=".txt,.md,.csv,.pdf,.json,.yaml,.yml" beforeUpload={(f) => handleFileUpload(f, setTestAttachments)} showUploadList={false}><Button size="small" type="dashed">文件</Button></Upload>
            <Button size="small" type="dashed" onClick={() => handleAddDocOrLink(setTestAttachments)}>{capStatus.feishu ? '飞书/链接' : '链接'}</Button>
            <span style={{ fontSize: '10px', color: '#9ca3af', marginLeft: 'auto' }}>支持 PDF / TXT / MD / CSV / JSON &middot; 输入 / 调用命令</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <TextArea placeholder="输入测试 Prompt... (仅按钮提交，输入 / 使用快捷命令)" value={testInput}
              onChange={(e) => handleSlashInput(e.target.value, setTestInput, setTestSlashVisible, setTestSlashIndex)}
              onKeyDown={(e) => handleSlashKeyDown(e, testSlashVisible, filteredSlashCommands, testSlashIndex, setTestSlashIndex, (cmd) => handleSlashSelect(cmd, testInput, setTestInput, setTestSlashVisible, setTestAttachments, 'test'))}
              autoSize={{ minRows: 3, maxRows: 6 }} style={UNIFIED_TEXTAREA_STYLE} />
            <Button type="primary" onClick={handleRunBothTests} loading={panelALoading || panelBLoading}
              disabled={(!testInput.trim() && testAttachments.length === 0) || testAttachments.some((a) => a.loading)}
              style={{ borderRadius: '8px', height: '36px', paddingInline: '20px', fontWeight: 500, flexShrink: 0 }}>执行对比</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompareTest;
