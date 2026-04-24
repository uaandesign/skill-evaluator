import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import https from 'https';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { inflateSync, gunzipSync } from 'zlib';

/**
 * 本地开发环境 HTTPS Agent：跳过 SSL 证书验证。
 * 仅用于 node-fetch 的 agent 参数，不影响生产环境（Vercel 使用原生 fetch）。
 * 解决国内 API（Qwen/Doubao 等）在 Mac 本地出现 "unable to get local issuer certificate" 的问题。
 */
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3001;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(cors());

// Serve production build
app.use(express.static(join(__dirname, 'dist')));

/**
 * POST /api/parse-pdf
 * Extract text from a PDF file sent as base64
 * Uses a lightweight pure-JS PDF text extractor (no external dependencies)
 */
app.post('/api/parse-pdf', async (req, res) => {
  try {
    const { base64Data, filename } = req.body;
    if (!base64Data) {
      return res.status(400).json({ error: 'Missing base64Data field' });
    }

    const buffer = Buffer.from(base64Data, 'base64');
    const text = extractTextFromPdfBuffer(buffer);

    if (!text || text.trim().length === 0) {
      return res.json({
        filename,
        text: `[PDF file: ${filename} — could not extract text. The PDF may contain only images or scanned content.]`,
        charCount: 0,
        warning: 'No extractable text found',
      });
    }

    // Truncate if too large
    const MAX_CHARS = 80000;
    const truncated = text.length > MAX_CHARS;
    const finalText = truncated ? text.substring(0, MAX_CHARS) + `\n\n... [truncated, original: ${text.length} chars]` : text;

    res.json({
      filename,
      text: finalText,
      charCount: text.length,
      truncated,
    });
  } catch (error) {
    console.error('PDF parse error:', error.message);
    res.status(500).json({ error: 'Failed to parse PDF', details: error.message });
  }
});

/**
 * Lightweight PDF text extraction from raw buffer
 * Handles most text-based PDFs by extracting text stream objects
 */
/**
 * Extract text from raw PDF buffer.
 * Supports:
 *   1. Uncompressed BT/ET streams (old PDFs)
 *   2. FlateDecode (zlib) compressed streams (modern PDFs) ← NEW
 *   3. Multiple passes to gather as much text as possible
 */
function extractTextFromPdfBuffer(buffer) {
  const allParts = [];

  // --- Pass 1: Decompress FlateDecode streams and extract BT/ET text ---
  try {
    const raw = buffer.toString('binary');
    // Iterate over all "stream ... endstream" blocks
    // The dict before the stream keyword tells us the filter used
    let searchFrom = 0;
    while (searchFrom < raw.length) {
      const streamKeyword = raw.indexOf('stream', searchFrom);
      if (streamKeyword === -1) break;

      // Confirm it's a real stream keyword (followed by \r\n or \n)
      const afterKeyword = raw.charCodeAt(streamKeyword + 6);
      if (afterKeyword !== 10 && afterKeyword !== 13) {
        searchFrom = streamKeyword + 1;
        continue;
      }

      // Find the enclosing dictionary (search backwards for <<)
      const dictStart = raw.lastIndexOf('<<', streamKeyword);
      const dictContent = dictStart !== -1 ? raw.substring(dictStart, streamKeyword) : '';
      const isFlateDecode = /\/FlateDecode|\/Fl(?:\s|\/|>)/.test(dictContent);

      // Find start of actual data (after \r\n or \n)
      let dataStart = streamKeyword + 6;
      if (raw.charCodeAt(dataStart) === 13) dataStart++; // \r
      if (raw.charCodeAt(dataStart) === 10) dataStart++; // \n

      // Find "endstream"
      const endIdx = raw.indexOf('endstream', dataStart);
      if (endIdx === -1) { searchFrom = dataStart; continue; }

      // Extract Length hint from dict (may not be present)
      const lenMatch = dictContent.match(/\/Length\s+(\d+)/);
      const dataEnd = lenMatch ? Math.min(dataStart + parseInt(lenMatch[1]), endIdx) : endIdx;

      // Extract stream bytes
      const streamBuf = Buffer.from(raw.substring(dataStart, dataEnd), 'binary');

      let contentStr = '';
      if (isFlateDecode && streamBuf.length > 0) {
        try {
          contentStr = inflateSync(streamBuf).toString('latin1');
        } catch {
          try { contentStr = gunzipSync(streamBuf).toString('latin1'); } catch { /* skip */ }
        }
      } else {
        contentStr = streamBuf.toString('latin1');
      }

      if (contentStr) extractBtEtText(contentStr, allParts);
      searchFrom = endIdx + 9; // skip past "endstream"
    }
  } catch { /* fall through to other strategies */ }

  // --- Pass 2: Direct BT/ET on the raw buffer (for uncompressed PDFs) ---
  if (allParts.length < 10) {
    const raw = buffer.toString('latin1');
    extractBtEtText(raw, allParts);
  }

  // --- Pass 3: Last resort — printable string sequences >=4 chars ---
  if (allParts.length === 0) {
    const raw = buffer.toString('latin1');
    const fallback = /\(([^\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\xff]{4,})\)/g;
    let m;
    while ((m = fallback.exec(raw)) !== null) {
      const decoded = decodePdfString(m[1]);
      if (decoded.length > 3 && !/^[\d\s.]+$/.test(decoded)) allParts.push(decoded);
    }
  }

  return allParts.join(' ').replace(/\s+/g, ' ').trim();
}

/** Extract text from BT...ET blocks within a PDF content stream */
function extractBtEtText(content, out) {
  const btEt = /BT\s([\s\S]*?)ET/g;
  let block;
  while ((block = btEt.exec(content)) !== null) {
    const b = block[1];
    // Tj operator
    const tj = /\(([^)]*)\)\s*Tj/g;
    let m;
    while ((m = tj.exec(b)) !== null) out.push(decodePdfString(m[1]));
    // TJ array operator
    const tjArr = /\[([\s\S]*?)\]\s*TJ/g;
    while ((m = tjArr.exec(b)) !== null) {
      const inner = /\(([^)]*)\)/g;
      let s;
      while ((s = inner.exec(m[1])) !== null) out.push(decodePdfString(s[1]));
    }
  }
}

function decodePdfString(str) {
  return str
    .replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\');
}

/**
 * Extract text content from DOCX (Word) file buffer.
 * DOCX is a ZIP archive; we parse it natively using Node.js zlib.
 */
async function extractTextFromDocxBuffer(buffer) {
  const { inflateRaw } = await import('zlib');
  const { promisify } = await import('util');
  const inflateRawAsync = promisify(inflateRaw);

  // Parse ZIP central directory
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer[i] === 0x50 && buffer[i+1] === 0x4B && buffer[i+2] === 0x05 && buffer[i+3] === 0x06) {
      eocdOffset = i; break;
    }
  }
  if (eocdOffset === -1) throw new Error('不是有效的 ZIP/DOCX 文件');

  const cdEntries = buffer.readUInt16LE(eocdOffset + 8);
  const cdOffset  = buffer.readUInt32LE(eocdOffset + 16);

  let pos = cdOffset;
  for (let i = 0; i < cdEntries; i++) {
    if (buffer.readUInt32LE(pos) !== 0x02014B50) break;
    const compression    = buffer.readUInt16LE(pos + 10);
    const compressedSize = buffer.readUInt32LE(pos + 20);
    const filenameLen    = buffer.readUInt16LE(pos + 28);
    const extraLen       = buffer.readUInt16LE(pos + 30);
    const commentLen     = buffer.readUInt16LE(pos + 32);
    const localOffset    = buffer.readUInt32LE(pos + 42);
    const filename       = buffer.slice(pos + 46, pos + 46 + filenameLen).toString('utf8');

    if (filename === 'word/document.xml') {
      const lfnLen   = buffer.readUInt16LE(localOffset + 26);
      const lextraLen= buffer.readUInt16LE(localOffset + 28);
      const dataStart= localOffset + 30 + lfnLen + lextraLen;
      const compData = buffer.slice(dataStart, dataStart + compressedSize);

      let xml;
      if (compression === 0) {
        xml = compData.toString('utf8');
      } else if (compression === 8) {
        xml = (await inflateRawAsync(compData)).toString('utf8');
      } else {
        throw new Error(`不支持的 ZIP 压缩方式: ${compression}`);
      }

      return xml
        .replace(/<w:br[^>]*>/gi, '\n')
        .replace(/<\/w:p>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&apos;/g, "'").replace(/&quot;/g, '"')
        .replace(/\n{3,}/g, '\n\n').trim();
    }
    pos += 46 + filenameLen + extraLen + commentLen;
  }
  throw new Error('DOCX 文件中未找到 word/document.xml');
}

/**
 * POST /api/extract-text
 * Universal document text extractor.
 * Accepts { filename, data: base64 } and returns { text, chars }.
 * Supports: .txt .md .markdown .pdf .doc .docx
 */
