import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Segmented, Button, message, Tag, Empty } from 'antd';

/**
 * DesignPreview — renders skill output in three visual modes:
 *   1. markdown  → enhanced Markdown with color/font/spacing visualization
 *   2. figma     → Figma JSON → HTML/CSS renderer (approximate)
 *   3. code      → HTML/JSX/Vue live iframe preview with viewport toggle
 *
 * Props:
 *   output       — raw skill output string
 *   previewType  — 'markdown' | 'figma' | 'code' | null (auto-detect if null)
 *   previewEnv   — { tokenCssUrl, componentJsUrl, fontCssUrl, htmlTemplate }
 */
export default function DesignPreview({ output, previewType, previewEnv }) {
  const [viewMode, setViewMode] = useState('preview');   // 'preview' | 'raw'
  const [viewport, setViewport] = useState('desktop');    // 'desktop' | 'tablet' | 'mobile'

  const detected = useMemo(() => {
    if (previewType) return previewType;
    if (!output) return null;
    const trimmed = output.trim();
    // Try Figma JSON detection
    if (trimmed.startsWith('{') && (trimmed.includes('"type"') && (trimmed.includes('FRAME') || trimmed.includes('TEXT') || trimmed.includes('RECTANGLE')))) {
      return 'figma';
    }
    // Try HTML/JSX detection
    if (trimmed.startsWith('<') || trimmed.includes('export default') || trimmed.includes('function ') || trimmed.includes('const ') || trimmed.includes('import ')) {
      return 'code';
    }
    // Default to markdown
    return 'markdown';
  }, [output, previewType]);

  if (!output) {
    return (
      <div style={{ padding: 30, textAlign: 'center' }}>
        <Empty description="暂无输出内容" imageStyle={{ height: 40 }} />
      </div>
    );
  }

  const viewportWidth = { desktop: '100%', tablet: '768px', mobile: '375px' }[viewport];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #e5e7eb', marginBottom: 10, flexShrink: 0, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Segmented size="small" value={viewMode} onChange={setViewMode} options={[
            { label: '预览', value: 'preview' },
            { label: '原始输出', value: 'raw' },
          ]} />
          {detected && <Tag style={{ fontSize: 10, margin: 0 }}>{detected === 'markdown' ? 'Markdown' : detected === 'figma' ? 'Figma JSON' : 'Code'}</Tag>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {detected === 'code' && viewMode === 'preview' && (
            <Segmented size="small" value={viewport} onChange={setViewport} options={[
              { label: '桌面', value: 'desktop' },
              { label: '平板', value: 'tablet' },
              { label: '手机', value: 'mobile' },
            ]} />
          )}
          <Button size="small" onClick={() => { navigator.clipboard.writeText(output); message.success('已复制'); }}>复制</Button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {viewMode === 'raw' ? (
          <RawView output={output} />
        ) : detected === 'markdown' ? (
          <MarkdownPreview output={output} />
        ) : detected === 'figma' ? (
          <FigmaPreview output={output} />
        ) : detected === 'code' ? (
          <CodePreview output={output} viewportWidth={viewportWidth} previewEnv={previewEnv} />
        ) : (
          <RawView output={output} />
        )}
      </div>
    </div>
  );
}

// ── Raw text view ─────────────────────────────────────────────────────────

function RawView({ output }) {
  return (
    <pre style={{
      background: '#0f172a', color: '#e2e8f0', padding: 14, borderRadius: 8,
      fontSize: 12, lineHeight: 1.6, overflow: 'auto', margin: 0,
      fontFamily: "'Fira Code', 'Courier New', monospace", whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    }}>
      {output}
    </pre>
  );
}

// ── Enhanced Markdown Preview ─────────────────────────────────────────────
// Renders markdown with color swatch / font-size / spacing visualizations

