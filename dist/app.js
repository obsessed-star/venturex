/* VentureX arayüzü: tüm fiyatlar motorda tam sayı kuruş, gösterimde TL. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = "venturex.simulation.v1";
  // Kurgu girişim profilleri: kullanıcı gerçek bir şirketle yatırım yapmıyor.
  const PROJECTS = {
    A: {
      product: "Küçük işletmeler için yapay zekâ asistanı",
      pitch:
        "Teknik ekibi olmayan esnafın sipariş ve müşteri sorularını tek ekrandan yönetmesine yardım eder.",
      team: 3,
      stage: "Çalışan prototip",
      goal: "Ürünü iyileştirmek ve ilk ücretli müşterilere ulaşmak",
      risk: "Orta",
      split: [45, 30, 25],
    },
    B: {
      product: "Mahalleler için enerji takip sistemi",
      pitch:
        "Küçük iş yerlerinin enerji tüketimini ölçerek israfı görünür kılar.",
      team: 4,
      stage: "Pilot müşteriler",
      goal: "Sensör pilotlarını genişletmek ve satış ağı kurmak",
      risk: "Orta",
      split: [50, 25, 25],
    },
    C: {
      product: "Klinikler için randevu takip aracı",
      pitch:
        "Küçük kliniklerin randevu ve hasta iletişimindeki iş yükünü azaltır.",
      team: 2,
      stage: "Çalışan prototip",
      goal: "Ürün testlerini tamamlamak ve klinik pilotları başlatmak",
      risk: "Yüksek",
      split: [55, 20, 25],
    },
    D: {
      product: "Mikro işletmeler için nakit takip yazılımı",
      pitch:
        "Gelir ve giderlerini ayrı yerlerde tutan küçük ekiplerin nakit akışını izlemesini sağlar.",
      team: 3,
      stage: "Pilot müşteriler",
      goal: "Muhasebe entegrasyonları ve müşteri edinimi",
      risk: "Orta",
      split: [45, 35, 20],
    },
    E: {
      product: "Yerel üreticiler için teslimat planlama",
      pitch:
        "Küçük üreticilerin aynı bölgedeki teslimatlarını birleştirerek rota planlamasını kolaylaştırır.",
      team: 2,
      stage: "Çalışan prototip",
      goal: "İlk bölgede teslimat pilotu ve işletme ortaklıkları",
      risk: "Orta",
      split: [35, 40, 25],
    },
    F: {
      product: "Bağımsız ekipten mobil bulmaca oyunu",
      pitch:
        "Küçük oyun ekibinin geliştirdiği oyunu oyuncularla buluşturmak için ürün ve pazarlama bütçesi sağlar.",
      team: 4,
      stage: "İlk kullanıcılar",
      goal: "Yeni oyun içeriği ve oyuncu edinimi denemeleri",
      risk: "Yüksek",
      split: [45, 40, 15],
    },
    G: {
      product: "Küçük çiftçiler için sulama takibi",
      pitch:
        "Basit sensörlerle tarla koşullarını izleyip çiftçinin sulama kararını destekler.",
      team: 3,
      stage: "Saha pilotu",
      goal: "Sensör üretimi ve küçük çiftçilerle saha testleri",
      risk: "Orta",
      split: [50, 25, 25],
    },
    H: {
      product: "Küçük atölyeler için robotik denetim",
      pitch:
        "Büyük otomasyon yatırımı yapamayan atölyeler için uygun maliyetli görsel kalite kontrol geliştirir.",
      team: 2,
      stage: "Erken prototip",
      goal: "İlk robotik prototipi doğrulamak ve pilot atölye bulmak",
      risk: "Yüksek",
      split: [65, 15, 20],
    },
  };
  let campaignSearch = "",
    campaignSector = "all",
    campaignSort = "symbol",
    campaignSelected = "A";
  const moneyFormatter = new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const money = (n) => moneyFormatter.format((Number(n) || 0) / 100);
  const numberFormatter = new Intl.NumberFormat("tr-TR", {
    maximumFractionDigits: 0,
  });
  const num = (n) => numberFormatter.format(Number(n) || 0);
  const decimalFormatter = new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const decimal = (n) => decimalFormatter.format(Number(n) || 0);
  const pct = (n) => `${n > 0 ? "+" : ""}${decimal(n)}%`;
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const change = (s) =>
    s.previousClose ? (s.price / s.previousClose - 1) * 100 : 0;
  const color = (n) => (n < 0 ? "negative" : "positive");
  let engine,
    selected = "A",
    view = "funding",
    side = "buy",
    orderType = "market",
    chartRange = "30",
    chartKind = "candle",
    marketTab = "book";
  let timer = null,
    toastTimer = null,
    localAvailable = true,
    chartData = [],
    chartGeom = null,
    keyboardIndex = null,
    fundingQuantities = {},
    restoredError = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        engine = window.VentureEngine.fromJSON(raw);
      } catch (err) {
        let backedUp = false;
        try {
          localStorage.setItem(`${STORAGE_KEY}.corrupt.${Date.now()}`, raw);
          backedUp = true;
        } catch (_) {
          localAvailable = false;
        }
        engine = new window.VentureEngine(42);
        restoredError = backedUp
          ? "Eski kayıt okunamadı. Bozuk kayıt yedeklendi; yeni simülasyon açıldı."
          : "Eski kayıt okunamadı ve yedeklenemedi. Önceki kayıt korundu; otomatik kayıt kapalı. Yeni simülasyonu JSON ile indirebilirsin.";
      }
    } else engine = new window.VentureEngine(42);
  } catch (err) {
    if (!window.VentureEngine) {
      $("dialog-content").innerHTML =
        '<h2 id="dialog-title">Simülasyon motoru yüklenemedi</h2><p>index.html, engine.js, app.js ve styles.css dosyalarını aynı klasörde açın.</p>';
      $("app-dialog").showModal();
      return;
    }
    localAvailable = false;
    engine = new window.VentureEngine(42);
  }
  window.ventureApp = {
    get engine() {
      return engine;
    },
    render,
    pause,
  };
  function startup() {
    return (
      engine.startups.find((s) => s.symbol === selected) || engine.startups[0]
    );
  }
  function persist() {
    if (!localAvailable) {
      $("save-status").textContent =
        "Yerel kayıt kullanılamıyor · JSON indirebilirsin";
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, engine.exportJSON());
      $("save-status").textContent = "Otomatik kaydedildi · Bu tarayıcı";
    } catch (_) {
      localAvailable = false;
      $("save-status").textContent = "Depolama dolu · JSON indir";
    }
  }
  function toast(message, error = false) {
    clearTimeout(toastTimer);
    $("toast").textContent = message;
    $("toast").classList.toggle("error", error);
    $("toast").hidden = false;
    toastTimer = setTimeout(() => {
      $("toast").hidden = true;
    }, 5000);
  }
  function openDialog(html) {
    pause();
    $("dialog-content").innerHTML = html;
    const title = $("dialog-content").querySelector("h2");
    if (title) title.id = "dialog-title";
    $("app-dialog").showModal();
  }
  function markChoice(button, active) {
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  function pause() {
    clearInterval(timer);
    timer = null;
    $("play-icon").textContent = "▶";
    $("play-label").textContent = "Başlat";
    $("play-button").setAttribute("aria-label", "Simülasyonu başlat");
  }
  function play() {
    if (timer) return;
    $("play-icon").textContent = "Ⅱ";
    $("play-label").textContent = "Duraklat";
    $("play-button").setAttribute("aria-label", "Simülasyonu duraklat");
    timer = setInterval(() => advance(), Number($("speed-select").value));
  }
  function advance() {
    try {
      engine.advance(1);
      render();
      persist();
    } catch (err) {
      pause();
      toast(err.message, true);
    }
  }
  function spark(values, width = 76, height = 27) {
    if (!values.length) return "";
    const lo = Math.min(...values),
      hi = Math.max(...values),
      span = hi - lo || 1;
    const points = values
      .map(
        (v, i) =>
          `${((i / Math.max(1, values.length - 1)) * width).toFixed(1)},${(height - 3 - ((v - lo) / span) * (height - 6)).toFixed(1)}`,
      )
      .join(" ");
    return `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
  }
  function metric(label, value, meta, icon = "◫", trend = null, values = []) {
    return `<div class="metric-card"><div class="metric-label">${label}<span class="metric-icon">${icon}</span></div><div class="metric-value">${value}</div><div class="metric-meta">${trend !== null ? `<span class="pill ${trend < 0 ? "down" : ""}">${pct(trend)}</span>` : ""}<span>${meta}</span></div>${values.length ? `<div class="metric-spark ${color(trend || 0)}">${spark(values)}</div>` : ""}</div>`;
  }
  function renderOverview() {
    const p = engine.portfolio(),
      user = engine.getAccount(),
      ret = (p.totalValue / user.initialCash - 1) * 100;
    const active = engine.startups.filter((s) => s.status !== "bankrupt");
    if (view === "funding" || view === "founder") {
      const open = active.filter((s) => s.funding.open),
        userFunding = engine.trades
          .filter((t) => t.kind === "funding" && t.buyerId === "user")
          .reduce((v, t) => v + t.quantity * t.price, 0);
      $("overview").innerHTML =
        metric(
          "Yatırım bekleyen girişimler",
          num(open.length),
          "A–H · Kurgu küçük ekipler",
          "◇",
        ) +
        metric(
          "Kalan fonlama ihtiyacı",
          money(
            open.reduce((n, s) => n + s.funding.target - s.funding.raised, 0),
          ),
          "Açık yatırım turlarında",
          "↗",
        ) +
        metric(
          "Girişimlere sağladığın sermaye",
          money(userFunding),
          "Yeni pay yatırımların",
          "◫",
        ) +
        metric(
          "Kullanılabilir sanal bakiye",
          money(p.availableCash),
          "Başlangıç: 100.000 TL",
          "₺",
        );
    } else if (view === "portfolio") {
      $("overview").innerHTML =
        metric(
          "Toplam portföy",
          money(p.totalValue),
          "Başlangıca göre",
          "◫",
          ret,
        ) +
        metric(
          "Kullanılabilir bakiye",
          money(p.availableCash),
          `${money(p.reservedCash)} emirler için ayrıldı`,
          "₺",
        ) +
        metric(
          "Payların piyasa değeri",
          money(p.marketValue),
          `${p.positions.length} girişimde pozisyon`,
          "◇",
        ) +
        metric(
          "Açık pozisyon kârı / zararı",
          `<span class="${color(p.unrealizedPnl)}">${money(p.unrealizedPnl)}</span>`,
          `Gerçekleşen: ${money(p.realizedPnl)}`,
          "↗",
        );
    } else {
      const idx =
        (engine.startups.reduce(
          (v, s) =>
            v +
            (s.status === "bankrupt"
              ? 0
              : s.price / (s.history[0]?.close || s.price)),
          0,
        ) /
          engine.startups.length) *
        1000;
      const idxPrev =
        (engine.startups.reduce(
          (v, s) =>
            v +
            (s.status === "bankrupt"
              ? 0
              : s.previousClose / (s.history[0]?.close || s.price)),
          0,
        ) /
          engine.startups.length) *
        1000;
      const vol = engine.trades
        .filter((t) => t.day === engine.day && t.kind === "secondary")
        .reduce((v, t) => v + t.price * t.quantity, 0);
      const daily = idxPrev ? (idx / idxPrev - 1) * 100 : 0;
      $("overview").innerHTML =
        metric(
          "VentureX endeksi",
          decimal(idx),
          "Önceki güne göre",
          "⌁",
          daily,
          startup()
            .history.slice(-20)
            .map((h) => h.close),
        ) +
        metric(
          "Günlük işlem hacmi",
          money(vol),
          `${active.length} aktif girişim · Sanal piyasa`,
          "≋",
        ) +
        metric(
          "Portföy değeri",
          money(p.totalValue),
          "Başlangıca göre",
          "◫",
          ret,
        ) +
        metric(
          "Kullanılabilir bakiye",
          money(p.availableCash),
          `${money(p.reservedCash)} emirler için ayrıldı`,
          "₺",
        );
    }
  }
  function renderWatchlist() {
    $("startup-list").innerHTML = engine.startups
      .map(
        (s) =>
          `<button class="startup-row ${s.symbol === selected ? "selected" : ""}" data-symbol="${esc(s.symbol)}" aria-pressed="${s.symbol === selected}" aria-label="${esc(s.name)}, ${money(s.price)}, ${s.status === "bankrupt" ? "iflas etti" : pct(change(s))}"><span class="company-avatar" style="--company-color:${esc(s.color || "#8cabff")}">${esc(s.symbol)}</span><span class="startup-info"><strong>${esc(s.name)}</strong><small>${esc(s.status === "bankrupt" ? "İflas · işlem durdu" : s.sector)}</small></span><span class="startup-price"><strong>${money(s.price)}</strong><small class="${s.status === "bankrupt" ? "negative" : color(change(s))}">${spark(
            s.history.slice(-18).map((h) => h.close),
            34,
            14,
          )}${s.status === "bankrupt" ? "İFLAS" : pct(change(s))}</small></span></button>`,
      )
      .join("");
  }
  function renderChart() {
    document
      .querySelectorAll("[data-range]")
      .forEach((button) =>
        markChoice(button, button.dataset.range === chartRange),
      );
    document
      .querySelectorAll("[data-chart]")
      .forEach((button) =>
        markChoice(button, button.dataset.chart === chartKind),
      );
    const s = startup(),
      chg = change(s),
      bankrupt = s.status === "bankrupt";
    $("chart-company").innerHTML =
      `<div class="chart-title"><span class="company-avatar" style="--company-color:${esc(s.color || "#8cabff")}">${esc(s.symbol)}</span><div><h2>${esc(s.name)}</h2><p>${esc(s.sector)} <span>·</span> ${esc(s.symbol)} / TL</p></div></div><div class="chart-current-price"><strong>${money(s.price)}</strong><small class="${bankrupt ? "negative" : color(chg)}">${bankrupt ? "İFLAS · Son işlem fiyatı" : `${pct(chg)} (${money(s.price - s.previousClose)})`}</small></div>`;
    chartData = s.history.slice(chartRange === "all" ? 0 : -Number(chartRange));
    if (!chartData.length) {
      $("price-chart").innerHTML =
        '<text x="390" y="160" text-anchor="middle" fill="var(--muted)">Henüz fiyat geçmişi yok</text>';
      return;
    }
    const last = chartData[chartData.length - 1];
    $("chart-ohlc").innerHTML =
      `<span>A<b>${money(last.open)}</b></span><span>Y<b>${money(last.high)}</b></span><span>D<b>${money(last.low)}</b></span><span>K<b class="${color(last.close - last.open)}">${money(last.close)}</b></span><span>Hacim<b>${num(last.volume)}</b></span>`;
    $("chart-volume").textContent =
      `${num(last.volume)} pay · Gün ${num(last.day)}`;
    const w = Math.max(300, $("chart-wrap").clientWidth || 640),
      h = w < 450 ? 265 : 350,
      l = 14,
      r = 68,
      t = 18,
      b = 37,
      plotW = w - l - r,
      plotH = h - t - b - 40;
    $("price-chart").setAttribute("viewBox", `0 0 ${w} ${h}`);
    let lo = Math.min(...chartData.map((x) => x.low)),
      hi = Math.max(...chartData.map((x) => x.high));
    const pad = Math.max((hi - lo) * 0.14, hi * 0.018, 1);
    lo = Math.max(0, lo - pad);
    hi += pad;
    const y = (v) => t + ((hi - v) / (hi - lo)) * plotH;
    const step = plotW / Math.max(chartData.length, 1),
      x = (i) => l + step * (i + 0.5),
      candleW = Math.max(1.2, Math.min(10, step * 0.56));
    const maxVol = Math.max(1, ...chartData.map((c) => c.volume));
    let out = `<defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="var(--accent)" stop-opacity=".18"/><stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/></linearGradient><clipPath id="chart-clip"><rect x="${l}" y="${t}" width="${plotW}" height="${h - t - b}"/></clipPath></defs>`;
    for (let i = 0; i < 5; i++) {
      const gy = t + (plotH * i) / 4,
        price = hi - ((hi - lo) * i) / 4;
      out += `<line x1="${l}" x2="${w - r}" y1="${gy}" y2="${gy}" stroke="var(--line)" stroke-dasharray="3 5"/><text x="${w - r + 7}" y="${gy + 3}" fill="var(--muted)" font-size="11" font-family="Consolas,monospace">${decimal(price / 100)}</text>`;
    }
    const ticks = [
      0,
      Math.round((chartData.length - 1) / 4),
      Math.round((chartData.length - 1) / 2),
      Math.round(((chartData.length - 1) * 3) / 4),
      chartData.length - 1,
    ];
    [...new Set(ticks)].forEach((i) => {
      out += `<line x1="${x(i)}" x2="${x(i)}" y1="${t}" y2="${h - b}" stroke="var(--line)" stroke-dasharray="3 5"/><text x="${x(i)}" y="${h - 12}" fill="var(--muted)" font-size="11" text-anchor="middle" font-family="Consolas,monospace">G${chartData[i].day}</text>`;
    });
    out += '<g clip-path="url(#chart-clip)">';
    chartData.forEach((c, i) => {
      const up = c.close >= c.open,
        col = up ? "var(--accent)" : "var(--danger)";
      out += `<rect x="${x(i) - candleW / 2}" y="${h - b - (30 * c.volume) / maxVol}" width="${candleW}" height="${(30 * c.volume) / maxVol}" fill="${col}" opacity=".23"/>`;
    });
    if (chartKind === "line") {
      const line = chartData
        .map(
          (c, i) =>
            `${i ? "L" : "M"}${x(i).toFixed(1)},${y(c.close).toFixed(1)}`,
        )
        .join(" ");
      out += `<path d="${line} L${x(chartData.length - 1)},${t + plotH} L${x(0)},${t + plotH} Z" fill="url(#chart-fill)"/><path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linejoin="round"/>`;
    } else
      chartData.forEach((c, i) => {
        const up = c.close >= c.open,
          col = up ? "var(--accent)" : "var(--danger)";
        out += `<line x1="${x(i)}" x2="${x(i)}" y1="${y(c.high)}" y2="${y(c.low)}" stroke="${col}" stroke-width="1.1"/><rect x="${x(i) - candleW / 2}" y="${Math.min(y(c.open), y(c.close))}" width="${candleW}" height="${Math.max(1.3, Math.abs(y(c.close) - y(c.open)))}" fill="${col}" rx=".5"/>`;
      });
    out += "</g>";
    const py = y(last.close);
    out += `<line x1="${l}" x2="${w - r}" y1="${py}" y2="${py}" stroke="${last.close >= last.open ? "var(--accent)" : "var(--danger)"}" stroke-width=".7" opacity=".7" stroke-dasharray="4 4"/><rect x="${w - r + 3}" y="${py - 9}" width="66" height="18" rx="3" fill="${last.close >= last.open ? "var(--accent-soft)" : "var(--danger-soft)"}"/><text x="${w - r + 35}" y="${py + 3}" text-anchor="middle" fill="${last.close >= last.open ? "var(--accent)" : "var(--danger)"}" font-size="10" font-family="Consolas,monospace">${decimal(last.close / 100)}</text><g id="crosshair" visibility="hidden"><line id="cross-x" y1="${t}" y2="${h - b}" stroke="var(--muted)" stroke-dasharray="3 3"/><line id="cross-y" x1="${l}" x2="${w - r}" stroke="var(--muted)" stroke-dasharray="3 3"/></g>`;
    $("price-chart").innerHTML = out;
    $("price-chart").setAttribute(
      "aria-label",
      `${s.name}, ${chartKind === "candle" ? "mum" : "çizgi"} grafiği; gün ${chartData[0].day}–${last.day}; son işlem ${money(last.close)}. Veriler sentetiktir.`,
    );
    chartGeom = { l, r, w, h, t, b, x, y, step };
    keyboardIndex = null;
    $("price-chart").setAttribute("tabindex", "0");
    $("price-chart").setAttribute("aria-describedby", "chart-keyboard-help");
    $("chart-tooltip").hidden = true;
  }
  function renderDetails() {
    document
      .querySelectorAll("[data-market-tab]")
      .forEach((button) =>
        markChoice(button, button.dataset.marketTab === marketTab),
      );
    const s = startup();
    if (marketTab === "book") {
      const book = engine.orderBook(s.symbol),
        max = Math.max(
          1,
          ...book.bids.map((o) => o.quantity),
          ...book.asks.map((o) => o.quantity),
        );
      const rows = (orders, cls) =>
        `<div class="book-side ${cls}"><div class="book-head"><span>${cls === "bids" ? "Alış fiyatı" : "Satış fiyatı"} (TL)</span><span>Adet</span></div>${
          orders
            .slice(0, 6)
            .map(
              (o) =>
                `<div class="book-row"><i class="book-depth" style="width:${(o.quantity / max) * 100}%"></i><span class="${cls === "bids" ? "positive" : "negative"}">${decimal(o.price / 100)}</span><span>${num(o.quantity)}</span></div>`,
            )
            .join("") || '<div class="book-empty">Emir bulunmuyor</div>'
        }</div>`;
      $("market-details").innerHTML =
        `<div class="orderbook">${rows(book.bids, "bids")}${rows(book.asks, "asks")}</div>`;
    } else if (marketTab === "trades") {
      const trades = engine.trades
        .filter((t) => t.symbol === s.symbol && t.kind === "secondary")
        .slice(-7)
        .reverse();
      $("market-details").innerHTML = trades.length
        ? `<table class="recent-trades-table"><thead><tr><th>Gün</th><th>Fiyat</th><th>Adet</th><th>Hacim</th></tr></thead><tbody>${trades.map((t) => `<tr><td>${num(t.day)}</td><td>${money(t.price)}</td><td>${num(t.quantity)}</td><td>${money(t.price * t.quantity)}</td></tr>`).join("")}</tbody></table>`
        : '<div class="empty-state"><p>Henüz ikincil piyasa işlemi yok.</p></div>';
    } else {
      const burn = Math.max(0, s.expenses - s.revenue),
        runway = burn
          ? `${decimal((s.companyCash / burn) * 30)} gün`
          : "Pozitif nakit akışı";
      const fact = (l, v) =>
        `<div><small>${l}</small><strong>${v}</strong></div>`;
      $("market-details").innerHTML =
        `<div class="company-metrics">${fact("Şirket kasası", money(s.companyCash))}${fact("Aylık gelir", money(s.revenue))}${fact("Aylık gider", money(s.expenses))}${fact("Kullanıcı sayısı", num(s.users))}${fact("Toplam pay", num(s.totalShares))}${fact("Nakit ömrü", runway)}</div><p class="company-status">${s.status === "bankrupt" ? '<span class="negative">İflas · İşlemler durdu. Portföyde bu payların değeri sıfırdır.</span>' : '<span class="positive">● Faaliyetler sürüyor</span> · Aylık gelir ve giderin 1/30’u her gün kasaya işlenir. Veriler sentetiktir.'}</p>`;
    }
  }
  // Kendi emirlerini hariç tut: motor aynı hesaba ait emirleri eşleştirmez.
  function opposingOrders(symbol, tradeSide = side) {
    return engine.orders
      .filter(
        (o) =>
          o.symbol === symbol &&
          o.side !== tradeSide &&
          o.accountId !== "user" &&
          (o.status === "open" || o.status === "partial") &&
          o.remaining > 0,
      )
      .sort(
        (a, b) =>
          (tradeSide === "buy" ? a.price - b.price : b.price - a.price) ||
          a.createdAt - b.createdAt,
      );
  }
  function marketQuote(symbol, quantity, tradeSide = side) {
    let remaining = quantity,
      total = 0;
    for (const o of opposingOrders(symbol, tradeSide)) {
      const qty = Math.min(remaining, o.remaining);
      total += qty * o.price;
      remaining -= qty;
      if (remaining <= 0) break;
    }
    return { total, remaining, enough: remaining === 0 };
  }
  function maximumQuantity() {
    const s = startup();
    if (orderType === "limit")
      return side === "sell"
        ? engine.availableShares(s.symbol)
        : Math.floor(
            engine.availableCash() /
              Math.max(1, Math.round(Number($("limit-price").value) * 100)),
          );
    let cash = engine.availableCash(),
      shares = engine.availableShares(s.symbol),
      quantity = 0;
    for (const o of opposingOrders(s.symbol)) {
      const qty = Math.max(
        0,
        Math.min(
          o.remaining,
          side === "buy" ? Math.floor(cash / o.price) : shares,
        ),
      );
      quantity += qty;
      if (side === "buy") {
        cash -= qty * o.price;
        if (cash < o.price) break;
      } else {
        shares -= qty;
        if (!shares) break;
      }
    }
    return quantity;
  }
  function updateTicket() {
    const s = startup(),
      p = engine.portfolio(),
      qty = Math.max(0, Number($("quantity").value) || 0),
      price =
        orderType === "limit"
          ? Math.round(Number($("limit-price").value) * 100)
          : s.price;
    $("ticket-symbol").textContent = s.symbol;
    $("available-shares").textContent =
      side === "sell"
        ? `${num(engine.availableShares(s.symbol))} kullanılabilir`
        : "";
    $("available-balance").textContent = money(p.availableCash);
    const quote =
      orderType === "market"
        ? marketQuote(s.symbol, qty)
        : { enough: true, total: price * qty };
    $("estimate-value").textContent = quote.enough
      ? money(quote.total)
      : "Likidite yetersiz";
    $("estimate-value").classList.toggle("negative", !quote.enough);
    $("estimate-label").textContent =
      orderType === "market"
        ? "Defterdeki işlem tutarı"
        : side === "buy"
          ? "Limit emri azami tutarı"
          : "Limit emri asgari geliri";
    $("submit-order").innerHTML =
      s.status === "bankrupt"
        ? "İflas · İşlem durdu"
        : `${esc(s.symbol)} payı ${side === "buy" ? "al" : "sat"} <span>${side === "buy" ? "↗" : "↘"}</span>`;
    $("submit-order").disabled = s.status === "bankrupt";
    $("submit-order").classList.toggle("sell-submit", side === "sell");
    markChoice($("buy-button"), side === "buy");
    markChoice($("sell-button"), side === "sell");
    $("limit-group").hidden = orderType !== "limit";
    $("order-note").textContent =
      s.status === "bankrupt"
        ? "Bu şirket iflas etti. Son işlem fiyatı grafikte korunur; portföy değeri sıfırdır."
        : orderType === "market"
          ? "Piyasa emri karşı emirlerle eşleşir. Fiyat değişebilir. Adedin tamamı için likidite veya bakiye yoksa emir reddedilir."
          : "Limit emri, seçtiğin fiyat veya daha iyi fiyatta eşleşir. Kalan adet defterde bekler; nakit veya paylar ayrılır.";
  }
  function renderNews() {
    const news = engine.news.slice(0, 3);
    const implication = (sent) =>
      sent > 0
        ? "Yatırımcı talebi artabilir. Sonuç, emir eşleşmelerine ve şirket performansına bağlıdır."
        : sent < 0
          ? "Satış baskısı artabilir. Nakit ömrünü ve açık emirlerini kontrol edebilirsin."
          : "Bu olay şirketin nakit akışını ve yatırımcı beklentisini etkileyebilir.";
    $("news-list").innerHTML =
      news
        .map(
          (n) =>
            `<article class="news-card"><div class="news-top"><span class="news-badge">${esc(n.symbol || "VX")}</span><span>Gün ${num(n.day)}</span><span class="${color(n.sentiment || 0)}">${n.sentiment > 0 ? "Olumlu" : n.sentiment < 0 ? "Olumsuz" : "Piyasa"}</span></div><h3>${esc(n.title)}</h3><p>${implication(n.sentiment)}</p></article>`,
        )
        .join("") ||
      '<article class="news-card"><h3>Girişim borsasına hoş geldin.</h3><p>Simülasyonu ilerlet; girişimler büyüsün, yatırımcılar emir oluştursun ve piyasa şekillensin.</p></article>';
  }
  function renderPortfolio() {
    const p = engine.portfolio();
    $("positions-body").innerHTML = p.positions
      .filter((pos) => pos.quantity > 0)
      .map((pos) => {
        const s = engine.startups.find((x) => x.symbol === pos.symbol);
        return `<tr><td><button class="table-company" data-select-company="${esc(pos.symbol)}"><span class="company-avatar" style="--company-color:${esc(s.color || "#8cabff")}">${esc(pos.symbol)}</span><span><strong>${esc(s.name)}</strong><small>${s.status === "bankrupt" ? "İflas · değer sıfır" : esc(s.sector)}</small></span></button></td><td>${num(pos.quantity)}</td><td>${money(pos.averageCost)}</td><td>${s.status === "bankrupt" ? "₺0,00" : money(pos.price)}</td><td>${money(pos.value)}</td><td class="${color(pos.pnl)}">${money(pos.pnl)}<small class="${color(pos.pnl)}">${pos.averageCost ? pct((pos.pnl / (pos.quantity * pos.averageCost)) * 100) : "—"}</small></td></tr>`;
      })
      .join("");
    $("portfolio-empty").hidden = p.positions.some((pos) => pos.quantity > 0);
    $("portfolio-stakes").innerHTML = p.positions
      .map((pos) => {
        const s = engine.startups.find((x) => x.symbol === pos.symbol);
        return `<span>${esc(pos.symbol)} ortaklığın: %${((pos.quantity / s.totalShares) * 100).toLocaleString("tr-TR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</span>`;
      })
      .join("");
    const orders = engine.orders.filter(
      (o) =>
        o.accountId === "user" &&
        (o.status === "open" || o.status === "partial") &&
        o.remaining > 0,
    );
    $("open-order-count").textContent = `${orders.length} EMİR`;
    $("open-orders").innerHTML =
      orders
        .map(
          (o) =>
            `<div class="open-order"><div><strong>${esc(o.symbol)} <span class="${o.side === "buy" ? "positive" : "negative"}">${o.side === "buy" ? "Alış" : "Satış"}</span> · Limit</strong><small>${num(o.remaining)} / ${num(o.quantity)} pay · ${money(o.price)}</small></div><span class="muted">${money(o.remaining * o.price)} · Emir ${esc(o.id)}</span><button class="cancel-order" data-cancel="${esc(o.id)}">İptal et</button></div>`,
        )
        .join("") ||
      '<div class="empty-state"><p>Bekleyen emrin bulunmuyor.</p></div>';
    const ranking = engine.accounts
      .filter((a) => a.id === "user" || a.id.startsWith("bot-"))
      .map((a) => {
        const total =
          a.cash +
          engine.startups.reduce(
            (v, s) =>
              v +
              (s.status === "bankrupt"
                ? 0
                : (a.holdings[s.symbol] || 0) * s.price),
            0,
          );
        return { ...a, total, returnPct: (total / a.initialCash - 1) * 100 };
      })
      .sort((a, b) => b.returnPct - a.returnPct);
    $("ranking-body").innerHTML = ranking
      .map((a, i) => ({ a, i }))
      .filter(({ a, i }) => i < 10 || a.id === "user")
      .map(
        ({ a, i }) =>
          `<tr class="${a.id === "user" ? "rank-user" : ""}"><td>${i + 1}</td><td><strong>${esc(a.name)} ${a.id === "user" ? '<span class="badge">Sen</span>' : ""}</strong></td><td>${money(a.total)}</td><td class="${color(a.returnPct)}">${pct(a.returnPct)}</td></tr>`,
      )
      .join("");
  }
  function fundingProgress(s) {
    return s.funding.target
      ? Math.min(100, (s.funding.raised / s.funding.target) * 100)
      : 0;
  }

  function campaignRow(s) {
    const project = PROJECTS[s.symbol];
    const active = campaignSelected === s.symbol;
    const state =
      s.status === "bankrupt"
        ? "İflas · işlem durdu"
        : !s.funding.open
          ? "Tur tamamlandı"
          : project.stage;
    return `<article class="campaign-row ${active ? "selected" : ""}" id="campaign-${s.symbol}">
      <button class="campaign-select" data-select-campaign="${s.symbol}" aria-pressed="${active}" aria-label="${s.symbol} girişimini seç: ${esc(project.product)}">
        <span class="company-avatar">${s.symbol}</span>
        <span class="directory-product"><span class="sector-label">${esc(s.sector)}</span><strong>${esc(project.product)}</strong><span class="directory-meta">${project.team} kişilik ekip <span>·</span> ${esc(state)}</span></span>
        <span class="directory-capital"><strong>${money(s.funding.raised)}</strong><span>${money(s.funding.target)} hedef</span><span class="row-progress"><i style="width:${fundingProgress(s)}%"></i></span><span>%${decimal(fundingProgress(s))} fonlandı</span></span>
        <svg class="ui-icon row-arrow" aria-hidden="true"><use href="#i-arrow"></use></svg>
      </button>
    </article>`;
  }

  function investmentPanel(s) {
    const f = s.funding,
      project = PROJECTS[s.symbol];
    const closed = !f.open || s.status === "bankrupt";
    const remaining = Math.max(0, f.offeredShares - f.soldShares);
    return `<aside class="investment-panel" aria-labelledby="investment-title">
      <div class="investment-heading"><span class="company-avatar">${s.symbol}</span><div><span class="sector-label">Seçili girişim · ${esc(s.sector)}</span><h2 id="investment-title" tabindex="-1">${s.symbol} girişimine ortak ol</h2></div><span class="risk-label ${project.risk === "Yüksek" ? "high" : ""}">${project.risk} risk*</span></div>
      <p class="selected-product">${esc(project.product)}</p>
      <div class="investment-price"><span>1 sanal pay</span><strong>${money(f.price)}</strong><small>${num(remaining)} pay yatırımı bekliyor</small></div>
      <div class="investment-goal"><span>Bu sermaye neyi sağlayacak?</span><p>${esc(project.goal)}</p><button class="text-button" data-campaign-detail="${s.symbol}">Şirketi ve fon planını incele <svg class="ui-icon" aria-hidden="true"><use href="#i-arrow"></use></svg></button></div>
      <form class="funding-form investment-form" data-fund-symbol="${s.symbol}">
        <label class="input-label" for="invest-${s.symbol}">Sanal yatırım bütçen</label>
        <div class="input-container"><input id="invest-${s.symbol}" type="number" aria-label="${s.symbol} yatırım tutarı TL" aria-describedby="quote-${s.symbol}" name="fund-amount" min="${f.price / 100}" max="${engine.availableCash() / 100}" step="0.01" inputmode="decimal" value="${esc(fundingQuantities[s.symbol] || "100")}" ${closed ? "disabled" : ""}><span>TL</span></div>
        <div class="investment-presets">${[100, 500, 1000].map((v) => `<button type="button" data-invest-amount="${v}" data-invest-symbol="${s.symbol}" ${closed ? "disabled" : ""}>${num(v)} TL</button>`).join("")}</div>
        <div class="investment-quote" aria-live="polite" role="status" id="quote-${s.symbol}"></div>
        <button type="submit" class="button investment-submit" ${closed ? "disabled" : ""}>${s.status === "bankrupt" ? "İflas · yatırım durdu" : closed ? "Tur tamamlandı" : "Yeni paya yatırım yap"}<svg class="ui-icon" aria-hidden="true"><use href="#i-arrow"></use></svg></button>
      </form>
      <p class="funding-warning">Ödemen bu girişimin kasasına gider. Esnek fonlama kullanılır; hedef dolmadan sermaye kullanılabilir.</p>
    </aside>`;
  }

  function renderCapitalTrace() {
    $("capital-trace").innerHTML = engine.startups
      .map(
        (
          s,
        ) => `<button class="capital-segment ${campaignSelected === s.symbol ? "selected" : ""}" data-select-campaign="${s.symbol}" aria-pressed="${campaignSelected === s.symbol}" aria-label="${s.symbol}: yüzde ${decimal(fundingProgress(s))} fonlandı" title="${s.symbol}: ${money(s.funding.raised)} / ${money(s.funding.target)}">
      <span><strong>${s.symbol}</strong><small>${s.status === "bankrupt" ? "İflas" : "%" + Math.round(fundingProgress(s))}</small></span><span class="capital-track"><i style="width:${fundingProgress(s)}%"></i></span>
    </button>`,
      )
      .join("");
  }

  function renderFunding() {
    $("fund-count").textContent = engine.startups.filter(
      (s) => s.funding.open && s.status !== "bankrupt",
    ).length;
    let projects = engine.startups.filter(
      (s) =>
        (campaignSector === "all" || s.sector === campaignSector) &&
        `${s.symbol} ${s.sector} ${PROJECTS[s.symbol].product} ${PROJECTS[s.symbol].pitch}`
          .toLocaleLowerCase("tr")
          .includes(campaignSearch.toLocaleLowerCase("tr")),
    );
    projects.sort((a, b) =>
      campaignSort === "progress"
        ? fundingProgress(b) - fundingProgress(a)
        : campaignSort === "entry"
          ? a.funding.price - b.funding.price
          : a.symbol.localeCompare(b.symbol),
    );
    if (!projects.some((s) => s.symbol === campaignSelected) && projects.length)
      campaignSelected = projects[0].symbol;
    renderCapitalTrace();
    $("campaign-result").textContent = `${projects.length} girişim`;
    if (!projects.length) {
      $("funding-grid").innerHTML =
        '<div class="directory-empty"><svg class="ui-icon" aria-hidden="true"><use href="#i-search"></use></svg><h3>Bu aramada bir girişim bulamadık.</h3><p>Farklı bir ürün adı dene veya filtreleri kaldır.</p><button class="button secondary" data-clear-filters>Filtreleri temizle</button></div>';
      return;
    }
    const current = projects.find((s) => s.symbol === campaignSelected);
    $("funding-grid").innerHTML =
      `<section class="campaign-directory" aria-label="Girişim karşılaştırma listesi"><div class="directory-columns"><span>Girişim / ürün</span><span>Toplanan / hedef</span></div>${projects.map(campaignRow).join("")}<p class="directory-caption">Pay alımı yeni sermaye oluşturur. Pay piyasasındaki alım satım ise yatırımcılar arasında gerçekleşir.</p></section>${investmentPanel(current)}`;
    updateInvestmentQuote(current.symbol);
  }

  function clearCampaignFilters() {
    campaignSearch = "";
    campaignSector = "all";
    $("campaign-search").value = "";
    $("campaign-sector").value = "all";
  }

  function selectCampaign(symbol, fromTrace = false) {
    if (fromTrace) clearCampaignFilters();
    campaignSelected = symbol;
    renderFunding();
    if (matchMedia("(max-width: 920px)").matches) {
      $("investment-title")?.focus({ preventScroll: true });
      document
        .querySelector(".investment-panel")
        ?.scrollIntoView({ block: "start", behavior: "instant" });
    } else {
      document
        .querySelector(`.campaign-select[data-select-campaign="${symbol}"]`)
        ?.focus({ preventScroll: true });
    }
  }

  function investmentQuote(symbol) {
    const s = engine.startups.find((x) => x.symbol === symbol),
      input = document.getElementById(`invest-${symbol}`);
    const budget = Math.round(Number(input?.value) * 100),
      quantity =
        Number.isSafeInteger(budget) && budget > 0
          ? Math.floor(budget / s.funding.price)
          : 0,
      total = quantity * s.funding.price;
    return {
      s,
      budget,
      quantity,
      total,
      stake: (quantity / (s.totalShares + quantity)) * 100,
    };
  }
  function updateInvestmentQuote(symbol) {
    const { s, budget, quantity, total, stake } = investmentQuote(symbol),
      q = $(`quote-${symbol}`);
    if (!q) return;
    const closed = !s.funding.open || s.status === "bankrupt";
    const error = closed
      ? "Bu tur yatırım kabul etmiyor."
      : !Number.isSafeInteger(budget) || quantity < 1
        ? `En az 1 pay için ${money(s.funding.price)} yaz.`
        : quantity > s.funding.offeredShares - s.funding.soldShares
          ? "Turda bu kadar yeni pay kalmadı."
          : total > engine.availableCash()
            ? "Kullanılabilir sanal bakiyen yetersiz."
            : null;
    q.classList.toggle("negative", !!error);
    q.innerHTML = error
      ? esc(error)
      : `<strong>${num(quantity)} yeni pay · ${money(total)}</strong><span>Yeni yatırımın ortaklık oranı: %${stake.toLocaleString("tr-TR", { maximumFractionDigits: 4, minimumFractionDigits: 4 })}</span><span>${money(budget - total)} bütçen harcanmaz · İşlem ücreti 0 TL</span>`;
    q.closest("form").querySelector('[type="submit"]').disabled = !!error;
  }
  function budgetPlan(s) {
    const pr = PROJECTS[s.symbol],
      labels = ["Ürün ve geliştirme", "Pazarlama ve satış", "Operasyon"];
    return `<div class="budget-plan">${pr.split.map((share, i) => `<div><span>${labels[i]} · %${share}</span><strong>${money(Math.round((s.funding.target * share) / 100))}</strong><div class="budget-track"><i style="width:${share}%"></i></div></div>`).join("")}</div>`;
  }
  function showCampaign(symbol) {
    const s = engine.startups.find((x) => x.symbol === symbol),
      pr = PROJECTS[symbol],
      owned = engine.getAccount().holdings[symbol] || 0;
    openDialog(
      `<div class="eyebrow">${symbol} · KURGU GİRİŞİM</div><h2>${esc(pr.product)}</h2><p>${esc(pr.pitch)}</p><p><strong>Fon arayan ekip:</strong> ${pr.team} kişi · ${esc(pr.stage)}. ${esc(pr.goal)}.</p><h3>Planlanan fon kullanımı</h3>${budgetPlan(s)}<div class="campaign-data"><span>Aylık gelir <b>${money(s.revenue)}</b></span><span>Aylık gider <b>${money(s.expenses)}</b></span><span>Şirket kasası <b>${money(s.companyCash)}</b></span><span>Kullanıcı <b>${num(s.users)}</b></span><span>Senin payın <b>${num(owned)} · %${decimal((owned / s.totalShares) * 100)}</b></span><span>Tur öncesi pay değerlemesi <b>${money((s.totalShares - s.funding.soldShares) * s.funding.price)}</b></span></div><p>Değerleme bu turdaki pay fiyatı × tur başındaki toplam paydır. Fon planı ve risk etiketi örnek varsayımdır; başarı göstergesi değildir.</p><p><strong>Kazanç nasıl oluşur?</strong> Büyüme payın piyasa fiyatını yükseltebilir. Satışta alıcı bulunursa kazanç veya kayıp gerçekleşir. Son fiyat satış garantisi değildir; iflasta sanal pay değeri sıfır olur.</p><div class="dialog-actions"><button class="button play" data-focus-fund="${symbol}">Bu girişime yatırım yap</button></div>`,
    );
  }
  function renderFounder() {
    const s = startup(),
      pr = PROJECTS[s.symbol],
      f = s.funding,
      progress = (f.raised / f.target) * 100,
      transactions = engine.trades.filter(
        (t) => t.kind === "funding" && t.symbol === s.symbol,
      ),
      investors = new Set(transactions.map((t) => t.buyerId)).size;
    $("founder-symbol").value = s.symbol;
    $("founder-content").innerHTML =
      `<div class="founder-layout"><section class="panel founder-panel"><div class="eyebrow">${s.symbol} · ${pr.team} KİŞİLİK KURGU EKİP</div><h2>${esc(pr.product)}</h2><p>${esc(pr.goal)}</p><div class="campaign-data"><span>Bu tur toplanan <b>${money(f.raised)}</b></span><span>Hedefe kalan <b>${money(Math.max(0, f.target - f.raised))}</b></span><span>Destekçi <b>${num(investors)}</b></span><span>Şirket kasası <b>${money(s.companyCash)}</b></span><span>Kurucu ortaklık oranı <b>%${decimal((s.founderShares / s.totalShares) * 100)}</b></span><span>Faaliyet <b>${s.status === "bankrupt" ? "İflas" : "Devam ediyor"}</b></span></div><button class="button play" data-focus-fund="${s.symbol}">Yatırımcı görünümünü aç ↗</button></section><section class="panel founder-panel"><h2>Fon kullanım planı</h2>${budgetPlan(s)}<p>Bu dağılım hedef bütçenin planıdır. Motorun aylık giderleri işletme faaliyetini temsil eder; ayrı bir bütçe harcaması olarak ikinci kez düşülmez.</p><div class="funding-stages">${[25, 50, 75, 100].map((n) => `<span class="${progress >= n ? "reached" : ""}">%${n} bütçe ${progress >= n ? "· Eşik karşılandı" : "· Bekleniyor"}</span>`).join("")}</div><p>Yeni sermaye kasayı destekler; fonlama düzeyi ürün ve pazarlama büyüme kapasitesini ve gider artışını etkiler. Talep düşüşü ve nakit krizi sonuçları değiştirebilir.</p></section></div><section class="panel founder-panel"><h2>Girişime ulaşan son yatırımlar</h2><div class="table-scroll"><table><thead><tr><th>Gün</th><th>Destekçi</th><th>Yeni pay</th><th>Şirket kasasına</th></tr></thead><tbody>${transactions
        .slice(-8)
        .reverse()
        .map(
          (t) =>
            `<tr><td>${num(t.day)}</td><td>${esc(engine.getAccount(t.buyerId).name)}</td><td>${num(t.quantity)}</td><td>${money(t.quantity * t.price)}</td></tr>`,
        )
        .join("")}</tbody></table></div></section>`;
  }
  function renderHistory() {
    const trades = engine.trades
      .filter((t) => t.buyerId === "user" || t.sellerId === "user")
      .slice()
      .reverse();
    $("history-body").innerHTML = trades
      .map((t) => {
        const buy = t.buyerId === "user",
          fund = t.kind === "funding";
        return `<tr><td>Gün ${num(t.day)}</td><td><strong>${esc(t.symbol)}</strong></td><td><span class="badge ${fund ? "fund" : buy ? "" : "sell"}">${fund ? "Fonlama" : buy ? "Alış" : "Satış"}</span></td><td>${num(t.quantity)}</td><td>${money(t.price)}</td><td>${money(t.price * t.quantity)}</td></tr>`;
      })
      .join("");
    $("history-empty").hidden = trades.length > 0;
  }
  function render() {
    $("day-value").textContent = num(engine.day);
    $("legacy-notice").hidden = engine.version !== 1;
    renderOverview();
    // Hidden views are refreshed when opened, not on every simulation tick.
    if (view === "market") {
      renderWatchlist(); renderChart(); renderDetails(); updateTicket(); renderNews();
    } else if (view === "portfolio") renderPortfolio();
    else if (view === "funding") renderFunding();
    else if (view === "founder") renderFounder();
    else if (view === "history") renderHistory();
  }
  const viewCopy = {
    market: [
      "Pay piyasası",
      "Yatırımcılar arası pay piyasası",
      "Bu ekrandaki ödeme payını satan yatırımcıya gider. Girişimi fonlamak için Keşfet’i kullan.",
    ],
    portfolio: [
      "Portföy",
      "Desteklediğin girişimler",
      "Paylarını, ortaklık oranını ve gerçekleşen kazanç veya kaybını izle.",
    ],
    funding: [
      "Girişimler",
      "Girişimleri keşfet",
      "Ürünü, ekibi ve fon planını incele. Bütçene uygun bir ortaklık seç.",
    ],
    founder: [
      "Girişimci paneli",
      "Fikrin için sermaye bul",
      "Fon hedefini, destekçilerini ve sermayenin büyüme planını takip et.",
    ],
    history: [
      "İşlemler",
      "Sermayenin yolculuğu",
      "Girişime yatırımlarını ve yatırımcılar arasındaki pay işlemlerini ayrı izle.",
    ],
  };
  function switchView(next) {
    view = next;
    document.body.dataset.view = view;
    const [title, heading, subtitle] = viewCopy[view];
    $("view-title").textContent = title;
    $("page-heading").textContent = heading;
    $("page-subtitle").textContent = subtitle;
    document.querySelectorAll(".view-panel").forEach((el) => {
      el.hidden = el.id !== `${view}-view`;
    });
    document.querySelectorAll("button[data-view]").forEach((el) => {
      el.classList.toggle("active", el.dataset.view === view);
      el.setAttribute(
        "aria-current",
        el.dataset.view === view ? "page" : "false",
      );
    });
    render();
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function selectSymbol(symbol) {
    selected = symbol;
    $("order-error").hidden = true;
    $("order-success").hidden = true;
    $("limit-price").value = (startup().price / 100).toFixed(2);
    renderWatchlist();
    renderChart();
    renderDetails();
    updateTicket();
    renderOverview();
  }
  document.addEventListener("click", (event) => {
    const campaign = event.target.closest("[data-select-campaign]");
    if (campaign) {
      selectCampaign(
        campaign.dataset.selectCampaign,
        !!campaign.closest("#capital-trace"),
      );
      return;
    }
    if (event.target.closest("[data-clear-filters]")) {
      clearCampaignFilters();
      renderFunding();
      $("campaign-search").focus();
      return;
    }
    if (event.target.closest("[data-show-guide]")) {
      $("help-button").click();
      return;
    }
    const details = event.target.closest("[data-campaign-detail]");
    if (details) {
      showCampaign(details.dataset.campaignDetail);
      return;
    }
    const focus = event.target.closest("[data-focus-fund]");
    if (focus) {
      campaignSelected = focus.dataset.focusFund;
      if ($("app-dialog").open) $("app-dialog").close();
      campaignSearch = "";
      campaignSector = "all";
      $("campaign-search").value = "";
      $("campaign-sector").value = "all";
      switchView("funding");
      renderFunding();
      $(`campaign-${focus.dataset.focusFund}`)?.scrollIntoView({
        block: "center",
        behavior: "instant",
      });
      $(`invest-${focus.dataset.focusFund}`)?.focus();
      return;
    }
    const preset = event.target.closest("[data-invest-amount]");
    if (preset) {
      const s = preset.dataset.investSymbol;
      $(`invest-${s}`).value = preset.dataset.investAmount;
      fundingQuantities[s] = preset.dataset.investAmount;
      updateInvestmentQuote(s);
      return;
    }
    const viewButton = event.target.closest("button[data-view],[data-go]");
    if (viewButton) {
      switchView(viewButton.dataset.view || viewButton.dataset.go);
      return;
    }
    const symbol = event.target.closest("[data-symbol],[data-select-company]");
    if (symbol) {
      selectSymbol(symbol.dataset.symbol || symbol.dataset.selectCompany);
      if (symbol.dataset.selectCompany) switchView("market");
      return;
    }
    const sideButton = event.target.closest("[data-side]");
    if (sideButton) {
      side = sideButton.dataset.side;
      $("order-error").hidden = true;
      $("order-success").hidden = true;
      updateTicket();
      return;
    }
    const range = event.target.closest("[data-range]");
    if (range) {
      chartRange = range.dataset.range;
      renderChart();
      return;
    }
    const chart = event.target.closest("[data-chart]");
    if (chart) {
      chartKind = chart.dataset.chart;
      renderChart();
      return;
    }
    const tab = event.target.closest("[data-market-tab]");
    if (tab) {
      marketTab = tab.dataset.marketTab;
      renderDetails();
      return;
    }
    const amount = event.target.closest("[data-quantity]");
    if (amount) {
      $("quantity").value =
        amount.dataset.quantity === "max"
          ? maximumQuantity()
          : amount.dataset.quantity;
      updateTicket();
      return;
    }
    const cancel = event.target.closest("[data-cancel]");
    if (cancel) {
      try {
        engine.cancelOrder(cancel.dataset.cancel);
        render();
        persist();
        toast(
          "Emir iptal edildi. Ayrılan nakit veya paylar serbest bırakıldı.",
        );
      } catch (err) {
        toast(err.message, true);
      }
      return;
    }
    const scenario = event.target.closest("[data-scenario]");
    if (scenario) {
      try {
        engine.scenario(scenario.dataset.scenario, selected);
        render();
        persist();
        toast(
          `${selected} için senaryo uygulandı. Bir gün ilerleterek piyasa tepkisini izle.`,
        );
      } catch (err) {
        toast(err.message, true);
      }
      return;
    }
  });
  $("quantity").addEventListener("input", updateTicket);
  $("limit-price").addEventListener("input", updateTicket);
  document.querySelectorAll('[name="order-type"]').forEach((input) =>
    input.addEventListener("change", () => {
      orderType = input.value;
      if (orderType === "limit" && !$("limit-price").value)
        $("limit-price").value = (startup().price / 100).toFixed(2);
      updateTicket();
    }),
  );
  $("order-form").addEventListener("submit", (event) => {
    event.preventDefault();
    $("order-error").hidden = true;
    $("order-success").hidden = true;
    try {
      const before = engine.trades.length,
        quantity = Number($("quantity").value);
      if (!Number.isSafeInteger(quantity) || quantity <= 0)
        throw Error("Adet pozitif bir tam sayı olmalı.");
      const input = { symbol: selected, side, type: orderType, quantity };
      if (orderType === "limit") {
        const price = Math.round(Number($("limit-price").value) * 100);
        if (!Number.isSafeInteger(price) || price <= 0)
          throw Error("Geçerli, pozitif bir limit fiyatı yaz.");
        input.price = price;
      }
      engine.placeOrder(input);
      const fills = engine.trades
          .slice(before)
          .filter((t) => t.buyerId === "user" || t.sellerId === "user"),
        filled = fills.reduce((n, t) => n + t.quantity, 0),
        total = fills.reduce((n, t) => n + t.quantity * t.price, 0);
      const last = engine.orders.filter((o) => o.accountId === "user").at(-1);
      let msg = filled
        ? `${num(filled)} pay ${money(total)} tutarla ${side === "buy" ? "alındı" : "satıldı"}.`
        : "";
      if (
        last?.remaining > 0 &&
        (last.status === "open" || last.status === "partial")
      )
        msg += ` ${num(last.remaining)} pay limit emrinde bekliyor.`;
      else if (filled < quantity && orderType === "market")
        msg += ` ${num(quantity - filled)} pay için karşı emir bulunmadı; kalan adet iptal edildi.`;
      $("order-success").textContent = msg.trim() || "Emir oluşturuldu.";
      $("order-success").hidden = false;
      render();
      persist();
    } catch (err) {
      $("order-error").textContent = err.message;
      $("order-error").hidden = false;
    }
  });
  $("campaign-search").addEventListener("input", (event) => {
    campaignSearch = event.target.value;
    renderFunding();
  });
  $("campaign-sector").addEventListener("change", (event) => {
    campaignSector = event.target.value;
    renderFunding();
  });
  $("campaign-sort").addEventListener("change", (event) => {
    campaignSort = event.target.value;
    renderFunding();
  });
  $("founder-symbol").addEventListener("change", (event) => {
    selectSymbol(event.target.value);
    renderFounder();
  });
  $("funding-grid").addEventListener("focusin", () => {
    if (timer) pause();
  });
  $("funding-grid").addEventListener("input", (event) => {
    if (event.target.name === "fund-amount") {
      const symbol = event.target.closest("form").dataset.fundSymbol;
      fundingQuantities[symbol] = event.target.value;
      updateInvestmentQuote(symbol);
    }
  });
  $("funding-grid").addEventListener("submit", (event) => {
    const form = event.target.closest("[data-fund-symbol]");
    if (!form) return;
    event.preventDefault();
    try {
      const symbol = form.dataset.fundSymbol,
        { s, budget, quantity, total } = investmentQuote(symbol);
      if (!Number.isSafeInteger(budget) || quantity <= 0)
        throw Error("En az bir pay alabilecek geçerli bir TL bütçesi yaz.");
      engine.fund(symbol, quantity);
      render();
      persist();
      $(`invest-${symbol}`)?.focus({ preventScroll: true });
      toast(
        `${symbol}: ${num(quantity)} yeni pay senin. ${money(total)} girişimin kasasına gitti; ${money(budget - total)} bütçen harcanmadı. Kazanç garanti değildir.`,
      );
    } catch (err) {
      toast(err.message, true);
    }
  });
  $("advance-button").addEventListener("click", advance);
  $("play-button").addEventListener("click", () => (timer ? pause() : play()));
  $("speed-select").addEventListener("change", () => {
    if (timer) {
      pause();
      play();
    }
  });
  $("help-button").addEventListener("click", () =>
    openDialog(
      '<div class="eyebrow">VENTUREX LABORATUVARI</div><h2>Küçük girişimler, ortak bir gelecek.</h2><p>A–H girişimleri ve yatırımcı botları tamamen kurgusaldır. Başlangıçta ₺100.000 sanal bakiyen var. Tüm veriler bu simülasyon motorunda üretilir.</p><ul><li><strong>+1 gün / Başlat:</strong> Şirketlerin gelir, gider ve kullanıcı sayıları değişir. Botlar alış ve satış emri verir; eşleşmeler fiyatı oluşturur.</li><li><strong>Pay piyasası:</strong> Başka yatırımcıların paylarını alıp sat. Bu işlem şirketi fonlamaz. Limit emrinde fiyatı sen belirle; kalan emri Portföy’den iptal edebilirsin.</li><li><strong>Keşfet ve yatırım yap:</strong> Ürünü, ekibi ve fon planını incele. TL bütçeni yaz; alınacak payı ve ortaklık oranını gör. Yeni pay alımında para girişimin kasasına gider. Esnek fonlama kullanılır; hedef dolmadan fonlar işletmeye aktarılır.</li><li><strong>Girişimci paneli:</strong> Fon hedefi, destekçiler ve planlanan ürün/pazarlama bütçesini izle.</li><li><strong>Senaryolar:</strong> Büyüme, panik ve nakit krizi olaylarını dene. İflas eden şirketin işlemleri durur, paylarının portföy değeri sıfır olur.</li><li><strong>Kayıt:</strong> Bu tarayıcı otomatik kaydeder. Üstteki ↓ ile JSON indir; ↑ ile kaydı yükle.</li></ul><p>Getiri ve satış garanti değildir; piyasa değeri ancak satışla nakde döner. Gerçek para ve yatırım hakkı içermez.</p><div class="dialog-actions"><button class="button play" id="help-done">Keşfetmeye başla ↗</button></div>',
    ),
  );
  $("order-help").addEventListener("click", () =>
    openDialog(
      "<h2>Emir nasıl çalışır?</h2><p><strong>Piyasa emri</strong>, karşı tarafta bulunan en iyi fiyatlardan başlayarak eşleşir. Emir defterinde adedin tamamını karşılayacak pay veya yeterli bakiye yoksa emir hiçbir işlem yapmadan reddedilir. Adedi azaltabilir veya limit emir kullanabilirsin.</p><p><strong>Limit alış</strong> belirlediğin fiyattan veya daha düşükten; <strong>limit satış</strong> belirlediğin fiyattan veya daha yüksekten gerçekleşir. Eşleşmeyen adet defterde kalır.</p><p>Bekleyen alış için nakit, satış için pay ayrılır. Bunları yeni emirlerde kullanamazsın. Emri iptal ettiğinde tekrar kullanılabilirler. Simülasyonda işlem ücreti yoktur.</p>",
    ),
  );
  $("dialog-close").addEventListener("click", () => $("app-dialog").close());
  $("app-dialog").addEventListener("click", (event) => {
    if (event.target.id === "help-done" || event.target.id === "reset-cancel")
      $("app-dialog").close();
    if (event.target.id === "reset-confirm") {
      engine = new window.VentureEngine(42);
      selected = "A";
      campaignSelected = "A";
      side = "buy";
      orderType = "market";
      document.querySelector('[name="order-type"][value="market"]').checked =
        true;
      fundingQuantities = {};
      campaignSearch = "";
      campaignSector = "all";
      $("campaign-search").value = "";
      $("campaign-sector").value = "all";
      $("limit-price").value = (startup().price / 100).toFixed(2);
      switchView("funding");
      $("order-error").hidden = true;
      $("order-success").hidden = true;
      $("quantity").value = "10";
      render();
      persist();
      $("app-dialog").close();
      toast(
        "Sekiz açık girişim kampanyasıyla yeni simülasyon başladı. Sanal bakiye: ₺100.000.",
      );
    }
  });
  $("reset-button").addEventListener("click", () =>
    openDialog(
      '<h2>Yeni bir başlangıç?</h2><p>Mevcut portföy, emirler ve simülasyon geçmişi bu tarayıcıdaki kayıtta sıfırlanacak. Kaydı korumak için önce üstteki ↓ düğmesiyle JSON dosyasını indirebilirsin.</p><div class="dialog-actions"><button id="reset-cancel" class="button secondary">Vazgeç</button><button id="reset-confirm" class="button danger">Simülasyonu sıfırla</button></div>',
    ),
  );
  $("save-button").addEventListener("click", () => {
    try {
      const data = engine.exportJSON(2),
        blob = new Blob([data], { type: "application/json" }),
        url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download = `venturex-gun-${engine.day}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("Simülasyon JSON olarak indirildi.");
    } catch (err) {
      toast(`Kayıt indirilemedi: ${err.message}`, true);
    }
  });
  $("import-button").addEventListener("click", () => {
    pause();
    $("import-file").click();
  });
  $("import-file").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024)
        throw Error("Dosya 20 MB sınırını aşıyor.");
      const state = JSON.parse(await file.text());
      const loaded = window.VentureEngine.fromJSON(state);
      if (!loaded.audit().ok)
        throw Error("Kayıt, simülasyon tutarlılık kontrolünden geçemedi.");
      // Only replace the current simulation after the entire imported state validates.
      engine = loaded;
      if (!engine.startups.some((s) => s.symbol === selected))
        selected = engine.startups[0].symbol;
      fundingQuantities = {};
      keyboardIndex = null;
      $("chart-tooltip").hidden = true;
      $("chart-readout").textContent = "";
      $("limit-price").value = (startup().price / 100).toFixed(2);
      $("founder-symbol").value = selected;
      $("order-error").hidden = true;
      $("order-success").hidden = true;
      render();
      persist();
      toast(`Kayıt yüklendi: gün ${num(engine.day)}.`);
    } catch (err) {
      toast(`Kayıt yüklenemedi: ${err.message}`, true);
    } finally {
      event.target.value = "";
    }
  });
  $("price-chart").addEventListener("pointermove", (event) => {
    if (!chartGeom || !chartData.length) return;
    const rect = $("price-chart").getBoundingClientRect(),
      g = chartGeom,
      sx = ((event.clientX - rect.left) / rect.width) * g.w,
      sy = ((event.clientY - rect.top) / rect.height) * g.h,
      i = Math.min(
        chartData.length - 1,
        Math.max(0, Math.floor((sx - g.l) / g.step)),
      ),
      c = chartData[i];
    if (sx < g.l || sx > g.w - g.r || sy < g.t || sy > g.h - g.b) {
      $("chart-tooltip").hidden = true;
      $("crosshair")?.setAttribute("visibility", "hidden");
      return;
    }
    $("crosshair")?.setAttribute("visibility", "visible");
    $("cross-x")?.setAttribute("x1", g.x(i));
    $("cross-x")?.setAttribute("x2", g.x(i));
    $("cross-y")?.setAttribute("y1", sy);
    $("cross-y")?.setAttribute("y2", sy);
    const tip = $("chart-tooltip");
    tip.innerHTML = `Gün ${num(c.day)}<strong>${money(c.close)}</strong><span>A ${money(c.open)} · Y ${money(c.high)}<br>D ${money(c.low)} · Hacim ${num(c.volume)}</span>`;
    tip.hidden = false;
    tip.style.left = `${Math.max(8, Math.min(rect.width - 205, event.clientX - rect.left + 12))}px`;
    tip.style.top = `${Math.max(8, Math.min(rect.height - 82, event.clientY - rect.top - 70))}px`;
  });
  $("price-chart").addEventListener("pointerleave", () => {
    $("chart-tooltip").hidden = true;
    $("crosshair")?.setAttribute("visibility", "hidden");
  });
  $("price-chart").addEventListener("keydown", (event) => {
    if (
      !chartGeom ||
      !chartData.length ||
      !["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(event.key)
    )
      return;
    event.preventDefault();
    if (event.key === "Escape") {
      $("chart-tooltip").hidden = true;
      $("crosshair")?.setAttribute("visibility", "hidden");
      return;
    }
    if (event.key === "Home") keyboardIndex = 0;
    else if (event.key === "End") keyboardIndex = chartData.length - 1;
    else
      keyboardIndex = Math.max(
        0,
        Math.min(
          chartData.length - 1,
          (keyboardIndex ??
            (event.key === "ArrowLeft" ? chartData.length : -1)) +
            (event.key === "ArrowLeft" ? -1 : 1),
        ),
      );
    const c = chartData[keyboardIndex],
      g = chartGeom,
      rect = $("price-chart").getBoundingClientRect(),
      cx = g.x(keyboardIndex),
      cy = g.y(c.close),
      tip = $("chart-tooltip");
    $("crosshair")?.setAttribute("visibility", "visible");
    $("cross-x")?.setAttribute("x1", cx);
    $("cross-x")?.setAttribute("x2", cx);
    $("cross-y")?.setAttribute("y1", cy);
    $("cross-y")?.setAttribute("y2", cy);
    tip.innerHTML = `Gün ${num(c.day)}<strong>${money(c.close)}</strong><span>A ${money(c.open)} · Y ${money(c.high)}<br>D ${money(c.low)} · Hacim ${num(c.volume)}</span>`;
    tip.hidden = false;
    tip.style.left = `${Math.max(8, Math.min(rect.width - 205, (cx / g.w) * rect.width + 10))}px`;
    tip.style.top = "10px";
    $("chart-readout").textContent =
      `${startup().name}, gün ${c.day}. Açılış ${money(c.open)}, yüksek ${money(c.high)}, düşük ${money(c.low)}, kapanış ${money(c.close)}, hacim ${num(c.volume)} pay.`;
  });
  $("price-chart").addEventListener("blur", () => {
    $("chart-tooltip").hidden = true;
    $("crosshair")?.setAttribute("visibility", "hidden");
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
  });
  window.addEventListener("resize", () => {
    if (view === "market") renderChart();
  });
  window.addEventListener("beforeunload", persist);
  $("limit-price").value = (startup().price / 100).toFixed(2);
  switchView("funding");
  persist();
  if (restoredError) toast(restoredError, true);
})();
