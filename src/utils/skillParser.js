export function parseSkill(content, format = 'auto') {
  let detectedFormat = format;

  if (format === 'auto') {
    detectedFormat = detectFormat(content);
  }

  let parsed = null;
  let errors = [];
  let warnings = [];
  let valid = false;

  switch (detectedFormat) {
    case 'skill_md':
      const mdResult = validateSkillMd(content);
      parsed = mdResult.parsed;
      errors = mdResult.errors;
      warnings = mdResult.warnings;
      valid = mdResult.valid;
      break;
    case 'function_call':
      const fcResult = validateFunctionCall(content);
      parsed = fcResult.parsed;
      errors = fcResult.errors;
      warnings = fcResult.warnings;
      valid = fcResult.valid;
      break;
    case 'prompt_template':
      const ptResult = validatePromptTemplate(content);
      parsed = ptResult.parsed;
      errors = ptResult.errors;
      warnings = ptResult.warnings;
      valid = ptResult.valid;
      break;
    default:
      errors.push('Unknown skill format');
      detectedFormat = 'unknown';
  }

  return {
    format: detectedFormat,
    parsed,
    errors,
    warnings,
    valid
  };
}

export function detectFormat(content) {
  const trimmed = content.trim();

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const json = JSON.parse(trimmed);
      if (json.type === 'function' || (json.name && json.parameters)) {
        return 'function_call';
      }
    } catch (e) {
      // Not valid JSON
    }
  }

  if (trimmed.startsWith('---')) {
    const parts = trimmed.split('---');
    if (parts.length >= 3) {
      try {
        const frontmatter = parts[1];
        if (frontmatter.includes('name:') || frontmatter.includes('description:')) {
          return 'skill_md';
        }
      } catch (e) {
        // Continue to next check
      }
    }
  }

  if (content.includes('{{') || content.includes('{%')) {
    return 'prompt_template';
  }

  if (content.includes('$') && content.match(/\$\{[^}]+\}/)) {
    return 'prompt_template';
  }

  if (content.match(/^#+\s+/m) && content.length > 50) {
    return 'skill_md';
  }

  return 'unknown';
}

export function validateSkillMd(content) {
  const errors = [];
  const warnings = [];
  let parsed = null;

  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!frontmatterMatch) {
    errors.push('Missing YAML frontmatter (must be wrapped in --- delimiters)');
    return { valid: false, errors, warnings, parsed };
  }

  const [, frontmatterStr, body] = frontmatterMatch;

  const frontmatter = {};
  const frontmatterLines = frontmatterStr.split('\n');

  for (const line of frontmatterLines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.substring(0, colonIdx).trim();
    const value = line.substring(colonIdx + 1).trim();
    frontmatter[key] = value;
  }

  const requiredFields = ['name', 'description'];
  for (const field of requiredFields) {
    if (!frontmatter[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  const recommendedFields = ['triggers', 'instructions', 'category'];
  for (const field of recommendedFields) {
    if (!frontmatter[field]) {
      warnings.push(`Missing recommended field: ${field}`);
    }
  }

  if (!body || body.trim().length === 0) {
    warnings.push('Skill body/instructions section is empty or missing');
  }

  if (body && !body.match(/^#+\s+/m)) {
    warnings.push('Skill body should contain markdown headers for organization');
  }

  parsed = {
    type: 'skill_md',
    frontmatter,
    body,
    hasStructure: !!frontmatterMatch,
    bodyLength: body ? body.length : 0,
    bodyWordCount: body ? body.split(/\s+/).length : 0
  };

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    parsed
  };
}

export function validateFunctionCall(content) {
  const errors = [];
  const warnings = [];
  let parsed = null;

  let json = null;
  try {
    json = JSON.parse(content);
  } catch (e) {
    errors.push(`Invalid JSON: ${e.message}`);
    return { valid: false, errors, warnings, parsed };
  }

  if (!json.name) {
    errors.push('Missing required field: name');
  }

  if (!json.description) {
    errors.push('Missing required field: description');
  }

  if (json.type !== 'function' && !json.parameters) {
    if (!json.type) {
      warnings.push('Missing type field (should be "function" for OpenAI compatibility)');
    }
  }

  if (json.parameters) {
    if (!json.parameters.type) {
      warnings.push('Parameters missing type field (should be "object")');
    }
    if (!json.parameters.properties) {
      warnings.push('Parameters missing properties object');
    }
  }

  if (json.name && !/^[a-z_][a-z0-9_]*$/.test(json.name)) {
    warnings.push('Function name should follow naming convention: lowercase with underscores');
  }

  if (json.description && json.description.length < 10) {
    warnings.push('Description is very brief, consider adding more detail');
  }

  parsed = {
    type: 'function_call',
    name: json.name || null,
    description: json.description || null,
    parameters: json.parameters || null,
    required: json.required || [],
    hasValidSchema: !!(json.parameters && json.parameters.type && json.parameters.properties)
  };

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    parsed
  };
}

export function validatePromptTemplate(content) {
  const errors = [];
  const warnings = [];
  let parsed = null;

  const hasSystemPrompt = content.match(/system|prompt|instruction/i);
  if (!hasSystemPrompt) {
    warnings.push('No system prompt or instruction section detected');
  }

  const placeholderMatches = content.match(/\{\{([^}]+)\}\}|\$\{([^}]+)\}|<([A-Z_]+)>/g) || [];
  const variables = placeholderMatches.map(match => {
    return match.replace(/[{}$<>]/g, '').trim();
  });

  if (variables.length === 0) {
    warnings.push('No template variables found - this may not be a dynamic template');
  }

  const lines = content.split('\n');
  if (lines.length < 3) {
    warnings.push('Template is very short - ensure it contains adequate instruction');
  }

  const wordCount = content.split(/\s+/).length;
  if (wordCount < 20) {
    errors.push('Template content is too brief to be a complete skill');
  }

  parsed = {
    type: 'prompt_template',
    hasSystemPrompt: !!hasSystemPrompt,
    variables,
    lineCount: lines.length,
    wordCount,
    complexity: variables.length > 3 ? 'high' : variables.length > 0 ? 'medium' : 'low'
  };

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    parsed
  };
}

