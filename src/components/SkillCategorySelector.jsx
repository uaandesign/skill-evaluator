import React from 'react';
import { Radio, Tooltip } from 'antd';
import { SKILL_CATEGORIES } from '../specializedRules';

/**
 * Skill Category Selector Component
 * 技能类别选择器 — 用于定义技能类型，便于进行专项评估
 */
export default function SkillCategorySelector({ value, onChange }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 10 }}>
        技能类别 （可选，用于精准的专项评估）
      </label>
      <div style={{ background: '#f9fafb', padding: 12, borderRadius: 6, border: '1px solid #e5e7eb' }}>
        <Radio.Group value={value} onChange={(e) => onChange(e.target.value)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Radio key="none" value={null} style={{ fontSize: 12, color: '#374151' }}>
            不指定 （仅执行通用评估）
          </Radio>
          {SKILL_CATEGORIES.map((cat) => (
            <Tooltip key={cat.id} title={cat.description} placement="right">
              <Radio value={cat.id} style={{ fontSize: 12, color: '#374151', cursor: 'help' }}>
                <span style={{ fontWeight: 500 }}>{cat.label}</span>
                <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8 }}>— {cat.description}</span>
              </Radio>
            </Tooltip>
          ))}
        </Radio.Group>
      </div>
      {value && (
        <div style={{ fontSize: 11, color: '#059669', marginTop: 8, padding: 8, background: '#ecfdf5', borderRadius: 4, border: '1px solid #a7f3d0' }}>
          ✓ 已选择「{SKILL_CATEGORIES.find((c) => c.id === value)?.label}」，评估将包含通用评估（60%）+ 专项评估（40%）
        </div>
      )}
    </div>
  );
}
