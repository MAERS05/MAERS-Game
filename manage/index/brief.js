/**
 * MAERS Brief Modal
 * 用于纯净、解耦地显示和挂载游戏说明书内容
 * 支持多分类 Tab 切换（遵循 Hum 实体卡纸设计变量）
 */

const BriefModal = (() => {
    'use strict';

    const CSS = `
        #maers-brief-overlay {
            position: fixed;
            inset: 0;
            background: var(--color-scrim, oklch(20% 0.014 255 / 0.45));
            z-index: var(--z-modal, 400);
            display: flex;
            justify-content: center;
            align-items: center;
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
            transition: opacity var(--dur-short, 220ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)),
                        visibility var(--dur-short, 220ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
        }

        #maers-brief-overlay.show {
            opacity: 1;
            visibility: visible;
            pointer-events: auto;
        }

        #maers-brief-modal {
            background: var(--color-card, oklch(98.8% 0.007 95));
            color: var(--color-ink, oklch(20% 0.014 255));
            border-radius: var(--radius-card, 20px);
            box-shadow: var(--shadow-stock);
            width: 92%;
            max-width: 580px;
            max-height: 82dvh;
            display: flex;
            flex-direction: column;
            transform: translateY(var(--space-sm, 12px));
            transition: transform var(--dur-long, 420ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
            font-family: var(--font-body, sans-serif);
        }

        #maers-brief-overlay.show #maers-brief-modal {
            transform: translateY(0);
        }

        .brief-header {
            padding: var(--space-md, 16px) var(--space-lg, 24px);
            border-bottom: var(--rule-hair, 1px) solid var(--color-rule, oklch(85% 0.02 95));
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .brief-title {
            font-family: var(--font-display, sans-serif);
            font-size: var(--text-lg, 1.2rem);
            color: var(--color-ink, oklch(20% 0.014 255));
            font-weight: var(--display-weight, 600);
            margin: 0;
        }

        .brief-close {
            background: var(--color-paper-2);
            border: var(--rule-hair, 1px) solid var(--color-rule);
            border-radius: var(--radius-stock, 10px);
            color: var(--color-ink-2);
            font-size: var(--text-xs, 0.75rem);
            font-weight: 600;
            min-width: 32px;
            min-height: 32px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            padding: 0 var(--space-sm, 12px);
            transition: background-color var(--dur-micro, 120ms) var(--ease-snap), transform var(--dur-micro, 120ms) var(--ease-snap);
        }

        .brief-close:hover {
            background: var(--color-paper-3);
            color: var(--color-ink);
        }

        .brief-close:active {
            transform: translateY(1px);
        }

        .brief-tabs {
            display: flex;
            flex-wrap: wrap;
            gap: var(--space-xs, 8px);
            padding: var(--space-sm, 12px) var(--space-lg, 24px);
            background: var(--color-paper);
            border-bottom: var(--rule-hair, 1px) solid var(--color-rule);
        }

        .brief-tab {
            background: var(--color-card);
            border: var(--rule-hair, 1px) solid var(--color-rule);
            border-radius: var(--radius-pill, 999px);
            color: var(--color-muted);
            padding: var(--space-2xs, 4px) var(--space-md, 16px);
            min-height: 32px;
            cursor: pointer;
            font-size: var(--text-xs, 0.75rem);
            font-weight: 500;
            font-family: var(--font-body, sans-serif);
            transition: background-color var(--dur-micro, 120ms) var(--ease-snap), color var(--dur-micro, 120ms) var(--ease-snap);
        }

        .brief-tab:hover {
            background: var(--color-paper-2);
            color: var(--color-ink);
        }

        .brief-tab.active {
            background: var(--color-ink);
            border-color: var(--color-ink);
            color: var(--color-card);
            font-weight: 600;
        }

        .brief-body {
            padding: var(--space-lg, 24px);
            overflow-y: auto;
            color: var(--color-ink-2);
            font-size: var(--text-md, 1rem);
            line-height: 1.7;
            white-space: pre-wrap;
            scrollbar-width: thin;
            scrollbar-color: var(--color-muted) transparent;
        }
    `;

    let overlay = null;
    let titleEl = null;
    let tabsEl  = null;
    let bodyEl  = null;
    let closeBtnEl = null;
    let lastFocusedEl = null;
    let styleInjected = false;
    let currentModule = null;

    function init() {
        if (overlay) return;

        if (!styleInjected) {
            const s = document.createElement('style');
            s.textContent = CSS;
            document.head.appendChild(s);
            styleInjected = true;
        }

        overlay = document.createElement('div');
        overlay.id = 'maers-brief-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'maers-brief-title');

        overlay.innerHTML = `
            <div id="maers-brief-modal">
                <div class="brief-header">
                    <h3 class="brief-title" id="maers-brief-title"></h3>
                    <button type="button" class="brief-close" id="maers-brief-close" aria-label="关闭说明书">关闭</button>
                </div>
                <div class="brief-tabs" id="maers-brief-tabs" role="tablist"></div>
                <div class="brief-body" id="maers-brief-body" role="tabpanel"></div>
            </div>
        `;

        document.body.appendChild(overlay);

        titleEl    = document.getElementById('maers-brief-title');
        tabsEl     = document.getElementById('maers-brief-tabs');
        bodyEl     = document.getElementById('maers-brief-body');
        closeBtnEl = document.getElementById('maers-brief-close');

        closeBtnEl.addEventListener('click', hide);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) hide();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay && overlay.classList.contains('show')) {
                hide();
            }
        });
    }

    function hide() {
        if (overlay) overlay.classList.remove('show');
        currentModule = null;
        if (lastFocusedEl && typeof lastFocusedEl.focus === 'function') {
            lastFocusedEl.focus();
            lastFocusedEl = null;
        }
    }

    /** 解析模块说明文档基础路径 */
    function resolveManualBasePath(moduleRef) {
        const clean = String(moduleRef || '').trim();
        if (clean.includes('/')) {
            const base = clean.replace(/\/[^/]*\.html$/i, '').replace(/\/$/, '');
            return base.split('/').map(seg => seg ? encodeURIComponent(seg) : '').join('/');
        }
        const dir = clean.replace(/\.html$/i, '');
        return encodeURIComponent(dir);
    }

    /** 选中某个分类 Tab 并加载内容 */
    async function selectTab(moduleName, tabName) {
        tabsEl.querySelectorAll('.brief-tab').forEach(t => {
            const isSelected = t.textContent === tabName;
            t.classList.toggle('active', isSelected);
            t.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        });

        bodyEl.textContent = '加载中…';
        try {
            const baseDir = resolveManualBasePath(moduleName);
            const mdPath = `${baseDir}/manuals/${encodeURIComponent(tabName)}.txt`;
            const res = await fetch(mdPath);
            const text = res.ok ? await res.text() : '';
            bodyEl.textContent = text || '暂无相关说明档案。';
        } catch (err) {
            bodyEl.textContent = '说明档案读取失败。';
        }
    }

    /**
     * @param {string} title 模块名称
     * @param {string} filename 模块文件名或入口路径
     * @param {string[]} manuals 分类名列表
     */
    function show(title, filename, manuals) {
        init();
        lastFocusedEl = document.activeElement;
        currentModule = filename;
        titleEl.textContent = `${title} · 游戏说明书`;

        tabsEl.innerHTML = '';
        if (manuals && manuals.length > 0) {
            manuals.forEach(name => {
                const tab = document.createElement('button');
                tab.type = 'button';
                tab.className = 'brief-tab';
                tab.setAttribute('role', 'tab');
                tab.textContent = name;
                tab.addEventListener('click', () => selectTab(filename, name));
                tabsEl.appendChild(tab);
            });
            tabsEl.style.display = '';
            selectTab(filename, manuals[0]);
        } else {
            tabsEl.style.display = 'none';
            bodyEl.textContent = '暂无相关说明档案。';
        }

        overlay.classList.add('show');
        if (closeBtnEl) closeBtnEl.focus();
    }

    return { show, hide };
})();
