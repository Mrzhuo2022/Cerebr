/**
 * API 配置管理模块
 * @module api-config
 */

import { normalizeChatCompletionsUrl } from '../utils/api-url.js';
import { storageAdapter, syncStorageAdapter } from '../utils/storage-adapter.js';

// 常量定义
export const SYSTEM_PROMPT_SYNC_THRESHOLD_BYTES = 6000;
export const SYSTEM_PROMPT_KEY_PREFIX = 'apiConfigSystemPrompt_';
export const SYSTEM_PROMPT_LOCAL_ONLY_KEY_PREFIX = 'apiConfigSystemPromptLocalOnly_';
export const SYSTEM_PROMPT_LOCAL_DEBOUNCE_MS = 200;
export const SYSTEM_PROMPT_SYNC_DEBOUNCE_MS = 2000;
export const API_CONFIGS_SYNC_DEBOUNCE_MS = 800;

/**
 * 获取系统提示存储键
 * @param {string} configId - 配置 ID
 * @returns {string}
 */
export const getSystemPromptKey = (configId) => `${SYSTEM_PROMPT_KEY_PREFIX}${configId}`;

/**
 * 获取系统提示本地优先存储键
 * @param {string} configId - 配置 ID
 * @returns {string}
 */
export const getSystemPromptLocalOnlyKey = (configId) => `${SYSTEM_PROMPT_LOCAL_ONLY_KEY_PREFIX}${configId}`;

/**
 * 生成配置 ID
 * @returns {string}
 */
