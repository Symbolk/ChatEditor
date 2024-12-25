let isEditing = false;
let isElementLocked = false;
let hoverBox = null;
let currentElement = null;
let editModal = null;
let overlay = null;
let highlightBorder = null;
let tip = null;
let currentAbortController = null;
let modelConfig = null;

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'MODEL_CONFIG') {
    modelConfig = message;
    sendResponse({ success: true });
  }
});

window.addEventListener('message', (event) => {
  if (event.data.type === 'PM_START_EDIT') {
    startEditing();
  } else if (event.data.type === 'PM_STOP_EDIT') {
    stopEditing();
  }
});

// 添加Esc键监听
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isEditing) {
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
    stopEditing();
  }
});

function createTip() {
  const tipElement = document.createElement('div');
  tipElement.className = 'pm-tip';
  tipElement.innerHTML = '点击以选中，输入以调整，按 <kbd>Esc</kbd> 以退出';
  document.body.appendChild(tipElement);
  return tipElement;
}

function createHighlightBorder() {
  const border = document.createElement('div');
  border.className = 'pm-highlight-border';
  border.style.display = 'none';
  document.body.appendChild(border);
  return border;
}

function createHoverBox() {
  const box = document.createElement('div');
  box.className = 'pm-hover-box';
  box.style.display = 'none';
  
  const elementInfo = document.createElement('span');
  box.appendChild(elementInfo);
  
  const editButton = document.createElement('button');
  editButton.textContent = '改这里';
  editButton.onclick = () => toggleInputMode(true);
  box.appendChild(editButton);
  
  const inputGroup = document.createElement('div');
  inputGroup.className = 'hover-input-group';
  inputGroup.style.display = 'none';
  
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = '请输入修改需求，例如：把这里的背景色改成浅蓝色';
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.value.trim()) {
        handleEdit(input.value);
      }
    }
  });
  inputGroup.appendChild(input);
  
  const buttonGroup = document.createElement('div');
  buttonGroup.className = 'hover-button-group';
  buttonGroup.style.display = 'flex';
  
  const luckyBtn = document.createElement('button');
  luckyBtn.textContent = '试试手气';
  luckyBtn.style.cssText = `
    background: linear-gradient(45deg, #7F7FD5, #86A8E7, #91EAE4);
    color: white;
    border: none;
    border-radius: 6px;
    padding: 6px 12px;
    font-weight: 500;
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  `;
  
  // 添加动画样式到文档
  if (!document.querySelector('#lucky-button-style')) {
    const style = document.createElement('style');
    style.id = 'lucky-button-style';
    style.textContent = `
      @keyframes lucky-loading {
        0% { transform: translateX(-100%); }
        50% { transform: translateX(0); }
        100% { transform: translateX(100%); }
      }
      
      .lucky-loading::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(
          90deg,
          transparent,
          rgba(255, 255, 255, 0.4),
          transparent
        );
        animation: lucky-loading 1.5s infinite;
      }
      
      .lucky-button:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 15px rgba(127, 127, 213, 0.4);
        background: linear-gradient(45deg, #8989D9, #90B1EA, #9BEDE7);
      }
      
      .lucky-button:active {
        transform: translateY(0);
        box-shadow: 0 2px 8px rgba(127, 127, 213, 0.2);
      }
      
      .lucky-button:disabled {
        opacity: 0.7;
        cursor: not-allowed;
      }
    `;
    document.head.appendChild(style);
  }
  
  // 用于存储上一次生成的建议
  let lastSuggestion = '';
  
  luckyBtn.className = 'lucky-button';
  luckyBtn.onclick = async () => {
    try {
      // 如果有正在进行的请求，先取消它
      if (currentAbortController) {
        currentAbortController.abort();
      }
      
      // 创建新的 AbortController
      currentAbortController = new AbortController();
      
      // 添加加载动画
      luckyBtn.classList.add('lucky-loading');
      luckyBtn.disabled = true;
      
      const elementInfo = getElementInfo(currentElement);
      const prompt = `作为一个网页编辑助手，请根据以下元素信息生成一个合理的修改建议：
当前元素类型: ${elementInfo}
${lastSuggestion ? `上次生成的建议是: ${lastSuggestion}
请生成一个不同的建议。` : ''}
请生成一个简短的修改建议，例如"把背景色改成浅蓝色"或"将文字大小调整为18px"等。
要求：
1. 建议要简短具体
2. ��议要可行且合理
3. 只返回建议内容，不需要其他解释
${lastSuggestion ? '4. 必须与上次建议不同' : ''}`;

      if (!modelConfig) {
        throw new Error('未找到模型配置，请重新打开扩展');
      }

      const currentModel = modelConfig.selectedModel || 'deepseek';
      const apiKey = modelConfig[`${currentModel}Key`];

      if (!apiKey) {
        throw new Error('未找到API Key，请先配置');
      }

      const modelAPI = new window.ModelAPI(currentModel, apiKey);
      const suggestion = await modelAPI.generateCode(prompt, currentAbortController.signal);

      if (!suggestion) {
        throw new Error('生成建议失败');
      }

      // 如果请求已被取消，不更新输入框
      if (currentAbortController === null) {
        return;
      }

      // 保存这次生成的建议
      lastSuggestion = suggestion.trim();
      
      const input = inputGroup.querySelector('input');
      input.value = lastSuggestion;
      input.focus();
    } catch (error) {
      // 如果是取消请求导致的错误，不显示错误提示
      if (error.name === 'AbortError') {
        return;
      }
      console.error('生成建议失败:', error);
      alert(`生成建议失败: ${error.message}`);
    } finally {
      // 清理 AbortController
      currentAbortController = null;
      // 移除加载动画
      luckyBtn.classList.remove('lucky-loading');
      luckyBtn.disabled = false;
    }
  };
  buttonGroup.appendChild(luckyBtn);
  
  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = '确认';
  confirmBtn.onclick = () => handleEdit(input.value);
  buttonGroup.appendChild(confirmBtn);
  
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '取消';
  cancelBtn.onclick = () => toggleInputMode(false);
  buttonGroup.appendChild(cancelBtn);
  
  inputGroup.appendChild(buttonGroup);
  box.appendChild(inputGroup);
  
  document.body.appendChild(box);
  return box;
}

