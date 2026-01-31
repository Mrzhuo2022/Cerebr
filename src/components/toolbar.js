/**
 * 顶部工具栏组件
 */
import { chatManager } from '../utils/chat-manager.js';
import { browserAdapter, isExtensionEnvironment } from '../utils/storage-adapter.js';
import { t } from '../utils/i18n.js';
import { setWebpageSwitchesForChat } from '../utils/webpage-switches.js';
import { loadChatContent } from './chat-list.js';

export function initializeToolbar() {
    try {
        const newChatQuickButton = document.getElementById('new-chat-quick');
        const closeButton = document.getElementById('close-button');

        if (!newChatQuickButton || !closeButton) {
            console.warn('[Toolbar] Required elements not found');
            return;
        }

        // 新建对话按钮
        newChatQuickButton.addEventListener('click', async () => {
            try {
                // 创建新对话（移除当前对话为空的检查）
                const newChat = chatManager.createNewChat(t('chat_new_title'));
                await chatManager.switchChat(newChat.id);
                console.log('[Toolbar] Created new chat:', newChat.id);

                // 更新聊天容器显示
                const chatContainer = document.getElementById('chat-container');
                if (chatContainer) {
                    await loadChatContent(newChat, chatContainer);
                }

                // 聚焦输入框
                const messageInput = document.getElementById('message-input');
                if (messageInput) {
                    messageInput.focus();
                }

                // 如果是扩展环境，设置当前标签页的网页开关
                if (isExtensionEnvironment) {
                    try {
                        const currentTab = await browserAdapter.getCurrentTab();
                        if (currentTab?.id) {
                            await setWebpageSwitchesForChat(newChat.id, { [currentTab.id]: true });
                        }
                    } catch (error) {
                        console.error('[Toolbar] Failed to set webpage switches:', error);
                    }
                }
            } catch (error) {
                console.error('[Toolbar] New chat button error:', error);
            }
        });

        // 关闭侧边栏按钮
        closeButton.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            try {
                if (isExtensionEnvironment && typeof chrome !== 'undefined' && chrome.runtime) {
                    // 扩展环境：发送消息到 background script
                    chrome.runtime.sendMessage({ type: 'CLOSE_SIDEBAR' }, (response) => {
                        if (chrome.runtime.lastError) {
                            console.error('[Toolbar] Close sidebar error:', chrome.runtime.lastError);
                        }
                    });
                } else {
                    // Web 环境：清空输入框内容，滚动到页面顶部
                    const messageInput = document.getElementById('message-input');
                    if (messageInput) {
                        messageInput.textContent = '';
                        messageInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    const chatContainer = document.getElementById('chat-container');
                    if (chatContainer) {
                        chatContainer.scrollTop = 0;
                    }
                }
            } catch (error) {
                console.error('[Toolbar] Close button error:', error);
            }
        });

        console.log('[Toolbar] Initialized successfully');
    } catch (error) {
        console.error('[Toolbar] Initialization failed:', error);
    }
}
