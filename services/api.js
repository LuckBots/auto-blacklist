const axios = require('axios');

class BlacklistService {
  constructor() {
    this.baseURL = 'https://mapi.uhaozu.com';
    this.cookies = null;
  }

  setCookies(cookies) {
    this.cookies = cookies;
  }

  getCookieString() {
    if (!this.cookies) {
      return '';
    }
    const parts = [];
    if (this.cookies.JSESSIONID) {
      parts.push(`JSESSIONID=${this.cookies.JSESSIONID}`);
    }
    if (this.cookies.uid) {
      parts.push(`uid=${this.cookies.uid}`);
    }
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

  /**
   * 获取用户信息
   */
  async getUserInfo() {
    if (!this.cookies || !this.cookies.JSESSIONID || !this.cookies.uid) {
      return null;
    }

    try {
      const response = await axios.post(
        `${this.baseURL}/merchants/user/queryInfo`,
        {},
        {
          headers: {
            ...this.getHeaders(),
            'Cookie': this.getCookieString()
          }
        }
      );

      if (response.data && response.data.code === '0000') {
        return response.data.data;
      }
      return null;
    } catch (error) {
      console.error('获取用户信息失败:', error.message);
      return null;
    }
  }

  /**
   * 添加到黑名单
   * @param {string} orderId - 订单编号
   * @param {string} buyerId - 买家ID（商户ID）
   */
  async addToBlacklist(orderId, buyerId) {
    if (!this.cookies || !this.cookies.JSESSIONID || !this.cookies.uid) {
      return {
        success: false,
        message: '未登录，请先登录'
      };
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
            'Cookie': this.getCookieString()
          }
        }
      );

      if (response.data && response.data.code === '0000') {
        return {
          success: true,
          message: '拉黑成功',
          data: response.data
        };
      } else {
        return {
          success: false,
          message: response.data?.msg || '拉黑失败'
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.msg || error.message || '请求失败'
      };
    }
  }
}

module.exports = { BlacklistService };
