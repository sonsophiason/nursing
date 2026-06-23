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

// PDF 파일 경로 (실제 배포 시 pdf/your-file.pdf 경로에 파일을 두어야 함)
const PDF_URL = 'assets/lecture.pdf';

async function initViewer() {
    try {
        const loadingTask = pdfjsLib.getDocument(PDF_URL);
        pdfDoc = await loadingTask.promise;
        
        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
            await renderPage(pageNum);
        }
    } catch (error) {
        console.error('PDF 로드 에러:', error);
        viewerContainer.innerHTML = '<div style="color:white; padding:20px;">PDF 파일을 찾을 수 없습니다. assets 폴더에 lecture.pdf 파일을 넣어주세요.</div>';
    }
}

async function renderPage(pageNum) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.5 });

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
        viewerContainer.style.overflow = 'auto';
    } else {
        if (tool === 'brush') btnBrush.classList.add('active');
        if (tool === 'eraser') btnEraser.classList.add('active');
        document.querySelectorAll('.drawing-canvas').forEach(c => c.style.pointerEvents = 'auto');
        viewerContainer.style.overflow = 'hidden'; // 그리기 중 스크롤 방지
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

// 초기화 실행
initViewer();
