/**
 * 草稿管理模块
 * @module draft-manager
 */

import { storageAdapter } from '../utils/storage-adapter.js';

const DRAFT_KEY_PREFIX = 'cerebr_draft_v1_';

/**
 * 获取指定对话的草稿存储键
 * @param {string} chatId - 对话 ID
 * @returns {string}
 */
export function getDraftKey(chatId) {
    return `${DRAFT_KEY_PREFIX}${chatId}`;
}

/**
 * 创建草稿管理器
 * @param {Object} params - 参数对象
 * @param {HTMLElement} params.messageInput - 消息输入框
 * @param {Function} params.getFormattedMessageContent - 获取格式化消息内容的函数
 * @param {Function} params.clearMessageInput - 清空输入框的函数
 * @param {Object} params.uiConfig - UI 配置
 * @returns {Object} 草稿管理器实例
 */
export function createDraftManager({
    messageInput,
    getFormattedMessageContent,
    clearMessageInput,
    uiConfig
}) {
    let draftChatId = null;
    let draftSaveTimer = null;

    /**
     * 立即保存草稿
     * @param {string} chatId - 对话 ID
     */
    const saveDraftNow = async (chatId) => {
        if (!chatId) return;
        const { message } = getFormattedMessageContent(messageInput);
        const draftText = (message || '').trimEnd();

        if (!draftText) {
            await storageAdapter.remove(getDraftKey(chatId));
            return;
        }
        await storageAdapter.set({ [getDraftKey(chatId)]: draftText });
    };

    /**
     * 队列保存草稿（防抖）
     * @param {string} chatId - 对话 ID
     */
    const queueDraftSave = (chatId) => {
        clearTimeout(draftSaveTimer);
        draftSaveTimer = setTimeout(() => void saveDraftNow(chatId), 400);
    };

    /**
     * 恢复草稿
     * @param {string} chatId - 对话 ID
     */
    const restoreDraft = async (chatId) => {
        if (!chatId) return;
        const key = getDraftKey(chatId);
        const result = await storageAdapter.get(key);
        const draftText = result[key];
        const { message, imageTags } = getFormattedMessageContent(messageInput);
        const isInputEmpty = !message.trim() && imageTags.length === 0;
        
        if (!isInputEmpty) return;
        if (!draftText) return;

        messageInput.textContent = draftText;
        messageInput.dispatchEvent(new Event('input'));
    };

    /**
     * 处理对话切换
     * @param {string} nextChatId - 新的对话 ID
     */
    const handleChatSwitch = async (nextChatId) => {
        if (draftChatId && draftChatId !== nextChatId) {
            await saveDraftNow(draftChatId);
        }
        draftChatId = nextChatId || null;
        clearMessageInput(messageInput, uiConfig);
        await restoreDraft(draftChatId);
    };

    /**
     * 删除指定对话的草稿
     * @param {string} chatId - 对话 ID
     */
    const deleteDraft = async (chatId) => {
        if (!chatId) return;
        await storageAdapter.remove(getDraftKey(chatId));
    };

    /**
     * 设置当前对话 ID
     * @param {string} chatId - 对话 ID
     */
    const setCurrentChatId = (chatId) => {
        draftChatId = chatId;
    };

    /**
     * 获取当前对话 ID
     * @returns {string|null}
     */
    const getCurrentChatId = () => draftChatId;

    // 监听输入事件
    messageInput.addEventListener('input', () => {
        queueDraftSave(draftChatId);
    });

    return {
        saveDraftNow,
        queueDraftSave,
        restoreDraft,
        handleChatSwitch,
        deleteDraft,
        setCurrentChatId,
        getCurrentChatId
    };
}