export function convertSkillFormat(content, fromFormat, toFormat) {
  const parseResult = parseSkill(content, fromFormat);

  if (!parseResult.valid) {
    return {
      success: false,
      errors: parseResult.errors,
      converted: null
    };
  }

  const { parsed } = parseResult;
  let converted = null;

  if (fromFormat === 'skill_md' && toFormat === 'function_call') {
    converted = {
      type: 'function',
      name: parsed.frontmatter.name?.toLowerCase().replace(/\s+/g, '_') || 'skill',
      description: parsed.frontmatter.description || '',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    };

    if (parsed.frontmatter.inputs) {
      const inputs = parsed.frontmatter.inputs.split(',').map(s => s.trim());
      for (const input of inputs) {
        converted.parameters.properties[input] = {
          type: 'string',
          description: `Input: ${input}`
        };
        converted.parameters.required.push(input);
      }
    }
  }

  if (fromFormat === 'function_call' && toFormat === 'skill_md') {
    const triggers = parsed.name || 'skill';
    const frontmatter = `name: ${parsed.name || 'Unnamed Skill'}
description: ${parsed.description || ''}
triggers: ${triggers}
category: conversion
instructions: Generated from function call format`;

    const paramsList = parsed.parameters && parsed.parameters.properties
      ? Object.keys(parsed.parameters.properties).join(', ')
      : '';

    const body = `## Overview
Generated from function call format.

## Parameters
${paramsList || 'None'}

## Usage
This skill was converted from a function call definition.`;

    converted = `---
${frontmatter}
---

${body}`;
  }

  if (fromFormat === 'prompt_template' && toFormat === 'skill_md') {
    const vars = parsed.variables.join(', ') || 'none';
    const frontmatter = `name: Converted Template Skill
description: Skill converted from prompt template
triggers: convert
category: template
variables: ${vars}`;

    const body = `## Template
\`\`\`
${content}
\`\`\`

## Variables
${parsed.variables.map(v => `- ${v}`).join('\n') || 'None'}`;

    converted = `---
${frontmatter}
---

${body}`;
  }

  if (!converted) {
    return {
      success: false,
      errors: [`Conversion from ${fromFormat} to ${toFormat} is not supported`],
      converted: null
    };
  }

  return {
    success: true,
    errors: [],
    converted
  };
}
