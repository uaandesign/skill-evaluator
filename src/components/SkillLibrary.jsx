import React, { useState, useMemo } from 'react';
import {
  Card,
  Upload,
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
  Timeline,
  Select,
  Badge,
  Tooltip,
  List,
  Drawer,
  Form,
} from 'antd';
import * as Diff from 'diff';
import { useStore } from '../store';
import { detectFormat } from '../utils/skillParser';
import SkillCategorySelector from './SkillCategorySelector';

/* ============================================================
   Pure-JS ZIP reader (no external dependencies)
   Supports stored (method=0) and deflate (method=8) entries.
   Uses browser's built-in DecompressionStream API.
   ============================================================ */
async function parseZipBuffer(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);

  // Find End of Central Directory signature: PK\x05\x06 (0x06054b50 LE)
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocdOffset = i; break; }
  }
  if (eocdOffset === -1) throw new Error('Not a valid ZIP file (EOCD not found)');

  const cdEntries = view.getUint16(eocdOffset + 8, true);
  const cdOffset  = view.getUint32(eocdOffset + 16, true);
  const files = {};

  let pos = cdOffset;
  for (let i = 0; i < cdEntries; i++) {
    if (view.getUint32(pos, true) !== 0x02014b50) break; // Central dir signature
    const compression    = view.getUint16(pos + 10, true);
    const compressedSz   = view.getUint32(pos + 20, true);
    const filenamLen     = view.getUint16(pos + 28, true);
    const extraLen       = view.getUint16(pos + 30, true);
    const commentLen     = view.getUint16(pos + 32, true);
    const localHdrOffset = view.getUint32(pos + 42, true);
    const filename       = new TextDecoder().decode(bytes.slice(pos + 46, pos + 46 + filenamLen));

    // Jump to local file header to find actual data start
    const localFilenameLen = view.getUint16(localHdrOffset + 26, true);
    const localExtraLen    = view.getUint16(localHdrOffset + 28, true);
    const dataStart        = localHdrOffset + 30 + localFilenameLen + localExtraLen;
    const compressedData   = bytes.slice(dataStart, dataStart + compressedSz);

    files[filename] = { compression, compressedData };
    pos += 46 + filenamLen + extraLen + commentLen;
  }
  return files;
}

async function inflateEntry(entry) {
  const { compression, compressedData } = entry;
  if (compression === 0) {
    // Stored — no compression
    return new TextDecoder('utf-8', { fatal: false }).decode(compressedData);
  }
  if (compression === 8) {
    // Deflate — use browser DecompressionStream
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Your browser does not support DecompressionStream. Please use Chrome 80+ or Edge 80+.');
    }
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();
    writer.write(compressedData);
    writer.close();
    const chunks = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return new TextDecoder('utf-8', { fatal: false }).decode(out);
  }
  throw new Error(`Unsupported ZIP compression method: ${compression}`);
}

/**
 * Extract the best skill content from a ZIP archive ArrayBuffer.
 * Priority: SKILL.md > <dir>/SKILL.md > *.md > any text file
 */
async function extractSkillFromZip(arrayBuffer) {
  const files = await parseZipBuffer(arrayBuffer);
  const names = Object.keys(files).filter((n) => !n.endsWith('/'));

  // Priority 1: exact SKILL.md at root
  const root = names.find((n) => n === 'SKILL.md' || n.toLowerCase() === 'skill.md');
  if (root) return { filename: root, content: await inflateEntry(files[root]) };

  // Priority 2: SKILL.md in a subdirectory
  const sub = names.find((n) => n.toLowerCase().endsWith('/skill.md'));
  if (sub) return { filename: sub, content: await inflateEntry(files[sub]) };

  // Priority 3: any .md file
  const md = names.find((n) => n.toLowerCase().endsWith('.md'));
  if (md) return { filename: md, content: await inflateEntry(files[md]) };

  // Priority 4: any text-looking file
  const txt = names.find((n) => /\.(txt|json|yaml|yml|js|ts)$/i.test(n));
  if (txt) return { filename: txt, content: await inflateEntry(files[txt]) };

  // Fallback: list what's inside
  const listing = names.map((n) => `- ${n}`).join('\n');
  return {
    filename: '(no SKILL.md found)',
    content: `ZIP 内未找到 SKILL.md，包含文件：\n${listing}`,
  };
}

