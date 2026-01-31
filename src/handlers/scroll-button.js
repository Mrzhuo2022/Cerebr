/**
 * 滚动到底部按钮模块
 * @module scroll-button
 */

import { syncChatBottomExtraPadding } from '../utils/scroll.js';

/**
 * 初始化滚动到底部按钮
 * @param {Object} params - 参数对象
 * @param {HTMLElement} params.chatContainer - 聊天容器
 * @param {HTMLElement} params.scrollToBottomButton - 滚动按钮
 */
export function initScrollToBottomButton({ chatContainer, scrollToBottomButton }) {
    if (!scrollToBottomButton || !chatContainer) return;

    const VISIBILITY_THRESHOLD_PX = 24;
    const PADDING_CACHE_TTL_MS = 240;
    let rafId = 0;
    let cachedPaddingBottomPx = null;
    let paddingCachedAt = 0;

    const invalidatePaddingCache = () => {
        cachedPaddingBottomPx = null;
        paddingCachedAt = 0;
    };

    const getPaddingBottomPx = () => {
        const now = performance.now();
        if (cachedPaddingBottomPx == null || now - paddingCachedAt > PADDING_CACHE_TTL_MS) {
            cachedPaddingBottomPx = Number.parseFloat(getComputedStyle(chatContainer).paddingBottom) || 0;
            paddingCachedAt = now;
        }
        return cachedPaddingBottomPx;
    };

    const update = () => {
        rafId = 0;
        if (!chatContainer?.isConnected || !scrollToBottomButton.isConnected) return;

        const remaining = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight;
        const threshold = getPaddingBottomPx() + VISIBILITY_THRESHOLD_PX;
        const shouldShow = remaining > threshold;

        scrollToBottomButton.classList.toggle('visible', shouldShow);
        scrollToBottomButton.tabIndex = shouldShow ? 0 : -1;
        
        if (shouldShow) {
            scrollToBottomButton.removeAttribute('aria-hidden');
        } else {
            scrollToBottomButton.setAttribute('aria-hidden', 'true');
        }
    };

    const scheduleUpdate = () => {
        if (rafId) return;
        rafId = requestAnimationFrame(update);
    };

    const scrollToBottom = (behavior = 'smooth') => {
        chatContainer.__cerebrUserPausedAutoScroll = false;
        if (typeof chatContainer.scrollTo === 'function') {
            chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior });
        } else {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
        scheduleUpdate();
    };

    // 初始化状态
    scrollToBottomButton.tabIndex = -1;
    scrollToBottomButton.setAttribute('aria-hidden', 'true');
    scrollToBottomButton.addEventListener('click', () => scrollToBottom('smooth'));

    // 事件监听
    chatContainer.addEventListener('scroll', scheduleUpdate, { passive: true });
    
    window.addEventListener('resize', () => {
        invalidatePaddingCache();
        scheduleUpdate();
    });

    // 自定义事件监听
    document.addEventListener('cerebr:chatContentChunk', scheduleUpdate);
    document.addEventListener('cerebr:chatContentLoaded', scheduleUpdate);
    document.addEventListener('cerebr:chatSwitched', () => {
        invalidatePaddingCache();
        scheduleUpdate();
    });

    // MutationObserver
    if (typeof MutationObserver !== 'undefined') {
        const observer = new MutationObserver(scheduleUpdate);
        observer.observe(chatContainer, { childList: true, subtree: true });
    }

    // ResizeObserver for input container
    const inputContainer = document.getElementById('input-container');
    if (inputContainer && typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(() => {
            invalidatePaddingCache();
            scheduleUpdate();
        });
        observer.observe(inputContainer);
    }

    // 初始更新
    scheduleUpdate();

    return { scrollToBottom, scheduleUpdate };
}

/**
 * 初始化聊天底部 padding 同步
 */
export function initChatBottomPadding() {
    syncChatBottomExtraPadding();
    window.addEventListener('resize', () => syncChatBottomExtraPadding());
}
