const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const viewerContainer = document.getElementById('viewer-container');
const btnPan = document.getElementById('btn-pan');
const btnBrush = document.getElementById('btn-brush');
const btnEraser = document.getElementById('btn-eraser');
const btnClear = document.getElementById('btn-clear');

let pdfDoc = null;
let currentTool = 'pan'; // pan, brush, eraser
let isDrawing = false;
let lastX = 0;
let lastY = 0;

// Zoom and Pan variables
let scale = 1.0;
let translateX = 0;
let translateY = 0;
let initialPinchDistance = null;
let lastScale = 1.0;
let lastTranslateX = 0;
let lastTranslateY = 0;
let isPanning = false;
let startX = 0;
let startY = 0;

// PDF 파일 경로 (실제 배포 시 pdf/your-file.pdf 경로에 파일을 두어야 함)
const PDF_URL = 'assets/lecture.pdf';

async function initViewer() {
    try {
        const loadingTask = pdfjsLib.getDocument(PDF_URL);
        pdfDoc = await loadingTask.promise;
        
        // 초기 렌더링 시 화면에 맞게 스케일 조정
        await renderAllPages();
        applyTransform();

        // 화면 크기 변경 (회전 포함) 감지
        window.addEventListener('resize', debounce(renderAllPages, 200));

    } catch (error) {
        console.error('PDF 로드 에러:', error);
        viewerContainer.innerHTML = '<div style="color:white; padding:20px;">PDF 파일을 찾을 수 없습니다. assets 폴더에 lecture.pdf 파일을 넣어주세요.</div>';
    }
}

async function renderAllPages() {
    viewerContainer.innerHTML = ''; // 기존 페이지 제거
    scale = 1.0; // 스케일 초기화
    translateX = 0;
    translateY = 0;
    applyTransform();

    if (!pdfDoc) return;

    const firstPage = await pdfDoc.getPage(1);
    const viewport = firstPage.getViewport({ scale: 1 });
    const containerWidth = viewerContainer.clientWidth;
    
    // 화면 너비에 맞게 초기 스케일 계산
    scale = containerWidth / viewport.width;
    lastScale = scale;

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        await renderPage(pageNum, scale);
    }
}

async function renderPage(pageNum, currentScale) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: currentScale });

    const pageDiv = document.createElement('div');
    pageDiv.className = 'page-container';
    pageDiv.style.width = `${viewport.width}px`;
    pageDiv.style.height = `${viewport.height}px`;
    pageDiv.id = `page-${pageNum}`;

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = {
        canvasContext: context,
        viewport: viewport
    };

    pageDiv.appendChild(canvas);
    
    // 필기용 캔버스 추가
    const drawingCanvas = document.createElement('canvas');
    drawingCanvas.className = 'drawing-canvas';
    drawingCanvas.width = viewport.width;
    drawingCanvas.height = viewport.height;
    pageDiv.appendChild(drawingCanvas);

    viewerContainer.appendChild(pageDiv);
    await page.render(renderContext).promise;

    setupDrawing(drawingCanvas);
}

function setupDrawing(canvas) {
    const ctx = canvas.getContext('2d');
    
    function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches ? e.touches[0] : e;
        // 현재 줌 상태를 고려하여 좌표 계산
        return {
            x: (touch.clientX - rect.left) * (canvas.width / rect.width),
            y: (touch.clientY - rect.top) * (canvas.height / rect.height)
        };
    }

    function startDrawing(e) {
        if (currentTool === 'pan') return;
        isDrawing = true;
        const pos = getPos(e);
        lastX = pos.x;
        lastY = pos.y;
    }

    function draw(e) {
        if (!isDrawing || currentTool === 'pan') return;
        e.preventDefault();
        const pos = getPos(e);

        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(pos.x, pos.y);
        
        if (currentTool === 'brush') {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.stroke();
        } else if (currentTool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.lineWidth = 20;
            ctx.stroke();
        }

        lastX = pos.x;
        lastY = pos.y;
    }

    function stopDrawing() {
        isDrawing = false;
    }

    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    window.addEventListener('mouseup', stopDrawing);

    canvas.addEventListener('touchstart', startDrawing, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', stopDrawing);
}

