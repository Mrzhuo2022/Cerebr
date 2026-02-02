const SITE_OVERRIDES_KEY = 'panelSiteOverridesV1';
const SITE_KEY_PLUS = 2;
const SIDEBAR_POSITION_KEY = 'cerebr_sidebar_position_v1';

const SIDEBAR_WIDTH_MIN_PX = 300;
const SIDEBAR_WIDTH_MAX_PX = 800;

function clampSidebarWidth(widthPx, fallbackPx = 430) {
  if (!Number.isFinite(widthPx)) return fallbackPx;
  return Math.min(Math.max(SIDEBAR_WIDTH_MIN_PX, widthPx), SIDEBAR_WIDTH_MAX_PX);
}

function isIPv4(hostname) {
  if (typeof hostname !== 'string') return false;
  const parts = hostname.split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    if (!/^(?:0|[1-9]\d{0,2})$/.test(p)) return false;
    const n = Number(p);
    return n >= 0 && n <= 255;
  });
}

function isIPv6(hostname) {
  if (typeof hostname !== 'string') return false;
  return hostname.includes(':');
}

const MULTI_PART_PUBLIC_SUFFIXES = new Set([
  // UK
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'net.uk',
  // Australia
  'com.au',
  'net.au',
  'org.au',
  'edu.au',
  'gov.au',
  // Japan
  'co.jp',
  'ne.jp',
  'or.jp',
  'ac.jp',
  'go.jp',
  // China / HK / TW (common)
  'com.cn',
  'net.cn',
  'org.cn',
  'gov.cn',
  'com.hk',
  'com.tw',
  'com.sg'
]);

function getSiteKeyFromHostname(hostname, plus = SITE_KEY_PLUS) {
  if (!hostname || typeof hostname !== 'string') return null;
  const normalized = hostname.trim().replace(/\.$/, '').toLowerCase();
  if (!normalized) return null;
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return normalized;
  if (isIPv4(normalized) || isIPv6(normalized)) return normalized;

  const parts = normalized.split('.').filter(Boolean);
  if (parts.length <= 2) return normalized;

  let suffixLen = 1;
  const last2 = parts.slice(-2).join('.');
  const last3 = parts.slice(-3).join('.');
  if (MULTI_PART_PUBLIC_SUFFIXES.has(last2)) suffixLen = 2;
  else if (MULTI_PART_PUBLIC_SUFFIXES.has(last3)) suffixLen = 3;

  const plusNumber = Math.max(1, Number(plus) || SITE_KEY_PLUS);
  const requiredLen = suffixLen + plusNumber;
  if (parts.length <= requiredLen) return normalized;
  return parts.slice(-requiredLen).join('.');
}

function getSiteKeyFromLocation(loc) {
  try {
    if (!loc || typeof loc !== 'object') return null;
    if (loc.protocol === 'file:') return 'file';
    return getSiteKeyFromHostname(loc.hostname, SITE_KEY_PLUS);
  } catch {
    return null;
  }
}

function pruneSiteOverridesInPlace(overrides) {
  try {
    const entries = Object.entries(overrides || {});
    const MAX_ENTRIES = 100;
    if (entries.length <= MAX_ENTRIES) return;
    entries
      .sort((a, b) => (Number(b[1]?.updatedAt) || 0) - (Number(a[1]?.updatedAt) || 0))
      .slice(MAX_ENTRIES)
      .forEach(([key]) => {
        delete overrides[key];
      });
  } catch {
    // ignore
  }
}

class CerebrSidebar {
  constructor() {
    this.isVisible = false;
    this.sidebarWidth = 430;
    this.defaultSidebarWidth = 430;
    this.sidebarLeft = null;
    this.sidebarTop = null;
    this.initialized = false;
    this.siteKey = getSiteKeyFromLocation(window.location);
    this.pageKey = window.location.origin + window.location.pathname;
    this.lastUrl = window.location.href;
    this.sidebar = null;
    this.iframe = null;
    this.hideTimeout = null;
    this.dragging = false;
    this.iframePointerEventsBeforeDrag = null;
    this.saveStateDebounced = this.debounce(() => void this.saveState(), 250);
    this.saveWidthDebounced = this.debounce(() => void this.saveWidth(), 250);
    this.savePositionDebounced = this.debounce(() => void this.savePosition(), 250);
    this.handleSidebarTransitionEnd = (event) => {
      if (!this.sidebar || event.target !== this.sidebar || event.propertyName !== 'transform') {
        return;
      }
      if (!this.isVisible) {
        if (this.hideTimeout) {
          clearTimeout(this.hideTimeout);
          this.hideTimeout = null;
        }
        this.sidebar.style.display = 'none';
      }
    };
    this.initializeSidebar();
    this.setupDragAndDrop(); // 添加拖放事件监听器
  }

  async loadWidth() {
    try {
      const { [SITE_OVERRIDES_KEY]: overridesRaw } = await chrome.storage.sync.get(SITE_OVERRIDES_KEY);
      const overrides = overridesRaw && typeof overridesRaw === 'object' ? overridesRaw : {};

      const siteOverride = this.siteKey ? overrides?.[this.siteKey] : null;
      const overrideWidth = Number(siteOverride?.sidebarWidth);
      if (Number.isFinite(overrideWidth)) {
        this.sidebarWidth = clampSidebarWidth(overrideWidth, this.defaultSidebarWidth);
        return;
      }

      // 迁移：eTLD+1 -> eTLD+2（访问新站点粒度时，继承旧粒度的值）
      if (this.siteKey) {
        const legacySiteKey = getSiteKeyFromHostname(window.location.hostname, 1);
        if (legacySiteKey && legacySiteKey !== this.siteKey) {
          const legacyWidth = Number(overrides?.[legacySiteKey]?.sidebarWidth);
          if (Number.isFinite(legacyWidth)) {
            const migrated = clampSidebarWidth(legacyWidth, this.defaultSidebarWidth);
            this.sidebarWidth = migrated;
            overrides[this.siteKey] = {
              ...(overrides?.[this.siteKey] && typeof overrides[this.siteKey] === 'object' ? overrides[this.siteKey] : {}),
              sidebarWidth: migrated,
              updatedAt: Date.now()
            };
            pruneSiteOverridesInPlace(overrides);
            await chrome.storage.sync.set({ [SITE_OVERRIDES_KEY]: overrides });
            return;
          }
        }
      }

      // 迁移：旧版本按“页面”保存宽度，若当前页面存在旧宽度，则升级为“站点”覆盖
      if (this.siteKey) {
        const legacy = await chrome.storage.local.get('sidebarStates');
        const legacyWidth = Number(legacy?.sidebarStates?.[this.pageKey]?.width);
        if (Number.isFinite(legacyWidth)) {
          const migrated = clampSidebarWidth(legacyWidth, this.defaultSidebarWidth);
          this.sidebarWidth = migrated;
          overrides[this.siteKey] = {
            ...(overrides?.[this.siteKey] && typeof overrides[this.siteKey] === 'object' ? overrides[this.siteKey] : {}),
            sidebarWidth: migrated,
            updatedAt: Date.now()
          };
          pruneSiteOverridesInPlace(overrides);
          await chrome.storage.sync.set({ [SITE_OVERRIDES_KEY]: overrides });
          return;
        }
      }

      // 默认宽度始终为“双击复位”的宽度，不应被其他站点的调整影响
      this.sidebarWidth = this.defaultSidebarWidth;
    } catch (error) {
      console.error('加载侧边栏宽度失败:', error);
      this.sidebarWidth = this.defaultSidebarWidth;
    }
  }

