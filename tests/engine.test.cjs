const test = require("node:test");
const assert = require("node:assert/strict");
const { VentureEngine } = require("../dist/engine.js");

test("Tek geçişli JSON kaydı eski biçimle aynıdır ve geri yüklenebilir", () => {
  const engine = new VentureEngine(42);
  engine.advance(5);
  for (const space of [0, 2]) {
    const encoded = engine.exportJSON(space);
    assert.equal(encoded, JSON.stringify(engine.serialize(), null, space));
    const restored = VentureEngine.fromJSON(encoded);
    assert.deepEqual(restored.serialize(), engine.serialize());
    assert.equal(restored.audit().ok, true);
  }
});

test("Nesne kaydı canlı motoru değiştiremez; JSON dışa aktarma salt okunurdur", () => {
  const engine = new VentureEngine(42);
  const before = JSON.stringify(engine.serialize());
  const detached = engine.serialize();
  detached.accounts[0].cash = 0;
  detached.startups[0].price = 1;
  detached.orders.length = 0;
  assert.equal(engine.exportJSON(), before);
  assert.equal(JSON.stringify(engine.serialize()), before);
});

// Para tutarları kuruştur. Küçük, sabit fiyatlar eşleşme kurallarını
// rastgele piyasa hareketlerinden bağımsız sınamamızı sağlar.
function fixture(seed = 20261013) {
  const engine = new VentureEngine(seed, { bots: false, warmupDays: 0 });
  for (const order of [...engine.orders]) {
    if (order.remaining > 0 && ["open", "partial"].includes(order.status)) {
      engine.cancelOrder(order.id, order.accountId);
    }
  }
  return engine;
}

function account(engine, id = "user") {
  return engine.getAccount(id);
}

function snapshot(engine) {
  return JSON.stringify(engine.serialize());
}

function submit(engine, accountId, side, quantity, price, type = "limit") {
  return engine.placeOrder({
    symbol: "A",
    accountId,
    side,
    type,
    quantity,
    ...(type === "limit" ? { price } : {}),
  });
}

function rejectWithoutMutation(engine, operation) {
  const before = snapshot(engine);
  assert.throws(operation);
  assert.equal(
    snapshot(engine),
    before,
    "Reddedilen işlem hesapları, emirleri veya işlem geçmişini değiştirmemeli",
  );
}

function assertHealthy(engine) {
  const audit = engine.audit();
  assert.equal(audit.ok, true, JSON.stringify(audit.errors));
  for (const owner of engine.accounts) {
    assert.ok(
      Number.isSafeInteger(owner.cash) && owner.cash >= 0,
      `${owner.id}: geçersiz nakit`,
    );
    assert.ok(
      engine.availableCash(owner.id) >= 0,
      `${owner.id}: eksi kullanılabilir nakit`,
    );
    for (const [symbol, quantity] of Object.entries(owner.holdings)) {
      assert.ok(
        Number.isSafeInteger(quantity) && quantity >= 0,
        `${owner.id}/${symbol}: geçersiz pay`,
      );
      assert.ok(
        engine.availableShares(symbol, owner.id) >= 0,
        `${owner.id}/${symbol}: eksi kullanılabilir pay`,
      );
    }
  }
  for (const startup of engine.startups) {
    assert.ok(
      Number.isSafeInteger(startup.companyCash) && startup.companyCash >= 0,
      `${startup.symbol}: geçersiz şirket kasası`,
    );
    const issued = engine.accounts.reduce(
      (total, owner) => total + (owner.holdings[startup.symbol] || 0),
      0,
    );
    assert.equal(
      issued,
      startup.totalShares,
      `${startup.symbol}: dolaşımdaki toplam pay korunmalı`,
    );
  }
}

test("Daha iyi fiyat önce, aynı fiyatlı emirlerde daha eski emir önce eşleşir", () => {
  const engine = fixture();
  const oldAsk = submit(engine, "founder-A", "sell", 3, 10000);
  const cheapAsk = submit(engine, "bot-A-1", "sell", 2, 9990);
  const newAsk = submit(engine, "bot-A-2", "sell", 4, 10000);
  const cashBefore = account(engine).cash;

  const buy = submit(engine, "user", "buy", 6, 10050);

  assert.equal(buy.remaining, 0);
  assert.equal(cheapAsk.remaining, 0);
  assert.equal(oldAsk.remaining, 0);
  assert.equal(newAsk.remaining, 3);
  assert.equal(account(engine).cash, cashBefore - (2 * 9990 + 4 * 10000));
  assertHealthy(engine);
});

