/**
 * 设置菜单悬停交互模块
 * @module settings-hover
 */

/**
 * 创建设置菜单悬停管理器
 * @param {Object} params - 参数对象
 * @returns {Object} 管理器实例
 */
export function createSettingsHoverManager({
    settingsButton,
    settingsMenu,
    webpageQAContainer,
    webpageContentMenu,
    isExtensionEnvironment,
    openSettingsMenu,
    closeSettingsMenu
}) {
    if (!settingsButton || !settingsMenu) {
        return { getOpenMode: () => null };
    }

    let settingsMenuOpenMode = null;
    let hoverCloseTimer = 0;
    let hoverOpenTimer = 0;
    let webpageHoverOpenTimer = 0;

    // 配置常量
    const APPROACH_DISTANCE_PX = 28;
    const HOVER_OPEN_DELAY_MS = 140;
    const TRAIL_WINDOW_MS = 200;
    const AUTO_CLOSE_DELAY_MS = 280;
    const AUTO_OPEN_COOLDOWN_MS = 900;
    const MIN_PREV_SPEED = 0.35;
    const MAX_SPEED = 0.22;
    const SLOWDOWN_FACTOR = 0.55;

    // 缓存
    let buttonRectCache = null;
    let buttonRectCacheAt = 0;
    let webpageItemRectCache = null;
    let webpageItemRectCacheAt = 0;

    // 指针轨迹
    let pointerTrail = [];
    let lastButtonDistance = null;
    let lastAutoOpenAt = 0;

    let webpagePointerTrail = [];
    let lastWebpageDistance = null;
    let lastWebpageAutoOpenAt = 0;

    let lastPointerX = 0;
    let lastPointerY = 0;

    // 工具函数
    const isPointInRect = (x, y, rect) =>
        x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

    const pointToRectDistance = (x, y, rect) => {
        const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
        const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
        return Math.hypot(dx, dy);
    };

    const getSettingsButtonRect = (now) => {
        if (!buttonRectCache || now - buttonRectCacheAt > 100) {
            buttonRectCache = settingsButton.getBoundingClientRect();
            buttonRectCacheAt = now;
        }
        return buttonRectCache;
    };

    const getWebpageItemRect = (now) => {
        if (!webpageQAContainer) return null;
        if (!webpageItemRectCache || now - webpageItemRectCacheAt > 100) {
            webpageItemRectCache = webpageQAContainer.getBoundingClientRect();
            webpageItemRectCacheAt = now;
        }
        return webpageItemRectCache;
    };

    const clearPointerTrail = () => {
        pointerTrail = [];
        lastButtonDistance = null;
    };

    const clearWebpagePointerTrail = () => {
        webpagePointerTrail = [];
        lastWebpageDistance = null;
    };

    const cancelHoverOpen = () => {
        if (hoverOpenTimer) {
            clearTimeout(hoverOpenTimer);
            hoverOpenTimer = 0;
        }
    };

    const cancelWebpageHoverOpen = () => {
        if (webpageHoverOpenTimer) {
            clearTimeout(webpageHoverOpenTimer);
            webpageHoverOpenTimer = 0;
        }
    };

    const cancelAutoClose = () => {
        if (hoverCloseTimer) {
            clearTimeout(hoverCloseTimer);
            hoverCloseTimer = 0;
        }
    };

    const isPointerInSettingsHoverRegion = (x, y) => {
        const now = performance.now();
        const buttonRect = getSettingsButtonRect(now);
        if (buttonRect && pointToRectDistance(x, y, buttonRect) <= APPROACH_DISTANCE_PX) return true;
        if (settingsMenu.classList.contains('visible') && isPointInRect(x, y, settingsMenu.getBoundingClientRect())) {
            return true;
        }
        if (webpageContentMenu?.classList?.contains('visible') &&
            isPointInRect(x, y, webpageContentMenu.getBoundingClientRect())) {
            return true;
        }
        return false;
    };

    const scheduleAutoClose = () => {
        cancelAutoClose();
        if (settingsMenuOpenMode !== 'hover') return;
        hoverCloseTimer = window.setTimeout(() => {
            hoverCloseTimer = 0;
            if (settingsMenuOpenMode !== 'hover') return;
            if (!isPointerInSettingsHoverRegion(lastPointerX, lastPointerY)) {
                closeSettingsMenu();
                settingsMenuOpenMode = null;
            }
        }, AUTO_CLOSE_DELAY_MS);
    };

    const openWebpageContentMenuInternal = () => {
        if (!isExtensionEnvironment || !webpageQAContainer || !webpageContentMenu) return;
        if (webpageContentMenu.classList.contains('visible')) return;
        webpageQAContainer.dispatchEvent(
            new MouseEvent('click', { bubbles: true, cancelable: true, view: window })
        );
    };

    // 事件监听
    settingsButton.addEventListener('pointerenter', (event) => {
        if (event.pointerType && event.pointerType !== 'mouse') return;
        if (settingsMenu.classList.contains('visible')) return;

        cancelHoverOpen();
        hoverOpenTimer = window.setTimeout(() => {
            hoverOpenTimer = 0;
            if (settingsMenu.classList.contains('visible')) return;
            if (!settingsButton.matches(':hover')) return;
            openSettingsMenu('hover');
            settingsMenuOpenMode = 'hover';
            lastAutoOpenAt = performance.now();
            clearPointerTrail();
        }, HOVER_OPEN_DELAY_MS);
    }, { passive: true });

    settingsButton.addEventListener('pointerleave', (event) => {
        if (event.pointerType && event.pointerType !== 'mouse') return;
        cancelHoverOpen();
    }, { passive: true });

    // 网页内容菜单悬停
    if (isExtensionEnvironment && webpageQAContainer && webpageContentMenu) {
        webpageQAContainer.addEventListener('pointerenter', (event) => {
            if (event.pointerType && event.pointerType !== 'mouse') return;
            if (!settingsMenu.classList.contains('visible')) return;
            if (webpageContentMenu.classList.contains('visible')) return;

            cancelWebpageHoverOpen();
            webpageHoverOpenTimer = window.setTimeout(() => {
                webpageHoverOpenTimer = 0;
                if (!settingsMenu.classList.contains('visible')) return;
                if (webpageContentMenu.classList.contains('visible')) return;
                if (!webpageQAContainer.matches(':hover')) return;

                openWebpageContentMenuInternal();
                lastWebpageAutoOpenAt = performance.now();
                clearWebpagePointerTrail();
            }, HOVER_OPEN_DELAY_MS);
        }, { passive: true });

        webpageQAContainer.addEventListener('pointerleave', (event) => {
            if (event.pointerType && event.pointerType !== 'mouse') return;
            cancelWebpageHoverOpen();
        }, { passive: true });
    }

    // 全局指针移动监听
    document.addEventListener('pointermove', (event) => {
        if (event.pointerType && event.pointerType !== 'mouse') return;
        if (event.buttons) return;

        lastPointerX = event.clientX;
        lastPointerY = event.clientY;

        if (hoverOpenTimer && !settingsButton.matches(':hover')) {
            cancelHoverOpen();
        }
        if (webpageHoverOpenTimer && webpageQAContainer && !webpageQAContainer.matches(':hover')) {
            cancelWebpageHoverOpen();
        }

        if (settingsMenu.classList.contains('visible')) {
            if (settingsMenuOpenMode === 'hover') {
                if (isPointerInSettingsHoverRegion(event.clientX, event.clientY)) {
                    cancelAutoClose();
                } else {
                    scheduleAutoClose();
                }
            }

            // 网页内容子菜单减速开启检测
            if (isExtensionEnvironment && webpageQAContainer && webpageContentMenu &&
                !webpageContentMenu.classList.contains('visible')) {
                const now = performance.now();
                if (now - lastWebpageAutoOpenAt < AUTO_OPEN_COOLDOWN_MS) return;

                const itemRect = getWebpageItemRect(now);
                if (!itemRect) return;
                const itemDistance = pointToRectDistance(event.clientX, event.clientY, itemRect);

                if (itemDistance > APPROACH_DISTANCE_PX) {
                    clearWebpagePointerTrail();
                    return;
                }

                webpagePointerTrail.push({ x: event.clientX, y: event.clientY, t: now });
                while (webpagePointerTrail.length > 6) webpagePointerTrail.shift();
                while (webpagePointerTrail.length > 2 && now - webpagePointerTrail[0].t > TRAIL_WINDOW_MS) {
                    webpagePointerTrail.shift();
                }

                const approaching = lastWebpageDistance == null || itemDistance < lastWebpageDistance - 0.25;
                lastWebpageDistance = itemDistance;
                if (!approaching || webpagePointerTrail.length < 3) return;

                const p2 = webpagePointerTrail[webpagePointerTrail.length - 1];
                const p1 = webpagePointerTrail[webpagePointerTrail.length - 2];
                const p0 = webpagePointerTrail[webpagePointerTrail.length - 3];
                const dtNow = p2.t - p1.t;
                const dtPrev = p1.t - p0.t;
                if (dtNow < 8 || dtPrev < 8) return;

                const speedNow = Math.hypot(p2.x - p1.x, p2.y - p1.y) / dtNow;
                const speedPrev = Math.hypot(p1.x - p0.x, p1.y - p0.y) / dtPrev;

                if (speedPrev < MIN_PREV_SPEED || speedNow > MAX_SPEED || speedNow > speedPrev * SLOWDOWN_FACTOR) return;

                openWebpageContentMenuInternal();
                lastWebpageAutoOpenAt = now;
                clearWebpagePointerTrail();
            }
            return;
        }

        // 设置按钮减速开启检测
        const now = performance.now();
        if (now - lastAutoOpenAt < AUTO_OPEN_COOLDOWN_MS) return;

        const buttonRect = getSettingsButtonRect(now);
        const buttonDistance = pointToRectDistance(event.clientX, event.clientY, buttonRect);

        if (buttonDistance > APPROACH_DISTANCE_PX) {
            clearPointerTrail();
            return;
        }

        pointerTrail.push({ x: event.clientX, y: event.clientY, t: now });
        while (pointerTrail.length > 6) pointerTrail.shift();
        while (pointerTrail.length > 2 && now - pointerTrail[0].t > TRAIL_WINDOW_MS) {
            pointerTrail.shift();
        }

        const approaching = lastButtonDistance == null || buttonDistance < lastButtonDistance - 0.25;
        lastButtonDistance = buttonDistance;
        if (!approaching || pointerTrail.length < 3) return;

        const p2 = pointerTrail[pointerTrail.length - 1];
        const p1 = pointerTrail[pointerTrail.length - 2];
        const p0 = pointerTrail[pointerTrail.length - 3];
        const dtNow = p2.t - p1.t;
        const dtPrev = p1.t - p0.t;
        if (dtNow < 8 || dtPrev < 8) return;

        const speedNow = Math.hypot(p2.x - p1.x, p2.y - p1.y) / dtNow;
        const speedPrev = Math.hypot(p1.x - p0.x, p1.y - p0.y) / dtPrev;

        if (speedPrev < MIN_PREV_SPEED || speedNow > MAX_SPEED || speedNow > speedPrev * SLOWDOWN_FACTOR) return;

        openSettingsMenu('hover');
        settingsMenuOpenMode = 'hover';
        lastAutoOpenAt = now;
        clearPointerTrail();
    }, { passive: true });

    return {
        getOpenMode: () => settingsMenuOpenMode,
        setOpenMode: (mode) => { settingsMenuOpenMode = mode; },
        cancelAutoClose
    };
}
