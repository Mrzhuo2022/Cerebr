/**
 * API卡片配置接口
 * @typedef {Object} APIConfig
 * @property {string} apiKey - API密钥
 * @property {string} baseUrl - API的基础URL
 * @property {string} modelName - 模型名称
 * @property {Object} advancedSettings - 高级设置
 * @property {string} advancedSettings.systemPrompt - 系统提示
 * @property {boolean} advancedSettings.isExpanded - 高级设置是否展开
 */

/**
 * 渲染 API 卡片
 * @param {Object} params - 渲染参数
 * @param {Array<APIConfig>} params.apiConfigs - API配置列表
 * @param {HTMLElement} params.apiCardsContainer - 卡片容器元素
 * @param {HTMLElement} params.templateCard - 模板卡片元素
 * @param {function} params.onCardCreate - 卡片创建回调函数
 * @param {function} params.onCardSelect - 卡片选择回调函数
 * @param {function} params.onCardDuplicate - 卡片复制回调函数
 * @param {function} params.onCardDelete - 卡片删除回调函数
 * @param {function} params.onCardChange - 卡片内容变更回调函数
 * @param {number} params.selectedIndex - 当前选中的卡片索引
 */
export function renderAPICards({
    apiConfigs,
    apiCardsContainer,
    templateCard,
    onCardCreate,
    onCardSelect,
    onCardDuplicate,
    onCardDelete,
    onCardChange,
    selectedIndex
}) {
    if (!templateCard) {
        console.error('找不到模板卡片元素');
        return;
    }

    // 保存模板的副本
    const templateClone = templateCard.cloneNode(true);

    // 清空现有卡片
    apiCardsContainer.innerHTML = '';

    // 先重新添加模板（保持隐藏状态）
    apiCardsContainer.appendChild(templateClone);

    // 移除所有卡片的选中状态
    document.querySelectorAll('.api-card').forEach(card => {
        card.classList.remove('selected');
    });

    // 渲染实际的卡片
    apiConfigs.forEach((config, index) => {
        const card = createAPICard({
            config,
            index,
            templateCard: templateClone,
            onSelect: onCardSelect,
            onDuplicate: onCardDuplicate,
            onDelete: onCardDelete,
            onChange: onCardChange,
            isSelected: index === selectedIndex
        });
        apiCardsContainer.appendChild(card);
        if (onCardCreate) {
            onCardCreate(card, index);
        }
    });
}

/**
 * 创建单个 API 卡片
 * @param {Object} params - 创建参数
 * @param {APIConfig} params.config - API配置
 * @param {number} params.index - 卡片索引
 * @param {HTMLElement} params.templateCard - 模板卡片元素
 * @param {function} params.onSelect - 选择回调
 * @param {function} params.onDuplicate - 复制回调
 * @param {function} params.onDelete - 删除回调
 * @param {function} params.onChange - 变更回调
 * @param {boolean} params.isSelected - 是否选中
 * @returns {HTMLElement} 创建的卡片元素
 */

import { normalizeChatCompletionsUrl } from '../utils/api-url.js';

