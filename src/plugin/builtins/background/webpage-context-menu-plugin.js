import { definePlugin } from '../../shared/define-plugin.js';

export const webpageContextMenuPlugin = definePlugin({
    id: 'builtin.webpage-context-menu',
    displayName: 'Webpage Context Menu & Toolbar Handler',
    activationEvents: ['background.ready', 'hook:onBridgeMessage'],
    setup({ api, permissions, env }) {
        if (!env.isExtension) return;

        // Ensure permissions are established
        permissions.assert('bridge:receive', ['bridge:read']);

        // Handle context menu creation on install/startup
        if (chrome && chrome.contextMenus) {
            chrome.contextMenus.create({
                id: 'cerebr_summarize_content',
                title: chrome.i18n?.getMessage?.('context_menu_summarize') || 'Summarize the content', // Fallback to English
                contexts: ['selection', 'page']
            }, () => {
                if (chrome.runtime.lastError) {
                    // Ignore errors if context menu already exists
                    console.log('[WebpageMenu] Context menu initialization:', chrome.runtime.lastError.message);
                }
            });

            // Handle Context Menu Click
            chrome.contextMenus.onClicked.addListener(async (info, tab) => {
                if (info.menuItemId === 'cerebr_summarize_content' && tab && tab.id) {
                    try {
                        if (tab.url && (tab.url.startsWith('chrome://') ||
                                       tab.url.startsWith('edge://') ||
                                       tab.url.startsWith('about:') ||
                                       tab.url.startsWith('chrome-extension://'))) {
                            console.log('[WebpageMenu] Cannot summarize special pages.');
                            return;
                        }

                        // Send the standard OPEN/Toggle to the tab
                        await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR_onClicked' });

                        // Then use bridge API to broadcast a command to the Shell to fill in prompt
                        // The Shell plugin (or native chat) could listen for this to trigger summary
                        // But since we just want to open the sidebar, TOGGLE_SIDEBAR_onClicked is enough.
                    } catch (err) {
                        console.error('[WebpageMenu] Error toggling sidebar on context menu click', err);
                    }
                }
            });
        }
        
        return {
            onBridgeMessage(bridgeMessage, context) {
                if (bridgeMessage && bridgeMessage.type === 'CLOSE_SIDEBAR_FROM_TOOLBAR') {
                    const sourceTabId = context?.bridgeSource?.tab?.id;
                    if (sourceTabId && chrome && chrome.tabs) {
                        chrome.tabs.sendMessage(sourceTabId, { type: 'TOGGLE_SIDEBAR_onClicked' })
                            .catch(err => console.log('[ToolbarHandler] Failed to toggle sidebar:', err));
                    }
                    return { success: true };
                }
                return undefined; // We don't handle this message
            }
        };
    }
});