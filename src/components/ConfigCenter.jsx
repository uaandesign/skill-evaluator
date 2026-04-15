import React, { useState } from 'react';
import {
  Input, Button, Select, Collapse, Card, Space, Tag, Switch, message,
  Typography, Row, Col, Tooltip, Spin, Divider,
} from 'antd';
import { useStore, PROVIDERS } from '../store';

const { Text } = Typography;

/* ============================================
   Section header style
   ============================================ */
const sectionTitle = (title, subtitle) => (
  <div style={{ marginBottom: '20px' }}>
    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#111827', letterSpacing: '-0.3px' }}>{title}</h2>
    {subtitle && <div style={{ color: '#6b7280', fontSize: '13px', marginTop: '4px' }}>{subtitle}</div>}
  </div>
);

const capCard = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '20px', marginBottom: '16px' };
const capLabel = { fontWeight: 600, fontSize: '14px', color: '#111827', marginBottom: '4px' };
const capDesc = { fontSize: '12px', color: '#6b7280', marginBottom: '12px' };
const fieldLabel = { fontSize: '12px', fontWeight: 500, color: '#4b5563', marginBottom: '4px', display: 'block' };

/* ============================================
   FeishuSection — Feishu/Lark integration config
   with CLI test button and corrected instructions
   ============================================ */
