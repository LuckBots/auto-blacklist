const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 应用信息
  appVersion: '1.0.1',
  appName: '有好租自动拉黑工具',

  // 登录窗口操作
  openLoginWindow: () => ipcRenderer.invoke('open-login-window'),
  closeLoginWindow: () => ipcRenderer.invoke('close-login-window'),

  // Cookie 操作
  getCookies: () => ipcRenderer.invoke('get-cookies'),
  saveCookies: (cookies) => ipcRenderer.invoke('save-cookies', cookies),

  // API 操作
  getUserInfo: (cookies) => ipcRenderer.invoke('get-user-info', cookies),
  addToBlacklist: (orderId, buyerId, cookies) => ipcRenderer.invoke('add-to-blacklist', orderId, buyerId, cookies),

  // 监听 cookies 更新
  onCookiesUpdated: (callback) => {
    const listener = (event, cookies) => callback(cookies);
    ipcRenderer.on('cookies-updated', listener);
    return () => ipcRenderer.removeListener('cookies-updated', listener);
  }
});
