// Import router
import './router.js';

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    signInAnonymously,
    sendPasswordResetEmail,
    EmailAuthProvider,
    reauthenticateWithCredential,
    updatePassword,
    updateEmail,
    sendEmailVerification,
    signOut,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    updateProfile,
    deleteUser,
    GoogleAuthProvider,
    signInWithPopup
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore,
    collection,
    doc,
    addDoc,
    updateDoc,
    setDoc,
    deleteDoc,
    getDoc,
    getDocs,
    onSnapshot,
    collectionGroup,
    query,
    where,
    orderBy,
    limit,
    Timestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Global State
let publicNotebooks = [];
let myNotebooks = [];
let reviewQueue = [];
let activeCategory = "All";
let currentReviewFilter = "pending";
let currentReviewNotebook = null;
let user = null;
let auth = null;
let db = null;
let unsubscribePublic = null;
let unsubscribeMine = null;
let unsubscribeReview = null;
window.__authReady = false;

const NOTEBOOK_PREFIX = "https://notebooklm.google.com/notebook/";
const TITLE_MAX = 50;
const DESCRIPTION_MAX = 300;

// Environment Config
const fallbackFirebaseConfig = {
    apiKey: "AIzaSyAYp8ca5ccQrrryYiJ3yUeqQF2JFjZPcYU",
    authDomain: "opennote-isawesome.firebaseapp.com",
    projectId: "opennote-isawesome",
    databaseURL: "https://opennote-isawesome-default-rtdb.asia-southeast1.firebasedatabase.app",
    storageBucket: "opennote-isawesome.appspot.com",
    messagingSenderId: "148212598717",
    appId: "1:148212598717:web:d8a1947e98519da328b4d4"
};

const firebaseConfig = JSON.parse(
    typeof __firebase_config !== "undefined"
        ? __firebase_config
        : JSON.stringify(fallbackFirebaseConfig)
);

if (firebaseConfig.apiKey) {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    initAuth();
    startPublicSync();
} else {
    updateAuthUI();
    filterAndRender();
    renderCategoryFilters();
    populateTopicModal();
    updateTopicDropdown();
    renderMyNotebooks();
}

async function initAuth() {
    try {
        if (typeof __initial_auth_token !== "undefined" && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
        }
    } catch (err) {
        console.error(err);
    }

    onAuthStateChanged(auth, (u) => {
        user = u;
        if (!window.__authReady) {
            window.__authReady = true;
            window.dispatchEvent(new Event("opennote:auth-ready"));
        }
        updateAuthUI();
        startMineSync();
        renderMyNotebooks();
    });
}

function hasAccount() {
    // Treat anonymous auth as "guest" (browse-only), not an account.
    return !!(user && !user.isAnonymous);
}

// Expose to router.js auth guard.
window.hasAccount = hasAccount;

function isAdmin() {
    const adminEmails = [
        "sajomoanne@gmail.com",
        "maharaojas@gmail.com",
        "opennotebooklmsofficial@gmail.com"
    ];
    return !!(user && user.email && adminEmails.includes(user.email));
}

window.isAdmin = isAdmin;

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function sanitizeNotebookUrl(url) {
    if (!url || typeof url !== "string") return null;
    try {
        const parsed = new URL(url, window.location.origin);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
            return parsed.toString();
        }
    } catch (err) {
        return null;
    }
    return null;
}

function mapObjectToArray(data) {
    if (!data || typeof data !== "object") return [];
    if (data instanceof Array) return data;
    return Object.entries(data).map(([id, value]) => ({ id, ...value }));
}

function mapQuerySnapshot(snapshot) {
    const result = [];
    snapshot.forEach((doc) => {
        result.push({ id: doc.id, ...doc.data() });
    });
    return result;
}

function getStatusLabel(notebook) {
    const status = notebook.reviewStatus || "pending";
    if (status === "approved" && notebook.isPublic === true) return "Approved";
    if (status === "declined") return "Declined";
    if (status === "private" || notebook.isPublic !== true) return "Private";
    return "Pending review";
}

function validateNotebookUrl(url) {
    return typeof url === "string" && url.startsWith(NOTEBOOK_PREFIX);
}

function startPublicSync() {
    if (!db) return;
    if (unsubscribePublic) {
        unsubscribePublic();
        unsubscribePublic = null;
    }

    const publicRef = collection(db, "publicNotebooks");
    const q = query(publicRef, where("isPublic", "==", true), where("reviewStatus", "==", "approved"));
    
    unsubscribePublic = onSnapshot(
        q,
        (snapshot) => {
            publicNotebooks = mapQuerySnapshot(snapshot);
            const availableTopics = new Set(publicNotebooks.map((nb) => nb.category).filter(Boolean));
            if (activeCategory !== "All" && !availableTopics.has(activeCategory)) {
                activeCategory = "All";
            }
            filterAndRender();
            renderCategoryFilters();
            populateTopicModal();
            updateTopicDropdown();
        },
        (err) => {
            console.error("Public notebooks sync error:", err);
            publicNotebooks = [];
            filterAndRender();
            renderCategoryFilters();
            populateTopicModal();
            updateTopicDropdown();
        }
    );
}

function startMineSync() {
    if (unsubscribeMine) {
        unsubscribeMine();
        unsubscribeMine = null;
    }

    if (!db || !hasAccount()) {
        myNotebooks = [];
        renderMyNotebooks();
        updateTopicDropdown();
        return;
    }

    const mineRef = collection(db, "users", user.uid, "notebooks");
    const q = query(mineRef, orderBy("createdAt", "desc"));
    
    unsubscribeMine = onSnapshot(
        q,
        (snapshot) => {
            myNotebooks = mapQuerySnapshot(snapshot);
            renderMyNotebooks();
            updateTopicDropdown();
        },
        (err) => {
            console.error("My notebooks sync error:", err);
            myNotebooks = [];
            renderMyNotebooks();
            updateTopicDropdown();
        }
    );
}

