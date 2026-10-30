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
OPEN_URL  = f"http://localhost:{PORT}/index-admin.html"

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

def get_module_dir(filename: str) -> Path:
    """根据模块 filename（如 'sq-du.html'）返回模块目录（如 ROOT/'sq-du'）"""
    dir_name = Path(filename).stem
    return ROOT / dir_name

def get_manuals_dir(filename: str) -> Path:
    """返回模块的 manuals 子目录"""
    return get_module_dir(filename) / 'manuals'

def safe_manual_name(name: str) -> str:
    """验证手册名称是安全的单层文件名"""
    name = name.strip()
    if not name:
        raise ValueError('手册名称不能为空')
    if '/' in name or '\\' in name or name.startswith('.'):
        raise ValueError(f'非法手册名称: {name}')
    return name

def _get_manual_order_file(manuals_dir: Path) -> Path:
    return manuals_dir / 'order.json'

def _sync_manual_order(manuals_dir: Path) -> list:
    """读取所有文本并和 order.json 同步（自动补齐或清理），返回有序列表"""
    order_file = _get_manual_order_file(manuals_dir)
    order = []
    if order_file.exists():
        try:
            order = json.loads(order_file.read_text(encoding='utf-8'))
        except:
            order = []

    # 磁盘上真实存在的文本（排除 order.json 本身）
    actual_names = {
        f.stem for f in manuals_dir.iterdir()
        if f.is_file() and f.suffix == '.txt'
    }

    # 1. 剔除那些在 order 里但磁盘上不存在的
    valid_order = [name for name in order if name in actual_names]

    # 2. 补齐在磁盘上但不在 order 里的 (放到最后)
    missing_names = sorted(actual_names - set(valid_order))
    new_order = valid_order + missing_names

    # 3. 如果不同，同步写回
    if new_order != order:
        order_file.write_text(json.dumps(new_order, ensure_ascii=False, indent=2), encoding='utf-8')

    return new_order