  debounce(fn, waitMs) {
    let timeoutId = null;
    return (...args) => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn(...args), waitMs);
    };
  }

  async saveState() {
    try {
      const states = await chrome.storage.local.get('sidebarStates') || { sidebarStates: {} };
      if (!states.sidebarStates) {
        states.sidebarStates = {};
      }
      states.sidebarStates[this.pageKey] = {
        isVisible: this.isVisible,
        updatedAt: Date.now()
      };

      // 防止无限增长：保留最近使用的 100 条
      const entries = Object.entries(states.sidebarStates);
      const MAX_ENTRIES = 100;
      if (entries.length > MAX_ENTRIES) {
        entries
          .sort((a, b) => (b[1]?.updatedAt || 0) - (a[1]?.updatedAt || 0))
          .slice(MAX_ENTRIES)
          .forEach(([key]) => {
            delete states.sidebarStates[key];
          });
      }

      await chrome.storage.local.set(states);
    } catch (error) {
      console.error('保存侧边栏状态失败:', error);
    }
  }

  async saveWidth() {
    const width = clampSidebarWidth(this.sidebarWidth, this.defaultSidebarWidth);
    this.sidebarWidth = width;
    try {
      const { [SITE_OVERRIDES_KEY]: overridesRaw } = await chrome.storage.sync.get(SITE_OVERRIDES_KEY);
      const overrides = overridesRaw && typeof overridesRaw === 'object' ? overridesRaw : {};

      if (!this.siteKey) return;
      const existing = overrides?.[this.siteKey] && typeof overrides[this.siteKey] === 'object'
        ? overrides[this.siteKey]
        : {};
      overrides[this.siteKey] = {
        ...existing,
        sidebarWidth: width,
        updatedAt: Date.now()
      };
      pruneSiteOverridesInPlace(overrides);
      await chrome.storage.sync.set({ [SITE_OVERRIDES_KEY]: overrides });
    } catch (error) {
      console.error('保存侧边栏宽度失败:', error);
    }
  }

  async loadState() {
    try {
      await this.loadWidth();
      await this.loadPosition();
      const states = await chrome.storage.local.get('sidebarStates');
      const state = states?.sidebarStates?.[this.pageKey];
      this.isVisible = !!state?.isVisible;

      if (this.isVisible) {
        this.sidebar.style.display = 'block';
        this.sidebar.classList.add('visible');
      } else {
        this.sidebar.classList.remove('visible');
        this.sidebar.style.display = 'none';
      }

      this.applySidebarWidth();
      this.applySidebarPosition();
    } catch (error) {
      console.error('加载侧边栏状态失败:', error);
    }
  }

  applySidebarWidth() {
    if (!this.sidebar) return;
    this.sidebar.style.width = `${this.sidebarWidth}px`;
  }

  async loadPosition() {
    try {
      const result = await chrome.storage.local.get(SIDEBAR_POSITION_KEY);
      const pos = result?.[SIDEBAR_POSITION_KEY];
      const left = Number(pos?.left);
      const top = Number(pos?.top);

      if (Number.isFinite(left) && Number.isFinite(top)) {
        const width = clampSidebarWidth(this.sidebarWidth, this.defaultSidebarWidth);
        const height = Math.max(120, window.innerHeight - 40);
        const maxLeft = window.innerWidth - width + 100;
        const maxTop = window.innerHeight - height + 100;
        const minLeft = -100;
        const minTop = -100;

        if (left < minLeft || left > maxLeft || top < minTop || top > maxTop) {
          console.warn('[Sidebar] 保存的位置不合理，将使用默认位置');
          try {
            await chrome.storage.local.remove(SIDEBAR_POSITION_KEY);
          } catch {
            // ignore
          }
          this.sidebarLeft = null;
          this.sidebarTop = null;
        } else {
          this.sidebarLeft = left;
          this.sidebarTop = top;
        }
      }
    } catch {
      // ignore
    }
  }

  async savePosition() {
    try {
      if (!Number.isFinite(this.sidebarLeft) || !Number.isFinite(this.sidebarTop)) return;
      await chrome.storage.local.set({
        [SIDEBAR_POSITION_KEY]: {
          left: this.sidebarLeft,
          top: this.sidebarTop,
          updatedAt: Date.now()
        }
      });
    } catch {
      // ignore
    }
  }

  getSidebarSizeForClamp() {
    const fallbackWidth = clampSidebarWidth(this.sidebarWidth, this.defaultSidebarWidth);
    const fallbackHeight = Math.max(120, window.innerHeight - 40);
    if (!this.sidebar) return { width: fallbackWidth, height: fallbackHeight };

    // 尝试获取侧边栏的实际大小
    let width = fallbackWidth;
    let height = fallbackHeight;

    try {
      const rect = this.sidebar.getBoundingClientRect?.();
      // 如果 rect.width 或 rect.height 为0或很小，说明侧边栏可能是 display:none
      if (rect && rect.width > 0 && rect.height > 0) {
        width = rect.width;
        height = rect.height;
      } else {
        // 侧边栏不可见时，使用已知的宽度和CSS定义的高度
        width = this.sidebarWidth || fallbackWidth;
        height = window.innerHeight - 40;  // CSS中定义的是 calc(100vh - 40px)
      }
    } catch {
      // 如果获取失败，使用默认值
      width = this.sidebarWidth || fallbackWidth;
      height = window.innerHeight - 40;
    }

    return { width, height };
  }

  clampSidebarPosition(left, top) {
    const { width, height } = this.getSidebarSizeForClamp();
    const margin = 8;
    const minLeft = margin;
    const minTop = margin;
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const maxTop = Math.max(margin, window.innerHeight - height - margin);
    return {
      left: Math.min(Math.max(left, minLeft), maxLeft),
      top: Math.min(Math.max(top, minTop), maxTop)
    };
  }

  applySidebarPosition() {
    if (!this.sidebar) return;

    const width = clampSidebarWidth(this.sidebarWidth, this.defaultSidebarWidth);
    const fallbackLeft = window.innerWidth - width - 20;
    const fallbackTop = 20;

    let rawLeft = fallbackLeft;
    let rawTop = fallbackTop;

    if (Number.isFinite(this.sidebarLeft)) {
      rawLeft = this.sidebarLeft;
    }
    if (Number.isFinite(this.sidebarTop)) {
      rawTop = this.sidebarTop;
    }

    const { left, top } = this.clampSidebarPosition(rawLeft, rawTop);

    this.sidebarLeft = left;
    this.sidebarTop = top;

    this.sidebar.style.left = `${left}px`;
    this.sidebar.style.top = `${top}px`;
    this.sidebar.style.right = 'auto';
    this.sidebar.style.bottom = 'auto';
  }

  startDragging() {
    if (!this.sidebar || this.dragging) return;
    this.dragging = true;

    const iframe = this.sidebar?.querySelector('.cerebr-sidebar__iframe');
    if (iframe) {
      this.iframePointerEventsBeforeDrag = iframe.style.pointerEvents;
      iframe.style.pointerEvents = 'none';
    }

    document.documentElement.style.cursor = 'grabbing';
    document.documentElement.style.userSelect = 'none';
  }

  dragBy(dx, dy) {
    if (!this.sidebar || !this.dragging) return;

    // 如果 sidebarLeft/sidebarTop 还没有初始化，先从当前 DOM 样式读取
    if (!Number.isFinite(this.sidebarLeft) || !Number.isFinite(this.sidebarTop)) {
      const currentLeft = parseFloat(this.sidebar.style.left) || 0;
      const currentTop = parseFloat(this.sidebar.style.top) || 0;
      this.sidebarLeft = currentLeft;
      this.sidebarTop = currentTop;
    }

    const nextLeft = this.sidebarLeft + dx;
    const nextTop = this.sidebarTop + dy;
    const { left, top } = this.clampSidebarPosition(nextLeft, nextTop);

    this.sidebarLeft = left;
    this.sidebarTop = top;
    this.sidebar.style.left = `${left}px`;
    this.sidebar.style.top = `${top}px`;
    this.sidebar.style.right = 'auto';
    this.sidebar.style.bottom = 'auto';
  }

  stopDragging() {
    if (!this.dragging) return;
    this.dragging = false;

    const iframe = this.sidebar?.querySelector('.cerebr-sidebar__iframe');
    if (iframe) {
      iframe.style.pointerEvents = this.iframePointerEventsBeforeDrag ?? '';
    }
    this.iframePointerEventsBeforeDrag = null;

    document.documentElement.style.cursor = '';
    document.documentElement.style.userSelect = '';

    this.savePositionDebounced();
  }

  setupIframeDragMessaging(iframe) {
    if (!iframe) return;
    if (this.__cerebrIframeDragMessagingAttached) return;
    this.__cerebrIframeDragMessagingAttached = true;

    const onMessage = (event) => {
      if (!this.sidebar || !this.iframe) return;
      if (event.source !== this.iframe.contentWindow) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'CEREBR_SIDEBAR_DRAG_START') {
        if (!this.isVisible) return;
        this.startDragging();
        return;
      }

      if (data.type === 'CEREBR_SIDEBAR_DRAG_MOVE') {
        if (!this.isVisible) return;
        if (!this.dragging) return;
        const dx = Number(data.dx) || 0;
        const dy = Number(data.dy) || 0;
        if (!dx && !dy) return;
        this.dragBy(dx, dy);
        return;
      }

      if (data.type === 'CEREBR_SIDEBAR_DRAG_END') {
        this.stopDragging();
      }
    };

    window.addEventListener('message', onMessage);
    window.addEventListener('blur', () => this.stopDragging());
    window.addEventListener('resize', () => {
      this.applySidebarPosition();
      this.savePositionDebounced();
    });
  }

  async initializeSidebar() {
    try {
      const container = document.createElement('cerebr-root');
      this.container = container;

      // 防止外部JavaScript访问和修改我们的元素
      Object.defineProperty(container, 'remove', {
        configurable: false,
        writable: false,
        value: () => false
      });

      // 使用closed模式的shadowRoot以增加隔离性
      const shadow = container.attachShadow({ mode: 'closed' });

      const style = document.createElement('style');
      style.textContent = `
        :host {
          all: initial;
          contain: style layout size;
        }
        .cerebr-sidebar {
          position: fixed;
          left: auto;
          top: auto;
          right: auto;
          bottom: auto;
          width: 430px;
          height: calc(100vh - 40px);
          background: var(--cerebr-bg-color, #ffffff);
          color: var(--cerebr-text-color, #000000);
          --cerebr-sidebar-box-shadow: -2px 0 15px rgba(0,0,0,0.1);
          box-shadow: none;
          z-index: 2147483647;
          border-radius: 12px;
          overflow: hidden;
          visibility: hidden;
          opacity: 0;
          transform: translate3d(0, 8px, 0) scale(0.98);
          transform-origin: 50% 50%;
          pointer-events: none;
          contain: style layout size;
          isolation: isolate;
          will-change: transform, opacity;
        }
        .cerebr-sidebar.initialized {
          visibility: visible;
          transition: transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.18s ease, box-shadow 0.22s ease;
        }
        @media (prefers-color-scheme: dark) {
          .cerebr-sidebar {
            --cerebr-bg-color: #282c34;
            --cerebr-text-color: #abb2bf;
            --cerebr-sidebar-box-shadow: -2px 0 20px rgba(0,0,0,0.3);
          }
        }
        .cerebr-sidebar.visible {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
          box-shadow: var(--cerebr-sidebar-box-shadow, -2px 0 15px rgba(0,0,0,0.1));
          pointer-events: auto;
        }
        .cerebr-sidebar__header {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 20px;
          z-index: 10;
          background: transparent;
          pointer-events: none;
        }
        .cerebr-sidebar__resizer {
          position: absolute;
          top: 40px;
          left: 0;
          width: 10px;
          height: calc(100% - 40px);
          cursor: ew-resize;
          z-index: 3;
          touch-action: none;
          background: transparent;
        }
        @media (prefers-reduced-motion: reduce) {
          .cerebr-sidebar.initialized {
            transition: none;
          }
        }
        .cerebr-sidebar__content {
          height: 100%;
          overflow: hidden;
          border-radius: 12px;
          contain: style layout size;
        }
        .cerebr-sidebar__iframe {
          width: 100%;
          height: 100%;
          border: none;
          background: var(--cerebr-bg-color, #ffffff);
          contain: strict;
        }
      `;

      this.sidebar = document.createElement('div');
      this.sidebar.className = 'cerebr-sidebar';
      this.sidebar.style.display = 'none';
      this.sidebar.addEventListener('transitionend', this.handleSidebarTransitionEnd);

      // 防止外部JavaScript访问和修改侧边栏
      Object.defineProperty(this.sidebar, 'remove', {
        configurable: false,
        writable: false,
        value: () => false
      });

      const header = document.createElement('div');
      header.className = 'cerebr-sidebar__header';

      const resizer = document.createElement('div');
      resizer.className = 'cerebr-sidebar__resizer';

      const content = document.createElement('div');
      content.className = 'cerebr-sidebar__content';

      const iframe = document.createElement('iframe');
      iframe.className = 'cerebr-sidebar__iframe';
      iframe.src = chrome.runtime.getURL('index.html');
      iframe.allow = 'clipboard-write';
      this.iframe = iframe;

      content.appendChild(iframe);
      this.sidebar.appendChild(header);
      this.sidebar.appendChild(resizer);
      this.sidebar.appendChild(content);

      shadow.appendChild(style);
      shadow.appendChild(this.sidebar);

      // 添加到文档并保护它（先添加到DOM，再加载状态，确保位置计算正确）
      const root = document.documentElement;
      root.appendChild(container);

      // 加载状态（在添加到DOM之后，确保getBoundingClientRect返回有效值）
      await this.loadState();
      this.setupIframeDragMessaging(iframe);

      // 使用MutationObserver确保我们的元素不会被移除
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            const removedNodes = Array.from(mutation.removedNodes);
            if (removedNodes.includes(container)) {
              root.appendChild(container);
            }
          }
        }
      });

      observer.observe(root, {
        childList: true
      });

      // 监听标签页激活事件，通知iframe重新加载对话
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onActivated) {
        chrome.tabs.onActivated.addListener((activeInfo) => {
          // 只在当前标签页激活时通知
          chrome.tabs.get(activeInfo.tabId, (tab) => {
            if (tab && tab.url && tab.url === window.location.href) {
              this.notifyIframeTabActivated();
            }
          });
        });
      }

      // 监听标签页更新事件
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onUpdated) {
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
          // 只在当前标签页且状态变为complete时通知
          if (tabId === chrome.tabs.TAB_ID_NONE || tab.url !== window.location.href) return;
          if (changeInfo.status === 'complete') {
            this.notifyIframeTabActivated();
          }
        });
      }

      this.setupEventListeners(resizer);

      requestAnimationFrame(() => {
        this.sidebar.classList.add('initialized');
        this.initialized = true;
      });
    } catch (error) {
      console.error('初始化侧边栏失败:', error);
    }
  }

  setupEventListeners(resizer) {
    let startX = 0;
    let startWidth = 0;
    let resizing = false;
    let activePointerId = null;
    let iframePointerEventsBeforeResize = null;

    const handlePointerMove = (e) => {
      if (!resizing) return;
      const diff = startX - e.clientX;
      this.sidebarWidth = Math.min(Math.max(300, startWidth + diff), 800);
      this.applySidebarWidth();
    };

    const stopResizing = () => {
      if (!resizing) return;
      resizing = false;
      window.removeEventListener('pointermove', handlePointerMove, true);
      if (activePointerId !== null) {
        try {
          resizer.releasePointerCapture(activePointerId);
        } catch {
          // ignore
        }
        activePointerId = null;
      }
      const iframe = this.sidebar?.querySelector('.cerebr-sidebar__iframe');
      if (iframe) {
        iframe.style.pointerEvents = iframePointerEventsBeforeResize ?? '';
      }
      iframePointerEventsBeforeResize = null;
      document.documentElement.style.cursor = '';
      document.documentElement.style.userSelect = '';
      this.saveWidthDebounced();
    };

    resizer.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      resizing = true;
      startX = e.clientX;
      startWidth = this.sidebarWidth;
      activePointerId = e.pointerId;
      try {
        resizer.setPointerCapture(activePointerId);
      } catch {
        // ignore
      }

      // 防止指针进入 iframe 后事件丢失（iframe 是独立文档，会“吃掉” move/up）
      const iframe = this.sidebar?.querySelector('.cerebr-sidebar__iframe');
      if (iframe) {
        iframePointerEventsBeforeResize = iframe.style.pointerEvents;
        iframe.style.pointerEvents = 'none';
      }
      document.documentElement.style.cursor = 'ew-resize';
      document.documentElement.style.userSelect = 'none';
      window.addEventListener('pointermove', handlePointerMove, true);
      window.addEventListener('pointerup', stopResizing, { once: true, capture: true });
      window.addEventListener('pointercancel', stopResizing, { once: true, capture: true });
    }, { passive: false });

    resizer.addEventListener('dblclick', () => {
      this.sidebarWidth = this.defaultSidebarWidth;
      this.applySidebarWidth();
      this.saveWidthDebounced();
    });
  }

  notifyIframeTabActivated() {
    if (!this.iframe || !this.iframe.contentWindow) return;
    try {
      this.iframe.contentWindow.postMessage({
        type: 'TAB_ACTIVATED'
      }, '*');
    } catch (error) {
      console.error('通知iframe标签页激活失败:', error);
    }
  }

  toggle() {
    if (!this.initialized) return;

    try {
      // 在改变可见性之前保存旧状态
      const wasVisible = this.isVisible;
      this.isVisible = !this.isVisible;

      // 更新DOM状态
      if (this.isVisible) {
        if (this.hideTimeout) {
          clearTimeout(this.hideTimeout);
          this.hideTimeout = null;
        }
        this.sidebar.style.display = 'block';
        void this.sidebar.offsetWidth; // 强制重排以使过渡动画运行
        this.sidebar.classList.add('visible');
      } else {
        this.sidebar.classList.remove('visible');

        if (this.hideTimeout) {
          clearTimeout(this.hideTimeout);
          this.hideTimeout = null;
        }

        if (!wasVisible) {
          this.sidebar.style.display = 'none';
        } else {
          this.hideTimeout = setTimeout(() => {
            if (!this.isVisible) {
              this.sidebar.style.display = 'none';
            }
            this.hideTimeout = null;
          }, 350);
          // 350ms是为了和css的transition的0.3s对齐，再加一些余量，等动画结束再设置为display:none
        }
      }

      // 保存状态
      this.saveStateDebounced();

      // 如果从不可见变为可见，通知iframe并聚焦输入框
      if (!wasVisible && this.isVisible) {
        const iframe = this.sidebar.querySelector('.cerebr-sidebar__iframe');
        if (iframe) {
          iframe.contentWindow.postMessage({ type: 'FOCUS_INPUT' }, '*');
        }
      }
    } catch (error) {
      console.error('切换侧边栏失败:', error);
    }
  }

  setupDragAndDrop() {
    let lastDraggedImage = null;

    // 检查是否在侧边栏范围内的函数
    const isInSidebarBounds = (x, y) => {
      if (!this.sidebar || !this.isVisible) return false;
      const sidebarRect = this.sidebar.getBoundingClientRect();
      return (
        x >= sidebarRect.left &&
        x <= sidebarRect.right &&
        y >= sidebarRect.top &&
        y <= sidebarRect.bottom
      );
    };

    const getImageDataFromElement = async (imgEl) => {
      const src = imgEl?.currentSrc || imgEl?.src;
      if (!src) return null;

      try {
        const response = await fetch(src);
        const blob = await response.blob();
        const base64Data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('读取图片失败'));
          reader.readAsDataURL(blob);
        });
        return {
          type: 'image',
          data: base64Data,
          name: imgEl?.alt || imgEl?.title || '拖放图片'
        };
      } catch (error) {
        // fetch 失败时尝试 canvas（跨域图片可能会失败）
        try {
          const canvas = document.createElement('canvas');
          canvas.width = imgEl.naturalWidth || imgEl.width;
          canvas.height = imgEl.naturalHeight || imgEl.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(imgEl, 0, 0);
          const base64Data = canvas.toDataURL('image/png');
          return {
            type: 'image',
            data: base64Data,
            name: imgEl?.alt || imgEl?.title || '拖放图片'
          };
        } catch (canvasError) {
          console.error('拖放图片读取失败:', error, canvasError);
          return null;
        }
      }
    };

    // 监听页面上的所有图片（仅记录引用；真正取数延后到拖入侧边栏后）
    document.addEventListener('dragstart', (e) => {
      const img = e.target?.closest?.('img');
      if (!img) return;
      lastDraggedImage = img;
      try {
        e.dataTransfer?.setData?.('text/uri-list', img.currentSrc || img.src || '');
        e.dataTransfer.effectAllowed = 'copy';
      } catch {
        // ignore
      }
    }, { capture: true });

    // 监听拖动结束事件
    document.addEventListener('dragend', (e) => {
      const inSidebar = !!lastDraggedImage && isInSidebarBounds(e.clientX, e.clientY);
      const iframe = this.sidebar?.querySelector('.cerebr-sidebar__iframe');
      if (iframe && inSidebar && this.isVisible) {  // 确保侧边栏可见
        const draggedImg = lastDraggedImage;
        // 异步获取图片数据并发送到 iframe
        void (async () => {
          const imageData = await getImageDataFromElement(draggedImg);
          if (!imageData) return;
          iframe.contentWindow.postMessage({
            type: 'DROP_IMAGE',
            imageData
          }, '*');
        })();
      }
      // 重置状态
      lastDraggedImage = null;
    });
  }
}

