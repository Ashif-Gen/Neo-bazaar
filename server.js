require("dotenv").config();

const jwt = require("jsonwebtoken");
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const bcrypt = require("bcrypt");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const https = require("https");
const dns = require('dns');

dns.setServers(['1.1.1.1','8.8.8.8']);

const app = express();
app.use(express.static(__dirname, {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
}));

/* =========================
   MIDDLEWARE
========================= */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Log all requests for debugging (BEFORE static middleware)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

/* Serve frontend */
app.use(express.static(__dirname));
app.use('/uploads', express.static('uploads'));

/* =========================
   FILE UPLOAD
========================= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB limit

/* =========================
   DATABASE
========================= */
mongoose.connect(process.env.MONGO_URI)
.then(async () => {
  console.log("MongoDB Connected");
  
  // Initialize admin if it doesn't exist
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const existingAdmin = await Admin.findOne({ email: process.env.ADMIN_EMAIL });
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
      const admin = new Admin({ 
        email: process.env.ADMIN_EMAIL, 
        password: hashedPassword 
      });
      await admin.save();
      console.log("✅ Admin account created:", process.env.ADMIN_EMAIL);
    } else {
      console.log("✅ Admin account already exists");
    }
  }
})
.catch(err => console.log("DB Error:", err));

/* =========================
   MODELS
========================= */

// PRODUCT
const productSchema = new mongoose.Schema({
  name: String,
  price: Number,
  originalPrice: Number,
  discount: Number,
  brand: String,
  image: String,
  images: [{ type: String }],                // Additional gallery images
  categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
  selectedSubcategories: [{ type: String }],
  // Rich product detail fields
  description: { type: String, default: '' },
  highlights: [{ type: String }],            // Short bullet-point features
  specifications: [{                         // Key-value spec table
    key:   { type: String },
    value: { type: String }
  }],
  sku:          { type: String, default: '' },
  stock:        { type: Number, default: 0 },
  tags:         [{ type: String }],
  warranty:     { type: String, default: '' },
  returnPolicy: { type: String, default: '' }
}, { timestamps: true });

const Product = mongoose.model("Product", productSchema);

// FEATURED PRODUCT
const featuredProductSchema = new mongoose.Schema({
  name: String,
  price: Number,
  originalPrice: Number,
  discount: Number,
  brand: String,
  image: String
}, { timestamps: true });

const FeaturedProduct = mongoose.model("FeaturedProduct", featuredProductSchema);

// CATEGORY
const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  subcategories: [{ type: String, trim: true }]
}, { timestamps: true });

const Category = mongoose.model("Category", categorySchema);

// USER
const userSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  password: String,
  username: String   // ← add this
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

// ADMIN
const adminSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  password: String
}, { timestamps: true });

const Admin = mongoose.model("Admin", adminSchema);

// COMPLAINT
const complaintSchema = new mongoose.Schema({
  email: String,
  message: String,
  resolved: { type: Boolean, default: false }
}, { timestamps: true });

const Complaint = mongoose.model("Complaint", complaintSchema);

/* =========================
   MIDDLEWARE
========================= */

// Admin authentication middleware
const adminAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ success: false, message: "No token" });
    }

    const parts = authHeader.split(" ");

if (parts.length !== 2 || parts[0] !== "Bearer") {
  return res.status(401).json({ 
    success: false, 
    message: "Invalid authorization format" 
  });
}

const token = parts[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== "admin") {
      return res.status(403).json({ success: false, message: "Admins only" });
    }

    // Verify admin still exists in database
    const admin = await Admin.findById(decoded.id);
    if (!admin) {
      return res.status(403).json({ success: false, message: "Admin no longer exists" });
    }

    req.admin = decoded;
    next();

  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};

/* =========================
   ROUTES
========================= */

// HOME
app.get("/", (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.sendFile(path.join(__dirname, "index.html"));
});
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "pages", "admin.html"));
});
app.get("/pages/:page", (req, res) => {
  const page = req.params.page;
  const validPages = ['admin', 'products', 'complaints', 'orders', 'product', 'cart', 'checkout', 'orders', 'order-success', 'credits', 'search'];
  if (validPages.includes(page)) {
    res.sendFile(path.join(__dirname, "pages", page + ".html"));
  } else {
    res.status(404).send("Page not found");
  }
});

