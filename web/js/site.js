(function () {
  const SITE_NAME = "Kim donghyun";

  function displayName(id) {
    const raw = id && String(id).startsWith("_") ? String(id).slice(1) : String(id || "");
    return raw.normalize("NFC");
  }

  function fileStem(src) {
    return (String(src || "").split("/").pop() || "").replace(/\.[^.]+$/, "");
  }

  const LIBRARIES = {
    work: {
      id: "work",
      folder: "Work",
      catalog: "collections.json",
      back: "work.html",
    },
    cv: {
      id: "cv",
      folder: "C.V",
      catalog: "cv.json",
      back: "cv.html",
    },
    text: {
      id: "text",
      folder: "Text",
      catalog: "text.json",
      back: "text.html",
    },
  };

  function libraryById(id) {
    return LIBRARIES[id] || LIBRARIES.work;
  }

  function imageUrl(collectionId, item, folder) {
    const src = String((item && item.src) || "");
    if (src.startsWith("menu/")) {
      return src.split("/").map((part) => encodeURIComponent(part)).join("/");
    }
    const filename = src.split("/").pop() || "";
    return (
      "menu/" +
      encodeURIComponent(folder || "Work") +
      "/" +
      encodeURIComponent(collectionId) +
      "/" +
      encodeURIComponent(filename)
    );
  }

  function visibleImages(data) {
    const images = Array.isArray(data) ? data : data && data.images;
    if (!Array.isArray(images)) return [];
    return images
      .filter((item) => {
        if (!item || !item.src) return false;
        const stem = fileStem(item.src).trim().toLowerCase();
        return stem !== "background" && stem !== "bsckground" && !stem.startsWith("bg-");
      })
      .sort((a, b) => {
        const an = leadingPhotoNumber(fileStem(a.src));
        const bn = leadingPhotoNumber(fileStem(b.src));
        if (an !== bn) return an - bn;
        return fileStem(a.src).trim().localeCompare(fileStem(b.src).trim(), "en", { numeric: true });
      });

  function leadingPhotoNumber(name) {
    const match = String(name || "").trim().match(/^(\d+)/);
    return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
  }
  }

  function captionFor(item) {
    const stem = fileStem(item && item.src).trim();
    const indexed = stem.match(/^\d+_(.*)$/);
    if (indexed && indexed[1].trim()) return indexed[1].trim();
    const alt = item && item.alt ? String(item.alt).trim() : "";
    if (!alt || alt === stem) return "";
    return alt;
  }

  async function loadCollections(catalog) {
    const res = await fetch(catalog || "collections.json", { cache: "no-store" });
    if (!res.ok) return [];
    const list = await res.json();
    if (!Array.isArray(list)) return [];
    return list
      .filter((item) => item && item.id)
      .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
  }

  async function loadImages(collectionId, folder) {
    const res = await fetch(
      "menu/" +
        encodeURIComponent(folder || "Work") +
        "/" +
        encodeURIComponent(collectionId) +
        "/images.json",
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    return visibleImages(await res.json());
  }

  async function loadNarratives(collectionId, folder) {
    const base =
      "menu/" +
      encodeURIComponent(folder || "Work") +
      "/" +
      encodeURIComponent(collectionId) +
      "/";
    const [ko, en] = await Promise.all([
      readNarrative(base, "네러티브_ko"),
      readNarrative(base, "네러티브_en"),
    ]);
    return { ko: ko, en: en };
  }

  async function readNarrative(base, stem) {
    const txt = await readText(base + encodeURIComponent(stem + ".txt"));
    if (txt) return txt;
    const rtf = await readText(base + encodeURIComponent(stem + ".rtf"));
    return rtf ? rtfToText(rtf) : "";
  }

  function rtfToText(raw) {
    const rtf = String(raw || "");
    if (!/^\{\\rtf/i.test(rtf.trim())) return rtf.replace(/^\uFEFF/, "").trim();
    let i = 0;
    let uc = 1;
    let out = "";
    const skipWords = { fonttbl: 1, colortbl: 1, stylesheet: 1, info: 1, pict: 1, datastore: 1 };

    function peekSkip(index) {
      if (rtf[index] !== "\\") return false;
      if (rtf[index + 1] === "*") return true;
      let j = index + 1;
      while (j < rtf.length && /[a-zA-Z]/.test(rtf[j])) j += 1;
      return Boolean(skipWords[rtf.slice(index + 1, j).toLowerCase()]);
    }

    function parse(skip) {
      while (i < rtf.length) {
        const ch = rtf[i];
        if (ch === "{") {
          i += 1;
          parse(skip || peekSkip(i));
          continue;
        }
        if (ch === "}") {
          i += 1;
          return;
        }
        if (ch === "\\") {
          const next = rtf[i + 1];
          if (next === "\\" || next === "{" || next === "}") {
            if (!skip) out += next;
            i += 2;
            continue;
          }
          if (next === "\n" || next === "\r") {
            if (!skip) out += "\n";
            i += 2;
            if (next === "\r" && rtf[i] === "\n") i += 1;
            continue;
          }
          if (next === "'") {
            const bytes = [];
            while (rtf[i] === "\\" && rtf[i + 1] === "'") {
              const hex = rtf.slice(i + 2, i + 4);
              if (!/^[0-9a-fA-F]{2}$/.test(hex)) break;
              bytes.push(parseInt(hex, 16));
              i += 4;
            }
            if (!skip && bytes.length) out += decodeCp949(bytes);
            continue;
          }
          let j = i + 1;
          while (j < rtf.length && /[a-zA-Z]/.test(rtf[j])) j += 1;
          const word = rtf.slice(i + 1, j).toLowerCase();
          let sign = "";
          if (rtf[j] === "-") {
            sign = "-";
            j += 1;
          }
          let digits = "";
          while (j < rtf.length && /[0-9]/.test(rtf[j])) {
            digits += rtf[j];
            j += 1;
          }
          if (rtf[j] === " ") j += 1;
          if (word === "uc" && digits) uc = parseInt(sign + digits, 10) || 0;
          if (!skip && word === "u" && digits) {
            let code = parseInt(sign + digits, 10);
            if (code < 0) code += 65536;
            out += String.fromCharCode(code);
            let left = uc;
            while (left > 0 && j < rtf.length) {
              j += 1;
              left -= 1;
            }
          }
          if (!skip && (word === "par" || word === "line")) out += "\n";
          i = j;
          continue;
        }
        if (!skip && ch !== "\r" && ch !== "\n") out += ch;
        i += 1;
      }
    }

    if (rtf[0] === "{") i = 1;
    parse(false);
    return out.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function decodeCp949(bytes) {
    try {
      return new TextDecoder("euc-kr").decode(Uint8Array.from(bytes));
    } catch (err) {
      return bytes.map((byte) => String.fromCharCode(byte)).join("");
    }
  }

  function splitNarrative(text) {
    const lines = String(text || "")
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.trim());
    while (lines.length && !lines[0]) lines.shift();
    if (lines.length >= 3 && lines[0] && lines[1] && !lines[2]) {
      let index = 3;
      while (index < lines.length && !lines[index]) index += 1;
      return { title: lines[0], subtitle: lines[1], body: lines.slice(index).join("\n").trim() };
    }
    return { title: "", subtitle: "", body: lines.join("\n").trim() };
  }

  function fillNarrative(el, text) {
    if (!el) return;
    el.textContent = "";
    const parts = splitNarrative(text);
    if (parts.title) {
      const title = document.createElement("h2");
      title.className = "essay-title";
      title.textContent = parts.title;
      el.appendChild(title);
    }
    if (parts.subtitle) {
      const subtitle = document.createElement("p");
      subtitle.className = "essay-sub";
      subtitle.textContent = parts.subtitle;
      el.appendChild(subtitle);
    }
    if (parts.body) {
      const body = document.createElement("div");
      body.className = "essay-body";
      body.textContent = parts.body;
      el.appendChild(body);
    }
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value || "";
  }

  async function initIntro() {
    const photo = document.getElementById("intro-photo");
    if (!photo) return;
    try {
      const collections = await loadCollections();
      const groups = await Promise.all(collections.map((item) => loadImages(item.id)));
      const pool = [];
      collections.forEach((item, index) => {
        groups[index].forEach((image) => {
          pool.push(imageUrl(item.id, image));
        });
      });
      if (!pool.length) return;
      const src = pool[Math.floor(Math.random() * pool.length)];
      photo.style.backgroundImage = 'url("' + src + '")';
      photo.classList.add("is-ready");
    } catch (err) {}
  }

  async function initWorkIndex() {
    const list = document.getElementById("work-index");
    if (!list) return;
    const collections = await loadCollections();
    list.textContent = "";
    collections.forEach((item) => {
      const link = document.createElement("a");
      link.href = "collection.html?collection=" + encodeURIComponent(item.id);
      const span = document.createElement("span");
      span.textContent = displayName(item.id);
      link.appendChild(span);
      list.appendChild(link);
    });
  }

  async function initTextIndex() {
    const list = document.getElementById("text-index");
    if (!list) return;
    const library = LIBRARIES.text;
    const collections = await loadCollections(library.catalog);
    list.textContent = "";
    collections.forEach((item) => {
      if (item.type === "file") return;
      const link = document.createElement("a");
      link.href = collectionHref(library, item.id);
      const span = document.createElement("span");
      span.textContent = displayName(item.id);
      link.appendChild(span);
      list.appendChild(link);
    });
  }

  function isHtmlItem(item) {
    if (!item) return false;
    if (item.type === "html") return true;
    return /\.html?$/i.test(String(item.src || "").split("?")[0]);
  }

  function collectionHref(library, id) {
    const query = "collection=" + encodeURIComponent(id);
    if (!library || library.id === "work") return "collection.html?" + query;
    return "collection.html?section=" + encodeURIComponent(library.id) + "&" + query;
  }

  async function initArchive() {
    const grid = document.getElementById("archive-grid");
    if (!grid) return;
    const library = libraryById(document.body.getAttribute("data-library"));
    const collections = await loadCollections(library.catalog);
    const groups = await Promise.all(
      collections.map((item) =>
        item.type === "file" ? Promise.resolve([]) : loadImages(item.id, library.folder)
      )
    );
    grid.textContent = "";
    collections.forEach((item, index) => {
      const images = groups[index];
      const link = document.createElement("a");
      link.className = "archive-card";
      const fileSrc = item.type === "file" ? item.src : "";
      const cover = fileSrc || (images[0] && imageUrl(item.id, images[0], library.folder));
      if (item.type === "file") link.href = fileSrc;
      else link.href = collectionHref(library, item.id);
      if (cover) {
        const shot = document.createElement("span");
        shot.className = "shot";
        shot.style.backgroundImage = 'url("' + cover + '")';
        link.appendChild(shot);
      } else {
        link.classList.add("is-text");
      }
      const veil = document.createElement("span");
      veil.className = "veil";
      const info = document.createElement("span");
      info.className = "info";
      const title = document.createElement("span");
      title.className = "title";
      title.textContent = displayName(item.name || item.id);
      info.appendChild(title);
      link.append(veil, info);
      grid.appendChild(link);
    });
  }

  async function initCollection() {
    const params = new URLSearchParams(window.location.search);
    const collectionId = params.get("collection") || "";
    const library = libraryById(params.get("section"));
    if (!collectionId) {
      window.location.replace(library.back);
      return;
    }

    const back = document.querySelector(".back-link");
    if (back) back.href = library.back;

    const name = displayName(collectionId);
    document.title = name + " — " + SITE_NAME;
    setText("collection-name", name);

    const images = await loadImages(collectionId, library.folder);
    const narrative = await loadNarratives(collectionId, library.folder);
    const hasNarrative = Boolean(narrative.ko || narrative.en);
    const imageEl = document.getElementById("slide-image");
    const htmlEl = document.getElementById("slide-html");
    const captionEl = document.getElementById("caption-text");
    const counterEl = document.getElementById("counter");
    const overview = document.getElementById("overview");
    const viewer = document.getElementById("viewer");
    const essay = document.getElementById("essay");
    const overviewBtn = document.getElementById("overview-toggle");
    if (!imageEl || !images.length) return;

    const photoWrap = imageEl.parentElement;
    let index = 0;
    let overviewOpen = false;
    let slideToken = 0;
    let track = null;

    function clearTrack() {
      if (track) {
        track.root.remove();
        track = null;
      }
      imageEl.style.visibility = "";
      if (htmlEl) htmlEl.style.visibility = "";
    }

    function paintHtml(host, item, token) {
      if (!host) return;
      host.hidden = false;
      host.textContent = "";
      fetch(imageUrl(collectionId, item, library.folder), { cache: "no-store" })
        .then((res) => (res.ok ? res.text() : ""))
        .then((html) => {
          if (!html || !host.isConnected) return;
          if (token != null && token !== slideToken) return;
          const rendered = contactFragment(html, ".slide-html");
          host.textContent = "";
          if (rendered.css) {
            const style = document.createElement("style");
            style.textContent = rendered.css;
            host.appendChild(style);
          }
          host.appendChild(rendered.fragment);
          requestAnimationFrame(placeCaption);
        })
        .catch(() => {});
    }

    function show(next) {
      slideToken += 1;
      const token = slideToken;
      const count = images.length;
      index = ((next % count) + count) % count;
      const item = images[index];
      if (isHtmlItem(item)) {
        imageEl.hidden = true;
        imageEl.removeAttribute("src");
        imageEl.alt = "";
        paintHtml(htmlEl, item, token);
      } else {
        if (htmlEl) {
          htmlEl.hidden = true;
          htmlEl.textContent = "";
        }
        imageEl.hidden = false;
        imageEl.src = imageUrl(collectionId, item, library.folder);
        imageEl.alt = captionFor(item) || name;
      }
      imageEl.style.visibility = "";
      if (htmlEl) htmlEl.style.visibility = "";
      if (captionEl) {
        const caption = captionFor(item);
        captionEl.textContent = caption;
        captionEl.hidden = !caption;
      }
      if (counterEl) counterEl.textContent = "(" + (index + 1) + " / " + images.length + ")";
      if (overview) {
        overview.querySelectorAll(".overview-item").forEach((button, buttonIndex) => {
          button.classList.toggle("is-current", buttonIndex === index);
        });
      }
      clearTrack();
      warmNeighbors();
      requestAnimationFrame(placeSlideButtons);
    }

    function placeCaption() {
      if (!captionEl || !viewer || captionEl.hidden) return;
      const target = imageEl && !imageEl.hidden ? imageEl : htmlEl && !htmlEl.hidden ? htmlEl : null;
      if (!target) return;
      const frame = target.getBoundingClientRect();
      const bounds = viewer.getBoundingClientRect();
      if (frame.width < 2 || bounds.width < 2) return;
      captionEl.style.left = frame.left - bounds.left + "px";
      captionEl.style.top = frame.bottom - bounds.top + 4 + "px";
      captionEl.style.maxWidth = frame.width + "px";
    }

    function placeSlideButtons() {
      placeCaption();
      const prev = document.querySelector(".slide-prev");
      const next = document.querySelector(".slide-next");
      if (!prev || !next || !viewer) return;
      if (window.innerWidth <= 800) {
        prev.style.left = "";
        next.style.right = "";
        return;
      }
      const wrap = photoWrap || imageEl.parentElement;
      const bounds = viewer.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      if (bounds.width < 2 || wrapRect.width < 2) return;
      const wrapStyle = getComputedStyle(wrap);
      const padLeft = parseFloat(wrapStyle.paddingLeft) || 0;
      const padRight = parseFloat(wrapStyle.paddingRight) || 0;
      const contentW = wrapRect.width - padLeft - padRight;
      const maxH = parseFloat(getComputedStyle(imageEl).maxHeight) || window.innerHeight - 180;
      const aspect = 3 / 2;
      const width = Math.min(contentW, maxH * aspect);
      const photoLeft = wrapRect.left - bounds.left + padLeft + (contentW - width) / 2;
      const photoRight = photoLeft + width;
      const edge = 8;
      const buttonWidth = 44;
      const prevCenter = edge + buttonWidth / 2;
      const nextCenter = bounds.width - edge - buttonWidth / 2;
      const towardPhoto = 0.4;
      const nextPrevCenter = prevCenter + (photoLeft - prevCenter) * towardPhoto;
      const nextNextCenter = nextCenter + (photoRight - nextCenter) * towardPhoto;
      prev.style.left = Math.max(edge, nextPrevCenter - buttonWidth / 2) + "px";
      next.style.right = Math.max(edge, bounds.width - (nextNextCenter + buttonWidth / 2)) + "px";
    }

    imageEl.addEventListener("load", placeSlideButtons);
    window.addEventListener("resize", placeSlideButtons);

    function setOverview(open) {
      overviewOpen = open;
      if (overview) overview.hidden = !open;
      if (viewer) viewer.hidden = open;
      if (essay) essay.hidden = open || !hasNarrative;
      if (open) window.scrollTo(0, 0);
      if (overviewBtn) overviewBtn.classList.toggle("is-open", open);
    }

    if (overview) {
      overview.textContent = "";
      images.forEach((item, imageIndex) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "overview-item";
        if (isHtmlItem(item)) {
          button.classList.add("is-html");
          button.textContent = String(imageIndex + 1);
        } else {
          button.style.backgroundImage = 'url("' + imageUrl(collectionId, item, library.folder) + '")';
        }
        button.setAttribute("aria-label", name + " " + (imageIndex + 1));
        button.addEventListener("click", () => {
          setOverview(false);
          show(imageIndex);
          window.scrollTo(0, 0);
        });
        overview.appendChild(button);
      });
    }

    if (hasNarrative) {
      const koEl = document.getElementById("essay-ko");
      const enEl = document.getElementById("essay-en");
      fillNarrative(koEl, narrative.ko);
      fillNarrative(enEl, narrative.en);
      document.body.classList.add("has-narrative");
      if (essay) essay.hidden = false;
      window.addEventListener(
        "scroll",
        () => {
          document.body.classList.toggle("is-narrative-open", window.scrollY > 24);
        },
        { passive: true }
      );
    }

    document.querySelectorAll("[data-slide]").forEach((button) => {
      button.addEventListener("click", () => {
        show(index + Number(button.getAttribute("data-slide")));
      });
    });

    imageEl.draggable = false;
    const warmed = new Set();

    function warm(item) {
      if (!item || isHtmlItem(item)) return;
      const url = imageUrl(collectionId, item, library.folder);
      if (warmed.has(url)) return;
      warmed.add(url);
      const img = new Image();
      img.decoding = "async";
      img.src = url;
    }

    function warmNeighbors() {
      const count = images.length;
      if (count < 2) return;
      warm(images[(index - 1 + count) % count]);
      warm(images[(index + 1) % count]);
    }

    let drag = null;

    function endDrag() {
      drag = null;
      document.body.classList.remove("is-page-drag");
    }

    function openTrack() {
      clearTrack();
      const vw = window.innerWidth;
      const wrap = photoWrap.getBoundingClientRect();
      const style = getComputedStyle(photoWrap);
      const padTop = parseFloat(style.paddingTop) || 0;
      const padRight = parseFloat(style.paddingRight) || 0;
      const padBottom = parseFloat(style.paddingBottom) || 0;
      const padLeft = parseFloat(style.paddingLeft) || 0;
      const root = document.createElement("div");
      root.className = "slide-track";
      const row = document.createElement("div");
      row.className = "slide-track-row";
      [-1, 0, 1].forEach((offset) => {
        const pane = document.createElement("div");
        pane.className = "slide-pane";
        pane.style.width = vw + "px";
        pane.style.flexBasis = vw + "px";
        const frame = document.createElement("div");
        frame.className = "slide-pane-frame";
        frame.style.left = wrap.left + padLeft + "px";
        frame.style.top = wrap.top + padTop + "px";
        frame.style.width = wrap.width - padLeft - padRight + "px";
        frame.style.height = wrap.height - padTop - padBottom + "px";
        const item = images[(index + offset + images.length) % images.length];
        if (isHtmlItem(item)) {
          const doc = document.createElement("div");
          doc.className = "slide-html";
          frame.appendChild(doc);
          paintHtml(doc, item, null);
        } else {
          const img = document.createElement("img");
          img.src = imageUrl(collectionId, item, library.folder);
          img.alt = "";
          img.draggable = false;
          frame.appendChild(img);
        }
        pane.appendChild(frame);
        row.appendChild(pane);
      });
      row.style.transform = "translate3d(" + -vw + "px,0,0)";
      root.appendChild(row);
      document.body.appendChild(root);
      imageEl.style.visibility = "hidden";
      if (htmlEl) htmlEl.style.visibility = "hidden";
      track = { root: root, row: row, vw: vw };
    }

    function settle(dx, dir) {
      if (!track) {
        if (dir) show(index + dir);
        return;
      }
      const token = slideToken;
      const target = dir ? (dir > 0 ? -track.vw : track.vw) : 0;
      const remaining = Math.abs(target - dx);
      const seconds = Math.min(0.42, Math.max(0.16, (remaining / track.vw) * 0.42));
      const row = track.row;
      let finished = false;
      const done = () => {
        if (finished || token !== slideToken) return;
        finished = true;
        if (dir) show(index + dir);
        else {
          slideToken += 1;
          clearTrack();
        }
      };
      row.style.transition = "transform " + seconds + "s cubic-bezier(0.22, 0.61, 0.36, 1)";
      row.style.transform = "translate3d(" + (target - track.vw) + "px,0,0)";
      row.addEventListener("transitionend", done, { once: true });
      window.setTimeout(done, seconds * 1000 + 80);
    }

    document.addEventListener("pointerdown", (event) => {
      const touch = event.pointerType === "touch";
      if (overviewOpen || (!touch && (event.pointerType !== "mouse" || event.button !== 0))) return;
      if (event.target.closest("a, button, input, textarea, select, label")) return;
      if (essay && !essay.hidden && essay.contains(event.target)) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, tracking: false, cancelled: false, touch: touch };
      document.body.classList.add("is-page-drag");
      if (!touch) {
        try {
          document.documentElement.setPointerCapture(event.pointerId);
        } catch (err) {}
        event.preventDefault();
      }
    }, { passive: false });
    document.addEventListener("pointermove", (event) => {
      if (!drag || drag.id !== event.pointerId || drag.cancelled) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.tracking) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          drag.cancelled = true;
          document.body.classList.remove("is-page-drag");
          return;
        }
        drag.tracking = true;
        if (drag.touch) {
          try {
            document.documentElement.setPointerCapture(event.pointerId);
          } catch (err) {}
        }
        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) openTrack();
      }
      if (drag.touch) event.preventDefault();
      drag.dx = dx;
      if (!track) return;
      track.row.style.transition = "none";
      track.row.style.transform = "translate3d(" + (dx - track.vw) + "px,0,0)";
    }, { passive: false });
    document.addEventListener("pointerup", (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      const tracking = drag.tracking && !drag.cancelled;
      endDrag();
      if (!tracking) return;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) {
        settle(dx, 0);
        return;
      }
      const dir = dx < 0 ? 1 : -1;
      if (!track) {
        show(index + dir);
        return;
      }
      settle(dx, dir);
    });
    document.addEventListener("pointercancel", (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = drag.dx;
      const tracking = drag.tracking && !drag.cancelled;
      endDrag();
      if (tracking) settle(dx, 0);
    });

    if (overviewBtn) {
      overviewBtn.addEventListener("click", () => setOverview(!overviewOpen));
    }

    const jump = document.getElementById("essay-jump");
    if (jump) {
      jump.hidden = !hasNarrative;
      jump.addEventListener("click", () => {
        const raised = window.scrollY > 24;
        window.scrollTo({
          top: raised ? 0 : Math.round(window.innerHeight / 4),
          behavior: "smooth",
        });
      });
    }

    window.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight") show(index + 1);
      else if (event.key === "ArrowLeft") show(index - 1);
      else if (event.key === "Escape") {
        if (overviewOpen) setOverview(false);
        else goBack(library.back);
      }
    });

    show(0);
  }

  async function initCv() {
    const lightbox = document.createElement("div");
    lightbox.className = "cv-lightbox";
    lightbox.hidden = true;
    const backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.className = "cv-lightbox-backdrop";
    backdrop.setAttribute("aria-label", "닫기");
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "cv-lightbox-close";
    closeBtn.setAttribute("aria-label", "닫기");
    closeBtn.textContent = "×";
    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "cv-lightbox-nav cv-lightbox-prev";
    prevBtn.setAttribute("aria-label", "이전 사진");
    const prevMark = document.createElement("span");
    prevBtn.appendChild(prevMark);
    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "cv-lightbox-nav cv-lightbox-next";
    nextBtn.setAttribute("aria-label", "다음 사진");
    const nextMark = document.createElement("span");
    nextBtn.appendChild(nextMark);
    const photo = document.createElement("img");
    photo.className = "cv-lightbox-photo";
    photo.alt = "";
    lightbox.append(backdrop, prevBtn, photo, nextBtn, closeBtn);
    document.body.appendChild(lightbox);

    let sources = [];
    let index = 0;

    function showLightbox(nextIndex) {
      if (!sources.length) return;
      index = (nextIndex + sources.length) % sources.length;
      photo.src = sources[index];
      const single = sources.length < 2;
      prevBtn.hidden = single;
      nextBtn.hidden = single;
      lightbox.hidden = false;
    }

    function closeLightbox() {
      lightbox.hidden = true;
      photo.removeAttribute("src");
    }

    backdrop.addEventListener("click", closeLightbox);
    closeBtn.addEventListener("click", closeLightbox);
    prevBtn.addEventListener("click", () => showLightbox(index - 1));
    nextBtn.addEventListener("click", () => showLightbox(index + 1));
    document.addEventListener("keydown", (event) => {
      if (lightbox.hidden) return;
      if (event.key === "Escape") closeLightbox();
      else if (event.key === "ArrowLeft") showLightbox(index - 1);
      else if (event.key === "ArrowRight") showLightbox(index + 1);
    });

    const nameEl = document.querySelector(".cv-name");
    if (nameEl) {
      fetch("menu/" + encodeURIComponent("C.V") + "/" + encodeURIComponent("C.V.txt"), {
        cache: "no-store",
      })
        .then((res) => (res.ok ? res.text() : ""))
        .then((text) => {
          const value = String(text || "").replace(/^\uFEFF/, "").trim();
          if (value) nameEl.textContent = value;
        })
        .catch(() => {});
    }

    const list = document.getElementById("cv-list");
    if (list) {
      let catalog = [];
      try {
        const res = await fetch("cv.json", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          catalog = Array.isArray(data) ? data : [];
        }
      } catch (err) {
        catalog = [];
      }
      list.textContent = "";
      catalog.forEach((item) => {
        if (!item || !item.id || item.type === "file") return;
        const entry = document.createElement("li");
        entry.className = "cv-entry";
        entry.setAttribute("data-folder", item.id);
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("aria-expanded", "false");
        const label = document.createElement("span");
        label.textContent = displayName(item.name || item.id);
        button.appendChild(label);
        const panel = document.createElement("div");
        panel.className = "cv-photos";
        const inner = document.createElement("div");
        inner.className = "cv-photos-inner";
        panel.appendChild(inner);
        entry.append(button, panel);
        list.appendChild(entry);
      });
    }

    const entries = document.querySelectorAll(".cv-entry");
    entries.forEach((entry) => {
      const button = entry.querySelector(":scope > button");
      const panel = entry.querySelector(":scope > .cv-photos");
      const inner = panel && panel.querySelector(".cv-photos-inner");
      const folder = entry.getAttribute("data-folder");
      if (!button || !panel || !inner || !folder) return;

      function appendCvGrid(parent, images) {
        if (!images.length) return;
        const grid = document.createElement("div");
        grid.className = "cv-photo-grid";
        images.forEach((item) => {
          const img = document.createElement("img");
          img.alt = "";
          img.src = String(item.src || "")
            .split("/")
            .map((part) => encodeURIComponent(part))
            .join("/");
          grid.appendChild(img);
        });
        parent.appendChild(grid);
      }

      async function togglePanel(toggle, photoPanel, photoInner) {
        const open = toggle.getAttribute("aria-expanded") === "true";
        if (open) {
          toggle.setAttribute("aria-expanded", "false");
          photoPanel.classList.remove("is-open");
          return;
        }
        await Promise.all(
          [...photoInner.querySelectorAll("img")].map((img) =>
            img.decode ? img.decode().catch(() => {}) : Promise.resolve()
          )
        );
        toggle.setAttribute("aria-expanded", "true");
        photoPanel.classList.add("is-open");
      }

      entry.addEventListener("click", (event) => {
        const img = event.target.closest("img");
        const grid = img && img.closest(".cv-photo-grid");
        if (!img || !grid || !entry.contains(grid)) return;
        sources = [...grid.querySelectorAll("img")].map((node) => node.currentSrc || node.src);
        const start = sources.indexOf(img.currentSrc || img.src);
        showLightbox(start < 0 ? 0 : start);
      });

      const url =
        "menu/" +
        encodeURIComponent("C.V") +
        "/" +
        encodeURIComponent(folder) +
        "/images.json";
      fetch(url, { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data) return;
          const images = Array.isArray(data.images) ? data.images : [];
          const groups = Array.isArray(data.groups) ? data.groups : [];
          inner.textContent = "";
          appendCvGrid(inner, images);
          if (!images.length) {
            panel.hidden = true;
            button.classList.add("is-static");
          } else {
            button.addEventListener("click", () => togglePanel(button, panel, inner));
          }
          groups.forEach((group) => {
            const section = document.createElement("section");
            section.className = "cv-group";
            const title = document.createElement("button");
            title.type = "button";
            title.className = "cv-group-title";
            title.setAttribute("aria-expanded", "false");
            title.textContent = displayName(group.title || "");
            const subPanel = document.createElement("div");
            subPanel.className = "cv-photos";
            const subInner = document.createElement("div");
            subInner.className = "cv-photos-inner";
            appendCvGrid(subInner, Array.isArray(group.images) ? group.images : []);
            subPanel.appendChild(subInner);
            section.append(title, subPanel);
            entry.appendChild(section);
            title.addEventListener("click", () => togglePanel(title, subPanel, subInner));
          });
        })
        .catch(() => {});
    });
  }

  async function readText(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) return "";
    return (await res.text()).replace(/^\uFEFF/, "").trim();
  }

  const MENU_ITEMS = [
    { id: "work", label: "Work", href: "work.html" },
    { id: "cv", label: "C.V", href: "cv.html" },
    { id: "contact", label: "Contact", href: "contact.html" },
  ];

  function initMenu() {
    const trigger = document.querySelector(".menu-trigger");
    if (!trigger) return;
    const label = trigger.querySelector("span") || trigger;
    const section = new URLSearchParams(window.location.search).get("section");
    if (section && LIBRARIES[section]) {
      document.body.setAttribute("data-menu", LIBRARIES[section].id);
    }
    const current = document.body.getAttribute("data-menu");
    const menu = document.createElement("div");
    menu.className = "site-menu";
    menu.id = "site-menu";
    menu.hidden = true;
    const nav = document.createElement("nav");
    nav.setAttribute("aria-label", "Menu");
    MENU_ITEMS.forEach((item) => {
      const link = document.createElement("a");
      link.href = item.href;
      if (item.id === current) link.setAttribute("aria-current", "page");
      const span = document.createElement("span");
      span.textContent = item.label;
      link.appendChild(span);
      nav.appendChild(link);
    });
    menu.appendChild(nav);
    document.body.appendChild(menu);

    function setOpen(open) {
      menu.hidden = !open;
      trigger.setAttribute("aria-expanded", open ? "true" : "false");
      label.textContent = open ? "Close" : "Menu";
      document.body.classList.toggle("menu-open", open);
    }

    trigger.addEventListener("click", () => setOpen(menu.hidden));
    menu.addEventListener("click", (event) => {
      if (event.target === menu) setOpen(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !menu.hidden) setOpen(false);
    });
  }

  function scopeContactCss(css, scope) {
    const prefix = scope || ".contact-doc";
    return css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("}")
      .map((part) => {
        const bits = part.split("{");
        if (bits.length !== 2) return "";
        const selectors = bits[0].trim();
        const body = bits[1];
        if (!selectors || /url\s*\(|expression|@import|javascript:/i.test(body + selectors)) return "";
        const scoped = selectors
          .split(",")
          .map((selector) => prefix + " " + selector.trim())
          .filter(Boolean)
          .join(",");
        return scoped + "{" + body + "}";
      })
      .join("\n");
  }

  function contactFragment(html, scope) {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const allowed = new Set(["P", "B", "I", "BR", "SPAN", "EM", "STRONG", "A"]);
    function clean(node) {
      const fragment = document.createDocumentFragment();
      node.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          fragment.appendChild(document.createTextNode(child.textContent));
          return;
        }
        if (child.nodeType !== Node.ELEMENT_NODE || !allowed.has(child.tagName)) {
          if (child.nodeType === Node.ELEMENT_NODE) fragment.appendChild(clean(child));
          return;
        }
        const el = document.createElement(child.tagName.toLowerCase());
        const className = child.getAttribute("class");
        if (className) el.setAttribute("class", className);
        if (child.tagName === "A") {
          const href = child.getAttribute("href") || "";
          if (/^(https?:|mailto:)/i.test(href)) {
            el.setAttribute("href", href);
            el.setAttribute("rel", "noopener noreferrer");
          }
        }
        el.appendChild(clean(child));
        fragment.appendChild(el);
      });
      return fragment;
    }
    const style = parsed.querySelector("style");
    return {
      css: style ? scopeContactCss(style.textContent || "", scope) : "",
      fragment: clean(parsed.body || parsed),
    };
  }

  async function initContact() {
    const root = document.getElementById("contact-doc");
    if (!root) return;
    let files = [];
    try {
      const res = await fetch("contact.json", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        files = Array.isArray(data.files) ? data.files : [];
      }
    } catch (err) {
      files = [];
    }
    const pages = [];
    for (const src of files) {
      const res = await fetch(src, { cache: "no-store" });
      if (res.ok) pages.push(await res.text());
    }
    root.textContent = "";
    if (!pages.length) {
      root.hidden = true;
      return;
    }
    const style = document.createElement("style");
    pages.forEach((html) => {
      const rendered = contactFragment(html);
      style.textContent += rendered.css;
      root.appendChild(rendered.fragment);
    });
    root.prepend(style);
    root.hidden = false;
  }

  async function initTextBoard() {
    const enEl = document.getElementById("about-en");
    const koEl = document.getElementById("about-ko");
    if (!enEl || !koEl) return;
    const folder = document.body.getAttribute("data-folder") || "About";
    const base = "menu/" + encodeURIComponent(folder) + "/";
    const [en, ko] = await Promise.all([
      readText(base + encodeURIComponent("영문.txt")),
      readText(base + encodeURIComponent("한글.txt")),
    ]);
    enEl.textContent = en;
    koEl.textContent = ko;
    const board = document.querySelector(".about-board");
    if (board && !en && !ko) board.hidden = true;
  }

  function goBack(fallback) {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.href = fallback || "home.html";
  }

  function initHistoryNav() {
    if (document.body.getAttribute("data-page") === "about") {
      const about = document.querySelector(".about-link");
      if (about) {
        about.addEventListener("click", (event) => {
          event.preventDefault();
          goBack("home.html");
        });
      }
    }
    const back = document.querySelector(".back-link");
    if (back) {
      back.addEventListener("click", (event) => {
        event.preventDefault();
        goBack(back.getAttribute("href") || "home.html");
      });
    }
  }

  initMenu();
  initHistoryNav();

  const page = document.body.getAttribute("data-page");
  if (page === "intro") initIntro();
  else if (page === "home" || page === "work") initWorkIndex();
  else if (page === "text") initTextIndex();
  else if (page === "archive") initArchive();
  else if (page === "collection") initCollection();
  else if (page === "about" || page === "section") initTextBoard();
  else if (page === "cv") initCv();
  initContact();
})();