test("İşlem, karşılıklı limitlerin ortalamasında değil bekleyen emrin fiyatında gerçekleşir", () => {
  const engine = fixture();
  const buyerCash = account(engine).cash;
  const sellerCash = account(engine, "founder-A").cash;
  const restingBid = submit(engine, "user", "buy", 2, 10000);
  const sell = submit(engine, "founder-A", "sell", 2, 9500);

  assert.equal(restingBid.remaining, 0);
  assert.equal(sell.remaining, 0);
  assert.equal(account(engine).cash, buyerCash - 20000);
  assert.equal(account(engine, "founder-A").cash, sellerCash + 20000);
  assertHealthy(engine);
});

test("Kısmi gerçekleşmenin kalan payları emir defterinde fiyat bazında gruplanır", () => {
  const engine = fixture();
  const first = submit(engine, "founder-A", "sell", 5, 10000);
  submit(engine, "bot-A-1", "sell", 4, 10000);
  submit(engine, "bot-A-2", "sell", 3, 10100);
  submit(engine, "user", "buy", 2, 10000);

  assert.equal(first.remaining, 3);
  assert.equal(first.status, "partial");
  assert.deepEqual(
    engine
      .orderBook("A")
      .asks.map(({ price, quantity }) => ({ price, quantity })),
    [
      { price: 10000, quantity: 7 },
      { price: 10100, quantity: 3 },
    ],
  );
  assertHealthy(engine);
});

test("Grafiğin OHLC ve hacmi gerçekleşen işlemlerden oluşur; işlemsiz gün fiyat uydurmaz", () => {
  const engine = fixture();
  const startup = engine.startups.find((item) => item.symbol === "A");
  submit(engine, "founder-A", "sell", 2, 9000);
  submit(engine, "bot-A-1", "sell", 3, 11000);
  submit(engine, "bot-A-2", "sell", 1, 10000);
  submit(engine, "user", "buy", 6, undefined, "market");

  const candle = startup.history.at(-1);
  assert.deepEqual(
    Object.fromEntries(
      ["day", "open", "high", "low", "close", "volume"].map((key) => [
        key,
        candle[key],
      ]),
    ),
    {
      day: engine.day,
      open: 9000,
      high: 11000,
      low: 9000,
      close: 11000,
      volume: 6,
    },
  );
  assert.equal(startup.price, 11000);
  const history = JSON.stringify(startup.history);
  engine.advance(1);
  assert.equal(startup.price, 11000);
  assert.equal(JSON.stringify(startup.history), history);
  assertHealthy(engine);
});

test("Limit alış nakdi bloke eder; iptal tüm blokajı serbest bırakır", () => {
  const engine = fixture();
  const initial = account(engine).cash;
  const bid = submit(engine, "user", "buy", 5, 10000);

  assert.equal(account(engine).cash, initial);
  assert.equal(engine.reservedCash("user"), 50000);
  assert.equal(engine.availableCash("user"), initial - 50000);
  engine.cancelOrder(bid.id);
  assert.equal(engine.reservedCash("user"), 0);
  assert.equal(engine.availableCash("user"), initial);
  assertHealthy(engine);
});

test("Kısmi alışta yalnızca kalan miktar bloke kalır; fiyat iyileşmesi kullanılabilir nakde döner", () => {
  const engine = fixture();
  const initial = account(engine).cash;
  submit(engine, "founder-A", "sell", 2, 9500);
  const buy = submit(engine, "user", "buy", 5, 10000);

  assert.equal(buy.remaining, 3);
  assert.equal(account(engine).cash, initial - 19000);
  assert.equal(engine.reservedCash("user"), 30000);
  assert.equal(engine.availableCash("user"), initial - 19000 - 30000);
  engine.cancelOrder(buy.id);
  assert.equal(engine.reservedCash("user"), 0);
  assert.equal(engine.availableCash("user"), initial - 19000);
  assertHealthy(engine);
});