let sidebar;
try {
  sidebar = new CerebrSidebar();
} catch (error) {
  console.error('创建侧边栏实例失败:', error);
}

let inFlightPageContentPromise = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'PING') {
      sendResponse({
        type: 'PONG',
        timestamp: message.timestamp,
        responseTime: Date.now()
      });
      return true;
    }

    // 处理侧边栏切换命令
    if (message.type === 'TOGGLE_SIDEBAR_onClicked' || message.type === 'TOGGLE_SIDEBAR_toggle_sidebar') {
        try {
            if (sidebar) {
                sidebar.toggle();
                sendResponse({ success: true, status: sidebar.isVisible });
            } else {
                console.error('侧边栏实例不存在');
                sendResponse({ success: false, error: 'Sidebar instance not found' });
            }
        } catch (error) {
            console.error('处理切换命令失败:', error);
            sendResponse({ success: false, error: error.message });
        }
        return true;
    }

    if (message.type === 'GET_PAGE_CONTENT_INTERNAL') {
        if (inFlightPageContentPromise) {
	            inFlightPageContentPromise.then(sendResponse).catch(() => sendResponse(null));
	            return true;
	        }

	        inFlightPageContentPromise = extractPageContent(message.skipWaitContent);

	        inFlightPageContentPromise.then(content => {
	            sendResponse(content);
	        }).catch(error => {
	            console.error('提取页面内容失败:', error);
	            sendResponse(null);
	        }).finally(() => {
	            inFlightPageContentPromise = null;
	        });

	        return true;
	    }

	    // 处理 NEW_CHAT 消息
	    if (message.type === 'NEW_CHAT') {
	        if (!sidebar?.isVisible) {
	            sendResponse({ success: false, ignored: true, reason: 'SIDEBAR_HIDDEN' });
	            return true;
	        }

	        // 当当前页面就是 Cerebr 网页版时：快捷键由"焦点所在 UI"决定，避免与侧边栏冲突
	        const isCerebrWebAppDocument = () => {
	            return !!(
	                document.getElementById('chat-container') &&
	                document.getElementById('message-input') &&
	                document.getElementById('new-chat')
	            );
	        };
	        if (isCerebrWebAppDocument()) {
	            const sidebarHost = sidebar?.container;
	            const isSidebarFocused = !!sidebarHost && document.activeElement === sidebarHost;
	            if (!isSidebarFocused) {
	                sendResponse({ success: false, ignored: true, reason: 'FOCUS_NOT_IN_SIDEBAR' });
	                return true;
	            }
	        }

	        const iframe = sidebar?.sidebar?.querySelector('.cerebr-sidebar__iframe');
	        if (iframe?.contentWindow) {
	            iframe.contentWindow.postMessage({ type: 'NEW_CHAT' }, '*');
	            sendResponse({ success: true });
	        } else {
	            sendResponse({ success: false, error: 'Sidebar iframe not found' });
	        }
	        return true;
	    }

	    // 处理关闭侧边栏消息
	    if (message.type === 'TOGGLE_SIDEBAR_close') {
	        if (sidebar && sidebar.isVisible) {
	            sidebar.toggle();
	            sendResponse({ success: true, status: sidebar.isVisible });
	        } else {
	            sendResponse({ success: false, ignored: true, reason: 'SIDEBAR_ALREADY_HIDDEN' });
	        }
	        return true;
	    }

	    // 处理检查侧边栏可见性
	    if (message.type === 'CHECK_SIDEBAR_VISIBLE') {
	        sendResponse({ visible: sidebar ? sidebar.isVisible : false });
	        return true;
	    }

	    // 处理来自右键菜单的总结请求
	    if (message.type === 'SUMMARIZE_FROM_CONTEXT_MENU') {
	        if (!sidebar?.isVisible) {
	            sendResponse({ success: false, ignored: true, reason: 'SIDEBAR_HIDDEN' });
	            return true;
	        }

	        const iframe = sidebar?.sidebar?.querySelector('.cerebr-sidebar__iframe');
	        if (iframe?.contentWindow) {
	            // 转发消息到 iframe
	            iframe.contentWindow.postMessage(message, '*');
	            sendResponse({ success: true });
	        } else {
	            sendResponse({ success: false, error: 'Sidebar iframe not found' });
	        }
	        return true;
	    }

    return true;
});

