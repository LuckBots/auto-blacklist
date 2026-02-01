class App {
  constructor() {
    this.cookies = null;
    this.isRunning = false;
    this.merchantList = [];
    this.processedCount = 0;
    this.cronTask = null;

    // 检查 electronAPI 是否可用
    if (!window.electronAPI) {
      console.error('electronAPI not available');
      return;
    }

    this.init();
  }

  init() {
    try {
      this.showVersion();
      this.bindEvents();
      this.bindCookieEvents();
      this.loadCookies();
      this.loadMerchantList();
    } catch (error) {
      console.error('Init error:', error);
    }
  }

  bindCookieEvents() {
    if (typeof window.electronAPI.onCookiesUpdated !== 'function') return;

    window.electronAPI.onCookiesUpdated((cookies) => {
      this.cookies = cookies;
      if (cookies?.uid) {
        this.addLog('登录信息已更新', 'success');
      } else {
        this.addLog('检测到登录信息变更，但信息不完整', 'error');
      }
      this.updateUserInfo();
    });
  }

  showVersion() {
    try {
      const versionEl = document.getElementById('appVersion');
      if (versionEl && window.electronAPI.appVersion) {
        versionEl.textContent = `${window.electronAPI.appName} v${window.electronAPI.appVersion}`;
      }
      // 设置页面标题（显示在窗口标题栏）
      if (window.electronAPI.appName && window.electronAPI.appVersion) {
        document.title = `${window.electronAPI.appName} v${window.electronAPI.appVersion}`;
      }
    } catch (error) {
      console.error('Show version error:', error);
    }
  }

  bindEvents() {
    try {
      const btnLogin = document.getElementById('btnLogin');
      const btnSave = document.getElementById('btnSave');
      const btnClear = document.getElementById('btnClear');
      const btnStart = document.getElementById('btnStart');
      const btnStop = document.getElementById('btnStop');

      if (!btnLogin || !btnSave || !btnClear || !btnStart || !btnStop) {
        console.error('Some buttons not found');
        return;
      }

      btnLogin.addEventListener('click', () => this.handleLogin());
      btnSave.addEventListener('click', () => this.saveMerchantList());
      btnClear.addEventListener('click', () => this.clearMerchantList());
      btnStart.addEventListener('click', () => this.startTask());
      btnStop.addEventListener('click', () => this.stopTask());
    } catch (error) {
      console.error('Bind events error:', error);
    }
  }

  async loadCookies() {
    const cookies = await window.electronAPI.getCookies();
    if (cookies && cookies.uid) {
      this.cookies = cookies;
      this.updateUserInfo();
    }
  }

  async handleLogin() {
    await window.electronAPI.openLoginWindow();
    this.addLog('正在打开登录窗口...', 'info');
  }

  async updateUserInfo() {
    const userInfo = await window.electronAPI.getUserInfo(this.cookies);
    const userInfoEl = document.getElementById('userInfo');
    const statusIndicator = userInfoEl.querySelector('.status-indicator');
    const userText = userInfoEl.querySelector('.user-text');

    if (userInfo) {
      statusIndicator.classList.remove('offline');
      statusIndicator.classList.add('online');
      userText.textContent = userInfo.nickName || '已登录';
      this.addLog(`登录成功：${userInfo.nickName || '已登录'}`, 'success');
    } else {
      statusIndicator.classList.remove('online');
      statusIndicator.classList.add('offline');
      userText.textContent = '未登录';
    }
  }

  loadMerchantList() {
    const saved = localStorage.getItem('merchantList');
    if (saved) {
      document.getElementById('merchantInput').value = saved;
      this.parseMerchantList(saved);
    }
  }

  saveMerchantList() {
    const input = document.getElementById('merchantInput').value;
    localStorage.setItem('merchantList', input);
    this.parseMerchantList(input);
    this.addLog('商户列表已保存', 'success');
  }

  clearMerchantList() {
    document.getElementById('merchantInput').value = '';
    localStorage.removeItem('merchantList');
    this.merchantList = [];
    this.addLog('商户列表已清空', 'info');
  }

  parseMerchantList(input) {
    this.merchantList = [];
    const lines = input.trim().split('\n');
    console.log('lines:', lines);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        // 支持两种格式：
        // 1. "商户ID,订单编号" (逗号分隔)
        // 2. "商户ID 订单编号" (空格分隔)
        const parts = trimmed.split(/[,\s]+/);
        if (parts.length >= 2) {
          this.merchantList.push({
            merchantId: parts[0].trim(),
            orderId: parts[1].trim()
          });
        }
      }
    }
  }

  async startTask() {
    if (!this.cookies) {
      const cookies = await window.electronAPI.getCookies();
      if (cookies && cookies.uid) {
        this.cookies = cookies;
      }
    }

    if (!this.cookies || !this.cookies.uid) {
      this.addLog('请先登录（需要完整的登录信息）！', 'error');
      return;
    }

    if (this.merchantList.length === 0) {
      this.parseMerchantList(document.getElementById('merchantInput').value);
      if (this.merchantList.length === 0) {
        this.addLog('请先添加商户ID列表！', 'error');
        return;
      }
    }

    this.isRunning = true;
    this.processedCount = 0;
    this.updateTaskStatus();

    this.addLog('定时任务已启动，每分钟执行一次', 'success');

    // 立即执行一次
    await this.executeBlacklist();

    // 设置定时任务（每分钟执行一次）
    this.cronTask = setInterval(() => {
      this.executeBlacklist();
    }, 60000);

    // 更新下次执行时间
    this.updateNextRunTime();
  }

  updateNextRunTime() {
    const nextTime = new Date();
    nextTime.setMinutes(nextTime.getMinutes() + 1);
    nextTime.setSeconds(0, 0);
    const timeStr = nextTime.toLocaleTimeString('zh-CN');
    document.getElementById('nextRun').textContent = timeStr;
  }

  async executeBlacklist() {
    this.addLog('开始执行拉黑任务...', 'info');
    console.log('executeBlacklist', this.merchantList);
    for (const item of this.merchantList) {
      try {
        console.log('item',  item, this.cookies);
        const result = await window.electronAPI.addToBlacklist(item.orderId, item.merchantId, this.cookies);
        if (result.success) {
          this.addLog(`✓ 商户 ${item.merchantId} 拉黑成功`, 'success');
        } else {
          this.addLog(`✗ 商户 ${item.merchantId} 拉黑失败: ${result.message}`, 'error');
        }
        this.processedCount++;
        this.updateProcessedCount();
      } catch (error) {
        this.addLog(`✗ 商户 ${item.merchantId} 拉黑异常: ${error.message}`, 'error');
        this.processedCount++;
        this.updateProcessedCount();
      }

      // 延迟1秒，避免请求过快
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    this.addLog(`拉黑任务完成，共处理 ${this.merchantList.length} 个商户`, 'info');
  }

  stopTask() {
    this.isRunning = false;
    if (this.cronTask) {
      clearInterval(this.cronTask);
      this.cronTask = null;
    }
    this.updateTaskStatus();
    this.addLog('定时任务已停止', 'info');
  }

  updateTaskStatus() {
    const statusEl = document.getElementById('taskStatus');
    const btnStart = document.getElementById('btnStart');
    const btnStop = document.getElementById('btnStop');

    if (this.isRunning) {
      statusEl.textContent = '运行中';
      statusEl.style.color = '#22c55e';
      btnStart.disabled = true;
      btnStop.disabled = false;
    } else {
      statusEl.textContent = '未启动';
      statusEl.style.color = '#6b7280';
      btnStart.disabled = false;
      btnStop.disabled = true;
      document.getElementById('nextRun').textContent = '--';
    }
  }

  updateProcessedCount() {
    document.getElementById('processedCount').textContent = this.processedCount;
  }

  addLog(message, type = 'info') {
    const logContainer = document.getElementById('logContainer');
    const time = new Date().toLocaleTimeString('zh-CN');
    const logItem = document.createElement('div');
    logItem.className = `log-item log-${type}`;
    logItem.textContent = `[${time}] ${message}`;
    logContainer.appendChild(logItem);
    logContainer.scrollTop = logContainer.scrollHeight;
  }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
  new App();
});
