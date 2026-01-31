/**
 * Cerebr 类型定义
 * @module types
 */

/**
 * API 配置
 * @typedef {Object} APIConfig
 * @property {string} id - 配置唯一标识
 * @property {string} baseUrl - API 基础 URL
 * @property {string} apiKey - API 密钥
 * @property {string} [modelName='gpt-4o'] - 模型名称
 * @property {AdvancedSettings} [advancedSettings] - 高级设置
 */

/**
 * 高级设置
 * @typedef {Object} AdvancedSettings
 * @property {string} [systemPrompt=''] - 系统提示
 * @property {boolean} [isExpanded=false] - 是否展开
 * @property {boolean} [systemPromptLocalOnly=false] - 系统提示仅本地存储
 */

/**
 * 聊天消息
 * @typedef {Object} Message
 * @property {('system'|'user'|'assistant')} role - 消息角色
 * @property {string|MessageContent[]} content - 消息内容
 * @property {string} [reasoning_content] - 思考过程内容
 * @property {boolean} [updating] - 是否正在更新
 */

/**
 * 消息内容（多模态）
 * @typedef {Object} MessageContent
 * @property {('text'|'image_url')} type - 内容类型
 * @property {string} [text] - 文本内容
 * @property {ImageURL} [image_url] - 图片 URL
 */

/**
 * 图片 URL 对象
 * @typedef {Object} ImageURL
 * @property {string} url - 图片 URL（可以是 base64 data URL）
 */

/**
 * 聊天对话
 * @typedef {Object} Chat
 * @property {string} id - 对话唯一标识
 * @property {string} title - 对话标题
 * @property {Message[]} messages - 消息列表
 * @property {string} createdAt - 创建时间（ISO 字符串）
 * @property {string} updatedAt - 更新时间（ISO 字符串）
 * @property {YouTubeTranscriptRef[]} [youtubeTranscriptRefs] - YouTube 字幕引用
 */

/**
 * YouTube 字幕引用
 * @typedef {Object} YouTubeTranscriptRef
 * @property {string} key - 缓存键
 * @property {string} [videoId] - 视频 ID
 * @property {string} [lang] - 语言
 * @property {number} [updatedAt] - 更新时间戳
 */

/**
 * 网页信息
 * @typedef {Object} WebpageInfo
 * @property {WebpagePage[]} [pages] - 网页列表
 */

/**
 * 网页页面
 * @typedef {Object} WebpagePage
 * @property {string} title - 页面标题
 * @property {string} url - 页面 URL
 * @property {string} content - 页面内容
 * @property {boolean} [isCurrent] - 是否当前页面
 */

/**
 * API 调用参数
 * @typedef {Object} APIParams
 * @property {Message[]} messages - 消息历史
 * @property {APIConfig} apiConfig - API 配置
 * @property {string} userLanguage - 用户语言
 * @property {WebpageInfo} [webpageInfo] - 网页信息
 */

/**
 * 流式响应结果
 * @typedef {Object} StreamResult
 * @property {string} content - 助手回复内容
 * @property {string} reasoning_content - 思考过程内容
 */

/**
 * UI 配置
 * @typedef {Object} UIConfig
 * @property {TextareaConfig} textarea - 文本区域配置
 * @property {ImagePreviewConfig} imagePreview - 图片预览配置
 * @property {ImageTagConfig} imageTag - 图片标签配置
 */

/**
 * 文本区域配置
 * @typedef {Object} TextareaConfig
 * @property {number} maxHeight - 最大高度
 */

/**
 * 图片预览配置
 * @typedef {Object} ImagePreviewConfig
 * @property {HTMLElement} previewModal - 预览模态框
 * @property {HTMLImageElement} previewImage - 预览图片元素
 */

/**
 * 图片标签配置
 * @typedef {Object} ImageTagConfig
 * @property {Function} onImageClick - 图片点击回调
 * @property {Function} onDeleteClick - 删除点击回调
 */

/**
 * 站点覆盖配置
 * @typedef {Object} SiteOverride
 * @property {number} [fontScale] - 字体缩放
 * @property {number} [updatedAt] - 更新时间戳
 */

/**
 * 阅读进度
 * @typedef {Object} ReadingProgress
 * @property {string} chatId - 对话 ID
 * @property {number} scrollTop - 滚动位置
 * @property {string} [anchorMessageId] - 锚点消息 ID
 * @property {number} [timestamp] - 时间戳
 */

/**
 * Toast 选项
 * @typedef {Object} ToastOptions
 * @property {('info'|'success'|'error')} [type='info'] - 提示类型
 * @property {number} [durationMs=2000] - 显示时长
 */

/**
 * 事件管理器
 * @typedef {Object} EventManager
 * @property {Function} addListener - 添加监听器
 * @property {Function} removeListener - 移除监听器
 * @property {Function} removeAllListeners - 移除所有监听器
 * @property {Function} debounce - 防抖
 * @property {Function} throttle - 节流
 * @property {Function} rafThrottle - RAF 节流
 */

/**
 * 批量写入器
 * @typedef {Object} BatchWriter
 * @property {Function} write - 写入单个键值
 * @property {Function} writeMany - 批量写入
 * @property {Function} remove - 删除键
 * @property {Function} flush - 刷新待处理操作
 * @property {Function} hasPending - 检查是否有待处理操作
 */

/**
 * 缓存读取器
 * @typedef {Object} CachedReader
 * @property {Function} read - 读取数据
 * @property {Function} invalidate - 使缓存失效
 * @property {Function} clear - 清空缓存
 * @property {Function} warm - 预热缓存
 */

// 导出空对象以便 JSDoc 能够识别此文件
export default {};
