/**
 * 侧边栏拖动处理模块
 * @module sidebar-drag
 */

/**
 * 初始化侧边栏背景拖动功能
 * @param {HTMLElement} chatContainer - 聊天容器元素
 */
export function initSidebarBackgroundDrag(chatContainer) {
    // 仅在被嵌入（扩展侧边栏 iframe）时启用
    if (window.top === window) return;
    if (!chatContainer) return;

    const DRAG_THRESHOLD_PX = 4;
    let activePointerId = null;
    let startScreenX = 0;
    let startScreenY = 0;
    let lastScreenX = 0;
    let lastScreenY = 0;
    let dragging = false;
    let suppressClickUntil = 0;

    const canStartDragFromTarget = (target) => {
        const el = target instanceof Element ? target : target?.parentElement;
        if (!el) return false;
        if (el.closest('.message')) return false;
        if (el.closest('#scroll-to-bottom')) return false;
        if (el.closest('#top-toolbar')) return false;
        if (el.closest('#settings-button, #settings-menu, #context-menu, a, button, input, textarea, select')) return false;
        return true;
    };

    const postToParent = (payload) => {
        try {
            window.parent?.postMessage?.(payload, '*');
        } catch {
            // ignore
        }
    };

    const endDrag = () => {
        if (activePointerId === null) return;
        if (dragging) {
            postToParent({ type: 'CEREBR_SIDEBAR_DRAG_END' });
        }
        activePointerId = null;
        dragging = false;
    };

    chatContainer.addEventListener('pointerdown', (e) => {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        if (e.button !== 0) return;
        if (!canStartDragFromTarget(e.target)) return;

        activePointerId = e.pointerId;
        startScreenX = e.screenX;
        startScreenY = e.screenY;
        lastScreenX = startScreenX;
        lastScreenY = startScreenY;
        dragging = false;

        try {
            chatContainer.setPointerCapture(activePointerId);
        } catch {
            // ignore
        }
    }, { passive: true });

    chatContainer.addEventListener('pointermove', (e) => {
        if (activePointerId === null || e.pointerId !== activePointerId) return;
        const totalDx = e.screenX - startScreenX;
        const totalDy = e.screenY - startScreenY;

        if (!dragging) {
            if (Math.hypot(totalDx, totalDy) < DRAG_THRESHOLD_PX) return;
            dragging = true;
            suppressClickUntil = Date.now() + 400;
            postToParent({ type: 'CEREBR_SIDEBAR_DRAG_START' });
        }

        const dx = e.screenX - lastScreenX;
        const dy = e.screenY - lastScreenY;
        lastScreenX = e.screenX;
        lastScreenY = e.screenY;

        if (dx || dy) {
            postToParent({ type: 'CEREBR_SIDEBAR_DRAG_MOVE', dx, dy });
        }

        e.preventDefault();
    }, { passive: false });

    chatContainer.addEventListener('pointerup', (e) => {
        if (activePointerId === null || e.pointerId !== activePointerId) return;
        endDrag();
    }, { passive: true });

    chatContainer.addEventListener('pointercancel', (e) => {
        if (activePointerId === null || e.pointerId !== activePointerId) return;
        endDrag();
    }, { passive: true });

    // 拖动结束时抑制一次"点击聚焦输入框"等副作用
    chatContainer.addEventListener('click', (e) => {
        if (Date.now() < suppressClickUntil) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, { capture: true });
}