const FeishuSection = ({ capabilities, updateCapability }) => {
  const [cliTesting, setCliTesting] = useState(false);
  const [cliResult, setCliResult] = useState(null); // { ok, message }

  const testCli = async () => {
    setCliTesting(true);
    setCliResult(null);
    try {
      const resp = await fetch('/api/feishu/cli/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await resp.json();
      setCliResult({ ok: data.authenticated, message: data.message, version: data.version });
      updateCapability('feishu', { cliInstalled: data.authenticated });
    } catch (err) {
      setCliResult({ ok: false, message: `请求失败: ${err.message}` });
    } finally {
      setCliTesting(false);
    }
  };

  const code = (s) => (
    <code style={{ background: '#f3f4f6', padding: '2px 7px', borderRadius: '4px', fontSize: '12px', userSelect: 'all', cursor: 'text' }}>{s}</code>
  );

  return (
    <div style={capCard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={capLabel}>飞书 / Lark 云文档集成</div>
          <div style={capDesc}>拉取飞书云文档内容供大模型读取。支持公开链接、App Token 鉴权、Lark-CLI 本地授权三种模式</div>
        </div>
        <Switch checked={capabilities.feishu.enabled} onChange={(v) => updateCapability('feishu', { enabled: v })} />
      </div>

      {capabilities.feishu.enabled && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ marginBottom: '12px' }}>
            <span style={fieldLabel}>鉴权模式</span>
            <Select
              value={capabilities.feishu.authMode}
              onChange={(v) => { updateCapability('feishu', { authMode: v }); setCliResult(null); }}
              style={{ width: '100%' }}
              options={[
                { label: '🌐 公开链接（无需鉴权）', value: 'public' },
                { label: '🔑 App Token 鉴权（推荐，稳定）', value: 'token' },
                { label: '💻 Lark-CLI 本地授权（适合技能调用 CLI）', value: 'cli' },
              ]}
            />
          </div>

          {/* === App Token mode === */}
          {capabilities.feishu.authMode === 'token' && (
            <>
              <Row gutter={16} style={{ marginBottom: '10px' }}>
                <Col span={12}>
                  <span style={fieldLabel}>App ID</span>
                  <Input
                    value={capabilities.feishu.appId}
                    onChange={(e) => updateCapability('feishu', { appId: e.target.value })}
                    placeholder="cli_xxxxxxxxx"
                  />
                </Col>
                <Col span={12}>
                  <span style={fieldLabel}>App Secret</span>
                  <Input.Password
                    value={capabilities.feishu.appSecret}
                    onChange={(e) => updateCapability('feishu', { appSecret: e.target.value })}
                    placeholder="App Secret"
                  />
                </Col>
              </Row>
              <div style={{ marginBottom: '10px' }}>
                <span style={fieldLabel}>Tenant Access Token（留空则由 App ID + Secret 自动获取）</span>
                <Input.Password
                  value={capabilities.feishu.tenantToken}
                  onChange={(e) => updateCapability('feishu', { tenantToken: e.target.value })}
                  placeholder="t-xxxx（选填）"
                />
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280', background: '#f9fafb', padding: '10px 12px', borderRadius: '6px', lineHeight: '1.7' }}>
                <b>获取步骤：</b>
                <div>1. 登录 <a href="https://open.feishu.cn/app" target="_blank" rel="noreferrer">飞书开放平台</a> → 创建自建应用</div>
                <div>2. 「权限管理」开启: <b>云文档 - 查看文档、查看知识库</b></div>
                <div>3. 「凭证与基础信息」复制 App ID 和 App Secret 填入上方</div>
                <div>4. 将应用添加到目标文档/知识库的「协作者」中</div>
              </div>
            </>
          )}

          {/* === CLI mode === */}
          {capabilities.feishu.authMode === 'cli' && (
            <div style={{ fontSize: '12px', color: '#4b5563', lineHeight: '1.8' }}>
              {/* Install steps */}
              <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '14px 16px', marginBottom: '12px' }}>
                <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '10px', color: '#111827' }}>
                  📦 Lark-CLI 安装与授权（在你的 Mac 终端运行）
                </div>

                <div style={{ marginBottom: '6px', fontWeight: 600, color: '#374151' }}>方式一：官方 Feishu CLI（推荐）</div>
                <div style={{ marginBottom: '4px' }}>① 安装: {code('npm install -g @feishu/feishu-cli')}</div>
                <div style={{ marginBottom: '4px' }}>② 登录: {code('feishu-cli login')}</div>
                <div style={{ marginBottom: '12px' }}>③ 验证: {code('feishu-cli doc list')}</div>

                <div style={{ marginBottom: '6px', fontWeight: 600, color: '#374151' }}>方式二：Claude Code Lark 集成（如已安装 Claude Code）</div>
                <div style={{ marginBottom: '4px' }}>① 安装: {code('npm install -g @anthropic-ai/lark-cli')}</div>
                <div style={{ marginBottom: '4px' }}>② 登录: {code('lark-cli auth login')}</div>
                <div style={{ marginBottom: '12px' }}>③ 验证: {code('lark-cli doc list')}</div>

                <div style={{ fontSize: '11px', color: '#9ca3af', borderTop: '1px solid #e5e7eb', paddingTop: '8px', marginTop: '4px' }}>
                  💡 CLI 工具需安装在运行 <b>node server.js</b> 的同一台机器上（即你的 Mac），
                  服务器会通过 <code style={{ background: '#f3f4f6', padding: '1px 4px', borderRadius: '3px' }}>execFile</code> 直接调用。
                </div>
              </div>

              {/* Test button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <Button
                  size="small"
                  loading={cliTesting}
                  onClick={testCli}
                  style={{ borderColor: '#d1d5db' }}
                >
                  {cliTesting ? '检测中…' : '🔍 检测 CLI 状态'}
                </Button>
                <Switch
                  size="small"
                  checked={capabilities.feishu.cliInstalled}
                  onChange={(v) => updateCapability('feishu', { cliInstalled: v })}
                />
                <span style={{ color: capabilities.feishu.cliInstalled ? '#059669' : '#6b7280' }}>
                  {capabilities.feishu.cliInstalled ? '✓ 已安装并授权' : '未完成安装/授权'}
                </span>
              </div>

              {/* CLI test result */}
              {cliResult && (
                <div style={{
                  marginTop: '10px', padding: '10px 14px', borderRadius: '7px',
                  background: cliResult.ok ? '#ecfdf5' : '#fef2f2',
                  border: `1px solid ${cliResult.ok ? '#a7f3d0' : '#fecaca'}`,
                  color: cliResult.ok ? '#065f46' : '#b91c1c',
                  fontSize: '12px', lineHeight: '1.6', whiteSpace: 'pre-line',
                }}>
                  {cliResult.ok ? '✅ ' : '❌ '}{cliResult.message}
                  {cliResult.version && <span style={{ marginLeft: '8px', color: '#6b7280' }}>({cliResult.version})</span>}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ============================================
   ConfigCenter Component
   ============================================ */

const ConfigCenter = () => {
  const {
    modelConfigs, addModelConfig, updateModelConfig, removeModelConfig,
    capabilities, updateCapability,
  } = useStore();

  // Local form state for adding models
  const [providerApiKeys, setProviderApiKeys] = useState({});
  const [providerBaseUrls, setProviderBaseUrls] = useState({});
  const [selectedModels, setSelectedModels] = useState({});
  const [testingId, setTestingId] = useState(null);
  const [advancedMode, setAdvancedMode] = useState(false);

  // Active section
  const [activeSection, setActiveSection] = useState('models');

  /* ----- Model config handlers ----- */

  const handleSaveModels = (providerKey) => {
    const apiKey = providerApiKeys[providerKey];
    const models = selectedModels[providerKey] || [];
    const provider = PROVIDERS.find((p) => p.key === providerKey);
    if (!apiKey?.trim()) { message.error('请输入 API Key'); return; }
    if (models.length === 0) { message.error('请选择至少一个模型'); return; }

    const baseUrl = providerBaseUrls[providerKey] || provider.defaultBaseUrl;
    let added = 0;
    models.forEach((modelId) => {
      const model = provider.models.find((m) => m.id === modelId);
      if (!model) return;
      // Skip if already configured
      const exists = modelConfigs.some((c) => c.provider === providerKey && c.model === modelId);
      if (exists) {
        // Update existing
        const existing = modelConfigs.find((c) => c.provider === providerKey && c.model === modelId);
        updateModelConfig(existing.id, { apiKey, baseUrl });
        added++;
        return;
      }
      addModelConfig({
        provider: providerKey, model: modelId, apiKey, baseUrl,
        displayName: `${provider.name} - ${model.name}`,
        status: 'untested',
      });
      added++;
    });
    message.success(`已保存 ${added} 个模型配置`);
    setSelectedModels({ ...selectedModels, [providerKey]: [] });
  };

  const handleTestConnection = async (configId) => {
    setTestingId(configId);
    const config = modelConfigs.find((c) => c.id === configId);
    if (!config) { setTestingId(null); return; }
    try {
      const resp = await fetch(`${import.meta.env?.VITE_API_URL || ''}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: config.provider, apiKey: config.apiKey, model: config.model,
          baseUrl: config.baseUrl,
          messages: [{ role: 'user', content: 'Hello, respond with just "OK".' }],
        }),
      });
      if (resp.ok) {
        updateModelConfig(configId, { status: 'connected', lastError: null });
        message.success(`${config.displayName} 连接成功`);
      } else {
        const errData = await resp.json().catch(() => ({}));
        const detail = errData.details || errData.error || `HTTP ${resp.status}`;
        const short = detail.length > 100 ? detail.slice(0, 100) + '…' : detail;
        updateModelConfig(configId, { status: 'disconnected', lastError: detail });
        message.error({ content: `${config.displayName} 连接失败: ${short}`, duration: 8 });
      }
    } catch (err) {
      updateModelConfig(configId, { status: 'disconnected', lastError: err.message });
      message.error(`连接测试失败: ${err.message}`);
    } finally {
      setTestingId(null);
    }
  };

  const getStatusTag = (config) => {
    const { status, lastError } = config;
    if (status === 'connected') return <Tag style={{ background: '#f3f4f6', color: '#111827', border: '1px solid #d1d5db' }}>已连接</Tag>;
    if (status === 'disconnected') {
      const tag = <Tag style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', cursor: lastError ? 'help' : 'default' }}>连接失败</Tag>;
      return lastError ? <Tooltip title={lastError} placement="topLeft">{tag}</Tooltip> : tag;
    }
    return <Tag style={{ background: '#f9fafb', color: '#9ca3af', border: '1px solid #e5e7eb' }}>未测试</Tag>;
  };

  /* ----- Render: Model Provider Panels ----- */

  const renderModelSection = () => {
    const collapseItems = PROVIDERS.map((provider) => {
      const configs = modelConfigs.filter((c) => c.provider === provider.key);
      const currentKey = providerApiKeys[provider.key] || '';
      const currentUrl = providerBaseUrls[provider.key] || provider.defaultBaseUrl;
      const currentModels = selectedModels[provider.key] || [];

      return {
        key: provider.key,
        label: (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '14px' }}>{provider.name}</div>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>
                {configs.length > 0 ? `已配置 ${configs.length} 个模型` : '未配置'}
              </div>
            </div>
          </div>
        ),
        children: (
          <div style={{ padding: '16px 0' }}>
            {advancedMode && (
              <div style={{ marginBottom: '16px' }}>
                <span style={fieldLabel}>API Base URL（高级）</span>
                <Input value={currentUrl} onChange={(e) => setProviderBaseUrls({ ...providerBaseUrls, [provider.key]: e.target.value })} placeholder={provider.defaultBaseUrl} size="small" />
                <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>默认: {provider.defaultBaseUrl}</div>
              </div>
            )}
            <div style={{ marginBottom: '16px' }}>
              <span style={fieldLabel}>API Key</span>
              <Input.Password value={currentKey} onChange={(e) => setProviderApiKeys({ ...providerApiKeys, [provider.key]: e.target.value })} placeholder="输入 API Key" />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <span style={fieldLabel}>选择模型</span>
              <Select
                mode="multiple" placeholder="选择要启用的模型" style={{ width: '100%' }}
                options={provider.models.map((m) => ({ label: m.name, value: m.id }))}
                value={currentModels}
                onChange={(v) => setSelectedModels({ ...selectedModels, [provider.key]: v })}
              />
            </div>
            <Button type="primary" onClick={() => handleSaveModels(provider.key)}>保存配置</Button>

            {configs.length > 0 && (
              <div style={{ marginTop: '20px' }}>
                <div style={{ fontWeight: 500, marginBottom: '10px', fontSize: '13px' }}>已激活模型</div>
                <Space direction="vertical" style={{ width: '100%' }}>
                  {configs.map((c) => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#fafafa', borderRadius: '8px', border: '1px solid #f3f4f6' }}>
                      <div>
                        <span style={{ fontWeight: 500, fontSize: '13px' }}>{c.displayName}</span>
                        <span style={{ marginLeft: '8px' }}>{getStatusTag(c)}</span>
                        <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{c.baseUrl}</div>
                      </div>
                      <Space>
                        <Button size="small" onClick={() => handleTestConnection(c.id)} loading={testingId === c.id}>
                          {testingId === c.id ? '测试中' : '连接测试'}
                        </Button>
                        <Button size="small" danger onClick={() => { removeModelConfig(c.id); message.success('已删除'); }}>删除</Button>
                      </Space>
                    </div>
                  ))}
                </Space>
              </div>
            )}
          </div>
        ),
      };
    });

    return (
      <div>
        {sectionTitle('模型供应商配置', '统一管理各厂商 API Key、接口地址、模型选择，配置一次全平台生效')}
        <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Switch checked={advancedMode} onChange={setAdvancedMode} size="small" />
          <span style={{ fontSize: '13px', color: '#6b7280' }}>高级模式（显示 API Base URL 配置）</span>
        </div>
        <Collapse items={collapseItems} accordion={false} />

        {modelConfigs.length > 0 && (
          <div style={{ marginTop: '24px' }}>
            <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '12px' }}>已激活模型汇总（{modelConfigs.length}）</div>
            <Row gutter={[12, 12]}>
              {modelConfigs.map((c) => (
                <Col key={c.id} xs={24} sm={12} md={8} lg={6}>
                  <div style={{ padding: '12px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', borderTop: '3px solid #111827', textAlign: 'center' }}>
                    <div style={{ fontSize: '12px', fontWeight: 500, color: '#111827' }}>{c.displayName}</div>
                    <div style={{ marginTop: '6px' }}>{getStatusTag(c)}</div>
                  </div>
                </Col>
              ))}
            </Row>
          </div>
        )}
      </div>
    );
  };

  /* ----- Render: Capabilities Config ----- */

  const renderCapabilitiesSection = () => (
    <div>
      {sectionTitle('底层能力配置', '集中配置 PDF 引擎、文件解析、飞书授权、插件权限，配置一次全平台复用')}

      {/* PDF Engine */}
      <div style={capCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={capLabel}>PDF 文档解析引擎</div>
            <div style={capDesc}>上传 PDF 文件时自动提取文本内容，支持内置引擎或自定义解析服务</div>
          </div>
          <Switch checked={capabilities.pdf.enabled} onChange={(v) => updateCapability('pdf', { enabled: v })} />
        </div>
        {capabilities.pdf.enabled && (
          <div style={{ marginTop: '12px' }}>
            <Row gutter={16}>
              <Col span={12}>
                <span style={fieldLabel}>解析引擎</span>
                <Select value={capabilities.pdf.engine} onChange={(v) => updateCapability('pdf', { engine: v })} style={{ width: '100%' }} options={[{ label: '内置引擎（推荐）', value: 'server' }, { label: '自定义端点', value: 'custom' }]} />
              </Col>
              <Col span={12}>
                <span style={fieldLabel}>最大字符数</span>
                <Input type="number" value={capabilities.pdf.maxChars} onChange={(e) => updateCapability('pdf', { maxChars: parseInt(e.target.value) || 80000 })} />
              </Col>
            </Row>
            {capabilities.pdf.engine === 'custom' && (
              <div style={{ marginTop: '10px' }}>
                <span style={fieldLabel}>自定义解析端点 URL</span>
                <Input value={capabilities.pdf.customEndpoint} onChange={(e) => updateCapability('pdf', { customEndpoint: e.target.value })} placeholder="https://your-pdf-service.com/api/parse" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Text Files */}
      <div style={capCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={capLabel}>TXT / CSV / MD / JSON 文件转码</div>
            <div style={capDesc}>自动读取文本类文件内容，支持设置最大字符截断阈值</div>
          </div>
          <Switch checked={capabilities.textFiles.enabled} onChange={(v) => updateCapability('textFiles', { enabled: v })} />
        </div>
        {capabilities.textFiles.enabled && (
          <div style={{ marginTop: '12px' }}>
            <Row gutter={16}>
              <Col span={12}>
                <span style={fieldLabel}>最大字符数</span>
                <Input type="number" value={capabilities.textFiles.maxChars} onChange={(e) => updateCapability('textFiles', { maxChars: parseInt(e.target.value) || 50000 })} />
              </Col>
              <Col span={12}>
                <span style={fieldLabel}>支持的扩展名</span>
                <Input value={(capabilities.textFiles.supportedExts || []).join(', ')} disabled style={{ color: '#6b7280' }} />
              </Col>
            </Row>
          </div>
        )}
      </div>

      {/* Feishu / Lark */}
      <FeishuSection capabilities={capabilities} updateCapability={updateCapability} />

      {/* External Link Fetch */}
      <div style={capCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={capLabel}>外部链接内容拉取</div>
            <div style={capDesc}>粘贴任意 URL 自动拉取网页/文档纯文本内容</div>
          </div>
          <Switch checked={capabilities.linkFetch.enabled} onChange={(v) => updateCapability('linkFetch', { enabled: v })} />
        </div>
        {capabilities.linkFetch.enabled && (
          <div style={{ marginTop: '12px' }}>
            <Row gutter={16}>
              <Col span={12}>
                <span style={fieldLabel}>超时时间 (ms)</span>
                <Input type="number" value={capabilities.linkFetch.timeout} onChange={(e) => updateCapability('linkFetch', { timeout: parseInt(e.target.value) || 15000 })} />
              </Col>
              <Col span={12}>
                <span style={fieldLabel}>最大字符数</span>
                <Input type="number" value={capabilities.linkFetch.maxChars} onChange={(e) => updateCapability('linkFetch', { maxChars: parseInt(e.target.value) || 50000 })} />
              </Col>
            </Row>
          </div>
        )}
      </div>

      {/* Plugins / Skills */}
      <div style={capCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={capLabel}>Skill 与插件全局权限</div>
            <div style={capDesc}>控制技能库中的 Skill 和插件是否可被全平台引用</div>
          </div>
          <Switch checked={capabilities.plugins.globalSkillAccess} onChange={(v) => updateCapability('plugins', { globalSkillAccess: v })} />
        </div>
      </div>
    </div>
  );

  /* ----- Main Render ----- */

  /* ----- Preview Environment Config ----- */
  const [previewTokenCssUrl, setPreviewTokenCssUrl] = useState(capabilities?.previewEnv?.tokenCssUrl || '');
  const [previewComponentJsUrl, setPreviewComponentJsUrl] = useState(capabilities?.previewEnv?.componentJsUrl || '');
  const [previewFontCssUrl, setPreviewFontCssUrl] = useState(capabilities?.previewEnv?.fontCssUrl || '');
  const [previewHtmlTemplate, setPreviewHtmlTemplate] = useState(capabilities?.previewEnv?.htmlTemplate || '');
  const [figmaToken, setFigmaToken] = useState(capabilities?.figma?.personalAccessToken || '');

  const handleSavePreviewEnv = () => {
    updateCapability('previewEnv', {
      tokenCssUrl: previewTokenCssUrl.trim(),
      componentJsUrl: previewComponentJsUrl.trim(),
      fontCssUrl: previewFontCssUrl.trim(),
      htmlTemplate: previewHtmlTemplate.trim(),
    });
    message.success('预览环境配置已保存');
  };

  const handleSaveFigmaToken = () => {
    updateCapability('figma', { personalAccessToken: figmaToken.trim() });
    message.success('Figma Token 已保存');
  };

  const renderPreviewEnvSection = () => (
    <div>
      {sectionTitle('预览环境配置', '配置设计类 Skill 预览所需的 CDN 资源和模板')}

      {/* Design Token / Component Library */}
      <div style={capCard}>
        <div style={capLabel}>Design Token & 组件库</div>
        <div style={capDesc}>配置团队的 Design Token CSS 和组件库 JS，预览页面将自动注入这些资源</div>

        <div style={{ marginBottom: 12 }}>
          <span style={fieldLabel}>Design Token CSS URL</span>
          <Input
            placeholder="https://cdn.yourteam.com/design-tokens.css"
            value={previewTokenCssUrl}
            onChange={(e) => setPreviewTokenCssUrl(e.target.value)}
            size="small"
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <span style={fieldLabel}>组件库 JS URL</span>
          <Input
            placeholder="https://cdn.yourteam.com/components.umd.js"
            value={previewComponentJsUrl}
            onChange={(e) => setPreviewComponentJsUrl(e.target.value)}
            size="small"
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <span style={fieldLabel}>Web 字体 CSS URL</span>
          <Input
            placeholder="https://fonts.yourteam.com/webfont.css"
            value={previewFontCssUrl}
            onChange={(e) => setPreviewFontCssUrl(e.target.value)}
            size="small"
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <span style={fieldLabel}>基础 HTML 模板（可选，用 {'{{OUTPUT}}'} 作为占位符）</span>
          <Input.TextArea
            placeholder={'<html><head>...</head><body>{{OUTPUT}}</body></html>'}
            value={previewHtmlTemplate}
            onChange={(e) => setPreviewHtmlTemplate(e.target.value)}
            rows={3}
            style={{ fontSize: 12, fontFamily: 'monospace' }}
          />
        </div>
        <Button type="primary" size="small" onClick={handleSavePreviewEnv}>保存预览环境配置</Button>
      </div>

      {/* Figma Integration */}
      <div style={capCard}>
        <div style={capLabel}>Figma 集成</div>
        <div style={capDesc}>配置 Figma Personal Access Token，用于精准预览 Figma 生成类 Skill 的输出（第二期功能）</div>

        <div style={{ marginBottom: 12 }}>
          <span style={fieldLabel}>Figma Personal Access Token</span>
          <Input.Password
            placeholder="figd_xxxxxxxxxxxxxxxx"
            value={figmaToken}
            onChange={(e) => setFigmaToken(e.target.value)}
            size="small"
          />
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>获取方式：Figma → Settings → Personal access tokens</div>
        </div>
        <Button type="primary" size="small" onClick={handleSaveFigmaToken}>保存 Figma Token</Button>
        <Tag style={{ marginLeft: 8, fontSize: 10 }}>第二期</Tag>
      </div>
    </div>
  );

  const tabs = [
    { key: 'models', label: '模型配置' },
    { key: 'capabilities', label: '底层能力' },
    { key: 'preview-env', label: '预览环境' },
  ];

  return (
    <div style={{ padding: '24px', maxWidth: '960px', margin: '0 auto' }}>
      {/* Tab Switcher */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '28px', background: '#f3f4f6', padding: '4px', borderRadius: '10px', width: 'fit-content' }}>
        {tabs.map((t) => (
          <div
            key={t.key}
            onClick={() => setActiveSection(t.key)}
            style={{
              padding: '8px 20px', borderRadius: '8px', cursor: 'pointer',
              fontWeight: 500, fontSize: '13px', transition: 'all 150ms',
              background: activeSection === t.key ? '#fff' : 'transparent',
              color: activeSection === t.key ? '#111827' : '#6b7280',
              boxShadow: activeSection === t.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            {t.label}
          </div>
        ))}
      </div>

      {activeSection === 'models' && renderModelSection()}
      {activeSection === 'capabilities' && renderCapabilitiesSection()}
      {activeSection === 'preview-env' && renderPreviewEnvSection()}
    </div>
  );
};

export default ConfigCenter;
