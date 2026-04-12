/**
 * MAERS Brief Modal
 * 用于纯净、解耦地显示和挂载游戏说明书内容
 */

const BriefModal = (() => {
    'use strict';

    const CSS = `
        #maers-brief-overlay {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(6px);
            z-index: 10000;
            display: flex;
            justify-content: center;
            align-items: center;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.3s ease;
        }

        #maers-brief-overlay.show {
            opacity: 1;
            pointer-events: auto;
        }

        #maers-brief-modal {
            background: rgba(12, 13, 16, 0.95);
            border: 1px solid rgba(60, 65, 75, 0.8);
            border-top: 3px solid #e2e8f0;
            width: 90%;
            max-width: 500px;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 10px 40px rgba(0,0,0,0.8);
            transform: translateY(20px);
            transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            font-family: 'Noto Sans SC', sans-serif;
        }

        #maers-brief-overlay.show #maers-brief-modal {
            transform: translateY(0);
        }

        .brief-header {
            padding: 16px 20px;
            border-bottom: 1px solid rgba(255,255,255,0.05);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .brief-title {
            font-family: 'Cinzel', serif;
            font-size: 1.1rem;
            color: #e2e8f0;
            font-weight: 600;
            letter-spacing: 1px;
            margin: 0;
        }

        .brief-close {
            background: none;
            border: none;
            color: rgba(255,255,255,0.4);
            font-size: 1.2rem;
            cursor: pointer;
            padding: 0;
            transition: color 0.2s;
        }

        .brief-close:hover {
            color: #ef4444;
        }

        .brief-body {
            padding: 24px 20px;
            overflow-y: auto;
            color: #94a3b8;
            font-size: 0.95rem;
            line-height: 1.7;
            white-space: pre-wrap;
            scrollbar-width: thin;
            scrollbar-color: rgba(255,255,255,0.2) transparent;
        }

        .brief-body::-webkit-scrollbar {
            width: 6px;
        }
        .brief-body::-webkit-scrollbar-thumb {
            background: rgba(255,255,255,0.2);
            border-radius: 3px;
        }
    `;

    let overlay = null;
    let titleEl = null;
    let bodyEl  = null;
    let styleInjected = false;

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
        
        overlay.innerHTML = `
            <div id="maers-brief-modal">
                <div class="brief-header">
                    <h3 class="brief-title" id="maers-brief-title"></h3>
                    <button class="brief-close" id="maers-brief-close">✕</button>
                </div>
                <div class="brief-body" id="maers-brief-body"></div>
            </div>
        `;
        
        document.body.appendChild(overlay);

        titleEl = document.getElementById('maers-brief-title');
        bodyEl  = document.getElementById('maers-brief-body');

        document.getElementById('maers-brief-close').addEventListener('click', hide);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) hide();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') hide();
        });
    }

    function hide() {
        if (overlay) overlay.classList.remove('show');
    }

    /**
     * @param {string} title 模块名称
     * @param {string} text 说明书内容
     */
    function show(title, text) {
        init();
        titleEl.textContent = `// MANUAL: ${title}`;
        bodyEl.textContent = text || '【暂无数据：未包含相关的说明档案】';
        overlay.classList.add('show');
    }

    return { show, hide };
})();