function toggleInputMode(show) {
  const inputGroup = hoverBox.querySelector('.hover-input-group');
  const editButton = hoverBox.querySelector('button:not(.hover-button-group button)');
  
  if (show) {
    inputGroup.style.display = 'flex';
    editButton.style.display = 'none';
    inputGroup.querySelector('input').focus();
  } else {
    inputGroup.style.display = 'none';
    editButton.style.display = 'block';
    inputGroup.querySelector('input').value = '';
    isElementLocked = false;
    currentElement = null;
    if (highlightBorder) {
      highlightBorder.style.display = 'none';
    }
    if (hoverBox) {
      hoverBox.style.display = 'none';
    }
  }
}

function createEditModal() {
  const modal = document.createElement('div');
  modal.className = 'pm-edit-modal';
  modal.style.display = 'none';
  
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = '请输入修改需求，例如：把这里的背景色改成浅蓝色，文字改成红色...';
  modal.appendChild(input);
  
  const submitButton = document.createElement('button');
  submitButton.textContent = '确认';
  submitButton.onclick = () => handleEdit(input.value);
  modal.appendChild(submitButton);
  
  const cancelButton = document.createElement('button');
  cancelButton.textContent = '取消';
  cancelButton.onclick = hideEditModal;
  modal.appendChild(cancelButton);
  
  document.body.appendChild(modal);
  return modal;
}

function createOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'pm-overlay';
  overlay.style.display = 'none';
  document.body.appendChild(overlay);
  return overlay;
}

function startEditing() {
  if (!highlightBorder) highlightBorder = createHighlightBorder();
  if (!hoverBox) hoverBox = createHoverBox();
  if (!editModal) editModal = createEditModal();
  if (!overlay) overlay = createOverlay();
  if (!tip) tip = createTip();
  
  isEditing = true;
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('click', handleClick, true);
  tip.style.display = 'block';
}

function stopEditing() {
  // 如果有正在进行的请求，取消它
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
  
  isEditing = false;
  isElementLocked = false;
  currentElement = null;
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('click', handleClick, true);
  if (hoverBox) hoverBox.style.display = 'none';
  if (highlightBorder) highlightBorder.style.display = 'none';
  if (editModal) editModal.style.display = 'none';
  if (overlay) overlay.style.display = 'none';
  if (tip) tip.style.display = 'none';
}

