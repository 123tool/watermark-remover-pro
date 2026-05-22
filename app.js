document.addEventListener('DOMContentLoaded', () => {
    // --- WORKSPACE & LAYER DOM ELEMENTS ---
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');
    const editorInterface = document.getElementById('editorInterface');
    const mainCanvas = document.getElementById('mainCanvas');
    const maskCanvas = document.getElementById('maskCanvas');
    const beforeCanvas = document.getElementById('beforeCanvas');
    const splitSliderContainer = document.getElementById('splitSliderContainer');
    const splitHandle = document.getElementById('splitHandle');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');

    // --- CONTROLS & CONFIGURATION DOM ELEMENTS ---
    const btnModes = document.querySelectorAll('.btn-mode');
    const subPanels = document.querySelectorAll('.sub-panel');
    const sensitivityRange = document.getElementById('sensitivityRange');
    const sensitivityVal = document.getElementById('sensitivityVal');
    const colorTolerance = document.getElementById('colorTolerance');
    const toleranceVal = document.getElementById('toleranceVal');
    const brushSize = document.getElementById('brushSize');
    const brushVal = document.getElementById('brushVal');
    const colorPreview = document.getElementById('colorPreview');
    const btnTogglePicker = document.getElementById('btnTogglePicker');
    const toggleDither = document.getElementById('toggleDither');

    // --- ACTION BUTTONS ---
    const btnRunAuto = document.getElementById('btnRunAuto');
    const btnRunColorMatch = document.getElementById('btnRunColorMatch');
    const btnClearMask = document.getElementById('btnClearMask');
    const btnReset = document.getElementById('btnReset');
    const btnDownload = document.getElementById('btnDownload');
    const btnUndo = document.getElementById('btnUndo');
    const btnRedo = document.getElementById('btnRedo');

    // --- ENGINE APPLICATION STATES ---
    const ctx = mainCanvas.getContext('2d', { willReadFrequently: true });
    const maskCtx = maskCanvas.getContext('2d');
    const beforeCtx = beforeCanvas.getContext('2d');
    
    let originalImage = new Image();
    let currentMode = 'auto'; // Modes: 'auto' | 'color' | 'manual'
    let isDrawing = false;
    let isPickingColor = false;
    let isSliding = false;
    let selectedTargetColor = { r: 255, g: 255, b: 255 }; // Default sampel warna

    // --- HISTORY MANAGER STORAGE (UNDO / REDO) ---
    let undoStack = [];
    let redoStack = [];
    const MAX_HISTORY = 12; // Membatasi konsumsi memori RAM di browser HP

    // --- 1. FILE UPLOAD & MATRIX STORAGE SETUP ---
    uploadZone.addEventListener('click', () => fileInput.click());
    uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.style.borderColor = '#6366f1'; });
    uploadZone.addEventListener('dragleave', () => { uploadZone.style.borderColor = '#334155'; });
    uploadZone.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]); });
    fileInput.addEventListener('change', (e) => { if (e.target.files.length > 0) handleFile(e.target.files[0]); });

    function handleFile(file) {
        if (!file.type.startsWith('image/')) { alert('Gagal: File wajib berformat citra gambar!'); return; }
        showLoading('Menginisialisasi komputasi grafis...');
        const reader = new FileReader();
        reader.onload = (e) => {
            originalImage.onload = () => {
                setupWorkspace();
                hideLoading();
            };
            originalImage.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function setupWorkspace() {
        const w = originalImage.naturalWidth;
        const h = originalImage.naturalHeight;

        // Set dimensi resolusi murni (Lossless) ke seluruh layer canvas
        mainCanvas.width = w; mainCanvas.height = h;
        maskCanvas.width = w; maskCanvas.height = h;
        beforeCanvas.width = w; beforeCanvas.height = h;

        // Render data gambar awal ke canvas utama & canvas pembanding (Sebelum)
        ctx.drawImage(originalImage, 0, 0);
        beforeCtx.drawImage(originalImage, 0, 0);

        clearMask();
        resetHistory();
        saveHistoryState(); // Simpan kondisi awal sebagai checkpoint undo ke-0
        initSplitSlider();

        uploadZone.classList.add('hidden');
        editorInterface.classList.remove('hidden');
    }

    function clearMask() {
        maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    }

    // --- 2. INTERACTIVE BEFORE-VS-AFTER SLIDER LOGIC ---
    function initSplitSlider() {
        splitSliderContainer.style.width = '50%';
        splitHandle.style.left = '50%';
        syncBeforeCanvasSize();
    }

    function syncBeforeCanvasSize() {
        // Memastikan lebar display canvas penampung 'Sebelum' selalu sinkron dengan pembungkus CSS viewport
        beforeCanvas.style.width = mainCanvas.clientWidth + 'px';
        beforeCanvas.style.height = mainCanvas.clientHeight + 'px';
    }

    window.addEventListener('resize', syncBeforeCanvasSize);

    function moveSlider(clientX) {
        const rect = mainCanvas.getBoundingClientRect();
        let posX = clientX - rect.left;
        let percentage = (posX / rect.width) * 100;

        // Validasi boundary agar handle tidak melompat keluar area gambar
        if (percentage < 0) percentage = 0;
        if (percentage > 100) percentage = 100;

        splitSliderContainer.style.width = `${percentage}%`;
        splitHandle.style.left = `${percentage}%`;
    }

    splitHandle.addEventListener('mousedown', () => isSliding = true);
    window.addEventListener('mouseup', () => isSliding = false);
    window.addEventListener('mousemove', (e) => { if (isSliding) moveSlider(e.clientX); });

    // Dukungan interaksi layar sentuh smartphone
    splitHandle.addEventListener('touchstart', () => isSliding = true);
    window.addEventListener('touchend', () => isSliding = false);
    window.addEventListener('touchmove', (e) => { if (isSliding && e.touches[0]) moveSlider(e.touches[0].clientX); });


    // --- 3. UI SIDEBAR MODE SWITCHING & INPUT DISPATCHER ---
    btnModes.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetBtn = e.currentTarget;
            currentMode = targetBtn.dataset.mode;

            btnModes.forEach(b => b.classList.remove('active'));
            targetBtn.classList.add('active');

            subPanels.forEach(p => p.classList.add('hidden'));
            if (currentMode === 'auto') document.getElementById('panelAuto').classList.remove('hidden');
            if (currentMode === 'color') document.getElementById('panelColor').classList.remove('hidden');
            if (currentMode === 'manual') document.getElementById('panelManual').classList.remove('hidden');

            // Matikan mode color picker secara aman jika berpindah tab kontrol
            isPickingColor = false;
            btnTogglePicker.classList.remove('picking');
            clearMask();
        });
    });

    sensitivityRange.addEventListener('input', (e) => sensitivityVal.textContent = e.target.value + '%');
    colorTolerance.addEventListener('input', (e) => toleranceVal.textContent = e.target.value);
    brushSize.addEventListener('input', (e) => brushVal.textContent = e.target.value + 'px');
    btnClearMask.addEventListener('click', clearMask);

    btnReset.addEventListener('click', () => {
        uploadZone.classList.remove('hidden');
        editorInterface.classList.add('hidden');
        fileInput.value = '';
    });


    // --- 4. UNDO & REDO HISTORY ENGINE ---
    function resetHistory() {
        undoStack = [];
        redoStack = [];
        updateHistoryButtons();
    }

    function saveHistoryState() {
        // Melakukan kloning data pixel saat ini ke dalam stack array history memory
        const currentData = ctx.getImageData(0, 0, mainCanvas.width, mainCanvas.height);
        undoStack.push(currentData);
        if (undoStack.length > MAX_HISTORY) undoStack.shift(); // Buang state tertua
        redoStack = []; // Setiap ada aksi manipulasi baru, stack redo wajib dikosongkan
        updateHistoryButtons();
    }

    function updateHistoryButtons() {
        btnUndo.disabled = undoStack.length <= 1;
        btnRedo.disabled = redoStack.length === 0;
    }

    btnUndo.addEventListener('click', () => {
        if (undoStack.length > 1) {
            const currentState = undoStack.pop();
            redoStack.push(currentState);
            const previousState = undoStack[undoStack.length - 1];
            ctx.putImageData(previousState, 0, 0);
            clearMask();
            updateHistoryButtons();
        }
    });

    btnRedo.addEventListener('click', () => {
        if (redoStack.length > 0) {
            const nextState = redoStack.pop();
            ctx.putImageData(nextState, 0, 0);
            undoStack.push(nextState);
            clearMask();
            updateHistoryButtons();
        }
    });


    // --- 5. INTERACTIVE COLOR PICKER SPATIAL ENGINE ---
    btnTogglePicker.addEventListener('click', () => {
        isPickingColor = !isPickingColor;
        btnTogglePicker.classList.toggle('picking', isPickingColor);
    });

    function getCanvasCoordinates(e) {
        const rect = maskCanvas.getBoundingClientRect();
        const scaleX = maskCanvas.width / rect.width;
        const scaleY = maskCanvas.height / rect.height;
        let clientX = e.clientX;
        let clientY = e.clientY;

        if (e.touches && e.touches[0]) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        }
        return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
    }

    maskCanvas.addEventListener('click', (e) => {
        if (!isPickingColor || currentMode !== 'color') return;
        
        const coords = getCanvasCoordinates(e);
        // Mengambil sampel data 1 pixel warna target langsung dari canvas utama
        const pixelSample = ctx.getImageData(Math.floor(coords.x), Math.floor(coords.y), 1, 1).data;
        
        selectedTargetColor.r = pixelSample[0];
        selectedTargetColor.g = pixelSample[1];
        selectedTargetColor.b = pixelSample[2];

        // Tampilkan feedback visual warna terpilih ke panel samping
        colorPreview.style.backgroundColor = `rgb(${selectedTargetColor.r}, ${selectedTargetColor.g}, ${selectedTargetColor.b})`;
        
        // Matikan mode picking setelah warna sukses tertangkap
        isPickingColor = false;
        btnTogglePicker.classList.remove('picking');
    });


    // --- 6. MANUAL BRUSH DRAWER ENGINE ---
    maskCanvas.addEventListener('mousedown', startDrawing);
    maskCanvas.addEventListener('mousemove', draw);
    window.addEventListener('mouseup', stopDrawing);

    maskCanvas.addEventListener('touchstart', startDrawing, { passive: false });
    maskCanvas.addEventListener('touchmove', draw, { passive: false });
    window.addEventListener('touchend', stopDrawing);

    function startDrawing(e) {
        if (currentMode !== 'manual' || isPickingColor) return;
        isDrawing = true;
        draw(e);
    }

    function draw(e) {
        if (!isDrawing || currentMode !== 'manual') return;
        e.preventDefault();
        const coords = getCanvasCoordinates(e);

        maskCtx.lineWidth = parseInt(brushSize.value);
        maskCtx.lineCap = 'round';
        maskCtx.lineJoin = 'round';
        maskCtx.strokeStyle = 'rgba(239, 68, 68, 1)'; // Solid red buffer internal mask

        if (e.type === 'mousedown' || e.type === 'touchstart') {
            maskCtx.beginPath();
            maskCtx.moveTo(coords.x, coords.y);
        }
        maskCtx.lineTo(coords.x, coords.y);
        maskCtx.stroke();
    }

    function stopDrawing() {
        if (isDrawing) {
            isDrawing = false;
            maskCtx.closePath();
            showLoading('Mengekstrak core tekstur kuas...');
            setTimeout(() => { executePixelInpainting(); }, 60);
        }
    }


    // --- 7. GANAS FEATURE 1: ALGORITMA AI SOBEL-EDGE SCANNER ---
    btnRunAuto.addEventListener('click', () => {
        showLoading('Menjalankan filter konvolusi spasial...');
        setTimeout(() => {
            const imgData = ctx.getImageData(0, 0, mainCanvas.width, mainCanvas.height);
            const pixels = imgData.data;
            const maskImgData = maskCtx.createImageData(mainCanvas.width, mainCanvas.height);
            const maskPixels = maskImgData.data;

            const w = mainCanvas.width;
            const h = mainCanvas.height;
            const threshold = (100 - parseInt(sensitivityRange.value)) * 2.5;

            // Memindai matrix koordinat 2D gambar (Melompati baris pembatas terluar)
            for (let y = 1; y < h - 1; y++) {
                for (let x = 1; x < w - 1; x++) {
                    const idx = (y * w + x) * 4;

                    // Mengambil index tetangga sekitar (Utara, Selatan, Barat, Timur)
                    const idxU = ((y - 1) * w + x) * 4;
                    const idxD = ((y + 1) * w + x) * 4;
                    const idxB = (y * w + (x - 1)) * 4;
                    const idxT = (y * w + (x + 1)) * 4;

                    // Ekstraksi nilai intensitas cahaya (Luminance)
                    const lumU = 0.299 * pixels[idxU] + 0.587 * pixels[idxU+1] + 0.114 * pixels[idxU+2];
                    const lumD = 0.299 * pixels[idxD] + 0.587 * pixels[idxD+1] + 0.114 * pixels[idxD+2];
                    const lumB = 0.299 * pixels[idxB] + 0.587 * pixels[idxB+1] + 0.114 * pixels[idxB+2];
                    const lumT = 0.299 * pixels[idxT] + 0.587 * pixels[idxT+1] + 0.114 * pixels[idxT+2];

                    // Kalkulasi perbedaan kontras tajam (Gradien Sobel parsial)
                    const gradX = lumT - lumB;
                    const gradY = lumD - lumU;
                    const magnitude = Math.sqrt(gradX * gradX + gradY * gradY);

                    // Jika tingkat kontras melewati limit, kunci sebagai kandidat kuat watermark
                    if (magnitude > threshold) {
                        maskPixels[idx] = 239; maskPixels[idx+1] = 68; maskPixels[idx+2] = 68; maskPixels[idx+3] = 255;
                    }
                }
            }
            maskCtx.putImageData(maskImgData, 0, 0);
            hideLoading();
            
            showLoading('Mengeksekusi pixel synthesis otomatis...');
            setTimeout(() => { executePixelInpainting(); }, 80);
        }, 50);
    });


    // --- 8. GANAS FEATURE 2: COLOR ISOLATION SPECTRUM ENGINE ---
    btnRunColorMatch.addEventListener('click', () => {
        showLoading('Mengisolasi koordinat spektrum warna...');
        setTimeout(() => {
            const imgData = ctx.getImageData(0, 0, mainCanvas.width, mainCanvas.height);
            const pixels = imgData.data;
            const maskImgData = maskCtx.createImageData(mainCanvas.width, mainCanvas.height);
            const maskPixels = maskImgData.data;

            const tolerance = parseInt(colorTolerance.value);
            const totalPixels = pixels.length;

            // Menggunakan Rumus Jarak Euclidean Ruang Warna 3D (RGB Vector Distance)
            for (let i = 0; i < totalPixels; i += 4) {
                const diffR = pixels[i] - selectedTargetColor.r;
                const diffG = pixels[i+1] - selectedTargetColor.g;
                const diffB = pixels[i+2] - selectedTargetColor.b;

                const distance = Math.sqrt(diffR * diffR + diffG * diffG + diffB * diffB);

                // Jika variasi warna masuk dalam radius batas toleransi, otomatis bungkus masuk masker
                if (distance <= tolerance) {
                    maskPixels[i] = 239; maskPixels[i+1] = 68; maskPixels[i+2] = 68; maskPixels[i+3] = 255;
                }
            }
            maskCtx.putImageData(maskImgData, 0, 0);
            hideLoading();

            showLoading('Merestorasi area spektrum warna...');
            setTimeout(() => { executePixelInpainting(); }, 80);
        }, 50);
    });


    // --- 9. ULTRA-INPAINTING CORE ENGINE & GANAS FEATURE 3: TEXTURE DITHERING PATCH ---
    function executePixelInpainting() {
        const w = mainCanvas.width;
        const h = mainCanvas.height;

        const imgData = ctx.getImageData(0, 0, w, h);
        const maskData = maskCtx.getImageData(0, 0, w, h);
        
        const pixels = imgData.data;
        const maskPixels = maskData.data;
        const referencePixels = new Uint8ClampedArray(pixels); // Snapshot statis untuk referensi donor warna

        const radius = 5; // Luas jangkauan pencarian donor warna terdekat
        const isDitherEnabled = toggleDither.checked;

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const idx = (y * w + x) * 4;

                // Cek apakah koordinat pixel terkunci di dalam masker merah
                if (maskPixels[idx + 3] > 0) {
                    let sumR = 0, sumG = 0, sumB = 0, totalWeight = 0;

                    // Pindai sub-matrix lingkungan sekitar (Kernel Interpolation Space)
                    for (let ky = -radius; ky <= radius; ky++) {
                        for (let kx = -radius; kx <= radius; kx++) {
                            const nx = x + kx;
                            const ny = y + ky;

                            // Validasi agar pencarian warna tidak keluar dari ujung gambar
                            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                                const nIdx = (ny * w + nx) * 4;

                                // Pastikan pixel pendonor merupakan pixel bersih (diluar masker merah)
                                if (maskPixels[nIdx + 3] === 0) {
                                    // Inverse Distance Weighting Formula: Bobot makin besar jika jarak makin rapat
                                    const weight = 1 / (kx * kx + ky * ky + 0.5);
                                    
                                    sumR += referencePixels[nIdx] * weight;
                                    sumG += referencePixels[nIdx + 1] * weight;
                                    sumB += referencePixels[nIdx + 2] * weight;
                                    totalWeight += weight;
                                }
                            }
                        }
                    }

                    if (totalWeight > 0) {
                        let finalR = sumR / totalWeight;
                        let finalG = sumG / totalWeight;
                        let finalB = sumB / totalWeight;

                        // --- ENGINE GANAS: LOCAL TEXTURE DITHERING PATCH ---
                        // Menyuntikkan variasi noise mikro acak tiruan yang dihitung dari struktur sekelilingnya
                        // Ini memecah kompresi warna solid pasca inpainting sehingga mencegah efek blur/berkabut.
                        if (isDitherEnabled) {
                            const noiseValue = (Math.random() - 0.5) * 5.5; // Mengunci rentang dither amplifikasi
                            finalR = Math.min(255, Math.max(0, finalR + noiseValue));
                            finalG = Math.min(255, Math.max(0, finalG + noiseValue));
                            finalB = Math.min(255, Math.max(0, finalB + noiseValue));
                        }

                        pixels[idx]     = finalR;
                        pixels[idx + 1] = finalG;
                        pixels[idx + 2] = finalB;
                        
                        // Bersihkan penanda masker pada pixel yang sukses ditambal secara real-time
                        maskPixels[idx + 3] = 0;
                    }
                }
            }
        }

        // Terapkan injeksi pixel ke layer canvas utama
        ctx.putImageData(imgData, 0, 0);
        maskCtx.putImageData(maskData, 0, 0);
        
        // Daftarkan perubahan terbaru ke sistem Undo Manager
        saveHistoryState();
        hideLoading();
    }


    // --- 10. UTILITIES OVERLAY MANAGEMENT & EXPORTER ---
    function showLoading(text) {
        loadingText.textContent = text;
        loadingOverlay.classList.remove('hidden');
    }

    function hideLoading() {
        loadingOverlay.classList.add('hidden');
    }

    btnDownload.addEventListener('click', () => {
        showLoading('Mengemas output gambar HD...');
        
        // Melakukan konversi matriks canvas murni ke format blob biner PNG beresolusi penuh
        setTimeout(() => {
            mainCanvas.toBlob((blob) => {
                const downloadUrl = URL.createObjectURL(blob);
                const linkElement = document.createElement('a');
                linkElement.href = downloadUrl;
                linkElement.download = `Rolandino_MagicEraser_Cleaned_${Date.now()}.png`;
                
                document.body.appendChild(linkElement);
                linkElement.click();
                document.body.removeChild(linkElement);
                
                URL.revokeObjectURL(downloadUrl);
                hideLoading();
            }, 'image/png', 1.0); // 1.0 mengindikasikan kualitas ekspor maksimum tanpa kompresi
        }, 100);
    });
});
