import { getBuiltinPluginManifestById } from '../shared/plugin-catalog.js';
import { webpageContextMenuPlugin } from '../builtins/background/webpage-context-menu-plugin.js';

const BUILTIN_BACKGROUND_PLUGIN_ENTRIES = Object.freeze([
    Object.freeze({
        plugin: webpageContextMenuPlugin,
        manifest: getBuiltinPluginManifestById(webpageContextMenuPlugin.id),
    }),
]);

export function getBuiltinBackgroundPluginEntries() {
    return BUILTIN_BACKGROUND_PLUGIN_ENTRIES.map((entry) => ({
        plugin: entry.plugin,
        manifest: entry.manifest ? { ...entry.manifest } : null,
    }));
}
