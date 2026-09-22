// --- DOM REFERENCES ---
const dock = document.getElementById('studio-dock');
const dragHandle = document.getElementById('drag-handle');
const pdfCanvas = document.getElementById('pdf-layer');
const inkCanvas = document.getElementById('ink-layer');
const liveCanvas = document.getElementById('live-layer');

const pdfCtx = pdfCanvas.getContext('2d');
const inkCtx = inkCanvas.getContext('2d', { desynchronized: true });
const liveCtx = liveCanvas.getContext('2d', { desynchronized: true });

const brushSlider = document.getElementById('brush-slider');
const brushLabel = document.getElementById('brush-size-label');
const customColor = document.getElementById('custom-color-input');
const pageNumInput = document.getElementById('page-num-input');
const pageTotalLabel = document.getElementById('page-total-label');

const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnAdd = document.getElementById('btn-add-page');
const btnDup = document.getElementById('btn-dup-page');
const btnClearPage = document.getElementById('btn-clear-page');
const btnDelPage = document.getElementById('btn-del-page');
const btnTheme = document.getElementById('btn-theme-toggle');
const btnDeleteSelected = document.getElementById('btn-delete-selected');
const btnUndo = document.getElementById('btn-undo');
const btnHide = document.getElementById('btn-hide-ui');
const btnShortcuts = document.getElementById('btn-shortcuts-toggle');
const shortcutsModal = document.getElementById('shortcuts-modal');
const btnCloseModal = document.getElementById('btn-close-modal');

const btnToggleDrawer = document.getElementById('btn-toggle-drawer');
const slideDrawer = document.getElementById('slide-drawer');
const btnCloseDrawer = document.getElementById('btn-close-drawer');
const thumbnailsGrid = document.getElementById('thumbnails-grid');

const btnImport = document.getElementById('btn-import-pdf');
const btnExport = document.getElementById('btn-export-pdf');
const pdfInput = document.getElementById('pdf-file-input');

// --- APP STATE & INDEPENDENT TOOL SIZES ---
let activeIndex = 0;
let notebook = [
    { strokes: [], pdfBg: null }
];

let activeTool = 'pen'; // 'pen' | 'highlighter' | 'eraser' | 'select' | 'text' | 'line' | 'arrow' | 'axes' | 'rect' | 'circle'
let curColor = '#default';
let currentTheme = 'dark';
let selectedStrokesIndices = new Set();

const toolSizes = {
    pen: 3,
    highlighter: 24,
    eraser: 20,
    shapes: 3
};

if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

document.body.className = `theme-${currentTheme}`;

// --- DYNAMIC EDGE-TO-EDGE RESIZE (ZERO-SCROLL) ---
function resizeStage() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    [pdfCanvas, inkCanvas, liveCanvas].forEach(c => {
        c.width = w;
        c.height = h;
    });
    fullRepaint();
}
window.addEventListener('resize', resizeStage);

function getCurrentToolSize() {
    if (activeTool === 'pen') return toolSizes.pen;
    if (activeTool === 'highlighter') return toolSizes.highlighter;
    if (activeTool === 'eraser') return toolSizes.eraser;
    return toolSizes.shapes;
}

function setCurrentToolSize(val) {
    const clamped = Math.max(1, Math.min(60, val));
    if (activeTool === 'pen') toolSizes.pen = clamped;
    else if (activeTool === 'highlighter') toolSizes.highlighter = clamped;
    else if (activeTool === 'eraser') toolSizes.eraser = clamped;
    else toolSizes.shapes = clamped;

    brushSlider.value = clamped;
    brushLabel.textContent = `${clamped}px`;
}

function syncBrushControls() {
    const size = getCurrentToolSize();
    brushSlider.value = size;
    brushLabel.textContent = `${size}px`;
}

function getEffectiveColor(color) {
    if (color === '#default') {
        return currentTheme === 'dark' ? '#f4f4f5' : '#18181b';
    }
    return color;
}

