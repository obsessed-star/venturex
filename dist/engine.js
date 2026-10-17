/* VentureX — tamamı yerel, kapalı bir sanal piyasa.
 * Paralar KURUŞ, adetler tam sayıdır. Rastlantı işletme girdileri ve yatırımcı
 * kararlarında kullanılır; fiyat yalnızca gerçekleşen ikincil işlemle değişir.
 * Nakit: yatırımcı ↔ yatırımcı, yatırımcı → şirket; faaliyet geliri/gideri ise
 * piyasa dışındaki ekonomiyle gerçek, ayrıca kaydedilen sanal nakit akışıdır.
 */
(function (root) {
  "use strict";
  const SYMBOLS = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const LIVE = (o) => o.status === "open" || o.status === "partial";
  const MAX_PRICE = 100000000;
  const MAX_QTY = 1000000000;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const integer = (n, min = 0, max = Number.MAX_SAFE_INTEGER) =>
    Number.isSafeInteger(n) && n >= min && n <= max;
  const sum = (values) => values.reduce((a, b) => a + b, 0);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const CATALOG = [
    ["A", "A", "Yapay zekâ", "#4c84ff", 1200, 54000000, 62000000, 17500, 37],
    ["B", "B", "Temiz enerji", "#36dba0", 1800, 72000000, 58000000, 31000, 17],
    [
      "C",
      "C",
      "Sağlık teknolojisi",
      "#b396ff",
      950,
      44000000,
      69000000,
      9200,
      31,
    ],
    [
      "D",
      "D",
      "Finans teknolojisi",
      "#f5ba58",
      1450,
      61000000,
      60000000,
      42000,
      24,
    ],
    ["E", "E", "Lojistik", "#58cbed", 800, 39000000, 47000000, 12500, 23],
    [
      "F",
      "F",
      "Oyun ve eğlence",
      "#ed779b",
      1600,
      83000000,
      77000000,
      67000,
      29,
    ],
    [
      "G",
      "G",
      "Tarım teknolojisi",
      "#b7d66c",
      1050,
      43000000,
      52000000,
      7300,
      19,
    ],
    [
      "H",
      "H",
      "Uzay ve robotik",
      "#f4935c",
      1350,
      21000000,
      42000000,
      4200,
      43,
    ],
  ];
  // Küçük girişimlerin açık sermaye ihtiyacı: her tur 40.000 yeni sanal pay.
  // Başlangıç destekçileri hedefi doldurmaz; küçük yatırımcıya açık pay kalır.
  const EARLY_SUPPORT = {
    A: 2000,
    B: 2500,
    C: 750,
    D: 1750,
    E: 1000,
    F: 2250,
    G: 1250,
    H: 500,
  };

  class VentureEngine {
    constructor(seed = 42, options = {}) {
      if (seed && typeof seed === "object") {
        options = seed;
        seed = options.seed === undefined ? 42 : options.seed;
      }
      if (!integer(seed, 0, 4294967295))
        throw new Error("Simülasyon tohumu geçerli bir tam sayı olmalıdır.");
      const warmup = options.warmupDays === undefined ? 60 : options.warmupDays;
      if (!integer(warmup, 0, 365))
        throw new Error("Başlangıç dönemi 0–365 gün olmalıdır.");
      this.version = 2;
      this.seed = seed;
      this.day = 0;
      this._rngState = seed >>> 0 || 2654435769;
      this._nextOrder = 1;
      this._nextTrade = 1;
      this._nextNews = 1;
      this._botsEnabled = options.bots !== false;
      this._externalNetCash = 0;
      this._bootstrapping = true;
      this.orders = [];
      this.trades = [];
      this.news = [];
      this.accounts = [this._account("user", "Sen", 10000000)];
      this.startups = CATALOG.map(
        ([
          symbol,
          name,
          sector,
          color,
          price,
          revenue,
          expenses,
          users,
          growthBp,
        ]) => ({
          symbol,
          name,
          sector,
          color,
          price,
          previousClose: price,
          history: [],
          companyCash: 20000000,
          revenue: Math.round(revenue / 5),
          expenses: Math.round(expenses / 5),
          users: Math.round(users / 10),
          totalShares: 600000,
          founderShares: 600000,
          status: "active",
          totalRaised: 0,
          funding: {
            target: price * 40000,
            raised: 0,
            price,
            offeredShares: 40000,
            soldShares: 0,
            round: 1,
            open: true,
          },
          growthBp,
          sentimentBp: 0,
          riskBp: 0,
          _initialPrice: price,
          _baseRevenue: Math.round(revenue / 5),
          _baseUsers: Math.round(users / 10),
          _seedCash: 20000000,
          _initialShares: 600000,
          _operatingReceived: 0,
          _operatingSpent: 0,
        }),
      );
      for (const s of this.startups) {
        const founder = this._account(
          "founder-" + s.symbol,
          s.symbol + " kurucuları",
          0,
        );
        founder.holdings[s.symbol] = 600000;
        founder.initialHoldings[s.symbol] = 600000;
        this.accounts.push(founder);
        for (let i = 1; i <= 8; i++) {
          const a = this._account(
            "bot-" + s.symbol + "-" + i,
            [
              "Değer",
              "Temkinli",
              "Uzun vade",
              "Denge",
              "Büyüme",
              "Trend",
              "Girişim",
              "Dinamik",
            ][i - 1] +
              " fonu " +
              s.symbol,
            130000000,
          );
          a.botSymbol = s.symbol;
          a.biasBp = [-650, -420, -250, -80, 80, 250, 420, 650][i - 1];
          a.targetShares = EARLY_SUPPORT[s.symbol];
          this.accounts.push(a);
        }
      }
      this._initialTotalCash =
        sum(this.accounts.map((a) => a.cash)) +
        sum(this.startups.map((s) => s.companyCash));
      // Kurucu payları önceden var; fonlara satılan birincil paylar yeni ihraçtır.
      for (const s of this.startups) {
        const initialAllocation = EARLY_SUPPORT[s.symbol];
        for (let i = 1; i <= 8; i++)
          this.fund(s.symbol, initialAllocation, "bot-" + s.symbol + "-" + i);
      }
      if (this._botsEnabled) {
        for (let i = 0; i < warmup; i++) this._advanceOne();
        if (!warmup) this._runBots();
      }
      this._bootstrapping = false;
      this._pushNews(
        null,
        "8 küçük girişimin yatırım turu açık: yeni pay yatırımları doğrudan şirket kasasına gider.",
        0,
      );
      this._trim();
      const result = this.audit();
      if (!result.ok)
        throw new Error(
          "Başlangıç hesap denetimi başarısız: " + result.errors.join("; "),
        );
    }

    _account(id, name, cash) {
      return {
        id,
        name,
        cash,
        holdings: {},
        costs: {},
        initialHoldings: {},
        initialCash: cash,
        realizedPnl: 0,
      };
    }
    _random() {
      let x = this._rngState;
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      this._rngState = x >>> 0;
      return this._rngState / 4294967296;
    }
    _startup(symbol) {
      const s = this.startups.find((item) => item.symbol === symbol);
      if (!s)
        throw new Error("Geçersiz girişim kodu. A–H arasında bir girişim seç.");
      return s;
    }
    getAccount(id = "user") {
      const a = this.accounts.find((item) => item.id === id);
      if (!a) throw new Error("Yatırımcı hesabı bulunamadı.");
      return a;
    }
    reservedCash(accountId = "user") {
      this.getAccount(accountId);
      return sum(
        this.orders
          .filter(
            (o) => LIVE(o) && o.accountId === accountId && o.side === "buy",
          )
          .map((o) => o.price * o.remaining),
      );
    }
    reservedShares(symbol, accountId = "user") {
      this._startup(symbol);
      this.getAccount(accountId);
      return sum(
        this.orders
          .filter(
            (o) =>
              LIVE(o) &&
              o.accountId === accountId &&
              o.symbol === symbol &&
              o.side === "sell",
          )
          .map((o) => o.remaining),
      );
    }
    availableCash(id = "user") {
      return this.getAccount(id).cash - this.reservedCash(id);
    }
    availableShares(symbol, id = "user") {
      return (
        (this.getAccount(id).holdings[symbol] || 0) -
        this.reservedShares(symbol, id)
      );
    }
    orderBook(symbol) {
      this._startup(symbol);
      const aggregate = (side) => {
        const levels = new Map();
        for (const o of this.orders)
          if (o.symbol === symbol && o.side === side && LIVE(o))
            levels.set(o.price, (levels.get(o.price) || 0) + o.remaining);
        return [...levels]
          .map(([price, quantity]) => ({ price, quantity }))
          .sort((a, b) =>
            side === "buy" ? b.price - a.price : a.price - b.price,
          );
      };
      return { bids: aggregate("buy"), asks: aggregate("sell") };
    }
    _oppositeOrders(symbol, side, accountId, limit) {
      return this.orders
        .filter(
          (o) =>
            LIVE(o) &&
            o.symbol === symbol &&
            o.side !== side &&
            o.accountId !== accountId &&
            (limit === null ||
              (side === "buy" ? o.price <= limit : o.price >= limit)),
        )
        .sort(
          (a, b) =>
            (side === "buy" ? a.price - b.price : b.price - a.price) ||
            a.createdAt - b.createdAt,
        );
    }
    placeOrder({
      symbol,
      side,
      type = "limit",
      quantity,
      price,
      accountId = "user",
    } = {}) {
      const s = this._startup(symbol);
      this.getAccount(accountId);
      if (s.status !== "active")
        throw new Error("Bu girişim iflas etti; işlem yapılamaz.");
      if (side !== "buy" && side !== "sell")
        throw new Error("Emir yönü alış veya satış olmalıdır.");
      if (type !== "limit" && type !== "market")
        throw new Error("Emir türü limit veya piyasa olmalıdır.");
      if (!integer(quantity, 1, MAX_QTY))
        throw new Error("Pay adedi 1 veya daha büyük bir tam sayı olmalıdır.");
      if (type === "limit" && !integer(price, 1, MAX_PRICE))
        throw new Error("Limit fiyatı pozitif tam kuruş olmalıdır.");
      if (side === "sell" && this.availableShares(symbol, accountId) < quantity)
        throw new Error(
          "Satılabilir payın yetersiz; açık satış emirleri de pay ayırır.",
        );
      const opponents = this._oppositeOrders(
        symbol,
        side,
        accountId,
        type === "market" ? null : price,
      );
      if (type === "market") {
        let remaining = quantity,
          cost = 0,
          finalPrice = 0;
        for (const o of opponents) {
          const qty = Math.min(remaining, o.remaining);
          cost += qty * o.price;
          if (!Number.isSafeInteger(cost))
            throw new Error("Emir tutarı çok büyük.");
          remaining -= qty;
          finalPrice = o.price;
          if (!remaining) break;
        }
        if (remaining)
          throw new Error(
            "Piyasada bu adedi karşılayacak likidite yok. Adedi azalt veya limit emir kullan.",
          );
        if (side === "buy" && this.availableCash(accountId) < cost)
          throw new Error(
            "Piyasa emri için kullanılabilir sanal bakiyen yetersiz.",
          );
        price = finalPrice;
      } else {
        const value = quantity * price;
        if (!Number.isSafeInteger(value))
          throw new Error("Emir tutarı çok büyük.");
        if (side === "buy" && this.availableCash(accountId) < value)
          throw new Error(
            "Kullanılabilir sanal bakiyen yetersiz; açık alış emirleri de nakit ayırır.",
          );
      }
      // Bütün reddetme kontrolleri kimlik üretiminden önce: reddedilen emir atomiktir.
      const o = {
        id: "O" + this._nextOrder,
        accountId,
        symbol,
        side,
        type,
        price,
        quantity,
        remaining: quantity,
        filled: 0,
        status: "open",
        createdAt: this._nextOrder++,
      };
      this.orders.push(o);
      for (const resting of opponents) {
        if (!o.remaining) break;
        const qty = Math.min(o.remaining, resting.remaining);
        const buyer = side === "buy" ? o : resting;
        const seller = side === "sell" ? o : resting;
        this._execute(buyer, seller, qty, resting.price);
      }
      return o;
    }
    _execute(buyOrder, sellOrder, quantity, price) {
      const buyer = this.getAccount(buyOrder.accountId),
        seller = this.getAccount(sellOrder.accountId);
      const symbol = buyOrder.symbol,
        value = quantity * price;
      if (buyer.id === seller.id)
        throw new Error("Bir hesap kendi emriyle eşleşemez.");
      if (buyer.cash < value || (seller.holdings[symbol] || 0) < quantity)
        throw new Error("Emir defterinde hesap tutarsızlığı.");
      const sellerQty = seller.holdings[symbol] || 0,
        sellerCost = seller.costs[symbol] || 0;
      const removedCost =
        quantity === sellerQty
          ? sellerCost
          : Math.round((sellerCost * quantity) / sellerQty);
      // İki tarafın kalan emri aynı işlemde azalır; bloke tutarlar kendiliğinden çözülür.
      for (const o of [buyOrder, sellOrder]) {
        o.remaining -= quantity;
        o.filled += quantity;
        o.status = o.remaining ? "partial" : "filled";
      }
      buyer.cash -= value;
      seller.cash += value;
      buyer.holdings[symbol] = (buyer.holdings[symbol] || 0) + quantity;
      buyer.costs[symbol] = (buyer.costs[symbol] || 0) + value;
      seller.holdings[symbol] -= quantity;
      seller.costs[symbol] = sellerCost - removedCost;
      seller.realizedPnl += value - removedCost;
      const s = this._startup(symbol);
      s.founderShares =
        this.getAccount("founder-" + symbol).holdings[symbol] || 0;
      const trade = {
        id: "T" + this._nextTrade++,
        day: this.day,
        symbol,
        buyerId: buyer.id,
        sellerId: seller.id,
        quantity,
        price,
        kind: "secondary",
      };
      this.trades.push(trade);
      this._recordCandle(s, quantity, price);
    }
    _recordCandle(s, quantity, price) {
      let candle = s.history[s.history.length - 1];
      if (!candle || candle.day !== this.day) {
        candle = {
          day: this.day,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: 0,
        };
        s.history.push(candle);
      }
      candle.high = Math.max(candle.high, price);
      candle.low = Math.min(candle.low, price);
      candle.close = price;
      candle.volume += quantity;
      s.price = price;
    }
    cancelOrder(orderId, accountId = "user") {
      this.getAccount(accountId);
      const o = this.orders.find((order) => order.id === orderId);
      if (!o || o.accountId !== accountId)
        throw new Error("Bu hesaba ait emir bulunamadı.");
      if (!LIVE(o)) throw new Error("Bu emir artık açık değil.");
      o.status = "cancelled";
      return o;
    }
    fund(symbol, quantity, accountId = "user") {
      const s = this._startup(symbol),
        a = this.getAccount(accountId),
        f = s.funding;
      if (s.status !== "active")
        throw new Error("İflas etmiş girişime yatırım yapılamaz.");
      if (!f.open) throw new Error("Bu girişimin yatırım turu kapalı.");
      if (!integer(quantity, 1, MAX_QTY))
        throw new Error("Yatırım payı adedi pozitif tam sayı olmalıdır.");
      if (quantity > f.offeredShares - f.soldShares)
        throw new Error("Yatırım turunda bu kadar pay kalmadı.");
      const total = quantity * f.price;
      if (
        !Number.isSafeInteger(total) ||
        !Number.isSafeInteger(s.totalShares + quantity)
      )
        throw new Error("Yatırım tutarı çok büyük.");
      if (this.availableCash(accountId) < total)
        throw new Error("Yatırım için kullanılabilir sanal bakiyen yetersiz.");
      const previousShares = s.totalShares;
      a.cash -= total;
      s.companyCash += total;
      a.holdings[symbol] = (a.holdings[symbol] || 0) + quantity;
      a.costs[symbol] = (a.costs[symbol] || 0) + total;
      s.totalShares += quantity;
      s.totalRaised += total;
      f.soldShares += quantity;
      f.raised += total;
      if (f.soldShares === f.offeredShares) f.open = false;
      const trade = {
        id: "T" + this._nextTrade++,
        day: this.day,
        symbol,
        buyerId: accountId,
        sellerId: "company-" + symbol,
        quantity,
        price: f.price,
        kind: "funding",
      };
      this.trades.push(trade);
      if (!this._bootstrapping)
        this._pushNews(
          symbol,
          symbol +
            " girişimine yeni sermaye: " +
            quantity.toLocaleString("tr-TR") +
            " pay ihraç edildi.",
          1,
        );
      // Seyrelme oranı yüzde değil, basis point (1/10000) olarak tam sayıdır.
      return {
        trade,
        quantity,
        price: f.price,
        total,
        dilution: Math.round((quantity * 10000) / s.totalShares),
        previousShares,
        totalShares: s.totalShares,
      };
    }
    _pushNews(symbol, title, sentiment) {
      this.news.unshift({
        id: "N" + this._nextNews++,
        day: this.day,
        symbol,
        title,
        sentiment,
      });
      if (this.news.length > 180) this.news.length = 180;
    }
    _fairValue(s) {
      const revenueFactor = Math.pow(
        Math.max(0.02, s.revenue / s._baseRevenue),
        0.54,
      );
      const userFactor = Math.pow(Math.max(0.02, s.users / s._baseUsers), 0.22);
      const burn = Math.max(1, s.expenses - s.revenue);
      const runway = s.companyCash / burn;
      const survival =
        runway < 1
          ? 0.48 + runway * 0.3
          : Math.min(1.08, 0.78 + runway * 0.035);
      const dilution = Math.pow(
        (this.version === 1 ? 1000000 : 640000) / s.totalShares,
        0.65,
      );
      return clamp(
        Math.round(
          s._initialPrice *
            revenueFactor *
            userFactor *
            survival *
            dilution *
            (1 + s.sentimentBp / 10000),
        ),
        20,
        1000000,
      );
    }
    _cancelBotOrders(symbol) {
      for (const o of this.orders)
        if (LIVE(o) && o.symbol === symbol && o.accountId.startsWith("bot-"))
          o.status = "cancelled";
    }
    _quote(account, s, side, quantity, price) {
      price = clamp(Math.round(price), 1, MAX_PRICE);
      const available =
        side === "buy"
          ? Math.floor(this.availableCash(account.id) / price)
          : this.availableShares(s.symbol, account.id);
      quantity = Math.min(quantity, available);
      if (quantity > 0)
        this.placeOrder({
          symbol: s.symbol,
          side,
          type: "limit",
          quantity,
          price,
          accountId: account.id,
        });
    }
    _runBots() {
      for (const s of this.startups) {
        if (s.status !== "active") continue;
        this._cancelBotOrders(s.symbol);
        const fair = this._fairValue(s);
        const bots = this.accounts.filter((a) => a.botSymbol === s.symbol);
        // Değerlemeleri farklı yatırımcılar bazen birbirinin kotasyonunu alır.
        // Bütün fiyat hareketi burada placeOrder → _execute yolundan geçer.
        const rotation = this.day % 8;
        for (let k = 0; k < bots.length; k++) {
          const a = bots[(k + rotation) % bots.length];
          const inventoryBp = clamp(
            Math.round(
              (((a.holdings[s.symbol] || 0) - a.targetShares) * 1800) /
                Math.max(1, a.targetShares),
            ),
            -1600,
            1600,
          );
          const noiseBp = Math.round((this._random() - 0.5) * 350);
          const opinion =
            fair * (1 + (a.biasBp + noiseBp - inventoryBp) / 10000);
          const spreadBp = 80 + Math.round(s.riskBp / 15);
          const bid = clamp(
            Math.round(opinion * (1 - spreadBp / 10000)),
            1,
            MAX_PRICE,
          );
          const ask = clamp(
            Math.round(opinion * (1 + spreadBp / 10000)),
            bid + 1,
            MAX_PRICE,
          );
          const lot = 170 + Math.floor(this._random() * 850);
          // Taraf sırası her gün değişir; işlem fiyatı daima dinlenen emir fiyatıdır.
          if ((k + this.day) % 2) {
            this._quote(a, s, "sell", lot, ask);
            this._quote(a, s, "buy", lot, bid);
          } else {
            this._quote(a, s, "buy", lot, bid);
            this._quote(a, s, "sell", lot, ask);
          }
        }
        this._ensureLiquidity(s, bots);
        if (!this._bootstrapping && s.funding.open && this.day % 7 === 0) {
          for (const a of bots) {
            if (!s.funding.open) break;
            if (this._fairValue(s) < s.funding.price * 0.8) continue;
            const qty = Math.min(
              300,
              s.funding.offeredShares - s.funding.soldShares,
              Math.floor(this.availableCash(a.id) / s.funding.price),
            );
            if (qty > 0) this.fund(s.symbol, qty, a.id);
          }
        }
      }
    }
    _ensureLiquidity(s, bots) {
      const book = this.orderBook(s.symbol);
      const anchor = s.price;
      for (let k = 0; k < bots.length; k++) {
        const a = bots[k];
        // Görünür alış/satış likiditesi gerçek hesapların parası ve payıyla ayrılır.
        // Mevcut en iyi fiyatın dışına konur; bu satırlar fiyatı doğrudan değiştirmez.
        const ask = Math.max(
          anchor + 1,
          Math.round(anchor * (1.012 + k * 0.005)),
          book.bids[0] ? book.bids[0].price + 1 : 1,
        );
        const bid = Math.max(
          1,
          Math.min(
            anchor - 1,
            Math.round(anchor * (0.988 - k * 0.005)),
            book.asks[0] ? book.asks[0].price - 1 : MAX_PRICE,
          ),
        );
        this._quote(a, s, "sell", 350 + k * 95, ask);
        this._quote(a, s, "buy", 350 + k * 95, bid);
      }
    }
    _advanceOne() {
      this.day++;
      for (const s of this.startups) {
        if (s.status !== "active") continue;
        s.previousClose = s.price;
        const fluctuationBp = Math.round((this._random() - 0.5) * 52);
        // Fonlanan geliştirme/pazarlama planı büyüme kapasitesini ve gideri etkiler.
        // Başarı garantisi yoktur: olumsuz haberler, nakit tüketimi ve iflas sürer.
        const completion =
          this.version === 1
            ? 0
            : Math.min(1, s.funding.raised / s.funding.target);
        const capacity =
          this.version === 1 || s.growthBp < 0 ? 1 : 0.45 + completion * 0.9;
        const dailyGrowthBp = Math.round(s.growthBp * capacity) + fluctuationBp;
        s.revenue = clamp(
          Math.round(s.revenue * (1 + dailyGrowthBp / 10000)),
          0,
          10000000000,
        );
        s.users = clamp(
          Math.round(
            s.users *
              (1 + (s.growthBp * capacity + fluctuationBp * 0.6) / 10000),
          ),
          0,
          1000000000,
        );
        s.expenses = clamp(
          Math.round(
            s.expenses *
              (1 + (8 + completion * 8 + (this._random() - 0.5) * 20) / 10000),
          ),
          1,
          10000000000,
        );
        s.sentimentBp = Math.round(s.sentimentBp * 0.96);
        s.riskBp = Math.round(s.riskBp * 0.98);
        const received = Math.round(s.revenue / 30);
        const due = Math.round(s.expenses / 30);
        const spent = Math.min(s.companyCash + received, due);
        s.companyCash += received - spent;
        s._operatingReceived += received;
        s._operatingSpent += spent;
        this._externalNetCash += received - spent;
        if (spent < due) {
          s.status = "bankrupt";
          s.funding.open = false;
          for (const o of this.orders)
            if (LIVE(o) && o.symbol === s.symbol) o.status = "cancelled";
          this._pushNews(
            s.symbol,
            s.symbol +
              " nakit yükümlülüğünü karşılayamadı; iflas ilan edildi ve işlemler durduruldu.",
            -1,
          );
          continue;
        }
        const burn = s.expenses - s.revenue;
        const runwayDays = burn > 0 ? s.companyCash / (burn / 30) : 9999;
        if (!s.funding.open && runwayDays < 60) this._openRound(s);
        if (
          !this._bootstrapping &&
          this.day % 15 === SYMBOLS.indexOf(s.symbol) + 1
        ) {
          this._pushNews(
            s.symbol,
            s.symbol +
              ": " +
              s.users.toLocaleString("tr-TR") +
              " kullanıcı, " +
              (s.revenue >= s.expenses
                ? "pozitif faaliyet nakit akışı."
                : "büyüme yatırımları nedeniyle nakit tüketimi."),
            s.revenue >= s.expenses ? 1 : 0,
          );
        }
      }
      if (this._botsEnabled) this._runBots();
      this._trim();
    }
    _openRound(s) {
      const offeredShares = Math.max(1000, Math.round(s.totalShares * 0.18));
      const price = Math.max(1, Math.round(s.price * 0.88));
      s.funding = {
        target: offeredShares * price,
        raised: 0,
        price,
        offeredShares,
        soldShares: 0,
        round: s.funding.round + 1,
        open: true,
      };
      this._pushNews(
        s.symbol,
        s.symbol +
          " yeni yatırım turu açtı. Yeni pay ihracı mevcut ortaklık oranlarını seyreltebilir.",
        0,
      );
    }
    advance(days = 1) {
      if (!integer(days, 1, 365))
        throw new Error(
          "İlerleme süresi 1–365 gün arasında bir tam sayı olmalıdır.",
        );
      for (let i = 0; i < days; i++) this._advanceOne();
      return this;
    }
    scenario(kind, symbol) {
      if (!["growth", "panic", "crisis"].includes(kind))
        throw new Error("Senaryo büyüme, panik veya kriz olmalıdır.");
      const targets =
        symbol === undefined || symbol === null || symbol === "all"
          ? this.startups.filter((s) => s.status === "active")
          : [this._startup(symbol)];
      if (!targets.length || targets.some((s) => s.status !== "active"))
        throw new Error("İflas etmiş girişimde senaryo uygulanamaz.");
      for (const s of targets) {
        if (kind === "growth") {
          s.revenue = Math.min(10000000000, Math.round(s.revenue * 1.22));
          s.users = Math.min(1000000000, Math.round(s.users * 1.18));
          s.growthBp = Math.min(90, s.growthBp + 9);
          s.sentimentBp = Math.min(3500, s.sentimentBp + 1300);
          this._pushNews(
            s.symbol,
            s.symbol +
              " büyük müşteri anlaşması kazandı: gelir ve kullanıcı beklentisi yükseldi.",
            1,
          );
        } else if (kind === "panic") {
          s.sentimentBp = Math.max(-6500, s.sentimentBp - 2700);
          s.riskBp = Math.min(5000, s.riskBp + 1800);
          this._pushNews(
            s.symbol,
            s.symbol +
              " çevresinde satış paniği: yatırımcıların risk iştahı düştü.",
            -1,
          );
        } else {
          s.revenue = Math.round(s.revenue * 0.46);
          s.expenses = Math.min(10000000000, Math.round(s.expenses * 1.45));
          s.users = Math.round(s.users * 0.72);
          s.growthBp = Math.max(-150, s.growthBp - 75);
          s.sentimentBp = Math.max(-6500, s.sentimentBp - 3700);
          s.riskBp = Math.min(5000, s.riskBp + 2700);
          // Olağanüstü gider sanal ekonomiye ödenir; para sessizce silinmez.
          const extraordinaryExpense = Math.round(s.companyCash * 0.64);
          s.companyCash -= extraordinaryExpense;
          s._operatingSpent += extraordinaryExpense;
          this._externalNetCash -= extraordinaryExpense;
          this._pushNews(
            s.symbol,
            s.symbol +
              " faaliyet krizi: gelir kaybı ve olağanüstü gider; nakit dayanıklılığı azaldı.",
            -1,
          );
          if (!s.funding.open) this._openRound(s);
        }
      }
      if (this._botsEnabled) this._runBots();
      this._trim();
      return this;
    }
    _trim() {
      // Açık emirler asla düşürülmez. Muhasebe için bütün gerçekleşen işlemler tutulur.
      if (this.orders.length > 1600) {
        const closed = this.orders.filter((o) => !LIVE(o));
        const keep = new Set(closed.slice(-800).map((o) => o.id));
        this.orders = this.orders.filter((o) => LIVE(o) || keep.has(o.id));
      }
      for (const s of this.startups)
        if (s.history.length > 730) s.history.splice(0, s.history.length - 730);
    }
    portfolio(id = "user") {
      const a = this.getAccount(id);
      const positions = this.startups
        .filter((s) => (a.holdings[s.symbol] || 0) > 0)
        .map((s) => {
          const quantity = a.holdings[s.symbol],
            price = s.status === "bankrupt" ? 0 : s.price;
          const value = price * quantity,
            cost = a.costs[s.symbol] || 0;
          return {
            symbol: s.symbol,
            quantity,
            price,
            value,
            averageCost: Math.round(cost / quantity),
            pnl: value - cost,
          };
        });
      const marketValue = sum(positions.map((p) => p.value));
      return {
        cash: a.cash,
        reservedCash: this.reservedCash(id),
        availableCash: this.availableCash(id),
        positions,
        marketValue,
        totalValue: a.cash + marketValue,
        realizedPnl: a.realizedPnl,
        unrealizedPnl: sum(positions.map((p) => p.pnl)),
      };
    }
    serialize() {
      return clone({
        version: this.version,
        seed: this.seed,
        day: this.day,
        _rngState: this._rngState,
        _nextOrder: this._nextOrder,
        _nextTrade: this._nextTrade,
        _nextNews: this._nextNews,
        _botsEnabled: this._botsEnabled,
        _externalNetCash: this._externalNetCash,
        _initialTotalCash: this._initialTotalCash,
        startups: this.startups,
        accounts: this.accounts,
        orders: this.orders,
        trades: this.trades,
        news: this.news,
      });
    }
    static fromJSON(input) {
      let state;
      try {
        state = typeof input === "string" ? JSON.parse(input) : clone(input);
      } catch (_) {
        throw new Error("Kayıt dosyası geçerli JSON değil.");
      }
      VentureEngine._validateState(state);
      const engine = Object.create(VentureEngine.prototype);
      for (const key of [
        "version",
        "seed",
        "day",
        "_rngState",
        "_nextOrder",
        "_nextTrade",
        "_nextNews",
        "_botsEnabled",
        "_externalNetCash",
        "_initialTotalCash",
        "startups",
        "accounts",
        "orders",
        "trades",
        "news",
      ])
        engine[key] = state[key];
      engine._bootstrapping = false;
      const report = engine.audit();
      if (!report.ok)
        throw new Error(
          "Kayıt dosyasının muhasebesi geçersiz: " +
            report.errors.slice(0, 5).join("; "),
        );
      return engine;
    }
    static _validateState(st) {
      const bad = (message) => {
        throw new Error("Geçersiz simülasyon kaydı: " + message);
      };
      if (
        !st ||
        typeof st !== "object" ||
        Array.isArray(st) ||
        ![1, 2].includes(st.version)
      )
        bad("sürüm veya yapı");
      const walk = (v, depth = 0) => {
        if (depth > 12) bad("çok derin veri");
        if (typeof v === "number" && !Number.isSafeInteger(v))
          bad("sonlu güvenli tam sayı gerekli");
        if (v && typeof v === "object")
          for (const [k, item] of Object.entries(v)) {
            if (["__proto__", "prototype", "constructor"].includes(k))
              bad("geçersiz nesne anahtarı");
            walk(item, depth + 1);
          }
      };
      walk(st);
      for (const k of [
        "seed",
        "day",
        "_rngState",
        "_nextOrder",
        "_nextTrade",
        "_nextNews",
        "_initialTotalCash",
      ])
        if (!integer(st[k], k.startsWith("_next") ? 1 : 0)) bad(k);
      if (
        typeof st._botsEnabled !== "boolean" ||
        !Number.isSafeInteger(st._externalNetCash)
      )
        bad("ekonomik kayıt");
      if (st.seed > 4294967295 || st._rngState > 4294967295)
        bad("rastlantı durumu");
      for (const key of ["startups", "accounts", "orders", "trades", "news"])
        if (!Array.isArray(st[key])) bad(key);
      if (
        st.startups.length !== 8 ||
        st.accounts.length !== 73 ||
        st.orders.length > 100000 ||
        st.trades.length > 1000000 ||
        st.news.length > 1000
      )
        bad("kayıt büyüklüğü");
      const ids = new Set();
      const string = (v) =>
        typeof v === "string" && v.length > 0 && v.length <= 200;
      const symbols = new Set();
      for (const s of st.startups) {
        if (!SYMBOLS.includes(s.symbol) || symbols.has(s.symbol))
          bad("girişim kodu");
        symbols.add(s.symbol);
        if (
          !string(s.name) ||
          !string(s.sector) ||
          !/^#[0-9a-f]{6}$/i.test(s.color)
        )
          bad("girişim tanımı");
        if (!["active", "bankrupt"].includes(s.status)) bad("girişim durumu");
        for (const k of [
          "price",
          "previousClose",
          "companyCash",
          "revenue",
          "expenses",
          "users",
          "totalShares",
          "founderShares",
          "totalRaised",
          "_initialPrice",
          "_baseRevenue",
          "_baseUsers",
          "_seedCash",
          "_initialShares",
          "_operatingReceived",
          "_operatingSpent",
        ])
          if (
            !integer(
              s[k],
              k === "price" ||
                k === "previousClose" ||
                k === "_baseRevenue" ||
                k === "_baseUsers"
                ? 1
                : 0,
            )
          )
            bad("girişim " + k);
        if (
          s.price > MAX_PRICE ||
          s.previousClose > MAX_PRICE ||
          s.totalShares < 1 ||
          s._initialPrice < 1
        )
          bad("girişim sınırı");
        for (const k of ["growthBp", "sentimentBp", "riskBp"])
          if (!integer(s[k], -10000, 10000)) bad(k);
        if (!Array.isArray(s.history) || s.history.length > 730)
          bad("fiyat geçmişi");
        let lastDay = -1;
        for (const c of s.history) {
          if (!integer(c.day, 0, st.day) || c.day <= lastDay) bad("mum günü");
          lastDay = c.day;
          for (const k of ["open", "high", "low", "close"])
            if (!integer(c[k], 1, MAX_PRICE)) bad("mum fiyatı");
          if (
            !integer(c.volume, 1) ||
            c.low > Math.min(c.open, c.close) ||
            c.high < Math.max(c.open, c.close) ||
            c.low > c.high
          )
            bad("mum tutarlılığı");
        }
        const f = s.funding;
        if (!f || typeof f !== "object" || typeof f.open !== "boolean")
          bad("yatırım turu");
        for (const k of [
          "target",
          "raised",
          "price",
          "offeredShares",
          "soldShares",
          "round",
        ])
          if (
            !integer(
              f[k],
              ["price", "offeredShares", "round"].includes(k) ? 1 : 0,
            )
          )
            bad("tur " + k);
        if (
          f.price > MAX_PRICE ||
          f.soldShares > f.offeredShares ||
          f.target !== f.price * f.offeredShares ||
          f.raised !== f.price * f.soldShares ||
          (f.open && f.soldShares === f.offeredShares)
        )
          bad("yatırım turu tutarlılığı");
        if (s.status === "bankrupt" && (f.open || s.companyCash !== 0))
          bad("iflas kaydı");
      }
      for (const a of st.accounts) {
        if (!string(a.id) || !string(a.name) || ids.has(a.id))
          bad("hesap kimliği");
        ids.add(a.id);
        if (
          !integer(a.cash) ||
          !integer(a.initialCash) ||
          !Number.isSafeInteger(a.realizedPnl)
        )
          bad("hesap nakdi");
        for (const key of ["holdings", "costs", "initialHoldings"]) {
          if (!a[key] || typeof a[key] !== "object" || Array.isArray(a[key]))
            bad("hesap pay kaydı");
          for (const [symbol, val] of Object.entries(a[key]))
            if (!SYMBOLS.includes(symbol) || !integer(val)) bad("hesap payı");
        }
        if (
          a.botSymbol !== undefined &&
          (!SYMBOLS.includes(a.botSymbol) ||
            !integer(a.biasBp, -10000, 10000) ||
            !integer(a.targetShares, 1))
        )
          bad("yatırımcı profili");
      }
      if (!ids.has("user")) bad("kullanıcı hesabı");
      for (const symbol of SYMBOLS) {
        if (!ids.has("founder-" + symbol)) bad("kurucu hesabı");
        for (let i = 1; i <= 8; i++)
          if (!ids.has("bot-" + symbol + "-" + i)) bad("fon hesabı");
      }
      const orderIds = new Set();
      for (const o of st.orders) {
        if (
          !/^O[1-9][0-9]*$/.test(o.id) ||
          orderIds.has(o.id) ||
          !ids.has(o.accountId) ||
          !SYMBOLS.includes(o.symbol)
        )
          bad("emir kimliği");
        orderIds.add(o.id);
        if (
          !["buy", "sell"].includes(o.side) ||
          !["limit", "market"].includes(o.type) ||
          !["open", "partial", "filled", "cancelled"].includes(o.status)
        )
          bad("emir türü");
        for (const k of [
          "price",
          "quantity",
          "remaining",
          "filled",
          "createdAt",
        ])
          if (
            !integer(
              o[k],
              ["price", "quantity", "createdAt"].includes(k) ? 1 : 0,
            )
          )
            bad("emir " + k);
        if (
          o.price > MAX_PRICE ||
          o.quantity > MAX_QTY ||
          !Number.isSafeInteger(o.price * o.quantity) ||
          o.remaining + o.filled !== o.quantity ||
          o.createdAt >= st._nextOrder ||
          Number(o.id.slice(1)) !== o.createdAt
        )
          bad("emir tutarlılığı");
        if (
          (o.status === "filled" && o.remaining !== 0) ||
          (LIVE(o) && (!o.remaining || o.type === "market")) ||
          (o.status === "partial" && !o.filled) ||
          (o.status === "open" && o.filled)
        )
          bad("emir durumu");
      }
      const tradeIds = new Set();
      for (const t of st.trades) {
        if (
          !/^T[1-9][0-9]*$/.test(t.id) ||
          tradeIds.has(t.id) ||
          Number(t.id.slice(1)) >= st._nextTrade ||
          !SYMBOLS.includes(t.symbol) ||
          !ids.has(t.buyerId)
        )
          bad("işlem kimliği");
        tradeIds.add(t.id);
        if (
          !integer(t.day, 0, st.day) ||
          !integer(t.quantity, 1, MAX_QTY) ||
          !integer(t.price, 1, MAX_PRICE) ||
          !Number.isSafeInteger(t.price * t.quantity)
        )
          bad("işlem sayısı");
        if (t.kind === "secondary") {
          if (!ids.has(t.sellerId) || t.buyerId === t.sellerId)
            bad("ikincil işlem tarafı");
        } else if (t.kind !== "funding" || t.sellerId !== "company-" + t.symbol)
          bad("birincil işlem tarafı");
      }
      const newsIds = new Set();
      for (const n of st.news) {
        if (
          !/^N[1-9][0-9]*$/.test(n.id) ||
          newsIds.has(n.id) ||
          Number(n.id.slice(1)) >= st._nextNews ||
          !integer(n.day, 0, st.day) ||
          (n.symbol !== null && !SYMBOLS.includes(n.symbol)) ||
          !string(n.title) ||
          ![-1, 0, 1].includes(n.sentiment)
        )
          bad("haber");
        newsIds.add(n.id);
      }
    }
    audit() {
      const errors = [];
      const fail = (message) => errors.push(message);
      const balances = {},
        shares = {},
        fundingTotals = {},
        issued = {};
      for (const a of this.accounts) {
        balances[a.id] = a.initialCash;
        shares[a.id] = { ...a.initialHoldings };
        if (!integer(a.cash) || this.availableCash(a.id) < 0)
          fail(a.id + ": kullanılabilir nakit negatif veya geçersiz");
        if (!Number.isSafeInteger(a.realizedPnl))
          fail(a.id + ": kâr/zarar geçersiz");
        for (const symbol of SYMBOLS) {
          if (
            !integer(a.holdings[symbol] || 0) ||
            this.availableShares(symbol, a.id) < 0
          )
            fail(
              a.id +
                "/" +
                symbol +
                ": kullanılabilir pay negatif veya geçersiz",
            );
          if (
            !integer(a.costs[symbol] || 0) ||
            (!(a.holdings[symbol] || 0) && (a.costs[symbol] || 0))
          )
            fail(a.id + "/" + symbol + ": maliyet kaydı geçersiz");
        }
        if (
          a.cash + sum(Object.values(a.costs)) !==
          a.initialCash + a.realizedPnl
        )
          fail(a.id + ": maliyet/kâr hesabı uyuşmuyor");
      }
      for (const symbol of SYMBOLS) {
        fundingTotals[symbol] = 0;
        issued[symbol] = 0;
      }
      for (const t of this.trades) {
        if (!shares[t.buyerId] || !SYMBOLS.includes(t.symbol)) {
          fail("Geçersiz işlem tarafı");
          continue;
        }
        const value = t.quantity * t.price;
        if (balances[t.buyerId] < value)
          fail(t.buyerId + ": işlem anında nakit yetersiz");
        balances[t.buyerId] -= value;
        shares[t.buyerId][t.symbol] =
          (shares[t.buyerId][t.symbol] || 0) + t.quantity;
        if (t.kind === "funding") {
          fundingTotals[t.symbol] += value;
          issued[t.symbol] += t.quantity;
        } else if (shares[t.sellerId] && t.sellerId !== t.buyerId) {
          if ((shares[t.sellerId][t.symbol] || 0) < t.quantity)
            fail(t.sellerId + ": işlem anında pay yetersiz");
          balances[t.sellerId] += value;
          shares[t.sellerId][t.symbol] =
            (shares[t.sellerId][t.symbol] || 0) - t.quantity;
        } else fail("Geçersiz ikincil işlem");
      }
      for (const a of this.accounts) {
        if (balances[a.id] !== a.cash)
          fail(a.id + ": nakit işlem defteri uyuşmuyor");
        for (const symbol of SYMBOLS)
          if ((shares[a.id][symbol] || 0) !== (a.holdings[symbol] || 0))
            fail(a.id + "/" + symbol + ": pay işlem defteri uyuşmuyor");
      }
      for (const s of this.startups) {
        const total = sum(this.accounts.map((a) => a.holdings[s.symbol] || 0));
        if (
          total !== s.totalShares ||
          s.totalShares !== s._initialShares + issued[s.symbol]
        )
          fail(s.symbol + ": toplam pay korunmuyor");
        if (
          s.founderShares !==
          (this.getAccount("founder-" + s.symbol).holdings[s.symbol] || 0)
        )
          fail(s.symbol + ": kurucu payı uyuşmuyor");
        if (s.totalRaised !== fundingTotals[s.symbol])
          fail(s.symbol + ": sermaye toplamı uyuşmuyor");
        if (
          !integer(s.companyCash) ||
          s.companyCash !==
            s._seedCash +
              fundingTotals[s.symbol] +
              s._operatingReceived -
              s._operatingSpent
        )
          fail(s.symbol + ": şirket nakit defteri uyuşmuyor");
        if (
          s.funding.raised !== s.funding.soldShares * s.funding.price ||
          s.funding.target !== s.funding.offeredShares * s.funding.price
        )
          fail(s.symbol + ": yatırım turu muhasebesi uyuşmuyor");
        // Her mumun OHLC ve hacmi o günün GERÇEK ikincil işlemlerine dayanır.
        const candleTrades = new Map();
        for (const t of this.trades)
          if (t.symbol === s.symbol && t.kind === "secondary") {
            let c = candleTrades.get(t.day);
            if (!c) {
              c = {
                open: t.price,
                high: t.price,
                low: t.price,
                close: t.price,
                volume: 0,
              };
              candleTrades.set(t.day, c);
            }
            c.high = Math.max(c.high, t.price);
            c.low = Math.min(c.low, t.price);
            c.close = t.price;
            c.volume += t.quantity;
          }
        const expectedCandles = [...candleTrades.entries()].slice(-730);
        if (
          s.history.length !== expectedCandles.length ||
          s.history.some(
            (c, i) => !expectedCandles[i] || c.day !== expectedCandles[i][0],
          )
        )
          fail(s.symbol + ": mum günü eksik veya fazla");
        for (const c of s.history) {
          const actual = candleTrades.get(c.day);
          if (
            !actual ||
            ["open", "high", "low", "close", "volume"].some(
              (k) => c[k] !== actual[k],
            )
          )
            fail(s.symbol + ": mum işlem defteriyle uyuşmuyor");
        }
        const lastActual = expectedCandles[expectedCandles.length - 1];
        if (s.price !== (lastActual ? lastActual[1].close : s._initialPrice))
          fail(s.symbol + ": son fiyat işlemle uyuşmuyor");
        if (
          s.status === "bankrupt" &&
          (s.companyCash !== 0 ||
            this.orders.some((o) => LIVE(o) && o.symbol === s.symbol))
        )
          fail(s.symbol + ": iflas sonrası açık işlem");
      }
      const currentTotalCash =
        sum(this.accounts.map((a) => a.cash)) +
        sum(this.startups.map((s) => s.companyCash));
      const expectedTotalCash = this._initialTotalCash + this._externalNetCash;
      const externalCalculated = sum(
        this.startups.map((s) => s._operatingReceived - s._operatingSpent),
      );
      if (
        !Number.isSafeInteger(currentTotalCash) ||
        currentTotalCash !== expectedTotalCash ||
        externalCalculated !== this._externalNetCash
      )
        fail("Ekonomi nakit dengesi korunmuyor");
      return {
        ok: errors.length === 0,
        errors,
        currentTotalCash,
        expectedTotalCash,
        externalNetCash: this._externalNetCash,
        trades: this.trades.length,
        accounts: this.accounts.length,
        activeStartups: this.startups.filter((s) => s.status === "active")
          .length,
      };
    }
  }
  root.VentureEngine = VentureEngine;
  if (typeof module !== "undefined" && module.exports)
    module.exports = { VentureEngine };
})(typeof globalThis !== "undefined" ? globalThis : this);
