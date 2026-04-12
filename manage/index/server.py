#!/usr/bin/env python3
"""
MAERS-Game 本地开发服务器
- 静态文件服务（根目录为 MAERS-Game/）
- GET  /api/list-modules   →  读取 data/index/modules.json 返回模块列表
- POST /api/create-module  →  创建新模块 HTML 文件 + 写入注册表
"""

import http.server
import json
import os
import re
import urllib.parse
import webbrowser
from pathlib import Path
from threading import Timer

# ─── 配置 ───────────────────────────────────────
PORT      = 8765
ROOT      = Path(__file__).parent.parent.parent.resolve()   # MAERS-Game/
REGISTRY  = ROOT / 'data' / 'index' / 'modules.json'
MANUALS_DIR = ROOT / 'data' / 'manuals'
OPEN_URL  = f"http://localhost:{PORT}/index-admin.html"

# 确保目录存在
MANUALS_DIR.mkdir(parents=True, exist_ok=True)

# 新模块 HTML 模板
MODULE_TEMPLATE = """\
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{name}</title>
</head>
<body>
  <!-- {name} | {game_type} -->
  <!-- {description} -->
  <h1>{name}</h1>
  <p>{description}</p>
</body>
</html>
"""

# ─── 注册表读写 ──────────────────────────────────

def registry_read():
    """读取 modules.json，返回 modules 列表"""
    try:
        data = json.loads(REGISTRY.read_text(encoding='utf-8'))
        return data.get('modules', [])
    except Exception as e:
        print(f"[MAERS] 读取注册表失败: {e}")
        return []

def registry_write(raw: dict):
    """原子写入注册表（先写临时文件，再替换）"""
    tmp = REGISTRY.with_suffix('.tmp')
    try:
        tmp.write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding='utf-8')
        tmp.replace(REGISTRY)   # 原子替换，避免崩溃导致 JSON 残缺
    except Exception as e:
        tmp.unlink(missing_ok=True)
        raise

def registry_append(module: dict):
    """向注册表追加一条记录"""
    raw = json.loads(REGISTRY.read_text(encoding='utf-8'))
    raw.setdefault('modules', []).append(module)
    registry_write(raw)

def safe_path(filename: str) -> Path:
    """
    验证 filename 是合法的单层文件名（无路径穿越）。
    返回 ROOT / filename，若存在穿越则抛出 ValueError。
    """
    # 拒绝任何包含路径分隔符或特殊前缀的名称
    if '/' in filename or '\\' in filename or filename.startswith('.'):
        raise ValueError(f'非法文件名: {filename}')
    resolved = (ROOT / filename).resolve()
    if ROOT.resolve() not in (resolved, *resolved.parents):
        # resolved 不在 ROOT 子树内
        raise ValueError(f'路径穿越检测: {filename}')
    return resolved