function updateAuthUI() {
    const avatar = document.getElementById("userAvatar");
    const login = document.getElementById("loginBtn");
    const profileInitials = document.getElementById("profileInitials");
    const profileName = document.getElementById("profileName");
    const profileEmail = document.getElementById("profileEmail");
    const badge = document.getElementById("verificationBadge");
    const verifyBtn = document.getElementById("verifyBtn");
    const viewMyNotebooksBtn = document.getElementById("viewMyNotebooksBtn");
    const publicNameInput = document.getElementById("publicNameInput");
    const adminReviewBtn = document.getElementById("adminReviewBtn");

    if (hasAccount()) {
        login?.classList.add("hidden");
        avatar?.classList.remove("hidden");
        if (profileInitials) profileInitials.innerText = (user.email ? user.email[0] : "M").toUpperCase();
        if (profileName) profileName.innerText = user.displayName || "Member";
        if (profileEmail) profileEmail.innerText = user.email || "No email associated";
        viewMyNotebooksBtn?.classList.remove("hidden");

        // Show admin button for admin users
        if (adminReviewBtn) adminReviewBtn.classList.toggle("hidden", !isAdmin());

        if (publicNameInput) {
            publicNameInput.value = user.displayName || "";
        }

        if (user.emailVerified) {
            if (badge) {
                badge.className =
                    "inline-flex items-center px-3 py-1 rounded-full text-xs font-bold mb-4 bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400";
                badge.innerHTML = '<i data-lucide="check-circle" class="w-3 h-3 mr-1"></i> Verified';
            }
            verifyBtn?.classList.add("hidden");
        } else {
            if (badge) {
                badge.className =
                    "inline-flex items-center px-3 py-1 rounded-full text-xs font-bold mb-4 bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400";
                badge.innerHTML = '<i data-lucide="alert-circle" class="w-3 h-3 mr-1"></i> Unverified';
            }
            verifyBtn?.classList.remove("hidden");
        }
    } else {
        login?.classList.remove("hidden");
        avatar?.classList.add("hidden");
        viewMyNotebooksBtn?.classList.add("hidden");
        adminReviewBtn?.classList.add("hidden");

        if (profileInitials) profileInitials.innerText = "U";
        if (profileName) profileName.innerText = "User Name";
        if (profileEmail) profileEmail.innerText = "user@example.com";
        if (badge) {
            badge.className = "hidden";
            badge.innerHTML = "";
        }
        verifyBtn?.classList.add("hidden");

        if (publicNameInput) {
            publicNameInput.value = "";
        }
    }

    lucide?.createIcons?.();
}

// Allow router.js and standalone pages to re-run UI init after template swaps.
window.updateAuthUI = updateAuthUI;

function renderCategoryFilters() {
    const container = document.getElementById("categoryFilters");
    if (!container) return;

    const topics = [...new Set(publicNotebooks.map((nb) => nb.category).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b)
    );

    container.innerHTML = "";

    const label = document.createElement("span");
    label.className = "text-xs font-bold text-gray-400 uppercase tracking-widest mr-2";
    label.textContent = "Trending:";
    container.appendChild(label);

    const allButton = document.createElement("button");
    allButton.type = "button";
    allButton.textContent = "All";
    allButton.onclick = () => window.filterByCategory("All");
    allButton.className =
        activeCategory === "All"
            ? "px-4 py-1.5 rounded-full bg-blue-600 text-white text-sm font-medium"
            : "px-4 py-1.5 rounded-full bg-white dark:bg-darkCard border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-sm font-medium hover:border-blue-400 transition-colors";
    container.appendChild(allButton);

    topics.forEach((topic) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = topic;
        btn.onclick = () => window.filterByCategory(topic);
        btn.className =
            activeCategory === topic
                ? "px-4 py-1.5 rounded-full bg-blue-600 text-white text-sm font-medium"
                : "px-4 py-1.5 rounded-full bg-white dark:bg-darkCard border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-sm font-medium hover:border-blue-400 transition-colors";
        container.appendChild(btn);
    });
}

window.filterByCategory = (category) => {
    activeCategory = category;
    renderCategoryFilters();
    filterAndRender();
};

function filterAndRender() {
    const query = (document.getElementById("searchInput")?.value || "").toLowerCase();

    const filtered = publicNotebooks.filter((nb) => {
        const matchesSearch =
            (nb.title || "").toLowerCase().includes(query) ||
            (nb.description || "").toLowerCase().includes(query);
        const matchesCategory = activeCategory === "All" || nb.category === activeCategory;
        return matchesSearch && matchesCategory;
    });

    renderNotebooks(filtered);
}

function sourceLabel(value) {
    const numeric = Number.parseInt(value, 10);
    if (Number.isNaN(numeric) || numeric < 0) {
        return "Sources not set";
    }
    return `${numeric} Sources`;
}

function getRatingsStats(average, count, ratings) {
    const explicitCount = Number.parseInt(count, 10);
    const explicitAverage = Number(average);
    if (Number.isFinite(explicitCount) && explicitCount > 0 && Number.isFinite(explicitAverage)) {
        return { average: explicitAverage, count: explicitCount };
    }

    if (!ratings || typeof ratings !== "object") {
        return { average: null, count: 0 };
    }

    const values = Object.values(ratings)
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value >= 1 && value <= 5);
    if (!values.length) {
        return { average: null, count: 0 };
    }

    const sum = values.reduce((acc, value) => acc + value, 0);
    return { average: sum / values.length, count: values.length };
}

function ratingLabel(average, count, ratings) {
    const stats = getRatingsStats(average, count, ratings);
    if (!stats.count || !Number.isFinite(stats.average)) {
        return "No ratings";
    }
    return `${stats.average.toFixed(1)} (${stats.count})`;
}