// --- RENDER ENGINE ---
function fullRepaint() {
    pdfCtx.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);
    inkCtx.clearRect(0, 0, inkCanvas.width, inkCanvas.height);

    const page = notebook[activeIndex];

    if (page && page.pdfBg) {
        const img = new Image();
        img.src = page.pdfBg;
        img.onload = () => pdfCtx.drawImage(img, 0, 0, pdfCanvas.width, pdfCanvas.height);
    }

    if (page && page.strokes) {
        for (let i = 0; i < page.strokes.length; i++) {
            const isSelected = selectedStrokesIndices.has(i);
            drawSingleStroke(inkCtx, page.strokes[i], isSelected);
        }
    }

    pageNumInput.value = activeIndex + 1;
    pageTotalLabel.textContent = `/ ${notebook.length}`;
}

function drawSingleStroke(ctx, s, isSelected = false) {
    ctx.save();
    const effectiveColor = getEffectiveColor(s.color);

    if (isSelected) {
        ctx.shadowColor = '#3b82f6';
        ctx.shadowBlur = 8;
    }

    if (s.type === 'pen') {
        ctx.strokeStyle = isSelected ? '#3b82f6' : effectiveColor;
        ctx.fillStyle = ctx.strokeStyle;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (s.points.length === 1) {
            ctx.beginPath();
            ctx.arc(s.points[0].x, s.points[0].y, s.points[0].w / 2, 0, Math.PI * 2);
            ctx.fill();
        } else {
            for (let i = 1; i < s.points.length; i++) {
                ctx.lineWidth = s.points[i].w;
                ctx.beginPath();
                ctx.moveTo(s.points[i - 1].x, s.points[i - 1].y);
                ctx.lineTo(s.points[i].x, s.points[i].y);
                ctx.stroke();
            }
        }
    } else if (s.type === 'highlighter') {
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = isSelected ? '#3b82f6' : effectiveColor;
        ctx.lineWidth = s.width;
        ctx.lineCap = 'square';
        ctx.beginPath();
        for (let i = 1; i < s.points.length; i++) {
            ctx.moveTo(s.points[i - 1].x, s.points[i - 1].y);
            ctx.lineTo(s.points[i].x, s.points[i].y);
        }
        ctx.stroke();
    } else if (s.type === 'rect') {
        ctx.strokeStyle = isSelected ? '#3b82f6' : effectiveColor;
        ctx.lineWidth = s.width;
        ctx.strokeRect(s.x, s.y, s.w, s.h);
    } else if (s.type === 'circle') {
        ctx.strokeStyle = isSelected ? '#3b82f6' : effectiveColor;
        ctx.lineWidth = s.width;
        ctx.beginPath();
        ctx.ellipse(s.cx, s.cy, Math.abs(s.rx), Math.abs(s.ry), 0, 0, Math.PI * 2);
        ctx.stroke();
    } else if (s.type === 'line') {
        ctx.strokeStyle = isSelected ? '#3b82f6' : effectiveColor;
        ctx.lineWidth = s.width;
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
        ctx.stroke();
    } else if (s.type === 'arrow') {
        ctx.strokeStyle = isSelected ? '#3b82f6' : effectiveColor;
        ctx.fillStyle = ctx.strokeStyle;
        ctx.lineWidth = s.width;
        drawArrow(ctx, s.x1, s.y1, s.x2, s.y2, s.width);
    } else if (s.type === 'axes') {
        ctx.strokeStyle = isSelected ? '#3b82f6' : effectiveColor;
        ctx.lineWidth = s.width;
        drawAxes(ctx, s.x1, s.y1, s.x2, s.y2);
    } else if (s.type === 'text') {
        ctx.fillStyle = isSelected ? '#3b82f6' : effectiveColor;
        ctx.font = '18px monospace';
        ctx.textBaseline = 'top';
        s.lines.forEach((l, idx) => ctx.fillText(l, s.x, s.y + (idx * 22)));
    }

    ctx.restore();
}

