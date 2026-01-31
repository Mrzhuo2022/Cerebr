/**
 * 字体大小设置模块
 * @module font-scale
 */

import { syncStorageAdapter, browserAdapter } from '../utils/storage-adapter.js';

// 常量
export const FONT_SCALE_KEY = 'fontScale';
export const FONT_SCALE_PRESETS = [0.9, 1, 1.1, 1.2];
export const SITE_OVERRIDES_KEY = 'panelSiteOverridesV1';
export const SITE_KEY_PLUS = 2;

// 多部分公共后缀
const MULTI_PART_PUBLIC_SUFFIXES = new Set([
    'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'net.uk',
    'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
    'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp',
    'com.cn', 'net.cn', 'org.cn', 'gov.cn',
    'com.hk', 'com.tw', 'com.sg'
]);

/**
 * 检测 IPv4 地址
 */
export function isIPv4(hostname) {
    if (typeof hostname !== 'string') return false;
    const parts = hostname.split('.');
    if (parts.length !== 4) return false;
    return parts.every((p) => {
        if (!/^(?:0|[1-9]\d{0,2})$/.test(p)) return false;
        const n = Number(p);
        return n >= 0 && n <= 255;
    });
}

/**
 * 检测 IPv6 地址
 */
export function isIPv6(hostname) {
    if (typeof hostname !== 'string') return false;
    return hostname.includes(':');
}

/**
 * 从主机名获取站点键
 */
export function getSiteKeyFromHostname(hostname, plus = SITE_KEY_PLUS) {
    if (!hostname || typeof hostname !== 'string') return null;
    const normalized = hostname.trim().replace(/\.$/, '').toLowerCase();
    if (!normalized) return null;
    if (normalized === 'localhost' || normalized.endsWith('.localhost')) return normalized;
    if (isIPv4(normalized) || isIPv6(normalized)) return normalized;

    const parts = normalized.split('.').filter(Boolean);
    if (parts.length <= 2) return normalized;

    let suffixLen = 1;
    const last2 = parts.slice(-2).join('.');
    const last3 = parts.slice(-3).join('.');
    if (MULTI_PART_PUBLIC_SUFFIXES.has(last2)) suffixLen = 2;
    else if (MULTI_PART_PUBLIC_SUFFIXES.has(last3)) suffixLen = 3;

    const plusNumber = Math.max(1, Number(plus) || SITE_KEY_PLUS);
    const requiredLen = suffixLen + plusNumber;
    if (parts.length <= requiredLen) return normalized;
    return parts.slice(-requiredLen).join('.');
}

/**
 * 修剪站点覆盖配置
 */
export function pruneSiteOverridesInPlace(overrides) {
    const entries = Object.entries(overrides || {});
    const MAX_ENTRIES = 100;
    if (entries.length <= MAX_ENTRIES) return;
    entries
        .sort((a, b) => (Number(b[1]?.updatedAt) || 0) - (Number(a[1]?.updatedAt) || 0))
        .slice(MAX_ENTRIES)
        .forEach(([key]) => {
            delete overrides[key];
        });
}

/**
 * 读取站点覆盖配置
 */
export async function readSiteOverrides() {
    try {
        const res = await syncStorageAdapter.get(SITE_OVERRIDES_KEY);
        const raw = res?.[SITE_OVERRIDES_KEY];
        return raw && typeof raw === 'object' ? raw : {};
    } catch {
        return {};
    }
}

/**
 * 写入站点覆盖配置
 */
export async function writeSiteOverrides(overrides) {
    pruneSiteOverridesInPlace(overrides);
    await syncStorageAdapter.set({ [SITE_OVERRIDES_KEY]: overrides });
}

/**
 * 转换为预设值
 */
export function toPreset(value) {
    if (typeof value === 'number' && Number.isFinite(value) && FONT_SCALE_PRESETS.includes(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed) && FONT_SCALE_PRESETS.includes(parsed)) return parsed;
    }
    return 1;
}

/**
 * 应用字体缩放
 */
export function applyFontScale(scale) {
    const root = document.documentElement;
    const scaledPx = (px) => `${Math.round(px * scale * 10) / 10}px`;
    root.style.setProperty('--cerebr-fs-12', scaledPx(12));
    root.style.setProperty('--cerebr-fs-13', scaledPx(13));
    root.style.setProperty('--cerebr-fs-14', scaledPx(14));
    root.style.setProperty('--cerebr-fs-16', scaledPx(16));
}

/**
 * 创建字体缩放管理器
 */
export async function createFontScaleManager(preferencesFontScale) {
    let currentSiteKey = null;
    let legacySiteKey = null;

    try {
        const tab = await browserAdapter.getCurrentTab();
        currentSiteKey = getSiteKeyFromHostname(tab?.hostname, SITE_KEY_PLUS);
        legacySiteKey = getSiteKeyFromHostname(tab?.hostname, 1);
    } catch {
        currentSiteKey = null;
        legacySiteKey = null;
    }

    // 初始化
    try {
        const result = await syncStorageAdapter.get([FONT_SCALE_KEY, SITE_OVERRIDES_KEY]);
        const overrides = result?.[SITE_OVERRIDES_KEY] && typeof result[SITE_OVERRIDES_KEY] === 'object'
            ? result[SITE_OVERRIDES_KEY]
            : {};
        const globalScale = toPreset(result?.[FONT_SCALE_KEY]);
        const siteScale = currentSiteKey ? Number(overrides?.[currentSiteKey]?.fontScale) : NaN;

        // 迁移：eTLD+1 -> eTLD+2
        if (!Number.isFinite(siteScale) && currentSiteKey && legacySiteKey && legacySiteKey !== currentSiteKey) {
            const legacyScale = Number(overrides?.[legacySiteKey]?.fontScale);
            if (Number.isFinite(legacyScale)) {
                const migrated = toPreset(legacyScale);
                overrides[currentSiteKey] = {
                    ...(overrides?.[currentSiteKey] && typeof overrides[currentSiteKey] === 'object' ? overrides[currentSiteKey] : {}),
                    fontScale: migrated,
                    updatedAt: Date.now()
                };
                await writeSiteOverrides(overrides);
                applyFontScale(migrated);
                if (preferencesFontScale) preferencesFontScale.value = String(migrated);
                return { currentSiteKey, getCurrentScale: () => migrated };
            }
        }

        const initialScale = Number.isFinite(siteScale) ? toPreset(siteScale) : globalScale;
        applyFontScale(initialScale);
        if (preferencesFontScale) {
            preferencesFontScale.value = String(initialScale);
        }
    } catch (error) {
        console.error('初始化字体大小失败:', error);
        applyFontScale(1);
    }

    // 监听字体大小变化
    if (preferencesFontScale) {
        preferencesFontScale.addEventListener('change', async () => {
            const selected = toPreset(preferencesFontScale.value);
            applyFontScale(selected);
            try {
                if (!currentSiteKey) {
                    await syncStorageAdapter.set({ [FONT_SCALE_KEY]: selected });
                    return;
                }
                const overrides = await readSiteOverrides();
                const existing = overrides?.[currentSiteKey] && typeof overrides[currentSiteKey] === 'object'
                    ? overrides[currentSiteKey]
                    : {};
                overrides[currentSiteKey] = {
                    ...existing,
                    fontScale: selected,
                    updatedAt: Date.now()
                };
                await writeSiteOverrides(overrides);
            } catch (error) {
                console.error('保存字体大小失败:', error);
            }
        });
    }

    return { currentSiteKey };
}
