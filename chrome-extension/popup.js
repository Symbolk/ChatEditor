document.addEventListener('DOMContentLoaded', async () => {
  const modelSelect = document.getElementById('modelSelect');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const saveApiKeyBtn = document.getElementById('saveApiKey');
  const apiStatus = document.getElementById('apiStatus');
  const startEditBtn = document.getElementById('startEdit');
  
  // 加载保存的模型选择
  try {
    const savedModel = await chrome.storage.local.get('selectedModel');
    if (savedModel.selectedModel) {
      modelSelect.value = savedModel.selectedModel;
    }
  } catch (error) {
    console.error('加载模型选择失败:', error);
  }
  
  // 检查API Key状态
  const checkApiKeyStatus = async () => {
    try {
      const keys = await chrome.storage.local.get(['gpt4oKey', 'claudeKey', 'deepseekKey', 'yiKey']);
      const currentModel = modelSelect.value;
      const keyMap = {
        'gpt4o': 'gpt4oKey',
        'claude': 'claudeKey',
        'deepseek': 'deepseekKey',
        'yi': 'yiKey'
      };
      
      const currentKey = keys[keyMap[currentModel]];
      console.log('当前模型:', currentModel, '是否有Key:', !!currentKey);
      
      if (currentKey) {
        apiStatus.textContent = `API Key已保存: ${'*'.repeat(8)}`;
        apiStatus.style.color = '#8B5CF6';
        apiKeyInput.value = '';
        apiKeyInput.placeholder = '*'.repeat(20);
        startEditBtn.disabled = false;
        saveApiKeyBtn.textContent = '已保存';
        saveApiKeyBtn.classList.add('saved');
        saveApiKeyBtn.disabled = true;
      } else {
        apiStatus.textContent = '请输入API Key';
        apiStatus.style.color = '#EC4899';
        apiKeyInput.placeholder = '输入API Key';
        startEditBtn.disabled = true;
        saveApiKeyBtn.textContent = '保存API Key';
        saveApiKeyBtn.classList.remove('saved');
        saveApiKeyBtn.disabled = false;
      }
    } catch (error) {
      console.error('检查API Key状态失败:', error);
      apiStatus.textContent = '状态检查失败';
      apiStatus.style.color = '#EC4899';
    }
  };
  
  // 初始检查API Key状态
  await checkApiKeyStatus();
  
  // 监听输入框变化
  apiKeyInput.addEventListener('input', () => {
    const value = apiKeyInput.value.trim();
    if (value) {
      saveApiKeyBtn.textContent = '保存API Key';
      saveApiKeyBtn.classList.remove('saved');
      saveApiKeyBtn.disabled = false;
      startEditBtn.disabled = true;
      apiStatus.textContent = '请保存API Key';
      apiStatus.style.color = '#EC4899';
    } else {
      checkApiKeyStatus();
    }
  });
  
  // 监听模型选择变化
  modelSelect.addEventListener('change', async () => {
    try {
      apiKeyInput.value = '';
      await chrome.storage.local.set({ selectedModel: modelSelect.value });
      await checkApiKeyStatus();
    } catch (error) {
      console.error('切换模型失败:', error);
    }
  });
  
  // 保存API Key
  saveApiKeyBtn.addEventListener('click', async () => {
    console.log('点击保存按钮');
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      apiStatus.textContent = 'API Key不能为空';
      apiStatus.style.color = '#EC4899';
      return;
    }
    
    try {
      const currentModel = modelSelect.value;
      const keyMap = {
        'gpt4o': 'gpt4oKey',
        'claude': 'claudeKey',
        'deepseek': 'deepseekKey',
        'yi': 'yiKey'
      };
      
      console.log('保存Key:', currentModel);
      await chrome.storage.local.set({ [keyMap[currentModel]]: apiKey });
      console.log('Key保存成功');
      
      // 立即更新按钮状态
      saveApiKeyBtn.textContent = '已保存';
      saveApiKeyBtn.classList.add('saved');
      saveApiKeyBtn.disabled = true;
      startEditBtn.disabled = false;
      
      // 更新状态显示
      apiStatus.textContent = `API Key已保存: ${'*'.repeat(8)}`;
      apiStatus.style.color = '#8B5CF6';
      apiKeyInput.value = '';
      apiKeyInput.placeholder = '*'.repeat(20);
      
    } catch (error) {
      console.error('保存API Key失败:', error);
      apiStatus.textContent = '保存失败，请重试';
      apiStatus.style.color = '#EC4899';
    }
  });
  
  // 开始编辑
  startEditBtn.addEventListener('click', async () => {
    if (startEditBtn.disabled) return;
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: startEditing
      });
      window.close();
    } catch (error) {
      console.error('开始编辑失败:', error);
    }
  });
});

function startEditing() {
  window.postMessage({ type: 'PM_START_EDIT' }, '*');
} 