/* =========================
   AUTH
========================= */

// REGISTER
app.post("/api/register", async (req, res) => {
  try {
    const { email, password, username } = req.body;

    if (!email || !password || !username) {
      return res.status(400).json({ success: false, message: "All fields required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be 6+ characters" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = new User({ email, password: hashed, username });

    await user.save();

    res.json({ success: true, message: "User created", user: { email, username, id: user._id } });

  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ success: false, message: "Email already registered" });
    }
    res.status(500).json({ success: false, message: "Registration failed" });
  }
});

// LOGIN
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });

  if (!user) {
    return res.json({ success: false, message: "User not found" });
  }

  const match = await bcrypt.compare(password, user.password);

  if (!match) {
    return res.json({ success: false, message: "Wrong password" });
  }

  res.json({
    success: true,
    user: { email: user.email, username: user.username, id: user._id }
  });
});
/* =========================
   ADMIN AUTH
========================= */
// ADMIN LOGIN ENDPOINT
app.post("/api/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.json({ success: false, message: "Admin not found" });
    }

    const match = await bcrypt.compare(password, admin.password);
    if (!match) {
      return res.json({ success: false, message: "Invalid password" });
    }

    const token = jwt.sign(
      { id: admin._id, email: admin.email, role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({ success: true, token, redirectUrl: '/admin' });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ADMIN VERIFY ENDPOINT (for checking if user is admin)
app.get("/api/admin/verify", adminAuth, async (req, res) => {
  res.json({ success: true, admin: req.admin });
});

/* =========================
   PRODUCTS
========================= */

// GET ALL PRODUCTS
app.get("/api/products", async (req, res) => {
  const products = await Product.find().populate('categories', 'name subcategories');
  res.json(products);
});

// GET FLASH PRODUCTS (discount >= 50%, from both regular and featured collections)
app.get("/api/products/flash", async (req, res) => {
  try {
    const [regular, featured] = await Promise.all([
      Product.find({ discount: { $gte: 50 } }).populate('categories', 'name subcategories'),
      FeaturedProduct.find({ discount: { $gte: 50 } })
    ]);
    const featuredTagged = featured.map(p => ({ ...p.toObject(), _isFeatured: true }));
    const all = [...featuredTagged, ...regular].sort((a, b) => (b.discount || 0) - (a.discount || 0));
    res.json(all);
  } catch (err) {
    res.status(500).json([]);
  }
});

// GET NEWEST PRODUCTS (latest 8 by createdAt)
app.get("/api/products/newest", async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 }).limit(8);
    res.json(products);
  } catch {
    res.status(500).json([]);
  }
});

