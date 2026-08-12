/* BOOST — панель управления каталогом.
   На хостинге с PHP правки уходят прямо в data.js через api.php.
   Если PHP нет (файлы открыты с диска) — панель работает в запасном
   режиме: черновик хранится в браузере, каталог выгружается файлом. */
(function () {
  "use strict";

  var PASSWORD  = "boost2026";        // используется только в режиме без PHP
  var SESSION   = "boost:auth";
  var STORE_KEY = "boost:data";
  var TOKEN_KEY = "boost:token";
  var API       = "api.php";

  var server = false;   // отвечает ли бэкенд

  function api(action, payload) {
    var opts = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    };
    try {
      var t = sessionStorage.getItem(TOKEN_KEY);
      if (t) opts.headers["X-Auth-Token"] = t;
    } catch (e) {}
    return fetch(API + "?action=" + action, opts).then(function (r) {
      return r.json().catch(function () {
        return { ok: false, error: "Сервер ответил не по делу" };
      });
    });
  }

  /* ================= состояние ================= */

  var data = null;   // { updated, cats: [], offers: [] }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function baseData() {
    var src = window.SITE_DATA;
    if (src && Array.isArray(src.offers)) {
      var d = clone(src);
      if (!Array.isArray(d.cats) || !d.cats.length) {
        d.cats = [{ id: "other", name: "Предложения" }];
      }
      return d;
    }
    return { updated: "", cats: [{ id: "other", name: "Предложения" }], offers: [] };
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (p && Array.isArray(p.offers)) {
          if (!Array.isArray(p.cats) || !p.cats.length) p.cats = baseData().cats;
          return p;
        }
      }
    } catch (e) { /* битый черновик игнорируем */ }
    return baseData();
  }

  /* ================= объявления и сообщения ================= */

  var srStatus = document.getElementById("sr-status");
  var toast    = document.getElementById("toast");
  var toastT   = null;

  function say(text) {
    srStatus.textContent = "";
    setTimeout(function () { srStatus.textContent = text; }, 120);
  }
  function flash(text) {
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(function () { toast.hidden = true; }, 6000);
    say(text);
  }
  function alertBox(id, textId, message) {
    var box = document.getElementById(id);
    document.getElementById(textId).textContent = message;
    box.querySelector(".alert__body").hidden = false;
  }
  function alertClear(id) {
    document.getElementById(id).querySelector(".alert__body").hidden = true;
  }

  function plural(n, one, few, many) {
    var a = n % 10, b = n % 100;
    if (a === 1 && b !== 11) return one;
    if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
    return many;
  }

  /* ================= вход ================= */

  var loginView = document.getElementById("login-view");
  var appView   = document.getElementById("app-view");
  var loginForm = document.getElementById("login-form");
  var pwd       = document.getElementById("pwd");
  var pwdToggle = document.getElementById("pwd-toggle");

  pwdToggle.addEventListener("click", function () {
    var shown = pwd.type === "text";
    pwd.type = shown ? "password" : "text";
    pwdToggle.setAttribute("aria-pressed", String(!shown));
    pwdToggle.firstChild.nodeValue = shown ? "Показать" : "Скрыть";
    pwd.focus();
  });

  function loginFailed(msg) {
    pwd.setAttribute("aria-invalid", "true");
    pwd.setAttribute("aria-describedby", "pwd-hint login-alert-text");
    alertBox("login-alert", "login-alert-text", msg);
    pwd.focus();   // пароль не стираем — человек мог ошибиться в одном символе
  }

  loginForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var btn = loginForm.querySelector('button[type="submit"]');

    if (!server) {
      if (pwd.value === PASSWORD) {
        try { sessionStorage.setItem(SESSION, "1"); } catch (err) {}
        openApp();
      } else {
        loginFailed("Неверный пароль. Проверьте раскладку клавиатуры и регистр букв.");
      }
      return;
    }

    btn.disabled = true;
    api("login", { password: pwd.value }).then(function (r) {
      btn.disabled = false;
      if (!r || !r.ok) { loginFailed((r && r.error) || "Не удалось войти"); return; }
      try {
        sessionStorage.setItem(TOKEN_KEY, r.token);
        sessionStorage.setItem(SESSION, "1");
      } catch (err) {}
      openApp();
    }, function () {
      btn.disabled = false;
      loginFailed("Сервер не отвечает. Проверьте, что панель открыта по адресу сайта, а не файлом с диска.");
    });
  });

  pwd.addEventListener("input", function () {
    pwd.removeAttribute("aria-invalid");
    pwd.setAttribute("aria-describedby", "pwd-hint");
    alertClear("login-alert");
  });

  function openApp() {
    loginView.hidden = true;
    appView.hidden = false;
    document.title = "Каталог — панель управления BOOST";
    data = load();
    renderCats();
    renderRows();
    document.getElementById("admin-h1").focus();
  }

  document.getElementById("btn-logout").addEventListener("click", function () {
    try {
      sessionStorage.removeItem(SESSION);
      sessionStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
    location.reload();
  });

  /* ================= категории ================= */

  var catsEl = document.getElementById("cats");

  var TRANSLIT = {
    а:"a", б:"b", в:"v", г:"g", д:"d", е:"e", ё:"e", ж:"zh", з:"z", и:"i", й:"y",
    к:"k", л:"l", м:"m", н:"n", о:"o", п:"p", р:"r", с:"s", т:"t", у:"u", ф:"f",
    х:"h", ц:"c", ч:"ch", ш:"sh", щ:"sch", ъ:"", ы:"y", ь:"", э:"e", ю:"yu", я:"ya"
  };

  function slug(text) {
    var s = String(text || "").toLowerCase().replace(/[а-яё]/g, function (ch) {
      return TRANSLIT[ch] !== undefined ? TRANSLIT[ch] : ch;
    });
    s = s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return s || "cat";
  }

  function uniqueCatId(base) {
    var id = slug(base), n = 2;
    while (data.cats.some(function (c) { return c.id === id; })) id = slug(base) + "-" + (n++);
    return id;
  }

  function usageOf(catId) {
    return data.offers.filter(function (o) { return o.cat === catId; }).length;
  }

  function renderCats() {
    catsEl.textContent = "";
    var frag = document.createDocumentFragment();

    data.cats.forEach(function (cat, i) {
      var row = document.createElement("div");
      row.className = "cat-row";
      row.dataset.id = cat.id;

      var inputId = "cat-name-" + cat.id;

      var lab = document.createElement("label");
      lab.className = "visually-hidden";
      lab.setAttribute("for", inputId);
      lab.textContent = "Название категории " + (i + 1);

      var input = document.createElement("input");
      input.type = "text";
      input.id = inputId;
      input.value = cat.name || "";
      input.addEventListener("input", function () {
        var c = data.cats.filter(function (x) { return x.id === cat.id; })[0];
        if (c) c.name = input.value;
        refreshCatSelects();
      });

      var idTag = document.createElement("span");
      idTag.className = "cat-id";
      idTag.textContent = cat.id;

      var use = usageOf(cat.id);
      var useTag = document.createElement("span");
      useTag.className = "cat-use";
      useTag.textContent = use + " " + plural(use, "предложение", "предложения", "предложений");

      var tools = document.createElement("div");
      tools.className = "cat-row__tools";

      tools.appendChild(toolBtn("↑", "Поднять категорию «" + cat.name + "» выше", "cat-up"));
      tools.appendChild(toolBtn("↓", "Опустить категорию «" + cat.name + "» ниже", "cat-down"));

      var del = toolBtn("Удалить", " категорию «" + cat.name + "»", "cat-del");
      del.classList.add("btn--danger");
      tools.appendChild(del);

      row.appendChild(lab);
      row.appendChild(input);
      row.appendChild(idTag);
      row.appendChild(useTag);
      row.appendChild(tools);
      frag.appendChild(row);
    });

    catsEl.appendChild(frag);
  }

  function toolBtn(text, vhText, act) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn--small";
    b.dataset.act = act;
    b.appendChild(document.createTextNode(text));
    var vh = document.createElement("span");
    vh.className = "visually-hidden";
    vh.textContent = vhText;
    b.appendChild(vh);
    return b;
  }

  catsEl.addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-act]");
    if (!btn) return;
    var row = btn.closest(".cat-row");
    var id = row.dataset.id;
    var i = data.cats.findIndex(function (c) { return c.id === id; });
    if (i === -1) return;

    if (btn.dataset.act === "cat-up" || btn.dataset.act === "cat-down") {
      var j = btn.dataset.act === "cat-up" ? i - 1 : i + 1;
      if (j < 0 || j >= data.cats.length) { flash("Дальше двигать некуда"); return; }
      var tmp = data.cats[i]; data.cats[i] = data.cats[j]; data.cats[j] = tmp;
      renderCats();
      var moved = catsEl.querySelectorAll(".cat-row")[j];
      moved.querySelector('button[data-act="' + btn.dataset.act + '"]').focus();
      say("Категория перемещена на позицию " + (j + 1) + " из " + data.cats.length);
      return;
    }

    if (btn.dataset.act === "cat-del") {
      var used = usageOf(id);
      if (used) {
        alertBox("admin-alert", "admin-alert-text",
          "В категории «" + data.cats[i].name + "» ещё " + used + " " +
          plural(used, "предложение", "предложения", "предложений") +
          ". Сначала перенесите их в другую категорию или удалите.");
        return;
      }
      if (data.cats.length === 1) {
        alertBox("admin-alert", "admin-alert-text", "Это последняя категория — оставьте хотя бы одну.");
        return;
      }
      askConfirm({
        title: "Удалить категорию?",
        text: "Категория «" + (data.cats[i].name || "без названия") + "» исчезнет из фильтра на сайте. Предложений в ней нет.",
        trigger: btn,
        onOk: function () {
          var name = data.cats[i].name;
          data.cats.splice(i, 1);
          renderCats();
          refreshCatSelects();
          var rows = catsEl.querySelectorAll(".cat-row");
          var next = rows[i] || rows[i - 1];
          if (next) next.querySelector('button[data-act="cat-del"]').focus();
          else document.getElementById("btn-add-cat").focus();
          say("Категория «" + name + "» удалена. Осталось " + data.cats.length + ".");
        }
      });
    }
  });

  document.getElementById("btn-add-cat").addEventListener("click", function () {
    var id = uniqueCatId("novaya-kategoriya");
    data.cats.push({ id: id, name: "Новая категория" });
    renderCats();
    refreshCatSelects();
    var row = catsEl.querySelectorAll(".cat-row")[data.cats.length - 1];
    row.scrollIntoView({ block: "center" });
    row.querySelector("input").select();
    say("Добавлена категория. Введите название.");
  });

  /* Селекты в карточках должны знать про свежие категории. */
  function refreshCatSelects() {
    Array.prototype.forEach.call(document.querySelectorAll("select[data-cat-select]"), function (sel) {
      var current = sel.value;
      sel.textContent = "";
      data.cats.forEach(function (c) {
        var opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = c.name || c.id;
        if (c.id === current) opt.selected = true;
        sel.appendChild(opt);
      });
      if (!data.cats.some(function (c) { return c.id === current; }) && data.cats[0]) {
        sel.value = data.cats[0].id;
      }
    });
  }

  /* ================= строки каталога ================= */

  var rowsEl  = document.getElementById("rows");
  var countEl = document.getElementById("rows-count");

  function specsToText(specs) {
    return (specs || []).map(function (p) { return p[0] + " | " + p[1]; }).join("\n");
  }
  function textToSpecs(text) {
    return String(text || "").split("\n").map(function (line) {
      var i = line.indexOf("|");
      if (i === -1) { var t = line.trim(); return t ? [t, ""] : null; }
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }).filter(Boolean);
  }

  function field(labelText, id, type, value, offerId, cls) {
    var wrap = document.createElement("div");
    wrap.className = "field-row" + (cls ? " " + cls : "");

    var lab = document.createElement("label");
    lab.setAttribute("for", id);
    lab.id = id + "-lab";
    lab.textContent = labelText;

    var ctl;
    if (type === "textarea") {
      ctl = document.createElement("textarea");
      ctl.value = value || "";
    } else if (type === "select") {
      ctl = document.createElement("select");
      ctl.setAttribute("data-cat-select", "");
      data.cats.forEach(function (c) {
        var opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = c.name || c.id;
        if (c.id === value) opt.selected = true;
        ctl.appendChild(opt);
      });
      if (!data.cats.some(function (c) { return c.id === value; }) && data.cats[0]) {
        ctl.value = data.cats[0].id;
      }
    } else {
      ctl = document.createElement("input");
      ctl.type = type;
      ctl.value = value || "";
      if (type === "url") ctl.placeholder = "https://";
    }
    ctl.id = id;
    /* имя поля = «Ссылка» + название предложения, иначе в списке из 28 карточек
       все поля называются одинаково */
    ctl.setAttribute("aria-labelledby", id + "-lab " + offerId + "-title");

    wrap.appendChild(lab);
    wrap.appendChild(ctl);
    return wrap;
  }

  function buildRow(offer, index) {
    var uid = offer.uid;
    var fs = document.createElement("fieldset");
    fs.className = "row";
    fs.dataset.uid = uid;

    var legend = document.createElement("legend");
    var head = document.createElement("div");
    head.className = "row__head";

    var num = document.createElement("span");
    num.className = "row__num";
    num.textContent = ("0" + (index + 1)).slice(-2);

    var h3 = document.createElement("h3");
    h3.id = uid + "-title";
    h3.textContent = offer.brand || "Без названия";

    var tools = document.createElement("div");
    tools.className = "row__tools";

    var name = offer.brand || "Без названия";
    var up   = toolBtn("↑", " Поднять выше: " + name, "up");
    var down = toolBtn("↓", " Опустить ниже: " + name, "down");
    var del  = toolBtn("Удалить", " предложение «" + name + "»", "del");
    del.classList.add("btn--danger");

    tools.appendChild(up); tools.appendChild(down); tools.appendChild(del);
    head.appendChild(num); head.appendChild(h3); head.appendChild(tools);
    legend.appendChild(head);
    fs.appendChild(legend);

    var grid = document.createElement("div");
    grid.className = "row__grid";
    grid.appendChild(field("Категория", uid + "-cat", "select", offer.cat, uid));
    grid.appendChild(field("Название компании", uid + "-brand", "text", offer.brand, uid));
    grid.appendChild(field("Подзаголовок (продукт)", uid + "-sub", "text", offer.title, uid));
    grid.appendChild(field("Плашка (необязательно)", uid + "-badge", "text", offer.badge, uid));
    grid.appendChild(field("Описание", uid + "-desc", "textarea", offer.desc, uid, "span2"));
    grid.appendChild(field("Параметры — по одному в строке, формат «Название | Значение»",
      uid + "-specs", "textarea", specsToText(offer.specs), uid, "span2"));
    grid.appendChild(field("Партнёрская ссылка", uid + "-url", "url", offer.url, uid, "span2"));
    fs.appendChild(grid);

    /* заголовок строки живёт синхронно с полем «Название компании» */
    grid.querySelector("#" + CSS.escape(uid + "-brand")).addEventListener("input", function (e) {
      var v = e.target.value.trim() || "Без названия";
      h3.textContent = v;
      del.querySelector(".visually-hidden").textContent = " предложение «" + v + "»";
      up.querySelector(".visually-hidden").textContent = " Поднять выше: " + v;
      down.querySelector(".visually-hidden").textContent = " Опустить ниже: " + v;
    });

    return fs;
  }

  function renderRows() {
    rowsEl.textContent = "";
    var frag = document.createDocumentFragment();
    data.offers.forEach(function (o, i) { frag.appendChild(buildRow(o, i)); });
    rowsEl.appendChild(frag);
    var n = data.offers.length;
    countEl.textContent = n + " " + plural(n, "позиция", "позиции", "позиций");
  }

  /* читает поля обратно в data */
  function collect() {
    Array.prototype.forEach.call(rowsEl.querySelectorAll(".row"), function (fs) {
      var uid = fs.dataset.uid;
      var o = data.offers.filter(function (x) { return x.uid === uid; })[0];
      if (!o) return;
      var get = function (suffix) {
        var n = fs.querySelector("#" + CSS.escape(uid + suffix));
        return n ? n.value : "";
      };
      o.cat   = get("-cat");
      o.brand = get("-brand").trim();
      o.title = get("-sub").trim();
      o.badge = get("-badge").trim();
      o.desc  = get("-desc").trim();
      o.url   = get("-url").trim();
      o.specs = textToSpecs(get("-specs"));
    });
    Array.prototype.forEach.call(catsEl.querySelectorAll(".cat-row"), function (row) {
      var c = data.cats.filter(function (x) { return x.id === row.dataset.id; })[0];
      if (c) c.name = row.querySelector("input").value.trim() || c.id;
    });
  }

  /* ================= диалог подтверждения ================= */

  var dialog = document.getElementById("confirm-dialog");
  var pending = null;   // { onOk, trigger }

  function askConfirm(opts) {
    pending = opts;
    document.getElementById("confirm-title").textContent = opts.title;
    document.getElementById("confirm-text").textContent = opts.text;
    document.getElementById("confirm-ok").textContent =
      opts.okText || "Удалить";

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
      document.getElementById("confirm-cancel").focus();
    } else {
      /* очень старый браузер — обходимся системным окном */
      if (window.confirm(opts.title + "\n" + opts.text)) opts.onOk();
      pending = null;
    }
  }

  /* Событие close у <dialog> приходит не во всех браузерах (встроенные
     просмотрщики его теряют), поэтому закрываем и разбираем ответ сами. */
  function finishDialog(value) {
    if (dialog.open) { try { dialog.close(); } catch (e) {} }
    var p = pending;
    pending = null;
    if (!p) return;
    if (value === "ok") p.onOk();
    else if (p.trigger && document.contains(p.trigger)) p.trigger.focus();
  }

  dialog.querySelector("form").addEventListener("submit", function (e) {
    e.preventDefault();
    var btn = e.submitter || document.activeElement;
    var value = (btn && btn.value) === "ok" ? "ok" : "cancel";
    finishDialog(value);
  });

  /* Esc */
  dialog.addEventListener("cancel", function (e) {
    e.preventDefault();
    finishDialog("cancel");
  });

  /* ================= действия над строками ================= */

  rowsEl.addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-act]");
    if (!btn) return;
    var fs = btn.closest(".row");
    var uid = fs.dataset.uid;
    var i = data.offers.findIndex(function (x) { return x.uid === uid; });
    if (i === -1) return;

    if (btn.dataset.act === "up" || btn.dataset.act === "down") {
      var j = btn.dataset.act === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= data.offers.length) { flash("Дальше двигать некуда"); return; }
      collect();
      var tmp = data.offers[i]; data.offers[i] = data.offers[j]; data.offers[j] = tmp;
      renderRows();
      var moved = rowsEl.querySelectorAll(".row")[j];
      moved.querySelector('button[data-act="' + btn.dataset.act + '"]').focus();
      moved.scrollIntoView({ block: "center" });
      say("Перемещено на позицию " + (j + 1) + " из " + data.offers.length);
      return;
    }

    if (btn.dataset.act === "del") {
      var name = data.offers[i].brand || "Без названия";
      askConfirm({
        title: "Удалить предложение?",
        text: "«" + name + "» исчезнет из каталога. Пока вы не нажали «Сохранить и опубликовать», на сайте всё останется по-старому.",
        trigger: btn,
        onOk: function () {
          collect();
          var k = data.offers.findIndex(function (x) { return x.uid === uid; });
          if (k === -1) return;
          data.offers.splice(k, 1);
          renderRows();
          renderCats();     // счётчики использования категорий

          var rows = rowsEl.querySelectorAll(".row");
          var target = rows[k] || rows[k - 1];
          if (target) target.querySelector('button[data-act="del"]').focus();
          else document.getElementById("offers-heading").focus();
          say("Предложение «" + name + "» удалено. Осталось " + data.offers.length + ".");
        }
      });
    }
  });

  /* ================= добавление ================= */

  document.getElementById("btn-add").addEventListener("click", function () {
    collect();
    var uid = "new-" + Math.random().toString(36).slice(2, 9);
    data.offers.push({
      uid: uid,
      cat: (data.cats[0] && data.cats[0].id) || "other",
      brand: "", title: "", badge: "", desc: "",
      specs: [["Сумма", ""], ["Ставка", ""], ["Срок", ""], ["Решение", ""]],
      url: ""
    });
    renderRows();
    renderCats();
    var last = rowsEl.querySelectorAll(".row")[data.offers.length - 1];
    last.scrollIntoView({ block: "center" });
    last.querySelector("#" + CSS.escape(uid + "-brand")).focus();
    say("Добавлена позиция " + data.offers.length + ". Заполните название компании.");
  });

  /* ================= сохранение ================= */

  var saveBtn   = document.getElementById("btn-save");
  var savedMark = document.getElementById("saved-mark");

  function stamp() {
    var d = new Date();
    var p = function (x) { return ("0" + x).slice(-2); };
    return p(d.getDate()) + "." + p(d.getMonth() + 1) + "." + d.getFullYear();
  }

  function markSaved() {
    var d = new Date();
    savedMark.textContent = "Сохранено " + stamp() + ", " +
      ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
  }

  saveBtn.addEventListener("click", function () {
    collect();
    data.updated = stamp();

    if (!server) {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(data));
      } catch (err) {
        alertBox("admin-alert", "admin-alert-text",
          "Не удалось сохранить: браузер не даёт записать данные. Освободите место или выйдите из приватного режима.");
        return;
      }
      alertClear("admin-alert");
      markSaved();
      flash("Сохранено в браузере. Выгрузите data.js и залейте на сайт");
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "Сохраняю…";
    api("save", { data: { updated: data.updated, cats: data.cats, offers: data.offers } })
      .then(function (r) {
        saveBtn.disabled = false;
        saveBtn.textContent = "Сохранить и опубликовать";
        if (!r || !r.ok) {
          alertBox("admin-alert", "admin-alert-text",
            (r && r.error) || "Сервер не смог записать каталог");
          return;
        }
        alertClear("admin-alert");
        try { localStorage.removeItem(STORE_KEY); } catch (e) {}
        markSaved();
        flash("Сохранено — правки уже на сайте");
      }, function () {
        saveBtn.disabled = false;
        saveBtn.textContent = "Сохранить и опубликовать";
        alertBox("admin-alert", "admin-alert-text",
          "Сервер не отвечает. Правки не сохранены — повторите попытку.");
      });
  });

  document.getElementById("admin-alert-close").addEventListener("click", function () {
    alertClear("admin-alert");
    saveBtn.focus();
  });

  /* ================= экспорт / импорт ================= */

  function download(filename, text, type) {
    var blob = new Blob([text], { type: type || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function toDataJs() {
    return [
      "/* BOOST — каталог финансовых продуктов.",
      "   Файл выгружен из панели управления " + stamp() + ".",
      "   Залейте его на хостинг вместо старого data.js. */",
      "",
      "window.SITE_DATA = " + JSON.stringify(
        { updated: data.updated || stamp(), cats: data.cats, offers: data.offers }, null, 2) + ";",
      ""
    ].join("\n");
  }

  document.getElementById("btn-export-js").addEventListener("click", function () {
    collect();
    data.updated = stamp();
    download("data.js", toDataJs(), "application/javascript;charset=utf-8");
    flash("Файл data.js скачан");
  });

  document.getElementById("btn-export-json").addEventListener("click", function () {
    collect();
    download("boost-backup.json", JSON.stringify(data, null, 2), "application/json;charset=utf-8");
    flash("Резервная копия скачана");
  });

  document.getElementById("import-file").addEventListener("change", function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(String(reader.result));
        if (!parsed || !Array.isArray(parsed.offers)) throw new Error("нет списка offers");
        if (!Array.isArray(parsed.cats) || !parsed.cats.length) parsed.cats = baseData().cats;
        data = parsed;
        renderCats();
        renderRows();
        alertClear("admin-alert");
        flash("Копия загружена: " + data.offers.length + " позиций");
        document.getElementById("admin-h1").focus();
      } catch (err) {
        alertBox("admin-alert", "admin-alert-text",
          "Файл не подходит: " + err.message + ". Нужен JSON, выгруженный этой же панелью.");
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  });

  /* ================= сброс ================= */

  document.getElementById("btn-reset").addEventListener("click", function () {
    askConfirm({
      title: "Вернуть каталог из файла?",
      text: "Все правки, сделанные в панели и ещё не опубликованные, пропадут. Каталог вернётся к тому, что сейчас лежит в data.js.",
      okText: "Вернуть",
      trigger: document.getElementById("btn-reset"),
      onOk: function () {
        try { localStorage.removeItem(STORE_KEY); } catch (e) {}
        data = baseData();
        renderCats();
        renderRows();
        savedMark.textContent = "";
        flash("Каталог возвращён к файлу data.js");
        document.getElementById("admin-h1").focus();
      }
    });
  });

  /* ================= старт ================= */

  var modeNote = document.getElementById("mode-note");

  function showMode() {
    if (!modeNote) return;
    modeNote.textContent = server
      ? "Правки сохраняются прямо на сайт — выгружать файлы не нужно."
      : "PHP не найден: правки сохранятся в браузере, потом выгрузите data.js и залейте на хостинг.";
    modeNote.hidden = false;
  }

  function boot() {
    showMode();
    var authed = false;
    try { authed = sessionStorage.getItem(SESSION) === "1"; } catch (e) {}
    if (authed) openApp(); else pwd.focus();
  }

  fetch(API + "?action=ping", { cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (r) {
      server = !!(r && r.ok);
      if (server && r.writable === false) {
        alertBox("login-alert", "login-alert-text",
          "Сервер отвечает, но data.js закрыт на запись. Поставьте файлу права 664 в файловом менеджере хостинга.");
      }
      boot();
    })
    .catch(function () { server = false; boot(); });
})();
