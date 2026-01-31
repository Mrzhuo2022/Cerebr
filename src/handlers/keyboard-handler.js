/**
 * 键盘快捷键处理模块
 * @module keyboard-handler
 */

import { isExtensionEnvironment } from '../utils/storage-adapter.js';

/**
 * 检测平台是否为 Mac
 * @returns {boolean}
 */
export function isMacPlatform() {
    const platform = navigator.userAgentData?.platform || navigator.platform || '';
    return /mac|iphone|ipad|ipod/i.test(platform);
}

/**
 * 初始化新对话快捷键 (Web 环境)
 * @param {HTMLElement} newChatButton - 新对话按钮元素
 */
export function initNewChatShortcut(newChatButton) {
    // 扩展环境下由浏览器 commands 统一处理，避免重复触发
    if (isExtensionEnvironment || !newChatButton) return;

    const isMac = isMacPlatform();

    const isNewChatShortcut = (event) => {
        if (event.isComposing) return false;
        const code = event.code;
        const key = (event.key || '').toLowerCase();
        const isX = code ? code === 'KeyX' : key === 'x';
        if (!isX) return false;

        if (isMac) {
            return !!(event.ctrlKey && !event.metaKey && !event.altKey);
        }
        return !!(event.altKey && !event.ctrlKey && !event.metaKey);
    };

    document.addEventListener('keydown', (event) => {
        if (!isNewChatShortcut(event)) return;
        event.preventDefault();
        event.stopPropagation();
        newChatButton.click();
    }, { capture: true });
}

/**
 * 初始化菜单键盘导航
 */
export function initMenuKeyboardNavigation() {
    document.addEventListener('keydown', (e) => {
        const active = document.activeElement;
        if (!active || active.getAttribute('role') !== 'menuitem') return;

        const menu = active.closest?.('[role="menu"]');
        if (menu && !menu.classList.contains('visible')) {
            return;
        }

        const isVisible = (el) => {
            const style = getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
        };

        const getMenuItems = () => {
            if (!menu) return [];
            return Array.from(menu.querySelectorAll('[role="menuitem"]')).filter(isVisible);
        };

        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            active.click();
            return;
        }

        if (!menu) return;

        const items = getMenuItems();
        if (items.length === 0) return;

        const currentIndex = Math.max(0, items.indexOf(active));

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                items[(currentIndex + 1) % items.length]?.focus?.({ preventScroll: true });
                break;
            case 'ArrowUp':
                e.preventDefault();
                items[(currentIndex - 1 + items.length) % items.length]?.focus?.({ preventScroll: true });
                break;
            case 'Home':
                e.preventDefault();
                items[0]?.focus?.({ preventScroll: true });
                break;
            case 'End':
                e.preventDefault();
                items[items.length - 1]?.focus?.({ preventScroll: true });
                break;
        }
    });
}

/**
 * 初始化 Escape 键处理
 * @param {Object} params - 参数对象
 */
export function initEscapeKeyHandler({
    previewModal,
    contextMenu,
    webpageContentMenu,
    settingsMenu,
    apiSettings,
    chatListPage,
    hideImagePreview,
    hideContextMenu,
    hideChatList,
    closeSettingsMenu,
    uiConfig
}) {
    document.addEventListener('keydown', (e) => {
        // 图片预览打开时的焦点陷阱
        if (previewModal?.classList?.contains('visible') && e.key === 'Tab') {
            const focusables = Array.from(previewModal.querySelectorAll(
                'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'
            )).filter((el) => {
                const style = getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden';
            });
            
            if (focusables.length === 0) {
                e.preventDefault();
                return;
            }
            
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus({ preventScroll: true });
                return;
            }
            if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus({ preventScroll: true });
                return;
            }
        }

        if (e.key !== 'Escape') return;

        let handled = false;

        if (previewModal?.classList?.contains('visible')) {
            if (uiConfig?.imagePreview?.previewModal && uiConfig?.imagePreview?.previewImage) {
                hideImagePreview({ config: uiConfig.imagePreview });
            }
            handled = true;
        }

        if (contextMenu?.classList?.contains('visible')) {
            hideContextMenu({ contextMenu, onMessageElementReset: () => {} });
            handled = true;
        }

        if (webpageContentMenu?.classList?.contains('visible')) {
            webpageContentMenu.classList.remove('visible');
            handled = true;
        }

        if (settingsMenu?.classList?.contains('visible')) {
            closeSettingsMenu();
            handled = true;
        }

        if (apiSettings?.classList?.contains('visible')) {
            apiSettings.classList.remove('visible');
            handled = true;
        }

        if (chatListPage?.classList?.contains('show')) {
            hideChatList(chatListPage);
            handled = true;
        }

        if (handled) {
            e.preventDefault();
        }
    });
}