test("Limit satış payları bloke eder ve başka bir emir aynı payları yeniden satamaz", () => {
  const engine = fixture();
  const owner = "founder-A";
  const initialShares = account(engine, owner).holdings.A;
  const ask = submit(engine, owner, "sell", initialShares, 10000);

  assert.equal(engine.reservedShares("A", owner), initialShares);
  assert.equal(engine.availableShares("A", owner), 0);
  rejectWithoutMutation(engine, () => submit(engine, owner, "sell", 1, 10000));
  engine.cancelOrder(ask.id, owner);
  assert.equal(engine.reservedShares("A", owner), 0);
  assert.equal(engine.availableShares("A", owner), initialShares);
  assertHealthy(engine);
});

test("Yetersiz nakit, yetersiz pay ve geçersiz girişler atomik olarak reddedilir", () => {
  const engine = fixture();
  const base = {
    symbol: "A",
    side: "buy",
    type: "limit",
    quantity: 1,
    price: 10000,
  };
  const invalid = [
    { quantity: 0 },
    { quantity: -1 },
    { quantity: 1.5 },
    { quantity: NaN },
    { quantity: Number.MAX_SAFE_INTEGER + 1 },
    { quantity: true },
    { quantity: "1" },
    { price: 0 },
    { price: -1 },
    { price: 1.5 },
    { price: Infinity },
    { price: Number.MAX_SAFE_INTEGER + 1 },
    { symbol: "Z" },
    { side: "hold" },
    { type: "unknown" },
    { accountId: "missing" },
    { quantity: Math.floor(account(engine).cash / 10000) + 1 },
    { side: "sell", quantity: (account(engine).holdings.A || 0) + 1 },
  ];
  for (const override of invalid) {
    rejectWithoutMutation(engine, () =>
      engine.placeOrder({ ...base, ...override }),
    );
  }
  assertHealthy(engine);
});

test("Başka hesabın emri iptal edilemez; reddetme blokajı değiştirmez", () => {
  const engine = fixture();
  const ask = submit(engine, "founder-A", "sell", 10, 10000);
  rejectWithoutMutation(engine, () => engine.cancelOrder(ask.id, "user"));
  assert.equal(engine.reservedShares("A", "founder-A"), 10);
  assertHealthy(engine);
});

test("Yetersiz likiditeli piyasa emri hiçbir kısmi işlem yapmadan reddedilir", () => {
  const engine = fixture();
  const ask = submit(engine, "founder-A", "sell", 3, 10000);
  rejectWithoutMutation(engine, () =>
    submit(engine, "user", "buy", 4, undefined, "market"),
  );
  assert.equal(ask.remaining, 3);
  const buy = submit(engine, "user", "buy", 3, undefined, "market");
  assert.equal(buy.remaining, 0);
  assert.equal(ask.remaining, 0);
  assertHealthy(engine);
});

test("Alış blokajı, yeni alış emrinin harcayabileceği nakdi azaltır", () => {
  const engine = fixture();
  const cash = account(engine).cash;
  const quantity = Math.floor(cash / 10000);
  submit(engine, "user", "buy", quantity, 10000);
  rejectWithoutMutation(engine, () => submit(engine, "user", "buy", 1, 10000));
  assertHealthy(engine);
});

test("Aynı hesap kendi karşı emriyle işlem yapamaz", () => {
  const engine = fixture();
  // Kullanıcı önce gerçek bir karşı taraftan pay alır; böylece iki emir de
  // geçerli bakiyeye dayanır ve sınanan tek kural kendi kendine işlem yasağıdır.
  submit(engine, "founder-A", "sell", 5, 9000);
  submit(engine, "user", "buy", 5, 9000);
  const beforeCash = account(engine).cash;
  const beforeShares = account(engine).holdings.A;
  const tradesBefore = engine.trades.length;
  const buy = submit(engine, "user", "buy", 2, 10000);
  const sell = submit(engine, "user", "sell", 2, 10000);

  assert.equal(buy.remaining, 2);
  assert.equal(sell.remaining, 2);
  assert.equal(engine.trades.length, tradesBefore);
  assert.equal(account(engine).cash, beforeCash);
  assert.equal(account(engine).holdings.A, beforeShares);
  assertHealthy(engine);
});