function handleMouseMove(e) {
  if (!isEditing || isElementLocked) return;
  
  const element = document.elementFromPoint(e.clientX, e.clientY);
  if (!element || element === hoverBox || element.closest('.pm-hover-box') || 
      element === highlightBorder || element.closest('.pm-highlight-border')) return;
  
  currentElement = element;
  updateHighlightAndHoverBox(element, e.clientX, e.clientY);
}

function updateHighlightAndHoverBox(element, mouseX, mouseY) {
  const elementInfo = getElementInfo(element);
  
  // 更新高亮边框
  const rect = element.getBoundingClientRect();
  highlightBorder.style.display = 'block';
  highlightBorder.style.left = `${rect.left + window.scrollX}px`;
  highlightBorder.style.top = `${rect.top + window.scrollY}px`;
  highlightBorder.style.width = `${rect.width}px`;
  highlightBorder.style.height = `${rect.height}px`;
  
  // 更新提示框位置
  hoverBox.querySelector('span').textContent = elementInfo;
  hoverBox.style.display = 'flex';
  
  // 计算最佳位置
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const boxWidth = hoverBox.offsetWidth;
  const boxHeight = hoverBox.offsetHeight;
  
  // 计算基于鼠标位置的初始位置
  let left = mouseX + 10;
  let top = mouseY + 10;
  
  // 确保不出视口边界
  if (left + boxWidth > viewportWidth - 10) {
    left = mouseX - boxWidth - 10;
  }
  
  if (top + boxHeight > viewportHeight - 10) {
    top = mouseY - boxHeight - 10;
  }
  
  // 确保不会超出左边界和上边界
  left = Math.max(10, left);
  top = Math.max(10, top);
  
  hoverBox.style.left = `${left}px`;
  hoverBox.style.top = `${top}px`;
}

function handleClick(e) {
  if (!isEditing) return;
  if (e.target.closest('.pm-hover-box') || e.target.closest('.pm-edit-modal')) return;
  e.preventDefault();
  e.stopPropagation();
  
  if (!isElementLocked && currentElement) {
    isElementLocked = true;
    updateHighlightAndHoverBox(currentElement, e.clientX, e.clientY);
  }
}

function getElementInfo(element) {
  // 获取元素的角色信息
  const tagName = element.tagName.toLowerCase();
  const role = element.getAttribute('role');
  const type = element.getAttribute('type');
  const placeholder = element.getAttribute('placeholder');
  
  // 基于元素特征判断其用途
  if (tagName === 'h1' || tagName === 'h2' || tagName === 'h3' || 
      tagName === 'h4' || tagName === 'h5' || tagName === 'h6') {
    return '标题';
  }
  
  if (tagName === 'p') {
    return '文本段落';
  }
  
  if (tagName === 'input') {
    if (type === 'text') return '文本输入框';
    if (type === 'password') return '密码输入框';
    if (type === 'submit') return '提交按钮';
    if (type === 'checkbox') return '复选框';
    if (type === 'radio') return '单选框';
    if (placeholder) return `输入框 (${placeholder})`;
    return '输入框';
  }
  
  if (tagName === 'textarea') {
    return '多行文本输入框';
  }
  
  if (tagName === 'button') {
    return '按钮';
  }
  
  if (tagName === 'a') {
    return '链接';
  }
  
  if (tagName === 'img') {
    const alt = element.getAttribute('alt');
    return alt ? `图片 (${alt})` : '图片';
  }
  
  if (tagName === 'video') {
    return '视频';
  }
  
  if (tagName === 'audio') {
    return '音频';
  }
  
  if (tagName === 'ul' || tagName === 'ol') {
    return '列表';
  }
  
  if (tagName === 'li') {
    return '列表项';
  }
  
  if (tagName === 'table') {
    return '表格';
  }
  
  if (tagName === 'form') {
    return '表单';
  }
  
  if (tagName === 'nav') {
    return '导航栏';
  }
  
  if (tagName === 'header') {
    return '页面头部';
  }
  
  if (tagName === 'footer') {
    return '页面底部';
  }
  
  if (tagName === 'aside') {
    return '侧边栏';
  }
  
  if (tagName === 'main') {
    return '主要内容区';
  }
  
  if (tagName === 'section') {
    return '内容区块';
  }
  
  if (tagName === 'article') {
    return '文章内容';
  }
  
  if (tagName === 'div') {
    // 尝试从类名或ID推断用
    const className = element.className;
    const id = element.id;
    
    if (className.toLowerCase().includes('header')) return '页面头部';
    if (className.toLowerCase().includes('footer')) return '页面底部';
    if (className.toLowerCase().includes('nav')) return '导航区域';
    if (className.toLowerCase().includes('sidebar')) return '侧边栏';
    if (className.toLowerCase().includes('content')) return '内容区域';
    if (className.toLowerCase().includes('banner')) return '横幅区域';
    if (className.toLowerCase().includes('menu')) return '菜单';
    if (className.toLowerCase().includes('button')) return '按钮';
    if (className.toLowerCase().includes('card')) return '卡片';
    if (className.toLowerCase().includes('modal')) return '弹窗';
    if (className.toLowerCase().includes('form')) return '表单';
    if (className.toLowerCase().includes('search')) return '搜索区域';
    if (className.toLowerCase().includes('list')) return '列表';
    if (className.toLowerCase().includes('grid')) return '网格';
    if (className.toLowerCase().includes('container')) return '容器';
    
    // 如果没有特殊标识，则显示"区块"
    return '区块';
  }
  
  // 如果是其他元素，返回通用描述
  return '页面元素';
}