function renderNotebooks(data) {
    const container = document.getElementById("notebookContainer");
    const empty = document.getElementById("emptyState");
    if (!container || !empty) return;

    container.innerHTML = "";

    if (!data.length) {
        empty.classList.remove("hidden");
        return;
    }
    empty.classList.add("hidden");

    const isGrid = window.currentView !== "row";
    container.className = isGrid
        ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        : "flex flex-col space-y-3";

    data.forEach((nb) => {
        const safeTitle = escapeHtml(nb.title || "Untitled notebook");
        const safeDescription = escapeHtml(nb.description || "No summary provided.");
        const safeCategory = escapeHtml(nb.category || "General");
        const encodedUrl = encodeURIComponent(nb.url || "");
        const notebookId = nb.id || "";

        if (isGrid) {
            container.innerHTML += `
                <div class="notebook-card bg-white dark:bg-darkCard rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col group cursor-pointer" onclick="openNotebookByUrl('${encodedUrl}')">
                    <div class="p-5 flex-1">
                        <div class="flex items-center justify-between mb-3 gap-3">
                            <span class="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide">${safeCategory}</span>
                            <span class="text-[10px] text-emerald-600 dark:text-emerald-300 font-semibold uppercase tracking-wide">Approved</span>
                        </div>
                        <h3 class="font-bold text-lg mb-2 line-clamp-2">${safeTitle}</h3>
                        <p class="text-gray-500 dark:text-gray-400 text-sm mb-4 line-clamp-3">${safeDescription}</p>
                        <div class="flex items-center justify-between text-xs font-semibold text-gray-500 dark:text-gray-400">
                            <span>${sourceLabel(nb.sources)}</span>
                            <span>${ratingLabel(nb.ratingAverage, nb.ratingCount, nb.ratings)}</span>
                        </div>
                    </div>
                    <div class="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between gap-2">
                        <div class="flex items-center gap-2">
                            <button type="button" class="rate-btn px-2 py-1 rounded-lg text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20" data-notebook-id="${escapeHtml(notebookId)}">Rate</button>
                            <button type="button" class="report-btn px-2 py-1 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" data-notebook-id="${escapeHtml(notebookId)}">Report</button>
                        </div>
                        <button class="text-xs font-bold text-blue-600 group-hover:underline">VIEW NOTEBOOK</button>
                    </div>
                </div>
            `;
        } else {
            container.innerHTML += `
                <div class="bg-white dark:bg-darkCard rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-all cursor-pointer" onclick="openNotebookByUrl('${encodedUrl}')">
                    <div class="flex-1 min-w-0">
                        <h3 class="font-bold truncate">${safeTitle}</h3>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">${safeDescription}</p>
                        <div class="flex items-center space-x-2 text-[10px] font-bold text-gray-400 uppercase tracking-tighter mt-2">
                            <span>${safeCategory}</span>
                            <span class="text-gray-200 dark:text-gray-700">|</span>
                            <span>${sourceLabel(nb.sources)}</span>
                            <span class="text-gray-200 dark:text-gray-700">|</span>
                            <span>${ratingLabel(nb.ratingAverage, nb.ratingCount, nb.ratings)}</span>
                        </div>
                    </div>
                    <div class="text-right ml-4 space-y-1">
                        <button type="button" class="rate-btn block px-2 py-1 rounded-lg text-[10px] font-semibold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 ml-auto" data-notebook-id="${escapeHtml(notebookId)}">Rate</button>
                        <button type="button" class="report-btn block px-2 py-1 rounded-lg text-[10px] font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 ml-auto" data-notebook-id="${escapeHtml(notebookId)}">Report</button>
                    </div>
                </div>
            `;
        }
    });

    container.querySelectorAll(".rate-btn").forEach((button) => {
        button.addEventListener("click", async (event) => {
            event.stopPropagation();
            const notebookId = event.currentTarget.getAttribute("data-notebook-id");
            await submitRating(notebookId);
        });
    });

    container.querySelectorAll(".report-btn").forEach((button) => {
        button.addEventListener("click", async (event) => {
            event.stopPropagation();
            const notebookId = event.currentTarget.getAttribute("data-notebook-id");
            await submitReport(notebookId);
        });
    });

    lucide.createIcons();
}

function statusClass(notebook) {
    const status = notebook.reviewStatus || "pending";
    if (status === "approved" && notebook.isPublic === true) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
    if (status === "declined") return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
    if (status === "private" || notebook.isPublic !== true) return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
    return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
}

