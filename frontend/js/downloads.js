(function () {
    const metadataUrl = 'downloads/metadata/desktop-latest.json';

    const versionEl = document.getElementById('desktop-version');
    const publishedEl = document.getElementById('desktop-published');
    const installerEl = document.getElementById('desktop-installer');
    const notesEl = document.getElementById('desktop-notes');
    const statusEl = document.getElementById('desktop-status');
    const downloadButton = document.getElementById('desktop-download-button');
    const latestButton = document.getElementById('desktop-latest-button');

    function setUnavailable(message) {
        versionEl.textContent = '未发布';
        publishedEl.textContent = '待发布';
        installerEl.textContent = '尚未生成';
        statusEl.textContent = message;
        notesEl.innerHTML = `<li>${escapeHtml(message)}</li>`;
        downloadButton.textContent = '安装包准备中';
        latestButton.textContent = '最新稳定下载';
        downloadButton.classList.add('disabled');
        latestButton.classList.add('disabled');
        downloadButton.setAttribute('aria-disabled', 'true');
        latestButton.setAttribute('aria-disabled', 'true');
        downloadButton.removeAttribute('href');
        latestButton.removeAttribute('href');
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatTime(value) {
        try {
            return new Date(value).toLocaleString('zh-CN', {
                year: 'numeric',
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            return value || '未知';
        }
    }

    function applyDownloadLink(element, href, label) {
        if (!href) {
            element.classList.add('disabled');
            element.setAttribute('aria-disabled', 'true');
            element.textContent = label;
            element.removeAttribute('href');
            return;
        }

        element.href = href;
        element.textContent = label;
        element.classList.remove('disabled');
        element.removeAttribute('aria-disabled');
    }

    async function loadDesktopMetadata() {
        try {
            const response = await fetch(metadataUrl, { cache: 'no-store' });
            if (!response.ok) {
                throw new Error('桌面版安装包暂时还没有发布');
            }

            const metadata = await response.json();
            versionEl.textContent = `v${metadata.version || '未标记'}`;
            publishedEl.textContent = formatTime(metadata.publishedAt);
            installerEl.textContent = metadata.installerName || '未命名';
            statusEl.textContent = '可直接下载安装';

            const notes = Array.isArray(metadata.notes) && metadata.notes.length
                ? metadata.notes
                : ['当前版本暂无补充说明。'];

            notesEl.innerHTML = notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('');

            applyDownloadLink(downloadButton, metadata.downloadUrl, '下载当前版本');
            applyDownloadLink(latestButton, metadata.latestDownloadUrl || metadata.downloadUrl, '下载最新稳定版');
        } catch (error) {
            setUnavailable(error.message || '桌面版安装包暂时还没有发布');
        }
    }

    setUnavailable('桌面版安装包暂时还没有发布');
    loadDesktopMetadata();
})();