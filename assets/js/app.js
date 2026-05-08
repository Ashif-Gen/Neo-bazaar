/* =========================
   BACKEND URL
   Single source of truth — update this if your backend URL ever changes.
   Must be absolute because the frontend is a separate Vercel deployment.
========================= */
const API_BASE = 'https://neo-bazaar.vercel.app';

/* =========================
   ELEMENT SELECTORS
========================= */
const loginBtn         = document.getElementById('loginBtn');
const loginModal       = document.getElementById('loginModal');
const closeModal       = document.getElementById('closeModal');
const loginSubmit      = document.getElementById('loginSubmit');
const productContainer = document.getElementById('productContainer');

/* =========================
   MODAL LOGIC
========================= */

// Open Modal
if (loginBtn) {
    loginBtn.addEventListener('click', () => {
        loginModal.classList.remove('hidden');
    });
}

// Close Modal (Cancel Button)
if (closeModal) {
    closeModal.addEventListener('click', () => {
        loginModal.classList.add('hidden');
    });
}

// Close Modal (Clicking Outside the Box)
window.addEventListener('click', (e) => {
    if (e.target === loginModal) {
        loginModal.classList.add('hidden');
    }
});

/* =========================
   LOGIN LOGIC
========================= */

if (loginSubmit) {
    loginSubmit.addEventListener('click', async () => {
        const email     = document.getElementById('loginEmail').value;
        const password  = document.getElementById('loginPassword').value;
        const errorMsg  = document.getElementById('loginError');

        // Reset error message
        errorMsg.classList.add('hidden');

        try {
            // FIX: was '/api/admin/login' (relative — breaks on separate frontend deployment)
            const response = await fetch(`${API_BASE}/api/admin/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (data.success) {
                window.location.href = data.redirectUrl;
            } else {
                errorMsg.innerText = data.message || 'Invalid credentials';
                errorMsg.classList.remove('hidden');
            }
        } catch (err) {
            console.error('Login Error:', err);
            errorMsg.innerText = 'Server error. Please try again.';
            errorMsg.classList.remove('hidden');
        }
    });
}

/* =========================
   PRODUCT DISPLAY LOGIC
========================= */

// Resolve a product image URL.
// Images uploaded via multer are stored as paths like "/uploads/filename.jpg"
// and must be served from the backend origin, not the frontend origin.
function resolveImageUrl(src) {
    if (!src) return ''; // No image provided
    if (src.startsWith('http://') || src.startsWith('https://')) {
        return src; // Already an absolute URL (e.g. Cloudinary, S3)
    }
    // Relative path from the backend — prepend the backend base URL
    return `${API_BASE}${src.startsWith('/') ? '' : '/'}${src}`;
}

async function fetchProducts() {
    if (!productContainer) return;

    // Show a loading state while fetching
    productContainer.innerHTML = `
        <div class="col-span-full text-center text-gray-400 py-16">
            <div class="text-4xl mb-3">⏳</div>
            <p class="text-sm">Loading products…</p>
        </div>`;

    try {
        // FIX: was '/api/products' (relative — breaks on separate frontend deployment)
        const res = await fetch(`${API_BASE}/api/products`);

        if (!res.ok) {
            throw new Error(`Server responded with ${res.status}`);
        }

        const products = await res.json();

        if (!Array.isArray(products) || products.length === 0) {
            productContainer.innerHTML = `
                <div class="col-span-full text-center text-gray-400 py-16">
                    <div class="text-4xl mb-3">🛍️</div>
                    <p class="text-sm">No products yet. Check back soon!</p>
                </div>`;
            return;
        }

        productContainer.innerHTML = products.map(p => {
            // FIX: image src must go through resolveImageUrl so that paths like
            // "/uploads/abc.jpg" are rewritten to
            // "https://neo-bazaar.vercel.app/uploads/abc.jpg"
            const imgSrc = resolveImageUrl(p.image);

            const discountBadge = (p.discount && p.originalPrice) ? `
                <div class="flex items-center gap-2 mb-1">
                    <span class="text-gray-500 text-xs line-through">₹${Number(p.originalPrice).toLocaleString()}</span>
                    <span class="text-[10px] bg-orange-500/20 text-orange-400 font-bold px-1.5 py-0.5 rounded-md">${p.discount}% OFF</span>
                </div>` : '';

            return `
                <div class="bg-slate-800 border border-slate-700 p-4 rounded-2xl shadow-lg transition-transform hover:scale-105">
                    <div class="w-full h-48 bg-slate-700 rounded-xl mb-4 overflow-hidden flex items-center justify-center">
                        ${imgSrc
                            ? `<img
                                src="${imgSrc}"
                                alt="${p.name}"
                                class="w-full h-full object-cover"
                                onerror="this.parentNode.innerHTML='<span class=\\'text-4xl\\'>🛍️</span>'">`
                            : `<span class="text-4xl">🛍️</span>`
                        }
                    </div>
                    <h3 class="text-xl font-bold text-white">${p.name}</h3>
                    <p class="text-gray-400 text-sm">${p.brand || ''}</p>
                    <div class="mt-4 flex justify-between items-center">
                        <div>
                            ${discountBadge}
                            <span class="text-indigo-400 font-bold text-xl">₹${Number(p.price).toLocaleString()}</span>
                        </div>
                        <button
                            class="bg-indigo-500 hover:bg-fuchsia-500 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                            onclick="addToCart('${p._id}')">
                            Add to Cart
                        </button>
                    </div>
                </div>`;
        }).join('');

    } catch (err) {
        console.error('Error fetching products:', err);
        productContainer.innerHTML = `
            <div class="col-span-full text-center text-red-400 py-16">
                <div class="text-4xl mb-3">⚠️</div>
                <p class="text-sm">Could not load products. Please try again later.</p>
            </div>`;
    }
}

/* =========================
   CART HELPER (stub — wire up to your cart logic)
========================= */
function addToCart(productId) {
    // Pull the full cart from localStorage, add the item, and save it back.
    // This mirrors the pattern already used in index.html.
    const cart = JSON.parse(localStorage.getItem('cart')) || [];
    const existing = cart.find(i => i._id === productId);
    if (existing) {
        existing.quantity = (existing.quantity || 1) + 1;
    } else {
        // window.products is populated by index.html's loadProducts() —
        // if you move all product logic here, replace this with the local `products` array.
        const product = (window.products || []).find(p => p._id === productId);
        if (product) {
            cart.push({ _id: product._id, name: product.name, price: product.price, image: product.image, quantity: 1 });
        }
    }
    localStorage.setItem('cart', JSON.stringify(cart));
    localStorage.setItem('cartUpdated', Date.now().toString());
}

// Load products when the page opens
fetchProducts();