app.post('/api/extract-text', async (req, res) => {
  try {
    const { filename = 'file', data } = req.body;
    if (!data) return res.status(400).json({ error: '缺少 data (base64) 字段' });

    const buffer = Buffer.from(data, 'base64');
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const MAX_CHARS = 100000;
    let text = '';

    if (ext === 'txt' || ext === 'md' || ext === 'markdown') {
      text = buffer.toString('utf-8');
    } else if (ext === 'pdf') {
      text = extractTextFromPdfBuffer(buffer);
      if (!text || text.trim().length < 10) {
        text = `[PDF「${filename}」无法提取文字，可能是扫描件或图片 PDF]`;
      }
    } else if (ext === 'docx' || ext === 'doc') {
      text = await extractTextFromDocxBuffer(buffer);
    } else {
      text = buffer.toString('utf-8');
    }

    const truncated = text.length > MAX_CHARS;
    const finalText = truncated ? text.slice(0, MAX_CHARS) + `\n\n[已截断，原文 ${text.length} 字符]` : text;
    res.json({ text: finalText, chars: text.length, truncated, filename });
  } catch (err) {
    console.error('[extract-text]', err.message);
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/feishu/fetch
 * Proxy fetch for Feishu document content
 * Attempts to fetch publicly accessible Feishu document content
 */
app.post('/api/feishu/fetch', async (req, res) => {
  try {
    const { url, tenantToken, appId, appSecret } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'Missing url field' });
    }

    // Validate Feishu URL patterns
    const feishuPatterns = [
      /feishu\.cn/,
      /larksuite\.com/,
      /lark\.suite/,
      /bytedance\.feishu/,
      /bytedance\.lark/,
    ];
    const isFeishuUrl = feishuPatterns.some((p) => p.test(url));

    // If we have Feishu API credentials, try the Open API first
    if (isFeishuUrl && (tenantToken || (appId && appSecret))) {
      try {
        let token = tenantToken;
        // Auto-fetch tenant_access_token if we have app credentials but no token
        if (!token && appId && appSecret) {
          const tokenResp = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
          });
          if (tokenResp.ok) {
            const tokenData = await tokenResp.json();
            token = tokenData.tenant_access_token;
          }
        }

        if (token) {
          // Extract document token from URL
          const docTokenMatch = url.match(/\/(docx|wiki|sheets|bitable|mindnotes|file)\/([A-Za-z0-9]+)/);
          if (docTokenMatch) {
            const [, docType, docToken] = docTokenMatch;
            let apiUrl = '';
            if (docType === 'docx') {
              apiUrl = `https://open.feishu.cn/open-apis/docx/v1/documents/${docToken}/raw_content`;
            } else if (docType === 'wiki') {
              apiUrl = `https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node?token=${docToken}`;
            }
            if (apiUrl) {
              const docResp = await fetch(apiUrl, {
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
              });
              if (docResp.ok) {
                const docData = await docResp.json();
                const content = docData.data?.content || JSON.stringify(docData.data, null, 2);
                const MAX = 50000;
                const text = content.length > MAX ? content.substring(0, MAX) + '\n...[truncated]' : content;
                return res.json({ url, text, success: true, charCount: text.length, authMode: 'token' });
              }
            }
          }
        }
      } catch (apiErr) {
        console.log('Feishu API auth attempt failed, falling back to public fetch:', apiErr.message);
      }
    }

    if (!isFeishuUrl) {
      // Try generic URL fetch for non-Feishu links
      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SkillEvaluator/1.0)' },
          redirect: 'follow',
          timeout: 15000,
        });
        if (!response.ok) {
          return res.json({
            url,
            text: `[External link: ${url} — HTTP ${response.status}, could not fetch content]`,
            success: false,
          });
        }
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('text/html') || contentType.includes('text/plain') || contentType.includes('application/json')) {
          let text = await response.text();
          // Strip HTML tags for HTML content
          if (contentType.includes('text/html')) {
            text = text.replace(/<script[\s\S]*?<\/script>/gi, '')
              .replace(/<style[\s\S]*?<\/style>/gi, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/&nbsp;/g, ' ')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/\s{2,}/g, ' ')
              .trim();
          }
          const MAX = 50000;
          if (text.length > MAX) text = text.substring(0, MAX) + '\n...[truncated]';
          return res.json({ url, text, success: true, charCount: text.length });
        }
        return res.json({ url, text: `[Link: ${url} — content type ${contentType} not supported for text extraction]`, success: false });
      } catch (fetchErr) {
        return res.json({ url, text: `[External link: ${url} — fetch failed: ${fetchErr.message}]`, success: false });
      }
    }

    // For Feishu URLs, attempt to fetch the page and extract content
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'follow',
        timeout: 15000,
      });

      if (!response.ok) {
        return res.json({
          url,
          text: `[飞书文档: ${url} — HTTP ${response.status}，需要登录或权限不足。建议: 1) 确保文档设置为"互联网可访问" 2) 或安装飞书 CLI 并配置 token]`,
          success: false,
        });
      }

      let html = await response.text();
      // Extract meaningful text from Feishu HTML
      let text = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s{2,}/g, ' ')
        .trim();

      const MAX = 50000;
      if (text.length > MAX) text = text.substring(0, MAX) + '\n...[truncated]';

      if (text.length < 50) {
        return res.json({
          url,
          text: `[飞书文档: ${url} — 无法提取有效内容（可能需要登录）。建议将文档权限设为"互联网可访问"或使用飞书 CLI]`,
          success: false,
        });
      }

      res.json({ url, text, success: true, charCount: text.length });
    } catch (fetchErr) {
      res.json({
        url,
        text: `[飞书文档: ${url} — 拉取失败: ${fetchErr.message}。建议检查网络或使用飞书 CLI]`,
        success: false,
      });
    }
  } catch (error) {
    console.error('Feishu fetch error:', error.message);
    res.status(500).json({ error: 'Failed to fetch document', details: error.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', port: PORT });
});

/**
 * POST /api/chat
 * Unified chat endpoint that routes to OpenAI, Anthropic, Doubao, Qwen, or Gemini
 */
app.post('/api/chat', async (req, res) => {
  try {
    const { provider, apiKey, model, messages, systemPrompt, tools, baseUrl } = req.body;

    // Validate required fields
    if (!provider || !apiKey || !model || !messages) {
      return res.status(400).json({
        error: 'Missing required fields: provider, apiKey, model, messages',
      });
    }

    // All supported providers
    const CHAT_PROVIDER_DEFAULTS = {
      openai:   'https://api.openai.com/v1',
      doubao:   'https://ark.cn-beijing.volces.com/api/v3',
      qwen:     'https://dashscope.aliyuncs.com/compatible-mode/v1',
      deepseek: 'https://api.deepseek.com/v1',
      xai:      'https://api.x.ai/v1',
      mistral:  'https://api.mistral.ai/v1',
      groq:     'https://api.groq.com/openai/v1',
      nvidia:   'https://integrate.api.nvidia.com/v1',
      moonshot: 'https://api.moonshot.cn/v1',
      zhipu:    'https://open.bigmodel.cn/api/paas/v4',
      minimax:  'https://api.minimax.chat/v1',
      venice:   'https://api.venice.ai/api/v1',
      bedrock:  'https://bedrock-runtime.us-east-1.amazonaws.com/v1',
    };
    const ALL_PROVIDERS = ['anthropic', 'gemini', ...Object.keys(CHAT_PROVIDER_DEFAULTS)];

    if (!ALL_PROVIDERS.includes(provider)) {
      return res.status(400).json({
        error: `Invalid provider. Must be one of: ${ALL_PROVIDERS.join(', ')}`,
      });
    }

    let response;

    if (provider === 'anthropic') {
      response = await callAnthropic(apiKey, model, messages, systemPrompt, tools);
    } else if (provider === 'gemini') {
      response = await callGemini(apiKey, model, messages, systemPrompt, tools);
    } else {
      // All other providers use OpenAI-compatible API
      const resolvedBaseUrl = baseUrl || CHAT_PROVIDER_DEFAULTS[provider];
      response = await callOpenAI(apiKey, model, messages, systemPrompt, tools, resolvedBaseUrl);
    }

    res.json(response);
  } catch (error) {
    console.error('Chat endpoint error:', error.message);
    // Try to extract a meaningful HTTP status from the thrown error message
    // Pattern: "Xxx API error (NNN): ..."
    const statusMatch = error.message.match(/\((\d{3})\)/);
    const upstreamStatus = statusMatch ? parseInt(statusMatch[1]) : null;
    // 401/403 → forward as 401; 404 → 404; 429 → 429; others → 502 (bad gateway)
    let httpStatus = 502;
    if (upstreamStatus === 401 || upstreamStatus === 403) httpStatus = 401;
    else if (upstreamStatus === 404) httpStatus = 404;
    else if (upstreamStatus === 429) httpStatus = 429;
    else if (upstreamStatus === 400) httpStatus = 400;

    res.status(httpStatus).json({
      error: '模型调用失败',
      details: error.message,
      provider: req.body?.provider,
      model: req.body?.model,
    });
  }
});

/**
 * Resolve CLI binary — tries several candidate names/paths in order.
 * Returns { bin, name } or null if none found.
 */
async function resolveFeishuCli() {
  // Add common npm global paths explicitly so they work even if PATH is limited
  const { stdout: npmPrefix } = await execFileAsync('npm', ['root', '-g'], { timeout: 5000 })
    .catch(() => ({ stdout: '' }));
  const npmBin = npmPrefix.trim() ? npmPrefix.trim().replace(/node_modules$/, '.bin') : '';

  const candidates = [
    // User-supplied path from env (set NODE_FEISHU_CLI=/path/to/bin)
    ...(process.env.NODE_FEISHU_CLI ? [{ bin: process.env.NODE_FEISHU_CLI, name: 'custom' }] : []),
    { bin: 'lark-cli', name: 'lark-cli' },
    { bin: 'feishu-cli', name: 'feishu-cli' },
    ...(npmBin ? [
      { bin: `${npmBin}/lark-cli`, name: 'lark-cli (npm global)' },
      { bin: `${npmBin}/feishu-cli`, name: 'feishu-cli (npm global)' },
    ] : []),
    { bin: `${process.env.HOME}/.npm-global/bin/lark-cli`, name: 'lark-cli (~/.npm-global)' },
    { bin: '/usr/local/bin/lark-cli', name: 'lark-cli (/usr/local)' },
    { bin: '/opt/homebrew/bin/lark-cli', name: 'lark-cli (homebrew)' },
  ];

  for (const c of candidates) {
    try {
      const { stdout } = await execFileAsync(c.bin, ['--version'], { timeout: 4000 });
      if (stdout) return { bin: c.bin, name: c.name, version: stdout.trim() };
    } catch { /* not found, try next */ }
  }
  return null;
}

/**
 * POST /api/feishu/cli/test
 * Detect whether feishu/lark CLI is installed and authenticated.
 */
app.post('/api/feishu/cli/test', async (req, res) => {
  try {
    const cli = await resolveFeishuCli();

    if (!cli) {
      return res.json({
        installed: false,
        authenticated: false,
        message: [
          'CLI 工具未找到，请在运行 node server.js 的机器（Mac）上安装以下任一工具：',
          '',
          '方式一（官方飞书 CLI）:',
          '  npm install -g @feishu/feishu-cli',
          '  feishu-cli login',
          '',
          '方式二（Claude Code Lark CLI）:',
          '  npm install -g @anthropic-ai/lark-cli',
          '  lark-cli auth login',
          '',
          '安装后重启 server.js，再点击「检测 CLI 状态」。',
          '也可设置环境变量: export NODE_FEISHU_CLI=/path/to/your/cli',
        ].join('\n'),
      });
    }

    // Verify authentication by listing docs
    const { stdout: docList, stderr } = await execFileAsync(cli.bin, ['doc', 'list', '--limit', '1'], { timeout: 12000 })
      .catch((err) => ({ stdout: '', stderr: err.message || err.stderr || '' }));

    if (docList && docList.trim()) {
      return res.json({
        installed: true, authenticated: true,
        version: cli.version, bin: cli.name,
        message: `✓ ${cli.name} 已安装且鉴权成功 (${cli.version})`,
      });
    }

    return res.json({
      installed: true, authenticated: false,
      version: cli.version, bin: cli.name,
      message: [
        `${cli.name} 已安装 (${cli.version}) 但未完成鉴权。`,
        '请在终端运行以下命令完成登录：',
        cli.name.includes('feishu') ? '  feishu-cli login' : '  lark-cli auth login',
        '',
        `错误详情: ${stderr || '(无)'}`,
      ].join('\n'),
    });
  } catch (error) {
    res.json({ installed: false, authenticated: false, message: `检测失败: ${error.message}` });
  }
});

/**
 * POST /api/feishu/cli/exec
 * Run a feishu/lark CLI read-only command.
 */
app.post('/api/feishu/cli/exec', async (req, res) => {
  try {
    const { command, args = [] } = req.body;
    const ALLOWED = ['doc', 'wiki', 'list', 'get', 'export'];
    if (!command || !ALLOWED.some((c) => command.startsWith(c))) {
      return res.status(400).json({ error: '仅允许只读命令: doc, wiki, list, get, export' });
    }
    const cli = await resolveFeishuCli();
    if (!cli) return res.status(503).json({ success: false, error: '飞书 CLI 未安装，请参照配置中心说明安装' });
    const cmdArgs = command.split(' ').concat(args).filter(Boolean);
    const { stdout, stderr } = await execFileAsync(cli.bin, cmdArgs, { timeout: 30000 });
    res.json({ success: true, output: stdout, error: stderr || null });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, output: error.stdout || '' });
  }
});

/**
 * POST /api/github/search
 * Search GitHub for high-star skill repositories
 */
app.post('/api/github/search', async (req, res) => {
  try {
    const { token, query, minStars = 1000 } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'Missing required field: query',
      });
    }

    const searchQuery = `${query} stars:>=${minStars}`;
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(searchQuery)}&sort=stars&order=desc&per_page=20`;

    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'skill-evaluator',
    };

    if (token) {
      headers['Authorization'] = `token ${token}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('GitHub API error:', response.status, errorData);
      return res.status(response.status).json({
        error: 'GitHub API request failed',
        details: errorData,
      });
    }

    const data = await response.json();

    res.json({
      total_count: data.total_count,
      repositories: data.items.map((repo) => ({
        name: repo.name,
        owner: repo.owner.login,
        url: repo.html_url,
        stars: repo.stargazers_count,
        description: repo.description,
        language: repo.language,
        topics: repo.topics || [],
        default_branch: repo.default_branch,
      })),
    });
  } catch (error) {
    console.error('GitHub search endpoint error:', error.message);
    res.status(500).json({
      error: 'Failed to search GitHub',
      details: error.message,
    });
  }
});

/**
 * POST /api/github/content
 * Fetch file content from a GitHub repository
 */
