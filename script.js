let pdfDoc = null;
let scale = 1.0;
const minScale = 0.5;
const maxScale = 3.0;
const scaleStep = 0.1;

let currentPage = 1;
let lastScrollTop = 0;
let lastScrollLeft = 0;
let initialDistance = null;

let currentRotation = 0;
let currentScale = 1.0;

// Initialize PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

function calculateInitialScale(page) {
    const viewport = page.getViewport({ scale: 1.0 });
    const viewerWidth = document.getElementById('pdfViewer').clientWidth - 48; // 48px for padding
    const screenScale = viewerWidth / viewport.width;
    return Math.min(Math.max(screenScale, minScale), maxScale);
}

document.getElementById('fileInput').addEventListener('change', async function(event) {
    const file = event.target.files[0];
    if (file && file.type === 'application/pdf') {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            
            loadingTask.promise.then(function(pdf) {
                pdfDoc = pdf;
                console.log('PDF loaded');
                
                const pdfViewer = document.getElementById('pdfViewer');
                pdfViewer.innerHTML = '';
                
                renderAllPages().catch(error => {
                    console.error('Error rendering pages:', error);
                    alert('Error rendering PDF. Please try again.');
                });
            }).catch(function (error) {
                console.error('Error loading PDF:', error);
                alert('Error loading PDF. Please check if the file is valid.');
            });
        } catch (error) {
            console.error('Error reading file:', error);
            alert('Error loading PDF file.');
        }
    } else {
        alert('Please select a valid PDF file.');
    }
});

const RENDER_DELAY = 100; // ms delay between page renders
let renderTimeout = null;

async function renderAllPages() {
    if (!pdfDoc) {
        console.error('No PDF loaded');
        return;
    }

    const pdfViewer = document.getElementById('pdfViewer');
    lastScrollTop = pdfViewer.scrollTop;
    lastScrollLeft = pdfViewer.scrollLeft;
    
    // Properly clean up old pages
    while (pdfViewer.firstChild) {
        pdfViewer.firstChild.remove();
    }
    
    // Set initial scale based on first page
    const firstPage = await pdfDoc.getPage(1);
    scale = calculateInitialScale(firstPage);

    const numPages = pdfDoc.numPages;
    
    // Create all page containers first
    const pagePromises = [];
    
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const pageContainer = document.createElement('div');
        pageContainer.className = 'page-container';
        pageContainer.setAttribute('data-page-number', pageNum);
        pdfViewer.appendChild(pageContainer);
        
        // Delay each page render slightly for smoother loading
        const pagePromise = new Promise(resolve => {
            setTimeout(() => {
                renderPage(pageNum, pageContainer).then(resolve);
            }, RENDER_DELAY * (pageNum - 1));
        });
        
        pagePromises.push(pagePromise);
    }
    
    // Wait for all pages to render
    await Promise.all(pagePromises);
}

async function renderPage(pageNum, pageContainer) {
    try {
        const page = await pdfDoc.getPage(pageNum);
        
        // Create text layer container
        const textLayerContainer = document.createElement('div');
        textLayerContainer.className = 'textLayer';
        
        // Calculate viewport with proper scale
        const viewport = page.getViewport({ 
            scale: scale * (window.devicePixelRatio || 1), // Adjust for device pixel ratio
            rotation: currentRotation 
        });
        
        // Set up canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', {
            alpha: false,
            antialias: true
        });
        
        // Set canvas dimensions
        const pixelRatio = Math.max(window.devicePixelRatio || 1, 2); // Minimum 2x scaling
        canvas.width = viewport.width * pixelRatio;
        canvas.height = viewport.height * pixelRatio;
        
        // Set display size
        canvas.style.width = viewport.width + 'px';
        canvas.style.height = viewport.height + 'px';
        
        // Scale context for higher resolution
        context.scale(pixelRatio, pixelRatio);
        
        // Render context
        const renderContext = {
            canvasContext: context,
            viewport: viewport,
            enableWebGL: true,
            renderInteractiveForms: true
        };

        // Render page
        await page.render(renderContext).promise;
        
        // Get text content
        const textContent = await page.getTextContent({
            normalizeWhitespace: true,
            disableCombineTextItems: false
        });
        
        // Set text layer dimensions
        textLayerContainer.style.width = viewport.width + 'px';
        textLayerContainer.style.height = viewport.height + 'px';
        
        // Render text layer
        await pdfjsLib.renderTextLayer({
            textContent: textContent,
            container: textLayerContainer,
            viewport: viewport,
            textDivs: [],
            enhanceTextSelection: true
        }).promise;

        // Add to page container
        pageContainer.appendChild(canvas);
        pageContainer.appendChild(textLayerContainer);

    } catch (error) {
        console.error(`Error rendering page ${pageNum}:`, error);
    }
}

