import { definePlugin } from '../../shared/define-plugin.js';

export const customToolbarPlugin = definePlugin({
    id: 'builtin.custom-toolbar',
    displayName: 'User Custom Toolbar',
    activationEvents: ['shell.ready'],
    setup({ api, permissions, env }) {
        // Assert we have mounting permissions
        permissions.assert('ui:slots', ['ui:mount']);
        permissions.assert('bridge:send:background', ['bridge:send']);

        api.shell.mountSlot('shell.chat.before', () => {
            const toolbar = document.createElement('div');
            toolbar.id = 'top-toolbar';
            toolbar.setAttribute('role', 'toolbar');
            toolbar.style.display = 'flex';
            toolbar.style.alignItems = 'center';
            toolbar.style.gap = '8px';
            toolbar.style.padding = '8px 12px';
            toolbar.style.borderBottom = '1px solid var(--border-color)';
            toolbar.style.flexShrink = '0';
            toolbar.style.background = 'var(--container-bg)';

            // New Chat Quick Button
            const newChatBtn = document.createElement('button');
            newChatBtn.id = 'new-chat-quick';
            newChatBtn.type = 'button';
            newChatBtn.title = 'New Chat';
            newChatBtn.setAttribute('aria-label', 'New Chat');
            newChatBtn.style.background = 'transparent';
            newChatBtn.style.border = 'none';
            newChatBtn.style.color = 'var(--text-color)';
            newChatBtn.style.cursor = 'pointer';
            newChatBtn.style.padding = '4px';
            newChatBtn.style.display = 'flex';
            newChatBtn.style.alignItems = 'center';
            newChatBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 5v14M5 12h14"/>
                </svg>
            `;
            newChatBtn.addEventListener('click', () => {
                const navNewChat = document.getElementById('new-chat');
                if (navNewChat) {
                    navNewChat.click();
                } else if (api.chat && typeof api.chat.abort === 'function') {
                    // Fallback to reload chat page if no button visible
                    if (window.location) {
                        window.location.reload();
                    }
                }
            });
            toolbar.appendChild(newChatBtn);

            const spacer = document.createElement('div');
            spacer.style.flex = '1';
            toolbar.appendChild(spacer);

            // Close Sidebar Button
            const closeBtn = document.createElement('button');
            closeBtn.id = 'close-button';
            closeBtn.type = 'button';
            closeBtn.title = 'Close Sidebar';
            closeBtn.setAttribute('aria-label', 'Close Sidebar');
            closeBtn.style.background = 'transparent';
            closeBtn.style.border = 'none';
            closeBtn.style.color = 'var(--text-color)';
            closeBtn.style.cursor = 'pointer';
            closeBtn.style.padding = '4px';
            closeBtn.style.display = 'flex';
            closeBtn.style.alignItems = 'center';
            closeBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
            `;
            closeBtn.addEventListener('click', async () => {
                if (env.isExtension && api.bridge) {
                    try {
                        const response = await api.bridge.send({ type: 'CLOSE_SIDEBAR_FROM_TOOLBAR' }, 'background');
                        if (!response?.success) {
                            console.warn('[CustomToolbar] Failed to close sidebar via bridge', response);
                        }
                    } catch (err) {
                        console.error('[CustomToolbar] Failed to close sidebar via bridge', err);
                    }
                } else {
                    // Not in extension, just clear the input and scroll to top
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
            });
            toolbar.appendChild(closeBtn);

            return toolbar;
        });
    }
});