// GET SINGLE PRODUCT BY ID - checks both Products and FeaturedProducts
app.get("/api/products/:id", async (req, res) => {
  try {
    // Try Products collection first
    let product = await Product.findById(req.params.id).populate('categories', 'name subcategories');
    
    // If not found, try FeaturedProducts collection
    if (!product) {
      product = await FeaturedProduct.findById(req.params.id);
    }
    
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADMIN ADD PRODUCT
app.post("/api/products", adminAuth, async(req,res)=>{
  try{
    const {
      name, brand, price, image, images,
      originalPrice, discount, categories,
      description, highlights, specifications,
      sku, stock, tags, warranty, returnPolicy
    } = req.body;

    if(!name || !brand || !price || !image){
      return res.status(400).json({success:false, message: "Missing required fields"});
    }

    const product = await Product.create({
      name, brand,
      price:         Number(price),
      image,
      images:        images        || [],
      originalPrice: originalPrice ? Number(originalPrice) : undefined,
      discount:      discount      ? Number(discount)      : undefined,
      categories:    categories    || [],
      description:   description   || '',
      highlights:    highlights    || [],
      specifications: specifications || [],
      sku:           sku           || '',
      stock:         stock !== undefined ? Number(stock) : 0,
      tags:          tags          || [],
      warranty:      warranty      || '',
      returnPolicy:  returnPolicy  || ''
    });
    
    res.json({success:true, productId: product._id});

  }catch(err){
    console.error("Add product error:", err);
    res.status(500).json({success:false, message: "Server error"});
  }
});

// ADMIN UPDATE PRODUCT
app.put("/api/products/:id", adminAuth, async (req, res) => {
  try {
    const {
      name, brand, price, image, images,
      originalPrice, discount,
      description, highlights, specifications,
      sku, stock, tags, warranty, returnPolicy
    } = req.body;

    const updateData = {};
    if (name          !== undefined) updateData.name          = name;
    if (brand         !== undefined) updateData.brand         = brand;
    if (price         !== undefined) updateData.price         = Number(price);
    if (image         !== undefined) updateData.image         = image;
    if (images        !== undefined) updateData.images        = images;
    if (originalPrice !== undefined) updateData.originalPrice = originalPrice !== '' ? Number(originalPrice) : undefined;
    if (discount      !== undefined) updateData.discount      = discount      !== '' ? Number(discount)      : undefined;
    if (description   !== undefined) updateData.description   = description;
    if (highlights    !== undefined) updateData.highlights    = highlights;
    if (specifications!== undefined) updateData.specifications= specifications;
    if (sku           !== undefined) updateData.sku           = sku;
    if (stock         !== undefined) updateData.stock         = Number(stock);
    if (tags          !== undefined) updateData.tags          = tags;
    if (warranty      !== undefined) updateData.warranty      = warranty;
    if (returnPolicy  !== undefined) updateData.returnPolicy  = returnPolicy;
    
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate('categories', 'name subcategories');
    
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADMIN DELETE PRODUCT
app.delete("/api/products/:id", adminAuth, async(req,res)=>{
  try{
    await Product.findByIdAndDelete(req.params.id);
    res.json({success:true});
  }catch(err){
    res.status(500).json({error:err.message});
  }
});

// UPDATE PRODUCT CATEGORIES (Admin only)
app.put("/api/products/:id/categories", adminAuth, async (req, res) => {
  try {
    const { categories, selectedSubcategories } = req.body;
    const updateData = { categories: categories || [] };
    if (selectedSubcategories !== undefined) {
      updateData.selectedSubcategories = selectedSubcategories;
    }
    await Product.findByIdAndUpdate(req.params.id, updateData);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* =========================
   FEATURED PRODUCTS
========================= */

// GET ALL FEATURED PRODUCTS
app.get("/api/featured-products", async (req, res) => {
  try {
    const products = await FeaturedProduct.find().sort({ createdAt: -1 });
    res.json(products);
  } catch {
    res.status(500).json([]);
  }
});

// ADMIN ADD FEATURED PRODUCT
app.post("/api/featured-products", adminAuth, async (req, res) => {
  try {
    const { name, brand, price, image, originalPrice, discount } = req.body;
    if (!name || !brand || !price || !image) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    // Build the document; only include optional pricing fields when provided
    const doc = { name, brand, price: Number(price), image };
    if (originalPrice !== undefined && originalPrice !== '') doc.originalPrice = Number(originalPrice);
    if (discount      !== undefined && discount      !== '') doc.discount      = Math.max(0, Math.min(100, Number(discount)));

    await FeaturedProduct.create(doc);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ADMIN UPDATE FEATURED PRODUCT
app.put("/api/featured-products/:id", adminAuth, async (req, res) => {
  try {
    const { name, brand, price, image, originalPrice, discount } = req.body;
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (brand !== undefined) updateData.brand = brand;
    if (price !== undefined) updateData.price = price;
    if (image !== undefined) updateData.image = image;
    if (originalPrice !== undefined) updateData.originalPrice = originalPrice;
    if (discount !== undefined) updateData.discount = discount;
    
    const product = await FeaturedProduct.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );
    
    if (!product) return res.status(404).json({ error: "Featured product not found" });
    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADMIN DELETE FEATURED PRODUCT
app.delete("/api/featured-products/:id", adminAuth, async (req, res) => {
  try {
    await FeaturedProduct.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   CATEGORIES
========================= */

// GET ALL CATEGORIES with their subcategories
app.get("/api/categories", async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE NEW CATEGORY (Admin only)
app.post("/api/categories", adminAuth, async (req, res) => {
  try {
    const { name, subcategories = [] } = req.body;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: "Category name is required" });
    }
    
    const category = await Category.create({
      name: name.trim(),
      subcategories: subcategories.filter(s => s && s.trim()).map(s => s.trim())
    });
    
    res.json({ success: true, category });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: "Category already exists" });
    }
    res.status(500).json({ error: err.message });
  }
});

// ADD SUBCATEGORY TO EXISTING CATEGORY (Admin only)
app.post("/api/categories/:id/subcategories", adminAuth, async (req, res) => {
  try {
    const { subcategory } = req.body;
    
    if (!subcategory || subcategory.trim() === '') {
      return res.status(400).json({ error: "Subcategory name is required" });
    }
    
    const category = await Category.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { subcategories: subcategory.trim() } },
      { new: true }
    );
    
    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }
    
    res.json({ success: true, category });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE CATEGORY NAME (Admin only)
app.put("/api/categories/:id", adminAuth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Category name is required" });
    }
    
    const category = await Category.findByIdAndUpdate(
      req.params.id,
      { name },
      { new: true }
    );
    
    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }
    
    res.json({ success: true, category });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE CATEGORY (Admin only)
app.delete("/api/categories/:id", adminAuth, async (req, res) => {
  try {
    const catId = req.params.id;
    
    // First remove category reference from all products
    await Product.updateMany(
      { categories: catId },
      { $pull: { categories: catId } }
    );
    
    // Then delete the category
    await Category.findByIdAndDelete(catId);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting category:', err);
    res.status(500).json({ error: err.message });
  }
});

// UPDATE SUBCATEGORY NAME (Admin only)
app.put("/api/categories/:id/subcategories/:subcategory", adminAuth, async (req, res) => {
  try {
    const { subcategory: newSubName } = req.body;
    const oldSubName = decodeURIComponent(req.params.subcategory);
    
    if (!newSubName) {
      return res.status(400).json({ error: "New subcategory name is required" });
    }
    
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }
    
    // Find and replace the subcategory
    const idx = category.subcategories.indexOf(oldSubName);
    if (idx === -1) {
      return res.status(404).json({ error: "Subcategory not found" });
    }
    
    // Check for duplicate
    if (category.subcategories.includes(newSubName)) {
      return res.status(400).json({ error: "Subcategory already exists" });
    }
    
    category.subcategories[idx] = newSubName;
    await category.save();
    
    res.json({ success: true, category });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// REMOVE SUBCATEGORY FROM CATEGORY (Admin only)
app.delete("/api/categories/:id/subcategories/:subcategory", adminAuth, async (req, res) => {
  try {
    const category = await Category.findByIdAndUpdate(
      req.params.id,
      { $pull: { subcategories: req.params.subcategory } },
      { new: true }
    );
    
    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }
    
    res.json({ success: true, category });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   COMPLAINTS
========================= */
//View complaints
app.get("/api/complaints", adminAuth, async(req,res)=>{
  try{
    const data = await Complaint.find().sort({createdAt:-1});
    res.json(data);
  }catch{
    res.status(500).json([]);
  }
});


// ADD COMPLAINT
app.post("/api/complaints", async(req,res)=>{
  try{
    const {email,message} = req.body;

    if(!email || !message){
      return res.status(400).json({success:false});
    }

    await Complaint.create({email,message});

    res.json({success:true});
  }catch{
    res.status(500).json({success:false});
  }
});
// Resolve complaint
app.put("/api/complaints/:id/resolve", adminAuth, async (req, res) => {
  try {
    await Complaint.findByIdAndUpdate(req.params.id, {
      resolved: true
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// Delete complaint
app.delete("/api/complaints/:id", adminAuth, async (req, res) => {
  try {
    await Complaint.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});
/* =========================
   ORDERS (UPDATED)
========================= */
const orderSchema = new mongoose.Schema({
  user: mongoose.Schema.Types.Mixed,
  items: mongoose.Schema.Types.Mixed,
  subtotal: Number,
  discount: Number,
  gst: Number,
  total: Number,
  paymentMethod: String,
  location: String,
  contactNumber: String,
  promoCode: String,
  status: { type: String, default: "Placed" }
}, { timestamps: true, strict: false }); // strict: false allows extra fields

// Track promo code usage per user email
const userPromoUsageSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  promoCode: { type: String, required: true },
  orderId: { type: String, required: true },
  usedAt: { type: Date, default: Date.now }
}, { timestamps: true });

const UserPromoUsage = mongoose.model("UserPromoUsage", userPromoUsageSchema);

const Order = mongoose.model("Order", orderSchema);

app.post("/api/orders", async (req, res) => {
  console.log("📦 Order Received:", req.body);
  try {
    const { promoCode, user } = req.body;
    
    // Validate promo code if provided
    if (promoCode) {
      const promo = await PromoCode.findOne({ code: promoCode.toUpperCase(), active: true });
      
      if (!promo) {
        return res.status(400).json({ success: false, error: "Invalid or expired promo code" });
      }
      
      // Check global usage limit
      if (promo.usageLimit > 0 && promo.usedCount >= promo.usageLimit) {
        return res.status(400).json({ success: false, error: "Promo code usage limit reached" });
      }
      
      // Check one-time per account
      if (promo.oneTimePerAccount && user?.email) {
        const existingUsage = await UserPromoUsage.findOne({ 
          email: user.email, 
          promoCode: promoCode.toUpperCase() 
        });
        if (existingUsage) {
          return res.status(400).json({ success: false, error: "You have already used this promo code" });
        }
      }
      
      // Check minimum order amount
      const subtotal = req.body.subtotal || 0;
      if (promo.minAmount > 0 && subtotal < promo.minAmount) {
        return res.status(400).json({ 
          success: false, 
          error: `Minimum order amount ₹${promo.minAmount} required for this code` 
        });
      }
    }
    
    const order = await Order.create(req.body);
    
    // Note: discount is 0 by default (no automatic discount applied).
    // Discount is only applied when a valid promo code is provided and validated above.
    
    // Track promo code usage
    if (promoCode && order) {
      const promo = await PromoCode.findOne({ code: promoCode.toUpperCase() });
      if (promo) {
        // Increment used count
        promo.usedCount += 1;
        await promo.save();
        
        // Track per-user usage
        if (user?.email) {
          await UserPromoUsage.create({
            email: user.email,
            promoCode: promoCode.toUpperCase(),
            orderId: order._id.toString()
          });
        }
      }
    }
    
    console.log("✅ Order Saved ID:", order._id);
    res.json({ success: true, orderId: order._id });
  } catch (err) {
    console.error("❌ MongoDB Save Error:", err);
    res.status(500).json({ 
      success: false, 
      error: "Order failed", 
      details: err.message 
    });
  }
});

// GET ALL ORDERS (ADMIN ONLY)
app.get("/api/orders", adminAuth, async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// UPDATE ORDER STATUS (ADMIN ONLY)
app.put("/api/orders/:id/status", adminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true });
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE ORDER (ADMIN ONLY)
app.delete("/api/orders/:id", adminAuth, async (req, res) => {
  try {
    await Order.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET ORDER BY ID (PUBLIC - for users to check status)
app.get("/api/orders/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET ORDERS BY USER EMAIL (PUBLIC - for users to view their orders)
app.get("/api/orders/user/:email", async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const orders = await Order.find({ "user.email": email }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   PROMO CODES / DISCOUNTS
========================= */
const promoCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true },
  discountType: { type: String, enum: ['percent', 'fixed'], default: 'percent' },
  value: { type: Number, required: true, min: 1 },
  minAmount: { type: Number, default: 0 },
  usageLimit: { type: Number, default: 0 }, // 0 = unlimited
  usedCount: { type: Number, default: 0 },
  oneTimePerAccount: { type: Boolean, default: false },
  desc: { type: String, default: '' },
  active: { type: Boolean, default: true }
}, { timestamps: true });

const PromoCode = mongoose.model("PromoCode", promoCodeSchema);

// GET ALL PROMO CODES (Public - for checkout page)
app.get("/api/promo-codes", async (req, res) => {
  try {
    const codes = await PromoCode.find({ active: true }).sort({ createdAt: -1 });
    res.json(codes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET ALL PROMO CODES (Admin - includes inactive)
app.get("/api/admin/promo-codes", adminAuth, async (req, res) => {
  try {
    const codes = await PromoCode.find().sort({ createdAt: -1 });
    res.json(codes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE PROMO CODE (Admin only)
app.post("/api/promo-codes", adminAuth, async (req, res) => {
  try {
    const { code, discountType, value, minAmount, desc, usageLimit, oneTimePerAccount } = req.body;
    if (!code || !value) {
      return res.status(400).json({ error: "Code and value are required" });
    }

    const promoCode = await PromoCode.create({
      code: code.toUpperCase(),
      discountType: discountType || 'percent',
      value,
      minAmount: minAmount || 0,
      desc: desc || '',
      usageLimit: usageLimit !== undefined ? usageLimit : 0,
      oneTimePerAccount: oneTimePerAccount || false
    });

    res.json({ success: true, promoCode });
  } catch (err) {
    if (err.code === 11000) {
      res.status(400).json({ error: "Promo code already exists" });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// UPDATE PROMO CODE (Admin only)
app.put("/api/promo-codes/:id", adminAuth, async (req, res) => {
  try {
    const { discountType, value, minAmount, desc, active, usageLimit, oneTimePerAccount } = req.body;
    const updateData = {};
    if (discountType !== undefined) updateData.discountType = discountType;
    if (value !== undefined) updateData.value = value;
    if (minAmount !== undefined) updateData.minAmount = minAmount;
    if (desc !== undefined) updateData.desc = desc;
    if (active !== undefined) updateData.active = active;
    if (usageLimit !== undefined) updateData.usageLimit = usageLimit;
    if (oneTimePerAccount !== undefined) updateData.oneTimePerAccount = oneTimePerAccount;

    const promoCode = await PromoCode.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!promoCode) return res.status(404).json({ error: "Promo code not found" });
    res.json({ success: true, promoCode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE PROMO CODE (Admin only)
app.delete("/api/promo-codes/:id", adminAuth, async (req, res) => {
  try {
    await PromoCode.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   GOOGLE DRIVE
========================= */

// Get Google Drive configuration
app.get("/api/drive-config", (req, res) => {
  res.json({
    accessToken: process.env.GOOGLE_DRIVE_TOKEN || "",
    message: process.env.GOOGLE_DRIVE_TOKEN ? "Ready" : "Google Drive not configured"
  });
});

// Download file from Google Drive and save locally
app.post("/api/drive-upload", async (req, res) => {
  try {
    const { fileId, fileName } = req.body;

    if (!fileId || !fileName) {
      return res.status(400).json({ success: false, message: "Missing fileId or fileName" });
    }

    const driveToken = process.env.GOOGLE_DRIVE_TOKEN;
    if (!driveToken) {
      return res.status(400).json({ success: false, message: "Google Drive not configured" });
    }

    // Download file from Google Drive
    const driveUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&access_token=${driveToken}`;
    
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(fileName) || '.jpg';
    const localFileName = uniqueSuffix + ext;
    const filePath = path.join('uploads', localFileName);

    // Ensure uploads directory exists
    if (!fs.existsSync('uploads')) {
      fs.mkdirSync('uploads', { recursive: true });
    }

    // Download and save the file
    const file = fs.createWriteStream(filePath);
    
    https.get(driveUrl, (response) => {
      if (response.statusCode !== 200) {
        fs.unlink(filePath, () => {}); // Delete empty file
        return res.status(400).json({ success: false, message: "Failed to download from Google Drive" });
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        const imageUrl = `/uploads/${localFileName}`;
        res.json({ success: true, imageUrl });
      });

      file.on('error', (err) => {
        file.close();
        fs.unlink(filePath, () => {}); // Delete file on error
        res.status(500).json({ success: false, message: "File download error" });
      });
    }).on('error', (err) => {
      fs.unlink(filePath, () => {}); // Delete file on error
      res.status(500).json({ success: false, message: "Network error" });
    });

  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* =========================
   ERROR HANDLER
========================= */
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ success: false, message: 'Server error' });
});

/* =========================
   SERVER START
========================= */

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});