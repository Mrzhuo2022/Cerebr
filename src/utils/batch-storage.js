/**
 * 批量存储操作优化模块
 * @module batch-storage
 */

import { storageAdapter, syncStorageAdapter } from './storage-adapter.js';

/**
 * 创建批量存储写入器
 * @param {Object} adapter - 存储适配器
 * @param {number} [batchDelay=100] - 批量延迟（毫秒）
 * @returns {Object} 批量写入器实例
 */
export function createBatchWriter(adapter, batchDelay = 100) {
    let pendingWrites = {};
    let pendingDeletes = new Set();
    let flushTimer = null;
    let flushPromise = null;
    let flushResolve = null;

    /**
     * 执行批量写入
     */
    const executeBatch = async () => {
        const writes = { ...pendingWrites };
        const deletes = [...pendingDeletes];
        pendingWrites = {};
        pendingDeletes = new Set();
        flushTimer = null;

        const resolve = flushResolve;
        flushResolve = null;
        flushPromise = null;

        try {
            // 并行执行写入和删除
            const promises = [];
            
            if (Object.keys(writes).length > 0) {
                promises.push(adapter.set(writes));
            }
            
            if (deletes.length > 0) {
                promises.push(adapter.remove(deletes));
            }

            await Promise.all(promises);
            resolve?.();
        } catch (error) {
            console.error('Batch storage operation failed:', error);
            resolve?.();
            throw error;
        }
    };

    /**
     * 调度批量执行
     */
    const scheduleBatch = () => {
        if (flushTimer) return;
        
        if (!flushPromise) {
            flushPromise = new Promise((resolve) => {
                flushResolve = resolve;
            });
        }
        
        flushTimer = setTimeout(executeBatch, batchDelay);
    };

    /**
     * 写入数据
     * @param {string} key - 键
     * @param {*} value - 值
     * @returns {Promise} 写入完成的 Promise
     */
    const write = (key, value) => {
        pendingWrites[key] = value;
        pendingDeletes.delete(key);
        scheduleBatch();
        return flushPromise;
    };

    /**
     * 批量写入数据
     * @param {Object} data - 键值对对象
     * @returns {Promise} 写入完成的 Promise
     */
    const writeMany = (data) => {
        Object.assign(pendingWrites, data);
        for (const key of Object.keys(data)) {
            pendingDeletes.delete(key);
        }
        scheduleBatch();
        return flushPromise;
    };

    /**
     * 删除数据
     * @param {string|string[]} keys - 要删除的键
     * @returns {Promise} 删除完成的 Promise
     */
    const remove = (keys) => {
        const keyArray = Array.isArray(keys) ? keys : [keys];
        for (const key of keyArray) {
            pendingDeletes.add(key);
            delete pendingWrites[key];
        }
        scheduleBatch();
        return flushPromise;
    };

    /**
     * 立即刷新所有待处理的操作
     * @returns {Promise}
     */
    const flush = async () => {
        if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
        }
        
        if (Object.keys(pendingWrites).length > 0 || pendingDeletes.size > 0) {
            await executeBatch();
        }
    };

    /**
     * 检查是否有待处理的操作
     * @returns {boolean}
     */
    const hasPending = () => {
        return Object.keys(pendingWrites).length > 0 || pendingDeletes.size > 0;
    };

    return {
        write,
        writeMany,
        remove,
        flush,
        hasPending
    };
}

/**
 * 创建缓存读取器
 * @param {Object} adapter - 存储适配器
 * @param {number} [ttl=5000] - 缓存过期时间（毫秒）
 * @returns {Object} 缓存读取器实例
 */
export function createCachedReader(adapter, ttl = 5000) {
    const cache = new Map();

    /**
     * 读取数据（带缓存）
     * @param {string|string[]} keys - 要读取的键
     * @returns {Promise<Object>} 读取结果
     */
    const read = async (keys) => {
        const keyArray = Array.isArray(keys) ? keys : [keys];
        const now = Date.now();
        const result = {};
        const keysToFetch = [];

        // 检查缓存
        for (const key of keyArray) {
            const cached = cache.get(key);
            if (cached && now - cached.timestamp < ttl) {
                result[key] = cached.value;
            } else {
                keysToFetch.push(key);
            }
        }

        // 获取未缓存的数据
        if (keysToFetch.length > 0) {
            const fetched = await adapter.get(keysToFetch);
            for (const key of keysToFetch) {
                const value = fetched[key];
                result[key] = value;
                cache.set(key, { value, timestamp: now });
            }
        }

        return Array.isArray(keys) ? result : result;
    };

    /**
     * 使缓存失效
     * @param {string|string[]} keys - 要失效的键
     */
    const invalidate = (keys) => {
        const keyArray = Array.isArray(keys) ? keys : [keys];
        for (const key of keyArray) {
            cache.delete(key);
        }
    };

    /**
     * 清空所有缓存
     */
    const clear = () => {
        cache.clear();
    };

    /**
     * 预热缓存
     * @param {string[]} keys - 要预热的键
     */
    const warm = async (keys) => {
        const fetched = await adapter.get(keys);
        const now = Date.now();
        for (const key of keys) {
            cache.set(key, { value: fetched[key], timestamp: now });
        }
    };

    return {
        read,
        invalidate,
        clear,
        warm
    };
}

// 默认批量写入器实例
export const localBatchWriter = createBatchWriter(storageAdapter, 100);
export const syncBatchWriter = createBatchWriter(syncStorageAdapter, 200);

// 默认缓存读取器实例
export const localCachedReader = createCachedReader(storageAdapter, 5000);
export const syncCachedReader = createCachedReader(syncStorageAdapter, 10000);
