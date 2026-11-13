/*
 * CENSY 白厄手机动态执行器
 * SillyTavern UI Extension
 */

const EXTENSION_NAME = "CENSY Bai’e Terminal";
const ROOT_PATTERN = /<div\b[^>]*\bid\s*=\s*["']baie-terminal-template["']/i;
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

function getHtmlCodeBlocks(root) {
    return Array.from(root.querySelectorAll('pre > code, pre code'));
}

function extractDocumentParts(html) {
    const looksLikeFullDocument = /^\s*<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(html);
    let headContent = '';
    let bodyContent = html;

    if (looksLikeFullDocument) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            headContent = doc.head ? doc.head.innerHTML : '';
            bodyContent = doc.body ? doc.body.innerHTML : html;
        } catch (error) {}
    }

    // 【新增正则/清理逻辑】：干掉 AI 自己脑补的多余图标
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(bodyContent, 'text/html');
        const appItems = doc.querySelectorAll('.app-item');
        let changed = false;

        appItems.forEach(item => {
            const label = item.querySelector('.app-label');
            if (label) {
                const text = label.innerText.trim();
                // 只要匹配到这三个词，直接连根拔起
                if (text === '公告' || text === '日程' || text === '收藏') {
                    item.remove();
                    changed = true;
                }
            }
        });

        if (changed) {
            bodyContent = doc.body.innerHTML;
        }
    } catch (error) {
        log('清理多余图标失败', error);
    }

    return { head: headContent, body: bodyContent };
}

function buildRuntimeDocument(originalHtml) {
    const csp = [
        "default-src 'none'",
        "img-src https: data: blob:",
        "style-src 'unsafe-inline' https:",
        "script-src 'unsafe-inline' 'unsafe-eval' https: blob:",
        "font-src https: data:",
        "media-src https: data: blob:",
        "connect-src 'none'",
        "form-action 'none'",
        "base-uri 'none'",
        "object-src 'none'"
    ].join('; ');

    const { head: headContent, body: bodyContent } = extractDocumentParts(originalHtml);

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
    try {
        const originalBack = window.history.back.bind(window.history);
        window.history.back = function () {
            if (window.history.length <= 1) {
                parent.postMessage({ __censyBaieAction: 'back' }, '*');
                return;
            }
            originalBack();
        };
    } catch (error) {}
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
#baie-terminal-template {
    background: transparent !important;
    padding-top: 30px !important; 
    padding-bottom: 40px !important; 
}
</style>
${headContent}
</head>
<body>
${bodyContent}
</body>
</html>`;
}

function mountPhone(pre, source) {
    if (!pre || !pre.parentNode) return;
    if (pre.dataset.censyBaieMounted === '1') return;

    const wrapper = document.createElement('div');
    wrapper.className = WRAPPER_CLASS;
    wrapper.dataset.censyBaie = '1';

    const frame = document.createElement('iframe');
    frame.className = FRAME_CLASS;
    frame.title = '白厄的手机';
    frame.setAttribute('sandbox', 'allow-scripts allow-modals');
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
        const pre = code.closest('pre');
        if (!pre || pre.dataset.censyBaieMounted === '1') continue;
        if (pre.closest(`.${WRAPPER_CLASS}`)) continue;

        const source = code.textContent || '';
        if (!ROOT_PATTERN.test(source)) continue;

        mountPhone(pre, source);
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
        console.group(`[${EXTENSION_NAME}] 手机内部报错`);
        console.error(data.message);
        if (data.error) console.error(data.error);
        console.groupEnd();
        return;
    }

    if (data.__censyBaieAction === 'back') {
        const frames = document.querySelectorAll(`iframe.${FRAME_CLASS}`);
        for (const frame of frames) {
            if (frame.contentWindow !== event.source) continue;
            const message = frame.closest('.mes');
            if (message) message.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }
    }
}

function observeChat() {
    const chatRoot = getChatRoot();
    if (!chatRoot) {
        log('尚未找到 #chat，稍后重试。');
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