// Redesigned arrowhead geometry: minimum 18px length, bold triangle tip
function drawArrow(ctx, fromx, fromy, tox, toy, strokeWidth) {
    const angle = Math.atan2(toy - fromy, tox - fromx);
    const headlen = Math.max(18, strokeWidth * 4.5);
    const arrowSpread = Math.PI / 6.5;

    // Draw primary shaft
    ctx.beginPath();
    ctx.moveTo(fromx, fromy);
    ctx.lineTo(tox, toy);
    ctx.stroke();

    // Draw filled arrowhead tip
    ctx.beginPath();
    ctx.moveTo(tox, toy);
    ctx.lineTo(tox - headlen * Math.cos(angle - arrowSpread), toy - headlen * Math.sin(angle - arrowSpread));
    ctx.lineTo(tox - (headlen * 0.75) * Math.cos(angle), toy - (headlen * 0.75) * Math.sin(angle));
    ctx.lineTo(tox - headlen * Math.cos(angle + arrowSpread), toy - headlen * Math.sin(angle + arrowSpread));
    ctx.closePath();
    ctx.fill();
}

function drawAxes(ctx, x1, y1, x2, y2) {
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    ctx.beginPath();
    ctx.moveTo(x1, midY);
    ctx.lineTo(x2, midY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(midX, y1);
    ctx.lineTo(midX, y2);
    ctx.stroke();
}

// --- POINTER / STYLUS PIPELINE ---
let isDrawing = false;
let currentStroke = null;
let lastPt = null;
let startPt = null;

liveCanvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const pt = { x: e.clientX, y: e.clientY };

    if (activeTool === 'text') {
        spawnTextBox(pt.x, pt.y);
        return;
    }

    isDrawing = true;
    liveCanvas.setPointerCapture(e.pointerId);
    startPt = pt;
    lastPt = pt;

    const pressure = e.pressure > 0 ? e.pressure : 0.5;

    if (activeTool === 'pen') {
        const w = toolSizes.pen * (pressure * 1.5);
        currentStroke = { type: 'pen', color: curColor, points: [{ x: pt.x, y: pt.y, w }] };
        liveCtx.fillStyle = getEffectiveColor(curColor);
        liveCtx.beginPath();
        liveCtx.arc(pt.x, pt.y, w / 2, 0, Math.PI * 2);
        liveCtx.fill();
    } else if (activeTool === 'highlighter') {
        currentStroke = { type: 'highlighter', color: curColor, width: toolSizes.highlighter, points: [pt] };
    } else if (activeTool === 'eraser') {
        eraseAtPoint(pt.x, pt.y, toolSizes.eraser);
    } else if (activeTool === 'select') {
        selectedStrokesIndices.clear();
        btnDeleteSelected.classList.add('hidden');
        fullRepaint();
    }
});