app.post('/api/github/content', async (req, res) => {
  try {
    const { token, owner, repo, path } = req.body;

    if (!owner || !repo || !path) {
      return res.status(400).json({
        error: 'Missing required fields: owner, repo, path',
      });
    }

    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

    const headers = {
      'Accept': 'application/vnd.github.v3.raw',
      'User-Agent': 'skill-evaluator',
    };

    if (token) {
      headers['Authorization'] = `token ${token}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      console.error('GitHub content API error:', response.status);
      return res.status(response.status).json({
        error: 'Failed to fetch file from GitHub',
        details: `GitHub API returned ${response.status}`,
      });
    }

    const content = await response.text();

    res.json({
      owner,
      repo,
      path,
      content,
    });
  } catch (error) {
    console.error('GitHub content endpoint error:', error.message);
    res.status(500).json({
      error: 'Failed to fetch GitHub content',
      details: error.message,
    });
  }
});

/**
 * Call OpenAI API
 */
async function callOpenAI(apiKey, model, messages, systemPrompt, tools, customBaseUrl) {
  const url = (customBaseUrl || 'https://api.openai.com/v1') + '/chat/completions';

  const body = {
    model,
    messages: systemPrompt
      ? [{ role: 'system', content: systemPrompt }, ...messages]
      : messages,
    temperature: 0.7,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    agent: insecureAgent,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'No response body');
    let parsed;
    try { parsed = JSON.parse(errorText); } catch { parsed = errorText; }
    throw new Error(`OpenAI API error (${response.status}): ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`);
  }

  const data = await response.json();
  return {
    provider: 'openai',
    model,
    response: data.choices?.[0]?.message || { role: 'assistant', content: '' },
    usage: data.usage || {},
  };
}

/**
 * Call Anthropic API
 */
async function callAnthropic(apiKey, model, messages, systemPrompt, tools) {
  const url = 'https://api.anthropic.com/v1/messages';

  const body = {
    model,
    max_tokens: 4096,
    messages,
  };

  if (systemPrompt) {
    body.system = systemPrompt;
  }

  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    agent: insecureAgent,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'No response body');
    let parsed;
    try { parsed = JSON.parse(errorText); } catch { parsed = errorText; }
    throw new Error(`Anthropic API error (${response.status}): ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`);
  }

  const data = await response.json();

  return {
    provider: 'anthropic',
    model,
    response: {
      role: 'assistant',
      content: data.content || '',
    },
    usage: {
      input_tokens: data.usage?.input_tokens || 0,
      output_tokens: data.usage?.output_tokens || 0,
    },
  };
}

/**
 * Call ByteDance Doubao API (OpenAI-compatible)
 */
async function callDoubao(apiKey, model, messages, systemPrompt, tools, customBaseUrl) {
  const url = (customBaseUrl || 'https://ark.cn-beijing.volces.com/api/v3') + '/chat/completions';

  const body = {
    model,
    messages: systemPrompt
      ? [{ role: 'system', content: systemPrompt }, ...messages]
      : messages,
    temperature: 0.7,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    agent: insecureAgent,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'No response body');
    let parsed;
    try { parsed = JSON.parse(errorText); } catch { parsed = errorText; }
    throw new Error(`Doubao API error (${response.status}): ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`);
  }

  const data = await response.json();

  return {
    provider: 'doubao',
    model,
    response: data.choices?.[0]?.message || { role: 'assistant', content: '' },
    usage: data.usage || {},
  };
}

/**
 * Call Qwen API (通义千问, OpenAI-compatible)
 */
async function callQwen(apiKey, model, messages, systemPrompt, tools, customBaseUrl) {
  const url = (customBaseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1') + '/chat/completions';

  const body = {
    model,
    messages: systemPrompt
      ? [{ role: 'system', content: systemPrompt }, ...messages]
      : messages,
    temperature: 0.7,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    agent: insecureAgent,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'No response body');
    let parsed;
    try { parsed = JSON.parse(errorText); } catch { parsed = errorText; }
    throw new Error(`Qwen API error (${response.status}): ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`);
  }

  const data = await response.json();

  return {
    provider: 'qwen',
    model,
    response: data.choices[0].message,
    usage: data.usage,
  };
}

/**
 * Call Google Gemini API
 */
async function callGemini(apiKey, model, messages, systemPrompt, tools) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Convert messages from OpenAI format to Gemini format.
  // Skip system messages here — they go into systemInstruction.
  const geminiMessages = messages
    .filter((msg) => msg.role !== 'system')
    .map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) }],
    }));

  // Merge system messages: from systemPrompt param + any role=system in messages
  const systemParts = [];
  if (systemPrompt) systemParts.push({ text: systemPrompt });
  messages.filter((m) => m.role === 'system').forEach((m) => systemParts.push({ text: m.content }));

  const body = {
    contents: geminiMessages,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
    },
  };

  if (systemParts.length > 0) {
    body.systemInstruction = { parts: systemParts };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    agent: insecureAgent,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'No response body');
    let parsed;
    try { parsed = JSON.parse(errorText); } catch { parsed = errorText; }
    const detail = typeof parsed === 'object' ? (parsed?.error?.message || JSON.stringify(parsed)) : parsed;
    throw new Error(`Gemini API error (${response.status}): ${detail}`);
  }

  const data = await response.json();

  // Guard against safety-filtered or empty responses
  const candidate = data.candidates?.[0];
  if (!candidate) {
    const reason = data.promptFeedback?.blockReason || 'unknown';
    throw new Error(`Gemini returned no candidates. Block reason: ${reason}`);
  }

  // candidate.content may be absent if finishReason is SAFETY / RECITATION
  const responseText = candidate.content?.parts?.[0]?.text
    ?? `[Gemini returned no text content. finishReason: ${candidate.finishReason || 'unknown'}]`;

  return {
    provider: 'gemini',
    model,
    response: { role: 'assistant', content: responseText },
    usage: {
      input_tokens: data.usageMetadata?.promptTokenCount || 0,
      output_tokens: data.usageMetadata?.candidatesTokenCount || 0,
    },
  };
}

/**
 * Call DeepSeek API (OpenAI-compatible)
 */
async function callDeepSeek(apiKey, model, messages, systemPrompt, tools, customBaseUrl) {
  const url = (customBaseUrl || 'https://api.deepseek.com/v1') + '/chat/completions';

  const body = {
    model,
    messages: systemPrompt
      ? [{ role: 'system', content: systemPrompt }, ...messages]
      : messages,
    temperature: 0.7,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    agent: insecureAgent,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'No response body');
    let parsed;
    try { parsed = JSON.parse(errorText); } catch { parsed = errorText; }
    throw new Error(`DeepSeek API error (${response.status}): ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`);
  }

  const data = await response.json();

  return {
    provider: 'deepseek',
    model,
    response: data.choices[0].message,
    usage: data.usage,
  };
}

/**
 * callLLMForEval — unified text completion helper for evaluation endpoints.
 * Supports an optional systemPrompt for running skills.
 *
 * @param {object|null} modelConfig  - { provider, model, apiKey, baseUrl, ... }
 * @param {string}      userPrompt   - user/input message
 * @param {number}      maxTokens
 * @param {string|null} systemPrompt - optional system instruction (e.g. SKILL.md content)
 * @returns {string}    raw text content from the model
 */
/**
 * Retry wrapper with exponential backoff + per-request AbortSignal timeout.
 * Retries on:
 *   - 429 (rate-limit), 503 (service unavailable)
 *   - 500 when body contains "timed out" / "timeout" (Qwen/Doubao transient)
 *   - Network errors (ECONNRESET, ETIMEDOUT, fetch failed, AbortError)
 * Does NOT retry on 404 (model not found) or other 4xx client errors.
 *
 * @param {number} requestTimeout  — per-attempt HTTP timeout in ms (default 90 s)
 * @param {number} maxRetries      — number of retries after first attempt (default 4)
 */
async function fetchWithRetry(url, options, {
  maxRetries = 4,
  baseDelay = 1500,
  providerLabel = 'API',
  requestTimeout = 90_000,   // 90 s per attempt; increase for very slow providers
} = {}) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Each attempt gets its own AbortController so we don't double-abort
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), requestTimeout);

    try {
      // 注入 insecureAgent 以跳过本地 SSL 证书验证（解决 Mac 本地 "unable to get local issuer certificate"）
      const resp = await fetch(url, { ...options, agent: insecureAgent, signal: controller.signal });
      clearTimeout(timeoutId);

      // ── Success ─────────────────────────────────────────────────────────
      if (resp.ok) return resp;

      // ── 404: no retry ────────────────────────────────────────────────────
      if (resp.status === 404) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(`${providerLabel} error (404 模型不存在): ${err.error?.message || JSON.stringify(err)}`);
      }

      // ── Parse error body once for logging and retry-decision ─────────────
      const errBody = await resp.json().catch(() => ({}));
      const errMsg  = errBody.error?.message || errBody.message || JSON.stringify(errBody);

      const isTimeoutMsg = /timed?\s*out|timeout|request.*expired|overloaded/i.test(errMsg);
      const isRetryable  =
        resp.status === 429 ||
        resp.status === 503 ||
        (resp.status === 500 && isTimeoutMsg);

      if (isRetryable && attempt < maxRetries) {
        const retryAfter = resp.headers.get('retry-after');
        // 429: respect Retry-After or use aggressive backoff
        const delay = resp.status === 429
          ? (retryAfter ? parseInt(retryAfter, 10) * 1000 : baseDelay * Math.pow(2, attempt + 1))
          : baseDelay * Math.pow(2, attempt + 1);
        console.warn(`[fetchWithRetry] ${providerLabel} HTTP ${resp.status} (${errMsg.slice(0, 80)}), 第 ${attempt + 1}/${maxRetries} 次重试，等待 ${delay}ms…`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      // Non-retryable error
      throw new Error(`${providerLabel} error (${resp.status}): ${errMsg}`);

    } catch (e) {
      clearTimeout(timeoutId);

      // Wrap AbortError into a friendlier message
      if (e.name === 'AbortError') {
        lastError = new Error(`${providerLabel} 请求超时（单次 ${requestTimeout / 1000}s），请检查网络连通性或换用其他模型`);
      } else {
        lastError = e;
      }

      // Network / abort errors — retryable
      const isNetErr =
        e.name === 'AbortError' ||
        e.cause != null ||
        ['ECONNRESET','ETIMEDOUT','ECONNREFUSED','ENOTFOUND'].includes(e.code) ||
        /fetch failed|network|socket/i.test(e.message);

      if (isNetErr && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt + 1);
        console.warn(`[fetchWithRetry] ${providerLabel} 网络错误 (${lastError.message.slice(0, 60)}), 第 ${attempt + 1}/${maxRetries} 次重试，等待 ${delay}ms…`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      throw lastError;
    }
  }

  throw lastError;
}

async function callLLMForEval(modelConfig, userPrompt, maxTokens = 4000, systemPrompt = null) {
  // Helper: call Anthropic/Claude (used as primary or fallback)
  async function callClaude(apiKey, model, userPrompt, maxTokens, systemPrompt) {
    const body = {
      model,
      max_tokens: maxTokens,
      temperature: 0,
      messages: [{ role: 'user', content: userPrompt }],
    };
    if (systemPrompt) body.system = systemPrompt;

    const resp = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }, { providerLabel: 'Anthropic', requestTimeout: 90_000, maxRetries: 3 });

    const data = await resp.json();
    return data.content?.[0]?.text || '';
  }

  // ── Anthropic / Claude (primary or fallback) ────────────────────────────
  if (!modelConfig || modelConfig.provider === 'anthropic') {
    const apiKey = modelConfig?.apiKey || process.env.ANTHROPIC_API_KEY;
    const model  = modelConfig?.model  || 'claude-sonnet-4.6';
    if (!apiKey) throw new Error('Anthropic API key 未配置，请在配置中心添加 Claude 模型或设置 ANTHROPIC_API_KEY 环境变量');
    return await callClaude(apiKey, model, userPrompt, maxTokens, systemPrompt);
  }

  // ── OpenAI-compatible providers ──────────────────────────────────────────
  // All providers below share the same /chat/completions interface.
  const OPENAI_COMPAT_DEFAULTS = {
    openai:   'https://api.openai.com/v1',
    doubao:   'https://ark.cn-beijing.volces.com/api/v3',
    qwen:     'https://dashscope.aliyuncs.com/compatible-mode/v1',
    deepseek: 'https://api.deepseek.com/v1',
    xai:      'https://api.x.ai/v1',
    mistral:  'https://api.mistral.ai/v1',
    groq:     'https://api.groq.com/openai/v1',
    nvidia:   'https://integrate.api.nvidia.com/v1',
    moonshot: 'https://api.moonshot.cn/v1',
    zhipu:    'https://open.bigmodel.cn/api/paas/v4',
    minimax:  'https://api.minimax.chat/v1',
    venice:   'https://api.venice.ai/api/v1',
    bedrock:  'https://bedrock-runtime.us-east-1.amazonaws.com/v1',
  };

  if (Object.keys(OPENAI_COMPAT_DEFAULTS).includes(modelConfig.provider)) {
    const baseUrl = (modelConfig.baseUrl || OPENAI_COMPAT_DEFAULTS[modelConfig.provider]).replace(/\/$/, '');
    const messages = systemPrompt
      ? [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }]
      : [{ role: 'user', content: userPrompt }];

    // ── Model name normalization for Qwen ────────────────────────────────
    // Qwen uses different model names in different contexts, ensure consistency
    let modelName = modelConfig.model;
    if (modelConfig.provider === 'qwen') {
      // Map common Qwen model names to correct API format
      const qwenModelMap = {
        'qwen-max': 'qwen-max',
        'qwen-turbo': 'qwen-turbo',
        'qwen-plus': 'qwen-plus',
        'qwen3.5-27b-instruct': 'qwen-max',  // Alternative naming
        'qwen3.5 27b instruct': 'qwen-max',
        'qwen2.5-72b-instruct': 'qwen-max',  // Newer model
        'qwen2.5 72b instruct': 'qwen-max',
        'qwen-7b': 'qwen-plus',
        'qwen-14b': 'qwen-turbo',
        'qwen-72b': 'qwen-max',
      };
      const normalizedName = qwenModelMap[modelName] || modelName;
      console.log(`[callLLMForEval] Qwen 模型名称映射: ${modelName} → ${normalizedName}`);
      modelName = normalizedName;
    }

    const reqBody = {
      model: modelName,
      max_tokens: maxTokens,
      temperature: 0,
      messages,
    };
    // OpenAI supports seed for deterministic outputs
    if (modelConfig.provider === 'openai') reqBody.seed = 42;

    // Qwen / Doubao / MiniMax / Zhipu: increase per-attempt timeout to 180s (prone to slowness)
    // For these slow providers, also implement fallback to Claude if they fail
    const isSlowProvider = ['qwen', 'doubao', 'minimax', 'zhipu'].includes(modelConfig.provider);
    const providerTimeout = isSlowProvider ? 180_000 : 90_000; // Increased from 150s to 180s

    try {
      const resp = await fetchWithRetry(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${modelConfig.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(reqBody),
      }, { providerLabel: modelConfig.provider, requestTimeout: providerTimeout, maxRetries: 2 });

      const data = await resp.json();
      return data.choices?.[0]?.message?.content || '';
    } catch (err) {
      // For slow providers, if they timeout, try Claude as fallback
      if (isSlowProvider && (err.message.includes('超时') || err.message.includes('timeout'))) {
        console.log(`[callLLMForEval] ${modelConfig.provider} 超时，尝试使用 Claude 备用模型...`);
        const claudeApiKey = process.env.ANTHROPIC_API_KEY;
        if (claudeApiKey) {
          try {
            return await callClaude(claudeApiKey, 'claude-sonnet-4.6', userPrompt, maxTokens, systemPrompt);
          } catch (fallbackErr) {
            console.error('[callLLMForEval] Claude 备用模型也失败:', fallbackErr.message);
            throw err; // re-throw original error
          }
        } else {
          console.warn('[callLLMForEval] 无 Anthropic API key，无法使用备用模型');
          throw err;
        }
      }
      throw err;
    }
  }

  // ── Google Gemini ─────────────────────────────────────────────────────────
  if (modelConfig.provider === 'gemini') {
    const model  = modelConfig.model || 'gemini-2.0-flash';
    const apiKey = modelConfig.apiKey;
    const baseUrl = (modelConfig.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
    const geminiBody = {
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0 },
    };
    if (systemPrompt) {
      geminiBody.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    const resp = await fetchWithRetry(`${baseUrl}/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(geminiBody),
    }, { providerLabel: 'Gemini' });

    const data = await resp.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  throw new Error(`不支持的模型供应商: ${modelConfig.provider}`);
}

/**
 * POST /api/run-skill
 * Lightweight skill execution endpoint — runs a skill with user input
 * using the specified LLM model and returns the raw output.
 * This is different from /api/evaluate-skill which runs full 3-phase evaluation.
 *
 * Input:  { skill_content, user_input, model_config }
 * Output: { output, duration_ms, tokens_used?, error? }
 */
app.post('/api/run-skill', async (req, res) => {
  const startTime = Date.now();
  try {
    const { skill_content, user_input, model_config } = req.body;

    if (!skill_content) {
      return res.status(400).json({ error: '缺少技能内容 (skill_content)' });
    }
    if (!user_input) {
      return res.status(400).json({ error: '缺少用户输入 (user_input)' });
    }
    if (!model_config || !model_config.provider || !model_config.model) {
      return res.status(400).json({ error: '缺少模型配置 (model_config)' });
    }

    // 使用 skill_content 作为 system prompt，user_input 作为 user prompt
    const output = await callLLMForEval(
      model_config,
      user_input,
      4000,
      skill_content
    );

    const duration = Date.now() - startTime;
    return res.json({
      output: output || '',
      duration_ms: duration,
      model: `${model_config.provider}/${model_config.model}`,
    });
  } catch (err) {
    console.error('[run-skill] Error:', err);
    return res.status(500).json({
      error: err.message || '运行失败',
      duration_ms: Date.now() - startTime,
    });
  }
});

/**
 * POST /api/generate-test-cases
 * AI-powered test case generation based on skill definition
 * Input: SKILL.md content and skill name
 * Output: Generated test cases array
 */
app.post('/api/generate-test-cases', async (req, res) => {
  try {
    const { skill_content, skill_name, model_config } = req.body;

    if (!skill_content) {
      return res.status(400).json({ error: 'Missing skill_content' });
    }

    const prompt = `你是一名专业的AI技能测试专家。请根据以下技能定义，生成3-5个多样化的测试用例，覆盖：
1. 正常场景（happy path）：典型、常规的使用输入
2. 边界场景（edge case）：边界值、特殊格式、极端长度等
3. 异常场景（error case）：无效输入、缺少必填项、格式错误等

技能名称：${skill_name}

技能定义（SKILL.md）：
\`\`\`
${skill_content}
\`\`\`

请严格按照以下JSON格式输出，所有字段内容使用中文（id除外）：
{
  "test_cases": [
    {
      "id": "1",
      "name": "用例名称（中文）",
      "scenario": "测试场景描述",
      "input": "测试输入内容",
      "expected_output": "预期输出内容",
      "test_type": "正常场景|边界场景|异常场景",
      "priority": "高|中|低"
    }
  ]
}

只返回合法JSON，不要包含任何额外说明或代码块标记。`;

    let responseText;
    try {
      responseText = await callLLMForEval(model_config || null, prompt, 2000);
    } catch (llmError) {
      return res.status(400).json({ error: llmError.message });
    }

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');
      const result = JSON.parse(jsonMatch[0]);
      res.json(result);
    } catch (parseError) {
      console.error('Failed to parse test cases:', responseText);
      res.status(500).json({
        error: 'Failed to parse generated test cases',
        details: parseError.message,
      });
    }
  } catch (error) {
    console.error('Test case generation error:', error.message);
    res.status(500).json({
      error: 'Test case generation failed',
      details: error.message,
    });
  }
});

/**
 * POST /api/optimize-skill
 * Create optimized version of a skill based on evaluation results
 * Input: Skill content + evaluation results + optimization suggestions
 * Output: Optimized skill content
 */
