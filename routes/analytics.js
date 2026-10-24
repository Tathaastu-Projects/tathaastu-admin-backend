const express = require("express");
const StoreCustomer = require("../models/StoreCustomer");
const StoreOrder = require("../models/StoreOrder");
const StoreCart = require("../models/StoreCart");
const StoreWishlist = require("../models/StoreWishlist");
const Product = require("../models/Product");

const router = express.Router();

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayKey(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function relativeTime(value) {
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return "";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function cartQty(cart) {
  if (!cart || !Array.isArray(cart.items)) return 0;
  return cart.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
}

async function buildDashboard() {
  const [customers, orders, carts, wishlists, products] = await Promise.all([
    StoreCustomer.find({}).sort({ createdAt: -1 }).lean(),
    StoreOrder.find({}).sort({ createdAt: -1 }).lean(),
    StoreCart.find({}).lean(),
    StoreWishlist.find({}).lean(),
    Product.find({}).lean(),
  ]);

  const todayStart = startOfDay();
  const activeCustomers = customers.filter((c) => c.isActive !== false);
  const totalUsers = customers.length;

  const cartsWithItems = carts.filter((c) => cartQty(c) > 0);
  const openOrderStatuses = new Set(["placed", "confirmed", "packed", "shipped"]);
  const openOrders = orders.filter((o) => openOrderStatuses.has(String(o.status || "")));
  const clientsInQueue = openOrders.length + cartsWithItems.length;

  const servedOrders = orders.filter((o) => String(o.status || "") === "delivered");
  const servedEmails = new Set();
  for (const order of orders) {
    if (order.status === "cancelled") continue;
    if (order.status === "delivered" || order.paymentStatus === "paid") {
      const key =
        String(order.customerId || "") ||
        String(order.customer?.email || "").toLowerCase() ||
        String(order.customer?.phone || "");
      if (key) servedEmails.add(key);
    }
  }
  const totalClientsServed = servedEmails.size || servedOrders.length;

  const ordersToday = orders.filter((o) => new Date(o.createdAt || 0) >= todayStart);
  const usersToday = customers.filter((c) => new Date(c.createdAt || 0) >= todayStart);
  const clientsServedToday = ordersToday.filter((o) => o.status !== "cancelled").length;

  const revenueAll = orders
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + Number(o?.pricing?.total || 0), 0);
  const revenueToday = ordersToday
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + Number(o?.pricing?.total || 0), 0);

  const listedProducts = products.filter((p) => p.status === "listed").length;

  const weeklyMap = new Map();
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-IN", { weekday: "short" });
    weeklyMap.set(key, { day: label, date: key, orders: 0, revenue: 0 });
  }
  for (const order of orders) {
    const key = dayKey(order.createdAt);
    if (!weeklyMap.has(key)) continue;
    const row = weeklyMap.get(key);
    row.orders += 1;
    if (order.status !== "cancelled") {
      row.revenue += Number(order?.pricing?.total || 0);
    }
  }
  const weeklyOrders = Array.from(weeklyMap.values());

  const statusColors = {
    placed: "#F59E0B",
    confirmed: "#0EA5E9",
    packed: "#6366F1",
    shipped: "#8B5CF6",
    delivered: "#10B981",
    cancelled: "#F43F5E",
  };
  const statusCounts = {};
  for (const order of orders) {
    const status = String(order.status || "placed");
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  }
  const ordersByStatus = Object.entries(statusCounts).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value,
    color: statusColors[name] || "#9370DB",
  }));

  const payCounts = { cod: 0, online: 0 };
  for (const order of orders) {
    const method = order.paymentMethod === "online" ? "online" : "cod";
    payCounts[method] += 1;
  }
  const paymentSplit = [
    { name: "COD", value: payCounts.cod, color: "#D4AF37" },
    { name: "Online", value: payCounts.online, color: "#663399" },
  ].filter((row) => row.value > 0);

  const activity = [];
  for (const customer of customers.slice(0, 8)) {
    activity.push({
      id: `user-${customer._id}`,
      type: "register",
      action: "New user registered",
      user: customer.name || customer.email || "Customer",
      detail: customer.email || "",
      at: customer.createdAt || null,
      time: relativeTime(customer.createdAt),
    });
  }
  for (const order of orders.slice(0, 10)) {
    activity.push({
      id: `order-${order._id}`,
      type: "order",
      action: `Order ${order.orderNumber || ""} · ${order.status || "placed"}`,
      user: order.customer?.name || "Customer",
      detail: `₹${Number(order?.pricing?.total || 0).toLocaleString("en-IN")} · ${(
        order.paymentMethod || "cod"
      ).toUpperCase()}`,
      at: order.createdAt || null,
      time: relativeTime(order.createdAt),
    });
  }
  activity.sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime());

  const needsAttention = openOrders.slice(0, 6).map((order) => ({
    id: String(order._id),
    orderNumber: order.orderNumber || "",
    customerName: order.customer?.name || "Customer",
    phone: order.customer?.phone || "",
    status: order.status || "placed",
    paymentMethod: order.paymentMethod || "cod",
    paymentStatus: order.paymentStatus || "pending",
    total: Number(order?.pricing?.total || 0),
    createdAt: order.createdAt || null,
    time: relativeTime(order.createdAt),
  }));

  return {
    kpis: {
      totalUsers,
      activeUsers: activeCustomers.length,
      clientsInQueue,
      totalClientsServed,
      clientsServedToday,
      ordersToday: ordersToday.length,
      newUsersToday: usersToday.length,
      revenueToday,
      revenueAll,
      listedProducts,
      totalProducts: products.length,
      openOrders: openOrders.length,
      activeCarts: cartsWithItems.length,
      wishlistItems: wishlists.length,
    },
    weeklyOrders,
    ordersByStatus,
    paymentSplit,
    recentActivity: activity.slice(0, 12),
    needsAttention,
    generatedAt: new Date().toISOString(),
  };
}

router.get("/dashboard", async (_req, res) => {
  try {
    const data = await buildDashboard();
    res.json({ success: true, data });
  } catch (error) {
    console.error("Dashboard analytics error:", error);
    res.status(500).json({ success: false, message: "Failed to load dashboard" });
  }
});

router.get("/", async (_req, res) => {
  try {
    const data = await buildDashboard();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load analytics" });
  }
});

module.exports = router;
