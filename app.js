const pdfjsLib = window["pdfjs-dist/build/pdf"];
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const viewerContainer = document.getElementById("viewer-container");
const btnPan = document.getElementById("btn-pan");
const btnBrush = document.getElementById("btn-brush");
const btnEraser = document.getElementById("btn-eraser");
const btnClear = document.getElementById("btn-clear");

let pdfDoc = null;
let currentTool = "pan"; // pan, brush, eraser
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

const renderedPages = new Set(); // 렌더링된 페이지 번호를 추적
const pageDivs = []; // 모든 페이지 div 요소를 저장

// PDF 파일 경로 (실제 배포 시 pdf/your-file.pdf 경로에 파일을 두어야 함)
const PDF_URL = "assets/lecture.pdf";

async function initViewer() {
    try {
        const loadingTask = pdfjsLib.getDocument(PDF_URL);
        pdfDoc = await loadingTask.promise;

        // 모든 페이지에 대한 플레이스홀더 생성
        await createPagePlaceholders();
        
        // 초기 렌더링 및 화면 맞춤
        await renderVisiblePages();
        applyTransform();

        // 화면 크기 변경 (회전 포함) 감지
        window.addEventListener("resize", debounce(handleResizeAndRender, 200));

    } catch (error) {
        console.error("PDF 로드 에러:", error);
        viewerContainer.innerHTML = 
            "<div style=\"color:white; padding:20px;\">PDF 파일을 찾을 수 없습니다. assets 폴더에 lecture.pdf 파일을 넣어주세요.</div>";
    }
}

async function createPagePlaceholders() {
    viewerContainer.innerHTML = ""; // 기존 페이지 제거
    pageDivs.length = 0; // 배열 초기화
    renderedPages.clear(); // 렌더링된 페이지 목록 초기화

    if (!pdfDoc) return;

    const firstPage = await pdfDoc.getPage(1);
    const viewport = firstPage.getViewport({ scale: 1 });
    const containerWidth = viewerContainer.clientWidth;
    
    // 화면 너비에 맞게 초기 스케일 계산
    scale = containerWidth / viewport.width;
    lastScale = scale;

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const pageDiv = document.createElement("div");
        pageDiv.className = "page-container";
        pageDiv.id = `page-${pageNum}`;
        // 초기에는 높이만 설정하여 스크롤 가능하게 함
        pageDiv.style.width = `${viewport.width * scale}px`;
        pageDiv.style.height = `${viewport.height * scale}px`;
        pageDiv.dataset.pageNum = pageNum; // 페이지 번호 저장
        viewerContainer.appendChild(pageDiv);
        pageDivs.push(pageDiv);
        observer.observe(pageDiv); // Intersection Observer에 등록
    }
}

async function renderPage(pageNum) {
    if (renderedPages.has(pageNum)) return; // 이미 렌더링된 페이지는 다시 렌더링하지 않음

    const pageDiv = document.getElementById(`page-${pageNum}`);
    if (!pageDiv) return;

    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: scale });

    // 기존 내용 제거 (플레이스홀더만 남김)
    pageDiv.innerHTML = ""; 
    pageDiv.style.width = `${viewport.width}px`;
    pageDiv.style.height = `${viewport.height}px`;

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = {
        canvasContext: context,
        viewport: viewport
    };

    pageDiv.appendChild(canvas);
    
    // 필기용 캔버스 추가
    const drawingCanvas = document.createElement("canvas");
    drawingCanvas.className = "drawing-canvas";
    drawingCanvas.width = viewport.width;
    drawingCanvas.height = viewport.height;
    pageDiv.appendChild(drawingCanvas);

    await page.render(renderContext).promise;
    setupDrawing(drawingCanvas); // 필기 기능 설정
    renderedPages.add(pageNum); // 렌더링 완료 표시
}

// Intersection Observer 설정
const observer = new IntersectionObserver(async (entries) => {
    for (const entry of entries) {
        if (entry.isIntersecting) {
            const pageNum = parseInt(entry.target.dataset.pageNum);
            // 현재 보이는 페이지와 주변 페이지를 렌더링
            for (let i = Math.max(1, pageNum - 2); i <= Math.min(pdfDoc.numPages, pageNum + 2); i++) {
                await renderPage(i);
            }
        } else {
            // 화면에서 벗어난 페이지는 메모리 해제 (선택 사항, 복잡도 증가)
            // 현재는 렌더링된 상태 유지하여 스크롤 시 재렌더링 방지
        }
    }
}, { root: viewerContainer, rootMargin: "200px 0px" }); // 뷰포트 상하 200px 여유 공간