liveCanvas.addEventListener('pointermove', (e) => {
    if (!isDrawing) return;

    if (activeTool === 'eraser') {
        const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
        for (let sub of events) eraseAtPoint(sub.clientX, sub.clientY, toolSizes.eraser);
        return;
    }

    if (activeTool === 'pen' || activeTool === 'highlighter') {
        const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];

        for (let sub of events) {
            const pt = { x: sub.clientX, y: sub.clientY };
            const pressure = sub.pressure > 0 ? sub.pressure : 0.5;

            liveCtx.save();
            if (activeTool === 'pen') {
                const w = toolSizes.pen * (pressure * 1.5);
                currentStroke.points.push({ x: pt.x, y: pt.y, w });
                liveCtx.strokeStyle = getEffectiveColor(curColor);
                liveCtx.lineWidth = w;
                liveCtx.lineCap = 'round';
                liveCtx.lineJoin = 'round';
                liveCtx.beginPath();
                liveCtx.moveTo(lastPt.x, lastPt.y);
                liveCtx.lineTo(pt.x, pt.y);
                liveCtx.stroke();
            } else if (activeTool === 'highlighter') {
                currentStroke.points.push(pt);
                liveCtx.globalAlpha = 0.45;
                liveCtx.strokeStyle = getEffectiveColor(curColor);
                liveCtx.lineWidth = currentStroke.width;
                liveCtx.lineCap = 'square';
                liveCtx.beginPath();
                liveCtx.moveTo(lastPt.x, lastPt.y);
                liveCtx.lineTo(pt.x, pt.y);
                liveCtx.stroke();
            }
            liveCtx.restore();
            lastPt = pt;
        }
    } else if (activeTool === 'select') {
        liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
        liveCtx.strokeStyle = '#3b82f6';
        liveCtx.lineWidth = 1;
        liveCtx.setLineDash([6, 6]);
        liveCtx.strokeRect(startPt.x, startPt.y, e.clientX - startPt.x, e.clientY - startPt.y);
        liveCtx.setLineDash([]);
    } else {
        liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
        liveCtx.strokeStyle = getEffectiveColor(curColor);
        liveCtx.fillStyle = liveCtx.strokeStyle;
        liveCtx.lineWidth = toolSizes.shapes;

        if (activeTool === 'line') {
            liveCtx.beginPath();
            liveCtx.moveTo(startPt.x, startPt.y);
            liveCtx.lineTo(e.clientX, e.clientY);
            liveCtx.stroke();
        } else if (activeTool === 'arrow') {
            drawArrow(liveCtx, startPt.x, startPt.y, e.clientX, e.clientY, toolSizes.shapes);
        } else if (activeTool === 'axes') {
            drawAxes(liveCtx, startPt.x, startPt.y, e.clientX, e.clientY);
        } else if (activeTool === 'rect') {
            liveCtx.strokeRect(startPt.x, startPt.y, e.clientX - startPt.x, e.clientY - startPt.y);
        } else if (activeTool === 'circle') {
            const rx = (e.clientX - startPt.x) / 2;
            const ry = (e.clientY - startPt.y) / 2;
            liveCtx.beginPath();
            liveCtx.ellipse(startPt.x + rx, startPt.y + ry, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
            liveCtx.stroke();
        }
    }
});

const finishStroke = (e) => {
    if (!isDrawing) return;
    isDrawing = false;
    try { liveCanvas.releasePointerCapture(e.pointerId); } catch (_) {}

    const pt = { x: e.clientX, y: e.clientY };

    if (activeTool === 'select') {
        const xMin = Math.min(startPt.x, pt.x);
        const xMax = Math.max(startPt.x, pt.x);
        const yMin = Math.min(startPt.y, pt.y);
        const yMax = Math.max(startPt.y, pt.y);

        selectedStrokesIndices.clear();
        notebook[activeIndex].strokes.forEach((s, idx) => {
            if (isStrokeInsideBox(s, xMin, yMin, xMax, yMax)) {
                selectedStrokesIndices.add(idx);
            }
        });

        if (selectedStrokesIndices.size > 0) btnDeleteSelected.classList.remove('hidden');
        liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
        fullRepaint();
        return;
    }

    let finalStroke = null;

    if (activeTool === 'pen' || activeTool === 'highlighter') {
        finalStroke = currentStroke;
    } else if (activeTool === 'line') {
        finalStroke = { type: 'line', color: curColor, width: toolSizes.shapes, x1: startPt.x, y1: startPt.y, x2: pt.x, y2: pt.y };
    } else if (activeTool === 'arrow') {
        finalStroke = { type: 'arrow', color: curColor, width: toolSizes.shapes, x1: startPt.x, y1: startPt.y, x2: pt.x, y2: pt.y };
    } else if (activeTool === 'axes') {
        finalStroke = { type: 'axes', color: curColor, width: toolSizes.shapes, x1: startPt.x, y1: startPt.y, x2: pt.x, y2: pt.y };
    } else if (activeTool === 'rect') {
        finalStroke = { type: 'rect', color: curColor, width: toolSizes.shapes, x: startPt.x, y: startPt.y, w: pt.x - startPt.x, h: pt.y - startPt.y };
    } else if (activeTool === 'circle') {
        const rx = (pt.x - startPt.x) / 2;
        const ry = (pt.y - startPt.y) / 2;
        finalStroke = { type: 'circle', color: curColor, width: toolSizes.shapes, cx: startPt.x + rx, cy: startPt.y + ry, rx: rx, ry: ry };
    }

    if (finalStroke) {
        notebook[activeIndex].strokes.push(finalStroke);
        drawSingleStroke(inkCtx, finalStroke);
        if (typeof savePageData === 'function') {
            savePageData(`slide-${activeIndex}`, notebook[activeIndex]);
        }
    }

    liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
    currentStroke = null;
    startPt = null;
    lastPt = null;
};

