/* static/js/custom-modal.js (최종 'cat' 덮어쓰기 - 로드 타이밍 수정) */

$(document).ready(function() {
    
    let postViewActive = false;
    let keyBuffer = [];
    let terminalInstance = null; // 터미널 인스턴스를 전역으로 관리

    // --- 1. 터미널 인스턴스와 'cat' 명령어가 모두 로드될 때까지 대기 ---
    const findCatCommand = setInterval(() => {
        const terminalElement = $('.terminal');
        
        if (terminalElement.length > 0) {
            const term = terminalElement.data('terminal');
            
            // (핵심) term이 존재하고, 'cat' 명령어가 함수로 로드되었는지 확인
            if (term && typeof term.cat === 'function') {
                
                // --- 2. 드디어 'cat'을 덮어씁니다. ---
                clearInterval(findCatCommand); // 대기 중단
                terminalInstance = term; // 인스턴스 저장
                
                overrideCatCommand(term); // 덮어쓰기 실행
                setupKeyListeners(); // :q 리스너 실행
            }
        }
    }, 100); // 100ms마다 계속 확인

    // --- 3. 'cat' 명령어 덮어쓰기 ---
    function overrideCatCommand(term) {
        
        // (A) 테마의 기존 'cat' 기능을 백업합니다.
        const originalCat = term.cat;

        // (B) 'cat' 명령어를 우리 새 기능으로 '교체'합니다.
        term.cat = async (args) => {
            if (!args || args.length === 0) {
                if (originalCat) return originalCat.call(term, args);
                return;
            }

            const slug = args[0];
            const postUrl = `/posts/${slug}/`; // 사용자님의 '/posts/' 경로

            try {
                // (C) 먼저 무조건 fetch를 시도합니다.
                await fetchAndShowPost(postUrl, slug); 
            
            } catch (error) {
                // (D) fetch에 실패하면(404), 원래 'cat' 기능을 실행합니다.
                if (originalCat) {
                    return originalCat.call(term, args);
                } else {
                    term.error(`'${slug}' not found.`);
                }
            }
        };
    }

    // --- 4. 포스트 가져오기 및 "Word for Mac" 뷰 생성 ---
    async function fetchAndShowPost(postUrl, postTitle) {
        const response = await fetch(postUrl);
        if (!response.ok) {
            throw new Error(`File not found at ${postUrl} (Status: ${response.status})`);
        }
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const postContentElement = doc.querySelector('article') || doc.querySelector('main') || doc.body;

        const postOverlay = document.createElement('div');
        postOverlay.className = 'vim-post-overlay';
        postOverlay.style.position = 'fixed';
        postOverlay.style.top = '0';
        postOverlay.style.left = '0';
        postOverlay.style.width = '100vw';
        postOverlay.style.height = '100vh';
        postOverlay.style.zIndex = '9998';
        postOverlay.style.background = '#ccc'; 

        postOverlay.innerHTML = `
            <div class="window active" style="width: 100%; height: 100%; margin: 0; border-radius: 0;">
                <div class="title-bar">
                    <div class="title-bar-text">${postTitle} (Read Only)</div>
                    <div class="title-bar-controls"></div>
                </div>
                <div class="window-body" style="height: calc(100% - 28px); display: flex; flex-direction: column;">
                    <div class="post-content-wrapper" style="flex-grow: 1; overflow-y: auto; padding: 15px; background: white; color: black;">
                        ${postContentElement.innerHTML}
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(postOverlay);
        postViewActive = true; 

        if (window.renderMathInElement) {
            window.renderMathInElement(postOverlay.querySelector('.post-content-wrapper'), {
                delimiters: [
                    {left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false}
                ]
            });
        }
    }

    // --- 5. ':q' 키보드 리스너 설정 ---
    function setupKeyListeners() {
        document.addEventListener('keydown', (e) => {
            if (!postViewActive) return;
            if (e.key === 'Shift') return;
            if (e.key === ':') {
                keyBuffer = [':'];
                e.preventDefault(); 
                return;
            }
            if (e.key.toLowerCase() === 'q' && keyBuffer[0] === ':') {
                keyBuffer.push('q');
                if (keyBuffer.join('') === ':q') {
                    closePostView();
                    e.preventDefault();
                }
                return;
            }
            keyBuffer = [];
        });
    }

    // --- 6. 뷰 닫기 헬퍼 함수 ---
    function closePostView() {
        const postOverlay = document.querySelector('.vim-post-overlay');
        if (postOverlay) postOverlay.remove();
        postViewActive = false;
        keyBuffer = [];
        if (terminalInstance) terminalInstance.focus(); // 저장된 인스턴스로 포커스 복귀
    }
});