def _save_manual_order(manuals_dir: Path, new_order: list):
    order_file = _get_manual_order_file(manuals_dir)
    order_file.write_text(json.dumps(new_order, ensure_ascii=False, indent=2), encoding='utf-8')

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
        elif parsed.path == '/api/list-manuals':
            self._handle_list_manuals(parsed)
        else:
            super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/create-module':
            self._handle_create_module()
        elif parsed.path == '/api/create-manual':
            self._handle_create_manual()
        else:
            self.send_error(404, "API endpoint not found")

    def do_PUT(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/update-module':
            self._handle_update_module()
        elif parsed.path == '/api/update-manual':
            self._handle_update_manual()
        elif parsed.path == '/api/rename-manual':
            self._handle_rename_manual()
        elif parsed.path == '/api/reorder-manuals':
            self._handle_reorder_manuals()
        else:
            self.send_error(404, "API endpoint not found")

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/delete-module':
            self._handle_delete_module()
        elif parsed.path == '/api/delete-manual':
            self._handle_delete_manual()
        else:
            self.send_error(404, "API endpoint not found")

    # ── GET /api/list-modules ────────────────────
    def _handle_list_modules(self):
        self._json_ok(registry_read())

    # ── GET /api/list-manuals ────────────────────
    def _handle_list_manuals(self, parsed):
        query = urllib.parse.parse_qs(parsed.query)
        filename = query.get('filename', [''])[0].strip()
        if not filename:
            return self._json_error(400, '缺少 filename 参数')

        manuals_dir = get_manuals_dir(filename)
        if not manuals_dir.exists():
            return self._json_ok({'manuals': []})

        names = _sync_manual_order(manuals_dir)
        self._json_ok({'manuals': names})

    # ── GET /api/get-manual ──────────────────────
    def _handle_get_manual(self, parsed):
        query = urllib.parse.parse_qs(parsed.query)
        filename = query.get('filename', [''])[0].strip()
        manual   = query.get('manual', [''])[0].strip()
        if not filename:
            return self._json_error(400, '缺少 filename 参数')
        if not manual:
            return self._json_error(400, '缺少 manual 参数')

        try:
            safe_name = safe_manual_name(manual)
        except ValueError as ve:
            return self._json_error(400, str(ve))

        txt_file = get_manuals_dir(filename) / f"{safe_name}.txt"
        text_content = ""
        if txt_file.exists():
            text_content = txt_file.read_text(encoding='utf-8')

        self._json_ok({'text': text_content})

    # ── POST /api/create-manual ─────────────────
    def _handle_create_manual(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body   = self.rfile.read(length)
            data   = json.loads(body.decode('utf-8'))

            filename = data.get('filename', '').strip()
            manual   = data.get('manual', '').strip()

            if not filename:
                return self._json_error(400, '缺少 filename')
            if not manual:
                return self._json_error(400, '缺少 manual 名称')

            try:
                safe_name = safe_manual_name(manual)
            except ValueError as ve:
                return self._json_error(400, str(ve))

            manuals_dir = get_manuals_dir(filename)
            manuals_dir.mkdir(parents=True, exist_ok=True)
            txt_file = manuals_dir / f"{safe_name}.txt"

            if txt_file.exists():
                return self._json_error(409, f'说明书 "{manual}" 已存在')

            txt_file.write_text('', encoding='utf-8')

            # 添加到顺序表的末尾
            current_order = _sync_manual_order(manuals_dir)
            if safe_name not in current_order:
                current_order.append(safe_name)
                _save_manual_order(manuals_dir, current_order)

            print(f'[MAERS] 创建说明书：{txt_file}')
            self._json_ok({'success': True, 'manual': safe_name})

        except json.JSONDecodeError:
            self._json_error(400, '无效的 JSON 数据')
        except Exception as e:
            print(f'[MAERS] 创建说明书错误：{e}')
            self._json_error(500, str(e))

    # ── PUT /api/update-manual ───────────────────
    def _handle_update_manual(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body   = self.rfile.read(length)
            data   = json.loads(body.decode('utf-8'))

            filename = data.get('filename', '').strip()
            manual   = data.get('manual', '').strip()
            text     = data.get('text', '')

            if not filename:
                return self._json_error(400, '缺少 filename')
            if not manual:
                return self._json_error(400, '缺少 manual 名称')

            try:
                safe_name = safe_manual_name(manual)
            except ValueError as ve:
                return self._json_error(400, str(ve))

            manuals_dir = get_manuals_dir(filename)
            manuals_dir.mkdir(parents=True, exist_ok=True)
            txt_file = manuals_dir / f"{safe_name}.txt"
            txt_file.write_text(text, encoding='utf-8')

            print(f'[MAERS] 更新说明书：{txt_file}')
            self._json_ok({'success': True})

        except json.JSONDecodeError:
            self._json_error(400, '无效的 JSON 数据')
        except Exception as e:
            print(f'[MAERS] 更新说明书错误：{e}')
            self._json_error(500, str(e))

    # ── PUT /api/rename-manual ────────────────────
    def _handle_rename_manual(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body   = self.rfile.read(length)
            data   = json.loads(body.decode('utf-8'))

            filename  = data.get('filename', '').strip()
            old_name  = data.get('oldName', '').strip()
            new_name  = data.get('newName', '').strip()

            if not filename:
                return self._json_error(400, '缺少 filename')
            if not old_name:
                return self._json_error(400, '缺少 oldName')
            if not new_name:
                return self._json_error(400, '缺少 newName')

            try:
                safe_old = safe_manual_name(old_name)
                safe_new = safe_manual_name(new_name)
            except ValueError as ve:
                return self._json_error(400, str(ve))

            manuals_dir = get_manuals_dir(filename)
            old_file = manuals_dir / f"{safe_old}.txt"
            new_file = manuals_dir / f"{safe_new}.txt"

            if not old_file.exists():
                return self._json_error(404, f'说明书 "{old_name}" 不存在')
            if new_file.exists():
                return self._json_error(409, f'说明书 "{new_name}" 已存在')

            old_file.rename(new_file)

            # 更新顺序表
            current_order = _sync_manual_order(manuals_dir)
            if safe_old in current_order:
                idx = current_order.index(safe_old)
                current_order[idx] = safe_new
                _save_manual_order(manuals_dir, current_order)

            print(f'[MAERS] 重命名说明书：{old_file.name} → {new_file.name}')
            self._json_ok({'success': True, 'manual': safe_new})

        except json.JSONDecodeError:
            self._json_error(400, '无效的 JSON 数据')
        except Exception as e:
            print(f'[MAERS] 重命名说明书错误：{e}')
            self._json_error(500, str(e))

    # ── PUT /api/reorder-manuals ──────────────────
    def _handle_reorder_manuals(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body   = self.rfile.read(length)
            data   = json.loads(body.decode('utf-8'))

            filename = data.get('filename', '').strip()
            new_order = data.get('order', [])

            if not filename:
                return self._json_error(400, '缺少 filename')
            if not isinstance(new_order, list):
                return self._json_error(400, 'order 必须是一个数组')

            manuals_dir = get_manuals_dir(filename)
            
            # 确保传入的名字都是合法的并且存在
            current_order = _sync_manual_order(manuals_dir)
            valid_names = set(current_order)
            
            validated_order = []
            for name in new_order:
                if name in valid_names:
                    validated_order.append(name)
            
            # 再补上可能漏掉的（防止只传了一部分或者出bug）
            missing = [n for n in current_order if n not in validated_order]
            final_order = validated_order + missing

            _save_manual_order(manuals_dir, final_order)
            print(f'[MAERS] 更新说明书顺序：{filename}')
            self._json_ok({'success': True, 'order': final_order})

        except json.JSONDecodeError:
            self._json_error(400, '无效的 JSON 数据')
        except Exception as e:
            print(f'[MAERS] 更新说明书顺序错误：{e}')
            self._json_error(500, str(e))

    # ── DELETE /api/delete-manual ─────────────────
    def _handle_delete_manual(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body   = self.rfile.read(length)
            data   = json.loads(body.decode('utf-8'))

            filename = data.get('filename', '').strip()
            manual   = data.get('manual', '').strip()

            if not filename:
                return self._json_error(400, '缺少 filename')
            if not manual:
                return self._json_error(400, '缺少 manual 名称')

            try:
                safe_name = safe_manual_name(manual)
            except ValueError as ve:
                return self._json_error(400, str(ve))

            txt_file = get_manuals_dir(filename) / f"{safe_name}.txt"
            if not txt_file.exists():
                return self._json_error(404, f'说明书 "{manual}" 不存在')

            txt_file.unlink()

            # 从顺序表中移除
            manuals_dir = get_manuals_dir(filename)
            current_order = _sync_manual_order(manuals_dir)
            if safe_name in current_order:
                current_order.remove(safe_name)
                _save_manual_order(manuals_dir, current_order)

            print(f'[MAERS] 删除说明书：{txt_file}')
            self._json_ok({'success': True})

        except json.JSONDecodeError:
            self._json_error(400, '无效的 JSON 数据')
        except Exception as e:
            print(f'[MAERS] 删除说明书错误：{e}')
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

                    # 同步重命名 manuals 目录（在模块目录内）
                    old_manuals = get_manuals_dir(filename)
                    new_module_dir = get_module_dir(new_filename)
                    if old_manuals.exists() and new_module_dir != get_module_dir(filename):
                        new_manuals = new_module_dir / 'manuals'
                        new_manuals.parent.mkdir(parents=True, exist_ok=True)
                        old_manuals.rename(new_manuals)

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

            # 删除 manuals 目录（若存在）
            import shutil
            manuals_dir = get_manuals_dir(filename)
            if manuals_dir.exists():
                shutil.rmtree(manuals_dir)

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
            manual      = data.get('manual', '').strip()

            # ── 验证 ────────────────────────────
            if not name:
                return self._json_error(400, "模块名称不能为空")
            if not manual:
                return self._json_error(400, "游戏说明书名称不能为空")

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

            # ── 创建模块目录和 manuals 子目录 ────
            module_dir = get_module_dir(filename)
            manuals_dir = module_dir / 'manuals'
            manuals_dir.mkdir(parents=True, exist_ok=True)

            # 创建初始说明书 txt 文件
            try:
                safe_manual = safe_manual_name(manual)
            except ValueError as ve:
                return self._json_error(400, str(ve))
            initial_txt = manuals_dir / f"{safe_manual}.txt"
            initial_txt.write_text('', encoding='utf-8')

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

            print(f"[MAERS] 创建模块：{filename}（说明书：{safe_manual}）")
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