liveCanvas.addEventListener('pointerup', finishStroke);
liveCanvas.addEventListener('pointercancel', finishStroke);

// --- SELECTION HIT TEST ---
function isStrokeInsideBox(s, xMin, yMin, xMax, yMax) {
    if (s.type === 'pen' || s.type === 'highlighter') {
        return s.points.some(p => p.x >= xMin && p.x <= xMax && p.y >= yMin && p.y <= yMax);
    } else if (s.type === 'rect') {
        return s.x >= xMin && s.x + s.w <= xMax && s.y >= yMin && s.y + s.h <= yMax;
    } else if (s.type === 'line' || s.type === 'arrow' || s.type === 'axes') {
        return (s.x1 >= xMin && s.x1 <= xMax && s.y1 >= yMin && s.y1 <= yMax) ||
               (s.x2 >= xMin && s.x2 <= xMax && s.y2 >= yMin && s.y2 <= yMax);
    } else if (s.type === 'circle') {
        return s.cx >= xMin && s.cx <= xMax && s.cy >= yMin && s.cy <= yMax;
    } else if (s.type === 'text') {
        return s.x >= xMin && s.x <= xMax && s.y >= yMin && s.y <= yMax;
    }
    return false;
}

btnDeleteSelected.addEventListener('click', () => {
    notebook[activeIndex].strokes = notebook[activeIndex].strokes.filter((_, idx) => !selectedStrokesIndices.has(idx));
    selectedStrokesIndices.clear();
    btnDeleteSelected.classList.add('hidden');
    fullRepaint();
    if (typeof savePageData === 'function') {
        savePageData(`slide-${activeIndex}`, notebook[activeIndex]);
    }
});

// --- POINT ERASER ---
function eraseAtPoint(x, y, radius) {
    const page = notebook[activeIndex];
    const initialLen = page.strokes.length;

    page.strokes = page.strokes.filter(s => {
        if (s.type === 'pen' || s.type === 'highlighter') {
            return !s.points.some(p => Math.hypot(p.x - x, p.y - y) < radius);
        } else if (s.type === 'rect') {
            return !(x >= s.x - radius && x <= s.x + s.w + radius && y >= s.y - radius && y <= s.y + s.h + radius);
        } else if (s.type === 'circle') {
            return Math.hypot(x - s.cx, y - s.cy) > (Math.max(Math.abs(s.rx), Math.abs(s.ry)) + radius);
        } else if (s.type === 'line' || s.type === 'arrow' || s.type === 'axes') {
            return Math.hypot(x - s.x1, y - s.y1) > radius && Math.hypot(x - s.x2, y - s.y2) > radius;
        }
        return true;
    });

    if (page.strokes.length !== initialLen) {
        fullRepaint();
        if (typeof savePageData === 'function') {
            savePageData(`slide-${activeIndex}`, notebook[activeIndex]);
        }
    }
}