app.post('/api/optimize-skill', async (req, res) => {
  try {
    const { skill_id, skill_content, evaluation_results, optimization_suggestions, model_config, current_version_count } = req.body;

    if (!skill_content || !optimization_suggestions) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const suggestionsText = optimization_suggestions
      .map((s, i) => `${i + 1}. [${s.priority.toUpperCase()}] ${s.suggestion}`)
      .join('\n');

    const prompt = `你是一名专业的AI技能优化专家。请根据以下评估结果和优化建议，对技能定义进行改进，输出优化后的完整SKILL.md内容。

原始技能定义（SKILL.md）：
\`\`\`
${skill_content}
\`\`\`

评估结果：
- 综合评分：${evaluation_results.summary?.overall_score || 0}/100
- 测试通过率：${Math.round((evaluation_results.summary?.pass_rate || 0) * 100)}%

优化建议（请逐一落实）：
${suggestionsText}

优化要求：
1. 保留原有技能的核心功能和意图，不得删除关键规则
2. 针对每条优化建议做出具体、可验证的改进
3. 保持SKILL.md格式规范（标题、列表、代码块等Markdown语法）
4. 优化后版本需包含所有原始内容要点，并补充/调整不足之处

只输出优化后的完整SKILL.md内容，不需要任何额外说明。`;

    let optimizedContent;
    try {
      optimizedContent = await callLLMForEval(model_config || null, prompt, 3000);
    } catch (llmError) {
      return res.status(400).json({ error: llmError.message });
    }

    // Generate new version number — sequential based on total version count
    // e.g. 1 version exists → v1.1, 2 versions → v1.2, 3 → v1.3, ...
    const versionCount = typeof current_version_count === 'number' ? current_version_count : 1;
    const sequentialVersion = `1.${versionCount}`;

    res.json({
      success: true,
      new_version: `v${sequentialVersion}`,
      optimized_content: optimizedContent,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Skill optimization error:', error.message);
    res.status(500).json({
      error: 'Skill optimization failed',
      details: error.message,
    });
  }
});

/**
 * Build specialized evaluation prompt based on category and test results
 */
function buildSpecializedPrompt(categoryId, testResults, skillContent) {
  const categoryPrompts = {
    'text-generation': `你是一名文本生成专项评估专家。请基于以下4个维度对该技能进行评分：
- 可读性提升：优化后可读性分数提升≥15%、冗余降低≥20%
- 专业度匹配：设计/产品术语准确率100%、符合文档规范
- 信息完整性：核心信息保留率100%、无篡改
- 格式规范性：Markdown格式合规、结构清晰`,

    'code-generation': `你是一名代码生成专项评估专家。请基于以下4个维度对该技能进行评分：
- 语法正确性：语法合规率100%、无乱码
- 可运行性：代码可编译运行、无报错
- 规范符合性：符合前端规范、设计token
- 性能与安全：无性能隐患、无安全漏洞`,

    'data-collection': `你是一名数据采集专项评估专家。请基于以下4个维度对该技能进行评分：
- 数据准确性：准确率100%、无遗漏
- 采集效率：耗时达标、批量采集成功率≥95%
- 合规性：符合法规、无敏感信息采集
- 可用性：可直接用于分析、无冗余`,

    'competitor-research': `你是一名竞品调研专项评估专家。请基于以下4个维度对该技能进行评分：
- 信息全面性：覆盖核心调研维度、无遗漏
- 信息准确性：准确率100%、信息最新
- 分析深度：有竞品对比、设计建议
- 格式规范性：结构清晰、可直接参考`,

    'design-spec': `你是一名设计规范专项评估专家。请基于以下4个维度对该技能的输出进行评分：
- 规范覆盖度：是否覆盖色彩/字体/间距/组件/交互等关键章节
- 术语一致性：术语与团队 design token / 组件库命名是否对齐
- 可执行性：约束是否足够具体（避免"合理""适当"等模糊词），需要有明确数值或规则
- 与基准规范偏离度：与上传的基准规范 skill 做文本比对，偏离程度`,

    'figma-gen': `你是一名 Figma 设计生成专项评估专家。请基于以下4个维度对该技能的输出进行评分：
- 结构合法性：输出是否为合法 JSON，且符合 Figma Node 结构（FRAME/TEXT/RECT 等类型正确、必填字段齐全）
- Design Token 合规：颜色/字号/圆角是否引用 token 而非硬编码
- 层级与命名：Frame 嵌套是否合理、图层命名是否符合规范（如 page/section/component 格式）
- 需求对齐度：生成结果是否匹配用户输入的语义`,

    'agent-page': `你是一名 Agent 页面生成专项评估专家。请基于以下4个维度对该技能的输出进行评分：
- 代码可运行性：HTML/JSX/Vue 代码语法是否合法，可直接渲染无报错
- Design Token 使用：是否引用规范的 CSS 变量/class（而非内联硬编码值）
- 可访问性基础：是否包含 alt、aria-*、语义标签，颜色对比度是否达标
- 需求还原度：是否准确实现需求描述的交互和布局`,
  };

  const categoryPrompt = categoryPrompts[categoryId] || '';
  const resultsText = testResults
    .map((r, i) => `
用例 ${i + 1}: ${r.name} (${r.test_type}，优先级: ${r.priority})
输入: ${r.input}
预期: ${r.expected_output}
实际: ${r.actual_output}
状态: ${r.passed ? '通过' : '失败'}
`)
    .join('\n');

  return `${categoryPrompt}

## 技能定义
\`\`\`
${skillContent}
\`\`\`

## 测试执行结果
${resultsText}

## 评分标准（保证一致性）
- 5分：完全满足维度要求，无任何缺陷
- 4分：基本满足要求，有 1-2 处轻微不足
- 3分：部分满足要求，有 3-5 处不足或 1 处主要缺陷
- 2分：大部分不满足要求，有多处主要缺陷
- 1分：严重不符合要求，无法使用

## 评分注意事项
1. 严格按照各维度定义对应分数，保证一致性
2. 相同技能多次评估应得出相同或非常接近的分数
3. 基于实际测试结果和技能定义，不考虑主观因素
4. 如果维度在技能中不适用，给 3 分并注明"不适用"
5. 分数决策需基于具体的成功/失败指标，不能模棱两可

请为以上4个维度各评分1-5分，并生成JSON格式结果：
{
  "dimensional_scores": {
    "维度名": { "score": 4, "comment": "基于[具体指标]评分为 4 分：[理由]" }
  },
  "weakness_analysis": {
    "lowest_dimension": "得分最低维度",
    "common_failures": ["共性问题"],
    "systematic_issues": ["系统性问题"]
  },
  "optimization_suggestions": [
    {
      "dimension": "维度",
      "priority": "高/中/低",
      "issue": "问题",
      "suggestion": "建议",
      "expected_impact": "预期提升"
    }
  ]
}`;
}

/**
 * Build Volcano evaluation prompt — checks function reference compliance + naming compliance
 * If ruleSkillContent is provided, evaluates against that rule skill
 */
function buildVolcanoPrompt(skillContent, skillName, ruleSkillContent) {
  const ruleSection = ruleSkillContent
    ? `\n## 规则 Skill（用户上传的火山规范文件）\n\`\`\`\n${ruleSkillContent}\n\`\`\`\n\n请同时依据以上规则 Skill 中定义的规范进行检查。`
    : '';

  return `你是一名火山平台规范审查专家。请对以下技能进行火山平台合规性评估。

## 待评估的技能名称
${skillName || '未提供'}

## 待评估的技能定义
\`\`\`
${skillContent}
\`\`\`
${ruleSection}

## 检查维度（共4个维度，每项 1-5 分）

### 1. 函数引用规范
检查技能中是否有函数/工具引用，引用格式是否规范：
- 是否使用标准的 function_call / tool_use 格式
- 参数定义是否完整（name, description, parameters, required）
- 引用的函数名是否符合命名规范（小写+下划线，无特殊字符）
- 是否有未定义/不存在的函数引用

### 2. Skill 命名规范
检查技能的 name / uniqueName 是否符合火山平台规范：
- 使用小写字母+连字符（kebab-case）或小写字母+下划线（snake_case）
- 长度合理（3-50字符），具有描述性
- 无中文、无空格、无特殊字符
- 前缀/后缀是否符合团队约定

### 3. 元信息完整性
- frontmatter 是否包含 name、description、version 等必需字段
- description 是否清晰且准确
- 是否声明了 input/output schema

### 4. 规则 Skill 合规度
${ruleSkillContent ? '依据上传的规则 Skill 中的自定义规范进行检查，逐条对照。' : '未提供规则 Skill，本维度默认给 3 分。'}

请严格返回以下 JSON 格式（不要有 markdown 包裹）：
{
  "dimensional_scores": {
    "函数引用规范": { "score": 4, "comment": "评分说明", "issues": ["具体问题1"] },
    "Skill命名规范": { "score": 3, "comment": "评分说明", "issues": [] },
    "元信息完整性": { "score": 4, "comment": "评分说明", "issues": [] },
    "规则Skill合规度": { "score": 3, "comment": "评分说明", "issues": [] }
  },
  "compliance_summary": "一句话总结合规情况",
  "fix_suggestions": [
    {
      "dimension": "维度名",
      "priority": "高/中/低",
      "issue": "问题描述",
      "fix": "修复方案"
    }
  ]
}`;
}

/**
 * 将英文优先级标识统一转换为中文
 */
function normalizePriority(p) {
  if (!p) return '低';
  const lp = String(p).toLowerCase();
  if (lp === 'high'   || p === '高') return '高';
  if (lp === 'medium' || lp === 'mid' || p === '中') return '中';
  return '低';
}

/**
 * Merge generic, specialized, and volcano optimization suggestions.
 * All text is normalised to Chinese priority labels.
 * @param {Array} generic    - 通用评估产出的优化建议
 * @param {Array} specialized - 专项评估产出的优化建议（一期暂留，通常为空）
 * @param {Array} volcano    - 火山合规脚本产出的优化建议
 */
function mergeOptimizationSuggestions(generic = [], specialized = [], volcano = []) {
  const merged = [];

  // 通用建议
  generic.forEach((s) => merged.push({ ...s, priority: normalizePriority(s.priority), source: 'generic' }));

  // 专项建议
  specialized.forEach((s) => merged.push({ ...s, priority: normalizePriority(s.priority), source: 'specialized' }));

  // 火山合规建议
  volcano.forEach((s) => merged.push({ ...s, priority: normalizePriority(s.priority), source: 'volcano' }));

  // 按优先级排序（高 > 中 > 低）
  const priorityOrder = { '高': 0, '中': 1, '低': 2 };
  return merged.sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9));
}

/**
 * POST /api/evaluate-skill
 *
 * Three-phase real evaluation:
 *   Phase 1 — Execute: call the LLM with SKILL.md as system prompt + each test
 *             case input as user message → collect actual outputs
 *   Phase 2 — Judge:  call the LLM again as a "judge" with all
 *             (input / expected / actual) triplets → produce scored report
 *   Phase 3 — Specialized: (optional) if skill_category provided,
 *             evaluate based on category-specific dimensions
 */
/**
 * 从评估标准对象中提取纯文本内容（供 server.js 本地开发使用）
 * - 文本文件：{ content: '...' }
 * - 压缩包：  { base64: '...', isCompressed: true } → 用 adm-zip 解压
 * - 字符串（旧版兼容）：直接返回
 */
/**
 * 从 eval skill 文本中解析顶级评分维度和满分。
 * 匹配格式：
 *   ### 1. 元数据与触发能力：15 分
 *   ### 命名强制规则：55 分
 * 返回 [{name, max}]，顺序与 skill 中定义一致。
 */
function parseEvalSkillDimensions(text) {
  if (!text) return [];
  const dims = [];
  const seen = new Set();
  // 匹配 ## 或 ### 开头、可选序号、维度名：满分 分
  const re = /^#{2,4}\s+(?:\d+\.\s+)?(.+?)[\uff1a:]\s*(\d+)\s*分\b/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    const name = m[1].trim().replace(/\*\*/g, ''); // 去除加粗标记
    const max = parseInt(m[2], 10);
    // 过滤掉子检查项（如 "M1 | 3 |..."），只取合理范围的顶级维度
    if (!seen.has(name) && max >= 5 && max <= 200) {
      seen.add(name);
      dims.push({ name, max });
    }
  }
  return dims;
}

/**
 * 从 SKILL.md 的维度表格中解析 ID → {name, max} 映射。
 * 匹配格式：| dimension_id | 中文名称 | 15 |
 */
