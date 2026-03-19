// Client-Side Router for OpenNotebookLMs
class Router {
    constructor() {
        this.routes = new Map();
        this.currentRoute = null;
        this.navigationHistory = []; // Track navigation history
        this.maxHistoryLength = 50; // Limit history size
        this.authReady = false;
        this.authUser = null;
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

        this.routes.set('/search', {
            title: 'Browse Notebooks | OpenNotebookLMs',
            description: 'Search and discover AI research notebooks from Google NotebookLM across various topics.',
            component: 'search',
            requiresAuth: false,
            template: null // Dynamic rendering like 404 page
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
        // Add to history before navigation (but don't add if same route)
        if (this.currentRoute && this.currentRoute !== path) {
            this.navigationHistory.push(this.currentRoute);
            
            // Limit history size
            if (this.navigationHistory.length > this.maxHistoryLength) {
                this.navigationHistory.shift();
            }
        }

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

        this.currentRoute = path;
        window.location.hash = path;

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
                <!-- Navigation Bar -->
                <nav class="sticky top-0 z-50 glass-morphism border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-darkBg/80 px-3 sm:px-6 py-3 sm:py-4 flex justify-between items-center">
                    <div class="flex items-center space-x-2 min-w-0 flex-1">
                        <div class="bg-blue-600 p-2 rounded-lg shrink-0">
                            <i data-lucide="book-open" class="text-white w-6 h-6"></i>
                        </div>
                        <a href="/" class="text-lg sm:text-2xl font-bold tracking-tight truncate">OpenNotebookLMs</a>
                        <span class="hidden sm:inline-flex bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs px-2 py-1 rounded-full ml-2 font-medium uppercase shrink-0">R&D Beta</span>
                    </div>
                    
                    <div class="flex items-center space-x-2 sm:space-x-4 shrink-0">
                        <!-- Theme Toggle -->
                        <button onclick="toggleTheme()" class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                            <i data-lucide="sun" id="sunIcon" class="w-5 h-5 hidden dark:block"></i>
                            <i data-lucide="moon" id="moonIcon" class="w-5 h-5 block dark:hidden"></i>
                        </button>
                        
                        <div id="authContainer" class="flex items-center">
                            <button id="loginBtn" onclick="toggleModal('authModal')" class="text-xs sm:text-sm font-semibold whitespace-nowrap hover:text-blue-600 transition-colors mr-1 sm:mr-2">Login / Sign up</button>
                            <div id="userAvatar" onclick="handleProfileClick()" class="hidden w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 border border-blue-200 dark:border-blue-800 cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all">
                                <i data-lucide="user" class="w-5 h-5"></i>
                            </div>
                        </div>
                    </div>
                </nav>

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
                            <button onclick="window.router?.back()" class="inline-flex items-center px-6 py-3 bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors">
                                <i data-lucide="arrow-left" class="w-5 h-5 mr-2"></i>
                                Go Back
                            </button>
                        </div>
                    </div>
                </main>

                <!-- Auth Modal -->
                <div id="authModal" class="fixed inset-0 bg-black/60 z-[60] hidden flex items-center justify-center p-4">
                    <div class="bg-white dark:bg-darkCard rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
                        <button onclick="toggleModal('authModal')" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                            <i data-lucide="x"></i>
                        </button>
                        <h2 class="text-2xl font-bold mb-2 text-center">Sign In / Up</h2>
                        <div class="space-y-3 mb-4">
                            <div>
                                <label for="auth_email" class="block text-sm font-semibold mb-1">Email</label>
                                <input id="auth_email" type="email" class="w-full p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-darkBg outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label for="auth_password" class="block text-sm font-semibold mb-1">Password</label>
                                <input id="auth_password" type="password" class="w-full p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-darkBg outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                        </div>
                        <div class="space-y-2">
                            <button type="button" onclick="handleEmailAuth('login')" class="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors">
                                Log in
                            </button>
                            <button type="button" onclick="handleEmailAuth('signup')" class="w-full py-2.5 rounded-lg bg-gray-900 hover:bg-black text-white font-semibold text-sm transition-colors">
                                Create Account and Verify
                            </button>
                            <button type="button" onclick="handlePasswordReset()" class="w-full py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-100 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                Forgot Password?
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Alert Toast -->
                <div id="toast" class="fixed bottom-6 right-6 translate-y-20 opacity-0 bg-white dark:bg-darkCard border border-gray-200 dark:border-gray-700 px-6 py-4 rounded-2xl shadow-2xl z-[100] transition-all flex items-center">
                    <div id="toastIcon" class="mr-3"></div>
                    <p id="toastMsg" class="font-medium"></p>
                </div>
            `;
            
            // Initialize Lucide icons and auth UI
            if (window.lucide) {
                window.lucide.createIcons();
            }
            
            // Initialize auth UI for 404 page
            if (window.updateAuthUI) {
                window.updateAuthUI();
            }
            return;
        }

        // Handle search page with dynamic content
        if (route.component === 'search') {
            document.body.innerHTML = `
                <!-- Navigation Bar -->
                <nav class="sticky top-0 z-50 glass-morphism border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-darkBg/80 px-3 sm:px-6 py-3 sm:py-4 flex justify-between items-center">
                    <div class="flex items-center space-x-2 min-w-0 flex-1">
                        <div class="bg-blue-600 p-2 rounded-lg shrink-0">
                            <i data-lucide="book-open" class="text-white w-6 h-6"></i>
                        </div>
                        <a href="/" class="text-lg sm:text-2xl font-bold tracking-tight truncate">OpenNotebookLMs</a>
                        <span class="hidden sm:inline-flex bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs px-2 py-1 rounded-full ml-2 font-medium uppercase shrink-0">R&D Beta</span>
                    </div>
                    
                    <div class="flex items-center space-x-2 sm:space-x-4 shrink-0">
                        <!-- Theme Toggle -->
                        <button onclick="toggleTheme()" class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                            <i data-lucide="sun" id="sunIcon" class="w-5 h-5 hidden dark:block"></i>
                            <i data-lucide="moon" id="moonIcon" class="w-5 h-5 block dark:hidden"></i>
                        </button>
                        
                        <div id="authContainer" class="flex items-center">
                            <button id="loginBtn" onclick="toggleModal('authModal')" class="text-xs sm:text-sm font-semibold whitespace-nowrap hover:text-blue-600 transition-colors mr-1 sm:mr-2">Login / Sign up</button>
                            <div id="userAvatar" onclick="handleProfileClick()" class="hidden w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 border border-blue-200 dark:border-blue-800 cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all">
                                <i data-lucide="user" class="w-5 h-5"></i>
                            </div>
                        </div>
                    </div>
                </nav>

                <!-- Mobile Navigation Menu -->
                <div class="md:hidden border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-darkBg px-4 py-2">
                    <div class="flex space-x-4 text-sm">
                        <a href="/" data-nav-link class="text-gray-600 hover:text-blue-600 transition-colors">Home</a>
                        <a href="/my-notebooks" data-nav-link class="text-gray-600 hover:text-blue-600 transition-colors">My Notebooks</a>
                        <a href="/create" data-nav-link class="text-gray-600 hover:text-blue-600 transition-colors">Create</a>
                        <a href="/settings" data-nav-link class="text-gray-600 hover:text-blue-600 transition-colors">Settings</a>
                    </div>
                </div>

                <!-- Search Content -->
                <main class="max-w-7xl mx-auto px-4 sm:px-6 py-8">
                    <div class="flex items-center mb-6">
                        <button onclick="window.router?.redirect('/')" class="mr-4 p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors">
                            <i data-lucide="arrow-left" class="w-6 h-6"></i>
                        </button>
                        <div>
                            <h1 class="text-2xl sm:text-3xl font-bold">Browse Notebooks</h1>
                            <p class="text-sm text-gray-500 dark:text-gray-400">Search and discover AI research notebooks from Google NotebookLM</p>
                        </div>
                    </div>

                    <!-- Search & Control Header -->
                    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                        <div class="relative flex-1 max-w-xl flex items-center gap-2">
                            <div class="relative flex-1">
                                <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5"></i>
                                <input type="text" id="searchInput" placeholder="Search curated notebooks..." 
                                       class="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-darkCard focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition-all">
                            </div>
                            <!-- Filter Toggle Button -->
                            <button onclick="toggleFilterModal()" class="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-darkCard hover:bg-gray-50 dark:hover:bg-gray-800 transition-all shadow-sm" title="All Topics">
                                <i data-lucide="sliders-horizontal" class="w-5 h-5"></i>
                            </button>
                        </div>
                        
                        <div class="flex items-center gap-3">
                            <!-- Sort Dropdown -->
                            <div class="relative">
                                <select id="sortSelect" class="appearance-none bg-white dark:bg-darkCard border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-2 pr-8 text-sm focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer">
                                    <option value="newest">Newest First</option>
                                    <option value="oldest">Oldest First</option>
                                    <option value="sources">Most Sources</option>
                                    <option value="alphabetical">A-Z</option>
                                </select>
                                <i data-lucide="chevron-down" class="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"></i>
                            </div>
                        </div>
                    </div>

                    <!-- Results Header -->
                    <div class="flex items-center mb-6">
                        <div class="flex items-center gap-4">
                            <span class="text-sm text-gray-500 dark:text-gray-400">
                                <span id="resultCount">0</span> notebooks found
                            </span>
                            <div id="activeFilters" class="flex items-center gap-2">
                                <!-- Active filter tags will be inserted here -->
                            </div>
                        </div>
                    </div>

                    <!-- Results Grid -->
                    <div id="notebookGrid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                        <!-- Notebook cards will be dynamically inserted here -->
                    </div>

                    <!-- Empty State -->
                    <div id="emptyState" class="hidden text-center py-16">
                        <i data-lucide="search-x" class="w-16 h-16 text-gray-300 mx-auto mb-4"></i>
                        <h3 class="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">No notebooks found</h3>
                        <p class="text-gray-500 mb-6">Try adjusting your search or filters to find what you're looking for.</p>
                        <button onclick="clearFilters()" class="inline-flex items-center px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                            <i data-lucide="x" class="w-4 h-4 mr-2"></i>
                            Clear Filters
                        </button>
                    </div>

                    <!-- Loading State -->
                    <div id="loadingState" class="hidden text-center py-16">
                        <i data-lucide="loader-2" class="w-10 h-10 text-blue-500 animate-spin mb-4"></i>
                        <p class="text-gray-500">Loading notebooks...</p>
                    </div>
                </main>

                <!-- Auth Modal -->
                <div id="authModal" class="fixed inset-0 bg-black/60 z-[60] hidden flex items-center justify-center p-4">
                    <div class="bg-white dark:bg-darkCard rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
                        <button onclick="toggleModal('authModal')" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                            <i data-lucide="x"></i>
                        </button>
                        <h2 class="text-2xl font-bold mb-2 text-center">Sign In / Up</h2>
                        <div class="space-y-3 mb-4">
                            <div>
                                <label for="auth_email" class="block text-sm font-semibold mb-1">Email</label>
                                <input id="auth_email" type="email" class="w-full p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-darkBg outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label for="auth_password" class="block text-sm font-semibold mb-1">Password</label>
                                <input id="auth_password" type="password" class="w-full p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-darkBg outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                        </div>
                        <div class="space-y-2">
                            <button type="button" onclick="handleEmailAuth('login')" class="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors">
                                Log in
                            </button>
                            <button type="button" onclick="handleEmailAuth('signup')" class="w-full py-2.5 rounded-lg bg-gray-900 hover:bg-black text-white font-semibold text-sm transition-colors">
                                Create Account and Verify
                            </button>
                            <button type="button" onclick="handlePasswordReset()" class="w-full py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-100 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                Forgot Password?
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Topic Discovery Modal -->
                <div id="topicModal" class="fixed inset-0 bg-black/60 z-[60] hidden flex items-center justify-center p-4">
                    <div class="bg-white dark:bg-darkCard rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
                        <button onclick="toggleFilterModal()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><i data-lucide="x"></i></button>
                        <h2 class="text-xl font-bold mb-4">All Topics</h2>
                        <div id="allTopicsList" class="flex flex-wrap gap-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                            <!-- Topics populated dynamically -->
                        </div>
                    </div>
                </div>

                <!-- Alert Toast -->
                <div id="toast" class="fixed bottom-6 right-6 translate-y-20 opacity-0 bg-white dark:bg-darkCard border border-gray-200 dark:border-gray-700 px-6 py-4 rounded-2xl shadow-2xl z-[100] transition-all flex items-center">
                    <div id="toastIcon" class="mr-3"></div>
                    <p id="toastMsg" class="font-medium"></p>
                </div>
            `;
            
            // Initialize Lucide icons and search functionality
            if (window.lucide) {
                window.lucide.createIcons();
            }
            
            // Initialize search page functionality
            this.initializeSearchPage();
            return;
        }

        // Load page content - always reload to ensure fresh content
        if (route.template) {
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
            // For hash-based routing, always load content to ensure fresh data
            // The pathname-based check doesn't work with hash routing
            if (!templatePath) return; // No template to load (404 case)
            
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
            case 'search':
                this.initializeSearchPage();
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
        if (window.loadUserData) {
            window.loadUserData();
        }
        
        // Add bio character counter
        const bioInput = document.getElementById("bioInput");
        if (bioInput) {
            bioInput.addEventListener("input", (e) => {
                const count = e.target.value.length;
                document.getElementById("bioCount").textContent = count;
            });
        }
    }

    initializeSearchPage() {
        // Search page initialization
        if (window.filterAndRender) {
            window.filterAndRender();
        }
        if (window.renderCategoryFilters) {
            window.renderCategoryFilters();
        }
        if (window.populateTopicModal) {
            window.populateTopicModal();
        }
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

    // Custom back method for app navigation history
    back() {
        if (this.navigationHistory.length > 0) {
            const previousRoute = this.navigationHistory.pop();
            this.navigate(previousRoute);
        } else {
            // Fallback to browser history if no app history
            window.history.back();
        }
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