function showEditModal() {
  if (!currentElement) return;
  const rect = currentElement.getBoundingClientRect();
  editModal.style.display = 'flex';
  overlay.style.display = 'block';
  hoverBox.style.display = 'none'; // 只在显示编辑框时隐藏悬浮框
  
  const modalWidth = editModal.offsetWidth;
  const modalHeight = editModal.offsetHeight;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // 默认显示在元素下方
  let left = rect.left;
  let top = rect.bottom + 10;
  
  // 如果下方空间不足，则显示在上方
  if (top + modalHeight > viewportHeight - 10) {
    top = rect.top - modalHeight - 10;
  }
  
  // 确保不超出左右边界
  if (left + modalWidth > viewportWidth - 10) {
    left = viewportWidth - modalWidth - 10;
  }
  if (left < 10) {
    left = 10;
  }
  
  editModal.style.left = `${left}px`;
  editModal.style.top = `${top}px`;
  
  editModal.querySelector('input').value = '';
  editModal.querySelector('input').focus();
}

function hideEditModal() {
  editModal.style.display = 'none';
  overlay.style.display = 'none';
  isElementLocked = false;
  
  if (isEditing) {
    hoverBox.style.display = 'flex'; // 恢复悬浮框显示
  }
}

async function handleEdit(requirement) {
  if (!currentElement) return;
  
  // 获取输入组和按钮组元素
  const inputGroup = hoverBox.querySelector('.hover-input-group');
  const buttonGroup = inputGroup.querySelector('.hover-button-group');
  const input = inputGroup.querySelector('input');
  
  try {
    // 创建新的 AbortController
    if (currentAbortController) {
      currentAbortController.abort();
    }
    currentAbortController = new AbortController();
    
    // 添加更新动画
    highlightBorder.classList.add('updating');
    
    // 显示加载状态
    const loadingText = document.createElement('div');
    loadingText.className = 'hover-loading-text';
    
    // 创建基础文本和动画点
    const baseText = document.createElement('span');
    baseText.textContent = '程序员正在工作中';
    const dots = document.createElement('span');
    dots.className = 'loading-dots';
    dots.textContent = '...';
    
    loadingText.appendChild(baseText);
    loadingText.appendChild(dots);
    
    // 添加样式
    loadingText.style.cssText = `
      color: #666;
      padding: 5px 10px;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    
    dots.style.cssText = `
      display: inline-block;
      animation: loadingDots 1.5s infinite;
      letter-spacing: 2px;
      margin-left: 2px;
    `;
    
    // 添加动画样式到文档
    if (!document.querySelector('#loading-dots-style')) {
      const style = document.createElement('style');
      style.id = 'loading-dots-style';
      style.textContent = `
        @keyframes loadingDots {
          0% { opacity: .2; }
          20% { opacity: 1; }
          100% { opacity: .2; }
        }
        
        .loading-dots {
          font-family: Arial, sans-serif;
        }
      `;
      document.head.appendChild(style);
    }
    
    // 保存按钮组并替换为加载文本
    const originalButtonGroup = buttonGroup;
    buttonGroup.replaceWith(loadingText);
    
    // 禁用输入框但保留内容
    input.disabled = true;

    // 获取当前元素的相关信息
    const elementInfo = {
      tagName: currentElement.tagName.toLowerCase(),
      innerHTML: currentElement.innerHTML,
      outerHTML: currentElement.outerHTML,
      textContent: currentElement.textContent,
      className: currentElement.className,
      id: currentElement.id,
      styles: window.getComputedStyle(currentElement),
      attributes: Array.from(currentElement.attributes).map(attr => ({
        name: attr.name,
        value: attr.value
      }))
    };

    // 构建提示词
    const prompt = `作为一个网页编辑助手，请根据以下信息生成新的HTML代码：

当前元素信息：
- 类型: ${elementInfo.tagName}
- 类名: ${elementInfo.className}
- ID: ${elementInfo.id}
- 当前内容: ${elementInfo.textContent}
- 完整HTML: ${elementInfo.outerHTML}

用户修改需求: ${requirement}

请生成一个新的HTML代码片段，要求：
1. 保持原有的重要属性（class、id等）
2. 确保代码可以直接使用
3. 只返回HTML代码，不需要其他解释
4. 如果需要添加样式，���用内联style属性
5. 确保代码符合用户需求
6. 保持原有的事件监听器和功能
`;

    if (!modelConfig) {
      throw new Error('未找到模型配置，请重新打开扩展');
    }

    const currentModel = modelConfig.selectedModel || 'deepseek';
    const apiKey = modelConfig[`${currentModel}Key`];

    if (!apiKey) {
      throw new Error('未找到API Key，请先配置');
    }

    // 使用 window.ModelAPI 替代 ModelAPI
    const modelAPI = new window.ModelAPI(currentModel, apiKey);
    const generatedCode = await modelAPI.generateCode(prompt, currentAbortController.signal);

    // 如果请求已被取消，直接返回
    if (currentAbortController === null) {
      return;
    }

    if (!generatedCode) {
      throw new Error('生成失败');
    }

    // 创建临时元素解析生成的HTML
    const temp = document.createElement('div');
    temp.innerHTML = generatedCode.trim();
    const newElement = temp.firstElementChild;

    // 复制原有的事件监听器
    const oldElement = currentElement;
    const clonedElement = newElement.cloneNode(true);
    
    // 复制元素的所有属性
    Array.from(oldElement.attributes).forEach(attr => {
      // 跳过已经在新元素中存在的属性
      if (!clonedElement.hasAttribute(attr.name)) {
        clonedElement.setAttribute(attr.name, attr.value);
      }
    });

    // 复制内联事件处理器
    const eventAttributes = [
      'onclick', 'onmousedown', 'onmouseup', 'onmouseover', 'onmouseout',
      'onkeydown', 'onkeyup', 'onkeypress', 'onchange', 'onsubmit', 'oninput'
    ];
    
    eventAttributes.forEach(attr => {
      if (oldElement[attr]) {
        clonedElement[attr] = oldElement[attr];
      }
    });

    // 使用 MutationObserver 来保持动态绑定的事件
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName.startsWith('on')) {
          const attrName = mutation.attributeName;
          clonedElement[attrName] = oldElement[attrName];
        }
      });
    });

    observer.observe(oldElement, {
      attributes: true,
      attributeFilter: eventAttributes
    });

    // 替换元素
    oldElement.parentNode.replaceChild(clonedElement, oldElement);
    observer.disconnect();

    // 移除更新动画
    highlightBorder.classList.remove('updating');

    // 恢复输入框和按钮组
    input.disabled = false;
    loadingText.replaceWith(originalButtonGroup);
    
    // 清理状态
    toggleInputMode(false);
    
  } catch (error) {
    // 如果是取消请求导致的错误，不显示错误提示
    if (error.name === 'AbortError') {
      // 移除更新动画
      highlightBorder.classList.remove('updating');
      // 恢复输入框和按钮组
      input.disabled = false;
      if (inputGroup.querySelector('.hover-loading-text')) {
        inputGroup.querySelector('.hover-loading-text').replaceWith(buttonGroup);
      }
      return;
    }
    
    console.error('修改失败:', error);
    
    // 移除更新动画
    highlightBorder.classList.remove('updating');
    
    // 恢复输入框和按钮组
    input.disabled = false;
    if (inputGroup.querySelector('.hover-loading-text')) {
      inputGroup.querySelector('.hover-loading-text').replaceWith(buttonGroup);
    }
    
    alert(`修改失败: ${error.message}`);
    // 不关闭输入模式，让用户可以重试
  }
} 