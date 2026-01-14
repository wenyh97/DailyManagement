# 使用官方 Python 基础镜像
FROM python:3.10-slim

# 先复制依赖并安装
WORKDIR /app
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# 再复制后端代码到固定路径，避免包结构被打平
COPY backend ./backend

# 设置 Python 模块搜索路径，确保可通过 backend.* 导入
ENV PYTHONPATH=/app

# 切换到 backend 目录以保持相对导入
WORKDIR /app/backend

# 暴露端口
EXPOSE 5000

# 启动 Flask 应用（推荐用 gunicorn，适合生产环境）
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "app:app"]