function renderMyNotebooks() {
    const list = document.getElementById("myNotebooksList");
    if (!list) return;

    if (!hasAccount()) {
        list.innerHTML = `
            <div class="text-sm text-gray-500 dark:text-gray-400 py-6 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                Sign in with an account to manage your notebooks.
            </div>
        `;
        return;
    }

    const mine = [...myNotebooks].sort((a, b) => (b.id || "").localeCompare(a.id || ""));

    if (!mine.length) {
        list.innerHTML = `
            <div class="text-sm text-gray-500 dark:text-gray-400 py-6 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                You have not submitted any notebooks yet.
            </div>
        `;
        return;
    }

    list.innerHTML = "";

    mine.forEach((nb) => {
        const status = nb.reviewStatus || "pending";
        const label = getStatusLabel(nb);

        const isPublic = nb.isPublic === true;
        const isPending = status === "pending";
        const isActionDisabled = isPending;

        const item = document.createElement("div");
        item.className = "border border-gray-200 dark:border-gray-700 rounded-xl p-3 bg-gray-50 dark:bg-darkBg/50";
        item.innerHTML = `
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div class="min-w-0 w-full">
                    <p class="font-semibold truncate">${escapeHtml(nb.title || "Untitled notebook")}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">${escapeHtml(nb.category || "General")} • ${sourceLabel(nb.sources)}</p>
                </div>
                <span class="self-start sm:self-auto px-2.5 py-1 rounded-lg text-xs font-semibold ${statusClass(nb)}">${escapeHtml(label)}</span>
            </div>
            <div class="mt-2 text-xs text-gray-500 dark:text-gray-400 truncate">${escapeHtml(nb.url || "")}</div>
            <div class="mt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <button type="button" class="open-notebook w-full sm:w-auto text-center px-2.5 py-1 rounded-lg text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                    Open
                </button>
                <button type="button" class="visibility-action w-full sm:w-auto px-2.5 py-1 rounded-lg text-xs font-semibold ${
                    isActionDisabled
                        ? "bg-gray-200 text-gray-500 dark:bg-gray-800 dark:text-gray-400 cursor-not-allowed"
                        : "bg-gray-900 text-white hover:bg-black"
                }" ${isActionDisabled ? "disabled" : ""}>
                    ${
                        isPublic
                            ? "Make Private"
                            : "Make Public (Review)"
                    }
                </button>
            </div>
        `;

        const openBtn = item.querySelector(".open-notebook");
        const actionBtn = item.querySelector(".visibility-action");

        openBtn.addEventListener("click", () => {
            const safeUrl = sanitizeNotebookUrl(nb.url || "");
            if (!safeUrl) {
                showToast("Invalid notebook URL", "error");
                return;
            }
            window.open(safeUrl, "_blank", "noopener,noreferrer");
        });

        actionBtn.addEventListener("click", async () => {
            if (isPending) {
                showToast("This notebook is currently under review", "info");
                return;
            }

            if (isPublic) {
                await makeNotebookPrivate(nb);
                return;
            }

            await requestPublicReview(nb);
        });

        list.appendChild(item);
    });
}

async function requestPublicReview(notebook) {
    if (!db || !hasAccount() || !notebook?.id) return;

    try {
        await update(ref(db, `users/${user.uid}/notebooks/${notebook.id}`), {
            isPublic: false,
            reviewStatus: "pending",
            reviewMessage: "Awaiting reviewer approval"
        });
        await remove(ref(db, `publicNotebooks/${notebook.id}`)).catch(() => {
            // ignore if missing or restricted
        });

        showToast("Sent for review", "success");
    } catch (err) {
        console.error(err);
        showToast("Failed to send for review", "error");
    }
}

async function makeNotebookPrivate(notebook) {
    if (!db || !hasAccount() || !notebook?.id) return;

    try {
        await update(ref(db, `users/${user.uid}/notebooks/${notebook.id}`), {
            isPublic: false
        });
        await remove(ref(db, `publicNotebooks/${notebook.id}`)).catch(() => {
            // ignore if missing or restricted
        });

        showToast("Notebook is now private", "success");
    } catch (err) {
        console.error(err);
        showToast("Failed to update visibility", "error");
    }
}

async function submitRating(notebookId) {
    if (!notebookId || !db) return;
    if (!user) {
        showToast("Log in to rate notebooks", "info");
        window.toggleModal("authModal");
        return;
    }

    const input = prompt("Rate this notebook from 1 to 5");
    if (input === null) return;

    const rating = Number.parseInt(input, 10);
    if (Number.isNaN(rating) || rating < 1 || rating > 5) {
        showToast("Rating must be a number from 1 to 5", "error");
        return;
    }

    const notebook = publicNotebooks.find((nb) => nb.id === notebookId);
    if (!notebook || notebook.isPublic !== true || (notebook.reviewStatus || "approved") !== "approved") {
        showToast("Notebook is no longer available for rating", "error");
        return;
    }

    try {
        await set(ref(db, `publicNotebooks/${notebookId}/ratings/${user.uid}`), rating);
        showToast("Rating submitted", "success");
    } catch (err) {
        console.error(err);
        showToast("Failed to submit rating", "error");
    }
}

async function submitReport(notebookId) {
    if (!notebookId || !db) return;
    if (!user) {
        showToast("Log in to report notebooks", "info");
        window.toggleModal("authModal");
        return;
    }

    const reason = prompt("Report reason (required)");
    if (reason === null) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
        showToast("Report reason cannot be empty", "error");
        return;
    }

    const notebook = publicNotebooks.find((nb) => nb.id === notebookId);
    if (!notebook || notebook.isPublic !== true || (notebook.reviewStatus || "approved") !== "approved") {
        showToast("Notebook is no longer available for reporting", "error");
        return;
    }

    try {
        await set(ref(db, `publicNotebooks/${notebookId}/reports/${user.uid}`), {
            reason: trimmedReason,
            createdAt: Date.now()
        });
        showToast("Report submitted", "success");
    } catch (err) {
        console.error(err);
        showToast("Failed to submit report", "error");
    }
}

function redirectTo(path) {
    if (window.router) {
        window.router.redirect(path);
        return;
    }
    window.location.href = path;
}

window.showHome = () => redirectTo("/");
window.showMyNotebooks = () => redirectTo("/my-notebooks");
window.showSettings = () => redirectTo("/settings");

window.handleShareClick = () => {
    if (!hasAccount()) {
        showToast("Please login to submit", "info");
        window.toggleModal("authModal");
        return;
    }
    if (!user.emailVerified) {
        showToast("Verify your email to submit", "warning");
        redirectTo("/settings");
        return;
    }
    redirectTo("/create");
};

// External UI Control bindings
window.openNotebookByUrl = (encodedUrl) => {
    let decoded = "";
    try {
        decoded = decodeURIComponent(encodedUrl || "");
    } catch (err) {
        showToast("Invalid notebook URL", "error");
        return;
    }

    const safeUrl = sanitizeNotebookUrl(decoded);
    if (!safeUrl) {
        showToast("Invalid notebook URL", "error");
        return;
    }

    window.open(safeUrl, "_blank", "noopener,noreferrer");
};