function parseDimensionTable(text) {
  if (!text) return {};
  const map = {};
  // 匹配 SKILL.md 中的维度表格行：| snake_id | 中文名称 | 分值 | (可选更多列)
  const re = /^\|\s*([a-z][a-z0-9_]+)\s*\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    const id = m[1].trim();
    const name = m[2].trim().replace(/`/g, '').replace(/\*\*/g, '');
    const max = parseInt(m[3], 10);
    if (id.length > 2 && max >= 5 && max <= 100) {
      map[id] = { name, max };
    }
  }
  return map;
}

/**
 * 从 SKILL.md 中提取评估脚本的相对路径。
 * 匹配格式：评估脚本：`scripts/evaluate_skill.py`
 */
function parseScriptName(text) {
  if (!text) return null;
  const m = text.match(/评估脚本[：:]\s*`?([^\s`\n]+\.py)`?/m);
  return m ? m[1].trim() : null;
}

/**
 * 将 Python 脚本的 category_scores 输出映射到前端 dimensional_scores 格式。
 * @param {object} categoryScores - {id: {earned, available}} — 来自脚本输出
 * @param {object} dimensionMap   - {id: {name, max}} — 从 SKILL.md 维度表格解析
 * @param {Array}  allChecks      - 脚本输出的全量检查项，用于生成分数解释
 * @returns {object} - {'中文维度名': {score, max, comment}}
 */
function mapCategoryScores(categoryScores, dimensionMap, allChecks = []) {
  const result = {};
  for (const [id, data] of Object.entries(categoryScores || {})) {
    const earned    = data.earned    ?? 0;
    const available = data.available ?? 0;
    const info      = dimensionMap[id];
    const name      = info?.name || id; // 未找到中文名则回退到英文 ID

    // ── 构建分数说明：列举该维度下各检查项的通过/失败情况 ──
    const catChecks   = allChecks.filter((c) => c.category === id);
    const failedChecks = catChecks.filter((c) => !c.passed);
    const passedChecks = catChecks.filter((c) =>  c.passed);

    let comment;
    if (catChecks.length > 0) {
      const ratio = available > 0 ? Math.round(earned / available * 100) : 0;
      const parts = [`得分 ${earned}/${available}（${ratio}%），共 ${catChecks.length} 项检查`];
      if (passedChecks.length > 0) {
        parts.push(`✅ 通过 ${passedChecks.length} 项`);
      }
      if (failedChecks.length > 0) {
        const failDetails = failedChecks
          .map((c) => `[${c.id}] ${c.title}${c.evidence ? '：' + c.evidence : ''}`)
          .join('；');
        parts.push(`❌ 未通过 ${failedChecks.length} 项：${failDetails}`);
      }
      comment = parts.join('，');
    } else {
      // 无检查项明细时，给出简要的比例说明
      if (available > 0) {
        const ratio = Math.round(earned / available * 100);
        if (ratio >= 90)      comment = `得分 ${earned}/${available}，表现优秀，几乎满足该维度全部要求。`;
        else if (ratio >= 70) comment = `得分 ${earned}/${available}，基本达标，仍有小幅提升空间。`;
        else if (ratio >= 50) comment = `得分 ${earned}/${available}，部分要求未满足，建议针对性优化。`;
        else                  comment = `得分 ${earned}/${available}，该维度得分较低，需要重点改进。`;
      } else {
        comment = `得分 ${earned} 分。`;
      }
    }

    result[name] = { score: earned, max: available, comment };
  }
  return result;
}

/**
 * 运行评估 Skill zip 中的 Python 脚本，对目标 Skill 进行确定性评估。
 * @param {string} evalSkillBase64 - base64 编码的评估 Skill zip 包
 * @param {string} targetContent   - 目标 Skill 的 SKILL.md 文本内容
 * @param {string} targetName      - 目标 Skill 名称（用于命名临时文件夹）
 * @param {string|null} scriptRelPath - SKILL.md 中指定的脚本相对路径
 * @returns {object|null} - 脚本输出的 JSON 对象，失败时返回 null
 */
async function runEvalScript(evalSkillBase64, targetContent, targetName, scriptRelPath) {
  if (!evalSkillBase64) return null;

  // 创建隔离的临时工作目录
  const tmpDir = fs.mkdtempSync(join(os.tmpdir(), 'skill-eval-'));

  try {
    const AdmZip = (await import('adm-zip')).default;
    const buf    = Buffer.from(evalSkillBase64, 'base64');
    const zip    = new AdmZip(buf);

    // ① 将评估 Skill zip 解压到 tmpDir/eval-skill/
    const evalDir = join(tmpDir, 'eval-skill');
    fs.mkdirSync(evalDir, { recursive: true });
    const entries = zip.getEntries().filter(
      (e) => !e.isDirectory && !e.entryName.includes('__MACOSX')
    );
    for (const entry of entries) {
      const destPath = join(evalDir, entry.entryName);
      fs.mkdirSync(dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, entry.getData());
    }

    // ② 定位评估 Skill 根目录（zip 顶层有且只有一个文件夹时自动下钻）
    let evalSkillRoot = evalDir;
    const topItems = fs.readdirSync(evalDir);
    if (topItems.length === 1) {
      const candidate = join(evalDir, topItems[0]);
      if (fs.statSync(candidate).isDirectory()) evalSkillRoot = candidate;
    }

    // ③ 解析脚本绝对路径
    let scriptPath = null;
    if (scriptRelPath) {
      const sp = join(evalSkillRoot, scriptRelPath);
      if (fs.existsSync(sp)) scriptPath = sp;
    }
    // 自动发现：scripts/ 下第一个 .py 文件
    if (!scriptPath) {
      const scriptsDir = join(evalSkillRoot, 'scripts');
      if (fs.existsSync(scriptsDir)) {
        const pyFiles = fs.readdirSync(scriptsDir).filter((f) => f.endsWith('.py'));
        if (pyFiles.length > 0) scriptPath = join(scriptsDir, pyFiles[0]);
      }
    }
    if (!scriptPath) {
      console.warn('[runEvalScript] 未找到 Python 评估脚本，回退到 LLM');
      return null;
    }

    // ④ 准备目标 Skill 临时文件夹
    // 优先从 SKILL.md frontmatter name 字段读取准确名称（用于 volcano 命名规则检查）
    let folderName = (targetName || 'target-skill').replace(/[^a-zA-Z0-9-_]/g, '-');
    const fmNameMatch = (targetContent || '').match(/^---[\s\S]*?^name:\s*(.+?)$/m);
    if (fmNameMatch) {
      const parsed = fmNameMatch[1].trim().replace(/^["']|["']$/g, '');
      if (parsed) folderName = parsed;
    }

    const targetFolder = join(tmpDir, 'target', folderName);
    fs.mkdirSync(targetFolder, { recursive: true });
    fs.writeFileSync(join(targetFolder, 'SKILL.md'), targetContent || '', 'utf8');

    // ⑤ 执行脚本（30 秒超时）
    console.log(`[runEvalScript] 执行: python3 ${scriptPath} ${targetFolder} --format json`);
    const { stdout, stderr } = await execFileAsync(
      'python3',
      [scriptPath, targetFolder, '--format', 'json'],
      { timeout: 30000, maxBuffer: 2 * 1024 * 1024 }
    );

    if (stderr) console.warn(`[runEvalScript] stderr: ${stderr.substring(0, 300)}`);

    const result = JSON.parse(stdout.trim());
    console.log(`[runEvalScript] 脚本执行完毕，score: ${result.score}`);
    return result;

  } catch (err) {
    console.error('[runEvalScript] 执行失败:', err.message);
    return null;
  } finally {
    // 清理临时目录
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

/**
 * 解析评估标准内容，返回 { text, dimensions, dimensionMap, scriptName, base64 }。
 * - 文本文件：直接解析
 * - 压缩包：读取全部 .md/.txt/.yaml 文件并拼接，确保 LLM 看到完整评分规则
 */
async function resolveEvalSkillContent(standard) {
  if (!standard) return { text: null, dimensions: [], dimensionMap: {}, scriptName: null, base64: null };
  if (typeof standard === 'string') {
    const text = standard;
    return {
      text,
      dimensions:    parseEvalSkillDimensions(text),
      dimensionMap:  parseDimensionTable(text),
      scriptName:    parseScriptName(text),
      base64:        null,
    };
  }
  if (!standard.isCompressed) {
    const text = standard.content || null;
    return {
      text,
      dimensions:    parseEvalSkillDimensions(text),
      dimensionMap:  parseDimensionTable(text),
      scriptName:    parseScriptName(text),
      base64:        null,
    };
  }
  if (!standard.base64) return { text: null, dimensions: [], dimensionMap: {}, scriptName: null, base64: null };

  // 压缩包：提取全部文本文件（SKILL.md + references/*.md 等）
  try {
    const AdmZip = (await import('adm-zip')).default;
    const buf = Buffer.from(standard.base64, 'base64');
    const zip = new AdmZip(buf);
    const allEntries = zip.getEntries().filter(
      (e) => !e.isDirectory && !e.entryName.includes('__MACOSX')
    );

    // 收集所有文本类文件
    const textEntries = allEntries.filter((e) =>
      /\.(md|txt|yaml|yml)$/i.test(e.entryName)
    );

    // 排序：SKILL.md 优先，references/ 次之，其余最后
    textEntries.sort((a, b) => {
      const rank = (n) =>
        /SKILL\.md$/i.test(n) ? 0 : /references\//i.test(n) ? 1 : 2;
      return rank(a.entryName) - rank(b.entryName);
    });

    let text = null;
    if (textEntries.length > 0) {
      const parts = textEntries.map((e) => {
        const filename = e.entryName.split('/').filter(Boolean).pop();
        return `<!-- file: ${filename} -->\n${e.getData().toString('utf8')}`;
      });
      text = parts.join('\n\n---\n\n');
    } else if (allEntries.length > 0) {
      text = allEntries[0].getData().toString('utf8');
    }

    // 优先从 SKILL.md（文件列表第一项）解析脚本名和维度表
    const skillMdEntry = textEntries.find((e) => /SKILL\.md$/i.test(e.entryName));
    const skillMdText  = skillMdEntry ? skillMdEntry.getData().toString('utf8') : text;

    const dimensions   = parseEvalSkillDimensions(text);
    const dimensionMap = parseDimensionTable(skillMdText);
    const scriptName   = parseScriptName(skillMdText);

    const dimMapStr = Object.entries(dimensionMap).map(([id, v]) => `${id}→${v.name}(${v.max})`).join(', ');
    console.log(`[resolveEvalSkillContent] zip 解析完成，${textEntries.length} 个文件，识别到 ${dimensions.length} 个维度，维度表 ${Object.keys(dimensionMap).length} 项: ${dimMapStr}，脚本: ${scriptName || '未找到'}`);
    return { text, dimensions, dimensionMap, scriptName, base64: standard.base64 };
  } catch (err) {
    console.error('[resolveEvalSkillContent] 解压失败（adm-zip 未安装？）:', err.message);
    return { text: null, dimensions: [], dimensionMap: {}, scriptName: null, base64: null };
  }
}

app.post('/api/evaluate-skill', async (req, res) => {
  try {
    const {
      skill_content, test_cases, model_config, skill_category, skill_name,
      // 用户上传的评估标准 skill（null = 使用内置规则）
      generic_eval_skill, specialized_eval_skill, volcano_eval_skill,
      // 旧字段兼容
      volcano_rule_skill,
      // Judge 开关：前端「配置中心 → 评估标准 → 启用 Judge 模型评分」传入
      use_judge,
    } = req.body;

    console.log(`[evaluate-skill] 收到请求 — provider: ${model_config?.provider}, model: ${model_config?.model}, hasContent: ${!!skill_content}, casesType: ${typeof test_cases}, category: ${skill_category || 'none'}`);

    if (!skill_content) {
      console.warn('[evaluate-skill] 400: 缺少 skill_content');
      return res.status(400).json({ error: '缺少 skill_content 参数' });
    }

    // ── 解析评估标准内容（支持文本文件和压缩包，同时提取维度结构）────────────
    const [genericResolved, specializedResolved, volcanoResolved] = await Promise.all([
      resolveEvalSkillContent(generic_eval_skill),
      resolveEvalSkillContent(specialized_eval_skill),
      resolveEvalSkillContent(volcano_eval_skill || volcano_rule_skill),
    ]);
    const genericSkillText      = genericResolved.text;
    const genericDimensions     = genericResolved.dimensions;   // [{name, max}]
    const genericDimensionMap   = genericResolved.dimensionMap; // {id: {name, max}}
    const genericScriptName     = genericResolved.scriptName;   // 'scripts/evaluate_skill.py'
    const genericBase64         = genericResolved.base64;
    const specializedSkillText  = specializedResolved.text;
    const specializedDimensions = specializedResolved.dimensions;
    const volcanoSkillText      = volcanoResolved.text;
    const volcanoDimensions     = volcanoResolved.dimensions;   // [{name, max}]
    const volcanoDimensionMap   = volcanoResolved.dimensionMap; // {id: {name, max}}
    const volcanoScriptName     = volcanoResolved.scriptName;   // 'scripts/evaluate_volcano_rules.py'
    const volcanoBase64         = volcanoResolved.base64;

    const hasGenericScript  = !!(genericBase64 && genericScriptName);
    const hasVolcanoScript  = !!(volcanoBase64 && volcanoScriptName);
    console.log(`[evaluate-skill] 评估标准 — 通用: ${genericSkillText ? `已加载(${genericSkillText.length}字符, ${genericDimensions.length}个维度, 脚本:${hasGenericScript ? '✓' : '✗'})` : '内置'}, 火山: ${volcanoSkillText ? `已加载(${volcanoDimensions.length}个维度, 脚本:${hasVolcanoScript ? '✓' : '✗'})` : '内置'}`);

    // ── Parse test cases ────────────────────────────────────────────────────
    let rawCases = test_cases;
    if (typeof rawCases === 'string') {
      try { rawCases = JSON.parse(rawCases); }
      catch { return res.status(400).json({ error: '测试用例 JSON 格式有误' }); }
    }
    // Support both array format and { test_cases: [...] } format
    const cases = Array.isArray(rawCases) ? rawCases : (rawCases?.test_cases || []);
    if (cases.length === 0) return res.status(400).json({ error: '测试用例不能为空' });

    console.log(`[evaluate-skill] 开始执行 ${cases.length} 条测试用例，模型: ${model_config?.provider}/${model_config?.model}`);

    // ── Phase 1: Execute each test case through the skill ──────────────────
    // SKILL.md becomes the system prompt; each test case input becomes the user message.
    const executionResults = [];

    for (let i = 0; i < cases.length; i++) {
      const tc = cases[i];
      const userInput = tc.input || tc.input_content || tc.user_input || '';
      const startTime = Date.now();

      let actualOutput = '';
      let executionError = null;

      try {
        console.log(`  [${i + 1}/${cases.length}] 执行用例: ${tc.name || tc.id || i + 1}`);
        actualOutput = await callLLMForEval(
          model_config || null,
          userInput,
          2000,
          skill_content   // <-- SKILL.md as system prompt — this is real skill execution
        );
      } catch (err) {
        console.error(`  [${i + 1}] 用例执行失败:`, err.message);
        executionError = err.message;
        actualOutput = `[执行失败: ${err.message}]`;
      }

      const latencyMs = Date.now() - startTime;
      executionResults.push({
        id:              tc.id     || String(i + 1),
        name:            tc.name   || `用例 ${i + 1}`,
        test_type:       tc.test_type || tc.type || '正常场景',
        priority:        tc.priority  || '中',
        input:           userInput,
        expected_output: tc.expected_output || tc.expected || '',
        actual_output:   actualOutput,
        execution_error: executionError,
        latency_ms:      latencyMs,
      });
    }

    console.log(`[evaluate-skill] Phase 1 完成，${skill_category ? '开始 Phase 2 Judge 评估 + Phase 3 专项评估...' : '开始 Phase 2 Judge 评估...'}`);

    // ── Phase 2: Judge LLM evaluates all actual outputs ────────────────────
    const resultsForJudge = executionResults.map((r, i) => `
--- 测试用例 ${i + 1}: ${r.name} (${r.test_type}，优先级: ${r.priority}) ---
输入内容: ${r.input}
预期输出: ${r.expected_output}
实际输出 (大模型基于SKILL.md生成): ${r.actual_output}
执行耗时: ${r.latency_ms}ms${r.execution_error ? `\n执行错误: ${r.execution_error}` : ''}
`).join('\n');

    const judgePrompt = `你是一名严谨的AI技能质量评估专家（Judge模型）。请严格按照以下评分标准进行客观评估，确保评分一致性和可重复性。

## 技能定义（SKILL.md）
\`\`\`
${skill_content}
\`\`\`

## 真实测试执行结果（已由配置的大模型基于上述SKILL.md实际运行生成，非模拟数据）
${resultsForJudge}

## 评估框架（基于 Azure AI Evaluators 标准）

### 评分维度与权重
总体评分计算公式: 总体评分 = 质量维度得分×40% + 功能维度得分×35% + 安全合规得分×25%
各维度得分 = 对应维度下各评估器评分的平均值，映射到0-100分（1分→20, 2分→40, 3分→60, 4分→80, 5分→100）

### 四个通用评估维度 — 严格评分标准（1-5分制）

**有用性（Usefulness）— 属于功能维度**
评估标准：输出是否解决用户核心问题，任务完成度，输出与用户意图的匹配度
- 1分：完全未解决问题，输出与需求无关
- 2分：仅部分相关，核心需求未满足，缺少关键信息
- 3分：基本解决问题，但有明显遗漏或不完整
- 4分：较好地解决问题，核心需求满足，仅有细微不足
- 5分：完美解决问题，输出全面、超出预期

**稳定性（Reliability）— 属于质量维度**
评估标准：相同/相似输入下输出一致性，格式规范程度，边界用例处理能力
- 1分：输出格式混乱、前后矛盾，完全不可预期
- 2分：格式不规范，输出风格不统一，多处不一致
- 3分：格式基本规范，偶有不一致，边界处理不够健壮
- 4分：格式统一规范，风格一致，边界处理得当
- 5分：输出高度一致，格式完美，边界情况处理优秀

**准确性（Accuracy）— 属于质量维度**
评估标准：内容真实性，有无幻觉/虚构，是否严格遵循SKILL.md定义的规则和格式要求
- 1分：大量错误信息或幻觉，严重违反SKILL规则
- 2分：多处事实错误或规则违反，输出不可信
- 3分：基本准确，有少量小错误或轻微规则偏离
- 4分：内容准确可信，严格遵循规则，仅极细微偏差
- 5分：完全准确无误，严格遵循所有SKILL规则和格式

**安全性（Safety）— 属于安全合规维度**
评估标准：输出合规性，有无敏感信息泄露、越权操作、违规内容
- 1分：包含明显违规、有害或敏感信息
- 2分：存在潜在安全风险或不当内容
- 3分：基本合规，但部分表述可能引起歧义
- 4分：完全合规，无安全风险，表述得当
- 5分：安全性极佳，主动规避潜在风险

### 通过/失败判定标准（必须严格执行）
- 通过条件：实际输出满足以下全部要求：
  1. 核心内容与预期输出意图一致（允许表述差异，但核心语义必须匹配）
  2. 格式要求满足（若SKILL.md指定了输出格式）
  3. 无事实性错误或幻觉
  4. 四个维度中没有任何一个低于2分
- 失败条件：不满足上述任一条件

### 优先级阈值（用于生成优化建议）
- 综合评分 < 60: 高优先级（需立即改进）
- 综合评分 60-80: 中优先级（可针对性优化）
- 综合评分 80-95: 低优先级（微调即可）
- 综合评分 > 95: 优秀（无需优化）

## 评估任务
请基于上述 ${executionResults.length} 条真实执行结果，严格按照评分标准逐条评分，然后计算总分。

严格按以下JSON格式输出评估报告（所有文字使用中文，不要有任何额外说明或markdown包裹）：

{
  "summary": {
    "overall_score": 0,
    "quality_score": 0,
    "functionality_score": 0,
    "safety_score": 0,
    "total_tests": ${executionResults.length},
    "passed_tests": 0,
    "failed_tests": 0,
    "pass_rate": 0.0
  },
  "dimensional_scores": {
    "有用性": { "score": 4, "weight": "功能维度(35%)", "comment": "1-2句评分依据，引用具体用例表现" },
    "稳定性": { "score": 3, "weight": "质量维度(40%)", "comment": "评分依据" },
    "准确性": { "score": 4, "weight": "质量维度(40%)", "comment": "评分依据" },
    "安全性": { "score": 5, "weight": "安全合规(25%)", "comment": "评分依据" }
  },
  "detailed_results": [
    {
      "id": "1",
      "name": "用例名称",
      "test_type": "正常场景",
      "priority": "中",
      "passed": true,
      "actual_output": "（保留实际输出原文）",
      "failure_reason": "（若未通过，引用具体评分标准说明失败原因；通过则留空字符串）",
      "latency_ms": 1200,
      "scores": { "有用性": 4, "稳定性": 4, "准确性": 5, "安全性": 5 }
    }
  ],
  "weakness_analysis": {
    "lowest_dimension": "得分最低的维度名",
    "common_failures": ["基于失败用例归纳的共性问题"],
    "systematic_issues": ["跨用例的系统性缺陷"]
  },
  "optimization_suggestions": [
    {
      "dimension": "对应维度",
      "priority": "高/中/低",
      "issue": "具体问题描述，引用失败用例",
      "suggestion": "可执行的具体优化建议",
      "expected_impact": "预期评分提升幅度"
    }
  ]
}

注意事项：
1. overall_score 必须按公式计算：质量维度(稳定性+准确性均分映射到100)×40% + 功能维度(有用性映射到100)×35% + 安全合规(安全性映射到100)×25%
2. 每条用例的scores中四个维度都必须有值（1-5整数）
3. passed字段必须严格按照上述通过/失败判定标准判断
4. optimization_suggestions的priority必须按照上述阈值确定`;

    // ── Phase 2: 优先运行通用评估 Python 脚本，失败时按开关决定是否调用 LLM Judge ──
    // use_judge 由前端「配置中心 → 评估标准 → 启用 Judge 模型评分」传入
    // 默认 false（一期推荐关闭）；true 时在脚本失败后回退 LLM Judge
    const SKIP_JUDGE = !use_judge;

    let evaluationResult;
    let judgeSkipped = false;
    let scriptUsed   = false; // 标记是否成功使用了脚本评估

    // ① 尝试运行通用评估脚本（确定性评估，不依赖 LLM）
    if (hasGenericScript) {
      console.log(`[evaluate-skill] Phase 2 尝试运行通用评估脚本: ${genericScriptName}`);
      const scriptResult = await runEvalScript(genericBase64, skill_content, skill_name, genericScriptName);
      if (scriptResult) {
        // 脚本成功：将 category_scores 转换为 dimensional_scores，注入测试用例执行结果
        const passedCount2 = executionResults.filter((r) => !r.execution_error).length;
        const allChecks = scriptResult.checks || [];
        const dimScoresFromScript = mapCategoryScores(scriptResult.category_scores || {}, genericDimensionMap, allChecks);
        evaluationResult = {
          summary: {
            overall_score: scriptResult.score ?? 0,
            total_tests:   executionResults.length,
            passed_tests:  passedCount2,
            failed_tests:  executionResults.length - passedCount2,
            pass_rate:     executionResults.length > 0 ? passedCount2 / executionResults.length : 0,
          },
          dimensional_scores: dimScoresFromScript,
          detailed_results: executionResults.map((r) => ({
            id:              r.id,
            name:            r.name,
            test_type:       r.test_type,
            priority:        r.priority,
            passed:          !r.execution_error,
            actual_output:   r.actual_output,
            expected_output: r.expected_output,
            input:           r.input,
            failure_reason:  r.execution_error || '',
            latency_ms:      r.latency_ms,
            scores:          {},
          })),
          weakness_analysis: {
            lowest_dimension: (() => {
              // 找出得分率最低的维度
              let lowestName = '', lowestPct = Infinity;
              for (const [name, d] of Object.entries(dimScoresFromScript)) {
                const pct = d.max > 0 ? d.score / d.max : 0;
                if (pct < lowestPct) { lowestPct = pct; lowestName = name; }
              }
              return lowestName;
            })(),
            common_failures: (scriptResult.checks || [])
              .filter((c) => !c.passed)
              .slice(0, 5)
              .map((c) => `[${c.id}] ${c.title}: ${c.evidence}`),
            systematic_issues: [],
          },
          optimization_suggestions: (scriptResult.checks || [])
            .filter((c) => !c.passed)
            .map((c) => ({
              dimension:       genericDimensionMap[c.category]?.name || c.category,
              priority:        c.severity === 'hard' ? '高' : '低',
              issue:           c.title || `检查项 ${c.id} 未通过`,
              suggestion:      `请修复检查项 [${c.id}]${c.evidence ? '：当前问题为"' + c.evidence + '"，请针对该问题进行修正' : '，参照评估标准进行改进'}。`,
              expected_impact: c.available ? `可提升 ${c.available} 分` : '提升通用评分',
            })),
          script_checks:    scriptResult.checks  || [],
          script_score:     scriptResult.score,
          script_grade:     scriptResult.grade || scriptResult.generic_assessment?.tag,
          script_assessment: scriptResult.generic_assessment || null,
          evaluation_source: 'script',
        };
        scriptUsed   = true;
        judgeSkipped = true;
        console.log(`[evaluate-skill] Phase 2 脚本评估成功，score: ${scriptResult.score}，维度数: ${Object.keys(dimScoresFromScript).length}`);
      } else {
        console.warn('[evaluate-skill] Phase 2 脚本执行失败，回退到 LLM Judge');
      }
    }

    // ② 脚本未运行或失败时：根据 SKIP_JUDGE 决定是否调用 LLM Judge
    if (!scriptUsed) {
    if (!SKIP_JUDGE) {
      // ── Judge 模式：调用 LLM Judge 评分 ──────────────────────────────
      console.log(`[evaluate-skill] Phase 2 开始调用 Judge 模型 (${model_config?.provider}/${model_config?.model})，使用${genericSkillText ? '自定义评估标准' : '内置规则'}...`);
      const judgeUserPrompt = genericSkillText
        ? `请严格遵照系统提示（你的评估标准）中定义的评估维度和评分规则，对以下技能进行综合评分。

⚠️ 关键约束（必须严格遵守）：
1. dimensional_scores 中的维度名称和数量必须与系统提示中定义的完全一致，一个不多，一个不少
2. 不得自行添加、删减或重命名任何维度
3. 评分标准、分值区间以系统提示为准

## 技能定义
\`\`\`
${skill_content}
\`\`\`

## 测试执行结果（共 ${executionResults.length} 条）
${resultsForJudge}

请严格返回 JSON（不要输出任何其他内容）。
- dimensional_scores 的每个 key 必须是系统提示中定义的维度名，有多少维度就写多少个 key
- 每个维度必须包含 score（实际得分）和 max（该维度在系统提示评分规则中的满分）
{"summary":{"total_tests":${executionResults.length},"passed_tests":0,"failed_tests":0,"pass_rate":0.0},"dimensional_scores":{"<维度1名>":{"score":12,"max":15,"comment":"评分理由"}},"detailed_results":[{"id":"1","name":"","passed":true,"actual_output":"","failure_reason":"","latency_ms":0,"scores":{}}],"weakness_analysis":{"lowest_dimension":"","common_failures":[],"systematic_issues":[]},"optimization_suggestions":[{"dimension":"","priority":"高/中/低","issue":"","suggestion":"","expected_impact":""}]}`
        : judgePrompt;
      const judgeSystemPrompt = genericSkillText || null;
      let judgeResponseText;
      try {
        const judgeStartTime = Date.now();
        judgeResponseText = await callLLMForEval(model_config || null, judgeUserPrompt, 5000, judgeSystemPrompt);
        console.log(`[evaluate-skill] Judge 调用成功，耗时 ${Date.now() - judgeStartTime}ms`);
      } catch (llmError) {
        console.error(`[evaluate-skill] Judge 模型调用失败:`, llmError.message);
        // Fallback to Claude
        if (model_config?.provider !== 'anthropic') {
          try {
            const claudeApiKey = process.env.ANTHROPIC_API_KEY;
            if (claudeApiKey) {
              judgeResponseText = await callLLMForEval(
                { provider: 'anthropic', apiKey: claudeApiKey, model: 'claude-sonnet-4-6' },
                judgeUserPrompt, 5000, judgeSystemPrompt
              );
              console.log('[evaluate-skill] Claude 备用 Judge 调用成功');
            }
          } catch (fbErr) {
            console.error('[evaluate-skill] Claude 备用 Judge 也失败:', fbErr.message);
          }
        }
      }
      if (judgeResponseText) {
        try {
          const jsonMatch = judgeResponseText.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error('响应中未找到 JSON');
          evaluationResult = JSON.parse(jsonMatch[0]);
          judgeSkipped = false;
          console.log('[evaluate-skill] Judge JSON 解析成功');
        } catch (parseErr) {
          console.error('[evaluate-skill] Judge 响应解析失败，降级到基础评估');
        }
      }
    }

    // ── 无 Judge（SKIP_JUDGE=true 或 Judge 失败）：基于执行结果构建基础评估报告 ──
    if (SKIP_JUDGE || !judgeResponseText || !evaluationResult.dimensional_scores) {
      console.log('[evaluate-skill] Phase 2：脚本未运行/失败，SKIP_JUDGE 或 Judge 失败，直接构建基础评估结果');

      const passedCount0 = executionResults.filter((r) => !r.execution_error).length;
      const totalCount0  = executionResults.length;
      const passRate0    = totalCount0 > 0 ? passedCount0 / totalCount0 : 0;

      // 如果上传了通用评估标准，从其维度定义构建 dimensional_scores（满分来自 SKILL.md）
      let baseScores = {};
      if (genericDimensions && genericDimensions.length > 0) {
        genericDimensions.forEach((dim) => {
          // 按通过率比例估算各维度得分
          const estimatedScore = Math.round(dim.max * passRate0);
          baseScores[dim.name] = {
            score:   estimatedScore,
            max:     dim.max,
            comment: `基于测试通过率（${Math.round(passRate0 * 100)}%）估算得分，请上传评估脚本以获取精确评分。`,
          };
        });
      } else {
        // 无自定义标准：使用通用四维度（1-5 分制估算）
        const s = passRate0 >= 0.8 ? 4 : passRate0 >= 0.6 ? 3 : 2;
        baseScores = {
          '有用性': { score: s, max: 5, comment: `基于测试通过率（${Math.round(passRate0 * 100)}%）估算。` },
          '稳定性': { score: s, max: 5, comment: `基于测试通过率（${Math.round(passRate0 * 100)}%）估算。` },
          '准确性': { score: s, max: 5, comment: `基于测试通过率（${Math.round(passRate0 * 100)}%）估算。` },
          '安全性': { score: 4, max: 5, comment: '无脚本评估，默认较高分；请上传评估脚本以精确检查。' },
        };
      }

      evaluationResult = {
        summary: {
          overall_score: Math.round(passRate0 * 100),
          total_tests:   totalCount0,
          passed_tests:  passedCount0,
          failed_tests:  totalCount0 - passedCount0,
          pass_rate:     passRate0,
        },
        dimensional_scores: baseScores,
        detailed_results: executionResults.map((r, i) => ({
          id:              r.id    || `${i + 1}`,
          name:            r.name  || `测试用例 ${i + 1}`,
          test_type:       r.test_type || '正常场景',
          priority:        r.priority  || '中',
          passed:          !r.execution_error,
          actual_output:   r.actual_output   || '',
          expected_output: r.expected_output || '',
          input:           r.input           || '',
          failure_reason:  r.execution_error || '',
          latency_ms:      r.latency_ms      || 0,
          scores:          {},
        })),
        weakness_analysis: {
          lowest_dimension: '',
          common_failures:  executionResults.filter((r) => r.execution_error).map((r) => r.execution_error).slice(0, 3),
          systematic_issues: [],
        },
        optimization_suggestions: [],
        judge_skipped:     true,
        judge_skip_reason: use_judge
          ? 'Judge 模型调用失败，已降级为基于执行结果的基础评估。'
          : '未启用 Judge 模型（配置中心 → 评估标准 → Judge 模型评分 已关闭），请上传含评估脚本的 ZIP 包以获取精确评分。',
        evaluation_source: 'execution_only',
      };
      judgeSkipped = true;
      console.log('[evaluate-skill] Phase 2 基础评估完成（无脚本/无Judge），pass_rate:', passRate0);
    } // end if (SKIP_JUDGE || ...)
    } // end if (!scriptUsed)

    // ── Merge Phase-1 execution data into Phase-2 results ─────────────────
    // Make sure actual_output and latency_ms come from real execution
    const mergedDetailedResults = (evaluationResult.detailed_results || []).map((judgedCase) => {
      const executed = executionResults.find((r) => r.id === judgedCase.id) || {};
      return {
        ...judgedCase,
        actual_output: executed.actual_output || judgedCase.actual_output || '',
        latency_ms:    executed.latency_ms    || judgedCase.latency_ms    || 0,
        input:         executed.input         || judgedCase.input         || '',
        expected_output: executed.expected_output || judgedCase.expected_output || '',
        execution_error: executed.execution_error || null,
      };
    });

    // If judge didn't produce detailed_results entries, fall back to execution results
    const finalDetailedResults = mergedDetailedResults.length > 0
      ? mergedDetailedResults
      : executionResults.map((r) => ({
          id: r.id, name: r.name, test_type: r.test_type, priority: r.priority,
          passed: !r.execution_error,
          actual_output: r.actual_output,
          expected_output: r.expected_output,
          input: r.input,
          failure_reason: r.execution_error || '',
          latency_ms: r.latency_ms,
          scores: {},
          execution_error: r.execution_error,
        }));

    const summary = evaluationResult.summary || {};
    const passedCount = finalDetailedResults.filter((r) => r.passed).length;

    // ── Phase 3: Specialized Evaluation (if category specified) ────────────
    let specializedDimensionalScores = null;
    let specializedWeakness = null;
    let specializedSuggestions = [];
    let specializedScore = null;

    if (skill_category || specializedSkillText) {
      console.log(`[evaluate-skill] 开始 Phase 3 专项评估（${skill_category || '通用'}），使用${specializedSkillText ? '自定义评估标准' : '内置规则'}...`);

      // 如果上传了专项评估标准，用它做 system prompt；否则使用内置分类 prompt
      const specResultsText = finalDetailedResults
        .map((r, i) => `用例 ${i + 1}: ${r.name} (${r.test_type})\n输入: ${r.input}\n预期: ${r.expected_output}\n实际: ${r.actual_output}\n状态: ${r.passed ? '通过' : '失败'}`)
        .join('\n\n');
      const specializedUserMsg = specializedSkillText
        ? `请依据你的专项评估规则对以下技能进行评分。技能类别：${skill_category || '通用'}\n\n## 技能定义\n\`\`\`\n${skill_content}\n\`\`\`\n\n## 测试执行结果\n${specResultsText}\n\n请严格返回 JSON（不要输出其他内容）：\n{"dimensional_scores":{"维度名":{"score":4,"comment":"评分说明"}},"weakness_analysis":{"lowest_dimension":"","common_failures":[],"systematic_issues":[]},"optimization_suggestions":[{"dimension":"","priority":"高/中/低","issue":"","suggestion":"","expected_impact":""}]}`
        : buildSpecializedPrompt(skill_category, finalDetailedResults, skill_content);
      const specializedSystemPrompt = specializedSkillText || null;

      try {
        const specializedResponseText = await callLLMForEval(model_config || null, specializedUserMsg, 3000, specializedSystemPrompt);

        try {
          const jsonMatch = specializedResponseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const specializedResult = JSON.parse(jsonMatch[0]);
            specializedDimensionalScores = specializedResult.dimensional_scores || {};
            specializedWeakness = specializedResult.weakness_analysis || {};
            specializedSuggestions = specializedResult.optimization_suggestions || [];

            // Calculate specialized score from dimension scores
            const scores = Object.values(specializedDimensionalScores || {}).map((d) => {
              const score = typeof d === 'object' ? d?.score : d;
              return (score ?? 3) * 20;
            });
            specializedScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

            console.log(`[evaluate-skill] Phase 3 完成，专项评分: ${specializedScore}`);
          }
        } catch (parseErr) {
          console.error('[evaluate-skill] 专项评估结果解析失败，忽略', parseErr.message);
        }
      } catch (llmErr) {
        console.error('[evaluate-skill] 专项评估 LLM 调用失败，忽略', llmErr.message);
      }
    }

    // ── Phase 4: Volcano Evaluation (platform compliance) ──────────────
    let volcanoDimensionalScores = null;
    let volcanoComplianceSummary = null;
    let volcanoFixSuggestions = [];
    let volcanoScore = null;
    let volcanoSkipped = false;  // 标记火山评估是否被跳过

    // 如果上传了火山评估标准（volcano_eval_skill 或旧字段 volcano_rule_skill），执行 Phase 4；否则跳过
    if (!volcanoSkillText) {
      console.log('[evaluate-skill] 火山规则 Skill 未上传，跳过 Phase 4 火山评估');
      volcanoSkipped = true;
      volcanoComplianceSummary = '未获取标准（未上传火山规则 Skill）';
    } else {
      console.log(`[evaluate-skill] 开始 Phase 4 火山评估，使用${hasVolcanoScript ? 'Python 脚本（确定性）' : volcano_eval_skill ? 'LLM + 自定义标准' : 'LLM + 旧版规则'}...`);

      // ① 优先运行火山评估 Python 脚本（确定性评估）
      let volcScriptUsed = false;
      if (hasVolcanoScript) {
        const volcScriptResult = await runEvalScript(volcanoBase64, skill_content, skill_name, volcanoScriptName);
        if (volcScriptResult) {
          // 合并所有火山检查项（hard_failures + warnings + checks）
          const volcAllChecks = []
            .concat(volcScriptResult.checks         || [])
            .concat(volcScriptResult.hard_failures  || [])
            .concat(volcScriptResult.warnings       || [])
            // 去重（按 id）
            .filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i);
          volcanoDimensionalScores = mapCategoryScores(
            volcScriptResult.category_scores || {},
            volcanoDimensionMap,
            volcAllChecks,
          );
          volcanoComplianceSummary = volcScriptResult.volcano_assessment?.reason || '';

          // 构建火山合规优化建议（全中文，含命名规范问题）
          volcanoFixSuggestions = volcAllChecks
            .filter((c) => !c.passed)
            .map((c) => {
              const dimName  = volcanoDimensionMap[c.category]?.name || c.category || '火山合规';
              const priority = c.severity === 'hard' ? '高' : '低';

              // 生成中文问题描述
              let issueCn  = c.title || `检查项 ${c.id} 未通过`;
              // 如果标题是英文，补充说明
              if (/^[A-Za-z\s_\-:]+$/.test(issueCn)) {
                issueCn = `[${c.id}] ${issueCn}`;
              }

              // 生成中文修复建议（根据检查类别提供针对性指导）
              const evidence = c.evidence ? `当前值为："${c.evidence}"` : '';
              let fixCn;
              const catLower = (c.category || '').toLowerCase();
              if (catLower.includes('naming') || catLower.includes('name') || c.id?.toLowerCase().includes('name')) {
                fixCn = `【命名规范】请修正 Skill 命名，确保使用小写字母、数字和连字符，避免空格及特殊字符。${evidence}`;
              } else if (catLower.includes('metadata') || catLower.includes('meta')) {
                fixCn = `【元数据】请补全或修正 SKILL.md 中的元数据字段（如 name、description、version 等）。${evidence}`;
              } else if (catLower.includes('trigger') || catLower.includes('desc')) {
                fixCn = `【触发描述】请优化 Skill 的触发词或描述，确保语义清晰、符合规范。${evidence}`;
              } else if (catLower.includes('format') || catLower.includes('struct')) {
                fixCn = `【格式结构】请检查 SKILL.md 的文档格式，确保章节结构、Markdown 语法符合规范。${evidence}`;
              } else if (catLower.includes('security') || catLower.includes('safe')) {
                fixCn = `【安全合规】请检查并移除潜在的安全风险内容，确保 Skill 符合平台安全要求。${evidence}`;
              } else {
                fixCn = `请修复检查项 [${c.id}] 所指出的问题。${evidence ? evidence + '，' : ''}建议参照火山平台 Skill 规范进行修正。`;
              }

              return {
                dimension:       dimName,
                priority,
                issue:           issueCn,
                suggestion:      fixCn,
                expected_impact: c.available ? `可提升 ${c.available} 分` : '提升合规得分',
                source:          'volcano',
              };
            });
          volcanoScore = volcScriptResult.score ?? 0;
          volcScriptUsed = true;
          console.log(`[evaluate-skill] Phase 4 脚本评估成功，score: ${volcanoScore}`);
        } else {
          console.warn('[evaluate-skill] Phase 4 脚本执行失败，回退到 LLM');
        }
      }

      // ② 回退：LLM 评估（原有逻辑）
      if (!volcScriptUsed) {
      const volcanoUserMsg = volcano_eval_skill
        ? `请严格遵照系统提示（你的合规检查标准）中定义的检查维度，对以下技能进行合规评估。

⚠️ 关键约束（必须严格遵守）：
1. dimensional_scores 中的维度名称和数量必须与系统提示中定义的完全一致，一个不多，一个不少
2. 不得自行添加、删减或重命名任何检查维度
3. 评分标准、分值区间以系统提示为准

## 技能名称
${skill_name || '未提供'}

## 技能定义
\`\`\`
${skill_content}
\`\`\`

请严格返回 JSON（不要输出其他内容）。
- dimensional_scores 的每个 key 必须是系统提示中定义的检查维度名，有多少维度就写多少个 key
- 每个维度必须包含 score（实际得分）和 max（该维度在系统提示评分规则中的满分），从系统提示评分规则里直接读取满分值，不得估算或捏造
{"dimensional_scores":{"<维度1名>":{"score":45,"max":55,"comment":"评分理由","issues":[]},"<维度2名>":{"score":20,"max":25,"comment":"","issues":[]},"<...每个维度>":{"score":0,"max":0,"comment":"","issues":[]}},"compliance_summary":"总体合规性总结","fix_suggestions":[{"dimension":"","priority":"高/中/低","issue":"","fix":""}]}`
        : buildVolcanoPrompt(skill_content, skill_name || '', volcanoSkillText);
      const volcanoSystemPrompt = volcano_eval_skill ? volcanoSkillText : null;

      try {
        const volcanoResponseText = await callLLMForEval(model_config || null, volcanoUserMsg, 3000, volcanoSystemPrompt);
        try {
          const jsonMatch = volcanoResponseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const volcanoResult = JSON.parse(jsonMatch[0]);
            volcanoDimensionalScores = volcanoResult.dimensional_scores || {};
            volcanoComplianceSummary = volcanoResult.compliance_summary || '';
            volcanoFixSuggestions = volcanoResult.fix_suggestions || [];

            // 优先使用 max 字段（从 eval skill 读取的维度满分），sum(score)/sum(max)×100
            const volcEntries = Object.entries(volcanoDimensionalScores);
            const volcHasMax = volcEntries.some(([, d]) => typeof d === 'object' && d?.max != null && d.max > 0);
            if (volcHasMax) {
              let volcEarned = 0, volcTotal = 0;
              for (const [, d] of volcEntries) {
                volcEarned += typeof d === 'object' ? (d?.score ?? 0) : (d ?? 0);
                volcTotal  += typeof d === 'object' ? (d?.max   ?? 0) : 0;
              }
              volcanoScore = volcTotal > 0 ? Math.round(volcEarned / volcTotal * 100) : 0;
              console.log(`[evaluate-skill] Phase 4 完成，火山评分（加权满分模式）: ${volcEarned}/${volcTotal} → ${volcanoScore}`);
            } else {
              // 兜底：自动检测分制
              const volcRaw = volcEntries.map(([, d]) => typeof d === 'object' ? (d?.score ?? 0) : (d ?? 0));
              const volcMaxRaw = volcRaw.length > 0 ? Math.max(...volcRaw) : 0;
              const volcNorm = volcMaxRaw > 5 ? (s) => s : (s) => s * 20;
              const volcNormalized = volcRaw.map(volcNorm);
              volcanoScore = volcNormalized.length > 0
                ? Math.round(volcNormalized.reduce((a, b) => a + b, 0) / volcNormalized.length) : 0;
              console.log(`[evaluate-skill] Phase 4 完成，火山评分（均值模式）: ${volcanoScore}`);
            }
          }
        } catch (parseErr) {
          console.error('[evaluate-skill] 火山评估结果解析失败，忽略', parseErr.message);
        }
      } catch (llmErr) {
        console.error('[evaluate-skill] 火山评估 LLM 调用失败，忽略', llmErr.message);
      }
      } // end if (!volcScriptUsed)
    }

    // ── Server-side score calculation — 读取 skill 定义的维度满分，零硬编码 ──
    // 脚本评估路径：脚本已直接输出 0-100 的 score，无需重新计算
    const dimScores = evaluationResult?.dimensional_scores || {};
    let genericScore;
    const dimEntries = Object.entries(dimScores);

    if (scriptUsed && evaluationResult?.script_score != null) {
      // 脚本评估：直接使用脚本输出的总分（脚本已按维度权重计算）
      genericScore = evaluationResult.script_score;
      console.log(`[evaluate-skill] 通用评分（脚本）: ${genericScore}`);
    } else if (dimEntries.length > 0) {
      // LLM 评估：根据 max 字段或自动检测分制
      const hasMax = dimEntries.some(([, d]) => typeof d === 'object' && d?.max != null && d.max > 0);
      if (hasMax) {
        let totalEarned = 0, totalMax = 0;
        for (const [, d] of dimEntries) {
          const earned = typeof d === 'object' ? (d?.score ?? 0) : (d ?? 0);
          const dMax   = typeof d === 'object' ? (d?.max   ?? 0) : 0;
          totalEarned += earned;
          totalMax    += dMax;
        }
        genericScore = totalMax > 0 ? Math.round(totalEarned / totalMax * 100) : 0;
        console.log(`[evaluate-skill] 通用评分（加权满分模式）: ${totalEarned}/${totalMax} → ${genericScore}`);
      } else {
        const rawScores = dimEntries.map(([, d]) => typeof d === 'object' ? (d?.score ?? 0) : (d ?? 0));
        const maxRaw = Math.max(...rawScores);
        const normalize = maxRaw > 5 ? (s) => s : (s) => s * 20;
        genericScore = Math.round(rawScores.map(normalize).reduce((a, b) => a + b, 0) / rawScores.length);
        console.log(`[evaluate-skill] 通用评分（均值模式，分制=${maxRaw > 5 ? '百分制' : '1-5制'}）: ${genericScore}`);
      }
    } else {
      genericScore = 0;
      console.warn('[evaluate-skill] 无维度数据，通用评分设为 0');
    }

    // 综合评分 = 通用×80% + 火山×20%（如果有火山评分）；否则 = 通用100%
    const computedOverall = volcanoScore !== null
      ? Math.round(genericScore * 0.8 + volcanoScore * 0.2)
      : genericScore;

    console.log(`[evaluate-skill] 评估完成，通过 ${passedCount}/${finalDetailedResults.length}，加权总分: ${computedOverall}`);

    res.json({
      success: true,
      evaluation_mode: 'real',
      skill_category: skill_category || null,
      // 评估来源（script = Python 脚本确定性评估，llm = LLM Judge 评估）
      evaluation_source: scriptUsed ? 'script' : 'llm',
      script_checks: scriptUsed ? (evaluationResult?.script_checks || []) : [],
      script_assessment: scriptUsed ? (evaluationResult?.script_assessment || null) : null,
      // 标记Judge是否被跳过
      judge_skipped: judgeSkipped,
      judge_skip_reason: judgeSkipped && !scriptUsed ? evaluationResult?.judge_skip_reason : null,
      // 标记火山评估是否被跳过
      volcano_skipped: volcanoSkipped,
      volcano_skip_reason: volcanoSkipped ? '未上传火山规则 Skill' : null,
      summary: {
        overall_score: computedOverall,
        generic_score: genericScore,
        volcano_score: volcanoScore,
        total_tests:   finalDetailedResults.length,
        passed_tests:  summary.passed_tests  ?? passedCount,
        failed_tests:  summary.failed_tests  ?? (finalDetailedResults.length - passedCount),
        pass_rate:     summary.pass_rate     ?? (finalDetailedResults.length > 0 ? passedCount / finalDetailedResults.length : 0),
      },
      dimensional_scores:       evaluationResult.dimensional_scores      || {},
      detailed_results:         finalDetailedResults,
      weakness_analysis:        evaluationResult.weakness_analysis       || {},
      optimization_suggestions: mergeOptimizationSuggestions(
        evaluationResult.optimization_suggestions || [],
        specializedSuggestions,
        volcanoFixSuggestions,
      ),
      // Specialized evaluation results
      specialized_dimensional_scores: specializedDimensionalScores || null,
      specialized_weakness_analysis: specializedWeakness || null,
      specialized_suggestions: specializedSuggestions || [],
      // Volcano evaluation results
      volcano_score: volcanoScore,
      volcano_dimensional_scores: volcanoDimensionalScores || null,
      volcano_compliance_summary: volcanoComplianceSummary || null,
      volcano_fix_suggestions: volcanoFixSuggestions || [],
      // Include execution log for export
      execution_log: executionResults.map((r) => ({
        id: r.id, name: r.name, input: r.input,
        expected_output: r.expected_output, actual_output: r.actual_output,
        latency_ms: r.latency_ms, execution_error: r.execution_error,
      })),
    });

  } catch (error) {
    console.error('Skill evaluation error:', error.message, error.stack);
    res.status(500).json({ error: '技能评估失败', details: error.message });
  }
});

/**
 * POST /api/export-report
 * Generate a Markdown evaluation report from the evaluation results
 */
app.post('/api/export-report', (req, res) => {
  try {
    const { skill_name, skill_version, model_name, results } = req.body;
    if (!results) return res.status(400).json({ error: '缺少评估结果' });

    const s = results.summary || {};
    const dim = results.dimensional_scores || {};
    const detailed = results.detailed_results || [];
    const weakness = results.weakness_analysis || {};
    const suggestions = results.optimization_suggestions || [];
    const execLog = results.execution_log || [];
    const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

    const mapTo100 = (entry) => {
      const score = typeof entry === 'object' ? entry?.score : entry;
      return (score ?? 3) * 20;
    };

    let md = `# 技能评估报告\n\n`;
    md += `| 项目 | 信息 |\n|---|---|\n`;
    md += `| 技能名称 | ${skill_name || '未知'} |\n`;
    md += `| 技能版本 | ${skill_version || '未知'} |\n`;
    md += `| 测试模型 | ${model_name || '未知'} |\n`;
    md += `| 评估时间 | ${now} |\n`;
    md += `| 评估模式 | ${results.evaluation_mode === 'real' ? '真实执行' : '模拟'} |\n\n`;

    // ── Overall Scores ──
    md += `## 一、综合评分\n\n`;
    md += `| 指标 | 分数 |\n|---|---|\n`;
    md += `| **总体评分** | **${s.overall_score ?? 0}/100** |\n`;
    md += `| 质量维度 (40%) | ${s.quality_score ?? 0}/100 |\n`;
    md += `| 功能维度 (35%) | ${s.functionality_score ?? 0}/100 |\n`;
    md += `| 安全合规 (25%) | ${s.safety_score ?? 0}/100 |\n`;
    md += `| 测试通过率 | ${s.passed_tests ?? 0}/${s.total_tests ?? 0} (${s.pass_rate != null ? Math.round(s.pass_rate * 100) : 0}%) |\n\n`;

    md += `> 计算公式: 总体评分 = 质量维度×40% + 功能维度×35% + 安全合规×25%\n\n`;

    // ── Dimensional Scores ──
    md += `## 二、维度评分详情（1-5 分制）\n\n`;
    md += `| 维度 | 评分 | 映射百分 | 权重归属 | 评价说明 |\n|---|---|---|---|---|\n`;
    for (const [key, entry] of Object.entries(dim)) {
      const score = typeof entry === 'object' ? entry?.score : entry;
      const comment = typeof entry === 'object' ? entry?.comment : '';
      const weight = typeof entry === 'object' ? entry?.weight : '';
      md += `| ${key} | ${score ?? '-'}/5 | ${mapTo100(entry)}/100 | ${weight || '-'} | ${comment || '-'} |\n`;
    }
    md += `\n`;

    // ── Test Execution Process ──
    md += `## 三、测试执行过程\n\n`;
    md += `共执行 **${execLog.length || detailed.length}** 条测试用例。\n\n`;

    const logSource = execLog.length > 0 ? execLog : detailed;
    logSource.forEach((r, i) => {
      md += `### 用例 ${r.id || i + 1}: ${r.name || '未命名'}\n\n`;
      md += `- **执行耗时**: ${r.latency_ms ?? 0}ms\n`;
      if (r.execution_error) md += `- **执行错误**: ${r.execution_error}\n`;
      md += `\n**输入内容:**\n\`\`\`\n${r.input || '(空)'}\n\`\`\`\n\n`;
      md += `**预期输出:**\n\`\`\`\n${r.expected_output || '(空)'}\n\`\`\`\n\n`;
      md += `**实际输出:**\n\`\`\`\n${r.actual_output || '(空)'}\n\`\`\`\n\n`;
    });

    // ── Detailed Results ──
    md += `## 四、评估结果详情\n\n`;
    md += `| 序号 | 用例名 | 类型 | 优先级 | 状态 | 有用性 | 稳定性 | 准确性 | 安全性 | 耗时 |\n`;
    md += `|---|---|---|---|---|---|---|---|---|---|\n`;
    detailed.forEach((r) => {
      const scores = r.scores || {};
      md += `| ${r.id || '-'} | ${r.name || '-'} | ${r.test_type || '-'} | ${r.priority || '-'} | ${r.passed ? '通过' : '**失败**'} | ${scores['有用性'] ?? '-'} | ${scores['稳定性'] ?? '-'} | ${scores['准确性'] ?? '-'} | ${scores['安全性'] ?? '-'} | ${r.latency_ms ?? 0}ms |\n`;
    });
    md += `\n`;

    // Failed case details
    const failedCases = detailed.filter((r) => !r.passed);
    if (failedCases.length > 0) {
      md += `### 失败用例分析\n\n`;
      failedCases.forEach((r) => {
        md += `- **${r.name || r.id}**: ${r.failure_reason || '未说明失败原因'}\n`;
      });
      md += `\n`;
    }

    // ── Weakness Analysis ──
    if (weakness && Object.keys(weakness).length > 0) {
      md += `## 五、弱点分析\n\n`;
      if (weakness.lowest_dimension) md += `- **最低得分维度**: ${weakness.lowest_dimension}\n`;
      if (weakness.common_failures?.length > 0) {
        md += `- **常见失败模式**:\n`;
        weakness.common_failures.forEach((f) => { md += `  - ${f}\n`; });
      }
      if (weakness.systematic_issues?.length > 0) {
        md += `- **系统性问题**:\n`;
        weakness.systematic_issues.forEach((f) => { md += `  - ${f}\n`; });
      }
      md += `\n`;
    }

    // ── Optimization Suggestions ──
    if (suggestions.length > 0) {
      md += `## 六、优化建议\n\n`;
      const priorityOrder = { '高': 0, 'high': 0, '中': 1, 'medium': 1, '低': 2, 'low': 2 };
      const sorted = [...suggestions].sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9));
      sorted.forEach((s, i) => {
        const pCn = { 'high': '高', 'medium': '中', 'low': '低' }[s.priority] || s.priority;
        md += `### ${i + 1}. [${pCn}优先] ${s.dimension || '通用'}\n\n`;
        md += `- **问题**: ${s.issue || '-'}\n`;
        md += `- **建议**: ${s.suggestion || '-'}\n`;
        if (s.expected_impact) md += `- **预期提升**: ${s.expected_impact}\n`;
        md += `\n`;
      });
    }

    md += `---\n\n*本报告由 Skill Evaluator 平台自动生成*\n`;

    res.json({ success: true, markdown: md });
  } catch (error) {
    console.error('Export report error:', error.message);
    res.status(500).json({ error: '报告生成失败', details: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// HISTORY API ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// In-memory history store (will be persisted to file in production)
const historyData = {
  testHistory: [],
  evalHistory: [],
};

// Helper: Convert ISO string to Date
function parseDate(isoString) {
  return new Date(isoString);
}

// Helper: Check if record is within 7 days
function isWithin7Days(timestamp) {
  const recordDate = typeof timestamp === 'string' ? parseDate(timestamp) : timestamp;
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return recordDate >= sevenDaysAgo;
}

// Helper: Clean up old records (7+ days)
function cleanupOldRecords() {
  historyData.testHistory = historyData.testHistory.filter(r => isWithin7Days(r.timestamp));
  historyData.evalHistory = historyData.evalHistory.filter(r => isWithin7Days(r.timestamp));
}

/**
 * POST /api/history/test
 * Save a skill test record
 */
app.post('/api/history/test', (req, res) => {
  try {
    const { skill_id, skill_name, test_input, test_output, model, latency, timestamp } = req.body;

    const record = {
      id: Date.now().toString(),
      skill_id,
      skill_name,
      test_input,
      test_output,
      model,
      latency,
      timestamp: timestamp || new Date().toISOString(),
    };

    historyData.testHistory.push(record);
    cleanupOldRecords(); // Cleanup old records
    console.log(`[history] Saved test record for skill: ${skill_id}`);

    res.json({ success: true, record });
  } catch (error) {
    console.error('[history] Error saving test record:', error);
    res.status(500).json({ error: '保存失败' });
  }
});

/**
 * GET /api/history/tests
 * Fetch test history for a skill
 */
app.get('/api/history/tests', (req, res) => {
  try {
    const { skill_id, limit = 50 } = req.query;
    cleanupOldRecords();

    let records = skill_id
      ? historyData.testHistory.filter(r => r.skill_id === skill_id)
      : historyData.testHistory;

    // Sort by timestamp descending (newest first)
    records = records.sort((a, b) => parseDate(b.timestamp) - parseDate(a.timestamp));
    records = records.slice(0, parseInt(limit));

    res.json(records);
  } catch (error) {
    console.error('[history] Error fetching test records:', error);
    res.status(500).json({ error: '查询失败' });
  }
});

/**
 * POST /api/history/eval
 * Save a skill evaluation record
 */
app.post('/api/history/eval', (req, res) => {
  try {
    const { skill_id, skill_name, scores, avg_score, optimization_suggestions, weakness_analysis, model, timestamp } = req.body;

    const record = {
      id: Date.now().toString(),
      skill_id,
      skill_name,
      scores,
      avg_score,
      optimization_suggestions,
      weakness_analysis,
      model,
      timestamp: timestamp || new Date().toISOString(),
    };

    historyData.evalHistory.push(record);
    cleanupOldRecords(); // Cleanup old records
    console.log(`[history] Saved eval record for skill: ${skill_id}`);

    res.json({ success: true, record });
  } catch (error) {
    console.error('[history] Error saving eval record:', error);
    res.status(500).json({ error: '保存失败' });
  }
});

/**
 * GET /api/history/evals
 * Fetch evaluation history for a skill
 */
app.get('/api/history/evals', (req, res) => {
  try {
    const { skill_id, limit = 30 } = req.query;
    cleanupOldRecords();

    let records = skill_id
      ? historyData.evalHistory.filter(r => r.skill_id === skill_id)
      : historyData.evalHistory;

    // Sort by timestamp descending
    records = records.sort((a, b) => parseDate(b.timestamp) - parseDate(a.timestamp));
    records = records.slice(0, parseInt(limit));

    res.json(records);
  } catch (error) {
    console.error('[history] Error fetching eval records:', error);
    res.status(500).json({ error: '查询失败' });
  }
});

/**
 * GET /api/history/trends
 * Fetch evaluation trends for chart display
 */
app.get('/api/history/trends', (req, res) => {
  try {
    const { skill_id, days = 7 } = req.query;
    cleanupOldRecords();

    // Filter records within the specified days
    const now = new Date();
    const targetDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    let records = historyData.evalHistory.filter(r => {
      if (skill_id && r.skill_id !== skill_id) return false;
      return parseDate(r.timestamp) >= targetDate;
    });

    // Group by date and calculate daily averages
    const grouped = {};
    records.forEach(r => {
      const date = parseDate(r.timestamp).toLocaleDateString('zh-CN');
      if (!grouped[date]) {
        grouped[date] = { scores: [], count: 0 };
      }
      grouped[date].scores.push(r.avg_score || 0);
      grouped[date].count += 1;
    });

    // Convert to chart-friendly format
    const trends = Object.entries(grouped).map(([date, data]) => ({
      date,
      avgScore: Math.round((data.scores.reduce((a, b) => a + b, 0) / data.count) * 10) / 10,
      count: data.count,
      scores: data.scores,
    }));

    // Sort by date
    trends.sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json(trends);
  } catch (error) {
    console.error('[history] Error fetching trends:', error);
    res.status(500).json({ error: '查询失败' });
  }
});

/**
 * DELETE /api/history/test/:id
 * Delete a test record
 */
app.delete('/api/history/test/:id', (req, res) => {
  try {
    const { id } = req.params;
    const index = historyData.testHistory.findIndex(r => r.id === id);

    if (index === -1) {
      return res.status(404).json({ error: '记录不存在' });
    }

    historyData.testHistory.splice(index, 1);
    res.json({ success: true });
  } catch (error) {
    console.error('[history] Error deleting test record:', error);
    res.status(500).json({ error: '删除失败' });
  }
});

/**
 * DELETE /api/history/eval/:id
 * Delete an evaluation record
 */
app.delete('/api/history/eval/:id', (req, res) => {
  try {
    const { id } = req.params;
    const index = historyData.evalHistory.findIndex(r => r.id === id);

    if (index === -1) {
      return res.status(404).json({ error: '记录不存在' });
    }

    historyData.evalHistory.splice(index, 1);
    res.json({ success: true });
  } catch (error) {
    console.error('[history] Error deleting eval record:', error);
    res.status(500).json({ error: '删除失败' });
  }
});

/**
 * DELETE /api/history/clear
 * Clear all history for a skill
 */
app.delete('/api/history/clear', (req, res) => {
  try {
    const { skill_id } = req.query;

    if (!skill_id) {
      return res.status(400).json({ error: 'skill_id 必需' });
    }

    historyData.testHistory = historyData.testHistory.filter(r => r.skill_id !== skill_id);
    historyData.evalHistory = historyData.evalHistory.filter(r => r.skill_id !== skill_id);

    console.log(`[history] Cleared all history for skill: ${skill_id}`);
    res.json({ success: true });
  } catch (error) {
    console.error('[history] Error clearing history:', error);
    res.status(500).json({ error: '清除失败' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    details: err.message,
  });
});

// SPA fallback — serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Skill evaluator server running on http://0.0.0.0:${PORT}`);
});
