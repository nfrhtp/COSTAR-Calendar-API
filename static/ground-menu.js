// ground-menu.js — day-signature kit: the visitor's ground menu (COSTAR / TLGE).
// Hand-written (not generated). Requires moon-phase.js on the page first.
//
// Kevin, 2026-10-22: small pale text, "shade", in the middle of the header between
// the logo and the moon (first built as a small neutral icon; Kevin preferred the
// word, styled like costar.date's pale api/ics links). Clicking it opens a three-line
// menu — "Lunar" (the moon's shade, the default), "White", "Black", centered. The choice
// lasts for the rest of the browser session on that site (moon-phase.js keeps it
// in a session cookie); the next visit starts on the moon again.
//
// Use: costarGroundMenu.mount(parent, before, options) — inserts the control (and its
// menu) into `parent`, before `before` (or at the end). options.label: show this text
// instead of the icon (e.g. "shade"); options.center: center the control horizontally
// in `parent` (absolutely positioned, so the parent's own layout is untouched).
// Styling is self-contained and uses currentColor and the kit's --moon-bg, so it
// follows each site's ink.
(function () {
  var ITEMS = [["moon", "Lunar"], ["white", "White"], ["black", "Black"]];  // Kevin, 2026-10-22
  var ICON =
    '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">' +
    '<rect x="2.5" y="2.5" width="15" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
    '<path d="M2.5 17.5 L17.5 2.5 L17.5 15 A2.5 2.5 0 0 1 15 17.5 Z" fill="currentColor"/></svg>';
  var CSS =
    ".cg-wrap{position:relative;display:inline-flex;align-items:center;flex-shrink:0}" +
    ".cg-btn{all:unset;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;" +
    "width:28px;height:28px;border-radius:6px;opacity:.55;color:inherit;transition:opacity .2s}" +
    ".cg-btn:hover,.cg-btn:focus-visible,.cg-wrap.open .cg-btn{opacity:1}" +
    ".cg-btn:focus-visible{outline:2px solid currentColor;outline-offset:2px}" +
    ".cg-btn.cg-text{width:auto;height:auto;padding:.15rem .35rem;font-size:.85rem;" +
    "letter-spacing:.04em;line-height:1.2;opacity:.6}" +
    ".cg-wrap.cg-center{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)}" +
    ".cg-wrap.cg-center .cg-menu{right:auto;left:50%;transform:translateX(-50%)}" +
    ".cg-menu{position:absolute;top:calc(100% + 6px);right:0;z-index:1000;min-width:8rem;" +
    "margin:0;padding:.3rem 0;list-style:none;border-radius:8px;" +
    "background:var(--moon-bg,#fff);color:inherit;border:1px solid currentColor;" +
    "box-shadow:0 6px 20px rgba(0,0,0,.18);font:400 .9rem/1.3 inherit;display:none;text-align:center}" +
    ".cg-wrap.open .cg-menu{display:block}" +
    ".cg-menu button{all:unset;box-sizing:border-box;display:block;width:100%;cursor:pointer;" +
    "padding:.4rem 1.8rem;position:relative;color:inherit;white-space:nowrap;text-align:center}" +
    ".cg-menu button:hover,.cg-menu button:focus-visible{background:rgba(127,127,127,.18)}" +
    ".cg-menu button[aria-checked=true]::before{content:'\\2713';position:absolute;left:.65rem}";

  function style() {
    if (document.getElementById("cg-style")) return;
    var s = document.createElement("style");
    s.id = "cg-style";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function mount(parent, before, options) {
    options = options || {};
    if (!parent || !window.costarGround) return null;
    if (parent.querySelector(".cg-wrap")) return parent.querySelector(".cg-wrap");
    style();
    var wrap = document.createElement("span");
    wrap.className = "cg-wrap" + (options.center ? " cg-center" : "");
    if (options.center && getComputedStyle(parent).position === "static") {
      parent.style.position = "relative";
    }
    var btn = document.createElement("button");
    btn.className = "cg-btn";
    btn.type = "button";
    btn.title = "Page ground";
    btn.setAttribute("aria-label", "Page ground");
    btn.setAttribute("aria-haspopup", "menu");
    btn.setAttribute("aria-expanded", "false");
    if (options.label) {
      btn.className += " cg-text";
      btn.textContent = options.label;
      btn.setAttribute("aria-label", options.label);
      btn.title = options.label;
    } else {
      btn.innerHTML = ICON;
    }
    var menu = document.createElement("ul");
    menu.className = "cg-menu";
    menu.setAttribute("role", "menu");
    ITEMS.forEach(function (it) {
      var li = document.createElement("li");
      li.setAttribute("role", "none");
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "menuitemradio");
      b.setAttribute("data-ground", it[0]);
      b.textContent = it[1];
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        window.costarGround.set(it[0]);
        close();
      });
      li.appendChild(b);
      menu.appendChild(li);
    });
    function mark() {
      var c = window.costarGround.get();
      menu.querySelectorAll("button").forEach(function (b) {
        b.setAttribute("aria-checked", String(b.getAttribute("data-ground") === c));
      });
    }
    function open() { mark(); wrap.classList.add("open"); btn.setAttribute("aria-expanded", "true"); }
    function close() { wrap.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); }
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (wrap.classList.contains("open")) close(); else open();
    });
    document.addEventListener("click", function (e) { if (!wrap.contains(e.target)) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    wrap.appendChild(btn);
    wrap.appendChild(menu);
    parent.insertBefore(wrap, before || null);
    return wrap;
  }

  window.costarGroundMenu = { mount: mount };
})();
