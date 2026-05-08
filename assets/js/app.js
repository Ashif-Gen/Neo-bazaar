/* =========================
   ELEMENT SELECTORS
========================= */
const loginBtn = document.getElementById('loginBtn');
const loginModal = document.getElementById('loginModal');
const closeModal = document.getElementById('closeModal');
const loginSubmit = document.getElementById('loginSubmit');
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
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        const errorMsg = document.getElementById('loginError');

        // Reset error message
        errorMsg.classList.add('hidden');

        try {
            // First, try logging in as ADMIN
            const response = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (data.success) {
                // If admin login is successful, redirect to dashboard
                window.location.href = data.redirectUrl;
            } else {
                // If admin fails, show error (or you could try user login logic here)
                errorMsg.innerText = data.message || "Invalid credentials";
                errorMsg.classList.remove('hidden');
            }
        } catch (err) {
            console.error("Login Error:", err);
            errorMsg.innerText = "Server error. Please try again.";
            errorMsg.classList.remove('hidden');
        }
    });
}

/* =========================
   PRODUCT DISPLAY LOGIC
========================= */

async function fetchProducts() {
    try {
        const res = await fetch('/api/products');
        const products = await res.json();

        if (products.length > 0) {
            productContainer.innerHTML = products.map(p => `
                <div class="bg-slate-800 border border-slate-700 p-4 rounded-2xl shadow-lg transition-transform hover:scale-105">
                    <img src="${p.image}" alt="${p.name}" class="w-full h-48 object-cover rounded-xl mb-4">
                    <h3 class="text-xl font-bold text-white">${p.name}</h3>
                    <p class="text-gray-400 text-sm">${p.brand}</p>
                    <div class="mt-4 flex justify-between items-center">
                        <span class="text-indigo-400 font-bold text-xl">₹${p.price}</span>
                        <button class="bg-indigo-500 hover:bg-fuchsia-500 text-white px-4 py-2 rounded-lg text-sm transition-colors">
                            Add to Cart
                        </button>
                    </div>
                </div>
            `).join('');
        }
    } catch (err) {
        console.error("Error fetching products:", err);
    }
}

// Load products when the page opens
fetchProducts();