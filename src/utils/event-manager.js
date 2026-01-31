/**
 * 事件管理模块 - 提供事件监听优化和清理
 * @module event-manager
 */

/**
 * 创建事件管理器
 * @returns {Object} 事件管理器实例
 */
export function createEventManager() {
    const listeners = new Map();
    let listenerId = 0;

    /**
     * 添加事件监听器
     * @param {EventTarget} target - 目标元素
     * @param {string} type - 事件类型
     * @param {Function} handler - 事件处理函数
     * @param {Object} [options] - 事件选项
     * @returns {number} 监听器 ID
     */
    const addListener = (target, type, handler, options = {}) => {
        const id = ++listenerId;
        target.addEventListener(type, handler, options);
        listeners.set(id, { target, type, handler, options });
        return id;
    };

    /**
     * 移除事件监听器
     * @param {number} id - 监听器 ID
     */
    const removeListener = (id) => {
        const listener = listeners.get(id);
        if (listener) {
            const { target, type, handler, options } = listener;
            target.removeEventListener(type, handler, options);
            listeners.delete(id);
        }
    };

    /**
     * 移除所有事件监听器
     */
    const removeAllListeners = () => {
        for (const [id, { target, type, handler, options }] of listeners) {
            target.removeEventListener(type, handler, options);
        }
        listeners.clear();
    };

    /**
     * 创建带防抖的事件处理器
     * @param {Function} handler - 原始处理函数
     * @param {number} delay - 延迟时间（毫秒）
     * @returns {Function} 防抖处理函数
     */
    const debounce = (handler, delay) => {
        let timeoutId = null;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => handler(...args), delay);
        };
    };

    /**
     * 创建带节流的事件处理器
     * @param {Function} handler - 原始处理函数
     * @param {number} limit - 节流时间（毫秒）
     * @returns {Function} 节流处理函数
     */
    const throttle = (handler, limit) => {
        let lastCall = 0;
        return (...args) => {
            const now = Date.now();
            if (now - lastCall >= limit) {
                lastCall = now;
                handler(...args);
            }
        };
    };

    /**
     * 创建带 RAF 的事件处理器
     * @param {Function} handler - 原始处理函数
     * @returns {Function} RAF 处理函数
     */
    const rafThrottle = (handler) => {
        let rafId = null;
        return (...args) => {
            if (rafId) return;
            rafId = requestAnimationFrame(() => {
                handler(...args);
                rafId = null;
            });
        };
    };

    return {
        addListener,
        removeListener,
        removeAllListeners,
        debounce,
        throttle,
        rafThrottle
    };
}

/**
 * 创建自定义事件分发器
 * @returns {Object} 事件分发器实例
 */
export function createEventEmitter() {
    const events = new Map();

    /**
     * 订阅事件
     * @param {string} event - 事件名称
     * @param {Function} handler - 事件处理函数
     * @returns {Function} 取消订阅函数
     */
    const on = (event, handler) => {
        if (!events.has(event)) {
            events.set(event, new Set());
        }
        events.get(event).add(handler);
        return () => off(event, handler);
    };

    /**
     * 订阅一次性事件
     * @param {string} event - 事件名称
     * @param {Function} handler - 事件处理函数
     */
    const once = (event, handler) => {
        const wrapper = (...args) => {
            off(event, wrapper);
            handler(...args);
        };
        on(event, wrapper);
    };

    /**
     * 取消订阅事件
     * @param {string} event - 事件名称
     * @param {Function} handler - 事件处理函数
     */
    const off = (event, handler) => {
        const handlers = events.get(event);
        if (handlers) {
            handlers.delete(handler);
            if (handlers.size === 0) {
                events.delete(event);
            }
        }
    };

    /**
     * 发射事件
     * @param {string} event - 事件名称
     * @param {*} data - 事件数据
     */
    const emit = (event, data) => {
        const handlers = events.get(event);
        if (handlers) {
            for (const handler of handlers) {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Error in event handler for "${event}":`, error);
                }
            }
        }
    };

    /**
     * 清空所有事件
     */
    const clear = () => {
        events.clear();
    };

    return { on, once, off, emit, clear };
}

/**
 * 分发 Cerebr 自定义事件
 * @param {string} eventName - 事件名称（不含 cerebr: 前缀）
 * @param {Object} [detail] - 事件详情
 */
export function dispatchCerebrEvent(eventName, detail = {}) {
    document.dispatchEvent(new CustomEvent(`cerebr:${eventName}`, { detail }));
}
