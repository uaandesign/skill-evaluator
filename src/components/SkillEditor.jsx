import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  Card,
  Upload,
  Segmented,
  Button,
  Alert,
  Tag,
  Collapse,
  Typography,
  Space,
  Tabs,
  message,
  Tooltip,
  Tree,
  Input,
} from 'antd';
import { useStore } from '../store';
import {
  parseSkill,
  detectFormat,
  validateSkillMd,
  validateFunctionCall,
  validatePromptTemplate,
} from '../utils/skillParser';

const { Title, Text, Paragraph } = Typography;

const SKILL_MD_TEMPLATE = `---
name: 我的技能
version: 1.0.0
description: 技能的简单描述
author: 作者名称
tags:
  - 标签1
  - 标签2
parameters:
  - name: input
    type: string
    description: 输入参数
  - name: options
    type: object
    description: 可选配置
returns:
  type: object
  description: 返回值
---

# 概述

在这里详细描述你的技能。

## 用法

解释如何使用此技能。

## 示例

\`\`\`
代码示例或使用示例
\`\`\`
`;

const FUNCTION_CALL_TEMPLATE = `{
  "name": "my_skill",
  "description": "技能的简单描述",
  "parameters": {
    "type": "object",
    "properties": {
      "input": {
        "type": "string",
        "description": "输入参数"
      },
      "options": {
        "type": "object",
        "description": "可选配置",
        "properties": {}
      }
    },
    "required": ["input"]
  }
}`;

const PROMPT_TEMPLATE_TEMPLATE = `# {{skillName}}

## 描述
{{description}}

## 指令
1. {{instruction1}}
2. {{instruction2}}
3. {{instruction3}}

## 输入格式
- {{inputParam1}}: {{description1}}
- {{inputParam2}}: {{description2}}

## 输出格式
预期的输出格式和结构。

## 示例
输入: {{exampleInput}}
输出: {{exampleOutput}}
`;

