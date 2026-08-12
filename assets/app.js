/* BOOST — витрина финансовых продуктов.
   Каталог, поиск, фильтр по категориям, сортировка и мини-подбор.
   Данные лежат в data.js (window.SITE_DATA) и правятся через панель управления. */
(function () {
  "use strict";

  var DATA = window.SITE_DATA || { offers: [], cats: [] };
  var OFFERS = Array.isArray(DATA.offers) ? DATA.offers : [];
  var CATS = Array.isArray(DATA.cats) && DATA.cats.length
    ? DATA.cats
    : [{ id: "other", name: "Предложения" }];

  var reduceMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

  /* ————————————————— мелкие помощники ————————————————— */

  function el(id) { return document.getElementById(id); }

  function plural(n, one, few, many) {
    var a = n % 10, b = n % 100;
    if (a === 1 && b !== 11) return one;
    if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
    return many;
  }

  function catName(id) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i].name;
    return "Предложение";
  }

  /* Цвет категории — только оформление: название всегда написано словами,
     поэтому смысл не теряется, если цвет не виден. */
  function catTint(id) {
    for (var i = 0; i < CATS.length; i++) {
      if (CATS[i].id === id && CATS[i].tint) return CATS[i].tint;
    }
    return "#dfeee4";
  }

  /* Плитки категорий залиты пастелью, а точка рядом с названием в карточке
     должна быть заметной — берём тот же цвет и притемняем. */
  function darken(hex, k) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
    if (!m) return "#117a4d";
    var n = parseInt(m[1], 16);
    var r = Math.round(((n >> 16) & 255) * k);
    var g = Math.round(((n >> 8) & 255) * k);
    var b = Math.round((n & 255) * k);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function countIn(catId) {
    return OFFERS.filter(function (o) { return o.cat === catId; }).length;
  }

  /* Числа вытаскиваем прямо из подписей: в панели управления клиент пишет
     обычным текстом («до 100 000 ₽»), а сортировке нужно число. */
  function numberFrom(text) {
    var s = String(text || "").replace(/[\s ]/g, "").replace(",", ".");
    var m = s.match(/\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }

  function specValue(offer, re) {
    var specs = offer.specs || [];
    for (var i = 0; i < specs.length; i++) {
      if (re.test(String(specs[i][0]))) return String(specs[i][1]);
    }
    return "";
  }

  function amountOf(offer) {
    if (offer._amount !== undefined) return offer._amount;
    var raw = specValue(offer, /сумм|лимит|покрыт/i);
    offer._amount = numberFrom(raw);
    return offer._amount;
  }

  /* Ставку приводим к годовой, иначе «0,8% в день» выглядит выгоднее «19,9% годовых». */
  function rateOf(offer) {
    if (offer._rate !== undefined) return offer._rate;
    var raw = specValue(offer, /ставк|процент/i);
    var n = numberFrom(raw);
    if (n !== null && /в\s*день|ежеднев/i.test(raw)) n = n * 365;
    offer._rate = n;
    return offer._rate;
  }

  function haystack(offer) {
    if (offer._hay) return offer._hay;
    var parts = [offer.brand, offer.title, offer.desc, offer.badge, catName(offer.cat)];
    (offer.specs || []).forEach(function (p) { parts.push(p[0], p[1]); });
    offer._hay = parts.join(" ").toLowerCase();
    return offer._hay;
  }

  /* ————————————————— состояние ————————————————— */

  var state = { q: "", cat: "all", sort: "default", minAmount: 0 };

  /* ————————————————— карточка ————————————————— */

  function buildCard(offer, index) {
    var li = document.createElement("li");
    li.className = "offer";

    var card = document.createElement("article");
    card.className = "card";
    card.style.setProperty("--tint", catTint(offer.cat));

    /* — шапка карточки — */
    var top = document.createElement("div");
    top.className = "card__top";

    var cat = document.createElement("p");
    cat.className = "card__cat";
    var dot = document.createElement("span");
    dot.className = "card__dot";
    dot.setAttribute("aria-hidden", "true");
    dot.style.background = darken(catTint(offer.cat), .52);
    cat.appendChild(dot);
    cat.appendChild(document.createTextNode(catName(offer.cat)));

    top.appendChild(cat);

    if (offer.badge) {
      var badge = document.createElement("p");
      badge.className = "card__badge";
      badge.textContent = offer.badge;
      top.appendChild(badge);
    }
    card.appendChild(top);

    var body = document.createElement("div");
    body.className = "card__body";
    card.appendChild(body);

    /* — логотип и название — */
    var idRow = document.createElement("div");
    idRow.className = "card__id";

    var logoBox = document.createElement("span");
    if (offer.logo) {
      /* Логотип декоративный: название компании стоит рядом заголовком,
         второй раз проговаривать его скринридеру незачем. */
      logoBox.className = "card__logo";
      var img = document.createElement("img");
      img.src = offer.logo;
      img.alt = "";
      img.width = 34;
      img.height = 34;
      img.loading = "lazy";
      /* если файл не доехал — вместо битой картинки монограмма */
      img.addEventListener("error", function () {
        logoBox.textContent = (offer.brand || "?").trim().charAt(0).toUpperCase();
        logoBox.className = "card__logo card__logo--letter";
        logoBox.setAttribute("aria-hidden", "true");
      });
      logoBox.appendChild(img);
    } else {
      logoBox.className = "card__logo card__logo--letter";
      logoBox.setAttribute("aria-hidden", "true");
      logoBox.textContent = (offer.brand || "?").trim().charAt(0).toUpperCase();
    }
    idRow.appendChild(logoBox);

    var h3 = document.createElement("h3");
    h3.className = "card__brand";
    h3.appendChild(document.createTextNode(offer.brand || "Предложение"));
    if (offer.title) {
      var sub = document.createElement("span");
      sub.className = "card__title";
      sub.textContent = offer.title;
      h3.appendChild(sub);
    }
    idRow.appendChild(h3);
    body.appendChild(idRow);

    if (offer.desc) {
      var desc = document.createElement("p");
      desc.className = "card__desc";
      desc.textContent = offer.desc;
      body.appendChild(desc);
    }

    /* — параметры — */
    var specs = offer.specs || [];
    if (specs.length) {
      var dl = document.createElement("dl");
      dl.className = "specs";
      specs.slice(0, 6).forEach(function (pair) {
        if (!pair || (!pair[0] && !pair[1])) return;
        var row = document.createElement("div");
        row.className = "spec";
        var dt = document.createElement("dt");
        dt.textContent = pair[0];
        var dd = document.createElement("dd");
        dd.textContent = pair[1];
        row.appendChild(dt);
        row.appendChild(dd);
        dl.appendChild(row);
      });
      body.appendChild(dl);
    }

    /* — действие — */
    var foot = document.createElement("div");
    foot.className = "card__foot";

    var a = document.createElement("a");
    a.className = "btn btn--primary card__cta";
    a.href = offer.url || "#";
    a.target = "_blank";
    a.rel = "noopener nofollow sponsored";
    a.appendChild(document.createTextNode("Оформить"));

    /* Ссылок на странице много, и все они называются «Оформить».
       Скринридеру дописываем, что именно оформляется и куда ведёт ссылка. */
    var vh = document.createElement("span");
    vh.className = "visually-hidden";
    vh.textContent = " — " + (offer.brand || "предложение") +
      (offer.title ? ", " + offer.title : "") + " (на сайте партнёра, в новой вкладке)";
    a.appendChild(vh);

    var note = document.createElement("p");
    note.className = "card__note";
    note.textContent = "Заявка на сайте компании";

    foot.appendChild(a);
    foot.appendChild(note);
    body.appendChild(foot);

    li.appendChild(card);
    return li;
  }

  /* ————————————————— выборка ————————————————— */

  function visibleOffers() {
    var q = state.q.trim().toLowerCase();
    var list = OFFERS.filter(function (o) {
      if (state.cat !== "all" && o.cat !== state.cat) return false;
      if (state.minAmount) {
        var a = amountOf(o);
        if (a !== null && a < state.minAmount) return false;
      }
      if (q && haystack(o).indexOf(q) === -1) return false;
      return true;
    });

    if (state.sort === "amount") {
      list.sort(function (x, y) {
        var a = amountOf(x), b = amountOf(y);
        if (a === null && b === null) return 0;
        if (a === null) return 1;
        if (b === null) return -1;
        return b - a;
      });
    } else if (state.sort === "rate") {
      list.sort(function (x, y) {
        var a = rateOf(x), b = rateOf(y);
        if (a === null && b === null) return 0;
        if (a === null) return 1;
        if (b === null) return -1;
        return a - b;
      });
    } else if (state.sort === "name") {
      list.sort(function (x, y) {
        return String(x.brand || "").localeCompare(String(y.brand || ""), "ru");
      });
    }
    return list;
  }

  /* ————————————————— отрисовка ————————————————— */

  var listEl    = el("offers-list");
  var emptyEl   = el("empty-state");
  var counterEl = el("counter");
  var statusEl  = el("sr-status");
  var statusT   = null;

  function announce(text) {
    if (!statusEl) return;
    clearTimeout(statusT);
    statusEl.textContent = "";
    statusT = setTimeout(function () { statusEl.textContent = text; }, 150);
  }

  function render(opts) {
    var list = visibleOffers();
    listEl.textContent = "";
    var frag = document.createDocumentFragment();
    list.forEach(function (o, i) { frag.appendChild(buildCard(o, i)); });
    listEl.appendChild(frag);

    var phrase = list.length
      ? "Найдено " + list.length + " " + plural(list.length, "предложение", "предложения", "предложений")
      : "Ничего не нашлось";
    counterEl.textContent = phrase;
    emptyEl.hidden = list.length !== 0;

    if (!opts || opts.announce !== false) announce(phrase);
    reveal();
  }

  /* ————————————————— проявление карточек ————————————————— */

  var io = null;
  function reveal() {
    var items = listEl.querySelectorAll(".offer");
    if (reduceMotion || !("IntersectionObserver" in window)) {
      Array.prototype.forEach.call(items, function (n) { n.classList.add("is-in"); });
      return;
    }
    if (!io) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
        });
      }, { rootMargin: "0px 0px -40px 0px" });
    }
    Array.prototype.forEach.call(items, function (n, i) {
      n.style.setProperty("--i", String(Math.min(i, 8)));
      io.observe(n);
    });
    /* Подстраховка: если наблюдатель почему-то не сработал (страница
       отрисована в фоновой вкладке), через секунду показываем всё. */
    setTimeout(function () {
      Array.prototype.forEach.call(items, function (n) { n.classList.add("is-in"); });
    }, 1200);
  }

  /* Секции проявляются так же, но их мало — обходимся одним наблюдателем. */
  function revealSections() {
    var nodes = document.querySelectorAll("[data-reveal], .cat-tile-wrap");
    if (reduceMotion || !("IntersectionObserver" in window)) {
      Array.prototype.forEach.call(nodes, function (n) { n.classList.add("is-in"); });
      return;
    }
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("is-in"); obs.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -60px 0px" });
    Array.prototype.forEach.call(nodes, function (n) { obs.observe(n); });
    setTimeout(function () {
      Array.prototype.forEach.call(nodes, function (n) { n.classList.add("is-in"); });
    }, 1500);
  }

  /* ————————————————— фильтры ————————————————— */

  var chipsBox = el("chips");

  function buildChips() {
    if (!chipsBox) return;
    var frag = document.createDocumentFragment();

    function chip(id, value, label, checked) {
      var input = document.createElement("input");
      input.className = "chips__input visually-hidden";
      input.type = "radio";
      input.name = "cat";
      input.id = id;
      input.value = value;
      if (checked) input.checked = true;

      var lab = document.createElement("label");
      lab.className = "chip";
      lab.setAttribute("for", id);
      var mark = document.createElement("span");
      mark.className = "chip__mark";
      mark.setAttribute("aria-hidden", "true");
      lab.appendChild(mark);
      lab.appendChild(document.createTextNode(label));

      if (value !== "all") mark.style.background = darken(catTint(value), .52);

      var n = value === "all" ? OFFERS.length : countIn(value);
      var cnt = document.createElement("span");
      cnt.className = "chip__count";
      cnt.setAttribute("aria-hidden", "true");
      cnt.textContent = String(n);
      lab.appendChild(cnt);

      frag.appendChild(input);
      frag.appendChild(lab);
    }

    chip("cat-all", "all", "Все", true);
    CATS.forEach(function (c) {
      if (!countIn(c.id)) return;           // пустые категории в фильтре не показываем
      chip("cat-" + c.id, c.id, c.name, false);
    });
    chipsBox.appendChild(frag);
  }

  /* ————————————————— плитки категорий ————————————————— */

  /* Плитка делает ровно то же, что кнопка фильтра: переключает категорию
     и уводит к каталогу. Поэтому это button, а не ссылка. */
  function buildTiles() {
    var box = el("cat-tiles");
    if (!box) return;
    var frag = document.createDocumentFragment();

    CATS.forEach(function (c, i) {
      var n = countIn(c.id);
      if (!n) return;

      var li = document.createElement("li");
      li.className = "cat-tile-wrap";
      li.style.setProperty("--i", String(i));

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cat-tile";
      btn.style.background = c.tint || "#dfeee4";
      btn.dataset.cat = c.id;

      var num = document.createElement("span");
      num.className = "cat-tile__num";
      num.setAttribute("aria-hidden", "true");
      num.textContent = String(n);

      var word = document.createElement("span");
      word.className = "cat-tile__word";
      word.setAttribute("aria-hidden", "true");
      word.textContent = plural(n, "предложение", "предложения", "предложений");

      var name = document.createElement("span");
      name.className = "cat-tile__name";
      name.textContent = c.name;

      /* Кнопке нужно осмысленное имя целиком, а не «12 Микрозаймы». */
      var vh = document.createElement("span");
      vh.className = "visually-hidden";
      vh.textContent = " — показать " + n + " " +
        plural(n, "предложение", "предложения", "предложений");
      name.appendChild(vh);

      var go = document.createElement("span");
      go.className = "cat-tile__go";
      go.setAttribute("aria-hidden", "true");
      go.textContent = "↗";

      btn.appendChild(num);
      btn.appendChild(word);
      btn.appendChild(name);
      btn.appendChild(go);
      li.appendChild(btn);
      frag.appendChild(li);
    });

    box.appendChild(frag);

    box.addEventListener("click", function (e) {
      var btn = e.target.closest(".cat-tile");
      if (!btn) return;
      state.cat = btn.dataset.cat;
      state.q = "";
      state.minAmount = 0;
      var input = el("cat-" + state.cat);
      if (input) input.checked = true;
      if (el("q")) el("q").value = "";
      render();
      var head = el("results-heading");
      if (head) {
        head.focus();
        head.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      }
    });
  }

  function bindFilters() {
    var q = el("q");
    if (q) {
      var qT = null;
      q.addEventListener("input", function () {
        state.q = q.value;
        clearTimeout(qT);
        qT = setTimeout(function () { render(); }, 180);
      });
      /* Enter в поле поиска не должен перезагружать страницу. */
      q.form && q.form.addEventListener("submit", function (e) { e.preventDefault(); });
    }

    if (chipsBox) {
      chipsBox.addEventListener("change", function (e) {
        if (e.target && e.target.name === "cat") {
          state.cat = e.target.value;
          render();
        }
      });
    }

    var sort = el("sort");
    if (sort) {
      sort.addEventListener("change", function () {
        state.sort = sort.value;
        render();
      });
    }

    var reset = el("btn-reset-filters");
    if (reset) {
      reset.addEventListener("click", function () {
        state.q = ""; state.cat = "all"; state.sort = "default"; state.minAmount = 0;
        if (el("q")) el("q").value = "";
        if (el("cat-all")) el("cat-all").checked = true;
        if (el("sort")) el("sort").value = "default";
        render();
        var h = el("results-heading");
        if (h) h.focus();
      });
    }
  }

  /* ————————————————— подбор ————————————————— */

  /* Квиз ничего не выдумывает: он просто выставляет те же фильтры,
     что пользователь мог бы выставить руками. */
  function bindQuiz() {
    var form = el("quiz");
    if (!form) return;

    var GOAL = {
      short: { cats: ["mfo"],       sort: "default" },
      big:   { cats: ["loan"],      sort: "amount"  },
      card:  { cats: ["credit"],    sort: "default" },
      daily: { cats: ["debit"],     sort: "default" },
      ins:   { cats: ["insurance"], sort: "default" }
    };
    var AMOUNT = { any: 0, s: 0, m: 30000, l: 100000 };
    var SORT = { fast: "default", cheap: "rate", bonus: "amount" };

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var goal   = (form.querySelector('input[name="goal"]:checked')   || {}).value || "short";
      var amount = (form.querySelector('input[name="amount"]:checked') || {}).value || "any";
      var pref   = (form.querySelector('input[name="pref"]:checked')   || {}).value || "fast";

      var rule = GOAL[goal] || GOAL.short;
      var wanted = rule.cats[0];
      /* Если такой категории в каталоге нет (клиент переименовал её в панели) —
         не прячем всё подряд, а показываем полный список. */
      var exists = OFFERS.some(function (o) { return o.cat === wanted; });
      state.cat = exists ? wanted : "all";
      state.minAmount = AMOUNT[amount] || 0;
      state.sort = SORT[pref] || rule.sort;
      state.q = "";

      var input = el("cat-" + state.cat) || el("cat-all");
      if (input) input.checked = true;
      if (el("q")) el("q").value = "";
      if (el("sort")) el("sort").value = state.sort;

      /* Если под жёсткий фильтр по сумме ничего не попало — ослабляем его,
         чтобы человек не упёрся в пустой экран. */
      render({ announce: false });
      if (!visibleOffers().length && state.minAmount) {
        state.minAmount = 0;
        render({ announce: false });
      }

      var n = visibleOffers().length;
      announce("Подобрали " + n + " " + plural(n, "предложение", "предложения", "предложений") +
               ". Список ниже обновлён.");

      var head = el("results-heading");
      if (head) {
        head.focus();
        head.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      }
    });
  }

  /* ————————————————— счётчики в шапке ————————————————— */

  /* Считаем по таймеру, а не по requestAnimationFrame: во встроенных
     превью и фоновых вкладках кадры не идут и число замирает на нуле. */
  function countUp(node, target) {
    if (reduceMotion || target <= 0) { node.textContent = String(target); return; }
    var steps = 24, i = 0;
    node.textContent = "0";
    var t = setInterval(function () {
      i++;
      var v = Math.round(target * (1 - Math.pow(1 - i / steps, 3)));
      node.textContent = String(v);
      if (i >= steps) { clearInterval(t); node.textContent = String(target); }
    }, 28);
  }

  function fillStats() {
    var total = OFFERS.length;
    var cats = CATS.filter(function (c) {
      return OFFERS.some(function (o) { return o.cat === c.id; });
    }).length;

    var n1 = el("stat-offers");
    var n2 = el("stat-cats");
    if (n1) countUp(n1, total);
    if (n2) countUp(n2, cats);

    var heroCount = el("hero-count");
    if (heroCount) heroCount.textContent = String(total);

    Array.prototype.forEach.call(document.querySelectorAll("[data-updated]"), function (n) {
      n.textContent = DATA.updated || "";
    });

    var word = el("offers-word");
    if (word) word.textContent = plural(total, "предложение", "предложения", "предложений");
  }

  /* ————————————————— шапка на скролле ————————————————— */

  function bindHeader() {
    var head = document.querySelector(".site-head");
    if (!head) return;
    var last = -1;
    function onScroll() {
      var y = window.pageYOffset || document.documentElement.scrollTop;
      var on = y > 24;
      if (on !== last) { head.classList.toggle("is-stuck", on); last = on; }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ————————————————— старт ————————————————— */

  function init() {
    buildChips();
    buildTiles();
    bindFilters();
    bindQuiz();
    fillStats();
    bindHeader();
    render({ announce: false });
    revealSections();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