const { Title, Text, Paragraph } = Typography;
const { Search } = Input;

/**
 * Diff Viewer
 */
const DiffViewer = ({ changes }) => (
  <div style={{ fontFamily: 'monospace', fontSize: '12px', lineHeight: '1.6' }}>
    {changes.map((part, index) => {
      if (part.added) {
        return (
          <span key={index} style={{ backgroundColor: '#e5e7eb', color: '#111827' }}>
            {part.value}
          </span>
        );
      }
      if (part.removed) {
        return (
          <span key={index} style={{ backgroundColor: '#f3f4f6', color: '#6b7280', textDecoration: 'line-through' }}>
            {part.value}
          </span>
        );
      }
      return <span key={index}>{part.value}</span>;
    })}
  </div>
);

/**
 * Skill Library
 */
const SkillLibrary = () => {
  const {
    skills,
    addSkill,
    removeSkill,
    updateSkill,
    saveSkillVersion,
    rollbackSkillVersion,
    activeSkillId,
    setActiveSkill,
  } = useStore();

  // State
  const [searchText, setSearchText] = useState('');
  const [filterFormat, setFilterFormat] = useState('all');
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedSkillId, setSelectedSkillId] = useState(null);
  const [versionCompareVisible, setVersionCompareVisible] = useState(false);
  const [compareVersionA, setCompareVersionA] = useState(null);
  const [compareVersionB, setCompareVersionB] = useState(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [viewMode, setViewMode] = useState('grid');

  // Upload Drawer State
  const [uploadDrawerVisible, setUploadDrawerVisible] = useState(false);
  const [uploadForm] = Form.useForm();
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadedIntroDoc, setUploadedIntroDoc] = useState(null);
  const [generatingUniqueName, setGeneratingUniqueName] = useState(false);
  const [uploadCategory, setUploadCategory] = useState(null);

  // Filtered skills
  const filteredSkills = useMemo(() => {
    return skills.filter((skill) => {
      const matchSearch =
        !searchText ||
        (skill.name || '').toLowerCase().includes(searchText.toLowerCase()) ||
        (skill.description || '').toLowerCase().includes(searchText.toLowerCase());
      const matchFormat = filterFormat === 'all' || skill.format === filterFormat;
      return matchSearch && matchFormat;
    });
  }, [skills, searchText, filterFormat]);

  const selectedSkill = skills.find((s) => s.id === selectedSkillId);

  // Generate unique name from display name
  const generateUniqueName = () => {
    const name = uploadForm.getFieldValue('name');
    if (!name || !name.trim()) {
      message.warning('请先输入名称');
      return;
    }
    setGeneratingUniqueName(true);
    // Simple AI-like name generation: name_action_type pattern
    setTimeout(() => {
      const parts = name.trim().toLowerCase()
        .replace(/[^a-zA-Z0-9\u4e00-\u9fa5\s]/g, '')
        .split(/\s+/)
        .filter(Boolean);

      let uniqueName;
      if (parts.length >= 3) {
        uniqueName = `${parts[0]}_${parts[1]}_${parts[2]}`;
      } else if (parts.length === 2) {
        uniqueName = `${parts[0]}_${parts[1]}_skill`;
      } else {
        uniqueName = `${parts[0]}_create_skill`;
      }

      uploadForm.setFieldsValue({ uniqueName });
      setGeneratingUniqueName(false);
      message.success('唯一名称已生成');
    }, 500);
  };

  // Handle file upload in drawer — supports .zip (extracts SKILL.md) and plain text files
  const handleDrawerFileUpload = (file) => {
    const isZip = file.name.toLowerCase().endsWith('.zip')
      || file.type === 'application/zip'
      || file.type === 'application/x-zip-compressed';

    if (isZip) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const { filename, content } = await extractSkillFromZip(e.target.result);
          setUploadedFile({ name: file.name, content, extractedFrom: filename });
          // Auto-fill name from zip filename if empty
          const zipName = file.name.replace(/\.zip$/i, '').replace(/[_-]/g, ' ');
          if (!uploadForm.getFieldValue('name')) {
            uploadForm.setFieldsValue({ name: zipName });
          }
          message.success(`已从 ZIP 提取: ${filename}`);
        } catch (err) {
          message.error(`ZIP 解析失败: ${err.message}`);
          setUploadedFile(null);
        }
      };
      reader.onerror = () => message.error('文件读取失败');
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        setUploadedFile({ name: file.name, content: e.target.result });
      };
      reader.onerror = () => message.error('文件读取失败');
      reader.readAsText(file);
    }
    return false;
  };

  // Handle intro doc upload
  const handleIntroDocUpload = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setUploadedIntroDoc({ name: file.name, content: e.target.result });
    };
    reader.readAsText(file);
    return false;
  };

  // Submit upload drawer
  const handleUploadSubmit = () => {
    uploadForm.validateFields().then((values) => {
      if (!uploadedFile) {
        message.error('请上传技能文件');
        return;
      }

      const detectedFormat = detectFormat(uploadedFile.content);
      const skillId = `skill_${Date.now()}`;

      addSkill({
        id: skillId,
        name: values.name,
        uniqueName: values.uniqueName,
        description: values.description || '',
        content: uploadedFile.content,
        format: detectedFormat,
        introDoc: uploadedIntroDoc?.content || '',
        category: uploadCategory,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      message.success(`技能「${values.name}」已添加到技能库`);
      setUploadDrawerVisible(false);
      uploadForm.resetFields();
      setUploadedFile(null);
      setUploadedIntroDoc(null);
    }).catch(() => {
      message.error('请填写必要字段');
    });
  };

  // Open skill detail
  const openDetail = (skillId) => {
    setSelectedSkillId(skillId);
    setDetailModalVisible(true);
  };

  // Delete skill
  const handleDelete = (skillId) => {
    removeSkill(skillId);
    message.success('技能已删除');
    if (selectedSkillId === skillId) {
      setDetailModalVisible(false);
    }
  };

  // Export skill
  const handleExport = (skill) => {
    const ext = skill.format === 'function' ? '.json' : '.md';
    const filename = `${skill.name}${ext}`;
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(skill.content || ''));
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    message.success('技能已导出');
  };

  // Save new version
  const handleSaveVersion = () => {
    if (!selectedSkill || !editContent.trim()) return;
    saveSkillVersion(selectedSkill.id, editContent, editDescription || `版本 ${(selectedSkill.versions?.length || 0) + 1}`);
    setEditModalVisible(false);
    setEditContent('');
    setEditDescription('');
    message.success('新版本已保存');
  };

  // Rollback version
  const handleRollback = (versionIndex) => {
    if (!selectedSkill) return;
    rollbackSkillVersion(selectedSkill.id, versionIndex);
    message.success('已回滚到选定版本');
  };

  // Version diff
  const diffChanges =
    selectedSkill && compareVersionA !== null && compareVersionB !== null && selectedSkill.versions
      ? Diff.diffLines(
          selectedSkill.versions[compareVersionA]?.content || '',
          selectedSkill.versions[compareVersionB]?.content || ''
        )
      : [];

  // Format helpers
  const getFormatLabel = (format) => {
    const labels = {
      skillmd: 'SKILL.md',
      skill_md: 'SKILL.md',
      function: 'Function Call',
      function_call: 'Function Call',
      prompt: 'Prompt Template',
      prompt_template: 'Prompt Template',
    };
    return labels[format] || format;
  };

  // Skill card
  const renderSkillCard = (skill) => (
    <Col xs={24} sm={12} lg={8} xl={6} key={skill.id}>
      <Card
        hoverable
        onClick={() => openDetail(skill.id)}
        style={{
          borderRadius: '12px',
          border: activeSkillId === skill.id ? '2px solid #111827' : '1px solid #e5e7eb',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          transition: 'all 200ms',
          height: '100%',
        }}
        bodyStyle={{ padding: '16px' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text strong style={{ fontSize: '15px', display: 'block', marginBottom: '4px' }} ellipsis>
              {skill.name || '未命名技能'}
            </Text>
            <Tag style={{ fontSize: '11px' }}>
              {getFormatLabel(skill.format)}
            </Tag>
          </div>
          {activeSkillId === skill.id && (
            <Badge status="processing" text={<Text style={{ fontSize: '11px', color: '#111827' }}>使用中</Text>} />
          )}
        </div>

        <Paragraph
          style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px' }}
          ellipsis={{ rows: 2 }}
        >
          {skill.description || '暂无描述'}
        </Paragraph>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: '11px', color: '#9ca3af' }}>
            {skill.versions?.length || 1} 个版本
          </Text>
          <Text style={{ fontSize: '11px', color: '#9ca3af' }}>
            {skill.updatedAt ? new Date(skill.updatedAt).toLocaleDateString('zh-CN') : ''}
          </Text>
        </div>
      </Card>
    </Col>
  );

  // Skill list item
  const renderSkillListItem = (skill) => (
    <List.Item
      key={skill.id}
      onClick={() => openDetail(skill.id)}
      style={{
        cursor: 'pointer',
        borderRadius: '8px',
        padding: '12px 16px',
        marginBottom: '8px',
        border: activeSkillId === skill.id ? '2px solid #111827' : '1px solid #e5e7eb',
        background: '#fff',
        transition: 'all 200ms',
      }}
      actions={[
        <Tooltip title="设为当前技能" key="use">
          <Button type="text" size="small" onClick={(e) => { e.stopPropagation(); setActiveSkill(skill.id); message.success('已设为当前技能'); }}>
            Use
          </Button>
        </Tooltip>,
        <Tooltip title="导出" key="export">
          <Button type="text" size="small" onClick={(e) => { e.stopPropagation(); handleExport(skill); }}>
            Export
          </Button>
        </Tooltip>,
        <Popconfirm title="确认删除此技能？" onConfirm={() => handleDelete(skill.id)} okText="确认" cancelText="取消" key="delete">
          <Button type="text" danger size="small" onClick={(e) => e.stopPropagation()}>
            Delete
          </Button>
        </Popconfirm>,
      ]}
    >
      <List.Item.Meta
        title={
          <Space>
            <Text strong>{skill.name || '未命名技能'}</Text>
            <Tag style={{ fontSize: '11px' }}>
              {getFormatLabel(skill.format)}
            </Tag>
            {activeSkillId === skill.id && <Tag>使用中</Tag>}
          </Space>
        }
        description={
          <Space>
            <Text style={{ fontSize: '12px', color: '#6b7280' }}>{skill.description || '暂无描述'}</Text>
            <Text style={{ fontSize: '11px', color: '#9ca3af' }}>· {skill.versions?.length || 1} 个版本</Text>
          </Space>
        }
      />
    </List.Item>
  );

  return (
    <div style={{ padding: '0' }}>
      {/* Top Action Bar */}
      <Card
        style={{
          marginBottom: '20px',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        }}
        bodyStyle={{ padding: '20px' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <Title level={3} style={{ margin: 0 }}>技能库</Title>
          <Space>
            <Button type="primary" onClick={() => setUploadDrawerVisible(true)}>上传技能</Button>
          </Space>
        </div>

        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Search
              placeholder="搜索技能名称或描述..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
              style={{ maxWidth: '400px' }}
            />
          </Col>
          <Col>
            <Select
              value={filterFormat}
              onChange={setFilterFormat}
              style={{ width: '140px' }}
              options={[
                { label: '全部格式', value: 'all' },
                { label: 'SKILL.md', value: 'skillmd' },
                { label: 'Function Call', value: 'function' },
                { label: 'Prompt Template', value: 'prompt' },
              ]}
            />
          </Col>
          <Col>
            <Button.Group>
              <Button type={viewMode === 'grid' ? 'primary' : 'default'} onClick={() => setViewMode('grid')}>
                Grid
              </Button>
              <Button type={viewMode === 'list' ? 'primary' : 'default'} onClick={() => setViewMode('list')}>
                List
              </Button>
            </Button.Group>
          </Col>
        </Row>

        {/* Stats */}
        <Row gutter={24} style={{ marginTop: '16px' }}>
          <Col>
            <Statistic title="技能总数" value={skills.length} valueStyle={{ color: '#111827', fontSize: '20px' }} />
          </Col>
          <Col>
            <Statistic title="SKILL.md" value={skills.filter((s) => s.format === 'skillmd' || s.format === 'skill_md').length} valueStyle={{ color: '#111827', fontSize: '20px' }} />
          </Col>
          <Col>
            <Statistic title="Function Call" value={skills.filter((s) => s.format === 'function' || s.format === 'function_call').length} valueStyle={{ color: '#111827', fontSize: '20px' }} />
          </Col>
          <Col>
            <Statistic title="Prompt Template" value={skills.filter((s) => s.format === 'prompt' || s.format === 'prompt_template').length} valueStyle={{ color: '#111827', fontSize: '20px' }} />
          </Col>
        </Row>
      </Card>

      {/* Skill List */}
      {filteredSkills.length === 0 ? (
        <Card style={{ borderRadius: '12px', border: '1px solid #e5e7eb', textAlign: 'center', padding: '40px 0' }}>
          <Empty
            description={
              skills.length === 0
                ? '技能库为空，上传你的第一个技能吧'
                : '没有找到匹配的技能'
            }
          >
            {skills.length === 0 && (
              <Button type="primary" onClick={() => setUploadDrawerVisible(true)}>上传技能</Button>
            )}
          </Empty>
        </Card>
      ) : viewMode === 'grid' ? (
        <Row gutter={[16, 16]}>
          {filteredSkills.map(renderSkillCard)}
        </Row>
      ) : (
        <List dataSource={filteredSkills} renderItem={renderSkillListItem} split={false} />
      )}

      {/* Upload Drawer */}
      <Drawer
        title="上传技能"
        placement="right"
        width={520}
        open={uploadDrawerVisible}
        onClose={() => { setUploadDrawerVisible(false); uploadForm.resetFields(); setUploadedFile(null); setUploadedIntroDoc(null); setUploadCategory(null); }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button onClick={() => { setUploadDrawerVisible(false); uploadForm.resetFields(); setUploadedFile(null); setUploadedIntroDoc(null); setUploadCategory(null); }}>取消</Button>
            <Button type="primary" onClick={handleUploadSubmit}>确认上传</Button>
          </div>
        }
      >
        <Form form={uploadForm} layout="vertical">
          <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入技能名称' }]}>
            <Input placeholder="输入技能名称" />
          </Form.Item>

          <Form.Item label="唯一名称" name="uniqueName" rules={[{ required: true, message: '请生成或输入唯一名称' }]}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Input placeholder="name_action_type 格式" style={{ flex: 1 }} value={uploadForm.getFieldValue('uniqueName')} onChange={(e) => uploadForm.setFieldsValue({ uniqueName: e.target.value })} />
              <Button onClick={generateUniqueName} loading={generatingUniqueName}>
                AI 生成
              </Button>
            </div>
          </Form.Item>

          <Form.Item label="简介" name="description">
            <Input.TextArea placeholder="简要描述技能功能..." rows={3} />
          </Form.Item>

          <SkillCategorySelector value={uploadCategory} onChange={setUploadCategory} />

          <Form.Item label="上传技能文件" required>
            <Upload
              accept=".zip,.md,.txt,.json,.js"
              beforeUpload={handleDrawerFileUpload}
              showUploadList={false}
              maxCount={1}
            >
              <Button style={{ width: '100%' }}>
                {uploadedFile ? `已选择: ${uploadedFile.name}` : '点击上传 (.zip / .md / .txt / .json / .js)'}
              </Button>
            </Upload>
            {uploadedFile && (
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#4b5563', background: '#f9fafb', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 500 }}>📄 {uploadedFile.name}</span>
                  <Button type="text" size="small" onClick={() => setUploadedFile(null)} danger>移除</Button>
                </div>
                {uploadedFile.extractedFrom && (
                  <div style={{ color: '#059669', marginTop: '2px' }}>✓ 提取自 ZIP: <code style={{ background: '#d1fae5', padding: '1px 4px', borderRadius: '3px' }}>{uploadedFile.extractedFrom}</code></div>
                )}
                <div style={{ color: '#6b7280', marginTop: '2px' }}>{(uploadedFile.content?.length || 0).toLocaleString()} 字符</div>
              </div>
            )}
          </Form.Item>

          <Form.Item label="介绍文档（可选）">
            <Upload
              accept=".md,.txt,.pdf,.docx"
              beforeUpload={handleIntroDocUpload}
              showUploadList={false}
              maxCount={1}
            >
              <Button style={{ width: '100%' }}>
                {uploadedIntroDoc ? `已选择: ${uploadedIntroDoc.name}` : '点击上传介绍文档（可选）'}
              </Button>
            </Upload>
            {uploadedIntroDoc && (
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#6b7280' }}>
                文件: {uploadedIntroDoc.name}
                <Button type="text" size="small" onClick={() => setUploadedIntroDoc(null)} style={{ marginLeft: '8px' }}>移除</Button>
              </div>
            )}
          </Form.Item>
        </Form>
      </Drawer>

      {/* Skill Detail Modal */}
      <Modal
        title={
          <Space>
            <Text strong style={{ fontSize: '16px' }}>{selectedSkill?.name || '技能详情'}</Text>
          </Space>
        }
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        width={1000}
        footer={
          <Space>
            <Button onClick={() => { setActiveSkill(selectedSkill?.id); message.success('已设为当前技能'); }}>
              设为当前
            </Button>
            <Button onClick={() => { setEditContent(selectedSkill?.content || ''); setEditDescription(''); setEditModalVisible(true); }}>
              编辑并保存新版本
            </Button>
            <Button onClick={() => selectedSkill && handleExport(selectedSkill)}>
              导出
            </Button>
            <Popconfirm title="确认删除？" onConfirm={() => { handleDelete(selectedSkill?.id); setDetailModalVisible(false); }} okText="确认" cancelText="取消">
              <Button danger>删除</Button>
            </Popconfirm>
          </Space>
        }
      >
        {selectedSkill && (
          <Tabs
            items={[
              {
                key: 'info',
                label: '基本信息',
                children: (
                  <div>
                    <Descriptions column={2} size="small" style={{ marginBottom: '16px' }}>
                      <Descriptions.Item label="名称">{selectedSkill.name}</Descriptions.Item>
                      <Descriptions.Item label="格式">
                        <Tag>{getFormatLabel(selectedSkill.format)}</Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="版本数">{selectedSkill.versions?.length || 1}</Descriptions.Item>
                      <Descriptions.Item label="内容长度">{(selectedSkill.content || '').length} 字符</Descriptions.Item>
                      <Descriptions.Item label="创建时间" span={2}>
                        {selectedSkill.createdAt ? new Date(selectedSkill.createdAt).toLocaleString('zh-CN') : '-'}
                      </Descriptions.Item>
                    </Descriptions>
                    <Divider />
                    <Text strong style={{ display: 'block', marginBottom: '8px' }}>技能内容</Text>
                    <Input.TextArea
                      value={selectedSkill.content || ''}
                      readOnly
                      rows={16}
                      style={{ fontFamily: 'monospace', fontSize: '12px', borderRadius: '8px' }}
                    />
                  </div>
                ),
              },
              {
                key: 'versions',
                label: `版本历史 (${selectedSkill.versions?.length || 0})`,
                children: (
                  <div>
                    <div style={{ marginBottom: '16px' }}>
                      <Button type="primary" size="small" onClick={() => setVersionCompareVisible(true)}>
                        版本对比
                      </Button>
                    </div>
                    {selectedSkill.versions && selectedSkill.versions.length > 0 ? (
                      <Timeline
                        items={selectedSkill.versions.map((version, index) => ({
                          color: index === selectedSkill.currentVersionIndex ? '#111827' : '#d9d9d9',
                          children: (
                            <div
                              style={{
                                padding: '10px 14px',
                                borderRadius: '8px',
                                background: index === selectedSkill.currentVersionIndex ? '#f3f4f6' : '#f9fafb',
                                border: '1px solid ' + (index === selectedSkill.currentVersionIndex ? '#d1d5db' : '#f3f4f6'),
                                marginBottom: '4px',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Space>
                                  <Tag>
                                    v{index + 1}
                                  </Tag>
                                  <Text style={{ fontSize: '12px', color: '#6b7280' }}>
                                    {new Date(version.timestamp).toLocaleString('zh-CN')}
                                  </Text>
                                </Space>
                                <Space size="small">
                                  {index !== selectedSkill.currentVersionIndex && (
                                    <Popconfirm
                                      title={`回滚到 v${index + 1}？`}
                                      onConfirm={() => handleRollback(index)}
                                      okText="确认"
                                      cancelText="取消"
                                    >
                                      <Button type="text" size="small">回滚</Button>
                                    </Popconfirm>
                                  )}
                                </Space>
                              </div>
                              <Text style={{ fontSize: '12px', color: '#9ca3af', display: 'block', marginTop: '4px' }}>
                                {version.description || '无描述'}
                              </Text>
                            </div>
                          ),
                        }))}
                      />
                    ) : (
                      <Empty description="暂无版本记录" />
                    )}
                  </div>
                ),
              },
            ]}
          />
        )}
      </Modal>

      {/* Edit and Save New Version Modal */}
      <Modal
        title="编辑技能内容"
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        width={800}
        onOk={handleSaveVersion}
        okText="保存新版本"
        cancelText="取消"
      >
        <div style={{ marginBottom: '16px' }}>
          <Text strong style={{ display: 'block', marginBottom: '8px' }}>版本描述</Text>
          <Input
            placeholder="简要描述此次修改..."
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
          />
        </div>
        <Text strong style={{ display: 'block', marginBottom: '8px' }}>技能内容</Text>
        <Input.TextArea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          rows={20}
          style={{ fontFamily: 'monospace', fontSize: '12px', borderRadius: '8px' }}
        />
      </Modal>

      {/* Version Compare Modal */}
      <Modal
        title="版本对比"
        open={versionCompareVisible}
        onCancel={() => { setVersionCompareVisible(false); setCompareVersionA(null); setCompareVersionB(null); }}
        width={900}
        footer={null}
      >
        {selectedSkill?.versions && (
          <>
            <Space style={{ marginBottom: '16px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div>
                <Text strong>版本 A：</Text>
                <Select
                  style={{ width: '160px', marginLeft: '8px' }}
                  placeholder="选择版本"
                  value={compareVersionA}
                  onChange={setCompareVersionA}
                  options={selectedSkill.versions.map((v, idx) => ({ label: `v${idx + 1}`, value: idx }))}
                />
              </div>
              <div>
                <Text strong>版本 B：</Text>
                <Select
                  style={{ width: '160px', marginLeft: '8px' }}
                  placeholder="选择版本"
                  value={compareVersionB}
                  onChange={setCompareVersionB}
                  options={selectedSkill.versions.map((v, idx) => ({ label: `v${idx + 1}`, value: idx }))}
                />
              </div>
            </Space>

            {diffChanges.length > 0 ? (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', maxHeight: '500px', overflowY: 'auto', background: '#f9fafb' }}>
                <DiffViewer changes={diffChanges} />
              </div>
            ) : compareVersionA !== null && compareVersionB !== null ? (
              <Empty description="两个版本内容相同" />
            ) : (
              <Empty description="请选择两个版本进行对比" />
            )}
          </>
        )}
      </Modal>
    </div>
  );
};

export default SkillLibrary;
