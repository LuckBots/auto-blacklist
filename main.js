const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

// 读取版本号
const packageJson = require('./package.json');
const APP_VERSION = packageJson.version;
const APP_NAME = packageJson.productName || '自动拉黑商家工具';

let mainWindow = null;
let loginWindow = null;
let isLoginSuccess = false;

// API 服务类
class BlacklistService {
  constructor() {
    this.baseURL = 'https://mapi.uhaozu.com';
  }

  getCookieString(cookies) {
    if (!cookies) return '';
    const parts = [];
    if (cookies.JSESSIONID) parts.push(`JSESSIONID=${cookies.JSESSIONID}`);
    if (cookies.uid) parts.push(`uid=${cookies.uid}`);
    return parts.join('; ');
  }

  getHeaders() {
    return {
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Connection': 'keep-alive',
      'Content-Type': 'application/json;charset=UTF-8',
      'Origin': 'https://b.uhaozu.com',
      'Referer': 'https://b.uhaozu.com/order',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-site',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
      'X-Requested-With': 'XMLHttpRequest',
      'sec-ch-ua': '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'tml': '{"platform":"20","terminal":"0"}'
    };
  }

  async getUserInfo(cookies) {
    if (!cookies || !cookies.JSESSIONID || !cookies.uid) return null;

    try {
      const response = await axios.post(
        `${this.baseURL}/merchants/user/queryInfo`,
        {},
        {
          headers: {
            ...this.getHeaders(),
            'Cookie': this.getCookieString(cookies)
          }
        }
      );

      if (response.data && (response.data.success === true || response.data.responseCode === '0000')) {
        return response.data.object || response.data.data;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async addToBlacklist(orderId, buyerId, cookies) {
    if (!cookies || !cookies.JSESSIONID || !cookies.uid) {
      return { success: false, message: '未登录，请先登录' };
    }

    try {
      const response = await axios.post(
        `${this.baseURL}/merchants/order/ajax/addBlacklist`,
        {
          reason: '恶意下单/恶意投诉',
          buyerId: parseInt(buyerId),
          orderId: orderId,
          frequentlyReason: false
        },
        {
          headers: {
            ...this.getHeaders(),
            'Cookie': this.getCookieString(cookies)
          }
        }
      );

      if (response.data && response.data.code === '0000') {
        return { success: true, message: '拉黑成功', data: response.data };
      } else {
        return { success: false, message: response.data?.msg || '拉黑失败' };
      }
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.msg || error.message || '请求失败'
      };
    }
  }
}

const blacklistService = new BlacklistService();

// 创建主窗口
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    titleBarStyle: 'default', // 显示标题栏
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    title: `${APP_NAME} v${APP_VERSION}`
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // 页面加载完成后再次设置标题
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.setTitle(`${APP_NAME} v${APP_VERSION}`);
  });

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 创建登录窗口
function createLoginWindow() {
  isLoginSuccess = false;
  console.log('[createLoginWindow] Creating login window');

  // 获取屏幕尺寸
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const windowWidth = Math.min(1400, screenWidth - 100);
  const windowHeight = Math.min(900, screenHeight - 100);

  loginWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    minWidth: 1000,
    minHeight: 600,
    x: Math.floor((screenWidth - windowWidth) / 2),
    y: Math.floor((screenHeight - windowHeight) / 2),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    title: '登录 - 有好租',
    backgroundColor: '#fff'
  });

  loginWindow.loadURL('https://b.uhaozu.com/');

  // 监听所有导航事件
  loginWindow.webContents.on('did-navigate', async (event, url) => {
    console.log('[did-navigate] URL:', url);
    if (url.includes('b.uhaozu.com')) {
      await captureCookies();
    }
  });

  loginWindow.webContents.on('did-navigate-in-page', async (event, url) => {
    console.log('[did-navigate-in-page] URL:', url);
    if (url.includes('b.uhaozu.com')) {
      await captureCookies();
    }
  });

  // 监听页面加载完成
  loginWindow.webContents.on('dom-ready', async () => {
    console.log('[dom-ready] Page loaded, current URL:', loginWindow.webContents.getURL());
    await captureCookies();
  });

  loginWindow.on('closed', () => {
    console.log('[login-window-closed]');
    loginWindow = null;
  });
}

// 捕获并保存 cookies
async function captureCookies() {
  console.log('[captureCookies] Called, isLoginSuccess:', isLoginSuccess);

  // 立即设置标志，防止重复执行
  if (isLoginSuccess) {
    console.log('[captureCookies] Already processed, skipping');
    return;
  }
  isLoginSuccess = true;

  if (!loginWindow) {
    console.log('[captureCookies] No loginWindow');
    return;
  }

  // 获取所有 cookies（不限域名）
  const allCookies = await loginWindow.webContents.session.cookies.get({});
  console.log('[captureCookies] Total cookies found:', allCookies.length);
  console.log('[captureCookies] All cookie names:', allCookies.map(c => c.name).join(', '));

  const cookies = await loginWindow.webContents.session.cookies.get({
    domain: '.uhaozu.com'
  });

  console.log('[captureCookies] Found .uhaozu.com cookies:', cookies.length);

  const cookieObj = {};
  cookies.forEach(cookie => {
    if (cookie.name === 'JSESSIONID' || cookie.name === 'uid') {
      cookieObj[cookie.name] = cookie.value;
      console.log('[captureCookies] Found cookie:', cookie.name, '=', cookie.value?.substring(0, 20) + '...');
    }
  });

  console.log('[captureCookies] cookieObj.JSESSIONID:', !!cookieObj.JSESSIONID, 'cookieObj.uid:', !!cookieObj.uid);

  // 只要获取到必需的 cookies 就保存并关闭窗口
  if (cookieObj.JSESSIONID && cookieObj.uid) {
    console.log('[captureCookies] Both cookies found, saving and closing window');
    const cookiePath = path.join(app.getPath('userData'), 'cookies.json');
    fs.writeFileSync(cookiePath, JSON.stringify(cookieObj, null, 2));

    if (mainWindow) {
      mainWindow.webContents.send('cookies-updated', cookieObj);
      console.log('[captureCookies] Sent cookies-updated to main window');
    }

    // 立即关闭窗口，保护用户隐私
    if (loginWindow) {
      console.log('[captureCookies] Closing login window');
      loginWindow.close();
    }
  } else {
    // 如果没有获取到 cookies，重置标志以便下次重试
    console.log('[captureCookies] Cookies not complete, resetting flag');
    isLoginSuccess = false;
  }
}

// IPC 事件处理
ipcMain.handle('open-login-window', () => {
  createLoginWindow();
});

ipcMain.handle('close-login-window', () => {
  if (loginWindow) {
    loginWindow.close();
  }
});

ipcMain.handle('get-cookies', async () => {
  const cookiePath = path.join(app.getPath('userData'), 'cookies.json');
  if (fs.existsSync(cookiePath)) {
    return JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));
  }
  return null;
});

ipcMain.handle('save-cookies', async (event, cookies) => {
  const cookiePath = path.join(app.getPath('userData'), 'cookies.json');
  fs.writeFileSync(cookiePath, JSON.stringify(cookies, null, 2));
  return true;
});

ipcMain.handle('get-user-info', async (event, cookies) => {
  return await blacklistService.getUserInfo(cookies);
});

ipcMain.handle('add-to-blacklist', async (event, orderId, buyerId, cookies) => {
  return await blacklistService.addToBlacklist(orderId, buyerId, cookies);
});

// 应用生命周期
app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