// 툴 선택 로직
function setActiveTool(tool) {
    currentTool = tool;
    [btnPan, btnBrush, btnEraser].forEach(btn => btn.classList.remove('active'));
    
    if (tool === 'pan') {
        btnPan.classList.add('active');
        document.querySelectorAll('.drawing-canvas').forEach(c => c.style.pointerEvents = 'none');
        // Pan 모드에서는 뷰어 컨테이너의 오버플로우를 auto로 설정하여 스크롤 가능하게 함
        viewerContainer.style.overflow = 'auto'; 
    } else {
        if (tool === 'brush') btnBrush.classList.add('active');
        if (tool === 'eraser') btnEraser.classList.add('active');
        document.querySelectorAll('.drawing-canvas').forEach(c => c.style.pointerEvents = 'auto');
        // 그리기 모드에서는 뷰어 컨테이너의 오버플로우를 hidden으로 설정하여 스크롤 방지
        viewerContainer.style.overflow = 'hidden'; 
    }
}

btnPan.onclick = () => setActiveTool('pan');
btnBrush.onclick = () => setActiveTool('brush');
btnEraser.onclick = () => setActiveTool('eraser');
btnClear.onclick = () => {
    if (confirm('모든 메모를 삭제하시겠습니까?')) {
        document.querySelectorAll('.drawing-canvas').forEach(canvas => {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        });
    }
};

// 유출 방지: 키보드 단축키 차단 (Ctrl+S, Ctrl+P 등)
window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && ['s', 'p', 'c', 'u'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        alert('보안 정책상 저장 및 인쇄가 금지되어 있습니다.');
    }
});

// 핀치 줌 및 패닝 로직
viewerContainer.addEventListener('touchstart', (e) => {
    if (currentTool !== 'pan') return;
    if (e.touches.length === 2) { // 두 손가락 핀치 줌
        initialPinchDistance = getPinchDistance(e);
        lastScale = scale;
        isPanning = false;
    } else if (e.touches.length === 1) { // 한 손가락 패닝
        isPanning = true;
        startX = e.touches[0].clientX - translateX;
        startY = e.touches[0].clientY - translateY;
    }
}, { passive: false });

viewerContainer.addEventListener('touchmove', (e) => {
    if (currentTool !== 'pan') return;
    e.preventDefault(); // 기본 스크롤/줌 동작 방지

    if (e.touches.length === 2) { // 핀치 줌
        if (initialPinchDistance === null) return;
        const currentPinchDistance = getPinchDistance(e);
        scale = lastScale * (currentPinchDistance / initialPinchDistance);
        scale = Math.max(0.5, Math.min(scale, 5.0)); // 최소 0.5배, 최대 5배 줌 제한
        applyTransform();
    } else if (e.touches.length === 1 && isPanning) { // 패닝
        translateX = e.touches[0].clientX - startX;
        translateY = e.touches[0].clientY - startY;
        applyTransform();
    }
}, { passive: false });

viewerContainer.addEventListener('touchend', () => {
    initialPinchDistance = null;
    isPanning = false;
    lastScale = scale;
    lastTranslateX = translateX;
    lastTranslateY = translateY;
});

function getPinchDistance(e) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function applyTransform() {
    viewerContainer.style.transform = `scale(${scale}) translate(${translateX / scale}px, ${translateY / scale}px)`;
    viewerContainer.style.transformOrigin = '0 0';
}

// 디바운스 함수 (리사이즈 이벤트 과도한 호출 방지)
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

// 초기화 실행
initViewer();
setActiveTool('pan'); // 초기 도구는 이동/확대