async function renderVisiblePages() {
    if (!pdfDoc) return;

    // 모든 페이지의 스케일을 업데이트
    const firstPage = await pdfDoc.getPage(1);
    const viewport = firstPage.getViewport({ scale: 1 });
    const containerWidth = viewerContainer.clientWidth;
    scale = containerWidth / viewport.width;
    lastScale = scale;

    pageDivs.forEach(pageDiv => {
        const pageNum = parseInt(pageDiv.dataset.pageNum);
        const newViewport = firstPage.getViewport({ scale: scale }); // 모든 페이지에 동일한 스케일 적용
        pageDiv.style.width = `${newViewport.width}px`;
        pageDiv.style.height = `${newViewport.height}px`;

        // 이미 렌더링된 페이지는 스케일만 업데이트
        if (renderedPages.has(pageNum)) {
            const canvas = pageDiv.querySelector("canvas:not(.drawing-canvas)");
            const drawingCanvas = pageDiv.querySelector(".drawing-canvas");
            if (canvas && drawingCanvas) {
                canvas.height = newViewport.height;
                canvas.width = newViewport.width;
                drawingCanvas.height = newViewport.height;
                drawingCanvas.width = newViewport.width;
                // PDF.js 렌더링 컨텍스트를 다시 생성하여 페이지를 다시 그립니다.
                pdfDoc.getPage(pageNum).then(page => {
                    const renderContext = {
                        canvasContext: canvas.getContext("2d"),
                        viewport: newViewport
                    };
                    page.render(renderContext);
                });
            }
        }
    });

    // 현재 보이는 페이지들을 다시 렌더링 (Intersection Observer가 처리)
    // 강제로 모든 페이지를 다시 렌더링하지 않고, observer가 감지하도록 함
}

async function handleResizeAndRender() {
    renderedPages.clear(); // 모든 페이지를 다시 렌더링할 준비
    await createPagePlaceholders(); // 플레이스홀더 다시 생성 (스케일 재계산 포함)
    // Intersection Observer가 자동으로 보이는 페이지를 렌더링할 것임
}

function setupDrawing(canvas) {
    const ctx = canvas.getContext("2d");
    
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
        if (currentTool === "pan") return;
        isDrawing = true;
        const pos = getPos(e);
        lastX = pos.x;
        lastY = pos.y;
    }

    function draw(e) {
        if (!isDrawing || currentTool === "pan") return;
        e.preventDefault();
        const pos = getPos(e);

        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(pos.x, pos.y);
        
        if (currentTool === "brush") {
            ctx.globalCompositeOperation = "source-over";
            ctx.strokeStyle = "rgba(255, 0, 0, 0.5)";
            ctx.lineWidth = 3;
            ctx.lineCap = "round";
            ctx.stroke();
        } else if (currentTool === "eraser") {
            ctx.globalCompositeOperation = "destination-out";
            ctx.lineWidth = 20;
            ctx.stroke();
        }

        lastX = pos.x;
        lastY = pos.y;
    }

    function stopDrawing() {
        isDrawing = false;
    }

    canvas.addEventListener("mousedown", startDrawing);
    canvas.addEventListener("mousemove", draw);
    window.addEventListener("mouseup", stopDrawing);

    canvas.addEventListener("touchstart", startDrawing, { passive: false });
    canvas.addEventListener("touchmove", draw, { passive: false });
    canvas.addEventListener("touchend", stopDrawing);
}

// 툴 선택 로직
function setActiveTool(tool) {
    currentTool = tool;
    [btnPan, btnBrush, btnEraser].forEach(btn => btn.classList.remove("active"));
    
    if (tool === "pan") {
        btnPan.classList.add("active");
        document.querySelectorAll(".drawing-canvas").forEach(c => c.style.pointerEvents = "none");
        viewerContainer.style.overflow = "auto"; 
    } else {
        if (tool === "brush") btnBrush.classList.add("active");
        if (tool === "eraser") btnEraser.classList.add("active");
        document.querySelectorAll(".drawing-canvas").forEach(c => c.style.pointerEvents = "auto");
        viewerContainer.style.overflow = "hidden"; 
    }
}

btnPan.onclick = () => setActiveTool("pan");
btnBrush.onclick = () => setActiveTool("brush");
btnEraser.onclick = () => setActiveTool("eraser");
btnClear.onclick = () => {
    if (confirm("모든 메모를 삭제하시겠습니까?")) {
        document.querySelectorAll(".drawing-canvas").forEach(canvas => {
            const ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        });
    }
};

// 유출 방지: 키보드 단축키 차단 (Ctrl+S, Ctrl+P 등)
window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && ["s", "p", "c", "u"].includes(e.key.toLowerCase())) {
        e.preventDefault();
        alert("보안 정책상 저장 및 인쇄가 금지되어 있습니다.");
    }
});

// 핀치 줌 및 패닝 로직
viewerContainer.addEventListener("touchstart", (e) => {
    if (currentTool !== "pan") return;
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

viewerContainer.addEventListener("touchmove", (e) => {
    if (currentTool !== "pan") return;
    e.preventDefault(); // 기본 스크롤/줌 동작 방지

    if (e.touches.length === 2) { // 핀치 줌
        if (initialPinchDistance === null) return;
        const currentPinchDistance = getPinchDistance(e);
        scale = lastScale * (currentPinchDistance / initialPinchDistance);
        scale = Math.max(0.5, Math.min(scale, 5.0)); // 최소 0.5배, 최대 5배 줌 제한
        applyTransform();
    } else if (e.touches.length === 1 && isPanning) { // 패닝
        translateX = e.touches[0].clientX - startX;
        translateY = e.touches[0].clientY - translateY;
        applyTransform();
    }
}, { passive: false });

viewerContainer.addEventListener("touchend", () => {
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
    viewerContainer.style.transformOrigin = "0 0";
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
setActiveTool("pan"); // 초기 도구는 이동/확대
