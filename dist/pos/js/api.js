/**
 * API BRIDGE MODULE
 * 
 * Browser API client for the hosted POS.
 * Includes a durable local outbox for counter sales made while the network is down.
 * All calls are async and error-safe
 */

class POSOfflineStore {
  static productsKey = 'nanogramics_pos_products_v1';
  static categoriesKey = 'nanogramics_pos_categories_v1';
  static salesKey = 'nanogramics_pos_sale_outbox_v1';

  static read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch { return fallback; }
  }

  static write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  static pendingSales() { return this.read(this.salesKey, []); }

  static cacheProducts(products) {
    const pending = this.pendingSales();
    const deductions = new Map();
    pending.forEach(entry => (entry.sale?.items || []).forEach(item => {
      deductions.set(item.code, (deductions.get(item.code) || 0) + Number(item.qty || 0));
    }));
    const adjusted = (products || []).map(product => ({
      ...product,
      qty: Math.max(0, Number(product.qty || 0) - (deductions.get(product.code) || 0))
    }));
    this.write(this.productsKey, adjusted);
    return adjusted;
  }

  static cachedProducts() { return this.read(this.productsKey, []); }
  static cacheCategories(categories) { this.write(this.categoriesKey, categories || []); return categories || []; }
  static cachedCategories() { return this.read(this.categoriesKey, []); }

  static enqueueSale(sale) {
    const queue = this.pendingSales();
    if (!queue.some(entry => entry.sale?.id === sale.id)) {
      queue.push({sale, queuedAt: new Date().toISOString(), attempts: 0, lastError: ''});
      this.write(this.salesKey, queue);
      const products = this.cachedProducts();
      const sold = new Map((sale.items || []).map(item => [item.code, Number(item.qty || 0)]));
      this.write(this.productsKey, products.map(product => ({
        ...product,
        qty: Math.max(0, Number(product.qty || 0) - (sold.get(product.code) || 0))
      })));
    }
    this.notify();
  }

  static replacePendingSales(queue) { this.write(this.salesKey, queue); this.notify(); }

  static notify(extra = {}) {
    window.dispatchEvent(new CustomEvent('pos-sync-state', {detail: {
      online: navigator.onLine,
      pending: this.pendingSales().length,
      ...extra
    }}));
  }
}

class APIBridge {

  static getSession() {
    try {
      return JSON.parse(sessionStorage.getItem('auth_session') || 'null');
    } catch {
      return null;
    }
  }