test("İkincil işlem parayı alıcıdan satıcıya aktarır; şirket kasasına sermaye eklemez", () => {
  const engine = fixture();
  const companyCash = engine.startups.map((startup) => startup.companyCash);
  const buyerCash = account(engine).cash;
  const sellerCash = account(engine, "founder-A").cash;
  const totalShares = engine.startups.find(
    (startup) => startup.symbol === "A",
  ).totalShares;

  submit(engine, "founder-A", "sell", 7, 10000);
  submit(engine, "user", "buy", 7, 11000);

  assert.equal(account(engine).cash, buyerCash - 70000);
  assert.equal(account(engine, "founder-A").cash, sellerCash + 70000);
  assert.deepEqual(
    engine.startups.map((startup) => startup.companyCash),
    companyCash,
  );
  assert.equal(
    engine.startups.find((startup) => startup.symbol === "A").totalShares,
    totalShares,
  );
  assert.equal(engine.trades.at(-1).kind, "secondary");
  assertHealthy(engine);
});

test("Birincil fonlama şirket kasasını ve pay arzını artırır; eski ortaklar seyrelir", () => {
  const engine = fixture();
  const startup = engine.startups.find((item) => item.symbol === "H");
  const before = {
    cash: startup.companyCash,
    shares: startup.totalShares,
    founderShares: account(engine, "founder-H").holdings.H,
    buyerCash: account(engine).cash,
    buyerShares: account(engine).holdings.H || 0,
    sold: startup.funding.soldShares,
    raised: startup.funding.raised,
    history: JSON.stringify(startup.history),
    price: startup.price,
  };
  const funding = engine.fund("H", 7);

  assert.equal(funding.total, 7 * funding.price);
  assert.equal(startup.companyCash, before.cash + funding.total);
  assert.equal(account(engine).cash, before.buyerCash - funding.total);
  assert.equal(account(engine).holdings.H, before.buyerShares + 7);
  assert.equal(startup.totalShares, before.shares + 7);
  assert.equal(account(engine, "founder-H").holdings.H, before.founderShares);
  assert.ok(
    before.founderShares / startup.totalShares <
      before.founderShares / before.shares,
  );
  assert.equal(startup.funding.soldShares, before.sold + 7);
  assert.equal(startup.funding.raised, before.raised + funding.total);
  assert.equal(funding.trade.kind, "funding");
  // Fonlama fiyatı, borsadaki gerçekleşmiş fiyat mumlarını değiştirmemeli.
  assert.equal(startup.price, before.price);
  assert.equal(JSON.stringify(startup.history), before.history);
  assertHealthy(engine);
});

test("Geçersiz veya tur/bakiye sınırını aşan birincil yatırım tamamen reddedilir", () => {
  const engine = fixture();
  const startup = engine.startups.find((item) => item.symbol === "H");
  for (const quantity of [
    0,
    -1,
    1.5,
    startup.funding.offeredShares - startup.funding.soldShares + 1,
  ]) {
    rejectWithoutMutation(engine, () => engine.fund("H", quantity));
  }
  const unaffordable =
    Math.floor(engine.availableCash("user") / startup.funding.price) + 1;
  rejectWithoutMutation(engine, () => engine.fund("H", unaffordable));
  assertHealthy(engine);
});

test("İflas açık emirleri kapatır, blokajları çözer ve kalan payların portföy değerini sıfırlar", () => {
  const engine = fixture();
  submit(engine, "founder-A", "sell", 10, 10000);
  submit(engine, "user", "buy", 10, 10000);
  const bid = submit(engine, "user", "buy", 2, 1);
  const ask = submit(engine, "user", "sell", 3, 100000000);
  const startup = engine.startups.find((item) => item.symbol === "A");
  const lastPrice = startup.price;
  const history = JSON.stringify(startup.history);

  for (let i = 0; i < 6; i += 1) engine.scenario("crisis", "A");
  engine.advance(30);

  assert.equal(startup.status, "bankrupt");
  assert.equal(startup.companyCash, 0);
  assert.equal(bid.status, "cancelled");
  assert.equal(ask.status, "cancelled");
  assert.equal(engine.reservedCash("user"), 0);
  assert.equal(engine.reservedShares("A", "user"), 0);
  assert.equal(account(engine).holdings.A, 10);
  const position = engine
    .portfolio()
    .positions.find((item) => item.symbol === "A");
  assert.equal(position.price, 0);
  assert.equal(position.value, 0);
  assert.equal(startup.price, lastPrice, "Grafik son gerçek işlemi korumalı");
  assert.equal(JSON.stringify(startup.history), history);
  rejectWithoutMutation(engine, () => submit(engine, "user", "buy", 1, 10000));
  rejectWithoutMutation(engine, () => engine.fund("A", 1));
  assertHealthy(engine);
});

