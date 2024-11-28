window.ModelAPI = class ModelAPI {
  constructor(model, apiKey) {
    this.model = model;
    this.apiKey = apiKey;
    this.baseURL = this.getBaseURL(model);
  }

  getBaseURL(model) {
    switch (model) {
      case 'deepseek':
        return 'https://api.deepseek.com';
      case 'yi':
        return 'https://api.lingyiwanwu.com';
      case 'gpt4o':
        return 'https://api.openai.com';
      case 'claude':
        return 'https://api.anthropic.com';
      default:
        return 'https://api.deepseek.com';
    }
  }

  async generateCode(prompt) {
    try {
      const response = await fetch(`${this.baseURL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.getModelName(),
          messages: [
            {
              role: "system",
              content: "You are a web development expert who helps users modify HTML elements. Always respond with only the HTML code, no explanations."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 2000
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'API调用失败');
      }

      const data = await response.json();
      return data.choices[0].message.content.trim();
    } catch (error) {
      console.error('API调用错误:', error);
      throw error;
    }
  }

  getModelName() {
    switch (this.model) {
      case 'deepseek':
        return 'deepseek-chat';
      case 'yi':
        return 'yi-34b-chat';
      case 'gpt4o':
        return 'gpt-4';
      case 'claude':
        return 'claude-3-sonnet';
      default:
        return 'deepseek-chat';
    }
  }
} 