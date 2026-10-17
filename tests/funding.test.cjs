const test = require("node:test"),
  assert = require("node:assert/strict");
const { VentureEngine } = require("../dist/engine.js");

test("Sekiz küçük girişim açık turlarla, küçük pay fiyatlarıyla ve gerçek fiyat geçmişiyle başlar", () => {
  const e = new VentureEngine(42);
  assert.equal(e.version, 2);
  for (const s of e.startups) {
    assert.equal(s.status, "active");
    assert.equal(s.funding.open, true);
    assert.ok(s.funding.target >= 32000000 && s.funding.target <= 72000000);
    assert.ok(s.funding.price >= 800 && s.funding.price <= 1800);
    assert.ok(s.funding.raised > 0 && s.funding.raised < s.funding.target);
    assert.ok(s.history.length >= 30);
  }
  assert.equal(e.audit().ok, true);
});

test("Tam fonlama yeni payları ihraç eder, girişimin kasasını artırır ve turu kapatır", () => {
  const e = new VentureEngine(42, { bots: false, warmupDays: 0 }),
    s = e.startups.find((x) => x.symbol === "H");
  const buyer = e.getAccount("bot-H-1"),
    before = { cash: s.companyCash, shares: s.totalShares, buyer: buyer.cash };
  const remaining = s.funding.offeredShares - s.funding.soldShares,
    cost = remaining * s.funding.price;
  e.fund("H", remaining, buyer.id);
  assert.equal(s.companyCash, before.cash + cost);
  assert.equal(s.totalShares, before.shares + remaining);
  assert.equal(buyer.cash, before.buyer - cost);
  assert.equal(s.funding.open, false);
  assert.equal(s.funding.raised, s.funding.target);
  const snapshot = JSON.stringify(e.serialize());
  assert.throws(() => e.fund("H", 1));
  assert.equal(JSON.stringify(e.serialize()), snapshot);
  assert.equal(e.audit().ok, true);
});

test("Fonlama düzeyi işletmenin büyüme kapasitesini ve giderini etkiler; fiyatı otomatik çizmez", () => {
  const low = new VentureEngine(712, { bots: false, warmupDays: 0 }),
    high = VentureEngine.fromJSON(low.serialize());
  const s = high.startups.find((x) => x.symbol === "H");
  high.fund("H", s.funding.offeredShares - s.funding.soldShares, "bot-H-1");
  low.advance(30);
  high.advance(30);
  const a = low.startups.find((x) => x.symbol === "H"),
    b = high.startups.find((x) => x.symbol === "H");
  assert.ok(b.revenue > a.revenue);
  assert.ok(b.users > a.users);
  assert.ok(b.expenses > a.expenses);
  assert.equal(b.price, a.price);
  assert.deepEqual(b.history, a.history);
  assert.equal(low.audit().ok, true);
  assert.equal(high.audit().ok, true);
});

test("Önceki sürümün yatırım kaydı nakit ve pay kaybı olmadan yüklenir", () => {
  const saved = require("./fixtures/legacy-v1.json"),
    restored = VentureEngine.fromJSON(saved);
  assert.equal(restored.version, 1);
  assert.equal(
    restored.getAccount().cash,
    saved.accounts.find((x) => x.id === "user").cash,
  );
  assert.equal(restored.getAccount().holdings.H, 7);
  assert.deepEqual(restored.serialize(), saved);
  restored.advance(5);
  assert.equal(restored.audit().ok, true);
});
