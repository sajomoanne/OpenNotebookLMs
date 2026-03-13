// Client-Side Router for OpenNotebookLMs
class Router {
    constructor() {
        this.routes = new Map();
        this.guards = new Map();
        this.currentRoute = null;
        this.init();
    }

    init() {
        // Define routes
        this.routes.set('/', {
            title: 'OpenNotebookLMs | Discover & Share AI Research',
            description: 'Discover and share AI research notebooks from Google NotebookLM. Browse curated collections across Science, Law, Business, and more topics.',
            component: 'home',
            requiresAuth: false,
            template: 'index.html'
        });

        this.routes.set('/my-notebooks', {
            title: 'My Notebooks | OpenNotebookLMs',
            description: 'Manage your submitted AI research notebooks.',
            component: 'my-notebooks',
            requiresAuth: true,
            template: 'my-notebooks.html'
        });

        this.routes.set('/create', {
            title: 'Create Notebook | OpenNotebookLMs',
            description: 'Submit a new AI research notebook for review.',
            component: 'create',
            requiresAuth: true,
            template: 'create.html'
        });

        this.routes.set('/settings', {
            title: 'Account Settings | OpenNotebookLMs',
            description: 'Manage your account, profile, and privacy settings.',
            component: 'settings',
            requiresAuth: true,
            template: 'settings.html'
        });

        this.routes.set('/admin-review', {
            title: 'Review Notebooks | OpenNotebookLMs',
            description: 'Admin interface for reviewing and moderating submitted notebooks.',
            component: 'admin-review',
            requiresAuth: true,
            requiresAdmin: true,
            template: 'admin-review.html'
        });

        this.routes.set('/admin-review-detail', {
            title: 'Review Notebook | OpenNotebookLMs',
            description: 'Review and edit details of a submitted notebook.',
            component: 'admin-review-detail',
            requiresAuth: true,
            requiresAdmin: true,
            template: 'admin-review-detail.html'
        });

        this.routes.set('/404', {
            title: 'Page Not Found | OpenNotebookLMs',
            description: 'The page you are looking for does not exist.',
            component: '404',
            requiresAuth: false,
            template: null // No template - will show inline 404 content
        });

        // Handle browser navigation (hashchange for hash-based routing)
        window.addEventListener('hashchange', (e) => {
            this.handleRoute();
        });

        // Handle initial route
        // Set default hash if none exists for GitHub Pages
        if (!window.location.hash) {
            window.location.hash = '/';
        }
        this.handleRoute();

        // Intercept link clicks for smooth navigation
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a[href^="/"]');
            if (link) {
                e.preventDefault();
                this.navigate(link.getAttribute('href'));
            }
        });
    }

    async navigate(path) {
        const route = this.routes.get(path);
        
        if (!route) {
            this.navigate('/404');
            return;
        }

        // Check authentication guard
        if (route.requiresAuth && this.isAuthReady() && !this.isAuthenticated()) {
            // Store intended destination for redirect after login
            sessionStorage.setItem('intendedRoute', path);
            this.navigate('/');
            if (window.toggleModal) {
                window.toggleModal('authModal');
            }
            return;
        }

        // Check admin guard
        if (route.requiresAdmin && (!window.isAdmin || !window.isAdmin())) {
            this.navigate('/404');
            return;
        }

        // For hash-based routing, update the hash instead of pathname
        if (path !== window.location.hash.substring(1)) {
            window.location.hash = path;
        }

        await this.loadRoute(route);
    }

    async handleRoute() {
        // For hash-based routing, get path from hash instead of pathname
        const hashPath = window.location.hash;
        const path = hashPath ? hashPath.substring(1) : '/'; // Remove # and default to /
        const route = this.routes.get(path);
        
        if (!route) {
            this.navigate('/404');
            return;
        }

        // Check authentication guard
        if (route.requiresAuth && this.isAuthReady() && !this.isAuthenticated()) {
            sessionStorage.setItem('intendedRoute', path);
            this.navigate('/');
            return;
        }

        // Check admin guard
        if (route.requiresAdmin && (!window.isAdmin || !window.isAdmin())) {
            this.navigate('/404');
            return;
        }

        await this.loadRoute(route);
    }

    async loadRoute(route) {
        this.currentRoute = route;

        // Update page metadata
        this.updatePageMetadata(route);

        // Handle 404 case with inline content
        if (route.component === '404') {
            document.body.innerHTML = `
                <main class="flex flex-col items-center justify-center min-h-[60vh] px-4">
                    <div class="text-center">
                        <i data-lucide="search-x" class="w-24 h-24 text-gray-300 mx-auto mb-6"></i>
                        <h1 class="text-6xl font-bold text-gray-400 mb-4">404</h1>
                        <h2 class="text-2xl font-semibold text-gray-600 dark:text-gray-300 mb-4">Page Not Found</h2>
                        <p class="text-gray-500 dark:text-gray-400 mb-8 max-w-md">
                            The page you're looking for doesn't exist or has been moved. 
                            Let's get you back to discovering amazing AI research notebooks.
                        </p>
                        <div class="flex flex-col sm:flex-row gap-4 justify-center">
                            <button onclick="window.router?.redirect('/')" class="inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors">
                                <i data-lucide="home" class="w-5 h-5 mr-2"></i>
                                Go Home
                            </button>
                            <button onclick="history.back()" class="inline-flex items-center px-6 py-3 bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors">
                                <i data-lucide="arrow-left" class="w-5 h-5 mr-2"></i>
                                Go Back
                            </button>
                        </div>
                    </div>
                </main>
            `;
            
            // Initialize Lucide icons
            if (window.lucide) {
                window.lucide.createIcons();
            }
            return;
        }

        // Load page content if not already loaded
        if (route.component !== 'home') {
            await this.loadPageContent(route.template);
        }

        // Initialize page-specific functionality
        this.initializePage(route.component);

        // Update navigation state
        this.updateNavigation(route.component);

        // Check for intended route after login or GitHub Pages redirect
        if (route.component === 'home') {
            const intendedRoute = sessionStorage.getItem('intendedRoute');
            if (intendedRoute) {
                sessionStorage.removeItem('intendedRoute');
                // Navigate to the intended route
                this.navigate(intendedRoute);
                return;
            }
        }
    }

    updatePageMetadata(route) {
        document.title = route.title;
        
        // Update meta description
        let metaDesc = document.querySelector('meta[name="description"]');
        if (!metaDesc) {
            metaDesc = document.createElement('meta');
            metaDesc.name = 'description';
            document.head.appendChild(metaDesc);
        }
        metaDesc.content = route.description;

        // Update Open Graph meta tags
        this.updateMetaTag('og:title', route.title);
        this.updateMetaTag('og:description', route.description);
        this.updateMetaTag('og:url', window.location.href);
        this.updateMetaTag('og:type', 'website');

        // Update Twitter Card meta tags
        this.updateMetaTag('twitter:title', route.title);
        this.updateMetaTag('twitter:description', route.description);
        this.updateMetaTag('twitter:card', 'summary_large_image');
    }

    updateMetaTag(property, content) {
        let tag = document.querySelector(`meta[property="${property}"]`) || 
                 document.querySelector(`meta[name="${property}"]`);
        
        if (!tag) {
            tag = document.createElement('meta');
            tag.setAttribute(property.includes(':') ? 'property' : 'name', property);
            document.head.appendChild(tag);
        }
        tag.content = content;
    }

    async loadPageContent(templatePath) {
        try {
            // For initial page load, don't fetch if we're already on the right file
            const currentFile = window.location.pathname.endsWith('.html') 
                ? window.location.pathname 
                : window.location.pathname + '.html';
            
            if (currentFile === '/' + templatePath || (templatePath === 'index.html' && window.location.pathname === '/')) {
                return; // Already on the right page
            }
            
            const response = await fetch(templatePath);
            if (!response.ok) {
                throw new Error(`Failed to load ${templatePath}`);
            }
            
            const html = await response.text();
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            
            // Extract main content
            const mainContent = tempDiv.querySelector('main') || tempDiv.querySelector('[data-page-content]');
            if (mainContent) {
                const currentMain = document.querySelector('main');
                if (currentMain) {
                    currentMain.innerHTML = mainContent.innerHTML;
                }
            }

            // Re-initialize Lucide icons for new content
            if (window.lucide) {
                window.lucide.createIcons();
            }
        } catch (error) {
            console.error('Error loading page content:', error);
            // Don't navigate to 404 on initial load, just log error
            if (window.location.pathname !== '/') {
                this.navigate('/404');
            }
        }
    }

    initializePage(component) {
        // Initialize page-specific JavaScript
        switch (component) {
            case 'home':
                this.initializeHomePage();
                break;
            case 'my-notebooks':
                this.initializeMyNotebooksPage();
                break;
            case 'create':
                this.initializeCreatePage();
                break;
            case 'settings':
                this.initializeSettingsPage();
                break;
            case 'admin-review':
                this.initializeAdminReviewPage();
                break;
            case 'admin-review-detail':
                this.initializeAdminReviewDetailPage();
                break;
            case '404':
                this.initialize404Page();
                break;
        }
    }

    initializeHomePage() {
        // Home page initialization
        if (window.filterAndRender) {
            window.filterAndRender();
        }
        if (window.renderCategoryFilters) {
            window.renderCategoryFilters();
        }
        if (window.populateTopicModal) {
            window.populateTopicModal();
        }
    }

    initializeMyNotebooksPage() {
        // My Notebooks page initialization
        if (window.renderMyNotebooks) {
            window.renderMyNotebooks();
        }
    }

    initializeCreatePage() {
        // Create page initialization
        if (window.updateSubmissionButtonLabel) {
            window.updateSubmissionButtonLabel();
        }
        if (window.updateTopicDropdown) {
            window.updateTopicDropdown();
        }
    }

    initializeSettingsPage() {
        // Settings page initialization
        if (window.updateAuthUI) {
            window.updateAuthUI();
        }
    }

    initializeAdminReviewPage() {
        // Admin review page initialization
        if (window.isAdmin && window.isAdmin()) {
            if (window.startReviewSync) {
                window.startReviewSync();
            }
        }
    }

    initializeAdminReviewDetailPage() {
        // Admin review detail page initialization
        // Form is populated when notebook is loaded
    }

    initialize404Page() {
        // 404 page initialization
        console.log('404 page loaded');
    }

    updateNavigation(activeComponent) {
        // Update navigation active states
        const navLinks = document.querySelectorAll('[data-nav-link]');
        navLinks.forEach(link => {
            const href = link.getAttribute('href');
            if (href === `/${activeComponent}` || 
                (href === '/' && activeComponent === 'home') ||
                (href === '/my-notebooks' && activeComponent === 'my-notebooks') ||
                (href === '/create' && activeComponent === 'create') ||
                (href === '/settings' && activeComponent === 'settings')) {
                link.classList.add('text-blue-600', 'font-semibold');
                link.classList.remove('text-gray-600', 'hover:text-blue-600');
            } else {
                link.classList.remove('text-blue-600', 'font-semibold');
                link.classList.add('text-gray-600', 'hover:text-blue-600');
            }
        });
    }

    isAuthenticated() {
        // Check authentication status
        return window.hasAccount ? window.hasAccount() : false;
    }

    isAuthReady() {
        return window.__authReady === true;
    }

    // Public API methods
    redirect(path) {
        this.navigate(path);
    }

    getCurrentRoute() {
        return this.currentRoute;
    }
}

// Initialize router when DOM is ready and ensure global functions are available
let router;
document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for app.js to load and initialize
    setTimeout(() => {
        router = new Router();
        window.router = router;
    }, 100);
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Router;
}