window.verifyEmail = async () => {
    if (user?.email) {
        try {
            await sendEmailVerification(user);
            showToast("Email verification link sent", "success");
        } catch (err) {
            console.error(err);
            showToast("Failed to send email", "error");
        }
    }
};

window.logout = async () => {
    if (!auth) return;
    await signOut(auth);
    redirectTo("/");
    showToast("Logged out", "info");
};

window.scrollToSearch = () => {
    const searchSection = document.getElementById('searchSection');
    if (searchSection) {
        searchSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Focus on search input after scrolling
        setTimeout(() => {
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.focus();
            }
        }, 500);
    }
};

window.toggleTheme = () => {
    document.documentElement.classList.toggle("dark");
    localStorage.theme = document.documentElement.classList.contains("dark") ? "dark" : "light";
};

window.toggleModal = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle("hidden");
};

window.savePublicName = async () => {
    if (!auth || !hasAccount()) {
        showToast("Sign in with email to set a public name", "error");
        return;
    }

    const input = document.getElementById("publicNameInput");
    if (!input) return;

    const name = input.value.trim();
    if (!name) {
        showToast("Public name cannot be empty", "error");
        return;
    }

    try {
        await updateProfile(user, { displayName: name });
        user.displayName = name;
        updateAuthUI();
        showToast("Public name updated", "success");
    } catch (err) {
        console.error(err);
        showToast("Failed to update name", "error");
    }
};

window.deleteAccount = async () => {
    if (!auth || !user) {
        showToast("No account to delete", "error");
        return;
    }

    if (!confirm("Delete your account and all associated data? This cannot be undone.")) {
        return;
    }

    try {
        await deleteUser(user);
        user = null;
        document.getElementById("myNotebooksModal")?.classList.add("hidden");
        redirectTo("/");
        updateAuthUI();
        showToast("Account deleted", "success");
    } catch (err) {
        console.error(err);
        if (err.code === "auth/requires-recent-login") {
            showToast("Please log in again, then delete your account", "error");
        } else {
            showToast("Failed to delete account", "error");
        }
    }
};

window.handleEmailAuth = async (mode) => {
    if (!auth) {
        showToast("Firebase not configured", "error");
        return;
    }

    const emailEl = document.getElementById("auth_email");
    const passEl = document.getElementById("auth_password");
    const email = emailEl?.value.trim() || "";
    const password = passEl?.value || "";

    if (!email || !password) {
        showToast("Enter email and password", "error");
        return;
    }

    try {
        if (mode === "signup") {
            const cred = await createUserWithEmailAndPassword(auth, email, password);
            user = cred.user;
            await sendEmailVerification(user);
            showToast("Account created. Verify your email.", "success");
        } else {
            await signInWithEmailAndPassword(auth, email, password);
            showToast("Logged in", "success");
        }
        window.toggleModal("authModal");
    } catch (err) {
        console.error("Email auth error:", err);
        if (err.code === 'auth/unauthorized-domain') {
            showToast("Please add localhost:8000 to authorized domains in Firebase Console", "error");
        } else if (err.code === 'auth/user-not-found') {
            showToast("No account found with this email", "error");
        } else if (err.code === 'auth/wrong-password') {
            showToast("Incorrect password", "error");
        } else if (err.code === 'auth/email-already-in-use') {
            showToast("Email already in use", "error");
        } else {
            showToast(err.message || "Authentication failed", "error");
        }
    }
};

window.handlePasswordReset = async () => {
    if (!auth) {
        showToast("Firebase not configured", "error");
        return;
    }

    const email = document.getElementById('auth_email').value;
    if (!email) {
        showToast("Please enter your email address", "error");
        return;
    }

    try {
        await sendPasswordResetEmail(auth, email);
        showToast("Password reset email sent! Check your inbox.", "success");
        toggleModal('authModal');
    } catch (error) {
        console.error("Password reset error:", error);
        showToast(error.message, "error");
    }
};

window.showPasswordChangeModal = () => {
    toggleModal('passwordChangeModal');
};

window.showEmailChangeModal = () => {
    toggleModal('emailChangeModal');
};

window.changePassword = async (event) => {
    event.preventDefault();
    
    if (!auth || !user) {
        showToast("Not authenticated", "error");
        return;
    }

    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmNewPassword = document.getElementById('confirmNewPassword').value;

    if (newPassword !== confirmNewPassword) {
        showToast("New passwords don't match", "error");
        return;
    }

    if (newPassword.length < 6) {
        showToast("Password must be at least 6 characters", "error");
        return;
    }

    try {
        // Reauthenticate user with current password
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);
        
        // Update password
        await updatePassword(user, newPassword);
        
        showToast("Password updated successfully!", "success");
        toggleModal('passwordChangeModal');
        
        // Clear form
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmNewPassword').value = '';
    } catch (error) {
        console.error("Password change error:", error);
        if (error.code === 'auth/wrong-password') {
            showToast("Current password is incorrect", "error");
        } else {
            showToast(error.message, "error");
        }
    }
};

window.changeEmail = async (event) => {
    event.preventDefault();
    
    if (!auth || !user) {
        showToast("Not authenticated", "error");
        return;
    }

    const password = document.getElementById('emailPassword').value;
    const newEmail = document.getElementById('newEmail').value;

    if (newEmail === user.email) {
        showToast("New email is the same as current email", "error");
        return;
    }

    try {
        // Reauthenticate user with password
        const credential = EmailAuthProvider.credential(user.email, password);
        await reauthenticateWithCredential(user, credential);
        
        // Update email
        await updateEmail(user, newEmail);
        
        // Send verification email
        await sendEmailVerification(user);
        
        showToast("Email updated! Please verify your new email address.", "success");
        toggleModal('emailChangeModal');
        
        // Clear form
        document.getElementById('emailPassword').value = '';
        document.getElementById('newEmail').value = '';
        
        // Update UI
        if (window.updateAuthUI) {
            window.updateAuthUI();
        }
    } catch (error) {
        console.error("Email change error:", error);
        if (error.code === 'auth/wrong-password') {
            showToast("Current password is incorrect", "error");
        } else if (error.code === 'auth/email-already-in-use') {
            showToast("Email address is already in use", "error");
        } else {
            showToast(error.message, "error");
        }
    }
};

