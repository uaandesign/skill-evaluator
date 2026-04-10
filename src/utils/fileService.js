/**
 * fileService.js — Centralized file parsing & document fetching service.
 *
 * All modules (CompareTest, SkillEditor, etc.) consume this service
 * instead of implementing their own parsing logic.
 *
 * Reads configuration from the Zustand store's `capabilities` section
 * so that PDF engine settings, Feishu auth, text limits, etc. are
 * configured once in the ConfigCenter and applied everywhere.
 */

import { useStore } from '../store';

const API_BASE_URL = import.meta.env?.VITE_API_URL || '';

/* ============================================
   Internal helpers
   ============================================ */

function getCapabilities() {
  return useStore.getState().capabilities;
}

/* ============================================
   PDF Extraction
   ============================================ */

export async function extractPdfText(file) {
  const caps = getCapabilities();
  if (!caps.pdf.enabled) {
    return `[PDF 解析已禁用，请在配置中心启用 PDF 引擎]`;
  }

  const maxChars = caps.pdf.maxChars || 80000;
  const endpoint = caps.pdf.engine === 'custom' && caps.pdf.customEndpoint
    ? caps.pdf.customEndpoint
    : `${API_BASE_URL}/api/parse-pdf`;

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const bytes = new Uint8Array(e.target.result);
        let base64Data = '';
        const chunk = 8192;
        for (let i = 0; i < bytes.length; i += chunk) {
          base64Data += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        base64Data = btoa(base64Data);

        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64Data, filename: file.name, maxChars }),
        });
        if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
        const data = await resp.json();
        resolve(data.text || `[PDF: ${file.name} — 未提取到文本内容]`);
      } catch (err) {
        resolve(`[PDF: ${file.name} — 解析失败: ${err.message}]`);
      }
    };
    reader.onerror = () => resolve(`[PDF: ${file.name} — 文件读取失败]`);
    reader.readAsArrayBuffer(file);
  });
}

/* ============================================
   Text File Reading (TXT / MD / CSV / JSON / YAML)
   ============================================ */

export function readTextFile(file) {
  const caps = getCapabilities();
  if (!caps.textFiles.enabled) {
    return Promise.resolve(`[文本文件解析已禁用，请在配置中心启用]`);
  }

  const maxChars = caps.textFiles.maxChars || 50000;

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      let content = e.target.result;
      if (content.length > maxChars) {
        content = content.substring(0, maxChars) + `\n\n... [已截断，原始长度: ${e.target.result.length} 字符]`;
      }
      resolve(content);
    };
    reader.onerror = () => resolve(`[文件 ${file.name} 读取失败]`);
    reader.readAsText(file);
  });
}

/* ============================================
   Unified File Upload Handler
   Returns: { id, name, content, type, ext, loading? }
   ============================================ */

export async function parseUploadedFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const fileId = `f_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

  if (ext === 'pdf') {
    const text = await extractPdfText(file);
    return { id: fileId, name: file.name, content: text, type: 'file', ext };
  }

  // Text-based
  const content = await readTextFile(file);
  return { id: fileId, name: file.name, content, type: 'file', ext };
}

/* ============================================
   Document / Link Fetching (Feishu + generic URLs)
   ============================================ */

export async function fetchDocumentContent(url) {
  const caps = getCapabilities();

  // Determine if Feishu URL
  const isFeishu = /feishu\.cn|larksuite\.com|lark\.suite|bytedance\.feishu|bytedance\.lark/.test(url);

  // If Feishu and token-based auth is configured, pass it through
  const body = { url };
  if (isFeishu && caps.feishu.enabled) {
    if (caps.feishu.authMode === 'token' && caps.feishu.tenantToken) {
      body.tenantToken = caps.feishu.tenantToken;
    }
    if (caps.feishu.appId) body.appId = caps.feishu.appId;
    if (caps.feishu.appSecret) body.appSecret = caps.feishu.appSecret;
  }

  if (!caps.linkFetch.enabled && !isFeishu) {
    return { text: `[外部链接拉取已禁用，请在配置中心启用]`, success: false };
  }
  if (isFeishu && !caps.feishu.enabled) {
    return { text: `[飞书集成未启用，请在配置中心开启飞书能力并配置授权]`, success: false };
  }

  try {
    const resp = await fetch(`${API_BASE_URL}/api/feishu/fetch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
    const data = await resp.json();
    return { text: data.text, success: data.success };
  } catch (err) {
    return { text: `[文档拉取失败: ${err.message}]`, success: false };
  }
}

/* ============================================
   Capability Status Check — for UI indicators
   ============================================ */

export function getCapabilityStatus() {
  const caps = getCapabilities();
  return {
    pdf: caps.pdf.enabled,
    textFiles: caps.textFiles.enabled,
    feishu: caps.feishu.enabled,
    linkFetch: caps.linkFetch.enabled,
    feishuAuthMode: caps.feishu.authMode,
    feishuHasToken: !!(caps.feishu.tenantToken || caps.feishu.appId),
  };
}
