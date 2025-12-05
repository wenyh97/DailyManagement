from backend.src.app import app  # 从 src.app 导入已配置好的 Flask 应用实例


if __name__ == "__main__":  # 仅在直接运行此文件时执行
    app.run(debug=True)  # 启动开发服务器以便本地调试