// --- TEXT BOX ---
function spawnTextBox(x, y) {
    const box = document.createElement('textarea');
    box.className = 'canvas-text-box';
    box.style.left = `${x}px`;
    box.style.top = `${y}px`;
    box.style.color = getEffectiveColor(curColor);
    box.style.width = '200px';
    box.style.height = '40px';

    document.getElementById('board-container').appendChild(box);
    setTimeout(() => box.focus(), 10);

    const commit = () => {
        const val = box.value.trim();
        if (val) {
            const stroke = { type: 'text', color: curColor, x, y, lines: val.split('\n') };
            notebook[activeIndex].strokes.push(stroke);
            drawSingleStroke(inkCtx, stroke);
            if (typeof savePageData === 'function') {
                savePageData(`slide-${activeIndex}`, notebook[activeIndex]);
            }
        }
        box.remove();
    };

    box.addEventListener('blur', commit);
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') commit(); });
}

// --- DIRECT JUMP PAGE INPUT ---
pageNumInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        let val = parseInt(pageNumInput.value, 10);
        if (isNaN(val)) val = 1;
        val = Math.max(1, Math.min(notebook.length, val));
        activeIndex = val - 1;
        selectedStrokesIndices.clear();
        btnDeleteSelected.classList.add('hidden');
        fullRepaint();
        pageNumInput.blur();
    }
});

// --- THUMBNAIL DRAWER ---
function renderThumbnails() {
    thumbnailsGrid.innerHTML = '';
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = window.innerWidth;
    tempCanvas.height = window.innerHeight;
    const tempCtx = tempCanvas.getContext('2d');

    notebook.forEach((page, idx) => {
        tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
        tempCtx.fillStyle = currentTheme === 'dark' ? '#121214' : '#fbfbfb';
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

        if (page.pdfBg) {
            const img = new Image();
            img.src = page.pdfBg;
            tempCtx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);
        }
        for (let s of page.strokes) drawSingleStroke(tempCtx, s);

        const card = document.createElement('div');
        card.className = `thumb-card ${idx === activeIndex ? 'active' : ''}`;

        const wrap = document.createElement('div');
        wrap.className = 'thumb-preview-wrap';
        const img = document.createElement('img');
        img.className = 'thumb-preview-img';
        img.src = tempCanvas.toDataURL('image/jpeg', 0.5);

        wrap.appendChild(img);
        card.appendChild(wrap);

        const label = document.createElement('div');
        label.className = 'thumb-label';
        label.textContent = `Slide ${idx + 1}`;
        card.appendChild(label);

        card.addEventListener('click', () => {
            activeIndex = idx;
            selectedStrokesIndices.clear();
            btnDeleteSelected.classList.add('hidden');
            fullRepaint();
            slideDrawer.classList.add('hidden');
        });

        thumbnailsGrid.appendChild(card);
    });
}

btnToggleDrawer.addEventListener('click', () => {
    renderThumbnails();
    slideDrawer.classList.toggle('hidden');
});
btnCloseDrawer.addEventListener('click', () => slideDrawer.classList.add('hidden'));

// --- PAGE ACTIONS ---
function addNewPage() {
    notebook.splice(activeIndex + 1, 0, { strokes: [], pdfBg: null });
    activeIndex++;
    selectedStrokesIndices.clear();
    btnDeleteSelected.classList.add('hidden');
    fullRepaint();
}

function duplicateCurrentPage() {
    const clone = JSON.parse(JSON.stringify(notebook[activeIndex]));
    notebook.splice(activeIndex + 1, 0, clone);
    activeIndex++;
    selectedStrokesIndices.clear();
    btnDeleteSelected.classList.add('hidden');
    fullRepaint();
}

btnAdd.addEventListener('click', addNewPage);
btnDup.addEventListener('click', duplicateCurrentPage);