function createAPICard({
    config,
    index,
    templateCard,
    onSelect,
    onDuplicate,
    onDelete,
    onChange,
    isSelected
}) {
    // 克隆模板
    const template = templateCard.cloneNode(true);
    template.classList.remove('template');
    template.style.display = '';
    template.setAttribute('tabindex', '0');

    // 设置选中状态
    if (isSelected) {
        template.classList.add('selected');
    } else {
        template.classList.remove('selected');
    }

    const apiKeyInput = template.querySelector('.api-key');
    const baseUrlInput = template.querySelector('.base-url');
    const modelNameInput = template.querySelector('.model-name');
    const systemPromptInput = template.querySelector('.system-prompt');
    const advancedSettingsHeader = template.querySelector('.advanced-settings-header');
    const advancedSettingsContent = template.querySelector('.advanced-settings-content');
    const toggleIcon = template.querySelector('.toggle-icon');
    const fetchModelsBtn = template.querySelector('.fetch-models-btn');
    const toggleApiKeyBtn = template.querySelector('.toggle-api-key-btn');

    // 设置初始值
    apiKeyInput.value = config.apiKey || '';
    baseUrlInput.value = config.baseUrl || '';

    // 设置模型选择框的值
    const initialModel = config.modelName || '';
    // 检查选项是否已存在，不存在则添加
    let modelExists = false;
    for (const option of modelNameInput.options) {
        if (option.value === initialModel) {
            modelExists = true;
            break;
        }
    }
    if (!modelExists && initialModel) {
        const newOption = document.createElement('option');
        newOption.value = initialModel;
        newOption.textContent = initialModel;
        modelNameInput.appendChild(newOption);
    }
    modelNameInput.value = initialModel;

    // 设置系统提示的默认值
    systemPromptInput.value = config.advancedSettings?.systemPrompt || '';

    // 设置高级设置的展开/折叠状态
    const isExpanded = config.advancedSettings?.isExpanded || false;
    advancedSettingsContent.style.display = isExpanded ? 'block' : 'none';
    toggleIcon.style.transform = isExpanded ? 'rotate(180deg)' : '';

    const buildNextConfig = ({ advancedSettingsOverride } = {}) => {
        const advancedSettings = {
            ...(config.advancedSettings || {}),
            isExpanded: advancedSettingsContent.style.display === 'block',
            systemPrompt: systemPromptInput.value,
            ...(advancedSettingsOverride || {}),
        };

        return {
            ...config,
            apiKey: apiKeyInput.value,
            baseUrl: baseUrlInput.value,
            modelName: modelNameInput.value,
            advancedSettings,
        };
    };

    // API Key 显示/隐藏切换功能
    let isApiKeyVisible = false;
    toggleApiKeyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        isApiKeyVisible = !isApiKeyVisible;
        apiKeyInput.type = isApiKeyVisible ? 'text' : 'password';
        const eyeIcon = toggleApiKeyBtn.querySelector('.eye-icon');
        const eyeOffIcon = toggleApiKeyBtn.querySelector('.eye-off-icon');
        eyeIcon.style.display = isApiKeyVisible ? 'none' : 'block';
        eyeOffIcon.style.display = isApiKeyVisible ? 'block' : 'none';
    });

    // 添加高级设置的展开/折叠功能
    advancedSettingsHeader.addEventListener('click', (e) => {
        e.stopPropagation();
        const isCurrentlyExpanded = advancedSettingsContent.style.display === 'block';
        advancedSettingsContent.style.display = isCurrentlyExpanded ? 'none' : 'block';
        toggleIcon.style.transform = isCurrentlyExpanded ? '' : 'rotate(180deg)';

        // 更新配置
        onChange(index, buildNextConfig({
            advancedSettingsOverride: {
                isExpanded: !isCurrentlyExpanded,
            }
        }));
    });

    // 系统提示：实时更新并自动保存（由外层实现节流/同步策略）
    systemPromptInput.addEventListener('input', () => {
        onChange(index, buildNextConfig(), { kind: 'systemPrompt' });
    });

    // 在失焦时强制落盘一次，避免 debounce 尚未触发导致丢失
    systemPromptInput.addEventListener('change', () => {
        onChange(index, buildNextConfig(), { kind: 'systemPrompt', flush: true });
    });

    // 其他字段：实时更新并自动保存（由外层实现节流/同步策略）
    [apiKeyInput, baseUrlInput].forEach((input) => {
        input.addEventListener('input', () => {
            onChange(index, buildNextConfig(), { kind: 'apiFields' });
        });
    });

    // 模型选择框使用 change 事件
    modelNameInput.addEventListener('change', () => {
        onChange(index, buildNextConfig(), { kind: 'apiFields', flush: true });
    });

    // 阻止输入框和按钮点击事件冒泡
    const stopPropagation = (e) => {
        e.stopPropagation();
        e.preventDefault();
    };

    // 为输入框添加点击事件阻止冒泡（select 不需要阻止）
    [apiKeyInput, baseUrlInput, systemPromptInput].forEach(input => {
        input.addEventListener('click', stopPropagation);
        input.addEventListener('focus', stopPropagation);
    });

    // 添加输入法状态跟踪
    let isComposing = false;

    // 监听输入法开始（不需要监听 select）
    [apiKeyInput, baseUrlInput, systemPromptInput].forEach(input => {
        input.addEventListener('compositionstart', () => {
            isComposing = true;
        });

        // 监听输入法结束
        input.addEventListener('compositionend', () => {
            isComposing = false;
        });
    });

    // 获取模型列表按钮
    fetchModelsBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();

        const baseUrl = baseUrlInput.value.trim();
        const apiKey = apiKeyInput.value.trim();

        if (!baseUrl) {
            alert('请先输入 Base URL');
            return;
        }

        if (!apiKey) {
            alert('请先输入 API Key');
            return;
        }

        // 显示加载状态
        fetchModelsBtn.classList.add('loading');

        try {
            const models = await fetchModelsFromAPI(baseUrl, apiKey);

            if (models.length === 0) {
                alert('未找到可用模型');
                return;
            }

            // 保存当前选中的值
            const currentValue = modelNameInput.value;

            // 清空并填充 select 选项
            modelNameInput.innerHTML = '';
            models.forEach((modelId) => {
                const option = document.createElement('option');
                option.value = modelId;
                option.textContent = modelId;
                modelNameInput.appendChild(option);
            });

            // 尝试恢复之前选中的值
            let valueRestored = false;
            for (const option of modelNameInput.options) {
                if (option.value === currentValue) {
                    modelNameInput.value = currentValue;
                    valueRestored = true;
                    break;
                }
            }

            // 如果之前的值不在新列表中，选择第一个模型
            if (!valueRestored && models.length > 0) {
                modelNameInput.value = models[0];
            }

            console.log(`[API Card] 成功获取 ${models.length} 个模型`);

            // 触发变更事件保存配置
            onChange(index, buildNextConfig(), { kind: 'apiFields', flush: true });
        } catch (error) {
            console.error('[API Card] 获取模型失败:', error);
            alert(`获取模型失败: ${error.message}\n\n请检查 Base URL 和 API Key 是否正确`);
        } finally {
            fetchModelsBtn.classList.remove('loading');
        }
    });

    // 修改键盘事件处理（普通输入框）
    [apiKeyInput, baseUrlInput].forEach(input => {
        input.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                if (isComposing) {
                    // 如果正在使用输入法，不触发选择
                    return;
                }
                e.preventDefault();
                e.stopPropagation();

                if (input === baseUrlInput) {
                    baseUrlInput.value = normalizeChatCompletionsUrl(baseUrlInput.value) || baseUrlInput.value.trim();
                }

                const maybePromise = onChange(index, buildNextConfig(), { kind: 'apiFields', flush: true });
                if (maybePromise && typeof maybePromise.then === 'function') {
                    try {
                        await maybePromise;
                    } catch {
                        // ignore
                    }
                }
                onSelect(template, index);
            }
        });
    });

    // 模型选择框的键盘事件处理
    modelNameInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            const maybePromise = onChange(index, buildNextConfig(), { kind: 'apiFields', flush: true });
            if (maybePromise && typeof maybePromise.then === 'function') {
                try {
                    await maybePromise;
                } catch {
                    // ignore
                }
            }
            onSelect(template, index);
        }
    });

    // 修改键盘事件处理（系统提示 textarea：回车先 flush 再返回）
    systemPromptInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            if (isComposing) return;
            e.preventDefault();

            const maybePromise = onChange(index, buildNextConfig(), { kind: 'systemPrompt', flush: true });
            if (maybePromise && typeof maybePromise.then === 'function') {
                try {
                    await maybePromise;
                } catch {
                    // ignore
                }
            }

            onSelect(template, index);
        }
    });

    // 为按钮添加点击事件阻止冒泡
    template.querySelectorAll('.card-button').forEach(button => {
        button.addEventListener('click', stopPropagation);
    });

    // 添加回车键选择功能
    template.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !isComposing) {
            e.preventDefault();
            onSelect(template, index);
        }
    });

    // 监听输入框变化
    [apiKeyInput, baseUrlInput].forEach(input => {
        input.addEventListener('change', () => {
            if (input === baseUrlInput) {
                baseUrlInput.value = normalizeChatCompletionsUrl(baseUrlInput.value) || baseUrlInput.value.trim();
            }
            onChange(index, buildNextConfig(), { kind: 'apiFields', flush: true });
        });
    });

    // 复制配置
    template.querySelector('.duplicate-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        onDuplicate(config, index);
    });

    // 删除配置
    template.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        onDelete(index);
    });

    // 选择配置
    template.addEventListener('click', (e) => {
        // 如果点击的是输入框、按钮或选择框，不触发选择
        if (e.target.matches('input') ||
            e.target.matches('select') ||
            e.target.matches('textarea') ||
            e.target.matches('.card-button') ||
            e.target.closest('.card-button')) {
            return;
        }
        onSelect(template, index);
    });

    return template;
}

