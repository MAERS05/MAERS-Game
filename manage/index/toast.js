/**
 * MAERS Toast 通知系统（遵循 Hum 实体卡纸设计变量）
 * 使用方式：
 *   Toast.success('sq-du.html 文件创建成功')
 *   Toast.error('删除失败：文件不存在')
 *   Toast.info('操作已取消')
 */

const Toast = (() => {
    'use strict';

    const CSS = `
        #maers-toast-container {
            position: fixed;
            top: var(--space-lg, 24px);
            right: var(--space-lg, 24px);
            z-index: var(--z-toast, 500);
            display: flex;
            flex-direction: column;
            gap: var(--space-xs, 8px);
            pointer-events: none;
        }

        .maers-toast {
            display: flex;
            align-items: center;
            gap: var(--space-sm, 12px);
            min-width: 280px;
            max-width: 420px;
            padding: var(--space-sm, 12px) var(--space-md, 16px);
            background: var(--color-card, oklch(98.8% 0.007 95));
            border-radius: var(--radius-stock, 16px);
            box-shadow: var(--shadow-stock);
            font-family: var(--font-body, sans-serif);
            font-size: var(--text-sm, 0.875rem);
            font-weight: 600;
            color: var(--color-ink, oklch(20% 0.014 255));
            pointer-events: auto;
            cursor: pointer;
            animation: maers-toast-in var(--dur-short, 220ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)) forwards;
        }

        .maers-toast.leaving {
            animation: maers-toast-out var(--dur-micro, 120ms) var(--ease-in, cubic-bezier(0.7, 0, 0.84, 0)) forwards;
        }

        .maers-toast-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            border-radius: var(--radius-pill, 999px);
            font-size: var(--text-xs, 0.75rem);
            flex-shrink: 0;
        }

        .maers-toast-msg {
            flex: 1;
            line-height: 1.45;
        }

        .maers-toast-close {
            font-size: var(--text-xs, 0.75rem);
            color: var(--color-muted);
            flex-shrink: 0;
        }

        .maers-toast.success .maers-toast-icon {
            background: var(--color-mint, oklch(82% 0.15 152));
            color: var(--color-ink);
        }

        .maers-toast.error .maers-toast-icon {
            background: var(--color-error, oklch(52% 0.19 27));
            color: var(--color-card);
        }

        .maers-toast.info .maers-toast-icon {
            background: var(--color-accent, oklch(87% 0.175 96));
            color: var(--color-accent-ink);
        }

        @keyframes maers-toast-in {
            from { opacity: 0; transform: translateY(-8px); }
            to   { opacity: 1; transform: translateY(0); }
        }

        @keyframes maers-toast-out {
            from { opacity: 1; transform: translateY(0); }
            to   { opacity: 0; transform: translateY(-8px); }
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
            container.setAttribute('role', 'status');
            container.setAttribute('aria-live', 'polite');
            document.body.appendChild(container);
        }
        return container;
    }

    function show(type, message, duration = 3000) {
        injectStyle();

        const icons = { success: '✓', error: '!', info: 'i' };
        const icon  = icons[type] || 'i';

        const el = document.createElement('div');
        el.className = `maers-toast ${type}`;
        el.innerHTML = `
            <span class="maers-toast-icon" aria-hidden="true">${icon}</span>
            <span class="maers-toast-msg">${escHtml(message)}</span>
            <span class="maers-toast-close" aria-hidden="true">关闭</span>
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
