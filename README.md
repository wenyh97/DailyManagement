# Daily Management Web App

这是一个基于Python Flask和原生JavaScript构建的网页版日常管理工具。

## 功能

*   **日常管理**: 基于34金币法则的表格视图。
*   **灵感收集**: 快速记录想法。
*   **事件管理**: 可自定义标签、颜色、时间等。
*   **分数系统**: 完成事件可获得分数。
*   **统计分析**: 提供多种图表进行数据分析。

## 如何运行

### 后端

1.  确保你已经安装了 Python 和 PDM。
2.  在 `backend` 目录下, 运行 `pdm install` 来安装依赖。
3.  运行 `pdm run python app.py` 来启动后端服务。

### 前端

1.  直接在浏览器中打开 `frontend/index.html` 文件。

## 项目结构

```
/
|-- backend/
|   |-- app.py
|-- frontend/
|   |-- index.html
|   |-- css/
|   |   |-- style.css
|   |-- js/
|       |-- main.js
|-- pyproject.toml
|-- README.md
```
