/**
 * CommonJS 格式测试函数，用于调试 502 问题
 */

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  
  return res.status(200).json({
    status: 'ok',
    message: 'CommonJS 测试成功',
    timestamp: new Date().toISOString()
  });
};