// Handle pinch-to-zoom
document.getElementById('pdfViewer').addEventListener('touchmove', function(event) {
    if (event.touches.length === 2) {
        event.preventDefault();
        const touch1 = event.touches[0];
        const touch2 = event.touches[1];
        const currentDistance = Math.hypot(
            touch2.pageX - touch1.pageX,
            touch2.pageY - touch1.pageY
        );

        const viewer = document.getElementById('pdfViewer');
        const centerX = (touch1.pageX + touch2.pageX) / 2 - viewer.offsetLeft;
        const centerY = (touch1.pageY + touch2.pageY) / 2 - viewer.offsetTop;
        
        const scrollXRatio = (viewer.scrollLeft + centerX) / viewer.scrollWidth;
        const scrollYRatio = (viewer.scrollTop + centerY) / viewer.scrollHeight;

        if (initialDistance === null) {
            initialDistance = currentDistance;
        } else {
            const oldScale = scale;
            if (currentDistance > initialDistance && scale < maxScale) {
                scale += scaleStep;
            } else if (currentDistance < initialDistance && scale > minScale) {
                scale -= scaleStep;
            }
            initialDistance = currentDistance;
            
            if (oldScale !== scale) {
                renderAllPages().then(() => {
                    const newX = scrollXRatio * viewer.scrollWidth;
                    const newY = scrollYRatio * viewer.scrollHeight;
                    
                    viewer.scrollLeft = newX - centerX;
                    viewer.scrollTop = newY - centerY;
                });
            }
        }
    }
}, { passive: false });

document.getElementById('pdfViewer').addEventListener('touchend', function() {
    initialDistance = null;
});

// Add touch event listeners for mobile
document.addEventListener('touchend', handleTextSelection);
document.addEventListener('selectionchange', handleTextSelection);

// Hide menu when scrolling
document.getElementById('pdfViewer').addEventListener('scroll', function() {
    document.getElementById('selectionMenu').classList.add('hidden');
});

// Add magnifier functionality
let magnifier = null;
let touchSelectionTimeout;

function createMagnifier() {
    if (!magnifier) {
        magnifier = document.createElement('div');
        magnifier.className = 'text-magnifier hidden';
        document.body.appendChild(magnifier);
    }
    return magnifier;
}

function updateMagnifier(event, selection) {
    const magnifier = createMagnifier();
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    // Get selected text
    const selectedText = selection.toString().trim();
    if (!selectedText) {
        magnifier.classList.add('hidden');
        return;
    }

    // Position magnifier above the selection
    const magnifierHeight = 40;
    const magnifierOffset = 20;
    
    magnifier.style.left = `${Math.max(10, Math.min(
        rect.left,
        window.innerWidth - 150
    ))}px`;
    magnifier.style.top = `${Math.max(10, rect.top - magnifierHeight - magnifierOffset)}px`;
    
    // Update magnifier content
    magnifier.textContent = selectedText;
    magnifier.classList.remove('hidden');
}