function MarkdownPreview({ output }) {
  const html = useMemo(() => {
    let text = output;
    // Escape HTML
    text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Headings
    text = text.replace(/^### (.+)$/gm, '<h3 style="font-size:15px;font-weight:700;color:#111827;margin:16px 0 8px">$1</h3>');
    text = text.replace(/^## (.+)$/gm, '<h2 style="font-size:17px;font-weight:700;color:#111827;margin:20px 0 10px;border-bottom:1px solid #e5e7eb;padding-bottom:6px">$1</h2>');
    text = text.replace(/^# (.+)$/gm, '<h1 style="font-size:20px;font-weight:800;color:#111827;margin:24px 0 12px">$1</h1>');
    // Bold & italic
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:700">$1</strong>');
    text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Inline code
    text = text.replace(/`([^`]+)`/g, '<code style="background:#f1f5f9;padding:2px 6px;border-radius:3px;font-size:12px;font-family:monospace;color:#374151">$1</code>');
    // Code blocks
    text = text.replace(/```[\w]*\n([\s\S]*?)```/g, '<pre style="background:#0f172a;color:#e2e8f0;padding:12px;border-radius:6px;font-size:12px;font-family:monospace;overflow:auto;white-space:pre-wrap">$1</pre>');
    // Lists
    text = text.replace(/^- (.+)$/gm, '<div style="padding-left:16px;margin:3px 0"><span style="color:#6b7280;margin-right:6px">·</span>$1</div>');
    // Color swatch: detect hex colors like #3B82F6
    text = text.replace(/(#[0-9A-Fa-f]{6})\b/g, (match) => {
      return `<span style="display:inline-flex;align-items:center;gap:4px"><span style="display:inline-block;width:14px;height:14px;background:${match};border-radius:3px;border:1px solid #d1d5db;vertical-align:middle"></span><code style="background:#f1f5f9;padding:1px 4px;border-radius:2px;font-size:11px">${match}</code></span>`;
    });
    // Font-size visualization: detect patterns like font-size: 16px or fontSize: 16
    text = text.replace(/font-size:\s*(\d+)px/gi, (match, size) => {
      return `${match} <span style="font-size:${size}px;color:#374151;background:#f9fafb;padding:2px 8px;border:1px dashed #d1d5db;border-radius:3px;margin-left:6px">Aa</span>`;
    });
    // Spacing visualization: detect spacing: 8px or padding: 12px
    text = text.replace(/(spacing|padding|margin|gap):\s*(\d+)px/gi, (match, prop, size) => {
      const w = Math.min(parseInt(size, 10), 60);
      return `${match} <span style="display:inline-block;width:${w}px;height:10px;background:#dbeafe;border:1px solid #93c5fd;border-radius:2px;vertical-align:middle;margin-left:4px" title="${size}px"></span>`;
    });
    // Border-radius visualization
    text = text.replace(/border-radius:\s*(\d+)px/gi, (match, radius) => {
      return `${match} <span style="display:inline-block;width:24px;height:24px;background:#f3f4f6;border:2px solid #374151;border-radius:${radius}px;vertical-align:middle;margin-left:4px"></span>`;
    });
    // Paragraphs (double newlines)
    text = text.replace(/\n\n/g, '<div style="height:12px"></div>');
    // Single newlines
    text = text.replace(/\n/g, '<br/>');
    return text;
  }, [output]);

  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20,
      fontSize: 13, lineHeight: 1.8, color: '#374151',
    }} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

// ── Figma JSON → HTML/CSS Renderer ────────────────────────────────────────

function FigmaPreview({ output }) {
  const parsed = useMemo(() => {
    try {
      return JSON.parse(output);
    } catch {
      return null;
    }
  }, [output]);

  if (!parsed) {
    return (
      <div style={{ padding: 20 }}>
        <div style={{ fontSize: 12, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: 12, marginBottom: 12 }}>
          JSON 解析失败，无法渲染预览
        </div>
        <RawView output={output} />
      </div>
    );
  }

  return (
    <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20, overflow: 'auto' }}>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12 }}>Figma JSON 近似渲染（精准预览请使用 Figma Plugin）</div>
      <div style={{ position: 'relative', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 4, minHeight: 200, overflow: 'hidden' }}>
        <FigmaNode node={parsed} />
      </div>
    </div>
  );
}

function FigmaNode({ node }) {
  if (!node || typeof node !== 'object') return null;

  const style = {};
  const { type, name, children, absoluteBoundingBox, backgroundColor, fills, cornerRadius, characters, style: textStyle, constraints, layoutMode } = node;

  // Sizing
  if (absoluteBoundingBox) {
    style.width = absoluteBoundingBox.width;
    style.height = absoluteBoundingBox.height;
  }
  if (node.width) style.width = node.width;
  if (node.height) style.height = node.height;

  // Background
  if (fills?.length > 0) {
    const fill = fills[0];
    if (fill.type === 'SOLID' && fill.color) {
      const { r, g, b } = fill.color;
      const a = fill.opacity ?? fill.color.a ?? 1;
      style.backgroundColor = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
    }
  } else if (backgroundColor) {
    const { r, g, b, a } = backgroundColor;
    style.backgroundColor = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a ?? 1})`;
  }

  // Corner radius
  if (cornerRadius) style.borderRadius = cornerRadius;

  // Layout mode (Auto Layout)
  if (layoutMode === 'HORIZONTAL') {
    style.display = 'flex';
    style.flexDirection = 'row';
  } else if (layoutMode === 'VERTICAL') {
    style.display = 'flex';
    style.flexDirection = 'column';
  }
  if (node.itemSpacing) style.gap = node.itemSpacing;
  if (node.paddingLeft) style.paddingLeft = node.paddingLeft;
  if (node.paddingRight) style.paddingRight = node.paddingRight;
  if (node.paddingTop) style.paddingTop = node.paddingTop;
  if (node.paddingBottom) style.paddingBottom = node.paddingBottom;

  // Text node
  if (type === 'TEXT' && characters) {
    if (textStyle) {
      if (textStyle.fontSize) style.fontSize = textStyle.fontSize;
      if (textStyle.fontWeight) style.fontWeight = textStyle.fontWeight;
      if (textStyle.lineHeightPx) style.lineHeight = `${textStyle.lineHeightPx}px`;
      if (textStyle.letterSpacing) style.letterSpacing = textStyle.letterSpacing;
      if (textStyle.textAlignHorizontal) style.textAlign = textStyle.textAlignHorizontal.toLowerCase();
    }
    // Text fill color
    if (fills?.length > 0 && fills[0].type === 'SOLID' && fills[0].color) {
      const { r, g, b } = fills[0].color;
      style.color = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
    }
    return <div style={style} title={name}>{characters}</div>;
  }

  // Frame / other
  return (
    <div style={{ ...style, position: 'relative', boxSizing: 'border-box', overflow: 'hidden' }} title={name ? `${type}: ${name}` : type}>
      {children?.map((child, i) => <FigmaNode key={child.id || i} node={child} />)}
    </div>
  );
}

// ── Code iframe preview (HTML / JSX / Vue) ────────────────────────────────

function CodePreview({ output, viewportWidth, previewEnv }) {
  const iframeRef = useRef(null);
  const [iframeError, setIframeError] = useState('');

  const isJSX = useMemo(() => {
    return output.includes('export default') || output.includes('import ') || (output.includes('return (') && output.includes('/>'));
  }, [output]);

  const isVue = useMemo(() => {
    return output.includes('<template>') && output.includes('<script');
  }, [output]);

  const fullHtml = useMemo(() => {
    const tokenCss = previewEnv?.tokenCssUrl ? `<link rel="stylesheet" href="${previewEnv.tokenCssUrl}">` : '';
    const componentJs = previewEnv?.componentJsUrl ? `<script src="${previewEnv.componentJsUrl}"><\/script>` : '';
    const fontCss = previewEnv?.fontCssUrl ? `<link rel="stylesheet" href="${previewEnv.fontCssUrl}">` : '';

    if (isJSX) {
      // JSX: use Babel standalone + React in iframe
      return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${tokenCss}${fontCss}
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js"><\/script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js"><\/script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.9/babel.min.js"><\/script>
${componentJs}
<style>body{margin:0;padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}</style>
</head><body>
<div id="root"></div>
<script type="text/babel">
${output}

const _exports = typeof App !== 'undefined' ? App : (typeof exports !== 'undefined' && exports.default ? exports.default : null);
if (_exports) {
  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(_exports));
} else {
  document.getElementById('root').innerHTML = '<div style="color:#b91c1c">未找到可渲染的组件（需要 export default 或 App 组件）</div>';
}
<\/script>
</body></html>`;
    }

    if (isVue) {
      return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${tokenCss}${fontCss}
<script src="https://cdnjs.cloudflare.com/ajax/libs/vue/3.3.4/vue.global.prod.min.js"><\/script>
${componentJs}
<style>body{margin:0;padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}</style>
</head><body>
<div id="app">${output}</div>
<script>Vue.createApp({}).mount('#app')<\/script>
</body></html>`;
    }

    // Plain HTML
    if (previewEnv?.htmlTemplate) {
      return previewEnv.htmlTemplate.replace('{{OUTPUT}}', output);
    }

    return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${tokenCss}${fontCss}${componentJs}
<style>body{margin:0;padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}</style>
</head><body>
${output}
</body></html>`;
  }, [output, isJSX, isVue, previewEnv]);

  return (
    <div style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'center', padding: 12, background: '#f3f4f6' }}>
        <div style={{
          width: viewportWidth, maxWidth: '100%', background: '#fff',
          border: '1px solid #d1d5db', borderRadius: 6, overflow: 'hidden',
          transition: 'width 0.3s ease',
        }}>
          <iframe
            ref={iframeRef}
            srcDoc={fullHtml}
            sandbox="allow-scripts"
            style={{ width: '100%', height: 500, border: 'none', display: 'block' }}
            title="代码预览"
            onError={() => setIframeError('iframe 渲染失败')}
          />
        </div>
      </div>
      {iframeError && <div style={{ padding: 8, fontSize: 11, color: '#b91c1c', background: '#fef2f2' }}>{iframeError}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderTop: '1px solid #e5e7eb', background: '#fafafa' }}>
        <span style={{ fontSize: 11, color: '#6b7280' }}>
          {isJSX ? 'React JSX (Babel 编译)' : isVue ? 'Vue SFC' : 'HTML'} · 视口 {viewportWidth}
        </span>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>
          {previewEnv?.tokenCssUrl ? '已注入 Design Token' : '未配置 Design Token（配置中心可设置）'}
        </span>
      </div>
    </div>
  );
}