export function generateConfigId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `cfg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 确保配置有 ID
 * @param {Object} config - API 配置
 * @returns {string} 配置 ID
 */
export function ensureConfigId(config) {
    if (!config.id) {
        config.id = generateConfigId();
    }
    return config.id;
}

/**
 * 获取字符串 UTF-8 字节长度
 * @param {string} value - 字符串
 * @returns {number}
 */
export function getUtf8ByteLength(value) {
    try {
        return new TextEncoder().encode(value ?? '').length;
    } catch {
        return (value ?? '').length;
    }
}

/**
 * 规范化 API 配置
 * @param {Object} config - 原始配置
 * @returns {Object} 规范化后的配置
 */
export function normalizeApiConfig(config) {
    const normalized = { ...(config || {}) };
    ensureConfigId(normalized);
    normalized.apiKey = normalized.apiKey ?? '';
    normalized.baseUrl = normalized.baseUrl 
        ? (normalizeChatCompletionsUrl(normalized.baseUrl) || normalized.baseUrl)
        : '';
    normalized.modelName = normalized.modelName ?? '';
    normalized.advancedSettings = {
        ...(normalized.advancedSettings || {}),
        systemPrompt: normalized.advancedSettings?.systemPrompt ?? '',
        isExpanded: normalized.advancedSettings?.isExpanded ?? false,
    };
    return normalized;
}

/**
 * 剥离 API 配置用于同步（移除敏感/大数据字段）
 * @param {Object} config - 原始配置
 * @returns {Object} 剥离后的配置
 */
export function stripApiConfigForSync(config) {
    const advancedSettings = { ...(config.advancedSettings || {}) };
    delete advancedSettings.systemPrompt;
    return {
        ...config,
        advancedSettings,
    };
}

/**
 * 创建 API 配置管理器
 * @returns {Object} 管理器实例
 */
export function createApiConfigManager() {
    const apiConfigs = [];
    let selectedConfigIndex = 0;
    let apiConfigsSaveChain = Promise.resolve();
    let apiConfigsPersistTimer = null;
    const systemPromptPersistStateByConfigId = new Map();

    /**
     * 持久化系统提示到本地存储
     */
    const persistSystemPromptLocalNow = async ({ configId, systemPrompt }) => {
        const promptKey = getSystemPromptKey(configId);
        await storageAdapter.set({ [promptKey]: systemPrompt });
    };

    /**
     * 持久化系统提示到同步存储
     */
    const persistSystemPromptSyncNow = async ({ configId, systemPrompt }) => {
        const promptKey = getSystemPromptKey(configId);
        const localOnlyKey = getSystemPromptLocalOnlyKey(configId);
        const byteLength = getUtf8ByteLength(systemPrompt);

        if (byteLength <= SYSTEM_PROMPT_SYNC_THRESHOLD_BYTES) {
            try {
                await syncStorageAdapter.set({ [promptKey]: systemPrompt, [localOnlyKey]: false });
            } catch (error) {
                const message = String(error?.message || error);
                if (message.includes('kQuotaBytesPerItem') || message.includes('QuotaExceeded')) {
                    await syncStorageAdapter.set({ [promptKey]: '', [localOnlyKey]: true });
                } else {
                    throw error;
                }
            }
        } else {
            await syncStorageAdapter.set({ [promptKey]: '', [localOnlyKey]: true });
        }
    };

    /**
     * 队列系统提示持久化
     */
    const queueSystemPromptPersist = (config) => {
        const configId = ensureConfigId(config);
        const systemPrompt = config.advancedSettings?.systemPrompt ?? '';

        const byteLength = getUtf8ByteLength(systemPrompt);
        if (config.advancedSettings) {
            config.advancedSettings.systemPromptLocalOnly = byteLength > SYSTEM_PROMPT_SYNC_THRESHOLD_BYTES;
        }

        const prev = systemPromptPersistStateByConfigId.get(configId) || {};
        if (prev.localTimer) clearTimeout(prev.localTimer);
        if (prev.syncTimer) clearTimeout(prev.syncTimer);

        const state = {
            latestSystemPrompt: systemPrompt,
            localTimer: setTimeout(() => {
                persistSystemPromptLocalNow({ configId, systemPrompt }).catch(() => {});
            }, SYSTEM_PROMPT_LOCAL_DEBOUNCE_MS),
            syncTimer: setTimeout(() => {
                persistSystemPromptSyncNow({ configId, systemPrompt }).catch(() => {});
            }, SYSTEM_PROMPT_SYNC_DEBOUNCE_MS),
        };

        systemPromptPersistStateByConfigId.set(configId, state);
    };

    /**
     * 刷新系统提示持久化
     */
    const flushSystemPromptPersist = async (config) => {
        const configId = ensureConfigId(config);
        const state = systemPromptPersistStateByConfigId.get(configId);
        const systemPrompt = config.advancedSettings?.systemPrompt ?? state?.latestSystemPrompt ?? '';

        if (state?.localTimer) clearTimeout(state.localTimer);
        if (state?.syncTimer) clearTimeout(state.syncTimer);
        systemPromptPersistStateByConfigId.delete(configId);

        await persistSystemPromptLocalNow({ configId, systemPrompt });
        await persistSystemPromptSyncNow({ configId, systemPrompt });
    };

    /**
     * 保存 API 配置（立即）
     */
    const saveAPIConfigsNow = async () => {
        try {
            const nextConfigs = apiConfigs.map(normalizeApiConfig);
            apiConfigs.splice(0, apiConfigs.length, ...nextConfigs);
            if (!Number.isInteger(selectedConfigIndex)) {
                selectedConfigIndex = 0;
            }
            selectedConfigIndex = Math.max(0, Math.min(selectedConfigIndex, apiConfigs.length - 1));

            const localPayload = {};
            const syncPayload = {
                apiConfigs: apiConfigs.map(stripApiConfigForSync),
                selectedConfigIndex,
            };

            for (const config of apiConfigs) {
                const id = ensureConfigId(config);
                const promptKey = getSystemPromptKey(id);
                const localOnlyKey = getSystemPromptLocalOnlyKey(id);

                const systemPrompt = config.advancedSettings?.systemPrompt ?? '';
                localPayload[promptKey] = systemPrompt;

                const byteLength = getUtf8ByteLength(systemPrompt);
                if (byteLength <= SYSTEM_PROMPT_SYNC_THRESHOLD_BYTES) {
                    syncPayload[promptKey] = systemPrompt;
                    syncPayload[localOnlyKey] = false;
                    if (config.advancedSettings) config.advancedSettings.systemPromptLocalOnly = false;
                } else {
                    syncPayload[promptKey] = '';
                    syncPayload[localOnlyKey] = true;
                    if (config.advancedSettings) config.advancedSettings.systemPromptLocalOnly = true;
                }
            }

            await storageAdapter.set(localPayload);
            await syncStorageAdapter.set(syncPayload);
        } catch (error) {
            console.error('保存 API 配置失败:', error);

            const message = String(error?.message || error);
            if (message.includes('kQuotaBytesPerItem') || message.includes('QuotaExceeded')) {
                try {
                    const degradedSyncPayload = {
                        apiConfigs: apiConfigs.map(stripApiConfigForSync),
                        selectedConfigIndex,
                    };
                    for (const config of apiConfigs) {
                        const id = ensureConfigId(config);
                        degradedSyncPayload[getSystemPromptKey(id)] = '';
                        degradedSyncPayload[getSystemPromptLocalOnlyKey(id)] = true;
                    }
                    await syncStorageAdapter.set(degradedSyncPayload);
                } catch (degradedError) {
                    console.error('保存 API 配置失败（降级仍失败）:', degradedError);
                }
            }
        }
    };

    /**
     * 保存 API 配置（串行化）
     */
    const saveAPIConfigs = () => {
        apiConfigsSaveChain = Promise.resolve(apiConfigsSaveChain)
            .catch(() => {})
            .then(() => saveAPIConfigsNow());
        return apiConfigsSaveChain;
    };

    /**
     * 队列 API 配置持久化
     */
    const queueApiConfigsPersist = () => {
        if (apiConfigsPersistTimer) clearTimeout(apiConfigsPersistTimer);
        apiConfigsPersistTimer = setTimeout(() => {
            apiConfigsPersistTimer = null;
            saveAPIConfigs().catch(() => {});
        }, API_CONFIGS_SYNC_DEBOUNCE_MS);
    };

    /**
     * 刷新 API 配置持久化
     */
    const flushApiConfigsPersist = async () => {
        if (apiConfigsPersistTimer) {
            clearTimeout(apiConfigsPersistTimer);
            apiConfigsPersistTimer = null;
        }
        await saveAPIConfigs();
    };

    /**
     * 加载 API 配置
     */
    const loadAPIConfigs = async () => {
        try {
            const result = await syncStorageAdapter.get(['apiConfigs', 'selectedConfigIndex']);

            if (result.apiConfigs) {
                const nextConfigs = result.apiConfigs.map(normalizeApiConfig);
                apiConfigs.splice(0, apiConfigs.length, ...nextConfigs);
            } else {
                apiConfigs.splice(0, apiConfigs.length, {
                    id: generateConfigId(),
                    apiKey: '',
                    baseUrl: '',
                    modelName: '',
                    advancedSettings: {
                        systemPrompt: '',
                        isExpanded: false,
                    },
                });
                await saveAPIConfigs();
            }

            selectedConfigIndex = result.selectedConfigIndex ?? 0;
            if (!Number.isInteger(selectedConfigIndex)) {
                selectedConfigIndex = 0;
            }
            selectedConfigIndex = Math.max(0, Math.min(selectedConfigIndex, apiConfigs.length - 1));

            // 加载系统提示
            const promptKeys = apiConfigs.map((c) => getSystemPromptKey(c.id));
            const promptLocalOnlyKeys = apiConfigs.map((c) => getSystemPromptLocalOnlyKey(c.id));
            const promptSyncResult = await syncStorageAdapter.get([...promptKeys, ...promptLocalOnlyKeys]);

            const localPromptResults = await Promise.all(
                apiConfigs.map((c) =>
                    storageAdapter.get(getSystemPromptKey(c.id)).catch(() => ({}))
                )
            );

            let needsMigrationSave = false;
            const localPromptPayloadToCache = {};

            const nextConfigs = apiConfigs.map((config, idx) => {
                const promptKey = getSystemPromptKey(config.id);
                const localOnlyKey = getSystemPromptLocalOnlyKey(config.id);
                const localPrompt = localPromptResults[idx]?.[promptKey];
                const syncPrompt = promptSyncResult?.[promptKey];
                const localOnly = !!promptSyncResult?.[localOnlyKey];
                const legacyPrompt = config.advancedSettings?.systemPrompt;

                let systemPrompt = '';
                if (typeof localPrompt === 'string') {
                    systemPrompt = localPrompt;
                } else if (!localOnly && typeof syncPrompt === 'string' && syncPrompt.length > 0) {
                    systemPrompt = syncPrompt;
                    localPromptPayloadToCache[promptKey] = syncPrompt;
                } else if (typeof legacyPrompt === 'string' && legacyPrompt.length > 0) {
                    systemPrompt = legacyPrompt;
                    localPromptPayloadToCache[promptKey] = legacyPrompt;
                    needsMigrationSave = true;
                }

                return {
                    ...config,
                    advancedSettings: {
                        ...(config.advancedSettings || {}),
                        systemPrompt,
                        systemPromptLocalOnly: localOnly,
                    },
                };
            });
            apiConfigs.splice(0, apiConfigs.length, ...nextConfigs);

            if (Object.keys(localPromptPayloadToCache).length > 0) {
                await storageAdapter.set(localPromptPayloadToCache);
            }

            if (needsMigrationSave) {
                await saveAPIConfigs();
            }
        } catch (error) {
            console.error('加载 API 配置失败:', error);
            apiConfigs.splice(0, apiConfigs.length, {
                id: generateConfigId(),
                apiKey: '',
                baseUrl: '',
                modelName: '',
                advancedSettings: {
                    systemPrompt: '',
                    isExpanded: false,
                },
            });
            selectedConfigIndex = 0;
        }
    };

    /**
     * 删除配置前的清理
     */
    const cleanupConfigBeforeDelete = (configToDelete) => {
        const configId = configToDelete?.id;
        if (!configId) return;
        const promptKey = getSystemPromptKey(configId);
        const localOnlyKey = getSystemPromptLocalOnlyKey(configId);

        const state = systemPromptPersistStateByConfigId.get(configId);
        if (state?.localTimer) clearTimeout(state.localTimer);
        if (state?.syncTimer) clearTimeout(state.syncTimer);
        systemPromptPersistStateByConfigId.delete(configId);

        storageAdapter.remove(promptKey).catch(() => {});
        syncStorageAdapter.remove([promptKey, localOnlyKey]).catch(() => {});
    };

    return {
        apiConfigs,
        getSelectedConfigIndex: () => selectedConfigIndex,
        setSelectedConfigIndex: (index) => { selectedConfigIndex = index; },
        saveAPIConfigs,
        loadAPIConfigs,
        queueApiConfigsPersist,
        flushApiConfigsPersist,
        queueSystemPromptPersist,
        flushSystemPromptPersist,
        cleanupConfigBeforeDelete
    };
}