const SkillEditor = () => {
  const [format, setFormat] = useState('skillmd');
  const [content, setContent] = useState(SKILL_MD_TEMPLATE);
  const [validationResults, setValidationResults] = useState(null);
  const [skillData, setSkillData] = useState(null);
  const [showValidation, setShowValidation] = useState(true);
  const editorRef = useRef(null);

  const { addSkill } = useStore();

  const validate = useCallback((text, fmt) => {
    let results;
    switch (fmt) {
      case 'skillmd':
        results = validateSkillMd(text);
        break;
      case 'function':
        results = validateFunctionCall(text);
        break;
      case 'prompt':
        results = validatePromptTemplate(text);
        break;
      default:
        results = { valid: false, errors: [], warnings: [] };
    }
    setValidationResults(results);
    if (results.valid && results.parsed) {
      setSkillData(results.parsed);
    }
  }, []);

  const handleContentChange = (value) => {
    setContent(value);
    validate(value, format);
  };

  const handleFormatChange = (newFormat) => {
    setFormat(newFormat);
    let newContent;
    switch (newFormat) {
      case 'skillmd':
        newContent = SKILL_MD_TEMPLATE;
        break;
      case 'function':
        newContent = FUNCTION_CALL_TEMPLATE;
        break;
      case 'prompt':
        newContent = PROMPT_TEMPLATE_TEMPLATE;
        break;
      default:
        newContent = '';
    }
    setContent(newContent);
    validate(newContent, newFormat);
  };

  const handleFileUpload = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const detectedFormat = detectFormat(text);
      setFormat(detectedFormat);
      setContent(text);
      validate(text, detectedFormat);
    };
    reader.readAsText(file);
    return false;
  };

  const handleSave = () => {
    if (!validationResults?.valid) {
      message.error('无法保存: 请先修复验证错误');
      return;
    }
    const skillId = `skill_${Date.now()}`;
    const skillPayload = {
      id: skillId,
      format,
      content,
      parsedData: skillData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    addSkill(skillPayload);
    message.success(`技能已保存，ID: ${skillId}`);
  };

  const handleCopyContent = () => {
    navigator.clipboard.writeText(content);
    message.success('内容已复制到剪贴板');
  };

  const handleClearEditor = () => {
    setContent('');
    setValidationResults(null);
    setSkillData(null);
    message.info('编辑器已清空');
  };

  const handleInsertTemplate = (template) => {
    setContent(template);
    validate(template, format);
    message.success('模板已插入');
  };

  const validationTreeData = useMemo(() => {
    if (!validationResults || !validationResults.parsed) return [];

    const buildTreeNode = (obj, key = 'root') => {
      if (obj === null || obj === undefined) {
        return {
          title: `${key}: null`,
          key: `${key}_null`,
        };
      }

      if (typeof obj !== 'object') {
        return {
          title: `${key}: ${String(obj)}`,
          key: `${key}_${String(obj)}`,
        };
      }

      if (Array.isArray(obj)) {
        return {
          title: `${key} (数组, ${obj.length} 项)`,
          key: `${key}_array`,
          children: obj.map((item, idx) => buildTreeNode(item, `[${idx}]`)),
        };
      }

      return {
        title: key,
        key,
        children: Object.entries(obj).map(([k, v]) => buildTreeNode(v, k)),
      };
    };

    return [buildTreeNode(validationResults.parsed)];
  }, [validationResults]);

  const renderValidationPanel = () => {
    if (!validationResults) return null;

    return (
      <div style={{ marginTop: '20px' }}>
        <div style={{ marginBottom: '16px' }}>
          {validationResults.valid ? (
            <Alert
              message="验证通过"
              description="此技能有效，可以保存。"
              type="success"
              icon={null}
              showIcon
            />
          ) : (
            <Alert
              message="验证失败"
              description="请在保存前修复下面的错误。"
              type="error"
              icon={null}
              showIcon
            />
          )}
        </div>

        {(validationResults.errors.length > 0 || validationResults.warnings.length > 0) && (
          <div style={{ marginBottom: '16px' }}>
            {validationResults.errors.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <Title level={5}>错误 ({validationResults.errors.length})</Title>
                <Space direction="vertical" style={{ width: '100%' }}>
                  {validationResults.errors.map((err, idx) => (
                    <div key={idx} style={{ padding: '8px', backgroundColor: '#fff2f0', borderRadius: '4px' }}>
                      <Tag color="red">第 {err.line || 'N/A'} 行</Tag>
                      <Text>{err.message}</Text>
                    </div>
                  ))}
                </Space>
              </div>
            )}

            {validationResults.warnings.length > 0 && (
              <div>
                <Title level={5}>警告 ({validationResults.warnings.length})</Title>
                <Space direction="vertical" style={{ width: '100%' }}>
                  {validationResults.warnings.map((warn, idx) => (
                    <div key={idx} style={{ padding: '8px', backgroundColor: '#fffbe6', borderRadius: '4px' }}>
                      <Tag color="orange">第 {warn.line || 'N/A'} 行</Tag>
                      <Text>{warn.message}</Text>
                    </div>
                  ))}
                </Space>
              </div>
            )}
          </div>
        )}

        {validationResults.parsed && (
          <div style={{ marginTop: '16px' }}>
            <Collapse
              items={[
                {
                  key: 'parsed',
                  label: '解析结构',
                  children: (
                    <Tree
                      treeData={validationTreeData}
                      defaultExpandAll={false}
                      showIcon={false}
                    />
                  ),
                },
              ]}
            />
          </div>
        )}
      </div>
    );
  };

  const templateItems = [
    {
      key: 'skillmd',
      label: 'SKILL.md',
      children: (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Paragraph>
            <Text code>SKILL.md</Text> 格式，带 YAML 前置数据用于全面的技能定义。
          </Paragraph>
          <Button
            type="primary"
            onClick={() => handleInsertTemplate(SKILL_MD_TEMPLATE)}
          >
            插入 SKILL.md 模板
          </Button>
          <Alert
            message="格式: YAML 前置数据后接 Markdown 内容"
            type="info"
          />
        </Space>
      ),
    },
    {
      key: 'function',
      label: '函数调用',
      children: (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Paragraph>
            OpenAI 兼容的 JSON 模式，用于函数调用集成。
          </Paragraph>
          <Button
            type="primary"
            onClick={() => handleInsertTemplate(FUNCTION_CALL_TEMPLATE)}
          >
            插入函数调用模板
          </Button>
          <Alert
            message="格式: 遵循 OpenAI 函数模式规范的 JSON"
            type="info"
          />
        </Space>
      ),
    },
    {
      key: 'prompt',
      label: '提示词模板',
      children: (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Paragraph>
            自定义模板格式，带有用于动态内容的变量占位符。
          </Paragraph>
          <Button
            type="primary"
            onClick={() => handleInsertTemplate(PROMPT_TEMPLATE_TEMPLATE)}
          >
            插入提示词模板
          </Button>
          <Alert
            message="格式: 带 {{variable}} 占位符的自定义 Markdown"
            type="info"
          />
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Card
        title={<Title level={3} style={{ marginTop: 0 }}>技能编辑器</Title>}
        extra={
          <Space>
            <Tooltip title="复制编辑器内容">
              <Button
                onClick={handleCopyContent}
              >
                复制内容
              </Button>
            </Tooltip>
            <Tooltip title="清空编辑器">
              <Button
                onClick={handleClearEditor}
                danger
              >
                清空编辑器
              </Button>
            </Tooltip>
            <Button
              type="primary"
              onClick={handleSave}
              disabled={!validationResults?.valid}
            >
              保存技能
            </Button>
          </Space>
        }
        style={{ marginBottom: '24px' }}
      >
        {/* 文件上传区 */}
        <div style={{ marginBottom: '20px' }}>
          <Upload.Dragger
            accept=".md,.json,.txt,.yaml,.yml"
            beforeUpload={handleFileUpload}
            maxCount={1}
          >
            <p style={{ fontSize: '48px', margin: '16px 0 8px 0' }}>
              +
            </p>
            <p style={{ margin: '8px 0' }}>拖拽技能文件到此处</p>
            <p style={{ color: '#999', margin: '0' }}>
              或点击选择文件 (.md, .json, .txt, .yaml)
            </p>
          </Upload.Dragger>
        </div>

        {/* 格式选择器 */}
        <div style={{ marginBottom: '20px', padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '6px' }}>
          <Text strong>格式选择:</Text>
          <Segmented
            value={format}
            onChange={handleFormatChange}
            options={[
              { label: 'SKILL.md', value: 'skillmd' },
              { label: '函数调用', value: 'function' },
              { label: '提示词模板', value: 'prompt' },
            ]}
            style={{ marginLeft: '16px' }}
          />
        </div>

        {/* 文本编辑器 */}
        <div style={{ marginBottom: '20px', border: '1px solid #d9d9d9', borderRadius: '6px', overflow: 'hidden' }}>
          <Input.TextArea
            ref={editorRef}
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            style={{
              fontFamily: "'Fira Code', 'Courier New', monospace",
              fontSize: '13px',
              minHeight: '500px',
              width: '100%',
              border: 'none',
            }}
            placeholder="在此输入技能内容..."
          />
        </div>

        {/* 验证面板切换 */}
        <div style={{ marginBottom: '12px' }}>
          <Button
            type="text"
            onClick={() => setShowValidation(!showValidation)}
          >
            {showValidation ? '隐藏' : '显示'} 验证面板
          </Button>
        </div>

        {showValidation && renderValidationPanel()}
      </Card>

      {/* 模板库 */}
      <Card
        title={<Title level={4} style={{ marginTop: 0 }}>模板库</Title>}
      >
        <Tabs
          items={templateItems}
          defaultActiveKey="skillmd"
        />
      </Card>
    </div>
  );
};

export default SkillEditor;
