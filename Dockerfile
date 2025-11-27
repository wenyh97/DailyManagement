# 使用官方 Python 基础镜像
FROM python:3.10-slim

# 设置工作目录
WORKDIR /app

# 复制依赖文件
COPY backend/requirements.txt ./

# 安装依赖
RUN pip install --no-cache-dir -r requirements.txt

# 复制后端代码
COPY backend/ ./

# 暴露端口
EXPOSE 5000

# 启动 Flask 应用（推荐用 gunicorn，适合生产环境）
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "app:app"]