  static async fetchInvoke(channel, args) {
    let response;
    try {
      response = await fetch('/api/pos', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({channel, args, token: this.getSession()?.token || null})
      });
    } catch (cause) {
      const error = new Error('The POS server is unreachable.');
      error.networkError = true;
      error.cause = cause;
      throw error;
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      const error = new Error(payload.error || `POS API failed: ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return payload.result;
  }

  /**
   * Generic invoke method with error handling
   */
  static async invoke(channel, ...args) {
    try {
      if (channel === 'print:receipt-silent') return this.printHtml(args[0] || '');
      return await this.fetchInvoke(channel, args);
    } catch (error) {
      console.error(`POS API Error [${channel}]:`, error);
      throw error;
    }
  }

  static async printHtml(html) {
    const printWindow = window.open('', '_blank', 'width=420,height=720');
    if (!printWindow) return {success: false, errorType: 'Pop-up blocked'};
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    return {success: true, browserPrint: true};
  }

  // ════════════════════════════════════════════════════════════
  // PRODUCTS API
  // ════════════════════════════════════════════════════════════

  static async getCategories() {
    try { return POSOfflineStore.cacheCategories(await this.invoke('db:category:getAll')); }
    catch (error) {
      const cached = POSOfflineStore.cachedCategories();
      if (error.networkError && cached.length) return cached;
      throw error;
    }
  }
  static async addCategory(name) { return this.invoke('db:category:add', name); }
  static async deleteCategory(id) { return this.invoke('db:category:delete', id); }

  static async getProducts() {
    try {
      return POSOfflineStore.cacheProducts(await this.invoke('db:product:getAll'));
    } catch (error) {
      const cached = POSOfflineStore.cachedProducts();
      if (error.networkError && cached.length) return cached;
      throw error;
    }
  }

  static async getProductByCode(code) {
    const result = await this.invoke('db:product:getByCode', code);
    return result.length > 0 ? result[0] : null;
  }

  static async addProduct(product) {
    return await this.invoke('db:product:add', product);
  }

  static async updateProduct(product) {
    return await this.invoke('db:product:update', product);
  }

  static async deleteProduct(code) {
    return await this.invoke('db:product:delete', code);
  }

  static async updateProductStock(code, qty) {
    return await this.invoke('db:product:updateStock', code, qty);
  }

  // ════════════════════════════════════════════════════════════
  // SALES API
  // ════════════════════════════════════════════════════════════

  static async createSale(sale) {
    try {
      return await this.invoke('db:sale:create', sale);
    } catch (error) {
      if (!error.networkError && navigator.onLine) throw error;
      POSOfflineStore.enqueueSale(sale);
      return {success: true, queued: true, invoiceId: sale.id, message: 'Sale saved on this device and queued for sync.'};
    }
  }

  static syncingSales = false;

  static async syncPendingSales() {
    if (this.syncingSales || !navigator.onLine || !this.getSession()?.token) {
      POSOfflineStore.notify();
      return {synced: 0, pending: POSOfflineStore.pendingSales().length};
    }
    this.syncingSales = true;
    let queue = POSOfflineStore.pendingSales();
    let synced = 0;
    let blocked = '';
    POSOfflineStore.notify({syncing: true});
    try {
      while (queue.length) {
        const entry = queue[0];
        try {
          await this.fetchInvoke('db:sale:create', [entry.sale]);
          queue.shift();
          synced++;
          POSOfflineStore.replacePendingSales(queue);
        } catch (error) {
          if (error.networkError) break;
          entry.attempts = Number(entry.attempts || 0) + 1;
          entry.lastError = error.message;
          blocked = error.message;
          POSOfflineStore.replacePendingSales(queue);
          break;
        }
      }
      if (synced) {
        const products = await this.fetchInvoke('db:product:getAll', []);
        POSOfflineStore.cacheProducts(products);
        window.dispatchEvent(new CustomEvent('pos-products-updated'));
      }
      return {synced, pending: queue.length, blocked};
    } finally {
      this.syncingSales = false;
      POSOfflineStore.notify({syncing: false, blocked});
    }
  }

  static async getSales() {
    return await this.invoke('db:sale:getAll');
  }

  static async getSaleById(id) {
    return await this.invoke('db:sale:getById', id);
  }

  static async getSalesByDateRange(startDate, endDate) {
    return await this.invoke('db:sale:getByDateRange', startDate, endDate);
  }

  static async deleteSale(saleId) {
    return await this.invoke('db:sale:delete', saleId);
  }

  // ════════════════════════════════════════════════════════════
  // USERS API
  // ════════════════════════════════════════════════════════════

  static async getUsers() {
    return await this.invoke('db:user:getAll');
  }

  static async addUser(user) {
    return await this.invoke('db:user:add', user);
  }

  static async updateUser(userId, updates) {
    return await this.invoke('db:user:update', userId, updates);
  }

  static async deleteUser(userId) {
    return await this.invoke('db:user:delete', userId);
  }

  static async authenticate(username, password, company = 'Nanogramics') {
    return await this.invoke('db:user:authenticate', username, password, company);
  }

  static async logoutUser() {
    return await this.invoke('db:user:logout');
  }

  // ════════════════════════════════════════════════════════════
  // REPORTS API
  // ════════════════════════════════════════════════════════════

  static async getSalesReport(startDate, endDate) {
    return await this.invoke('db:report:getSalesReport', startDate, endDate);
  }

  // ════════════════════════════════════════════════════════════
  // SETTINGS API
  // ════════════════════════════════════════════════════════════

  static async getSetting(key) {
    return await this.invoke('db:setting:get', key);
  }

  static async setSetting(key, value) {
    return await this.invoke('db:setting:set', key, value);
  }

  // ════════════════════════════════════════════════════════════
  // ONLINE ORDERS API
  // ════════════════════════════════════════════════════════════

  static async createOnlineOrder(order) {
    return await this.invoke('db:onlineOrder:create', order);
  }

  static async getOnlineOrders() {
    return await this.invoke('db:onlineOrder:getAll');
  }

  static async getOnlineOrdersByDate(dateStr) {
    return await this.invoke('db:onlineOrder:getByDate', dateStr);
  }

  static async getOnlineOrdersByDateRange(startDate, endDate) {
    return await this.invoke('db:onlineOrder:getByDateRange', startDate, endDate);
  }

  static async getFullReport(startDate, endDate) {
    return await this.invoke('db:report:getFullReport', startDate, endDate);
  }

  static async getUserPerformance(startDate, endDate) {
    return await this.invoke('db:report:getUserPerformance', startDate, endDate);
  }

  static async updateOnlineOrder(order) {
    return await this.invoke('db:onlineOrder:update', order);
  }

  static async updateOnlineOrderStatus(orderId, status) {
    return await this.invoke('db:onlineOrder:updateStatus', orderId, status);
  }

  static async bulkUpdateOnlineOrderStatus(orderIds, status) {
    return await this.invoke('db:onlineOrder:bulkUpdateStatus', orderIds, status);
  }

  static async deleteOnlineOrder(orderId) {
    return await this.invoke('db:onlineOrder:delete', orderId);
  }

  // ════════════════════════════════════════════════════════════
  // RETURNS API
  // ════════════════════════════════════════════════════════════

  static async processReturn(returnData) {
    console.log('API: processReturn called with:', returnData);
    try {
      const result = await this.invoke('db:return:process', returnData);
      console.log('API: processReturn result:', result);
      return result;
    } catch (error) {
      console.error('API: processReturn error:', error);
      throw error;
    }
  }

  static async getReturnsList() {
    console.log('API: getReturnsList called');
    try {
      const result = await this.invoke('db:return:getList');
      console.log('API: getReturnsList result:', result);
      return result;
    } catch (error) {
      console.error('API: getReturnsList error:', error);
      return [];
    }
  }

  static async getInvoiceForReturn(invoiceId) {
    console.log('API: getInvoiceForReturn called with:', invoiceId);
    try {
      const result = await this.invoke('db:return:getInvoice', invoiceId);
      console.log('API: getInvoiceForReturn result:', result);
      return result;
    } catch (error) {
      console.error('API: getInvoiceForReturn error:', error);
      throw error;
    }
  }

  // ── SIMPLE ONLINE RETURN PROCESSING ───────────────────────
  // For simple online returns with just total pieces and amount (no order linking)
  static async processSimpleOnlineReturn(returnData) {
    console.log('API: processSimpleOnlineReturn called with:', returnData);
    try {
      const result = await this.invoke('db:simpleOnlineReturn:process', returnData);
      console.log('API: processSimpleOnlineReturn result:', result);
      return result;
    } catch (error) {
      console.error('API: processSimpleOnlineReturn error:', error);
      throw error;
    }
  }

  // Get list of simple online returns
  static async getSimpleOnlineReturnsList() {
    console.log('API: getSimpleOnlineReturnsList called');
    try {
      const result = await this.invoke('db:simpleOnlineReturn:getList');
      console.log('API: getSimpleOnlineReturnsList result:', result);
      return result;
    } catch (error) {
      console.error('API: getSimpleOnlineReturnsList error:', error);
      return [];
    }
  }

  // ════════════════════════════════════════════════════════════
  // EXCHANGES API
  // ════════════════════════════════════════════════════════════

  static async processExchange(data) {
    console.log('API: processExchange called with:', data);
    try {
      const result = await this.invoke('db:exchange:process', data);
      console.log('API: processExchange result:', result);
      return result;
    } catch (error) {
      console.error('API: processExchange error:', error);
      throw error;
    }
  }

  static async getExchangesList() {
    console.log('API: getExchangesList called');
    try {
      const result = await this.invoke('db:exchange:getList');
      console.log('API: getExchangesList result:', result);
      return result;
    } catch (error) {
      console.error('API: getExchangesList error:', error);
      return [];
    }
  }

  // ════════════════════════════════════════════════════════════
  // AUDIT LOG API
  // ════════════════════════════════════════════════════════════

  static async getAuditLogs(filters = {}) {
    return await this.invoke('db:audit:getLogs', filters);
  }

  static async clearOldAuditLogs(days = 90) {
    return await this.invoke('db:audit:clearOld', days);
  }

  static async logAuditEntry(entry) {
    return await this.invoke('db:audit:log', entry);
  }

  // ════════════════════════════════════════════════════════════
  // DIALOG API
  // ════════════════════════════════════════════════════════════

  static async showSaveDialog(options) {
    return await this.invoke('dialog:showSave', options);
  }

  static async showMessageBox(options) {
    return await this.invoke('dialog:showMessageBox', options);
  }

  static async createBackup() {
    return await this.invoke('db:backup:create');
  }
}

// Make API bridge global
window.API = APIBridge;
window.POSOfflineStore = POSOfflineStore;

window.addEventListener('online', async () => {
  POSOfflineStore.notify();
  const result = await APIBridge.syncPendingSales();
  if (result.synced && typeof showToast === 'function') showToast(`${result.synced} offline sale${result.synced === 1 ? '' : 's'} synced`, 'success');
  if (result.blocked && typeof showToast === 'function') showToast(`Offline sync needs attention: ${result.blocked}`, 'error');
});
window.addEventListener('offline', () => POSOfflineStore.notify());
queueMicrotask(() => POSOfflineStore.notify());
setInterval(() => APIBridge.syncPendingSales().catch(() => {}), 30_000);