// Update the handleTextSelection function
function handleTextSelection(event) {
    const selection = window.getSelection();
    const selectionMenu = document.getElementById('selectionMenu');
    const screenWidth = window.innerWidth;
    
    clearTimeout(touchSelectionTimeout);
    
    if (selection.isCollapsed || !selection.toString().trim()) {
        selectionMenu.classList.add('hidden');
        if (magnifier) magnifier.classList.add('hidden');
        return;
    }
    
    // Show magnifier on mobile and tablet
    if (screenWidth <= SCREEN_SIZES.TABLET && event.type === 'touchend') {
        updateMagnifier(event, selection);
    }
    
    touchSelectionTimeout = setTimeout(() => {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        // Adjust menu positioning based on screen size
        const menuWidth = screenWidth <= SCREEN_SIZES.MOBILE ? 120 : 
                         screenWidth <= SCREEN_SIZES.TABLET ? 140 : 160;
        const menuHeight = screenWidth <= SCREEN_SIZES.MOBILE ? 80 : 100;
        const menuOffset = screenWidth <= SCREEN_SIZES.MOBILE ? 8 : 10;
        
        let left, top;
        
        if (screenWidth <= SCREEN_SIZES.TABLET) {
            // Center menu for mobile and tablet
            left = Math.max(menuOffset, Math.min(
                rect.left + (rect.width / 2) - (menuWidth / 2),
                window.innerWidth - menuWidth - menuOffset
            ));
            top = rect.bottom + menuOffset;
            
            // If no space below, put it above
            if (top + menuHeight > window.innerHeight) {
                top = rect.top - menuHeight - menuOffset;
            }
        } else {
            // Position to the right for desktop
            left = Math.min(rect.right + menuOffset, window.innerWidth - menuWidth - menuOffset);
            top = Math.max(menuOffset, rect.top);
        }
        
        selectionMenu.style.left = `${left}px`;
        selectionMenu.style.top = `${top}px`;
        selectionMenu.classList.remove('hidden');
    }, screenWidth <= SCREEN_SIZES.MOBILE ? 200 : 150);
}

// Hide magnifier when selection ends
document.addEventListener('selectionchange', () => {
    const selection = window.getSelection();
    if (selection.isCollapsed && magnifier) {
        magnifier.classList.add('hidden');
    }
});

// Hide magnifier on scroll
document.getElementById('pdfViewer').addEventListener('scroll', () => {
    if (magnifier) magnifier.classList.add('hidden');
});

// Add these constants at the top
const SCREEN_SIZES = {
    MOBILE: 480,
    TABLET: 768,
    DESKTOP: 1024
};

// Update the magnifier positioning
function updateMagnifier(event, selection) {
    const magnifier = createMagnifier();
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const screenWidth = window.innerWidth;
    
    const selectedText = selection.toString().trim();
    if (!selectedText) {
        magnifier.classList.add('hidden');
        return;
    }

    const magnifierHeight = screenWidth <= SCREEN_SIZES.MOBILE ? 32 : 40;
    const magnifierOffset = screenWidth <= SCREEN_SIZES.MOBILE ? 16 : 20;
    const maxWidth = screenWidth <= SCREEN_SIZES.MOBILE ? 120 : 150;
    
    magnifier.style.left = `${Math.max(8, Math.min(
        rect.left,
        window.innerWidth - maxWidth - 8
    ))}px`;
    magnifier.style.top = `${Math.max(8, rect.top - magnifierHeight - magnifierOffset)}px`;
    
    magnifier.textContent = selectedText;
    magnifier.classList.remove('hidden');
}

document.getElementById('pdfViewer').addEventListener('touchstart', function(event) {
    if (event.touches.length === 2) {
        event.preventDefault();
    }
}, { passive: false });

document.getElementById('pdfViewer').addEventListener('touchmove', function(event) {
    if (event.touches.length === 2) {
        event.preventDefault();
        const touch1 = event.touches[0];
        const touch2 = event.touches[1];
        const currentDistance = Math.hypot(
            touch2.pageX - touch1.pageX,
            touch2.pageY - touch1.pageY
        );

        const viewer = document.getElementById('pdfViewer');
        const centerX = (touch1.pageX + touch2.pageX) / 2 - viewer.offsetLeft;
        const centerY = (touch1.pageY + touch2.pageY) / 2 - viewer.offsetTop;
        
        const scrollXRatio = (viewer.scrollLeft + centerX) / viewer.scrollWidth;
        const scrollYRatio = (viewer.scrollTop + centerY) / viewer.scrollHeight;

        if (initialDistance === null) {
            initialDistance = currentDistance;
        } else {
            const oldScale = scale;
            if (currentDistance > initialDistance && scale < maxScale) {
                scale += scaleStep;
            } else if (currentDistance < initialDistance && scale > minScale) {
                scale -= scaleStep;
            }
            initialDistance = currentDistance;
            
            if (oldScale !== scale) {
                renderAllPages().then(() => {
                    const newX = scrollXRatio * viewer.scrollWidth;
                    const newY = scrollYRatio * viewer.scrollHeight;
                    
                    viewer.scrollLeft = newX - centerX;
                    viewer.scrollTop = newY - centerY;
                });
            }
        }
    }
}, { passive: false });