window.continueAsGuest = async () => {
    if (!auth) {
        showToast("Firebase not configured", "error");
        return;
    }

    try {
        await signInAnonymously(auth);
        window.toggleModal("authModal");
        showToast("Continuing as guest", "info");
    } catch (err) {
        console.error(err);
        showToast("Guest sign-in failed", "error");
    }
};

window.signInWithGoogle = async () => {
    if (!auth) {
        showToast("Firebase not configured", "error");
        return;
    }

    try {
        const provider = new GoogleAuthProvider();
        provider.addScope('email');
        provider.addScope('profile');
        await signInWithPopup(auth, provider);
        window.toggleModal("authModal");
        showToast("Signed in with Google", "success");
    } catch (err) {
        console.error("Google sign-in error:", err);
        if (err.code === 'auth/unauthorized-domain') {
            showToast("Please add localhost:8000 to authorized domains in Firebase Console", "error");
        } else {
            showToast("Google sign-in failed: " + err.message, "error");
        }
    }
};

window.handleProfileClick = () => {
    if (hasAccount()) {
        redirectTo("/settings");
    } else {
        showToast("Please login first", "info");
        window.toggleModal("authModal");
    }
};

// Admin Review Functions
window.startReviewSync = () => {
    if (!db || !isAdmin()) return;
    if (unsubscribeReview) {
        unsubscribeReview();
        unsubscribeReview = null;
    }

    // Use collection group query to get all notebooks across all users
    const notebooksRef = collectionGroup(db, "notebooks");
    const q = query(notebooksRef, where("reviewStatus", "==", "pending"));
    
    unsubscribeReview = onSnapshot(
        q,
        (snapshot) => {
            reviewQueue = [];
            snapshot.forEach((notebookDoc) => {
                reviewQueue.push({
                    id: notebookDoc.id,
                    userId: notebookDoc.ref.parent.parent.id,
                    userEmail: notebookDoc.ref.parent.parent.id,
                    ...notebookDoc.data()
                });
            });
            renderReviewQueue();
        },
        (err) => {
            console.error("Review queue sync error:", err);
            reviewQueue = [];
            renderReviewQueue();
        }
    );
};

window.renderReviewQueue = () => {
    const list = document.getElementById("reviewQueueList");
    const emptyState = document.getElementById("emptyReviewState");
    if (!list || !emptyState) return;

    const filtered = reviewQueue.filter(nb => nb.reviewStatus === currentReviewFilter);
    
    if (!filtered.length) {
        list.classList.add("hidden");
        emptyState.classList.remove("hidden");
        return;
    }

    list.classList.remove("hidden");
    emptyState.classList.add("hidden");

    list.innerHTML = filtered.map(nb => `
        <div class="bg-white dark:bg-darkCard rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-lg transition-shadow">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div class="flex-1">
                    <h3 class="font-semibold text-lg mb-1">${escapeHtml(nb.title)}</h3>
                    <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">${escapeHtml(nb.description)}</p>
                    <div class="flex items-center gap-4 text-xs text-gray-500">
                        <span class="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">${escapeHtml(nb.category)}</span>
                        <span>Submitted by: ${escapeHtml(nb.userEmail || nb.userId)}</span>
                        <span>${nb.createdAt?.toDate()?.toLocaleDateString() || 'Unknown date'}</span>
                    </div>
                </div>
                <button onclick="window.openReviewDetail('${nb.id}', '${nb.userId}')" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                    <i data-lucide="eye" class="w-4 h-4 mr-1"></i> Review
                </button>
            </div>
        </div>
    `).join('');

    lucide.createIcons();
};

window.filterReviewQueue = (filter) => {
    currentReviewFilter = filter;
    
    // Update tab styles
    document.querySelectorAll('[id$="Tab"]').forEach(tab => {
        tab.classList.remove('bg-white', 'dark:bg-gray-700', 'text-blue-600', 'shadow-sm');
        tab.classList.add('text-gray-600', 'dark:text-gray-300');
    });
    
    const activeTab = document.getElementById(filter + 'Tab');
    if (activeTab) {
        activeTab.classList.add('bg-white', 'dark:bg-gray-700', 'text-blue-600', 'shadow-sm');
        activeTab.classList.remove('text-gray-600', 'dark:text-gray-300');
    }
    
    renderReviewQueue();
};

window.openReviewDetail = async (notebookId, userId) => {
    if (!db || !isAdmin()) return;
    
    try {
        const notebookRef = doc(db, "users", userId, "notebooks", notebookId);
        const notebookSnap = await getDoc(notebookRef);
        
        if (notebookSnap.exists()) {
            currentReviewNotebook = {
                id: notebookId,
                userId: userId,
                ...notebookSnap.data()
            };
            
            // Show loading state
            document.getElementById('reviewLoadingState').classList.add('hidden');
            document.getElementById('reviewForm').classList.remove('hidden');
            
            // Populate form
            document.getElementById('review_url').value = currentReviewNotebook.url || '';
            document.getElementById('review_title').value = currentReviewNotebook.title || '';
            document.getElementById('review_description').value = currentReviewNotebook.description || '';
            document.getElementById('review_category').value = currentReviewNotebook.category || '';
            document.getElementById('review_sources').value = currentReviewNotebook.sources || '';
            document.getElementById('review_message').value = currentReviewNotebook.reviewMessage || '';
            
            // Update character counters
            updateCharCounters();
            
            window.router.redirect('/admin-review-detail');
        }
    } catch (err) {
        console.error("Error loading notebook for review:", err);
        showToast("Failed to load notebook", "error");
    }
};

