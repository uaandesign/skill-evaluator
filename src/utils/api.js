const API_BASE_URL = import.meta.env?.VITE_API_URL || '';

export async function chatWithModel({ provider, apiKey, model, messages, systemPrompt, tools, baseUrl }) {
  const startTime = Date.now();

  try {
    const payload = {
      provider,
      model,
      messages,
      systemPrompt,
      tools: tools || [],
      apiKey,
      baseUrl: baseUrl || undefined,
    };

    // Add 300s timeout for slow models (Qwen, Doubao, etc.)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300_000);

    let response;
    try {
      response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const latency = Date.now() - startTime;

    // Extract content from server response format: { provider, model, response: { role, content }, usage }
    let extractedContent = '';
    if (data.response) {
      if (typeof data.response.content === 'string') {
        extractedContent = data.response.content;
      } else if (Array.isArray(data.response.content)) {
        // Anthropic returns content as array of blocks
        extractedContent = data.response.content
          .filter(block => block.type === 'text')
          .map(block => block.text)
          .join('\n');
      }
    } else if (data.content) {
      extractedContent = typeof data.content === 'string' ? data.content : JSON.stringify(data.content);
    }

    return {
      content: extractedContent,
      usage: {
        prompt_tokens: data.usage?.input_tokens || data.usage?.prompt_tokens || 0,
        completion_tokens: data.usage?.output_tokens || data.usage?.completion_tokens || 0,
        inputTokens: data.usage?.input_tokens || data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.output_tokens || data.usage?.completion_tokens || 0,
        totalTokens: (data.usage?.input_tokens || data.usage?.prompt_tokens || 0) + (data.usage?.output_tokens || data.usage?.completion_tokens || 0)
      },
      latency,
      model: data.model || model,
      provider: data.provider || provider,
      stopReason: data.stop_reason || null,
      rawResponse: data
    };
  } catch (error) {
    return {
      content: null,
      error: error.message,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      latency: Date.now() - startTime,
      success: false
    };
  }
}

export async function searchGitHubSkills(query, token) {
  const startTime = Date.now();

  try {
    const response = await fetch(`${API_BASE_URL}/api/github/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: token || undefined,
        query,
        minStars: 1000,
      }),
    });

    if (!response.ok) {
      throw new Error(`GitHub search failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const latency = Date.now() - startTime;

    const repos = (data.items || []).map(item => ({
      id: item.id,
      name: item.name,
      fullName: item.full_name,
      description: item.description,
      url: item.html_url,
      stars: item.stargazers_count,
      forks: item.forks_count,
      language: item.language,
      topics: item.topics || [],
      updatedAt: item.updated_at,
      hasSkillFile: item.name.includes('skill') || item.topics?.includes('skill'),
      owner: {
        login: item.owner.login,
        avatarUrl: item.owner.avatar_url
      }
    }));

    return {
      success: true,
      results: repos,
      total: data.total_count,
      latency,
      pageInfo: {
        hasNextPage: repos.length >= 30,
        endCursor: repos.length > 0 ? repos[repos.length - 1].id : null
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      results: [],
      total: 0,
      latency: Date.now() - startTime
    };
  }
}

export async function fetchGitHubContent(owner, repo, path, token) {
  const startTime = Date.now();

  try {
    const response = await fetch(`${API_BASE_URL}/api/github/content`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: token || undefined,
        owner,
        repo,
        path: path || 'SKILL.md',
      }),
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: false,
          error: `File not found: ${path}`,
          content: null,
          latency: Date.now() - startTime,
          exists: false
        };
      }
      throw new Error(`Failed to fetch content: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const latency = Date.now() - startTime;

    let content = null;
    let encoding = 'utf-8';

    if (data.content) {
      if (data.encoding === 'base64') {
        content = Buffer.from(data.content, 'base64').toString('utf-8');
        encoding = 'utf-8';
      } else {
        content = data.content;
      }
    }

    return {
      success: true,
      content,
      metadata: {
        name: data.name || path,
        path: data.path || path,
        sha: data.sha,
        size: data.size,
        type: data.type,
        encoding,
        url: data.html_url || `https://github.com/${owner}/${repo}/blob/main/${path}`,
        downloadUrl: data.download_url
      },
      latency,
      exists: true,
      rawResponse: data
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      content: null,
      latency: Date.now() - startTime,
      exists: false
    };
  }
}

export async function validateApiKey(provider, apiKey) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/validate-key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ provider, apiKey })
    });

    if (!response.ok) {
      return {
        valid: false,
        error: 'Invalid API key'
      };
    }

    const data = await response.json();
    return {
      valid: data.valid || true,
      provider: data.provider,
      model: data.defaultModel
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
}

export async function uploadSkillFile(skillFile, skillName) {
  const startTime = Date.now();

  try {
    const formData = new FormData();
    formData.append('file', skillFile);
    formData.append('name', skillName);

    const response = await fetch(`${API_BASE_URL}/api/skills/upload`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const latency = Date.now() - startTime;

    return {
      success: true,
      skillId: data.id,
      skillName: data.name,
      url: data.url,
      latency,
      message: 'Skill uploaded successfully'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      latency: Date.now() - startTime
    };
  }
}

export async function getSkillEvaluation(skillId) {
  const startTime = Date.now();

  try {
    const response = await fetch(`${API_BASE_URL}/api/skills/${skillId}/evaluation`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch evaluation: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const latency = Date.now() - startTime;

    return {
      success: true,
      evaluation: data,
      latency,
      cached: data.cached || false
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      latency: Date.now() - startTime
    };
  }
}

export async function listSkills(filters = {}) {
  const startTime = Date.now();

  try {
    const params = new URLSearchParams();
    if (filters.category) params.append('category', filters.category);
    if (filters.provider) params.append('provider', filters.provider);
    if (filters.sort) params.append('sort', filters.sort);
    if (filters.limit) params.append('limit', filters.limit);
    if (filters.offset) params.append('offset', filters.offset);

    const response = await fetch(`${API_BASE_URL}/api/skills?${params}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to list skills: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const latency = Date.now() - startTime;

    return {
      success: true,
      skills: data.skills || [],
      total: data.total || 0,
      latency,
      pageInfo: {
        limit: data.limit || 20,
        offset: data.offset || 0,
        hasMore: (data.offset || 0) + (data.skills?.length || 0) < (data.total || 0)
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      skills: [],
      latency: Date.now() - startTime
    };
  }
}

export async function deleteSkill(skillId) {
  const startTime = Date.now();

  try {
    const response = await fetch(`${API_BASE_URL}/api/skills/${skillId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Delete failed: ${response.status} ${response.statusText}`);
    }

    const latency = Date.now() - startTime;

    return {
      success: true,
      message: 'Skill deleted successfully',
      latency
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      latency: Date.now() - startTime
    };
  }
}

export async function evaluateSkillContent(skillContent, skillFormat = 'auto') {
  const startTime = Date.now();

  try {
    const response = await fetch(`${API_BASE_URL}/api/evaluate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: skillContent,
        format: skillFormat
      })
    });

    if (!response.ok) {
      throw new Error(`Evaluation failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const latency = Date.now() - startTime;

    return {
      success: true,
      evaluation: data,
      latency
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      latency: Date.now() - startTime
    };
  }
}