btnClearPage.addEventListener('click', () => {
    notebook[activeIndex].strokes = [];
    selectedStrokesIndices.clear();
    btnDeleteSelected.classList.add('hidden');
    fullRepaint();
    if (typeof savePageData === 'function') {
        savePageData(`slide-${activeIndex}`, notebook[activeIndex]);
    }
});

btnDelPage.addEventListener('click', () => {
    if (notebook.length === 1) {
        notebook[0] = { strokes: [], pdfBg: null };
    } else {
        notebook.splice(activeIndex, 1);
        if (activeIndex >= notebook.length) activeIndex = notebook.length - 1;
    }
    selectedStrokesIndices.clear();
    btnDeleteSelected.classList.add('hidden');
    fullRepaint();
});

btnPrev.addEventListener('click', () => {
    if (activeIndex > 0) {
        activeIndex--;
        selectedStrokesIndices.clear();
        btnDeleteSelected.classList.add('hidden');
        fullRepaint();
    }
});

btnNext.addEventListener('click', () => {
    if (activeIndex < notebook.length - 1) {
        activeIndex++;
        selectedStrokesIndices.clear();
        btnDeleteSelected.classList.add('hidden');
        fullRepaint();
    }
});

btnUndo.addEventListener('click', () => {
    if (notebook[activeIndex].strokes.length > 0) {
        notebook[activeIndex].strokes.pop();
        selectedStrokesIndices.clear();
        btnDeleteSelected.classList.add('hidden');
        fullRepaint();
        if (typeof savePageData === 'function') {
            savePageData(`slide-${activeIndex}`, notebook[activeIndex]);
        }
    }
});

btnTheme.addEventListener('click', () => {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.body.className = `theme-${currentTheme}`;
    fullRepaint();
});

// --- TOOL SWITCHING & INDEPENDENT SIZES ---
const toolList = ['pen', 'highlighter', 'eraser', 'select', 'text', 'line', 'arrow', 'axes', 'rect', 'circle'];
toolList.forEach(tool => {
    const b = document.getElementById(`tool-${tool}`);
    if (b) {
        b.addEventListener('click', () => {
            toolList.forEach(t => {
                const el = document.getElementById(`tool-${t}`);
                if (el) el.classList.remove('active');
            });
            b.classList.add('active');
            activeTool = tool;
            syncBrushControls();
        });
    }
});

brushSlider.addEventListener('input', (e) => {
    setCurrentToolSize(parseInt(e.target.value, 10));
});

document.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        curColor = swatch.dataset.color;
        if (curColor !== '#default') customColor.value = curColor;
    });
});

customColor.addEventListener('input', (e) => {
    curColor = e.target.value;
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
});

// --- DOCK DRAGGING ---
let isDraggingDock = false;
let dockOffset = { x: 0, y: 0 };

dragHandle.addEventListener('pointerdown', (e) => {
    isDraggingDock = true;
    dragHandle.setPointerCapture(e.pointerId);
    const r = dock.getBoundingClientRect();
    dockOffset.x = e.clientX - r.left;
    dockOffset.y = e.clientY - r.top;
});

window.addEventListener('pointermove', (e) => {
    if (!isDraggingDock) return;
    dock.style.left = `${e.clientX - dockOffset.x}px`;
    dock.style.top = `${e.clientY - dockOffset.y}px`;
    dock.style.transform = 'none';
});

window.addEventListener('pointerup', () => isDraggingDock = false);
btnHide.addEventListener('click', () => dock.classList.toggle('recording-hidden'));

// --- KEYBOARD SHORTCUTS ENGINE ---
btnShortcuts.addEventListener('click', () => shortcutsModal.classList.toggle('hidden'));
btnCloseModal.addEventListener('click', () => shortcutsModal.classList.add('hidden'));