test("Kaydedilip geri yüklenen açık emirler bakiyelerini ve blokajlarını korur", () => {
  const engine = fixture();
  submit(engine, "user", "buy", 5, 5000);
  submit(engine, "founder-A", "sell", 10, 9000);
  const restored = VentureEngine.fromJSON(engine.serialize());

  assert.equal(snapshot(restored), snapshot(engine));
  assert.equal(restored.reservedCash("user"), 25000);
  assert.equal(restored.reservedShares("A", "founder-A"), 10);
  restored.advance(3);
  engine.advance(3);
  assert.equal(
    snapshot(restored),
    snapshot(engine),
    "Rastgele üreteç durumu da kaydedilmeli",
  );
  assertHealthy(restored);
});

test("Bozuk veya muhasebesi değiştirilmiş kayıt dosyası içe aktarılamaz", () => {
  const engine = fixture();
  const initial = snapshot(engine);
  const corruptions = [
    (state) => {
      state.accounts.find((owner) => owner.id === "user").cash = -1;
    },
    (state) => {
      state.accounts.find((owner) => owner.id === "user").cash += 1;
    },
    (state) => {
      const owner = state.accounts.find((item) => item.id === "user");
      owner.holdings.A = (owner.holdings.A || 0) + 1;
    },
    (state) => {
      state.startups[0].totalShares += 1;
    },
    (state) => {
      state.startups[0].companyCash += 1;
    },
    (state) => {
      state.trades[0].quantity += 1;
    },
    (state) => {
      state._nextOrder = 0;
    },
    (state) => {
      state.version = 999;
    },
  ];
  for (const mutate of corruptions) {
    const state = engine.serialize();
    mutate(state);
    assert.throws(() => VentureEngine.fromJSON(state));
    assert.equal(
      snapshot(engine),
      initial,
      "İçe aktarma kaynak oturumunu değiştirmemeli",
    );
  }
  assert.throws(() => VentureEngine.fromJSON("{geçersiz"));
  assert.throws(() => VentureEngine.fromJSON({}));
  assertHealthy(engine);
});

test("Aynı tohum ve aynı eylemler aynı piyasa sonucunu üretir", () => {
  const first = new VentureEngine(4821, { warmupDays: 0 });
  const second = new VentureEngine(4821, { warmupDays: 0 });
  for (const engine of [first, second]) {
    engine.advance(10);
    engine.scenario("panic", "B");
    engine.advance(20);
    engine.scenario("growth", "G");
    engine.advance(15);
  }
  assert.equal(snapshot(first), snapshot(second));
  assertHealthy(first);
  assertHealthy(second);
});

test("365 gün ve olumsuz senaryolar boyunca nakit, pay ve blokajlar eksiye düşmez", () => {
  const engine = new VentureEngine(98213, { warmupDays: 0 });
  const symbols = "ABCDEFGH".split("");
  for (let day = 0; day < 365; day += 1) {
    const panicTarget = symbols[Math.floor(day / 30) % symbols.length];
    const crisisTarget = symbols[Math.floor(day / 60) % symbols.length];
    if (
      day % 30 === 0 &&
      engine.startups.find((item) => item.symbol === panicTarget).status ===
        "active"
    )
      engine.scenario("panic", panicTarget);
    if (
      day % 60 === 0 &&
      engine.startups.find((item) => item.symbol === crisisTarget).status ===
        "active"
    )
      engine.scenario("crisis", crisisTarget);
    engine.advance(1);
    assertHealthy(engine);
  }
  assert.ok(
    engine.startups.some((startup) => startup.status === "bankrupt"),
    "Stres koşulları iflas yolunu da sınamalı",
  );
});
