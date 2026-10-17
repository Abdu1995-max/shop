import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import sharp from "sharp";
import axios from "axios";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// SQLite Database Setup
const db = new Database("marketplace.db");

// Initialize Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    description TEXT,
    image TEXT,
    shopName TEXT,
    category TEXT DEFAULT 'General',
    moq TEXT DEFAULT '1 piece',
    location TEXT DEFAULT 'Sodo, Ethiopia',
    isFeatured INTEGER DEFAULT 0,
    technical_specs TEXT
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    total_amount REAL NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    price_at_time REAL NOT NULL,
    category TEXT,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    user TEXT NOT NULL,
    rating INTEGER NOT NULL,
    comment TEXT,
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );
`);

// Migration: Add columns if they don't exist (for existing databases)
const tableInfo = db.prepare("PRAGMA table_info(products)").all() as any[];
const columnNames = tableInfo.map(col => col.name);

if (!columnNames.includes('category')) {
  db.exec("ALTER TABLE products ADD COLUMN category TEXT DEFAULT 'General'");
}
if (!columnNames.includes('moq')) {
  db.exec("ALTER TABLE products ADD COLUMN moq TEXT DEFAULT '1 piece'");
}
if (!columnNames.includes('location')) {
  db.exec("ALTER TABLE products ADD COLUMN location TEXT DEFAULT 'Sodo, Ethiopia'");
}
if (!columnNames.includes('isFeatured')) {
  db.exec("ALTER TABLE products ADD COLUMN isFeatured INTEGER DEFAULT 0");
}
if (!columnNames.includes('technical_specs')) {
  db.exec("ALTER TABLE products ADD COLUMN technical_specs TEXT");
}

// Seed some reviews if none exist
const reviewCount = db.prepare("SELECT COUNT(*) as count FROM reviews").get() as any;
if (reviewCount.count === 0) {
  const products = db.prepare("SELECT id FROM products").all() as any[];
  const users = ["Abdu", "Sara", "John", "Mulu", "Kebede"];
  const comments = [
    "Great quality, highly recommend!",
    "Good value for money.",
    "Fast delivery and excellent service.",
    "Exactly what I was looking for.",
    "Decent product, but shipping took a while."
  ];

  const stmt = db.prepare("INSERT INTO reviews (product_id, user, rating, comment) VALUES (?, ?, ?, ?)");
  products.forEach(p => {
    const numReviews = Math.floor(Math.random() * 5) + 1;
    for (let i = 0; i < numReviews; i++) {
      stmt.run(
        p.id,
        users[Math.floor(Math.random() * users.length)],
        Math.floor(Math.random() * 3) + 3, // 3-5 stars
        comments[Math.floor(Math.random() * comments.length)]
      );
    }
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/products", (req, res) => {
    try {
      const products = db.prepare("SELECT * FROM products ORDER BY id DESC").all() as any[];
      const productsWithReviews = products.map(p => {
        const reviews = db.prepare("SELECT * FROM reviews WHERE product_id = ?").all(p.id);
        return { ...p, reviews };
      });
      res.json(productsWithReviews);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.json([]);
    }
  });

  app.post("/api/reviews", (req, res) => {
    try {
      const { product_id, user, rating, comment } = req.body;
      const stmt = db.prepare("INSERT INTO reviews (product_id, user, rating, comment) VALUES (?, ?, ?, ?)");
      const result = stmt.run(product_id, user, rating, comment);
      res.status(201).json({ id: result.lastInsertRowid, product_id, user, rating, comment, date: new Date().toISOString() });
    } catch (error) {
      console.error("Error adding review:", error);
      res.status(500).json({ error: "Failed to add review" });
    }
  });

  app.post("/api/admin/add", (req, res) => {
    try {
      const { name, price, description, image, shopName, category, moq, location, isFeatured, technical_specs } = req.body;
      const stmt = db.prepare("INSERT INTO products (name, price, description, image, shopName, category, moq, location, isFeatured, technical_specs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      const result = stmt.run(
        name, 
        price, 
        description, 
        image, 
        shopName, 
        category || 'General', 
        moq || '1 piece', 
        location || 'Sodo, Ethiopia',
        isFeatured ? 1 : 0,
        technical_specs || null
      );
      res.status(201).json({ 
        id: result.lastInsertRowid, 
        name, price, description, image, shopName, 
        category: category || 'General', 
        moq: moq || '1 piece', 
        location: location || 'Sodo, Ethiopia',
        isFeatured: !!isFeatured,
        technical_specs: technical_specs || null
      });
    } catch (error) {
      console.error("Error adding product:", error);
      res.status(500).json({ error: "Failed to add product" });
    }
  });

  app.patch("/api/admin/featured/:id", (req, res) => {
    try {
      const { id } = req.params;
      const { isFeatured } = req.body;
      db.prepare("UPDATE products SET isFeatured = ? WHERE id = ?").run(isFeatured ? 1 : 0, id);
      res.json({ message: "Product featured status updated" });
    } catch (error) {
      console.error("Error updating featured status:", error);
      res.status(500).json({ error: "Failed to update featured status" });
    }
  });

  app.put("/api/admin/update/:id", (req, res) => {
    try {
      const { id } = req.params;
      const { name, price, description, image, category, moq, location, technical_specs } = req.body;
      const stmt = db.prepare(`
        UPDATE products 
        SET name = ?, price = ?, description = ?, image = ?, category = ?, moq = ?, location = ?, technical_specs = ?
        WHERE id = ?
      `);
      stmt.run(name, price, description, image, category, moq, location, technical_specs || null, id);
      res.json({ message: "Product updated successfully" });
    } catch (error) {
      console.error("Error updating product:", error);
      res.status(500).json({ error: "Failed to update product" });
    }
  });

  app.delete("/api/admin/delete/:id", (req, res) => {
    try {
      const { id } = req.params;
      db.prepare("DELETE FROM products WHERE id = ?").run(id);
      res.json({ message: "Product deleted successfully" });
    } catch (error) {
      console.error("Error deleting product:", error);
      res.status(500).json({ error: "Failed to delete product" });
    }
  });

  app.post("/api/orders", (req, res) => {
    const { items, totalAmount } = req.body;
    
    const transaction = db.transaction(() => {
      const orderStmt = db.prepare("INSERT INTO orders (total_amount) VALUES (?)");
      const orderResult = orderStmt.run(totalAmount);
      const orderId = orderResult.lastInsertRowid;

      const itemStmt = db.prepare(`
        INSERT INTO order_items (order_id, product_id, quantity, price_at_time, category)
        VALUES (?, ?, ?, ?, ?)
      `);

      for (const item of items) {
        itemStmt.run(orderId, item.id, item.quantity, item.price, item.category || 'General');
      }

      return orderId;
    });

    try {
      const orderId = transaction();
      res.status(201).json({ id: orderId, message: "Order placed successfully" });
    } catch (error) {
      console.error("Error placing order:", error);
      res.status(500).json({ error: "Failed to place order" });
    }
  });

  app.get("/api/admin/stats", (req, res) => {
    try {
      const totalOrders = db.prepare("SELECT COUNT(*) as count FROM orders").get() as any;
      const avgOrderValue = db.prepare("SELECT AVG(total_amount) as avg FROM orders").get() as any;
      const topCategories = db.prepare(`
        SELECT category, SUM(quantity) as total_sold
        FROM order_items
        GROUP BY category
        ORDER BY total_sold DESC
        LIMIT 5
      `).all();

      const totalRevenue = db.prepare("SELECT SUM(total_amount) as total FROM orders").get() as any;
      const totalProducts = db.prepare("SELECT COUNT(*) as count FROM products").get() as any;

      // Get order volume over the last 7 days
      const dailyOrders = db.prepare(`
        SELECT date(created_at) as date, COUNT(*) as count
        FROM orders
        WHERE created_at >= date('now', '-7 days')
        GROUP BY date(created_at)
        ORDER BY date ASC
      `).all();

      res.json({
        totalOrders: totalOrders.count || 0,
        avgOrderValue: avgOrderValue.avg || 0,
        topCategories: topCategories || [],
        totalRevenue: totalRevenue.total || 0,
        totalProducts: totalProducts.count || 0,
        dailyOrders: dailyOrders || []
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ error: "Failed to fetch statistics" });
    }
  });

  app.get("/api/optimize-image", async (req, res) => {
    const imageUrl = req.query.url as string;
    if (!imageUrl) {
      return res.status(400).send("URL is required");
    }

    try {
      // Fetch the image from the remote URL
      const response = await axios.get(imageUrl, { 
        responseType: "arraybuffer",
        timeout: 5000 // 5 second timeout
      });
      const buffer = Buffer.from(response.data, "binary");

      // Optimize the image: max width 800px, quality 80%
      const optimizedBuffer = await sharp(buffer)
        .resize({ 
          width: 800, 
          withoutEnlargement: true,
          fit: 'inside'
        })
        .jpeg({ quality: 80 })
        .toBuffer();

      // Set cache headers and content type
      res.set("Content-Type", "image/jpeg");
      res.set("Cache-Control", "public, max-age=86400"); // 1 day cache
      res.send(optimizedBuffer);
    } catch (error) {
      console.error("Error optimizing image:", error);
      // Fallback to original image if optimization fails (e.g. timeout or invalid URL)
      res.redirect(imageUrl);
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