window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;

    const k = e.key.toLowerCase();
    
    // Page Duplication (Ctrl+D / Meta+D)
    if ((e.ctrlKey || e.metaKey) && k === 'd') {
        e.preventDefault();
        duplicateCurrentPage();
        return;
    }

    // Undo (Ctrl+Z)
    if ((e.ctrlKey || e.metaKey) && k === 'z') {
        e.preventDefault();
        btnUndo.click();
        return;
    }

    if (k === 'n') { addNewPage(); }
    else if (k === 'h') { dock.classList.toggle('recording-hidden'); }
    else if (k === 'd') { btnTheme.click(); }
    else if (k === '?') { shortcutsModal.classList.toggle('hidden'); }
    else if (k === 'p') { document.getElementById('tool-pen').click(); }
    else if (k === 'm') { document.getElementById('tool-highlighter').click(); }
    else if (k === 'e') { document.getElementById('tool-eraser').click(); }
    else if (k === 's') { document.getElementById('tool-select').click(); }
    else if (k === 't') { document.getElementById('tool-text').click(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedStrokesIndices.size > 0) btnDeleteSelected.click();
    } else if (e.key === 'ArrowLeft') { btnPrev.click(); }
    else if (e.key === 'ArrowRight') { btnNext.click(); }
    else if (e.key === '[') {
        setCurrentToolSize(getCurrentToolSize() - 2);
    } else if (e.key === ']') {
        setCurrentToolSize(getCurrentToolSize() + 2);
    }
});

// --- PDF IMPORT / EXPORT (EDGE-TO-EDGE) ---
btnImport.addEventListener('click', () => pdfInput.click());

pdfInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    btnImport.textContent = '...';
    try {
        const buf = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        notebook = [];

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const vp = page.getViewport({ scale: window.innerWidth / page.getViewport({ scale: 1 }).width });

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = window.innerWidth;
            tempCanvas.height = window.innerHeight;
            const tempCtx = tempCanvas.getContext('2d');

            await page.render({ canvasContext: tempCtx, viewport: vp }).promise;

            notebook.push({
                strokes: [],
                pdfBg: tempCanvas.toDataURL('image/png')
            });
        }

        activeIndex = 0;
        fullRepaint();
    } catch (_) { alert('PDF Import failed'); }
    finally { btnImport.textContent = '📂'; pdfInput.value = ''; }
});

btnExport.addEventListener('click', async () => {
    btnExport.textContent = '...';
    try {
        const { PDFDocument } = PDFLib;
        const pdfDoc = await PDFDocument.create();

        for (let i = 0; i < notebook.length; i++) {
            const pageData = notebook[i];
            const expCanvas = document.createElement('canvas');
            expCanvas.width = window.innerWidth;
            expCanvas.height = window.innerHeight;
            const expCtx = expCanvas.getContext('2d');

            expCtx.fillStyle = currentTheme === 'dark' ? '#121214' : '#fbfbfb';
            expCtx.fillRect(0, 0, expCanvas.width, expCanvas.height);

            if (pageData.pdfBg) {
                const img = new Image();
                img.src = pageData.pdfBg;
                await new Promise(r => { img.onload = r; });
                expCtx.drawImage(img, 0, 0, expCanvas.width, expCanvas.height);
            }

            for (let s of pageData.strokes) drawSingleStroke(expCtx, s);

            const img = await pdfDoc.embedPng(expCanvas.toDataURL('image/png'));
            const p = pdfDoc.addPage([expCanvas.width, expCanvas.height]);
            p.drawImage(img, { x: 0, y: 0, width: expCanvas.width, height: expCanvas.height });
        }

        const bytes = await pdfDoc.save();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        a.download = `lecture_${Date.now()}.pdf`;
        a.click();
    } catch (_) { alert('Export failed'); }
    finally { btnExport.textContent = '💾'; }
});

// --- PWA SERVICE WORKER REGISTRATION ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('SW Registered:', reg.scope))
            .catch(err => console.error('SW Registration Failed:', err));
    });
}

// --- BOOT INITIAL SETUP ---
syncBrushControls();
resizeStage();