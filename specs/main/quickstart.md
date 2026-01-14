# Quickstart – Annual Planning Feature

1. **Start backend API**
   ```powershell
   cd F:/TonyCode/DailyManagement/backend
   set FLASK_APP=app:create_app
   flask run
   ```
   - Requires Python 3.10+ and the dependencies in `backend/requirements.txt`.
   - Ensure MySQL is running; update `.env` with `MYSQL_*` values before launching.

2. **Serve the frontend**
   ```powershell
   cd F:/TonyCode/DailyManagement/frontend
   npx serve .
   ```
   - Any static server works; the HTML files reference relative JS/CSS bundles.

3. **Log in**
   - Use an existing JWT-enabled account (register via `/frontend/register.html` if needed).
   - Confirm the header shows your username and the service health badge is green.

4. **Open the new tab group**
   - Navigate to the first navigation button (now labeled “任务管理”).
   - Ensure the sub-tabs “年度规划 / 目标执行 / 任务管理” render before the previous inspiration board.

5. **Create a plan**
   - Click “+ 添加规划”.
   - Fill **规划 / 规划描述 / 分值设定** and add at least one goal row (`目标`, `目标详情`, `预计时间`).
   - The modal shows “还剩 X 分” beside the score field; try allocating 30 points and observe the counter drop to 70.

6. **Verify API state**
   - `GET /api/plans` should return your plan with nested goals and `remaining_score`.
   - Attempt to add another plan pushing the total over 100; expect a 409 response and UI error toast.

7. **Execute a goal**
   - Expand the plan accordion and click “执行” next to one goal.
   - The goal should move to the “目标执行” tab list with quick actions to convert into calendar events (future hook to `EventManager`).

8. **Regression checks**
   - Ensure the legacy “灵感 → 任务管理” list still supports add/edit/sort.
   - Calendar and statistics tabs should continue to load without JS errors (watch console).
