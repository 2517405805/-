const REMOTE_FILE_PATH = "data.json";
const LOCAL_STORAGE_KEY = "my_wiki_data";
const LOCAL_CONF_KEY = "gh_wiki_conf";
let config = { owner: '', repo: '', token: '' };
let library = [];
let fileSha = null;
let currentBookId = null;
let currentChapId = null;
window.onload = () => {
    loadFromLocal();
    const localConf = localStorage.getItem(LOCAL_CONF_KEY);
    if (localConf) {
        config = JSON.parse(localConf);
        updateConnectionStatus(true);
        syncFromCloud();
    } else {
        updateConnectionStatus(false);
        if (library.length === 0) initDefaultData();
    }
};
function initDefaultData() {
    library = [{
        id: 'b_local', title: '本地笔记本', isOpen: true,
        chapters: [{ id: 'c_local', title: '开始', content: '<p>这是离线模式。</p>' }]
    }];
    render();
    saveToLocal();
}
function loadFromLocal() {
    const localStr = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (localStr) {
        try {
            library = JSON.parse(localStr);
            render();
        } catch (e) { console.error("本地数据错误", e); }
    }
}
function saveToLocal() {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(library));
}
async function syncFromCloud() {
    showLoading(true);
    const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${REMOTE_FILE_PATH}`;
    try {
        const res = await fetch(url, { headers: { 'Authorization': `token ${config.token}` } });
        if (res.status === 404) {
            console.log("云端无文件");
        } else if (res.ok) {
            const data = await res.json();
            fileSha = data.sha;
            const content = decodeURIComponent(escape(window.atob(data.content.replace(/\n/g, ""))));
            const remoteLibrary = JSON.parse(content);
            const mergeResult = mergeLibraries(library, remoteLibrary);
            if (mergeResult.addedCount > 0) {
                library = mergeResult.mergedList;
                saveToLocal();
                render();
                alert(`同步完成！\n增加了 ${mergeResult.newBooks} 本新书\n发现了 ${mergeResult.conflicts} 个冲突副本`);
            } else {
                console.log("数据一致，无需更新");
            }
        }
    } catch (e) {
        console.error("同步失败", e);
    } finally {
        showLoading(false);
        resetSaveButtonState(true);
    }
}
function mergeLibraries(localList, remoteList) {
    let merged = [...localList];
    let newBooks = 0;
    let conflicts = 0;
    remoteList.forEach(remoteBook => {
        const localBook = merged.find(b => b.id === remoteBook.id);
        if (!localBook) {
            merged.push(remoteBook);
            newBooks++;
        } else {
            const localStr = JSON.stringify(localBook);
            const remoteStr = JSON.stringify(remoteBook);
            if (localStr !== remoteStr) {
                let conflictBook = JSON.parse(remoteStr);
                conflictBook.id = 'b_conflict_' + Date.now() + Math.random().toString(36).substr(2, 5);
                conflictBook.title = remoteBook.title + ' [云端副本]';
                merged.push(conflictBook);
                conflicts++;
            }
        }
    });
    return { mergedList: merged, addedCount: newBooks + conflicts, newBooks, conflicts };
}
async function handleSaveClick() {
    saveToLocal();
    if (config.token && config.owner) {
        await saveToGithub();
    } else {
        resetSaveButtonState(true, "已保存到本地");
    }
}
async function saveToGithub() {
    const btn = document.getElementById('btn-sync');
    btn.innerHTML = '⏳ 正在上传...';
    btn.className = 'saving';
    const jsonStr = JSON.stringify(library, null, 2);
    const contentBase64 = window.btoa(unescape(encodeURIComponent(jsonStr)));
    const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${REMOTE_FILE_PATH}`;
    const body = {
        message: "Wiki Update " + new Date().toLocaleString(),
        content: contentBase64,
        sha: fileSha
    };
    try {
        const res = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${config.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        if (res.ok) {
            const data = await res.json();
            fileSha = data.content.sha;
            resetSaveButtonState(true, "☁️ 双端同步成功");
        } else {
            const err = await res.json();
            if (res.status === 409) {
                alert("上传失败：云端数据已变化，请刷新页面合并后再保存。");
            } else {
                alert("上传失败: " + (err.message || res.statusText));
            }
            resetSaveButtonState(false);
        }
    } catch (e) {
        alert("网络错误，仅保存到本地。");
        resetSaveButtonState(false);
    }
}
function markAsUnsaved() {
    const btn = document.getElementById('btn-sync');
    btn.classList.add('unsaved');
    btn.classList.remove('saving');
    btn.innerHTML = config.token ? '💾 点击保存并上传' : '💾 点击保存本地';
    const dot = document.getElementById('unsaved-dot');
    if (dot) dot.style.display = 'inline';
}
function resetSaveButtonState(success, msg) {
    const btn = document.getElementById('btn-sync');
    const dot = document.getElementById('unsaved-dot');
    btn.classList.remove('saving');
    if (success) {
        btn.classList.remove('unsaved');
        btn.innerHTML = msg || (config.token ? '☁️ 已同步' : '💾 已存本地');
        if (dot) dot.style.display = 'none';
        setTimeout(() => {
            btn.innerHTML = config.token ? '☁️ 保存并上传' : '💾 保存到本地';
        }, 2000);
    }
}
function updateConnectionStatus(isOnline) {
    const el = document.getElementById('connection-status');
    if (isOnline) {
        el.innerText = '在线模式';
        el.style.background = '#d1fae5'; el.style.color = '#065f46';
    } else {
        el.innerText = '离线模式';
        el.style.background = '#f3f4f6'; el.style.color = '#6b7280';
    }
}
function render() {
    const list = document.getElementById('bookList');
    list.innerHTML = '';
    const keyword = document.getElementById('search').value.toLowerCase();
    library.forEach(book => {
        let showBook = book.title.toLowerCase().includes(keyword);
        const visibleChaps = book.chapters.filter(c => c.title.toLowerCase().includes(keyword));
        if (visibleChaps.length > 0) showBook = true;
        if (!showBook && keyword) return;
        const li = document.createElement('div');
        li.className = `book-group ${book.isOpen || keyword ? 'open' : ''}`;
        li.innerHTML = `
            <div class="book-header" onclick="toggleBook('${book.id}')">
                <span>${book.isOpen ? '📂' : '📁'} ${book.title}</span>
                <div>
                    <span class="btn-add" onclick="event.stopPropagation();addChapter('${book.id}')" style="font-size:0.8rem; margin-right:5px;">+</span>
                    <span class="del-btn" onclick="event.stopPropagation();delBook('${book.id}')">删</span>
                </div>
            </div>`;
        const ul = document.createElement('div');
        ul.className = 'chapter-list';
        (keyword ? visibleChaps : book.chapters).forEach(chap => {
            const item = document.createElement('div');
            item.className = `chapter-item ${currentChapId === chap.id ? 'active' : ''}`;
            item.onclick = () => loadDoc(book.id, chap.id);
            item.innerHTML = `<span>📄 ${chap.title}</span><span class="del-btn" onclick="event.stopPropagation();delChap('${book.id}','${chap.id}')">删</span>`;
            ul.appendChild(item);
        });
        li.appendChild(ul);
        list.appendChild(li);
    });
}
function addBook() {
    const t = prompt("请输入新书架名称：");
    if (t) {
        const bid = 'b' + Date.now();
        const cid = 'c' + Date.now();
        library.push({
            id: bid,
            title: t,
            isOpen: true,
            chapters: [{ id: cid, title: '首页', content: '' }]
        });
        render();
        loadDoc(bid, cid);
        markAsUnsaved();
    }
}
function addChapter(bid) {
    const t = prompt("请输入文章标题：");
    if (t) {
        const b = library.find(x => x.id === bid);
        const cid = 'c' + Date.now();
        b.chapters.push({ id: cid, title: t, content: '' });
        b.isOpen = true;
        render();
        loadDoc(bid, cid);
        markAsUnsaved();
    }
}
function toggleBook(bid) {
    const b = library.find(x => x.id === bid);
    b.isOpen = !b.isOpen;
    render();
}
function delBook(bid) {
    if (confirm('确定删除整本书?')) {
        library = library.filter(b => b.id !== bid);
        if (currentBookId === bid) hideEditor();
        render();
        markAsUnsaved();
    }
}
function delChap(bid, cid) {
    if (confirm('确定删除此文章?')) {
        const b = library.find(x => x.id === bid);
        b.chapters = b.chapters.filter(c => c.id !== cid);
        if (currentChapId === cid) hideEditor();
        render();
        markAsUnsaved();
    }
}
function loadDoc(bid, cid) {
    currentBookId = bid;
    currentChapId = cid;
    const b = library.find(x => x.id === bid);
    const c = b.chapters.find(x => x.id === cid);
    document.getElementById('empty-tips').style.display = 'none';
    document.getElementById('editor').style.display = 'flex';
    document.getElementById('cur-book-name').innerText = b.title;
    document.getElementById('doc-title').value = c.title;
    document.getElementById('doc-content').innerHTML = c.content;
    render();
}
function hideEditor() {
    document.getElementById('editor').style.display = 'none';
    document.getElementById('empty-tips').style.display = 'block';
}
document.getElementById('doc-title').addEventListener('input', (e) => {
    if (currentBookId) {
        library.find(b => b.id === currentBookId).chapters.find(c => c.id === currentChapId).title = e.target.value;
        markAsUnsaved();
    }
});
document.getElementById('doc-content').addEventListener('input', (e) => {
    if (currentBookId) {
        library.find(b => b.id === currentBookId).chapters.find(c => c.id === currentChapId).content = e.target.innerHTML;
        markAsUnsaved();
    }
});
document.getElementById('doc-content').addEventListener('paste', function (e) {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") === 0) {
            e.preventDefault(); 
            const blob = items[i].getAsFile();
            compressImage(blob, (base64) => {
                document.execCommand('insertImage', false, base64);
                document.getElementById('doc-content').dispatchEvent(new Event('input'));
            });
        }
    }
});
function compressImage(file, callback) {
    const reader = new FileReader();
    reader.onload = function (event) {
        const img = new Image();
        img.src = event.target.result;
        img.onload = function () {
            const maxWidth = 1000; 
            const quality = 0.7;   
            let w = img.width;
            let h = img.height;
            if (w > maxWidth) {
                h = Math.round(h * (maxWidth / w));
                w = maxWidth;
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            callback(canvas.toDataURL('image/jpeg', quality));
        };
    };
    reader.readAsDataURL(file);
}
function openConfig() {
    document.getElementById('configModal').style.display = 'flex';
    document.getElementById('conf-owner').value = config.owner;
    document.getElementById('conf-repo').value = config.repo;
    document.getElementById('conf-token').value = config.token;
}
function closeConfig() {
    document.getElementById('configModal').style.display = 'none';
}
async function saveConfig() {
    const owner = document.getElementById('conf-owner').value.trim();
    const repo = document.getElementById('conf-repo').value.trim();
    const token = document.getElementById('conf-token').value.trim();
    if (owner && repo && token) {
        config = { owner, repo, token };
        localStorage.setItem(LOCAL_CONF_KEY, JSON.stringify(config));
        updateConnectionStatus(true);
        closeConfig();
        await syncFromCloud();
    } else {
        alert("请填写完整");
    }
}
function disconnectGithub() {
    if (confirm("断开后仅保存本地?")) {
        localStorage.removeItem(LOCAL_CONF_KEY);
        config = { owner: '', repo: '', token: '' };
        updateConnectionStatus(false);
        closeConfig();
    }
}
function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
}
function formatDoc(cmd, value = null) {
    if (value) {
        document.execCommand(cmd, false, value);
    } else {
        document.execCommand(cmd);
    }
    const contentDiv = document.getElementById('doc-content');
    contentDiv.focus();
    contentDiv.dispatchEvent(new Event('input'));
}
function toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('wiki_theme', next);
}
(function initTheme() {
    const saved = localStorage.getItem('wiki_theme');
    if (saved) {
        document.documentElement.setAttribute('data-theme', saved);
    }
})();
document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault(); 
        console.log("触发快捷键保存");
        handleSaveClick(); 
    }
});
document.getElementById('doc-content').addEventListener('keydown', function (e) {
    if (e.key === 'Tab') {
        e.preventDefault(); 
        document.execCommand('insertHTML', false, '&emsp;');
    }
});
let selectedImgSrc = null; 
let selectedImgNode = null; 
const ctxMenu = document.getElementById('img-context-menu');
const editorContent = document.getElementById('doc-content');
editorContent.addEventListener('contextmenu', function (e) {
    if (e.target.tagName === 'IMG') {
        e.preventDefault(); 
        selectedImgSrc = e.target.src;
        selectedImgNode = e.target;
        ctxMenu.style.display = 'block';
        ctxMenu.style.left = e.pageX + 'px';
        ctxMenu.style.top = e.pageY + 'px';
    }
});
document.addEventListener('click', function (e) {
    if (e.target.closest('#img-context-menu') === null) {
        ctxMenu.style.display = 'none';
    }
});
function downloadSelectedImage() {
    if (!selectedImgSrc) return;
    const a = document.createElement('a');
    a.href = selectedImgSrc;
    a.download = `image_${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    ctxMenu.style.display = 'none';
}
function deleteSelectedImage() {
    if (selectedImgNode) {
        selectedImgNode.remove();
        editorContent.dispatchEvent(new Event('input'));
    }
    ctxMenu.style.display = 'none';
}