window.updateCharCounters = () => {
    const titleInput = document.getElementById('review_title');
    const descInput = document.getElementById('review_description');
    const messageInput = document.getElementById('review_message');
    
    const updateCounter = (input, counterId, max) => {
        const counter = document.getElementById(counterId);
        if (input && counter) {
            counter.textContent = input.value.length;
            counter.className = input.value.length > max * 0.9 ? 'text-xs text-orange-500' : 'text-xs text-gray-500';
        }
    };
    
    if (titleInput) titleInput.addEventListener('input', () => updateCounter(titleInput, 'titleCount', 50));
    if (descInput) descInput.addEventListener('input', () => updateCounter(descInput, 'descCount', 300));
    if (messageInput) messageInput.addEventListener('input', () => updateCounter(messageInput, 'messageCount', 300));
    
    // Initial update
    updateCounter(titleInput, 'titleCount', 50);
    updateCounter(descInput, 'descCount', 300);
    updateCounter(messageInput, 'messageCount', 300);
};

window.submitReview = async (decision) => {
    if (!db || !isAdmin() || !currentReviewNotebook) return;
    
    const title = document.getElementById('review_title').value.trim();
    const description = document.getElementById('review_description').value.trim();
    const category = document.getElementById('review_category').value.trim();
    const sources = parseInt(document.getElementById('review_sources').value) || 0;
    const message = document.getElementById('review_message').value.trim();
    
    if (!title || !description || !category) {
        showToast("Please fill in all required fields", "warning");
        return;
    }
    
    const confirmMessage = decision === 'approved' 
        ? `Approve "${title}" and make it public?`
        : `Decline "${title}" and send feedback to user?`;
    
    if (!confirm(confirmMessage)) return;
    
    // Show loading state
    const approveBtn = document.querySelector('button[onclick*="approved"]');
    const declineBtn = document.querySelector('button[onclick*="declined"]');
    if (approveBtn) approveBtn.disabled = true;
    if (declineBtn) declineBtn.disabled = true;
    
    try {
        const notebookRef = doc(db, "users", currentReviewNotebook.userId, "notebooks", currentReviewNotebook.id);
        
        const updateData = {
            title,
            description,
            category,
            sources,
            reviewMessage: message || (decision === 'approved' ? 'Approved for public display' : 'Not approved at this time'),
            reviewStatus: decision,
            isPublic: decision === 'approved',
            reviewedAt: Timestamp.now(),
            reviewedBy: user.email
        };
        
        await updateDoc(notebookRef, updateData);
        
        // If approved, also add to public notebooks
        if (decision === 'approved') {
            const publicRef = doc(db, "publicNotebooks", currentReviewNotebook.id);
            await setDoc(publicRef, {
                ...currentReviewNotebook,
                ...updateData,
                ownerId: currentReviewNotebook.userId
            });
        }
        
        showToast(`Notebook ${decision} successfully! 🎉`, "success");
        currentReviewNotebook = null;
        
        // Redirect after a short delay
        setTimeout(() => {
            window.router.redirect('/admin-review');
        }, 1500);
        
    } catch (err) {
        console.error("Error submitting review:", err);
        showToast("Failed to submit review", "error");
        // Re-enable buttons
        if (approveBtn) approveBtn.disabled = false;
        if (declineBtn) declineBtn.disabled = false;
    }
};

// Cleanup admin review sync when navigating away
window.cleanupAdminReview = () => {
    if (unsubscribeReview) {
        unsubscribeReview();
        unsubscribeReview = null;
    }
    reviewQueue = [];
};

// Add keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter to submit form
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const activeElement = document.activeElement;
        if (activeElement && activeElement.form && activeElement.form.id === 'submissionForm') {
            activeElement.form.dispatchEvent(new Event('submit'));
        }
    }
    
    // Escape to close modals
    if (e.key === 'Escape') {
        const modals = document.querySelectorAll('.fixed.inset-0:not(.hidden)');
        modals.forEach(modal => {
            if (modal.id && modal.id.includes('Modal')) {
                window.toggleModal(modal.id);
            }
        });
    }
});

window.handleTopicChange = () => {
    const selector = document.getElementById("topicSelector");
    const customInput = document.getElementById("fb_custom_category");
    if (!selector || !customInput) return;

    if (selector.value === "CUSTOM") {
        customInput.classList.remove("hidden");
        customInput.focus();
    } else {
        customInput.classList.add("hidden");
    }
};

window.toggleFilterModal = () => {
    document.getElementById("topicModal")?.classList.toggle("hidden");
    populateTopicModal();
};

window.setView = (view) => {
    window.currentView = view;
    document.getElementById("gridBtn")?.classList.toggle("active-view", view === "grid");
    document.getElementById("rowBtn")?.classList.toggle("active-view", view === "row");
    filterAndRender();
};

function populateTopicModal() {
    const list = document.getElementById("allTopicsList");
    if (!list) return;

    const uniqueTopics = [...new Set(publicNotebooks.map((nb) => nb.category).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b)
    );

    list.innerHTML = "";

    uniqueTopics.forEach((topic) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className =
            "px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all";
        button.textContent = topic;
        button.addEventListener("click", () => {
            window.filterByCategory(topic);
            window.toggleFilterModal();
        });
        list.appendChild(button);
    });
}

function updateTopicDropdown() {
    const selector = document.getElementById("topicSelector");
    if (!selector) return;

    const dynamicTopics = [
        ...new Set(
            [...publicNotebooks.map((nb) => nb.category), ...myNotebooks.map((nb) => nb.category)].filter(Boolean)
        )
    ].sort((a, b) => a.localeCompare(b));

    const currentVal = selector.value;
    selector.innerHTML = "";

    const generalOption = document.createElement("option");
    generalOption.value = "General";
    generalOption.textContent = "General";
    selector.appendChild(generalOption);

    dynamicTopics.forEach((topic) => {
        if (topic === "General") return;
        const option = document.createElement("option");
        option.value = topic;
        option.textContent = topic;
        selector.appendChild(option);
    });

    const customOption = document.createElement("option");
    customOption.value = "CUSTOM";
    customOption.textContent = "+ Custom Topic";
    selector.appendChild(customOption);

    selector.value = currentVal;
    if (selector.value !== currentVal) {
        selector.value = "General";
    }
}

