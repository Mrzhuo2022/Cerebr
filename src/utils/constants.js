/**
 * 应用常量配置
 * @module constants
 */

// GitHub 和反馈链接
export const OSS_URL = 'https://github.com/yym68686/Cerebr';
export const FEEDBACK_URL = `${OSS_URL}/issues/new`;

// 存储键
export const STORAGE_KEYS = {
    // 聊天相关
    LEGACY_CHATS_KEY: 'cerebr_chats',
    CHATS_INDEX_V2_KEY: 'cerebr_chats_index_v2',
    CHAT_V2_PREFIX: 'cerebr_chat_v2_',
    LEGACY_CURRENT_CHAT_ID_KEY: 'cerebr_current_chat_id',
    CURRENT_CHAT_ID_BY_TAB_PREFIX: 'cerebr_current_chat_id_v1_tab_',
    LAST_ACTIVE_CHAT_ID_KEY: 'cerebr_last_active_chat_id_v1',
    
    // 草稿
    DRAFT_KEY_PREFIX: 'cerebr_draft_v1_',
    
    // 阅读进度
    READING_PROGRESS_V1_PREFIX: 'cerebr_reading_progress_v1_',
    
    // 设置相关
    FONT_SCALE_KEY: 'fontScale',
    SITE_OVERRIDES_KEY: 'panelSiteOverridesV1',
    SIDEBAR_POSITION_KEY: 'cerebr_sidebar_position_v1',
    
    // API 配置
    SYSTEM_PROMPT_KEY_PREFIX: 'apiConfigSystemPrompt_',
    SYSTEM_PROMPT_LOCAL_ONLY_KEY_PREFIX: 'apiConfigSystemPromptLocalOnly_'
};

// UI 配置
export const UI_CONFIG = {
    // 滚动
    SCROLL_THRESHOLD_PX: 120,
    VISIBILITY_THRESHOLD_PX: 24,
    
    // 侧边栏
    SIDEBAR_WIDTH_MIN_PX: 300,
    SIDEBAR_WIDTH_MAX_PX: 800,
    SIDEBAR_DEFAULT_WIDTH_PX: 430,
    
    // 拖动
    DRAG_THRESHOLD_PX: 4,
    
    // 悬停菜单
    APPROACH_DISTANCE_PX: 28,
    HOVER_OPEN_DELAY_MS: 140,
    TRAIL_WINDOW_MS: 200,
    AUTO_CLOSE_DELAY_MS: 280,
    AUTO_OPEN_COOLDOWN_MS: 900,
    
    // 文本区域
    TEXTAREA_MAX_HEIGHT: 200,
    
    // 缓存
    PADDING_CACHE_TTL_MS: 240
};

// API 配置
export const API_CONFIG = {
    DEFAULT_BASE_URL: '',
    DEFAULT_MODEL: '',
    
    // 系统提示
    SYSTEM_PROMPT_SYNC_THRESHOLD_BYTES: 6000,
    SYSTEM_PROMPT_LOCAL_DEBOUNCE_MS: 200,
    SYSTEM_PROMPT_SYNC_DEBOUNCE_MS: 2000,
    API_CONFIGS_SYNC_DEBOUNCE_MS: 800,
    
    // 重试
    MAX_RETRIES: 20,
    
    // 流式响应
    UPDATE_INTERVAL_MS: 100
};

// 字体缩放
export const FONT_SCALE = {
    PRESETS: [0.9, 1, 1.1, 1.2],
    DEFAULT: 1,
    SITE_KEY_PLUS: 2
};

// 多部分公共后缀（用于站点键提取）
export const MULTI_PART_PUBLIC_SUFFIXES = new Set([
    // UK
    'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'net.uk',
    // Australia
    'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
    // Japan
    'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp',
    // China / HK / TW
    'com.cn', 'net.cn', 'org.cn', 'gov.cn',
    'com.hk', 'com.tw', 'com.sg'
]);

// 误判思维链前缀
export const MISFILED_THINK_PREFIXES = ['think', 'silently', '思考', 'thought'];

// 草稿保存延迟
export const DRAFT_SAVE_DELAY_MS = 400;

// 站点覆盖最大条目
export const MAX_SITE_OVERRIDE_ENTRIES = 100;
