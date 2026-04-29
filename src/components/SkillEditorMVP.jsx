/**
 * SkillEditorMVP — 技能编辑模块（MVP 一期）
 * ----------------------------------------------------------------------
 * 这个组件取代了之前的"技能测试"模块（依赖大模型运行 skill）。
 * MVP 一期定位：纯编辑器，零大模型依赖。
 *
 * 功能：
 *   1. 选择技能 + 选择版本 → 显示版本内容
 *   2. 在右侧 textarea 直接编辑 SKILL.md
 *   3. 修改后保存为新版本（不覆盖原版本）
 *   4. 版本历史时间线 + 任意两版 diff 对比（modal）
 *
 * 不做：
 *   - 不调用大模型（评估和优化在"技能评估"页）
 *   - 不做语法校验（依赖评估器跑 Python 脚本判断）
 *   - 不做"运行 skill"测试功能（改放在评估页）
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Layout, Select, Button, Input, Modal, message, Tag, Empty, Space, Tooltip,
} from 'antd';
import { useStore } from '../store';
import { diffLines } from 'diff';

const { Sider, Content } = Layout;
const { Option } = Select;
const { TextArea } = Input;

// 极简黑白 token
const T = {
  border:    '#e5e7eb',
  borderDark:'#111827',
  text:      '#111827',
  textSub:   '#6b7280',
  textFaint: '#9ca3af',
  bg:        '#fff',
  bgSub:     '#fafafa',
  bgPanel:   '#f9fafb',
};

const FONT_MONO = "'SF Mono', 'JetBrains Mono', 'Roboto Mono', Menlo, Consolas, monospace";

export default function SkillEditorMVP() {
  const {
    skills, activeSkillId, setActiveSkill,
    saveSkillVersion, updateSkill, setActiveTab,
  } = useStore();

  const [selectedSkillId,    setSelectedSkillId]    = useState(activeSkillId || null);
  const [selectedVersionIdx, setSelectedVersionIdx] = useState(null);
  const [editorContent,      setEditorContent]      = useState('');
  const [diffModalOpen,      setDiffModalOpen]      = useState(false);
  const [diffWith,           setDiffWith]           = useState(null);
  const [versionNote,        setVersionNote]        = useState('');

  // ─── Derived ──────────────────────────────────────────────────────
  const selectedSkill = skills.find((s) => s.id === selectedSkillId) || null;
  const versions      = selectedSkill?.versions || [];
  const baseContent   = (selectedVersionIdx !== null && versions[selectedVersionIdx])
    ? versions[selectedVersionIdx].content : '';
  const dirty         = editorContent !== baseContent;

  // 选择 skill 时默认载入最新版本
  useEffect(() => {
    if (!selectedSkill) {
      setSelectedVersionIdx(null);
      setEditorContent('');
      return;
    }
    if (selectedSkill.versions?.length > 0) {
      const lastIdx = selectedSkill.versions.length - 1;
      setSelectedVersionIdx(lastIdx);
      setEditorContent(selectedSkill.versions[lastIdx].content || '');
    } else {
      setSelectedVersionIdx(null);
      setEditorContent('');
    }
  }, [selectedSkillId]);

  // 切换版本时同步编辑器内容
  useEffect(() => {
    if (selectedVersionIdx !== null && versions[selectedVersionIdx]) {
      setEditorContent(versions[selectedVersionIdx].content || '');
    }
  }, [selectedVersionIdx]);

  // ─── Handlers ─────────────────────────────────────────────────────
  const handleSelectSkill = (id) => {
    setSelectedSkillId(id);
    setActiveSkill?.(id);
  };

  const handleRevert = () => {
    if (!dirty) return;
    Modal.confirm({
      title: '还原修改',
      content: '将丢弃当前未保存的修改，恢复为该版本的原始内容。',
      onOk: () => setEditorContent(baseContent),
    });
  };

  const handleSaveNewVersion = () => {
    if (!selectedSkillId) return;
    if (!editorContent.trim()) {
      message.warning('内容不能为空');
      return;
    }
    if (!dirty && !versionNote.trim()) {
      message.warning('内容未修改且无版本备注');
      return;
    }
    Modal.confirm({
      title: '保存为新版本',
      content: (
        <div>
          <p style={{ marginBottom: 8 }}>
            将作为新版本保存，原有 {versions.length} 个版本保留不变。
          </p>
          <Input
            placeholder="版本备注（可选，例如：修正命名规则）"
            value={versionNote}
            onChange={(e) => setVersionNote(e.target.value)}
            maxLength={120}
          />
        </div>
      ),
      okText: '保存',
      onOk: () => {
        const desc = versionNote.trim() || `v${versions.length + 1}`;
        saveSkillVersion(selectedSkillId, editorContent, desc);
        // 同步 frontmatter 中的 name 到 skills 列表
        const fm = editorContent.match(/^---[\s\S]*?\nname:\s*(.+?)$/m);
        if (fm) {
          const newName = fm[1].trim().replace(/^["']|["']$/g, '');
          if (newName && newName !== selectedSkill?.name) {
            updateSkill(selectedSkillId, { name: newName });
          }
        }
        message.success(`已保存为新版本「${desc}」`);
        setVersionNote('');
        // 自动跳到最新版本
        setSelectedVersionIdx(versions.length);
      },
    });
  };

  const openDiff = (compareIdx) => {
    setDiffWith(compareIdx);
    setDiffModalOpen(true);
  };

  // ─── Render: Left sider 技能 + 版本时间线 ──────────────────────────
  const leftSider = (
    <div style={{ padding: 16, height: '100%', overflowY: 'auto', boxSizing: 'border-box', background: T.bgPanel }}>
      {/* Skill picker */}
      <div style={{ marginBottom: 16 }}>
        <Label>技能</Label>
        {skills.length === 0 ? (
          <div style={{ fontSize: 12, color: T.textFaint, padding: '8px 0' }}>
            技能库为空。
            <Button type="link" size="small" style={{ padding: 0, marginLeft: 4 }} onClick={() => setActiveTab('skill-library')}>
              前往技能库 →
            </Button>
          </div>
        ) : (
          <Select
            value={selectedSkillId}
            onChange={handleSelectSkill}
            placeholder="选择要编辑的技能"
            style={{ width: '100%' }}
          >
            {skills.map((s) => (
              <Option key={s.id} value={s.id}>{s.name}</Option>
            ))}
          </Select>
        )}
      </div>

      {selectedSkill && (
        <>
          <div style={{ ...divider }} />

          {/* Version timeline */}
          <Label>版本历史</Label>
          {versions.length === 0 ? (
            <Empty description="无版本" image={null} style={{ padding: '12px 0' }} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {versions.map((v, i) => {
                const isActive = i === selectedVersionIdx;
                const ts = v.timestamp ? new Date(v.timestamp).toLocaleDateString('zh-CN') : '';
                return (
                  <div
                    key={i}
                    onClick={() => setSelectedVersionIdx(i)}
                    style={{
                      cursor: 'pointer',
                      padding: '10px 12px',
                      background: isActive ? T.text : T.bg,
                      color:      isActive ? '#fafafa' : T.text,
                      border:     `1px solid ${isActive ? T.borderDark : T.border}`,
                      borderRadius: 4,
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontWeight: 700, fontSize: 12 }}>
                        {v.description || `v${i + 1}`}
                      </span>
                      <span style={{ fontFamily: FONT_MONO, fontSize: 10, opacity: 0.7 }}>
                        {ts}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
                      {(v.content || '').length.toLocaleString()} 字符
                    </div>
                    {isActive && i > 0 && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid rgba(255,255,255,0.2)` }}>
                        <Button
                          size="small"
                          ghost
                          style={{ fontSize: 10, padding: '0 8px', height: 22, borderColor: '#fafafa', color: '#fafafa' }}
                          onClick={(e) => { e.stopPropagation(); openDiff(i - 1); }}
                        >
                          与前一版对比 →
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ ...divider }} />

          {/* Skill metadata */}
          <Label>技能信息</Label>
          <div style={{ fontSize: 11, color: T.textSub, lineHeight: 1.7 }}>
            <div><span style={{ color: T.textFaint }}>名称：</span>{selectedSkill.name}</div>
            <div><span style={{ color: T.textFaint }}>分类：</span>{selectedSkill.category || '—'}</div>
            <div><span style={{ color: T.textFaint }}>版本数：</span>{versions.length}</div>
          </div>
        </>
      )}
    </div>
  );

  // ─── Render: Right content 编辑器 ───────────────────────────────────
  const rightContent = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: T.bg }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px', borderBottom: `1px solid ${T.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: T.bg,
      }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>SKILL.md 编辑器</span>
          {selectedSkill && (
            <span style={{ marginLeft: 12, fontSize: 12, color: T.textSub }}>
              {selectedSkill.name}
              {selectedVersionIdx !== null && (
                <Tag style={{ marginLeft: 8, fontSize: 10, padding: '0 6px', lineHeight: '16px' }}>
                  {versions[selectedVersionIdx]?.description || `v${selectedVersionIdx + 1}`}
                </Tag>
              )}
            </span>
          )}
        </div>
        <Space>
          {dirty && (
            <Tag color="default" style={{ fontFamily: FONT_MONO, fontSize: 10 }}>
              ● UNSAVED
            </Tag>
          )}
          <Button size="small" disabled={!dirty} onClick={handleRevert}>还原</Button>
          <Button
            size="small" type="primary"
            disabled={!selectedSkillId || !editorContent.trim()}
            onClick={handleSaveNewVersion}
            style={{ background: T.text, borderColor: T.text }}
          >
            保存为新版本
          </Button>
        </Space>
      </div>

      {/* Editor */}
      <div style={{ flex: 1, overflow: 'hidden', padding: 0 }}>
        {!selectedSkill ? (
          <div style={{
            height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: T.textFaint, flexDirection: 'column', gap: 12,
          }}>
            <div style={{ fontSize: 13 }}>从左侧选择一个技能开始编辑</div>
          </div>
        ) : (
          <TextArea
            value={editorContent}
            onChange={(e) => setEditorContent(e.target.value)}
            placeholder="开始编辑 SKILL.md ..."
            style={{
              border: 'none',
              borderRadius: 0,
              fontFamily: FONT_MONO,
              fontSize: 13,
              lineHeight: 1.7,
              padding: '20px 24px',
              height: '100%',
              resize: 'none',
              background: T.bg,
            }}
          />
        )}
      </div>

      {/* Footer status bar */}
      <div style={{
        padding: '8px 24px',
        borderTop: `1px solid ${T.border}`,
        background: T.bgSub,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontFamily: FONT_MONO, fontSize: 11, color: T.textFaint,
      }}>
        <div>
          {editorContent.length.toLocaleString()} 字符 · {editorContent.split('\n').length} 行
        </div>
        <div>
          {dirty ? '修改后保存为新版本，原版本会保留' : '未修改'}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <Layout style={{ height: '100%', background: T.bg }}>
        <Sider width={280} style={{ background: T.bgPanel, borderRight: `1px solid ${T.border}` }}>
          {leftSider}
        </Sider>
        <Content>{rightContent}</Content>
      </Layout>

      {/* Diff modal */}
      <DiffModal
        open={diffModalOpen}
        onClose={() => setDiffModalOpen(false)}
        leftLabel={diffWith != null ? (versions[diffWith]?.description || `v${diffWith + 1}`) : ''}
        rightLabel={selectedVersionIdx != null ? (versions[selectedVersionIdx]?.description || `v${selectedVersionIdx + 1}`) : ''}
        leftContent={diffWith != null ? (versions[diffWith]?.content || '') : ''}
        rightContent={selectedVersionIdx != null ? (versions[selectedVersionIdx]?.content || '') : ''}
      />
    </>
  );
}

// ─── Sub: Label ──────────────────────────────────────────────────────
const Label = ({ children }) => (
  <div style={{
    fontSize: 11,
    fontFamily: FONT_MONO,
    letterSpacing: '0.1em',
    color: T.textFaint,
    marginBottom: 8,
    textTransform: 'uppercase',
  }}>
    {children}
  </div>
);

const divider = {
  borderTop: `1px solid ${T.border}`,
  margin: '14px 0',
};

// ─── Sub: Diff Modal ─────────────────────────────────────────────────
function DiffModal({ open, onClose, leftLabel, rightLabel, leftContent, rightContent }) {
  const diffs = useMemo(() => {
    if (!open) return [];
    return diffLines(leftContent || '', rightContent || '');
  }, [open, leftContent, rightContent]);

  return (
    <Modal
      title={`版本对比：${leftLabel} → ${rightLabel}`}
      open={open}
      onCancel={onClose}
      footer={null}
      width={1100}
      destroyOnClose
    >
      <div style={{
        fontFamily: FONT_MONO, fontSize: 12, lineHeight: 1.6,
        maxHeight: '70vh', overflow: 'auto',
        background: '#0a0a0a', color: '#fafafa',
        padding: 16, borderRadius: 4,
      }}>
        {diffs.length === 0 ? (
          <div style={{ color: T.textFaint }}>（无差异）</div>
        ) : (
          diffs.map((part, i) => {
            const bg    = part.added   ? 'rgba(34,197,94,0.15)' : part.removed ? 'rgba(239,68,68,0.15)' : 'transparent';
            const color = part.added   ? '#86efac'             : part.removed ? '#fca5a5'             : '#fafafa';
            const sign  = part.added   ? '+'                   : part.removed ? '-'                   : ' ';
            return (
              <div key={i} style={{ background: bg, color, padding: '0 8px' }}>
                {part.value.split('\n').map((line, j) => (
                  <div key={j} style={{ whiteSpace: 'pre-wrap' }}>
                    {line || j < part.value.split('\n').length - 1 ? `${sign} ${line}` : null}
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>
      <div style={{ marginTop: 12, fontSize: 11, color: T.textFaint, fontFamily: FONT_MONO }}>
        <span style={{ color: '#16a34a' }}>+ 新增</span>
        <span style={{ marginLeft: 16, color: '#dc2626' }}>− 删除</span>
        <span style={{ marginLeft: 16 }}>· 共 {diffs.filter((d) => d.added || d.removed).length} 处变更</span>
      </div>
    </Modal>
  );
}