function showToast(message, type) {
    const toast = document.getElementById("toast");
    const icon = document.getElementById("toastIcon");
    const messageEl = document.getElementById("toastMsg");
    if (!toast || !icon || !messageEl) return;

    messageEl.innerText = message;
    
    const iconHTML = {
        error: '<i data-lucide="x-circle" class="text-red-500"></i>',
        success: '<i data-lucide="check-circle" class="text-green-500"></i>',
        warning: '<i data-lucide="alert-triangle" class="text-orange-500"></i>',
        info: '<i data-lucide="info" class="text-blue-500"></i>'
    };
    
    icon.innerHTML = iconHTML[type] || iconHTML.info;

    lucide.createIcons();

    toast.className =
        "fixed bottom-6 right-6 translate-y-0 opacity-100 bg-white dark:bg-darkCard border border-gray-200 dark:border-gray-700 px-6 py-4 rounded-2xl shadow-2xl z-[100] transition-all flex items-center transform scale-100";

    setTimeout(() => {
        toast.className =
            "fixed bottom-6 right-6 translate-y-20 opacity-0 bg-white dark:bg-darkCard border border-gray-200 dark:border-gray-700 px-6 py-4 rounded-2xl shadow-2xl z-[100] transition-all flex items-center transform scale-95";
    }, 3000);
}

function updateSubmissionButtonLabel() {
    const visibilityEl = document.getElementById("fb_visibility");
    const submitBtn = document.getElementById("submissionSubmitBtn");
    if (!visibilityEl || !submitBtn) return;

    const visibility = visibilityEl.value === "private" ? "private" : "public";
    submitBtn.textContent = visibility === "private" ? "Upload" : "Submit for Evaluation";
}

document.getElementById("submissionForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!db) {
        showToast("Realtime Database is not configured", "error");
        return;
    }

    if (!hasAccount()) {
        showToast("Sign in to submit notebooks", "error");
        window.toggleModal("authModal");
        return;
    }

    if (!user.emailVerified) {
        showToast("Verify your email before submitting", "error");
        return;
    }

    const titleEl = document.getElementById("fb_title");
    const descriptionEl = document.getElementById("fb_description");
    const urlEl = document.getElementById("fb_url");
    const topicSelector = document.getElementById("topicSelector");
    const customTopicEl = document.getElementById("fb_custom_category");
    const visibilityEl = document.getElementById("fb_visibility");

    const title = (titleEl?.value || "").trim();
    const description = (descriptionEl?.value || "").trim();
    const url = (urlEl?.value || "").trim();
    const visibility = visibilityEl?.value === "private" ? "private" : "public";

    let category = topicSelector?.value || "General";
    if (category === "CUSTOM") {
        category = (customTopicEl?.value || "").trim();
    }

    if (!title || !description || !url || !category) {
        showToast("Please fill all required fields", "error");
        return;
    }

    if (title.length > TITLE_MAX) {
        showToast(`Title must be ${TITLE_MAX} characters or less`, "error");
        return;
    }

    if (description.length > DESCRIPTION_MAX) {
        showToast(`Summary must be ${DESCRIPTION_MAX} characters or less`, "error");
        return;
    }

    if (!validateNotebookUrl(url)) {
        showToast("Notebook URL must start with https://notebooklm.google.com/notebook/", "error");
        return;
    }

    const safeUrl = sanitizeNotebookUrl(url);
    if (!safeUrl) {
        showToast("Invalid notebook URL", "error");
        return;
    }

    try {
        const notebookRef = collection(db, "users", user.uid, "notebooks");
        
        const payload = {
            ownerId: user.uid,
            title,
            description,
            url: safeUrl,
            category,
            sources: null,
            isPublic: false,
            reviewStatus: visibility === "private" ? "private" : "pending",
            reviewMessage:
                visibility === "private"
                    ? "Saved as private notebook"
                    : "Submitted for reviewer evaluation",
            createdAt: Timestamp.now()
        };

        await addDoc(notebookRef, payload);

        // If public submission, also add to review queue
        if (visibility === "public") {
            const reviewQueueRef = collection(db, "reviewQueue");
            await addDoc(reviewQueueRef, {
                ...payload,
                originalNotebookId: null // Will be set after document creation
            });
        }

        if (visibility === "private") {
            showToast("Saved as private notebook", "success");
        } else {
            showToast("Submitted for evaluation", "success");
        }

        document.getElementById("submissionForm")?.reset();
        document.getElementById("fb_custom_category")?.classList.add("hidden");
        // After submit, take user to their notebooks page
        redirectTo("/my-notebooks");
    } catch (err) {
        console.error(err);
        showToast("Submission failed", "error");
    }
});

// Expose functions used by router.js page initializers.
window.filterAndRender = filterAndRender;
window.renderCategoryFilters = renderCategoryFilters;
window.populateTopicModal = populateTopicModal;
window.updateTopicDropdown = updateTopicDropdown;
window.renderMyNotebooks = renderMyNotebooks;
window.updateSubmissionButtonLabel = updateSubmissionButtonLabel;

document.getElementById("fb_visibility")?.addEventListener("change", updateSubmissionButtonLabel);

document.getElementById("searchInput")?.addEventListener("input", filterAndRender);
window.currentView = "grid";
renderCategoryFilters();
filterAndRender();
populateTopicModal();
updateTopicDropdown();
renderMyNotebooks();
lucide?.createIcons?.();