# ─── 请求处理器 ──────────────────────────────────
class Handler(http.server.SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        # 只打印非 200/304 的响应
        if args and len(args) >= 2 and args[1] not in ('200', '304'):
            super().log_message(fmt, *args)

    def do_OPTIONS(self):
        """支持 CORS 预检（开发环境用）"""
        self._send_cors_headers(200)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/list-modules':
            self._handle_list_modules()
        elif parsed.path == '/api/get-manual':
            self._handle_get_manual(parsed)
        else:
            super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/create-module':
            self._handle_create_module()
        else:
            self.send_error(404, "API endpoint not found")

    def do_PUT(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/update-module':
            self._handle_update_module()
        elif parsed.path == '/api/update-manual':
            self._handle_update_manual()
        else:
            self.send_error(404, "API endpoint not found")

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/delete-module':
            self._handle_delete_module()
        else:
            self.send_error(404, "API endpoint not found")

    # ── GET /api/list-modules ────────────────────
    def _handle_list_modules(self):
        self._json_ok(registry_read())

    # ── GET /api/get-manual ──────────────────────
    def _handle_get_manual(self, parsed):
        query = urllib.parse.parse_qs(parsed.query)
        filename = query.get('filename', [''])[0].strip()
        if not filename:
            return self._json_error(400, '缺少 filename 参数')
        
        name_only = Path(filename).stem
        txt_file = MANUALS_DIR / f"{name_only}.txt"
        
        text_content = ""
        if txt_file.exists():
            text_content = txt_file.read_text(encoding='utf-8')
            
        self._json_ok({'text': text_content})

    # ── PUT /api/update-manual ───────────────────
    def _handle_update_manual(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body   = self.rfile.read(length)
            data   = json.loads(body.decode('utf-8'))

            filename = data.get('filename', '').strip()
            text     = data.get('text', '')

            if not filename:
                return self._json_error(400, '缺少 filename')
                
            name_only = Path(filename).stem
            txt_file = MANUALS_DIR / f"{name_only}.txt"
            txt_file.write_text(text, encoding='utf-8')
            
            print(f'[MAERS] 更新说明书：{txt_file.name}')
            self._json_ok({'success': True})
            
        except json.JSONDecodeError:
            self._json_error(400, '无效的 JSON 数据')
        except Exception as e:
            print(f'[MAERS] 更新说明书错误：{e}')
            self._json_error(500, str(e))

    # ── PUT /api/update-module ───────────────────
    def _handle_update_module(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body   = self.rfile.read(length)
            data   = json.loads(body.decode('utf-8'))

            filename     = data.get('filename', '').strip()
            new_name     = data.get('name', '').strip()
            game_type    = data.get('gameType', '').strip()
            description  = data.get('description', '').strip()
            do_rename    = data.get('rename', False)  # 是否同步重命名文件

            if not filename:
                return self._json_error(400, '缺少 filename')
            if not new_name:
                return self._json_error(400, '模块名称不能为空')

            raw = json.loads(REGISTRY.read_text(encoding='utf-8'))
            modules = raw.get('modules', [])

            # 找到目标条目
            idx = next((i for i, m in enumerate(modules) if m['filename'] == filename), None)
            if idx is None:
                return self._json_error(404, f'{filename} 不在注册表中')

            new_filename = filename

            # 重命名文件（可选）
            if do_rename:
                safe = re.sub(r'[^\w\u4e00-\u9fff\-]', '-', new_name)
                new_filename = f'{safe}.html'
                if new_filename != filename:
                    # 注册表层面重复检查（排除自身）
                    if any(m['filename'] == new_filename for i2, m in enumerate(modules) if i2 != idx):
                        return self._json_error(409, f'注册表中已存在模块 {new_filename}')
                    try:
                        src = safe_path(filename)
                        dst = safe_path(new_filename) if new_filename != filename else None
                    except ValueError as ve:
                        return self._json_error(400, str(ve))
                    if dst and dst.exists():
                        return self._json_error(409, f'磁盘文件 {new_filename} 已存在')
                    if src.exists() and dst:
                        src.rename(dst)

                    # 同步重命名 manual txt 文件
                    old_txt = MANUALS_DIR / f"{Path(filename).stem}.txt"
                    new_txt = MANUALS_DIR / f"{Path(new_filename).stem}.txt"
                    if old_txt.exists() and new_txt != old_txt:
                        old_txt.rename(new_txt)

            # 更新注册表
            modules[idx].update({
                'filename':    new_filename,
                'name':        new_name,
                'gameType':    game_type,
                'description': description,
                'url':         f'/{new_filename}',
            })
            raw['modules'] = modules
            registry_write(raw)

            print(f'[MAERS] 更新模块：{filename} → {new_filename}')
            self._json_ok({'module': modules[idx]})

        except json.JSONDecodeError:
            self._json_error(400, '无效的 JSON 数据')
        except Exception as e:
            print(f'[MAERS] 错误：{e}')
            self._json_error(500, str(e))

    # ── DELETE /api/delete-module ────────────────
    def _handle_delete_module(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body   = self.rfile.read(length)
            data   = json.loads(body.decode('utf-8'))

            filename = data.get('filename', '').strip()
            if not filename:
                return self._json_error(400, '缺少 filename')

            raw     = json.loads(REGISTRY.read_text(encoding='utf-8'))
            modules = raw.get('modules', [])
            before  = len(modules)
            modules = [m for m in modules if m['filename'] != filename]

            if len(modules) == before:
                return self._json_error(404, f'{filename} 不在注册表中')

            # 删除 HTML 文件（若存在）
            try:
                target = safe_path(filename)
            except ValueError as ve:
                return self._json_error(400, str(ve))
            if target.exists():
                target.unlink()
                
            # 删除 manual txt 文件（若存在）
            txt_file = MANUALS_DIR / f"{Path(filename).stem}.txt"
            if txt_file.exists():
                txt_file.unlink()

            raw['modules'] = modules
            registry_write(raw)

            print(f'[MAERS] 删除模块：{filename}')
            self._json_ok({'deleted': filename})

        except json.JSONDecodeError:
            self._json_error(400, '无效的 JSON 数据')
        except Exception as e:
            print(f'[MAERS] 错误：{e}')
            self._json_error(500, str(e))

    # ── POST /api/create-module ──────────────────
    def _handle_create_module(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body   = self.rfile.read(length)
            data   = json.loads(body.decode('utf-8'))

            name        = data.get('name', '').strip()
            game_type   = data.get('gameType', '').strip()
            description = data.get('description', '').strip()

            # ── 验证 ────────────────────────────
            if not name:
                return self._json_error(400, "模块名称不能为空")

            # 文件名：允许字母、数字、中文、连字符、下划线
            safe_name = re.sub(r'[^\w\u4e00-\u9fff\-]', '-', name)
            if not safe_name.strip('-'):
                return self._json_error(400, '模块名称清洗后为空，请使用字母、数字或中文命名')
            filename  = f"{safe_name}.html"

            # 路径安全检查
            try:
                target = safe_path(filename)
            except ValueError as ve:
                return self._json_error(400, str(ve))

            # 注册表层面重复检查
            existing = registry_read()
            if any(m['filename'] == filename for m in existing):
                return self._json_error(409, f'注册表中已存在模块 {filename}')

            # 磁盘层面重复检查
            if target.exists():
                return self._json_error(409, f'磁盘文件 {filename} 已存在')

            # ── 写 HTML 文件 ─────────────────────
            content = MODULE_TEMPLATE.format(
                name=name,
                game_type=game_type or '未分类',
                description=description or '暂无简介',
            )
            target.write_text(content, encoding='utf-8')

            # ── 写注册表 ─────────────────────────
            module = {
                "filename":    filename,
                "name":        name,
                "gameType":    game_type or '未分类',
                "description": description or '暂无简介',
                "url":         f"/{filename}",
                "status":      "offline",
                "cover":       ""
            }
            registry_append(module)

            print(f"[MAERS] 创建模块：{filename}")
            self._json_ok({"filename": filename, "url": f"/{filename}", "module": module})

        except json.JSONDecodeError:
            self._json_error(400, "无效的 JSON 数据")
        except Exception as e:
            print(f"[MAERS] 错误：{e}")
            self._json_error(500, str(e))

    # ── 工具方法 ────────────────────────────────
    def _send_cors_headers(self, code):
        self.send_response(code)
        self.send_header('Access-Control-Allow-Origin',  '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def _json_ok(self, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type',  'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def _json_error(self, code, msg):
        body = json.dumps({"error": msg}, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type',  'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)


# ─── 入口 ────────────────────────────────────────
if __name__ == '__main__':
    os.chdir(ROOT)

    server = http.server.HTTPServer(('localhost', PORT), Handler)

    print(f"╔══════════════════════════════════════╗")
    print(f"║   MAERS-Game Dev Server              ║")
    print(f"║   http://localhost:{PORT}             ║")
    print(f"║   根目录: {str(ROOT)[:26]}  ║")
    print(f"╚══════════════════════════════════════╝")
    print(f"  按 Ctrl+C 关闭服务器\n")

    # 延迟 0.8s 后自动打开浏览器
    Timer(0.8, lambda: webbrowser.open(OPEN_URL)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[MAERS] 服务器已关闭。")