const port = chrome.runtime.connect({ name: 'cerebr-sidebar' });
port.onDisconnect.addListener(() => {
  console.log('与 background 的连接已断开');
});

function sendInitMessage(retryCount = 0) {
  const maxRetries = 10;
  const retryDelay = 1000;

  chrome.runtime.sendMessage({
    type: 'CONTENT_LOADED',
    url: window.location.href
  }).catch(error => {
    if (retryCount < maxRetries) {
      setTimeout(() => sendInitMessage(retryCount + 1), retryDelay);
    } else {
      console.error('达最大重试次数，初始化消息发送失败');
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(sendInitMessage, 500);
  });
} else {
  setTimeout(sendInitMessage, 500);
}

window.addEventListener('error', (event) => {
  if (event.message && event.message.includes('ResizeObserver loop')) {
    return;
  }
  console.error('全局错误:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('未处理的 Promise 拒绝:', event.reason);
});


const PAGE_TEXT_CACHE_TTL_MS = 15_000;
let lastExtractedPage = null;

function isYouTubeHost(hostname) {
  if (!hostname) return false;
  const host = String(hostname).toLowerCase();
  return host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be';
}

function getYouTubeVideoIdFromUrl(urlString) {
  try {
    const url = new URL(urlString);
    if (!isYouTubeHost(url.hostname)) return null;

    // https://www.youtube.com/watch?v=VIDEO_ID
    if (url.pathname === '/watch') {
      return url.searchParams.get('v');
    }

    // https://youtu.be/VIDEO_ID
    if (url.hostname === 'youtu.be') {
      const id = url.pathname.replace(/^\/+/, '').split('/')[0];
      return id || null;
    }

    // https://www.youtube.com/shorts/VIDEO_ID
    const shortsMatch = url.pathname.match(/^\/shorts\/([^/?#]+)/);
    if (shortsMatch) return shortsMatch[1];

    // https://www.youtube.com/embed/VIDEO_ID
    const embedMatch = url.pathname.match(/^\/embed\/([^/?#]+)/);
    if (embedMatch) return embedMatch[1];

    return null;
  } catch {
    return null;
  }
}

function parseTimedTextJson3ToPlainText(json3) {
  try {
    const data = typeof json3 === 'string' ? JSON.parse(json3) : json3;
    const events = data?.events;
    if (!Array.isArray(events) || events.length === 0) return '';

    const out = [];
    let last = '';
    for (const ev of events) {
      const segs = ev?.segs;
      if (!Array.isArray(segs) || segs.length === 0) continue;
      const line = segs.map(s => s?.utf8 || '').join('').trim();
      if (!line) continue;
      if (line === last) continue;
      out.push(line);
      last = line;
    }
    return out.join('\n');
  } catch {
    return '';
  }
}

function makeYouTubeTranscriptStorageKey(videoId, lang) {
  const safeVideoId = String(videoId || '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
  const safeLang = String(lang || 'und').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
  return `cerebr_youtube_transcript_v1_${safeVideoId}_${safeLang}`;
}

async function extractYouTubeTranscriptText() {
  const videoId = getYouTubeVideoIdFromUrl(window.location.href);
  if (!videoId) return null;

  try {
    const resp = await chrome.runtime.sendMessage({ type: 'GET_YOUTUBE_TIMEDTEXT_URL', videoId });
    const capturedUrl = resp?.url;
    if (!capturedUrl) return null;

    // Prefer locally cached transcript (written by sidebar) to avoid repeated network fetch.
    const key = makeYouTubeTranscriptStorageKey(videoId, resp?.lang || null);
    try {
      const cached = await chrome.storage.local.get(key);
      const payload = cached?.[key];
      const cachedText = typeof payload === 'string' ? payload : payload?.text;
      if (cachedText) {
        return {
          videoId,
          lang: resp?.lang || null,
          caps: resp?.caps || null,
          transcript: cachedText
        };
      }
    } catch {
      // ignore
    }

    const response = await chrome.runtime.sendMessage({ type: 'FETCH_YOUTUBE_TIMEDTEXT', url: capturedUrl });
    if (!response?.success || !response.text) return null;
    const parsed = parseTimedTextJson3ToPlainText(response.text);
    if (!parsed) return null;
    return {
      videoId,
      lang: resp?.lang || null,
      caps: resp?.caps || null,
      transcript: parsed
    };
  } catch {
    return null;
  }
}

async function extractPageContent(skipWaitContent = false) {
  let pdfUrl = null;
  if (document.contentType === 'application/pdf' ||
      (window.location.href.includes('.pdf') ||
       document.querySelector('iframe[src*="pdf.js"]') ||
       document.querySelector('iframe[src*=".pdf"]'))) {
    pdfUrl = window.location.href;

    const pdfIframe = document.querySelector('iframe[src*="pdf.js"]') || document.querySelector('iframe[src*=".pdf"]');
    if (pdfIframe) {
      const iframeSrc = pdfIframe.src;
      const urlMatch = iframeSrc.match(/[?&]file=([^&]+)/);
      if (urlMatch) {
        pdfUrl = decodeURIComponent(urlMatch[1]);
      }
    }

  }

  if (skipWaitContent) {
    if (pdfUrl) {
      const pdfText = await extractTextFromPDF(pdfUrl);
      if (pdfText) {
        return {
          title: document.title,
          url: window.location.href,
          content: pdfText
        };
      }
      return null;
    }

    // 非 PDF：短 TTL 缓存，减少重复提取导致的卡顿（但 YouTube 字幕仍会每次尝试获取）
    const now = Date.now();
    const currentUrl = window.location.href;

    let mainContent = '';
    let usedCache = false;

    if (lastExtractedPage &&
        lastExtractedPage.url === currentUrl &&
        now - lastExtractedPage.createdAt < PAGE_TEXT_CACHE_TTL_MS) {
      mainContent = lastExtractedPage.content || '';
      usedCache = true;
    } else {
      const iframes = document.querySelectorAll('iframe');
      let frameContent = '';
      for (const iframe of iframes) {
        try {
          if (iframe.contentDocument || iframe.contentWindow) {
            const iframeDocument = iframe.contentDocument || iframe.contentWindow.document;
            const content = iframeDocument.body.innerText;
            frameContent += content;
          }
        } catch (e) {
          // ignore
        }
      }

      const tempContainer = document.body.cloneNode(true);

      const originalFormElements = document.body.querySelectorAll('textarea, input');
      const clonedFormElements = tempContainer.querySelectorAll('textarea, input');
      originalFormElements.forEach((el, index) => {
        if (clonedFormElements[index] && el.value) {
          clonedFormElements[index].textContent = el.value;
        }
      });

      const selectorsToRemove = [
          'script', 'style', 'nav', 'header', 'footer',
          'iframe', 'noscript', 'img', 'svg', 'video',
          '[role="complementary"]', '[role="navigation"]',
          '.sidebar', '.nav', '.footer', '.header'
      ];
      selectorsToRemove.forEach(selector => {
          tempContainer.querySelectorAll(selector).forEach(element => element.remove());
      });

      mainContent = tempContainer.innerText + frameContent;
      mainContent = mainContent.replace(/\s+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
    }

    let youtubeTranscript = null;
    if (isYouTubeHost(window.location.hostname)) {
      youtubeTranscript = await extractYouTubeTranscriptText();
    }

    if (mainContent.length < 40 && !youtubeTranscript?.transcript) {
      return null;
    }

    const gptTokenCount = await estimateGPTTokens(mainContent);

    if (!usedCache) {
      lastExtractedPage = {
        title: document.title,
        url: currentUrl,
        content: mainContent,
        createdAt: now
      };
    }

    return {
      title: document.title,
      url: currentUrl,
      content: mainContent,
      youtubeTranscript
    };
  }

  return null;
}

const PDFJS_WORKER_PATH = chrome.runtime.getURL('lib/pdf.worker.js');

let pdfJsReadyPromise = null;

function hasPdfJs() {
  return typeof globalThis.pdfjsLib === 'object' &&
    typeof globalThis.pdfjsLib.getDocument === 'function' &&
    globalThis.pdfjsLib.GlobalWorkerOptions;
}

async function ensurePdfJsReady() {
  if (hasPdfJs()) {
    try {
      globalThis.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_PATH;
    } catch {
      // ignore
    }
    return true;
  }

  if (pdfJsReadyPromise) return pdfJsReadyPromise;

  pdfJsReadyPromise = (async () => {
    const response = await chrome.runtime.sendMessage({ type: 'ENSURE_PDFJS' });
    if (!response?.success) {
      throw new Error(response?.error || 'ENSURE_PDFJS failed');
    }

    if (!hasPdfJs()) {
      throw new Error('PDF.js loaded but pdfjsLib is unavailable');
    }

    globalThis.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_PATH;
    return true;
  })();

  try {
    return await pdfJsReadyPromise;
  } catch (error) {
    pdfJsReadyPromise = null; // allow retry
    throw error;
  }
}

let inFlightPdfUrl = null;
let inFlightPdfExtraction = null;

const PDF_TEXT_CACHE_MAX_ENTRIES = 3;
const PDF_TEXT_CACHE_MAX_CHARS = 1_000_000;
const pdfTextCache = new Map();

function getCachedPdfText(url) {
  const cached = pdfTextCache.get(url);
  if (!cached) return null;
  pdfTextCache.delete(url);
  pdfTextCache.set(url, cached);
  return cached.text || null;
}

function setCachedPdfText(url, text) {
  if (!url || !text) return;
  if (typeof text === 'string' && text.length > PDF_TEXT_CACHE_MAX_CHARS) return;
  pdfTextCache.delete(url);
  pdfTextCache.set(url, { text, createdAt: Date.now() });
  while (pdfTextCache.size > PDF_TEXT_CACHE_MAX_ENTRIES) {
    const oldestKey = pdfTextCache.keys().next().value;
    if (!oldestKey) break;
    pdfTextCache.delete(oldestKey);
  }
}

async function extractTextFromPDF(url) {
  await ensurePdfJsReady();
  const pdfjsLib = globalThis.pdfjsLib;

  const cachedText = getCachedPdfText(url);
  if (cachedText) return cachedText;

  if (inFlightPdfExtraction && inFlightPdfUrl === url) {
    return inFlightPdfExtraction;
  }

  inFlightPdfUrl = url;

  const extractionPromise = (async () => {
  let requestId = null;
  const sendRuntimeMessage = (message) => new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
      resolve(response);
    });
  });
  let loadingTask = null;
  let pdf = null;
  let worker = null;
  try {
    // 使用已存在的 sidebar 实例
    if (!sidebar || !sidebar.sidebar) {
      console.error('侧边栏实例不存在');
      return null;
    }

    // 获取iframe
    const iframe = sidebar.sidebar.querySelector('.cerebr-sidebar__iframe');
    if (!iframe) {
      console.error('找不到iframe元素');
      return null;
    }

    // 发送更新placeholder消息
    const sendPlaceholderUpdate = (message, timeout = 0) => {
      iframe.contentWindow.postMessage({
        type: 'UPDATE_PLACEHOLDER',
        placeholder: message,
        timeout: timeout
      }, '*');
    };

    sendPlaceholderUpdate('正在下载PDF文件...');

    const initResponse = await sendRuntimeMessage({
      action: 'downloadPDF',
      url: url
    });

    if (!initResponse.success) {
      sendPlaceholderUpdate('PDF下载失败', 2000);
      throw new Error('PDF初始化失败');
    }

    requestId = initResponse.requestId;
    const { totalChunks, totalSize, chunkSize } = initResponse;

    if (!requestId) {
      sendPlaceholderUpdate('PDF下载失败', 2000);
      throw new Error('PDF初始化失败：缺少 requestId');
    }

    const effectiveChunkSize = Number.isFinite(chunkSize) && chunkSize > 0 ? chunkSize : (4 * 1024 * 1024);
    const completeData = new Uint8Array(totalSize);
    let receivedBytes = 0;
    for (let i = 0; i < totalChunks; i++) {
      sendPlaceholderUpdate(`正在下载PDF文件 (${Math.round((i + 1) / totalChunks * 100)}%)...`);

      const chunkResponse = await sendRuntimeMessage({
        action: 'getPDFChunk',
        requestId,
        chunkIndex: i
      });

      if (!chunkResponse?.success) {
        sendPlaceholderUpdate('PDF下载失败', 2000);
        throw new Error(`获取PDF块 ${i} 失败`);
      }

      const chunkData = chunkResponse.data;
      const chunkBytes = chunkData instanceof ArrayBuffer
        ? new Uint8Array(chunkData)
        : Array.isArray(chunkData)
          ? Uint8Array.from(chunkData)
          : new Uint8Array();
      const start = i * effectiveChunkSize;
      const expectedLen = Math.min(effectiveChunkSize, totalSize - start);
      if (chunkBytes.byteLength !== expectedLen) {
        throw new Error(`PDF块长度异常: chunk=${i}, got=${chunkBytes.byteLength}, expected=${expectedLen}, start=${start}, totalSize=${totalSize}`);
      }
      completeData.set(chunkBytes, start);
      receivedBytes += chunkBytes.byteLength;
    }

    if (receivedBytes !== totalSize) {
      throw new Error(`PDF下载不完整: received=${receivedBytes}, totalSize=${totalSize}`);
    }

    // 基本文件头校验，便于定位“下载到的并非PDF”类问题（例如HTML/重定向页）
    const header = String.fromCharCode(...completeData.slice(0, 5));
    if (header !== '%PDF-') {
      const preview = new TextDecoder('utf-8', { fatal: false }).decode(completeData.slice(0, 300));
      throw new Error(`下载内容不是PDF(缺少%PDF-头)，前300字节预览: ${preview}`);
    }

    sendPlaceholderUpdate('正在解析PDF文件...');

    try {
      if (pdfjsLib.PDFWorker) {
        worker = new pdfjsLib.PDFWorker({ name: `cerebr-pdf-${Date.now()}` });
      }
    } catch (e) {
      worker = null;
    }

    loadingTask = pdfjsLib.getDocument(worker ? { data: completeData, worker } : { data: completeData });
    pdf = await loadingTask.promise;

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      sendPlaceholderUpdate(`正在提取文本 (${i}/${pdf.numPages})...`);
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
      try {
        page.cleanup();
      } catch (e) {
        // ignore
      }
    }

    const gptTokenCount = await estimateGPTTokens(fullText);
    sendPlaceholderUpdate(`PDF处理完成 (约 ${gptTokenCount} tokens)`, 2000);
    setCachedPdfText(url, fullText);
    return fullText;
  } catch (error) {
    console.error('PDF处理过程中出错:', error);
    if (sidebar && sidebar.sidebar) {
      const iframe = sidebar.sidebar.querySelector('.cerebr-sidebar__iframe');
      if (iframe) {
        iframe.contentWindow.postMessage({
          type: 'UPDATE_PLACEHOLDER',
          placeholder: 'PDF处理失败',
          timeout: 2000
        }, '*');
      }
    }
    return null;
  } finally {
    if (requestId) {
      sendRuntimeMessage({ action: 'releasePDF', requestId }).catch(() => {});
    }
    try {
      if (pdf && typeof pdf.destroy === 'function') {
        await pdf.destroy();
      }
    } catch (e) {
      // ignore
    }
    try {
      if (loadingTask && typeof loadingTask.destroy === 'function') {
        await loadingTask.destroy();
      }
    } catch (e) {
      // ignore
    }
    try {
      if (worker && typeof worker.destroy === 'function') {
        await worker.destroy();
      }
    } catch (e) {
      // ignore
    }
  }
  })();

  inFlightPdfExtraction = extractionPromise;

  try {
    return await extractionPromise;
  } finally {
    if (inFlightPdfExtraction === extractionPromise) {
      inFlightPdfExtraction = null;
      inFlightPdfUrl = null;
    }
  }
}


async function estimateGPTTokens(text) {
  try {
    const estimatedTokens = Math.ceil(text.length / 4.25625);
    return estimatedTokens;
  } catch (error) {
    return 0;
  }
}
