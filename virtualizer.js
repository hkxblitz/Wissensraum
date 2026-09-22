/**
 * Canvas Virtualizer for 2GB RAM Optimization
 * Observes pages in the document and drops pixel buffers when off-screen.
 */

class PageVirtualizer {
    constructor(containerSelector, onRedrawNeeded) {
        this.container = document.querySelector(containerSelector);
        this.onRedrawNeeded = onRedrawNeeded; // Callback to replay strokes
        this.observer = null;
        this.init();
    }

    init() {
        // Trigger slightly before the page hits the screen edges for smooth scrolling
        const options = {
            root: this.container,
            rootMargin: '200px 0px 200px 0px',
            threshold: 0.01
        };

        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const pageElement = entry.target;
                const pageId = pageElement.dataset.pageId;
                const bgCanvas = pageElement.querySelector('.bg-canvas');
                const bgCtx = bgCanvas.getContext('2d');

                if (entry.isIntersecting) {
                    // Page entered visible range -> restore content
                    if (pageElement.dataset.virtualized === 'true') {
                        pageElement.dataset.virtualized = 'false';
                        this.onRedrawNeeded(pageId, bgCtx, bgCanvas);
                    }
                } else {
                    // Page scrolled out -> wipe pixel buffer to free memory
                    if (pageElement.dataset.virtualized !== 'true') {
                        pageElement.dataset.virtualized = 'true';
                        bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
                    }
                }
            });
        }, options);
    }

    observe(pageElement) {
        if (this.observer) {
            this.observer.observe(pageElement);
        }
    }

    unobserve(pageElement) {
        if (this.observer) {
            this.observer.unobserve(pageElement);
        }
    }
}