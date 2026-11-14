/*
 * CENSY UI 动态执行器 (万能终极版 - 解锁同源权限)
 * SillyTavern UI Extension
 */

const EXTENSION_NAME = "CENSY Terminal";
// 支持白厄手机和 app-ui，忽略大小写和多余空格
const ROOT_PATTERN = /<div\b[^>]*\bid\s*=\s*["'](baie-terminal-template|app-ui)["']/i;
const FRAME_CLASS = 'censy-baie-terminal-frame';
const WRAPPER_CLASS = 'censy-baie-terminal-wrapper';

let chatObserver = null;
let scanQueued = false;
let started = false;

function log(...args) {
    console.info(`[${EXTENSION_NAME}]`, ...args);
}

function getChatRoot() {
    return document.querySelector('#chat');
}

function getMessageTextRoot(message) {
    return message.querySelector('.mes_text, .mes_text_inner') || message;
}

// 极其暴力的代码块抓取：不管怎么包裹，全抓出来
function getHtmlCodeBlocks(root) {
    return Array.from(root.querySelectorAll('pre, code'));
}

function buildRuntimeDocument(originalHtml) {
    const csp = [
        "default-src 'none'",
        "img-src https: data: blob:",
        "style-src 'unsafe-inline' https:",
        "script-src 'unsafe-inline' 'unsafe-eval' https: blob:",
        "font-src https: data:",
        "media-src https: data: blob:",
        // 将 connect-src 放宽，防止部分模块加载报错
        "connect-src 'self' https:", 
        "form-action 'none'",
        "base-uri 'none'",
        "object-src 'none'"
    ].join('; ');

    const preludeScript = `<script>
(() => {
    window.onerror = function(message, source, lineno, colno, error) {
        parent.postMessage({ __censyBaieError: true, message, lineno, error: error ? error.stack : '' }, '*');
    };
    try {
        window.localStorage.setItem('__censy_probe__', '1');
        window.localStorage.removeItem('__censy_probe__');
    } catch (error) {
        const makeMemoryStorage = () => {
            const data = Object.create(null);
            return {
                getItem(key) { return key in data ? data[key] : null; },
                setItem(key, value) { data[key] = String(value); },
                removeItem(key) { delete data[key]; },
                clear() { for (const key in data) delete data[key]; },
                key(index) { return Object.keys(data)[index] || null; },
                get length() { return Object.keys(data).length; }
            };
        };
        try { Object.defineProperty(window, 'localStorage', { value: makeMemoryStorage(), configurable: true }); } catch (e) {}
        try { Object.defineProperty(window, 'sessionStorage', { value: makeMemoryStorage(), configurable: true }); } catch (e) {}
    }
})();
<\/script>`;

    return `<!doctype html>
<html style="margin: 0 !important; padding: 0 !important; background: transparent !important;">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
${preludeScript}
<style>
html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: transparent !important;
    height: auto !important;
    min-height: 100% !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
}
</style>
</head>
<body>
${originalHtml}
</body>
</html>`;
}

function mountFrame(pre, source) {
    if (!pre || !pre.parentNode) return;
    if (pre.dataset.censyBaieMounted === '1') return;

    const wrapper = document.createElement('div');
    wrapper.className = WRAPPER_CLASS;
    wrapper.dataset.censyBaie = '1';

    const frame = document.createElement('iframe');
    frame.className = FRAME_CLASS;
    // 🌟【核心修改点】：加上 allow-same-origin，打通与父页面的隔阂
    frame.setAttribute('sandbox', 'allow-scripts allow-modals allow-same-origin');
    
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.setAttribute('loading', 'eager');
    frame.style.width = '100%';
    frame.style.height = '680px'; 
    frame.style.display = 'block';
    frame.style.border = '0';
    frame.style.background = 'transparent';
    frame.style.overflow = 'hidden';

    wrapper.appendChild(frame);
    pre.dataset.censyBaieMounted = '1';
    pre.replaceWith(wrapper);

    frame.srcdoc = buildRuntimeDocument(source);
}

function scanMessage(message) {
    if (!message || !message.matches('.mes')) return;

    const textRoot = getMessageTextRoot(message);
    const codeBlocks = getHtmlCodeBlocks(textRoot);

    for (const code of codeBlocks) {
        // 兼容处理：如果抓到的只是里面的 code，往上看一层是不是 pre
        const targetNode = code.closest('pre') || code;
        
        if (targetNode.dataset.censyBaieMounted === '1') continue;
        if (targetNode.closest(`.${WRAPPER_CLASS}`)) continue;

        const source = code.textContent || '';
        
        // 如果匹配到了目标 ID，开始渲染
        if (ROOT_PATTERN.test(source)) {
            console.log(`[${EXTENSION_NAME}] 成功捕获到目标代码块，准备挂载沙盒...`);
            mountFrame(targetNode, source);
        }
    }
}

function scanAllMessages() {
    const chatRoot = getChatRoot();
    if (!chatRoot) return;
    chatRoot.querySelectorAll('.mes').forEach(scanMessage);
}

function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(() => {
        scanQueued = false;
        scanAllMessages();
    });
}

function onParentMessage(event) {
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    if (data.__censyBaieError === true) {
        console.group(`[${EXTENSION_NAME}] UI 内部报错`);
        console.error(data.message);
        if (data.error) console.error(data.error);
        console.groupEnd();
    }
}

function observeChat() {
    const chatRoot = getChatRoot();
    if (!chatRoot) {
        setTimeout(observeChat, 500);
        return;
    }
    if (chatObserver) chatObserver.disconnect();
    chatObserver = new MutationObserver(() => queueScan());
    chatObserver.observe(chatRoot, { childList: true, subtree: true, characterData: true });
    scanAllMessages();
}

function startExtension() {
    if (started) return;
    started = true;
    window.addEventListener('message', onParentMessage);
    const context = window.SillyTavern?.getContext?.();
    if (context?.eventSource && context?.event_types) {
        const { eventSource, event_types } = context;
        const rescanEvents = [
            event_types.APP_READY, event_types.CHARACTER_MESSAGE_RENDERED,
            event_types.MESSAGE_EDITED, event_types.MESSAGE_SWIPED,
            event_types.MESSAGE_DELETED, event_types.CHAT_CHANGED
        ].filter(Boolean);
        for (const eventName of rescanEvents) {
            eventSource.on(eventName, () => {
                if (eventName === event_types.CHAT_CHANGED) setTimeout(observeChat, 100);
                else queueScan();
            });
        }
    }
    observeChat();
}

if (window.SillyTavern?.getContext) {
    startExtension();
} else {
    document.addEventListener('DOMContentLoaded', startExtension, { once: true });
}