/**
 * 从API获取可用模型列表
 * @param {string} baseUrl - API基础URL
 * @param {string} apiKey - API密钥
 * @returns {Promise<Array<string>>} 模型ID列表
 */
async function fetchModelsFromAPI(baseUrl, apiKey) {
    try {
        // 将 /chat/completions 转换为 /models
        let modelsUrl = baseUrl;

        // 处理各种可能的URL格式
        if (baseUrl.endsWith('/chat/completions')) {
            modelsUrl = baseUrl.replace('/chat/completions', '/models');
        } else if (baseUrl.endsWith('/v1/chat/completions')) {
            modelsUrl = baseUrl.replace('/v1/chat/completions', '/v1/models');
        } else if (baseUrl.includes('/chat/completions')) {
            modelsUrl = baseUrl.replace(/\/chat\/completions.*$/, '/models');
        } else {
            // 尝试智能推断
            try {
                const url = new URL(baseUrl);
                const pathParts = url.pathname.split('/').filter(p => p);
                // 移除最后的 chat/completions
                const basePath = pathParts.slice(0, -2).join('/');
                modelsUrl = `${url.origin}${basePath ? '/' + basePath : ''}/models`;
            } catch {
                // 如果URL解析失败，尝试简单替换
                modelsUrl = baseUrl.replace(/\/chat\/completions.*$/, '/models');
            }
        }

        console.log('[API] Fetching models from:', modelsUrl);

        const response = await fetch(modelsUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('[API] Models response:', data);

        let models = [];

        // OpenAI API格式: { object: "list", data: [{ id: "...", ... }] }
        if (data.data && Array.isArray(data.data)) {
            models = data.data.map(model => model.id).filter(id => id);
        }
        // 其他可能的格式
        else if (Array.isArray(data.models)) {
            models = data.models.map(model => model.id || model).filter(id => id);
        }
        else if (Array.isArray(data)) {
            models = data.map(model => model.id || model).filter(id => id);
        }

        // 排序：优先显示gpt开头和其他常见模型
        models.sort((a, b) => {
            const aIsGPT = a.startsWith('gpt-');
            const bIsGPT = b.startsWith('gpt-');
            if (aIsGPT && !bIsGPT) return -1;
            if (!aIsGPT && bIsGPT) return 1;
            return a.localeCompare(b);
        });

        console.log(`[API] Found ${models.length} models`);
        return models;
    } catch (error) {
        console.error('获取模型列表失败:', error);
        throw error;
    }
}

/**
 * 创建API卡片回调处理函数
 * @param {Object} params - 参数对象
 * @param {function} params.selectCard - 选择卡片的函数
 * @param {Array<APIConfig>} params.apiConfigs - API配置列表
 * @param {number} params.selectedConfigIndex - 当前选中的配置索引
 * @param {function} params.saveAPIConfigs - 保存API配置的函数
 * @param {function} params.renderAPICardsWithCallbacks - 重新渲染卡片的函数
 * @returns {Object} 回调函数对象
 */
export function createCardCallbacks({
    selectCard,
    apiConfigs,
    selectedConfigIndex,
    saveAPIConfigs,
    queueApiConfigsPersist,
    flushApiConfigsPersist,
    queueSystemPromptPersist,
    flushSystemPromptPersist,
    renderAPICardsWithCallbacks,
    onBeforeCardDelete,
}) {
    return {
        onCardSelect: selectCard,
        onCardDuplicate: (config, index) => {
            const cloned = (typeof structuredClone === 'function')
                ? structuredClone(config)
                : JSON.parse(JSON.stringify(config));
            delete cloned.id;
            // 在当前选中卡片后面插入新卡片
            apiConfigs.splice(index + 1, 0, cloned);
            // 保存配置但不改变选中状态
            saveAPIConfigs();
            // 重新渲染所有卡片，保持原来的选中状态
            renderAPICardsWithCallbacks();
        },
        onCardDelete: (index) => {
            if (apiConfigs.length > 1) {
                if (typeof onBeforeCardDelete === 'function') {
                    onBeforeCardDelete(apiConfigs[index], index);
                }
                apiConfigs.splice(index, 1);
                if (selectedConfigIndex >= apiConfigs.length) {
                    selectedConfigIndex = apiConfigs.length - 1;
                }
                saveAPIConfigs();
                renderAPICardsWithCallbacks();
            }
        },
        onCardChange: (index, newConfig, options = {}) => {
            apiConfigs[index] = newConfig;

            if (options.kind === 'systemPrompt') {
                if (options.flush && typeof flushSystemPromptPersist === 'function') {
                    return flushSystemPromptPersist(newConfig);
                }
                if (typeof queueSystemPromptPersist === 'function') {
                    queueSystemPromptPersist(newConfig);
                    return;
                }
                // 回退：如果未注入专用保存逻辑，就沿用全量保存
            }

            if (options.kind === 'apiFields') {
                if (options.flush && typeof flushApiConfigsPersist === 'function') {
                    return flushApiConfigsPersist();
                }
                if (typeof queueApiConfigsPersist === 'function') {
                    queueApiConfigsPersist();
                    return;
                }
                // 回退：如果未注入专用保存逻辑，就沿用全量保存
            }

            saveAPIConfigs();
        }
    };
}

/**
 * 选择API卡片的函数
 * @param {Object} params - 参数对象
 * @param {Object} params.template - 模板对象
 * @param {number} params.index - 选中的索引
 * @param {function} params.onIndexChange - 索引变更回调函数
 * @param {function} params.onSave - 保存配置的回调函数
 * @param {string} params.cardSelector - 卡片元素的CSS选择器
 * @param {function} params.onSelect - 选中后的回调函数
 * @returns {void}
 */
export function selectCard({
    template,
    index,
    onIndexChange,
    onSave,
    cardSelector = '.api-card',
    onSelect
}) {
    // 更新选中索引
    onIndexChange(index);

    // 保存配置
    onSave();

    // 更新UI状态
    document.querySelectorAll(cardSelector).forEach(card => {
        card.classList.remove('selected');
    });

    // 选中当前卡片
    const selectedCard = document.querySelectorAll(cardSelector)[index];
    if (selectedCard) {
        selectedCard.classList.add('selected');
    }

    // 执行选中后的回调
    if (onSelect) {
        onSelect(selectedCard, index);
    }

    return selectedCard;
}
