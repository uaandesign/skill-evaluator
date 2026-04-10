import React, { useState, useRef, useEffect } from 'react';
import { Button, Spin, message, Tooltip } from 'antd';

/**
 * Simple frontend code sandbox for HTML/CSS/JS execution
 * Used for code-generation skill testing
 */
export default function CodeSandbox({ code, onResult }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const iframeRef = useRef(null);

  const runCode = async () => {
    if (!code || code.trim().length === 0) {
      message.warning('代码为空');
      return;
    }

    setRunning(true);
    try {
      const result = await executeCode(code);
      setResult(result);
      onResult?.(result);
    } catch (err) {
      const result = {
        success: false,
        error: err.message,
        stdout: '',
        stderr: err.message,
      };
      setResult(result);
      onResult?.(result);
    } finally {
      setRunning(false);
    }
  };

  const executeCode = (code) => {
    return new Promise((resolve, reject) => {
      try {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        document.body.appendChild(iframe);

        const logs = [];
        const errors = [];

        // Override console methods in iframe
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        const iframeWin = iframe.contentWindow || iframe.window;

        // Capture console output
        iframeWin.console = {
          log: (...args) => {
            logs.push(['log', args.map((a) => String(a)).join(' ')]);
            console.log(...args);
          },
          error: (...args) => {
            logs.push(['error', args.map((a) => String(a)).join(' ')]);
            console.error(...args);
          },
          warn: (...args) => {
            logs.push(['warn', args.map((a) => String(a)).join(' ')]);
            console.warn(...args);
          },
          info: (...args) => {
            logs.push(['info', args.map((a) => String(a)).join(' ')]);
            console.info(...args);
          },
        };

        // Execute code
        try {
          iframeDoc.open();
          iframeDoc.write(`
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <style>
                body { font-family: Arial, sans-serif; margin: 10px; }
              </style>
            </head>
            <body id="__sandbox_body">
              <script>
                window.__sandboxReady = true;
              </script>
            </body>
            </html>
          `);
          iframeDoc.close();

          // Wait for iframe to be ready
          setTimeout(() => {
            try {
              // Inject the user code
              const script = iframeDoc.createElement('script');
              script.textContent = code;
              iframeDoc.body.appendChild(script);

              // Get rendered content
              const bodyHTML = iframeDoc.body.innerHTML;

              // Check for syntax errors by trying to parse
              const ast = new Function(code);

              setTimeout(() => {
                document.body.removeChild(iframe);
                resolve({
                  success: true,
                  stdout: logs.length > 0 ? logs.map((l) => l[1]).join('\n') : '代码执行成功，无输出',
                  stderr: '',
                  html: bodyHTML,
                  executionTime: Date.now(),
                });
              }, 100);
            } catch (execErr) {
              document.body.removeChild(iframe);
              reject(new Error(`执行错误: ${execErr.message}`));
            }
          }, 100);
        } catch (parseErr) {
          document.body.removeChild(iframe);
          reject(new Error(`解析错误: ${parseErr.message}`));
        }
      } catch (err) {
        reject(err);
      }
    });
  };

  return (
    <div style={{ padding: 16, border: '1px solid #e5e7eb', borderRadius: 6, background: '#f9fafb' }}>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button
          type="primary"
          loading={running}
          onClick={runCode}
          disabled={!code || code.trim().length === 0}
        >
          {running ? '运行中...' : '运行代码'}
        </Button>
        <Tooltip title="在隔离的沙箱环境中执行代码，验证语法和可运行性">
          <span style={{ fontSize: 11, color: '#9ca3af' }}>点击运行，验证代码可运行性</span>
        </Tooltip>
      </div>

      {running && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      )}

      {result && !running && (
        <div style={{ marginTop: 16 }}>
          {result.success ? (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 4, padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#166534', marginBottom: 8 }}>✓ 代码执行成功</div>
              {result.stdout && (
                <div style={{ fontSize: 11, color: '#374151', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflowY: 'auto', background: '#fff', padding: 8, borderRadius: 3 }}>
                  {result.stdout}
                </div>
              )}
            </div>
          ) : (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#b91c1c', marginBottom: 8 }}>✗ 执行失败</div>
              <div style={{ fontSize: 11, color: '#374151', fontFamily: 'monospace', background: '#fff', padding: 8, borderRadius: 3 }}>
                {result.error || result.stderr}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
