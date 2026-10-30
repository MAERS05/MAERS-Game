/**
 * MAERS Toast 通知系统
 * 使用方式：
 *   Toast.success('sq-du.html 文件创建成功')
 *   Toast.error('删除失败：文件不存在')
 *   Toast.info('操作已取消')
 */

const Toast = (() => {
    'use strict';

    // ── 注入样式（仅执行一次）────────────────────
    const CSS = `
        #maers-toast-container {
            position: fixed;
            top: 32px;
            right: 32px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            pointer-events: none;
        }

        .maers-toast {
            display: flex;
            align-items: center;
            gap: 12px;
            min-width: 280px;
            max-width: 420px;
            padding: 14px 18px;
            background: rgba(8, 8, 10, 0.95);
            border: 1px solid rgba(60, 65, 75, 0.6);
            border-left-width: 3px;
            backdrop-filter: blur(12px);
            font-family: 'Noto Sans SC', 'Cinzel', monospace, sans-serif;
            font-size: 0.85rem;
            color: #e2e8f0;
            pointer-events: auto;
            cursor: pointer;

            /* 入场动画 */
            animation: maers-toast-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .maers-toast.leaving {
            animation: maers-toast-out 0.25s ease-in forwards;
        }

        .maers-toast-icon {
            font-size: 1rem;
            flex-shrink: 0;
            line-height: 1;
        }

        .maers-toast-msg {
            flex: 1;
            line-height: 1.45;
            letter-spacing: 0.3px;
        }

        .maers-toast-close {
            font-size: 0.75rem;
            color: rgba(100, 116, 139, 0.6);
            flex-shrink: 0;
            transition: color 0.2s;
        }
        .maers-toast:hover .maers-toast-close {
            color: #e2e8f0;
        }

        /* 类型配色 */
        .maers-toast.success { border-left-color: #f59e0b; }
        .maers-toast.error   { border-left-color: #ef4444; }
        .maers-toast.info    { border-left-color: #64748b; }

        .maers-toast.success .maers-toast-icon { color: #f59e0b; }
        .maers-toast.error   .maers-toast-icon { color: #ef4444; }
        .maers-toast.info    .maers-toast-icon { color: #64748b; }

        @keyframes maers-toast-in {
            from { opacity: 0; transform: translateX(24px); }
            to   { opacity: 1; transform: translateX(0);    }
        }

        @keyframes maers-toast-out {
            from { opacity: 1; transform: translateX(0);    }
            to   { opacity: 0; transform: translateX(24px); }
        }
    `;

    let container = null;
    let styleInjected = false;

    function injectStyle() {
        if (styleInjected) return;
        const s = document.createElement('style');
        s.textContent = CSS;
        document.head.appendChild(s);
        styleInjected = true;
    }

    function getContainer() {
        if (!container) {
            container = document.createElement('div');
            container.id = 'maers-toast-container';
            document.body.appendChild(container);
        }
        return container;
    }

    // ── 核心函数 ─────────────────────────────────
    /**
     * @param {'success'|'error'|'info'} type
     * @param {string} message
     * @param {number} [duration=3000] 自动消失毫秒数，0 = 不自动消失
     */
    function show(type, message, duration = 3000) {
        injectStyle();

        const icons = { success: '✦', error: '✖', info: '◈' };
        const icon  = icons[type] || '◈';

        const el = document.createElement('div');
        el.className = `maers-toast ${type}`;
        el.innerHTML = `
            <span class="maers-toast-icon">${icon}</span>
            <span class="maers-toast-msg">${escHtml(message)}</span>
            <span class="maers-toast-close">✕</span>
        `;

        function dismiss() {
            if (el.classList.contains('leaving')) return;
            el.classList.add('leaving');
            el.addEventListener('animationend', () => el.remove(), { once: true });
        }

        el.addEventListener('click', dismiss);

        getContainer().appendChild(el);

        if (duration > 0) {
            setTimeout(dismiss, duration);
        }

        return { dismiss };
    }

    function escHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    return {
        success: (msg, ms)  => show('success', msg, ms),
        error:   (msg, ms)  => show('error',   msg, ms),
        info:    (msg, ms)  => show('info',    msg, ms),
    };
})();
